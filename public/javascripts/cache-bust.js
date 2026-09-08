var $ = require('jquery');

$(document).ready(function() {
    /*
     * Historical publication links can carry a query-string activity SHA.
     * Activity selection is now forced to the newest publication on every
     * page request, so the query no longer selects a historical generation.
     * Canonicalize the address bar without reloading: the current response is
     * already the newest activity, and a second navigation only disrupts page
     * initialization while providing no cache or publication benefit.
     */
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
        }
    }
});

