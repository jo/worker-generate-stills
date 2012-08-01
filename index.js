// Worker Generate Stills

var request = require("request");
var WorkerAttachments = require("worker-attachments");

var processor = (function() {
  var formats = ['mp4'],
      path = require('path'),
      fs = require('fs'),
      util = require('util'),
      spawn = require('child_process').spawn;

  function process(doc, name, url, version, options, cb) {
    var tempdir = '/tmp',
        // note that util.format does not support something like %3d
        stillname = tempdir + '/' + doc._id + '-' + name.replace(/\..*$/, '') + '-%d.jpg',
        // http://debuggable.com/posts/FFMPEG_multiple_thumbnails:4aded79c-6744-4bc1-b30e-59bccbdd56cb
        args = ['-i', '-', '-r', '1/10', '-s', options.size, stillname],
        // let ffmpeg do the media streaming
        ffmpeg = spawn('ffmpeg', args);

    ffmpeg.on('exit', function(code) {
      var i = 1,
          filename;

      if (code !== 0) {
        return cb(code);
      }

      while (path.existsSync(util.format(stillname, i))) {
        filename = util.format(stillname, i);

        doc._attachments[version + '/' + path.basename(filename)] = {
          content_type: 'image/jpeg',
          data: fs.readFileSync(filename).toString('base64')
        };
        fs.unlinkSync(filename);
        i++;
      }

      cb(code);
    });
    
    // request image and send it to ffmpeg
    request(url).pipe(ffmpeg.stdin);
  }

  return {
    check: function(doc, name) {
      return formats.indexOf(name.toLowerCase().replace(/^.*\.([^\.]+)$/, '$1')) > -1;
    },
    process: function(doc, name, next) {
      var cnt = 0;
      for (version in this.config.versions) cnt++;

      for (version in this.config.versions) {
        this._log(doc, 'render ' + version + '/' + name);
        process(doc, name, this._urlFor(doc, name), version, this.config.versions[version], (function(code) {
          if (code !== 0) {
            console.warn("error in `ffmpeg`")
            this._log(doc, 'error ' + version + '/' + name);
          } else {
            this._log(doc, 'done ' + version + '/' + name);
          }
          cnt--;
          if (cnt === 0) next(null);
        }).bind(this));
      }
    }
  };
})();
var config = {
  server: process.env.HOODIE_SERVER || "http://127.0.0.1:5984",
  name: 'generate-stills',
  config_id: 'worker-config/generate-stills',
  processor: processor,
  defaults: {
    versions: {
      stills: {
        size: '1024x800'
      }
    }
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
