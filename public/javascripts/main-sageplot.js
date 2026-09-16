'use strict';

/*
 * Sage plot support must prepare authored plot placeholders before main.js
 * captures the immutable pre-MathJax Sage manifest.  Requiring this bootstrap
 * first lets it wrap the shared sagemath module before main.js loads it.
 */
var sagemath = require('./sagemath');
var sageplot = require('./sageplot-bootstrap');

sageplot.install(sagemath);

require('./main');
