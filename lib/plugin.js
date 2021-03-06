"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _webpack = require("webpack");

var _webpack2 = _interopRequireDefault(_webpack);

var _flatMap = require("lodash/flatMap");

var _flatMap2 = _interopRequireDefault(_flatMap);

var _isEmpty = require("lodash/isEmpty");

var _isEmpty2 = _interopRequireDefault(_isEmpty);

var _once = require("lodash/once");

var _once2 = _interopRequireDefault(_once);

var _tapable = require("tapable");

var _webpackSources = require("webpack-sources");

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

var _paths = require("./paths");

var _createCompileIfNeeded = require("./createCompileIfNeeded");

var _createCompileIfNeeded2 = _interopRequireDefault(_createCompileIfNeeded);

var _createConfig = require("./createConfig");

var _createConfig2 = _interopRequireDefault(_createConfig);

var _createMemory = require("./createMemory");

var _createMemory2 = _interopRequireDefault(_createMemory);

var _createSettings = require("./createSettings");

var _createSettings2 = _interopRequireDefault(_createSettings);

var _getInstanceIndex = require("./getInstanceIndex");

var _getInstanceIndex2 = _interopRequireDefault(_getInstanceIndex);

var _createHandleStats = require("./createHandleStats");

var _createHandleStats2 = _interopRequireDefault(_createHandleStats);

var _createLogger = require("./createLogger");

var _createLogger2 = _interopRequireDefault(_createLogger);

var _htmlWebpackPlugin = require("html-webpack-plugin");

var _htmlWebpackPlugin2 = _interopRequireDefault(_htmlWebpackPlugin);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var AutoDLLPlugin = function () {
  function AutoDLLPlugin(settings) {
    _classCallCheck(this, AutoDLLPlugin);

    // first, we store a reference to the settings passed by the user as is.
    this._originalSettings = settings;
  }

  // apply is called once when compiler initialized.
  // note that even if the it called using webpack-dev-server
  // it still called only once and not on every re-run.
  // keep in mind that some user wanted to use multiple instances of the plugin in one config,
  // in that case, each instance calls its own apply.


  _createClass(AutoDLLPlugin, [{
    key: "apply",
    value: function apply(compiler) {
      // createSettings responsibe for extending the defaults values with the user's settings.
      // It also adds a uniqe hash which in the form of:
      // [env]_instance_[index]_[settingsHash]
      // [env] - settings.env provided by the user. defaults to NODE_ENV
      // [index] - the index of the instance in the user's plugins array.
      // [settingsHash] - a hash made of JSON.stringify(settings) with some values omitted.
      // hash example: development_instance_0_3289102229a87e84441ca34609c27500

      // both [env] & [index] aims to solve the challenge of having muliple instances.
      // in the plugin itself its not a problem,
      // but since the cache is stored in file system we need to came up with a uniqe path for each instance
      // to prevent collision. related to: https://github.com/asfktz/autodll-webpack-plugin/issues/30

      var settings = (0, _createSettings2.default)({
        originalSettings: this._originalSettings,
        index: (0, _getInstanceIndex2.default)(compiler.options.plugins, this),
        parentConfig: compiler.options
      });

      var log = (0, _createLogger2.default)(settings.debug);
      var dllConfig = (0, _createConfig2.default)(settings, compiler.options);
      var compileIfNeeded = (0, _createCompileIfNeeded2.default)(log, settings);

      var memory = (0, _createMemory2.default)();
      var handleStats = (0, _createHandleStats2.default)(log, settings.hash, memory);

      compiler.hooks.autodllStatsRetrieved = new _tapable.SyncHook(["stats", "source"]);

      if ((0, _isEmpty2.default)(dllConfig.entry)) {
        // there's nothing to do.
        return;
      }

      var context = settings.context,
          inject = settings.inject;


      var attachDllReferencePlugin = (0, _once2.default)(function (compiler) {
        Object.keys(dllConfig.entry).map((0, _paths.getManifestPath)(settings.hash)).forEach(function (manifestPath) {
          new _webpack.DllReferencePlugin({
            context: context,
            manifest: manifestPath
          }).apply(compiler);
        });
      });

      var beforeCompile = function beforeCompile(params, callback) {
        var dependencies = new Set(params.compilationDependencies);
        [].concat(_toConsumableArray(dependencies)).filter(function (path) {
          return !path.startsWith(_paths.cacheDir);
        });
        callback();
      };

      var watchRun = function watchRun(compiler, callback) {
        compileIfNeeded(function () {
          return (0, _webpack2.default)(dllConfig);
        }).then(function (stats) {
          return handleStats(stats);
        }).then(function (_ref) {
          var source = _ref.source,
              stats = _ref.stats;

          compiler.hooks.autodllStatsRetrieved.call(stats, source);

          if (source === "memory") return;
          memory.sync(settings.hash, stats);
        }).then(function () {
          attachDllReferencePlugin(compiler);
          callback();
        }).catch(console.error);
      };

      var emit = function emit(compilation, callback) {
        var dllAssets = memory.getAssets().reduce(function (assets, _ref2) {
          var filename = _ref2.filename,
              buffer = _ref2.buffer;

          var assetPath = _path2.default.join(settings.path, filename);

          return _extends({}, assets, {
            [assetPath]: new _webpackSources.RawSource(buffer)
          });
        }, {});

        compilation.assets = _extends({}, compilation.assets, dllAssets);

        callback();
      };

      compiler.hooks.beforeCompile.tapAsync("AutoDllPlugin", beforeCompile);
      compiler.hooks.run.tapAsync("AutoDllPlugin", watchRun);
      compiler.hooks.watchRun.tapAsync("AutoDllPlugin", watchRun);
      compiler.hooks.emit.tapAsync("AutoDllPlugin", emit);

      if (inject) {
        var getDllEntriesPaths = function getDllEntriesPaths(extension) {
          return (0, _flatMap2.default)(memory.getStats().entrypoints, "assets").filter(function (filename) {
            return filename.endsWith(extension);
          }).map(function (filename) {
            return (0, _paths.getInjectPath)({
              publicPath: settings.publicPath,
              pluginPath: settings.path,
              filename
            });
          });
        };

        var doCompilation = function doCompilation(htmlPluginData, callback) {
          htmlPluginData.assets.js = [].concat(_toConsumableArray(getDllEntriesPaths(".js")), _toConsumableArray(htmlPluginData.assets.js));
          htmlPluginData.assets.css = [].concat(_toConsumableArray(getDllEntriesPaths(".css")), _toConsumableArray(htmlPluginData.assets.css));

          callback(null, htmlPluginData);
        };

        compiler.hooks.compilation.tap("AutoDllPlugin", function (compilation) {
          if (compilation.hooks.htmlWebpackPluginBeforeHtmlGeneration) {
            compilation.hooks.htmlWebpackPluginBeforeHtmlGeneration.tapAsync("AutoDllPlugin", doCompilation);
          }
          if (!_htmlWebpackPlugin2.default.getHooks(compilation).beforeAssetTagGeneration) {
            return;
          }
          _htmlWebpackPlugin2.default.getHooks(compilation).beforeAssetTagGeneration.tapAsync("AutoDllPlugin", doCompilation);
        });
      }
    }
  }]);

  return AutoDLLPlugin;
}();

exports.default = AutoDLLPlugin;