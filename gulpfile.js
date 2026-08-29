"use strict";

var argv = require('yargs').argv,
    gulp       = require('gulp'),
    gulpif     = require('gulp-if'),
    puglinter    = require('gulp-pug-linter'),
    source     = require('vinyl-source-stream'),
    buffer     = require('vinyl-buffer'),
    sourcemaps = require('gulp-sourcemaps'),
    browserify = require('browserify'),
    watchify   = require('watchify'),
    aliasify   = require('aliasify'),
    babelify   = require('babelify'),
    sass       = require('gulp-sass')(require('sass')),
    cleanCSS  = require('gulp-clean-css'),
    assign     = require('lodash.assign');

// Directory where static files are found. Don't forget the slash at the end.
var staticDirectoryCSS = './public/stylesheets/';
// but now I am purposefully forgetting the slash?!
var staticDirectoryJavascripts = './public/javascripts';

// Source and target JS files for Browserify
var jsMainFile                = './public/javascripts/main.js';
var jsBundleFile              = 'main.min.js';
var jsServiceWorkerFile       = './public/javascripts/sw.js';
var jsServiceWorkerBundleFile = 'sw.min.js';
var mathExpressionsUmdFile    = './node_modules/math-expressions/build/math-expressions_umd.js';

// Source and target SCSS files
var cssMainFile       = './public/stylesheets/base.scss';
var cssFiles          = './public/stylesheets/**/*.scss';

////////////////////////////////////////////////////////////////
// Browserify bundler
var options = {
    entries: [jsMainFile],
    transform: [
	[aliasify],
	[babelify, {
	    global: true,
	    babelrc: false,
	    configFile: false,
	    ignore: [/\/node_modules\/(?!syntaxhighlighter|brush-)/],
	    "presets": [
		["@babel/preset-env", {
		    "targets": {
			"browsers": ["last 2 versions", "safari >= 7"]
		    }
		}]
	    ]
	}]
    ],
    extensions: ['.js'],
    cache: {}, packageCache: {}, fullPaths: true // for watchify
};

var completeOptions = assign({}, watchify.args, options);
var bundler = browserify(completeOptions);

function buildPipeline(b) {
    return b
        .bundle()
        .pipe(source(jsBundleFile))
        .pipe(buffer())
        .pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
        .pipe(sourcemaps.write('./', {sourceMappingURLPrefix: '.'})) // writes .map file
        .pipe(gulp.dest(staticDirectoryJavascripts));
}

// Copy the official alpha94 UMD build without sending it through Browserify 13.
gulp.task('math-expressions', function() {
    return gulp.src(mathExpressionsUmdFile)
        .pipe(gulp.dest(staticDirectoryJavascripts));
});

// Build JavaScript using Browserify
gulp.task('js', gulp.series('math-expressions', function() {
    return buildPipeline(bundler);
}));

////////////////////////////////////////////////////////////////
// Bundler for the service worker
var serviceWorkerBundler = browserify({
    entries: [jsServiceWorkerFile],
    transform: [
	[aliasify],
	[babelify, {
	    global: true,
	    babelrc: false,
	    configFile: false,
	    "presets": [
		["@babel/preset-env", {
		    "targets": {
			"browsers": ["last 2 versions", "safari >= 7"]
		    }
		}]
	    ]
	}]
    ],
    extensions: ['.js'],
    cache: {}, packageCache: {}, fullPaths: true // for watchify
});

function buildServiceWorkerPipeline(b) {
    return b
        .bundle()
        .pipe(source(jsServiceWorkerBundleFile))
        .pipe(buffer())
        .pipe(gulpif(!argv.production, sourcemaps.init({loadMaps: true}))) // loads map from browserify file
        .pipe(gulpif(!argv.production, sourcemaps.write('./', {sourceMappingURLPrefix: '.'}))) // writes .map file
        .pipe(gulp.dest(staticDirectoryJavascripts));
}

// Build JavaScript using Browserify
gulp.task('service-worker', function() {
    return buildServiceWorkerPipeline(serviceWorkerBundler);
});

////////////////////////////////////////////////////////////////
// Build CSS
gulp.task('css', function(){
    return gulp.src(cssMainFile)
        .pipe(sass())
        .pipe(gulpif(argv.production, cleanCSS({})))
        .pipe(gulp.dest(staticDirectoryCSS));
});

////////////////////////////////////////////////////////////////
// Watch JS + CSS using watchify + gulp.watch

gulp.task('watchify', function() {
    var watcher  = watchify(bundler);
    return watcher
	.on('error', console.error)
        .on('log', console.log) // output build logs to terminal
	.on('update', function () {
	    buildPipeline(watcher);
            console.log("Updated JavaScript sources");
    })
    .bundle() // Create the initial bundle when starting the task
    .pipe(source(jsBundleFile))
    .pipe(gulp.dest(staticDirectoryCSS));
});

gulp.task('csswatch', function () {
    gulp.watch(cssFiles, ['css']);
});

gulp.task('service-worker-watch', function () {
    gulp.watch([jsServiceWorkerFile], ['service-worker']);
});

gulp.task('lint', function () {
    return gulp
	.src('views/**/*.pug')
	.pipe(puglinter());
});

gulp.task('watch', gulp.series('watchify', 'csswatch', 'service-worker-watch'));
gulp.task('default', gulp.series('js', 'css', 'service-worker'));
