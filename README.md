# appmaker

helper script for creating production build of web application (compile less to
css, optimize js using requirejs optimizer, etc)

## Installation

```bash

npm install appmaker

```

## Usage

create your own `makeApp.js` file at root directory of your project and use
helper methods within him, e.g.

```js

#!/usr/bin/env node

var	appMaker = require('./lib/2do2go/node_utils/appMaker'),
	path = require('path');

var actions = {};
actions.build = function() {
	actions.clean();
	actions.compileLess();
	actions.requirejsOptimize();
}

actions.compileLess = function() {
	appMaker.compileLess({files: 'static/css/*.less'});
};

actions.requirejsOptimize = function() {
	appMaker.requirejsOptimize({
		modulesDir: 'static/js/views/',
		baseUrl: 'static/js/',
		dir: 'static/scripts',
		mainConfigFile: 'views/template/requirejs/development.js'
	});
};

actions.clean = function() {
	appMaker.clean(
		['static/scripts', 'static/js/sharedmodules/*.js', 'static/css/*.css'],
		'-Rf'
	);	
}

appMaker.process(actions);


```

after that you can call `./makeApp.js` (don`t forget to make him executable via
`chmod +rx`) to see available commands
