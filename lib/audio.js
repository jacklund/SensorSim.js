/**************************************************************************
 * Audio driver for sensor simulator. Requires the ffmpeg package, because
 * it spawns ffmpeg to process the audio file and convert it to 16-bit
 * little endian PCM audio. From gist: https://gist.github.com/jhurliman/1953894
 **************************************************************************/

var fs = require('fs');
var spawn = require('child_process').spawn;
var util = require('util');

exports.initialize = function(source) {
  return function(callback) {
    var outputStr = '';
    var oddByte = null;
    var channel = 0;
    var gotData = false;
    var filename = source.filename;
    var results = [];
    var sampleCnt = 0;
    var sampleTime = Math.round(1000000000 / 44100);

    function gotSample(value, channel) {
      if (channel == 0 && sampleCnt < 100) {
        timestamp = sampleCnt++ * sampleTime;
        results.push([timestamp, util.format("%d", value)]);
      }
    }
    
    // Extract signed 16-bit little endian PCM data with ffmpeg and pipe to STDOUT
    var ffmpeg = spawn('ffmpeg', ['-i',filename,'-f','s16le','-ac','2',
      '-acodec','pcm_s16le','-ar','44100','-y','pipe:1']);
    
    ffmpeg.stdout.on('data', function(data) {
      gotData = true;
      
      var i = 0;
      var samples = Math.floor((data.length + (oddByte !== null ? 1 : 0)) / 2);
      
      // If there is a leftover byte from the previous block, combine it with the
      // first byte from this block
      if (oddByte !== null) {
        value = ((data.readInt8(i++) << 8) | oddByte) / 32767;
        gotSample(value, channel);
        channel = ++channel % 2;
      }
      
      for (; i < data.length; i += 2) {
        value = data.readInt16LE(i) / 32767;
        gotSample(value, channel);
        channel = ++channel % 2;
      }
      
      oddByte = (i < data.length) ? data.readUInt8(i) : null;
    });
    
    ffmpeg.stderr.on('data', function(data) {
      // Text info from ffmpeg is output to stderr
      outputStr += data.toString();
    });
    
    ffmpeg.stderr.on('end', function() {
      if (gotData)
        callback(null, results);
      else
        callback(outputStr, null);
    });
  }
}
