function unregisterLegacyServiceWorkers(navigatorObject) {
    var serviceWorker =
        navigatorObject &&
        navigatorObject.serviceWorker;

    if (
        !serviceWorker ||
        typeof serviceWorker.getRegistrations !== 'function'
    ) {
        return Promise.resolve([]);
    }

    return serviceWorker
        .getRegistrations()
        .then(function(registrations) {
            return Promise.all(
                registrations.map(function(registration) {
                    return registration.unregister();
                })
            );
        });
}

function clearLegacyCacheStorage(cacheStorage) {
    if (
        !cacheStorage ||
        typeof cacheStorage.keys !== 'function' ||
        typeof cacheStorage.delete !== 'function'
    ) {
        return Promise.resolve([]);
    }

    return cacheStorage
        .keys()
        .then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    return cacheStorage.delete(cacheName);
                })
            );
        });
}

function cleanupLegacyBrowserCaches(environment) {
    environment = environment || {};

    return Promise.all([
        unregisterLegacyServiceWorkers(
            environment.navigator
        ),
        clearLegacyCacheStorage(
            environment.caches
        )
    ]);
}

module.exports = {
    unregisterLegacyServiceWorkers:
        unregisterLegacyServiceWorkers,
    clearLegacyCacheStorage:
        clearLegacyCacheStorage,
    cleanupLegacyBrowserCaches:
        cleanupLegacyBrowserCaches
};
