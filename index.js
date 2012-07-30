// Worker Generate Stills

var request = require("request");
var WorkerAttachments = require("worker-attachments");

var processor = (function() {
  var formats = ['mp4'],
      path = require('path'),
      fs = require('fs'),
      util = require('util'),
      spawn = require('child_process').spawn;

  return {
    check: function(doc, name) {
      return formats.indexOf(name.toLowerCase().replace(/^.*\.([^\.]+)$/, '$1')) > -1;
    },
    process: function(doc, name, next) {
      var tempdir = '/tmp',
          // note that util.format does not support something like %3d
          stillname = tempdir + '/' + name.replace(/\..*$/, '') + '-%d.jpg',
          // http://debuggable.com/posts/FFMPEG_multiple_thumbnails:4aded79c-6744-4bc1-b30e-59bccbdd56cb
          args = ['-i', this._urlFor(doc, name), '-r', '1/10', '-s', this.config.size, stillname],
          // let ffmpeg do the media streaming
          ffmpeg = spawn('ffmpeg', args);

      this._log(doc, 'ffmpeg ' + name);

      ffmpeg.on('exit', (function(code) {
        var i = 1,
            filename;

        if (code !== 0) {
          console.warn("error in `ffmpeg`")
          this._log(doc, 'error ' + name);
        } else {
          while (path.existsSync(util.format(stillname, i))) {
            filename = util.format(stillname, i);

            doc._attachments[this.config.folder + '/' + path.basename(filename)] = {
              content_type: 'image/jpeg',
              data: fs.readFileSync(filename).toString('base64')
            };
            fs.unlinkSync(filename);
            i++;
          }

          this._log(doc, 'done ' + name);
        }
        
        next(code);
      }).bind(this));
    }
  };
})();
var config = {
  server: process.env.HOODIE_SERVER || "http://127.0.0.1:5984",
  name: 'generate-stills',
  config_id: 'worker-config/generate-stills',
  processor: processor,
  defaults: {
    folder: 'stills',
    size: '1024x800'
  }
};

var workers = [];
request(config.server + "/_all_dbs", function(error, response, body) {
  if(error !== null) {
    console.warn("init error, _all_dbs: " + error);
    return;
  }

  var dbs = JSON.parse(body);
  // listen on each db.
  // Note that you have to restart the worker
  // in order to listen to newly created databases.
  dbs.forEach(function(db) {
    var worker = new WorkerAttachments(config, db);
    workers.push(worker);
  });
});
