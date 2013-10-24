/**************************************************************************
 * CSV driver, reads in a CSV file containing an optional timestamp and
 * the sensor data. If the timestamp isn't in the file, you'll need to specify
 * the sampleRate as part of the datasource configuration.
 **************************************************************************/

var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var util = require('util');

exports.getStream = function(source) {
  return new CSVStream(source);
}

// Our stream
function CSVStream(source) {
  EventEmitter.call(this); // We're an EventEmitter
  var self = this;
  var keep = null;
  var sampleCount = 0;
  var sampleTime = null;
  if (source.sampleRate)
    sampleTime = Math.round(1000000000 / source.sampleRate);

  // Open the read stream from the file
  var fileStream = fs.createReadStream(source.filename, {encoding: 'utf-8'});

  // Data handler
  fileStream.on('data', function(data) {
    // If we have something left over from last time, prepend it
    if (keep) {
      data = keep + data;
      keep = null;
    }

    // Split into lines
    var lines = data.toString().split('\n');
    var len = lines.length;

    // If we don't end at a line boundary, keep the last partial line
    if (data.charAt(-1) != '\n') {
      len--;
      keep = lines[lines.length-1];
      lines = lines.slice(0, lines.length-1);
    }

    // Create the results array
    var timestamp = null;
    var results = [];
    for (var i = 0; i < lines.length; ++i) {
      if (source.sampleRate) {
        timestamp = sampleCount++ * sampleTime;
        results.push([timestamp, lines[i]]);
      } else {
        timestamp = parseInt(lines[i].split(',')[0]);
        results.push([timestamp, lines[i]]);
      }
    }

    // Send it off
    self.emit('data', results);
  });

  // Error handler
  fileStream.on('error', function(err) {
    self.emit('error', err);
  });

  // End handler
  fileStream.on('end', function() {
    self.emit('end');
  });
}

// Inherit all the methods from EventEmitter
util.inherits(CSVStream, EventEmitter);
