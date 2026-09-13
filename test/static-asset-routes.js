var assert = require('assert');
var express = require('express');
var fs = require('fs');
var os = require('os');
var path = require('path');
var request = require('supertest');
var routes = require('../lib/static-asset-routes');

describe('static asset cache boundaries', function() {
    var root;
    var app;
    var version = 'abc123';

    beforeEach(function() {
        root = fs.mkdtempSync(
            path.join(os.tmpdir(), 'xronos-static-')
        );

        fs.mkdirSync(
            path.join(root, 'public'),
            { recursive: true }
        );
        fs.mkdirSync(
            path.join(root, 'node_modules/pkg'),
            { recursive: true }
        );
        fs.mkdirSync(
            path.join(root, 'node_modules/guppy-dev/lib/icons'),
            { recursive: true }
        );

        fs.writeFileSync(
            path.join(root, 'public/example.js'),
            'public-example'
        );
        fs.writeFileSync(
            path.join(root, 'node_modules/pkg/example.js'),
            'module-example'
        );
        fs.writeFileSync(
            path.join(root, 'node_modules/guppy-dev/lib/icons/help.txt'),
            'guppy-example'
        );

        app = express();
        routes.install(
            app,
            {
                root: root,
                applicationVersion: version
            }
        );
    });

    afterEach(function() {
        fs.rmSync(
            root,
            { recursive: true, force: true }
        );
    });

    it('serves current-version public assets as immutable', function() {
        return request(app)
            .get('/public/v' + version + '/example.js')
            .expect(200)
            .expect(function(res) {
                assert.match(
                    res.headers['cache-control'],
                    /max-age=31536000/
                );
                assert.match(
                    res.headers['cache-control'],
                    /immutable/
                );
            });
    });

    it('serves unversioned public assets with revalidation', function() {
        return request(app)
            .get('/public/example.js')
            .expect(200)
            .expect(
                'Cache-Control',
                'public, no-cache'
            );
    });

    it('returns 404 for an obsolete version namespace', function() {
        return request(app)
            .get('/public/vold/example.js')
            .expect(404);
    });

    it('returns 404 for a missing reserved static asset', function() {
        return request(app)
            .get('/public/does-not-exist.js')
            .expect(404);
    });

    it('applies the same boundary to node_modules', function() {
        return request(app)
            .get('/node_modules/v' + version + '/pkg/example.js')
            .expect(200)
            .expect(function(res) {
                assert.match(
                    res.headers['cache-control'],
                    /immutable/
                );
            });
    });

    it('keeps legacy Guppy assets available but revalidated', function() {
        return request(app)
            .get('/lib/guppy/icons/help.txt')
            .expect(200)
            .expect(
                'Cache-Control',
                'public, no-cache'
            );
    });
});
