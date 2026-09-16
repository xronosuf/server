'use strict';

/*
 * Browserify evaluates main.js first. main.js registers its document-ready
 * startup callback but does not capture the immutable Sage manifest until that
 * callback runs. Install the first-class Sage plot renderer after main.js
 * evaluation and before document-ready so the canonical manifest can discover
 * published plot markers without changing unrelated module-load ordering.
 */
var sagemath = require('./sagemath');
var sageplot = require('./sageplot-bootstrap');

sageplot.install(sagemath);
