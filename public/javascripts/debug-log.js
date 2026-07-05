/*
 * Opt-in browser-console diagnostics for support/debugging.
 *
 * Enable on Xronos activity pages by adding this browser-only fragment
 * to the end of the page URL:
 *   #xronosVerbose=true
 *
 * The shorter fragment also works:
 *   #xronosVerbose
 *
 * Disable by adding:
 *   #xronosVerbose=false
 *
 * Use the # fragment form on activity pages. Query-string forms such as
 * ?xronosVerbose=true may interfere with activity routing on some pages.
 *
 * It can also be controlled from the browser console:
 *   localStorage.setItem('xronosVerbose', 'true')
 *   localStorage.removeItem('xronosVerbose')
 *   window.xronosVerbose = true
 */
function urlVerboseSetting() {
    var href;

    try {
        href = window.location.href;

        if (/[?#&]xronosVerbose=(false|0|off)($|[&#])/i.test(href)) {
            window.localStorage.removeItem('xronosVerbose');
            return false;
        }

        if (/[?#&]xronosVerbose=(true|1|on)($|[&#])/i.test(href) ||
            /#xronosVerbose$/i.test(window.location.hash)) {
            window.localStorage.setItem('xronosVerbose', 'true');
            return true;
        }
    } catch (err) {
        return undefined;
    }

    return undefined;
}

function verboseEnabled() {
    var urlSetting = urlVerboseSetting();

    if (urlSetting !== undefined) {
        return urlSetting;
    }

    try {
        return window.xronosVerbose === true ||
            window.localStorage.getItem('xronosVerbose') === 'true';
    } catch (err) {
        return false;
    }
}

exports.log = function() {
    var args;

    if (!verboseEnabled()) {
        return;
    }

    try {
        args = Array.prototype.slice.call(arguments);
        args.unshift('[Xronos]');
        console.log.apply(console, args);
    } catch (err) {
        // Diagnostic logging should never affect page behavior.
    }
};
