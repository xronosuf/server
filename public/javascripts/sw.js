/*
 * Xronos no longer uses a service worker.
 *
 * This file intentionally remains available at /sw.js as a retirement
 * worker. Older Xronos releases registered a root-scoped cache-first worker;
 * browsers can retain that registration long after application code stops
 * calling navigator.serviceWorker.register(). If a browser checks /sw.js for
 * an update, this replacement removes the old Cache Storage contents and
 * unregisters itself instead of preserving the historical cache-first logic.
 */

self.addEventListener('install', function(event) {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches
            .keys()
            .then(function(cacheNames) {
                return Promise.all(
                    cacheNames.map(function(cacheName) {
                        return caches.delete(cacheName);
                    })
                );
            })
            .then(function() {
                return self.registration.unregister();
            })
    );
});
