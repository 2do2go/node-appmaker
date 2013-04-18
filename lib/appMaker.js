'use strict';

var _ = require('underscore'),
	shell = require('shelljs');

/** Process action functions */
exports.process = function(actions) {
	var actionNames = Object.keys(actions).sort(),
		executedActionsCount = 0;
	actionNames.forEach(function(name) {
		if (~process.argv.indexOf(name)) {
			actions[name]();
			executedActionsCount++;
		}
	});
	if (!executedActionsCount) {
		var defaultAction = actions['default'] || function() {
			printHeader('USAGE: makeApp.js (' + actionNames.join('|') + ')');
			process.exit(1);
		};
		defaultAction();
	}
};

/** Build all using `config` */
exports.build = function(config) {
	if (config.less) exports.compileLess(config.less);
	if (config.sharedModulesConfig) exports.buildSharedModules(
		config.sharedModulesConfig
	);
	if (config.requirejs) exports.requirejsOptimize(config.requirejs);
};

/** Clean selected `files` with `options` */
exports.clean = function(files, options) {
	if (!files) throw new Error('No files to clean');
	printHeader('clean ' + files);
	shell.rm.apply(null, options ? [options, files] : [files]);
};

/** Compile less to css */
exports.compileLess = function(config) {
	if (!config.files) throw new Error('`less.files` is not set');
	printHeader('compile less files (' + config.files + ') to css:');
	config.cmd = config.cmd || 'node_modules/less/bin/lessc';
	shell.ls(config.files)
		.sort()
		.forEach(function(path) {
			var dest = path.replace('.less', '.css'), 
				cmd = config.cmd + ' ' + path + ' ' + dest;
			printContent(cmd);
			var code = shell.exec(cmd).code;
			if (code) throw new Error('None zero exit code: ' + code);
		});
};

/** Build shared modules for client */
exports.buildSharedModules = function(sharedModulesConfig) {
	var builder = require('requirejs-common-wrap-middleware').builder;
	printHeader('build shared modules with config ' + sharedModulesConfig);
	builder(require(sharedModulesConfig));
};

/** Run requirejs optimizer */
exports.requirejsOptimize = function(config) {
	var requirejs = require('requirejs');
	if (!config) throw new Error('requirejs config is not defined');
	// apply defaults for requirejs config
	_(config).defaults({
		keepBuildDir: false,
		optimize: 'uglify2',
		skipDirOptimize: false,
		generateSourceMaps: false,
		useStrict: true,
		preserveLicenseComments: false,
	});
	_(['modulesDir', 'baseUrl', 'dir', 'mainConfigFile']).each(function(option) {
		if (option in config == false) throw new Error(
			'`' + option + '` is required at requirejs config but not set'
		);
	});
	
	printHeader(
		'convert modules dir (' + config.modulesDir + ') to modules paths'
	);
	config.modules = shell.find(config.modulesDir)
		.filter(function(file) {
			return file.match(/\.js$/);
		}).map(function(modulePath) {
			return {
				name: modulePath.replace(config.baseUrl, '').replace('.js', '')
			};
		});
	delete config.modulesDir;

	printHeader(
		'requirejs.optimizer config: ' + 
		JSON.stringify(_(config).chain().clone().extend({
			modules: '<<< cutted see below >>>'
		}).value(), null, 4) +
		'\nrequirejs config modules: ' +
		JSON.stringify(config.modules) +
		'\nrun requirejs optimizer...'
	);
	requirejs.optimize(config, function(buildResponse) {
		console.info(buildResponse);
	}, function(err) {
		throw err;
	});	
};

function printHeader(text) {
	console.log('*** ' + text);
}

function printContent(text) {
	console.log('\t' + text);
}
