var $ = require('jquery');
var legacyCacheCleanup =
    require('./legacy-cache-cleanup');

// Check to see if there is a newer version available.
var fallbackVersion =
    require('../../dbm.json').version;


function pageApplicationVersion() {
    var element = document.querySelector(
        'meta[name="xronos-application-version"]'
    );

    if (!element) {
        return fallbackVersion;
    }

    return (
        element.getAttribute('content') ||
        fallbackVersion
    );
}


function cleanupLegacyBrowserCaches() {
    return legacyCacheCleanup
        .cleanupLegacyBrowserCaches({
            navigator: window.navigator,
            caches: window.caches
        })
        .catch(function(err) {
            console.warn(
                'Unable to finish legacy Xronos cache cleanup.',
                err
            );
        });
}


function reloadCurrentPageFromNetwork() {
    var reload = function() {
        window.location.reload();
    };

    if (typeof window.fetch !== 'function') {
        reload();
        return;
    }

    window.fetch(
        window.location.href,
        {
            cache: 'reload',
            credentials: 'same-origin'
        }
    )
        .then(reload, reload);
}


var version = pageApplicationVersion();

console.log(
    "This is XIMERA, Version " +
    version
);

// Xronos briefly registered a root-scoped cache-first service worker in
// production. Merely disabling new registration does not remove workers or
// Cache Storage already installed in a browser, so retire those artifacts on
// every current-generation page load. The current application intentionally
// does not use Cache Storage.
cleanupLegacyBrowserCaches();

$(function() {
    // Check which version the server is providing, avoiding the cache.
    var versionEndpoint =
        window.toValidPath('/version?');

    $.ajax(
        versionEndpoint +
        (new Date().getTime())
    )
        .done(function(data) {
            data = String(data).trim();

            // If the server can offer a newer version, migrate this page onto
            // the new application-generation namespace.
            if (data != version) {
                if (
                    sessionStorage.getItem(
                        'refreshedToVersion'
                    ) == data
                ) {
                    alert(
                        'Attempted to refresh; try a force refresh.'
                    );
                    return;
                }

                sessionStorage.setItem(
                    'refreshedToVersion',
                    data
                );

                console.log(
                    'Updating from version ' +
                    version +
                    ' to version ' +
                    data
                );

                cleanupLegacyBrowserCaches()
                    .then(function() {
                        reloadCurrentPageFromNetwork();
                    });
            }
        });
});
