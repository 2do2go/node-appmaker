# appmaker

helper script for creating production build of web application (compile less to
css, optimize js using requirejs optimizer, etc)

## Installation

```bash

npm install appmaker

```

## Usage

create your own `makeApp.js` build script (e.g. at root directory of your
project), define your `tasks` and use helper methods within them, e.g.

```js

#!/usr/bin/env node

var	appMaker = require('./lib/2do2go/node_utils/appMaker'),
	path = require('path');

var tasks = {};
tasks.build = function() {
	tasks.clean();
	tasks.compileLess();
	tasks.requirejsOptimize();
};

tasks.compileLess = function() {
	appMaker.compileLess({files: 'static/css/*.less'});
};

tasks.requirejsOptimize = function() {
	appMaker.requirejsOptimize({
		modulesDir: 'static/js/views/',
		baseUrl: 'static/js/',
		dir: 'static/scripts',
		mainConfigFile: 'views/template/requirejs/development.js'
	});
};

tasks.clean = function() {
	appMaker.clean(
		['static/scripts', 'static/js/sharedmodules/*.js', 'static/css/*.css'],
		'-Rf'
	);
};

appMaker.process(tasks);


```

after that you can call `./makeApp.js` (don't forget to make him executable via
`chmod +rx`) to see available commands
