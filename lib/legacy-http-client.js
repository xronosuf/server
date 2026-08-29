'use strict';

var http = require('http');
var https = require('https');
var crypto = require('crypto');
var querystring = require('querystring');
var URL = require('url').URL;

function percentEncode(value) {
    return encodeURIComponent(String(value))
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');
}

function normalizedParameters(parameters) {
    return Object.keys(parameters)
        .sort()
        .map(function(key) {
            return percentEncode(key) + '=' + percentEncode(parameters[key]);
        })
        .join('&');
}

function oauthSignature(method, url, parameters, consumerSecret, signatureMethod) {
    var baseUrl = new URL(url);
    var normalizedUrl =
        baseUrl.protocol + '//' + baseUrl.host + baseUrl.pathname;

    var baseString = [
        method.toUpperCase(),
        percentEncode(normalizedUrl),
        percentEncode(normalizedParameters(parameters))
    ].join('&');

    var signingKey = percentEncode(consumerSecret) + '&';

    if (signatureMethod === 'HMAC-SHA1') {
        return crypto
            .createHmac('sha1', signingKey)
            .update(baseString)
            .digest('base64');
    }

    if (signatureMethod === 'HMAC-SHA256') {
        return crypto
            .createHmac('sha256', signingKey)
            .update(baseString)
            .digest('base64');
    }

    if (signatureMethod === 'PLAINTEXT') {
        return signingKey;
    }

    throw new Error(
        'Unsupported OAuth signature method: ' + signatureMethod
    );
}

function oauthAuthorizationHeader(options) {
    var method = options.method || 'POST';
    var body = options.body || '';
    var signatureMethod = options.signatureMethod || 'HMAC-SHA1';
    var timestamp = options.timestamp || Math.floor(Date.now() / 1000);
    var nonce = options.nonce || crypto.randomBytes(16).toString('hex');

    var oauth = {
        oauth_callback: options.callback || 'about:blank',
        oauth_consumer_key: options.consumerKey,
        oauth_nonce: nonce,
        oauth_signature_method: signatureMethod,
        oauth_timestamp: timestamp,
        oauth_version: '1.0'
    };

    if (options.bodyHash) {
        oauth.oauth_body_hash = crypto
            .createHash('sha1')
            .update(body)
            .digest('base64');
    }

    var target = new URL(options.url);
    target.searchParams.forEach(function(value, key) {
        oauth[key] = value;
    });

    oauth.oauth_signature = oauthSignature(
        method,
        options.url,
        oauth,
        options.consumerSecret,
        signatureMethod
    );

    return 'OAuth ' + Object.keys(oauth)
        .filter(function(key) {
            return key.indexOf('oauth_') === 0;
        })
        .sort()
        .map(function(key) {
            return percentEncode(key) + '="' + percentEncode(oauth[key]) + '"';
        })
        .join(', ');
}

function post(options, callback) {
    var target = new URL(options.url);
    var transport = target.protocol === 'https:' ? https : http;
    var body = options.body || '';
    var headers = Object.assign({}, options.headers || {});

    headers['Content-Length'] = Buffer.byteLength(body);

    var request = transport.request(
        {
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || undefined,
            path: target.pathname + target.search,
            method: 'POST',
            headers: headers
        },
        function(response) {
            var chunks = [];

            response.on('data', function(chunk) {
                chunks.push(chunk);
            });

            response.on('end', function() {
                callback(
                    null,
                    response,
                    Buffer.concat(chunks).toString('utf8')
                );
            });
        }
    );

    request.on('error', function(err) {
        callback(err);
    });

    if (options.timeout) {
        request.setTimeout(options.timeout, function() {
            request.destroy(new Error('HTTP request timed out'));
        });
    }

    request.end(body);
}

function postForm(url, form, options, callback) {
    options = options || {};

    var body = querystring.stringify(form || {});
    var headers = Object.assign(
        {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        options.headers || {}
    );

    post(
        {
            url: url,
            body: body,
            headers: headers,
            timeout: options.timeout
        },
        callback
    );
}

function postJsonBasic(url, value, username, password, headers, callback) {
    var body = JSON.stringify(value);
    var mergedHeaders = Object.assign(
        {
            'Content-Type': 'application/json',
            'Authorization':
                'Basic ' + Buffer.from(username + ':' + password).toString('base64')
        },
        headers || {}
    );

    post(
        {
            url: url,
            body: body,
            headers: mergedHeaders
        },
        callback
    );
}

function postOAuth1Xml(options, callback) {
    var headers = Object.assign(
        {
            'Content-Type': 'application/xml'
        },
        options.headers || {}
    );

    headers.Authorization = oauthAuthorizationHeader({
        method: 'POST',
        url: options.url,
        body: options.body,
        bodyHash: true,
        callback: options.callback || 'about:blank',
        consumerKey: options.consumerKey,
        consumerSecret: options.consumerSecret,
        signatureMethod: options.signatureMethod,
        timestamp: options.timestamp,
        nonce: options.nonce
    });

    post(
        {
            url: options.url,
            body: options.body,
            headers: headers,
            timeout: options.timeout
        },
        callback
    );
}

exports.percentEncode = percentEncode;
exports.oauthAuthorizationHeader = oauthAuthorizationHeader;
exports.post = post;
exports.postForm = postForm;
exports.postJsonBasic = postJsonBasic;
exports.postOAuth1Xml = postOAuth1Xml;
