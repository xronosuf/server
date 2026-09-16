'use strict';

var installed = false;
var prepared = false;
var plots = {};
var plotOrder = [];

var plotScriptSelector =
    'script[type="text/x-sage-plot"]';

function closestPlotHolder(script) {
    var current = script;

    while (current) {
        if (
            current.nodeType === 1 &&
            (' ' + (current.className || '') + ' ')
                .indexOf(' sage-plot ') !== -1
        ) {
            return current;
        }

        current = current.parentNode;
    }

    return null;
}

function preparePlotSources(manifest) {
    if (prepared) {
        return plotOrder.length;
    }

    var scripts =
        Array.prototype.slice.call(
            document.querySelectorAll(
                plotScriptSelector
            )
        );

    var entries =
        manifest && Array.isArray(manifest.entries)
            ? manifest.entries.filter(
                function(entry) {
                    return entry.kind === 'plot';
                }
            )
            : [];

    if (scripts.length !== entries.length) {
        throw new Error(
            'Sage plot manifest/DOM count mismatch: ' +
            entries.length + ' manifest plot(s), ' +
            scripts.length + ' DOM plot marker(s).'
        );
    }

    scripts.forEach(function(script, index) {
        var entry = entries[index];
        var holder = closestPlotHolder(script);

        if (!holder) {
            throw new Error(
                'Sage plot marker has no .sage-plot holder.'
            );
        }

        holder.setAttribute(
            'data-xronos-sageplot-id',
            entry.stableId
        );

        script.setAttribute(
            'data-xronos-sageplot-prepared',
            'true'
        );

        plots[entry.stableId] = {
            id: entry.stableId,
            holder: holder,
            script: script,
            authoredExpression:
                entry.expression,
            manifestOrder:
                entry.order,
            renders: 0,
            failures: 0,
            lastMime: null,
            lastGenerationId: null,
            lastGenerationSeed: null,
            lastError: null
        };

        plotOrder.push(
            entry.stableId
        );
    });

    prepared = true;

    return plotOrder.length;
}

function removeRenderedPlot(plot) {
    if (!plot || !plot.holder) {
        return;
    }

    var oldNodes =
        plot.holder.querySelectorAll(
            '.xronos-sageplot-rendered, ' +
            '.xronos-sageplot-error'
        );

    Array.prototype.forEach.call(
        oldNodes,
        function(node) {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        }
    );
}

function unsafeUrl(value) {
    return /^\s*javascript:/i.test(
        String(value || '')
    );
}

function sanitizeSvg(svgText) {
    var text = String(svgText || '');
    var svgIndex = text.indexOf('<svg');

    if (svgIndex > 0) {
        text = text.slice(svgIndex);
    }

    var parser = new window.DOMParser();
    var parsed = parser.parseFromString(
        text,
        'image/svg+xml'
    );

    if (
        !parsed ||
        parsed.getElementsByTagName(
            'parsererror'
        ).length > 0 ||
        !parsed.documentElement ||
        String(
            parsed.documentElement.nodeName
        ).toLowerCase() !== 'svg'
    ) {
        throw {
            ename: 'XronosSageDisplayError',
            evalue:
                'The Sage plot result was not valid SVG.'
        };
    }

    var forbidden = [
        'script',
        'foreignObject',
        'iframe',
        'object',
        'embed'
    ];

    forbidden.forEach(function(tag) {
        var nodes =
            parsed.getElementsByTagName(tag);

        while (nodes.length > 0) {
            var node = nodes[0];

            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        }
    });

    var all =
        parsed.getElementsByTagName('*');

    Array.prototype.forEach.call(
        all,
        function(node) {
            var attributes =
                Array.prototype.slice.call(
                    node.attributes || []
                );

            attributes.forEach(
                function(attribute) {
                    var name =
                        String(attribute.name || '');

                    var value =
                        attribute.value;

                    if (
                        /^on/i.test(name) ||
                        (
                            /^(?:href|xlink:href)$/i
                                .test(name) &&
                            unsafeUrl(value)
                        )
                    ) {
                        node.removeAttribute(name);
                    }
                }
            );
        }
    );

    return document.importNode(
        parsed.documentElement,
        true
    );
}

function renderSvg(plot, svgText) {
    removeRenderedPlot(plot);

    var svg = sanitizeSvg(svgText);
    var wrapper =
        document.createElement('span');

    wrapper.className =
        'xronos-sageplot-rendered';

    svg.classList.add(
        'xronos-sageplot-svg'
    );

    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';

    wrapper.appendChild(svg);

    plot.holder.appendChild(
        wrapper
    );

    plot.renders += 1;
    plot.lastError = null;
}

function renderError(plot, err, sagemath) {
    removeRenderedPlot(plot);

    var wrapper =
        document.createElement('span');

    wrapper.className =
        'xronos-sageplot-error';

    if (
        sagemath &&
        typeof sagemath.buildSageErrorElement ===
            'function'
    ) {
        wrapper.appendChild(
            sagemath.buildSageErrorElement(
                err
            )
        );
    } else {
        wrapper.setAttribute(
            'role',
            'alert'
        );
        wrapper.appendChild(
            document.createTextNode(
                'The Sage plot could not be displayed.'
            )
        );
    }

    plot.holder.appendChild(
        wrapper
    );

    plot.failures += 1;
    plot.lastError = {
        ename:
            err && (err.ename || err.name)
                ? err.ename || err.name
                : '',
        evalue:
            err && (err.evalue || err.message)
                ? err.evalue || err.message
                : String(err || '')
    };
}

function install(sagemath) {
    if (installed) {
        return;
    }

    installed = true;

    if (
        !sagemath ||
        typeof sagemath
            .captureInitialSagePageManifestSnapshot !==
            'function' ||
        typeof sagemath
            .registerSagePlotRenderer !==
            'function' ||
        typeof sagemath
            .ensureInitialCanonicalPageSage !==
            'function'
    ) {
        throw new Error(
            'Sage plot support requires the first-class canonical Sage plot runtime.'
        );
    }

    sagemath.registerSagePlotRenderer(
        function(entry, payload, context) {
            var plot =
                plots[entry.stableId];

            if (!plot) {
                throw {
                    ename: 'XronosSageDisplayError',
                    evalue:
                        'No DOM plot holder exists for ' +
                        entry.stableId + '.'
                };
            }

            plot.lastGenerationId =
                context &&
                context.generationId !== undefined
                    ? context.generationId
                    : null;

            plot.lastGenerationSeed =
                context &&
                context.generationSeed !== undefined
                    ? context.generationSeed
                    : null;

            plot.lastMime =
                payload && payload.mime
                    ? payload.mime
                    : null;

            if (!payload || !payload.ok) {
                renderError(
                    plot,
                    payload && payload.error
                        ? payload.error
                        : {
                            ename:
                                'XronosSagePlotError',
                            evalue:
                                'The canonical Sage plot result failed.'
                        },
                    sagemath
                );

                return;
            }

            if (
                payload.mime !==
                'image/svg+xml'
            ) {
                var mimeError = {
                    ename:
                        'XronosSageDisplayError',
                    evalue:
                        'Unsupported Sage plot MIME type: ' +
                        String(payload.mime || '')
                };

                renderError(
                    plot,
                    mimeError,
                    sagemath
                );

                throw mimeError;
            }

            try {
                renderSvg(
                    plot,
                    payload.data
                );
            } catch (err) {
                renderError(
                    plot,
                    err,
                    sagemath
                );

                throw err;
            }
        }
    );

    var originalCapture =
        sagemath
            .captureInitialSagePageManifestSnapshot;

    sagemath.captureInitialSagePageManifestSnapshot =
        function() {
            var manifest =
                originalCapture.apply(
                    sagemath,
                    arguments
                );

            preparePlotSources(
                manifest
            );

            if (plotOrder.length > 0) {
                sagemath
                    .ensureInitialCanonicalPageSage()
                    .catch(function() {
                        /*
                         * Canonical Sage owns request/reporting errors. The
                         * plot renderer handles per-plot display failures.
                         */
                        return null;
                    });
            }

            return manifest;
        };

    window.xronosInspectSagePlots =
        function() {
            var result = {
                prepared: prepared,
                transport:
                    'first-class-canonical-plot',
                count: plotOrder.length,
                plots: plotOrder.map(
                    function(stableId) {
                        var plot =
                            plots[stableId];

                        return {
                            stableId:
                                plot.id,
                            manifestOrder:
                                plot.manifestOrder,
                            expression:
                                plot.authoredExpression,
                            renders:
                                plot.renders,
                            failures:
                                plot.failures,
                            hasSvg:
                                !!plot.holder
                                    .querySelector(
                                        '.xronos-sageplot-svg'
                                    ),
                            lastMime:
                                plot.lastMime,
                            lastGenerationId:
                                plot.lastGenerationId,
                            lastGenerationSeed:
                                plot.lastGenerationSeed,
                            lastError:
                                plot.lastError
                        };
                    }
                )
            };

            console.log(result);
            return result;
        };
}

exports.install = install;
exports.preparePlotSources =
    preparePlotSources;
