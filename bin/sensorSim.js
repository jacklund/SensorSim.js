/***************************************************************************************
 * Sensor simulator. Reads a number of data files and writes them to a unix socket to
 * be read by prototype code. Uses drivers to read the data. The drivers should be named
 * 'filetype.js', where 'filetype' is the filetype that they read.
 *
 * The driver is expected to export an 'getStream' function, which takes in the datasource
 * configuration and which returns a function for doing the actual reading of the data.
 * That function is expected to read the data, and convert it to an array of values. Each
 * value is itself an array whose first value is a timestamp in nanoseconds, and a
 * string containing the commad-delimited values as text.
 ****************************************************************************************/
var async = require('async');
var fs    = require('fs');
var net   = require('net');
var path  = require('path');
var util  = require('util');

// Parse command line
if (process.argv.length < 3) {
  console.error("Usage: %s %s config-file [socket-path]", process.argv[0], path.basename(process.argv[1]));
  process.exit(-1);
}

// Update one object from another
function update(original, updater) {
  for (var key in updater) {
    original[key] = updater[key];
  }
}

// Default config values
var config = {socket: '/tmp/sensorSim.sock', driverDir: '../lib'}

// Read the config file
try {
  var data = fs.readFileSync(process.argv[2], {encoding: 'utf8'});
  update(config, JSON.parse(data)); // update from config file
} catch (err) {
  console.error("Error reading %s: %s", process.argv[2], err.message);
  process.exit(-1);
}

// Override the socket if specified on command line
if (process.argv.length > 3) {
  config.socket = process.argv[3];
}

/****************************************************************
/* Load a driver for a file type
****************************************************************/
function loadDriver(name) {
  var driverPath = config.driverDir + path.sep + name + '.js';
  var driver = require(driverPath);
  if (!driver.getStream) {
    console.error("Driver %s has not exported a function called 'getStream'", name);
    process.exit(-1);
  }
  return driver;
}

/****************************************************************
/* Get a driver from a cache, or load it if it's not cached
****************************************************************/
var drivers = {};
function getDriver(ds) {
  if (!drivers[ds.filetype]) {
    drivers[ds.filetype] = loadDriver(ds.filetype);
  }

  return drivers[ds.filetype];
}

// Validate the data sources
if (!config.dataSources) {
  console.error("At least one datasource must be specified");
  process.exit(-1);
} else if (config.dataSources.constructor.name != 'Array') {
  console.error("'dataSources' config element must be an array");
  process.exit(-1);
}

/****************************************************************
/* Finds the drivers for a datasource
/*    source - the datasource from the config file
/*    which - index of which datasource this is for
****************************************************************/
function getDriversForDS(source, which) {
  if (!source.filename) {
    console.error("No filename specified for dataSource %d", which);
    process.exit(-1);
  }
  if (!source.filetype) {
    console.error("No filetype specified for dataSource %d", which);
    process.exit(-1);
  }
  return getDriver(source);
}

/****************************************************************
/* Process the data sources.
/*     results - an array of arrays of data from each dataSource
/*     sock - the socket to write to
****************************************************************/
function processDataSources(results, sock) {

  // Make sure we have data from all datasources
  for (var i = 0; i < results.length; ++i) {
    if (!results[i] || results[i].length == 0) {
      return;
    }
  }

  // Set up the indices into each result array
  indices = [];
  for (var i = 0; i < results.length; ++i) {
    indices[i] = 0;
  }

  // Loop through each datasource and write
  // the data in order of the timestamp for the data
  var minIndex = 0;
  var found = true;
  // Loop until we run out of data to send
  while (found) {
    found = false;
    var min = null;

    // Loop through each datasources' results
    for (var i = 0; i < results.length; ++i) {

      // If we ran out of data for one of our datasources,
      // we have to wait for more data
      if (indices[i] == results[i].length) {
        // Go through the results and slice off what we've
        // already read
        for (var j = 0; j < results.length; ++j) {
          if (indices[j] == results[j].length) {
            results[j] = null;
          } else {
            results[j] = results[j].slice(indices[j]);
          }
        }
        return;
      }

      found = true;
      // Find the one with the smallest timestamp
      var next = results[i][indices[i]];
      if (next) {
        if (min == null || next[0] < min) {
          min = next[0];
          minIndex = i;
        }
      }
    }

    // If we ran out of data on all sources, close the socket
    // and return
    if (min == null) {
      sock.destroy();
      return;
    }

    // Write the data to the socket
    if (found) {
      if (results[minIndex][indices[minIndex]]) {
        sock.write(util.format("%d, %d, %s\n", minIndex, min, results[minIndex][indices[minIndex]][1]));
        indices[minIndex]++;
      }
    }
  }
}

// Create the results array
results = new Array(config.dataSources.length);


/*****************************************************************************
 * Start up reading from the data sources
 *    index - the index of the data source
 *    sock  - the Unix socket we're writing to
*****************************************************************************/
function startDataStream(index, sock) {
  // Get the stream to read from
  var driver = getDriversForDS(config.dataSources[index], index);
  var stream = driver.getStream(config.dataSources[index]);

  // Handler for incoming data
  stream.on('data', function(data) {
    if (results[index]) {
      results[index] = results[index].concat(data);
    } else {
      results[index] = data;
    }

    processDataSources(results, sock);
  });

  // Handler for end of data on a source
  stream.on('end', function() {
    if (results[index]) {
      results[index].push(null);
    } else {
      results[index] = [null];
    }

    processDataSources(results, sock);
  });

  // Error handler
  stream.on('error', function(err) {
    console.error(err);
    process.exit(-1);
  });
}

/*****************************************************************************
/* Read each of the datasources in parallel
/*     functions - an array of callback functions to be processed in parallel
/* Processes each of the functions in the array in parallel, and calls the
/* callback function when they have all completed, with the results of each
*****************************************************************************/
// Create our Unix socket server
var server = net.createServer(function(sock) {
  // We got a connection
  // Stop accepting connections
  server.close();

  // Handle the socket closing
  sock.on('close', function() {
    console.error("Other end closed socket, exiting");
    process.exit(-1);
  });

  // Handle a socket error
  sock.on('error', function(err) {
    console.error("Got error: %s", err);
    process.exit(-1);
  });

  // Gentlemen, start your engines!
  for (var i = 0; i < config.dataSources.length; ++i) {
    startDataStream(i, sock);
  }
});

// Delete the socket if it exists and then create and listen on it
if (fs.existsSync(config.socket)) fs.unlinkSync(config.socket);
server.listen(config.socket);
