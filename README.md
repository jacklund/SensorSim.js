sensorSim.js
============
Simulation framework for prototyping code which utilizes real-time sensor input. Reads simulated sensor data from one or more
files, and streams the data in timestamp-order to a unix socket, which the prototyping code can read from.

The data is streamed in ASCII, comma-separated values, with the datasource number (starting with zero) being the first field,
followed by the timestamp in nanoseconds, followed by the data fields, however many those may be, followed by a newline.

## Usage
    node sensorSim.js config-file [socket-name]
where

* `config-file` is a JSON-formatted configuration file (more below)
* `socket-name` is an optional path to the Unix socket

## Configuration
The simulator is configured using a JSON-formatted file which gets passed on the command line. An example is in `examples/config.json`. The values
are as follows:

* socket (optional) - Path to the Unix socket to use. Default is `/tmp/sensorSim.sock`.
* driverDir (optional) - Path to where the driver files are located. Default is `../lib`. More about the drivers below.
* dataSources (required) - Array containing information about the data source. There are a couple of fields that are required, but it
can also include data specific to a particular driver.
    * filename (required) - the file to read from
    * filetype (required) - what type of file this is, and what driver to use

## Drivers
The responsibility of the drivers is to read the data source and convert the data to an array of data values. Each data value
looks like this:

`[ timestamp, data ]`

that is, it is an array of `timestamp`, which is a javascript `Number` value, and the `data`, which is a `String`, and consists of the
data values, comma separated. The simulator doesn't parse this string at all, but passes it on unchanged to the output socket.

The driver should export a `getStream()` function, which returns an object which is an
[`EventEmitter`](http://nodejs.org/api/events.html#events_class_events_eventemitter), and which should emit the following events:

* `data` - emitted with a chunk of data from a particular data source
* `error` - emitted when there's an error
* `end` - emitted when the data source has no more data

For maximum efficiency, drivers should read their data streams using the [Node.js stream API](http://nodejs.org/api/stream.html), and tie in emitting their `data`
event with that of the underlying stream API.

### Audio Driver
The audio driver utilizes [`ffmpeg`](http://www.ffmpeg.org/) as a background process to do the data conversion. The input file can be any audio file
supported by `ffmpeg`. The data is then converted to 16-bit audio data (it's assumed to be mono, so only one channel is read), and those values are passed
back as the data.

### CSV Driver
The CSV driver reads CSV file data. It's assumed that the CSV file contains the timestamp, followed by the data fields. If the timestamp is
not available, you can also pass in a `sampleRate` value as part of the data source configuration, and it will calculate the timestamp
using that sample rate.

## Reading the Data
To read the data, simply open the specified Unix socket as a client, and start reading. The data will be ASCII formatted, comma-separated values,
with the data source number (starting with zero) first, followed by the timestamp, followed by the data values.

### Java
Unfortunately, Java doesn't support Unix Sockets natively. However, you can use a third-party package such as [junixsocket](https://code.google.com/p/junixsocket/)
for reading it:

    import org.newsclub.net.unix.AFUNIXSocket;
    import org.newsclub.net.unix.AFUNIXSocketAddress;
    import org.newsclub.net.unix.AFUNIXSocketException;

    public static void main(String[] args) throws IOException {
        final File socketFile = new File(new File(System
                .getProperty("java.io.tmpdir")), "/tmp/sensorSim.sock");

        AFUNIXSocket sock = AFUNIXSocket.newInstance();
        try {
            sock.connect(new AFUNIXSocketAddress(socketFile));
        } catch (AFUNIXSocketException e) {
            System.out.println("Cannot connect to server. Have you started it?");
            System.out.flush();
            throw e;
        }
        System.out.println("Connected");

        InputStream is = sock.getInputStream();
        OutputStream os = sock.getOutputStream();

        byte[] buf = new byte[128];

        int read = is.read(buf);

### Python
    import socket

    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.connect("/tmp/sensorSim.sock")
    data = s.recv(1024)
    s.close()
    print 'Received', repr(data)

### Node.js
    var net = require('net');
    var conn = net.createConnection('/tmp/sensorSim.sock', function() {
      conn.setEncoding('utf8');
      conn.on('data', function(data) {
        // Handle data
      });
    });
