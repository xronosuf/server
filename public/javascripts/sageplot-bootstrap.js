'use strict';

var installed = false;
var prepared = false;
var plots = {};
var plotOrder = [];
var helperInstalled = false;

var plotScriptSelector =
    'script[type="text/x-sage-plot"]';

var syntheticPrefix =
    '_xronos_sageplot_svg(('; 

var helperSource = [
    'def _xronos_sageplot_svg(_xronos_graphics, _xronos_plot_id=None):',
    '    import os as _xronos_os',
    '    import tempfile as _xronos_tempfile',
    '    _xronos_fd, _xronos_path = _xronos_tempfile.mkstemp(suffix=".svg")',
    '    _xronos_os.close(_xronos_fd)',
    '    try:',
    '        _xronos_graphics.save(_xronos_path)',
    '        with open(_xronos_path, "r", encoding="utf-8") as _xronos_file:',
    '            return _xronos_file.read()',
    '    finally:',
    '        try:',
    '            _xronos_os.remove(_xronos_path)',
    '        except Exception:',
    '            pass'
].join('\n');

function pad(value, width) {
    var result = String(value);

    while (result.length < width) {
        result = '0' + result;
    }

    return result;
}

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

function helperScriptBefore(firstPlotHolder) {
    if (helperInstalled) {
        return;
    }

    var helper = document.createElement('script');
    helper.type = 'text/sagemath';
    helper.setAttribute(
        'data-xronos-sageplot-helper',
        'true'
    );
    helper.textContent = helperSource;

    if (
        firstPlotHolder &&
        firstPlotHolder.parentNode
    ) {
        firstPlotHolder.parentNode.insertBefore(
            helper,
            firstPlotHolder
        );
    } else {
        var activity =
            document.querySelector('main.activity') ||
            document.body;

        activity.insertBefore(
            helper,
            activity.firstChild
        );
    }

    helperInstalled = true;
}

function buildSyntheticExpression(
    authoredExpression,
    plotId
) {
    return (
        syntheticPrefix +
        authoredExpression +
        '), ' +
        JSON.stringify(plotId) +
        ')'
    );
}

function preparePlotSources() {
    if (prepared) {
        return plotOrder.length;
    }

    var scripts =
        Array.prototype.slice.call(
            document.querySelectorAll(
                plotScriptSelector
            )
        );

    if (scripts.length === 0) {
        prepared = true;
        return 0;
    }

    var firstHolder =
        closestPlotHolder(scripts[0]);

    helperScriptBefore(firstHolder);

    scripts.forEach(function(script, index) {
        if (
            script.getAttribute(
                'data-xronos-sageplot-prepared'
            ) === 'true'
        ) {
            return;
        }

        var holder =
            closestPlotHolder(script);

        if (!holder) {
            return;
        }

        var plotId =
            'sage-plot-' +
            pad(index + 1, 4);

        var authoredExpression =
            script.textContent || '';

        var syntheticExpression =
            buildSyntheticExpression(
                authoredExpression,
                plotId
            );

        var source =
            document.createElement('span');

        source.className =
            'mathjax-inline ' +
            'xronos-sageplot-canonical-source';

        source.setAttribute(
            'aria-hidden',
            'true'
        );

        source.style.display = 'none';
        source.textContent =
            '\\sagestr{' +
            syntheticExpression +
            '}';

        holder.setAttribute(
            'data-xronos-sageplot-id',
            plotId
        );

        script.setAttribute(
            'data-xronos-sageplot-prepared',
            'true'
        );

        holder.appendChild(source);

        plots[syntheticExpression] = {
            id: plotId,
            holder: holder,
            source: source,
            authoredExpression:
                authoredExpression,
            renders: 0,
            failures: 0
        };

        plotOrder.push(
            syntheticExpression
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

    plot.holder.insertBefore(
        wrapper,
        plot.source
    );

    plot.renders += 1;
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

    plot.holder.insertBefore(
        wrapper,
        plot.source
    );

    plot.failures += 1;
}

function matchingPlot(traceEntry) {
    if (
        !traceEntry ||
        typeof traceEntry.expression !==
            'string'
    ) {
        return null;
    }

    return plots[
        traceEntry.expression
    ] || null;
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
            .resolveMathJaxSageCall !==
            'function'
    ) {
        throw new Error(
            'Sage plot support requires the canonical Sage runtime.'
        );
    }

    var originalCapture =
        sagemath
            .captureInitialSagePageManifestSnapshot;

    var originalResolve =
        sagemath.resolveMathJaxSageCall;

    sagemath.captureInitialSagePageManifestSnapshot =
        function() {
            preparePlotSources();

            return originalCapture.apply(
                sagemath,
                arguments
            );
        };

    sagemath.resolveMathJaxSageCall =
        function(traceEntry, requestedCode) {
            var plot =
                matchingPlot(traceEntry);

            var result =
                originalResolve.apply(
                    sagemath,
                    arguments
                );

            if (!plot) {
                return result;
            }

            return Promise.resolve(result).then(
                function(svgText) {
                    try {
                        renderSvg(
                            plot,
                            svgText
                        );
                    } catch (err) {
                        renderError(
                            plot,
                            err,
                            sagemath
                        );

                        throw err;
                    }

                    /*
                     * The canonical source is intentionally hidden. MathJax
                     * still needs a scalar result so its normal lifecycle can
                     * settle, but the visible result belongs in the authored
                     * sage-plot placeholder.
                     */
                    return '';
                },
                function(err) {
                    renderError(
                        plot,
                        err,
                        sagemath
                    );

                    throw err;
                }
            );
        };

    window.xronosInspectSagePlots =
        function() {
            var result = {
                prepared: prepared,
                helperInstalled:
                    helperInstalled,
                count: plotOrder.length,
                plots: plotOrder.map(
                    function(expression) {
                        var plot =
                            plots[expression];

                        return {
                            id: plot.id,
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
                                    )
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
