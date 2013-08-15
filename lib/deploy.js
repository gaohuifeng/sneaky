// Generated by CoffeeScript 1.6.3
(function() {
  var Logger, Moment, after, archive, async, autoTag, before, deploy, exec, fs, getServers, jsYaml, local, main, quit, rsync, runCmd;

  async = require('async');

  fs = require('fs');

  jsYaml = require('js-yaml');

  Logger = require('./Logger');

  exec = require('child_process').exec;

  Moment = require('moment');

  local = {
    dir: "" + process.env.HOME + "/.sneaky",
    configs: {},
    logger: null,
    force: false,
    records: {},
    recordLogger: null
  };

  quit = function() {
    return setTimeout(process.exit, 200);
  };

  deploy = function(project, callback) {
    var _ref;
    local.logger.log('-----------------------------------------------------------------');
    local.logger.log("start deploy " + project.name);
    if (((_ref = local.records[project.name]) === 'success' || _ref === 'processing') && !local.force) {
      local.logger.warn("" + project.name + " has been deployed, skipping");
      local.logger.log('-----------------------------------------------------------------');
      return callback(null);
    }
    local.records[project.name] = 'processing';
    local.recordLogger.log(JSON.stringify(local.records));
    return async.waterfall([
      (function(next) {
        if (project.autoTag) {
          return autoTag(project, function(err, tag) {
            if (err == null) {
              project.version = tag;
            }
            return next(err);
          });
        } else {
          return next();
        }
      }), (function(next) {
        return archive(project, next);
      }), (function(next) {
        return before(project, next);
      }), (function(next) {
        return rsync(project, next);
      }), (function(next) {
        return after(project, next);
      })
    ], function(err, result) {
      if (err != null) {
        local.logger.err(err.toString());
        local.records[project.name] = 'fail';
      } else {
        local.records[project.name] = 'success';
        local.logger.log("finish deploy " + project.name);
      }
      local.recordLogger.log(JSON.stringify(local.records));
      local.logger.log('-----------------------------------------------------------------');
      return callback(err, result);
    });
  };

  archive = function(project, callback) {
    var gitCmd, prefix;
    if (callback == null) {
      callback = function() {};
    }
    prefix = project.prefix || project.name + '/';
    gitCmd = ("git archive " + (project.version || 'HEAD') + " --prefix=" + prefix + " ") + ("--remote=" + project.source + " --format=tar | tar -xf - -C " + local.dir);
    return runCmd(gitCmd, function(err, data) {
      if (err != null) {
        return callback(err);
      }
      process.chdir("" + local.dir + "/" + prefix);
      return callback(err);
    });
  };

  rsync = function(project, callback) {
    var excludes, servers;
    if (callback == null) {
      callback = function() {};
    }
    servers = getServers(project);
    excludes = [];
    if (typeof project.excludes === 'object' && project.excludes.length > 0) {
      excludes = project.excludes.map(function(item) {
        return "--exclude=" + item;
      });
    }
    return async.eachSeries(servers, (function(server, next) {
      var rsyncCmd;
      rsyncCmd = project.rsyncCmd || "rsync -a --timeout=15 --delete-after --ignore-errors --force" + (" -e \"ssh -p " + server[2] + "\" ") + excludes.join(' ') + (" " + local.dir + "/" + project.name + " " + server[1] + "@" + server[0] + ":" + project.destination);
      return runCmd(rsyncCmd, function(err, data) {
        return next(err);
      });
    }), function(err, result) {
      return callback(err);
    });
  };

  before = function(project, callback) {
    if (callback == null) {
      callback = function() {};
    }
    if ((project.before != null) && typeof project.before === 'string') {
      local.logger.log('before-hook:');
      return runCmd(project.before, function(err, data) {
        return callback(err);
      });
    } else {
      return callback(null);
    }
  };

  after = function(project, callback) {
    var servers;
    if (callback == null) {
      callback = function() {};
    }
    servers = getServers(project);
    if ((project.after != null) && typeof project.after === 'string') {
      local.logger.log('after-hook:');
      return async.eachSeries(servers, (function(server, next) {
        var sshCmd;
        sshCmd = "ssh " + server[1] + "@" + server[0] + " -p " + server[2] + " \"" + project.after + "\"";
        return runCmd(sshCmd, function(err, data) {
          return next(err);
        });
      }), function(err, result) {
        return callback(err);
      });
    } else {
      return callback(null);
    }
  };

  getServers = function(project) {
    var i, item, port, server, servers, user, _ref, _ref1, _ref2;
    servers = [];
    if (typeof project.servers === 'string') {
      _ref = project.servers.split('|'), server = _ref[0], user = _ref[1], port = _ref[2];
      user = user || local.configs.user || 'root';
      port = port || '22';
      servers.push([server, user, port]);
    } else if (typeof project.servers === 'object') {
      _ref1 = project.servers;
      for (i in _ref1) {
        item = _ref1[i];
        _ref2 = item.split('|'), server = _ref2[0], user = _ref2[1], port = _ref2[2];
        user = user || local.configs.user || 'root';
        port = port || '22';
        servers.push([server, user, port]);
      }
    } else if (local.configs.servers != null) {
      return getServers(local.configs);
    }
    return servers;
  };

  runCmd = function(cmd, options, callback) {
    if (callback == null) {
      callback = function() {};
    }
    if (!options.quiet) {
      local.logger.log(cmd);
    }
    if (arguments.length < 3) {
      callback = options || function() {};
    }
    return exec(cmd, function(err, data) {
      if (!options.quiet) {
        local.logger.log(data.toString());
      }
      return callback(err, data);
    });
  };

  autoTag = function(project, callback) {
    if (callback == null) {
      callback = function() {};
    }
    if (!project.source.match(/^[a-zA-Z._\/\~\-]+$/)) {
      return callback(("" + project.source + " is not a local repos, ") + "you could not use `autoTag` for a remote repos.");
    }
    process.chdir(Logger.expandPath(project.source));
    return runCmd('git tag', {
      quiet: true
    }, function(err, data) {
      var moment, newTag, tagCmd;
      if (err != null) {
        return callback(err);
      }
      moment = new Moment();
      newTag = "" + (project.tagPrefix || 'release') + "-" + (moment.format('YYYY.MM.DD.HHmmss'));
      tagCmd = "git tag " + newTag + " -m 'auto generated tag " + newTag + " by sneaky at " + (moment.format('YYYY-MM-DD HH:mm:ss')) + "'";
      return runCmd(tagCmd, function(err, data) {
        return callback(err, newTag);
      });
    });
  };

  main = function(options, callback) {
    var moment, start;
    if (options == null) {
      options = {};
    }
    if (callback == null) {
      callback = function() {};
    }
    moment = new Moment();
    local.logger = new Logger();
    local.recordLogger = new Logger("" + process.env.HOME + "/.sneaky/logs/" + (moment.format('YYYY-MM-DD')) + ".action.log", {
      flag: 'w'
    });
    start = new Date();
    local.logger.log('=================================================================');
    local.logger.log('start', start.toString());
    local.configs = (function() {
      var configPath, e;
      configPath = options.config || '~/.sneakyrc';
      configPath = Logger.expandPath(configPath);
      try {
        return jsYaml.load(fs.readFileSync(configPath, 'utf-8'));
      } catch (_error) {
        e = _error;
        if (e != null) {
          switch (e.name) {
            case 'YAMLException':
              local.logger.err("please check your configure file's format");
              break;
            default:
              local.logger.err("missing sneakyrc file, did you put this file in path " + configPath + " ?");
          }
        }
        return quit();
      }
    })();
    if (!((local.configs.projects != null) && local.configs.projects.length > 0)) {
      local.logger.err('please define the project info in the `projects` collection');
    }
    return local.recordLogger.readFile(function(err, data) {
      var e;
      try {
        if (data != null) {
          local.records = JSON.parse(data);
        }
      } catch (_error) {
        e = _error;
        local.records = {};
      }
      local.force = options.force || false;
      return async.eachSeries(local.configs.projects, deploy, function(err, result) {
        var end;
        if (err != null) {
          local.logger.err(err.toString());
          quit();
        }
        end = new Date();
        local.logger.log('time cost:', end - start);
        local.logger.log('finish', end);
        local.logger.log('=================================================================\n');
        return callback(err, result);
      });
    });
  };

  module.exports = main;

}).call(this);