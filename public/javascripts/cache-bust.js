var $ = require('jquery');

$(document).ready(function() {
    // Historical publication links can carry a query-string activity SHA.
    // Once the server has used that query to select the requested activity,
    // return to the canonical URL. Current HTML/static cache policy performs
    // revalidation, so do not rely on the obsolete reload(true) cache hint.
    if (window.location.search.match(/^\?/)) {
        if (
            window.history &&
            window.history.replaceState
        ) {
            window.history.replaceState(
                {},
                document.title,
                window.location.pathname
            );
            window.location.reload();
        }
    }
});

