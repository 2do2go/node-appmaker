'use strict';

var _ = require('underscore'),
	shell = require('shelljs'),
	fs = require('fs'),
	os = require('os'),
	childExec = require('child_process').exec,
	crypto = require('crypto'),
	path = require('path');

/** Process tasks */
exports.process = function(tasks) {
	//mix `rebuild` task
	if (tasks.build && tasks.clean) {
		tasks.rebuild = function() {
			tasks.clean();
			tasks.build();
		};
	}
	var taskNames = Object.keys(tasks).sort(),
		executedTasksCount = 0;
	//find and execute task
	taskNames.forEach(function(name) {
		if (~process.argv.indexOf(name)) {
			tasks[name]();
			executedTasksCount++;
		}
	});
	//execute default task if no tasks were executed
	if (!executedTasksCount) {
		var defaultTask = tasks['default'] || function() {
			printHeader('USAGE: makeApp.js (' + taskNames.join('|') + ')');
			process.exit(1);
		};
		defaultTask();
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
exports.clean = function(files, options, isFind) {
	if (!files) throw new Error('No files to clean');

	printHeader('clean ' + files.join(' '));

	if (isFind) {
		exec('find ' + files.join(' ') + ' ' + options + ' -delete');
	} else {
		shell.rm.apply(null, options ? [options, files] : [files]);
	}
};


/** Compile less to css */
exports.compileLess = function(config) {
	if (!config.files) throw new Error('`less.files` is not set');
	printHeader('compile less files (' + config.files + ') to css:');
	config.cmd = config.cmd || 'node_modules/less/bin/lessc';
	config.args = config.args || '--compress --strict-math=on --strict-units=on';
	shell.ls(config.files)
		.sort()
		.forEach(function(path) {
			var dest = path.replace('.less', '.css'),
				cmd = config.cmd + ' ' + config.args + ' ' + path + ' ' + dest;
			printContent(cmd);
			exec(cmd);
		});
};

/** Build shared modules for client */
exports.buildSharedModules = function(sharedModulesConfig) {
	var builder = require('requirejs-common-wrap-middleware').builder;
	printHeader('build shared modules with config ' + sharedModulesConfig);
	builder(require(sharedModulesConfig));
};

/** Run requirejs optimizer */
exports.requirejsOptimize = function(config, callback) {
	var requirejs = require('requirejs');
	if (!config) throw new Error('requirejs config is not defined');
	// apply defaults for requirejs config
	_(config).defaults({
		keepBuildDir: false,
		optimize: 'uglify2',
		optimizeParallel: false,
		skipDirOptimize: true,
		generateSourceMaps: false,
		useStrict: true,
		preserveLicenseComments: false,
		logLevel: 0
	});
	callback = callback || function() {};
	_(['modulesDir', 'baseUrl', 'dir', 'mainConfigFile']).each(function(option) {
		if (option in config === false) throw new Error(
			'`' + option + '` is required at requirejs config but not set'
		);
	});
	if (config.optimizeParallel && config.optimize != 'none') throw new Error(
		'`optimizeParallel` could used only with `optimize` equal to `none` ' +
		'but `' + config.optimize + '` is set'
	);

	var modulesDir = config.modulesDir,
		baseUrl = config.baseUrl;
	delete config.modulesDir;

	printHeader(
		'convert modules dir (' + modulesDir + ') to modules paths'
	);
	config.modules = shell.find(modulesDir).filter(function(file) {
 		return file.match(/\.js$/) &&
 			(!config.modulesDirExcludes || !file.match(config.modulesDirExcludes));
	}).map(function(modulePath) {
		return {name: modulePath.replace(config.baseUrl, '').replace('.js', '')};
	});

	printHeader(
		'requirejs.optimizer config: ' +
		JSON.stringify(_(config).chain().clone().extend({
			modules: '<<< cutted see below >>>'
		}).value(), null, 4) +
		'\nrequirejs config modules: ' +
		JSON.stringify(config.modules) +
		'\nrun requirejs optimizer...'
	);

	requirejs.optimize(config, function() {
		printHeader('requirejs optimizer done their job');
		if (config.optimizeParallel) {
			config.optimizeParallel.dir = config.dir;
			exports.jsOptimizeParallel(config.optimizeParallel, function(err) {
				if (err) throw (err);
				callback();
			});
		} else {
			callback();
		}
	}, function(err) {
		throw err;
	});
};

/** Compile jade templates to amd wrapped js */
exports.jadeAmdCompile = function(config) {
	config.cmd = config.cmd || 'node_modules/jade-amd/bin/jade-amd';
	if (!config.from) throw new Error('`from` is not defined');
	if (!config.to) throw new Error('`to` is not defined');
	printHeader(
		'Compile jade templates(' + config.from + ') to(' +
		config.to + ') amd wrapped js'
	);
	exec([config.cmd, '--from', config.from, '--to', config.to].join(' '));
};

/** Optimize js in parallel */
exports.jsOptimizeParallel = function(params, callback) {
	params = params || {};
	_(params).defaults({
		showStdout: false,
		showStderr: false
	});
	printHeader('start js optimization in parallel');
	if (!params.files && !params.dir) throw new Error(
		'`files` or `dir` for optimization is not set'
	);
	if (params.dir) {
		params.files = shell.find(params.dir).filter(function(file) {
			return file.match(/\.js$/);
		});
	}
	if (params.exclude) {
		printContent('exlude patterns: ' + params.exclude.join(' '));
		params.files = params.files.filter(function(file) {
			return !params.exclude.some(function(pattern) {
				pattern = pattern.test ? pattern : new RegExp(pattern);
				return pattern.test(file);
			});
		});
	}
	printContent('process files: ' + params.files.join(' '));
	params.optimizer = params.optimizer || 'node_modules/.bin/uglifyjs';
	params.optimizerOptions = params.optimizerOptions || ['-c', '-m'];
	params.parallelCount = params.parallelCount || os.cpus().length;
	params.waitDelay = params.waitDelay || 1;

	/**
	 * Caching output files key - file path, value - hash sum
	 */
	var cache = null,
		cacheFile = null;
	if (params.cacheDir) {
		if (!fs.existsSync(params.cacheDir)) fs.mkdirSync(params.cacheDir);
		cacheFile = path.join(params.cacheDir, 'cache.json');
		try {
			cache = JSON.parse(fs.readFileSync(cacheFile))
		} catch (err) {
			cache = {};
			printContent(
				'can`t load cache file: `' + err.message + '` create a new one'
			);
		}
	} else {
		printContent(
			'caching of output files disabled cause `cacheDir` is not defined'
		);
	}

	var stat = {optimized: 0, fromCache: 0, total: params.files.length};
	var curIndex = 0, processingCount = 0, completedCount = 0;
	setTimeout(check, params.waitDelay);
	function check() {
		while (
			processingCount < params.parallelCount &&
			curIndex < params.files.length
		) {
			optimize(params.files[curIndex], function(err) {
				if (err) throw err;
				completedCount++;
				printContent(
					completedCount + '/' + params.files.length +
					' files done'
				);
				processingCount--;
			});
			processingCount++;
			curIndex++;
		}
		if (completedCount < params.files.length) {
			setTimeout(check, params.waitDelay);
		} else {
			if (cache) {
				printContent('save cache to: ' + cacheFile);
				fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 4));
				printContent('statistic:\n' + JSON.stringify(stat, null, 4));
			};
			callback();
		}
	}

	function optimize(file, callback) {
		var hashsum = fileHashsum(file),
			outFile = file + '_tmp_',
			cachedFile = cache ? path.join(params.cacheDir, hashsum) : null;
		if (cache && file in cache && hashsum == cache[file] && fs.existsSync(cachedFile)) {
			fs.writeFileSync(file, fs.readFileSync(cachedFile));
			stat.fromCache++;
			printContent('skip optimization for ' + file + ' due cache');
			callback();
			return;
		}
		stat.optimized++;
		var cmd = [params.optimizer, file]
			.concat(params.optimizerOptions)
			.concat(['-o', outFile])
			.join(' ');
		printContent('optimize ' + file);
		childExec(cmd, function(err, stdout, stderr) {
			if (stdout && params.showStdout) printContent(stdout);
			if (stderr && params.showStderr) printContent(stderr);
			if (!err) {
				if (cache) {
					cache[file] = hashsum;
					fs.writeFileSync(cachedFile, fs.readFileSync(outFile));
				}
				fs.renameSync(outFile, file);
			}
			callback(err);
		});
	}

	function fileHashsum(file) {
		var hashsum = crypto.createHash('md5');
		hashsum.update(
			fs.readFileSync(file) +
			// some salt, just swap the options to reset the cache
			[params.optimizer, params.optimizerOptions.join(' ')].join(';')
		);
		return hashsum.digest('hex');
	}
};

function printHeader(text) {
	console.log('*** ' + text);
}

function printContent(text) {
	console.log('\t' + text);
}

/** exec which throw error on non-zero exit code */
function exec(cmd, options) {
	var code = shell.exec(cmd).code;
	if (code !== 0) throw new Error('Non-zero exit code: ' + code);
}
