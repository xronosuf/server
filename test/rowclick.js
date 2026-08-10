"use strict";

var assert = require("assert");
var Module = require("module");

describe(
    "clickable table rows",
    function() {
        var originalLoad;
        var fakeDocument;
        var rows;
        var $;
        var rowclick;

        function createRow(attributes) {
            return {
                attributes:
                    attributes || {},
                classes: {},
                styles: {},
                handlers: {}
            };
        }

        function Wrapper(elements) {
            this.elements =
                elements || [];
            this.length =
                this.elements.length;
        }

        Wrapper.prototype.is =
            function(selector) {
                return (
                    selector ===
                        ".table tr[data-href]" &&
                    this.length === 1 &&
                    this.elements[0] &&
                    this.elements[0].attributes &&
                    this.elements[0]
                        .attributes["data-href"] !==
                        undefined
                );
            };

        Wrapper.prototype.find =
            function(selector) {
                if (
                    selector !==
                    ".table tr[data-href]"
                ) {
                    return new Wrapper([]);
                }

                return new Wrapper(
                    rows.filter(function(row) {
                        return (
                            row.attributes[
                                "data-href"
                            ] !== undefined
                        );
                    })
                );
            };

        Wrapper.prototype.each =
            function(callback) {
                this.elements.forEach(
                    function(element, index) {
                        callback.call(
                            element,
                            index,
                            element
                        );
                    }
                );

                return this;
            };

        Wrapper.prototype.hasClass =
            function(className) {
                return (
                    this.length > 0 &&
                    this.elements[0]
                        .classes[className] ===
                        true
                );
            };

        Wrapper.prototype.addClass =
            function(className) {
                this.elements.forEach(
                    function(element) {
                        element.classes[
                            className
                        ] = true;
                    }
                );

                return this;
            };

        Wrapper.prototype.removeClass =
            function(className) {
                this.elements.forEach(
                    function(element) {
                        delete element.classes[
                            className
                        ];
                    }
                );

                return this;
            };

        Wrapper.prototype.css =
            function(name, value) {
                if (value === undefined) {
                    return this.length > 0
                        ? this.elements[0]
                            .styles[name]
                        : undefined;
                }

                this.elements.forEach(
                    function(element) {
                        element.styles[name] =
                            value;
                    }
                );

                return this;
            };

        Wrapper.prototype.off =
            function(namespace) {
                this.elements.forEach(
                    function(element) {
                        Object.keys(
                            element.handlers
                        ).forEach(
                            function(eventName) {
                                if (
                                    eventName.endsWith(
                                        namespace
                                    )
                                ) {
                                    delete element
                                        .handlers[
                                            eventName
                                        ];
                                }
                            }
                        );
                    }
                );

                return this;
            };

        Wrapper.prototype.on =
            function(eventName, handler) {
                this.elements.forEach(
                    function(element) {
                        element.handlers[
                            eventName
                        ] = handler;
                    }
                );

                return this;
            };

        Wrapper.prototype.attr =
            function(name) {
                return this.length > 0
                    ? this.elements[0]
                        .attributes[name]
                    : undefined;
            };

        beforeEach(function() {
            rows = [
                createRow({
                    id: "first",
                    "data-href": "/first"
                }),
                createRow({
                    id: "second"
                })
            ];

            fakeDocument = {
                location: "/current"
            };

            global.document =
                fakeDocument;

            $ = function(value) {
                if (value === fakeDocument) {
                    return new Wrapper(
                        [fakeDocument]
                    );
                }

                if (
                    value &&
                    value.attributes
                ) {
                    return new Wrapper(
                        [value]
                    );
                }

                return new Wrapper([]);
            };

            originalLoad =
                Module._load;

            Module._load =
                function(
                    request,
                    parent,
                    isMain
                ) {
                    if (request === "jquery") {
                        return $;
                    }

                    return originalLoad.call(
                        this,
                        request,
                        parent,
                        isMain
                    );
                };

            delete require.cache[
                require.resolve(
                    "../public/javascripts/rowclick"
                )
            ];

            rowclick = require(
                "../public/javascripts/rowclick"
            );
        });

        afterEach(function() {
            Module._load =
                originalLoad;

            delete require.cache[
                require.resolve(
                    "../public/javascripts/rowclick"
                )
            ];

            delete global.document;
        });

        it("installs only rows carrying data-href", function() {
            var result =
                rowclick
                    .addClickableTableRows();

            assert.deepStrictEqual(
                result,
                {
                    matchedCount: 1,
                    installedCount: 1
                }
            );

            assert.strictEqual(
                rows[0].classes[
                    rowclick._test
                        .installedClass
                ],
                true
            );

            assert.strictEqual(
                rows[1].classes[
                    rowclick._test
                        .installedClass
                ],
                undefined
            );

            assert.strictEqual(
                rows[0].styles.cursor,
                "pointer"
            );
        });

        it("does not reinstall an initialized row", function() {
            var first =
                rowclick
                    .addClickableTableRows();
            var second =
                rowclick
                    .addClickableTableRows();

            assert.strictEqual(
                first.installedCount,
                1
            );

            assert.strictEqual(
                second.matchedCount,
                1
            );

            assert.strictEqual(
                second.installedCount,
                0
            );
        });

        it("installs a row inserted after the first scan", function() {
            rowclick
                .addClickableTableRows();

            var late =
                createRow({
                    id: "late",
                    "data-href": "/late"
                });

            rows.push(late);

            var result =
                rowclick
                    .addClickableTableRows();

            assert.deepStrictEqual(
                result,
                {
                    matchedCount: 2,
                    installedCount: 1
                }
            );

            assert.strictEqual(
                late.classes[
                    rowclick._test
                        .installedClass
                ],
                true
            );
        });

        it("installs one namespaced handler per event", function() {
            rowclick
                .addClickableTableRows();

            rowclick
                .addClickableTableRows();

            assert.deepStrictEqual(
                Object.keys(
                    rows[0].handlers
                ).sort(),
                [
                    "click.xronosClickableRow",
                    "mouseenter.xronosClickableRow",
                    "mouseleave.xronosClickableRow"
                ]
            );
        });

        it("preserves hover and click behavior", function() {
            rowclick
                .addClickableTableRows();

            rows[0].handlers[
                "mouseenter.xronosClickableRow"
            ].call(rows[0]);

            assert.strictEqual(
                rows[0].classes.active,
                true
            );

            rows[0].handlers[
                "mouseleave.xronosClickableRow"
            ].call(rows[0]);

            assert.strictEqual(
                rows[0].classes.active,
                undefined
            );

            rows[0].handlers[
                "click.xronosClickableRow"
            ].call(rows[0]);

            assert.strictEqual(
                fakeDocument.location,
                "/first"
            );
        });
    }
);
