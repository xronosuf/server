window.MathJax = {
    delayStartupUntil : "configured",

    jax: ["input/TeX","output/HTML-CSS"],
    extensions: ["tex2jax.js","MathMenu.js","MathZoom.js", "toMathML.js", "AssistiveMML.js", "[a11y]/accessibility-menu.js"],

    tex2jax: {preview: "none"},

    "HTML-CSS": {
        availableFonts: ["Tex"],
        imageFont: null
    },
	
    processEnvironments: true,
    showProcessingMessages: false,
    messageStyle: 'none',
    
    // MathMenu: {
	// showRenderer: false,
	// showMathPlayer: false
    // },
    
    // BADBAD: this also breaks the layout triggers
    // showMathMenu: false,

    TeX: {
	equationNumbers: { autoNumber: "AMS" },
	// siunitx is bundled below from the tracked third-party extension copy.
	extensions: ["AMSmath.js","AMSsymbols.js","noErrors.js","noUndefined.js","color.js","cancel.js","mhchem.js" ],
	noErrors: {disabled: true},
	Macros: {
	    SI: ['\\num{#1}\\,\\si{#2}',2],
	    xspace: '',
	    ensuremath: ''
	}
    },

    root: window.toValidPath("/node_modules/mathjax/")
};
require('mathjax2');

// Keep Xronos' legacy third-party siunitx extension available without relying
// on MathJax to fetch a non-package file from node_modules/mathjax/extensions.
require('../../siunitx.js');

module.exports = window.MathJax;
