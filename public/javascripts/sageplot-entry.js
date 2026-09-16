'use strict';

/*
 * Browserify evaluates main.js first.  main.js registers its document-ready
 * startup callback but does not capture the immutable Sage manifest until that
 * callback runs.  Install the plot bridge after main.js evaluation and before
 * document-ready so unrelated module-load ordering remains unchanged.
 */
var sagemath = require('./sagemath');
var sageplot = require('./sageplot-bootstrap');

sageplot.install(sagemath);
