var fs = require('fs');

exports.initialize = function(source) {
  return function(callback) {
    fs.readFile(source.filename, function(err, data) {
      if (err) return console.error(err);
      var lines = data.toString().split('/n');
      var timestamp = null;
      var sampleTime = null;
      if (source.sampleRate)
        sampleTime = Math.round(1000000000 / source.sampleRate);

      var results = [];
      for (var i = 0; i < lines.length; ++i) {
        if (source.sampleRate) {
          timestamp = i * sampleTime;
          results.push([timestamp, lines[i]]);
        } else {
          timestamp = parseInt(lines[i].split(',')[0]);
          results.push([timestamp, lines[i]]);
        }
      }

      callback(null, results);
    });
  }
}
