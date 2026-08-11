"use strict";

var assert =
    require("assert");

var Module =
    require("module");

function createEnvironment() {
    var elements = [];
    var tooltipCalls = 0;
    var tooltipOptions = [];
    var dropdownCalls = 0;

    function addElement(options) {
        var element = {
            classes:
                {},
            attributes:
                {},
            children:
                []
        };

        (options.classes || []).forEach(
            function(name) {
                element.classes[name] =
                    true;
            }
        );

        Object.keys(
            options.attributes || {}
        ).forEach(function(name) {
            element.attributes[name] =
                options.attributes[name];
        });

        elements.push(element);

        return element;
    }

    function matches(element, selector) {
        if (
            !element ||
            !element.classes ||
            !element.attributes
        ) {
            return false;
        }

        if (selector === ".dropdown-toggle") {
            return !!element
                .classes[
                    "dropdown-toggle"
                ];
        }

        if (
            selector ===
            '[data-toggle="tooltip"]'
        ) {
            return (
                element.attributes[
                    "data-toggle"
                ] === "tooltip"
            );
        }

        return false;
    }

    function descendants(root) {
        var result = [];

        function visit(element) {
            (element.children || [])
                .forEach(function(child) {
                    result.push(child);
                    visit(child);
                });
        }

        if (root === documentRoot) {
            elements.forEach(
                function(element) {
                    if (!element.parent) {
                        result.push(element);
                        visit(element);
                    }
                }
            );
        } else {
            visit(root);
        }

        return result;
    }

    function Collection(items) {
        this.items =
            items || [];
        this.length =
            this.items.length;
    }

    Collection.prototype.is =
        function(selector) {
            return (
                this.items.length === 1 &&
                matches(
                    this.items[0],
                    selector
                )
            );
        };

    Collection.prototype.find =
        function(selector) {
            var found = [];

            this.items.forEach(
                function(root) {
                    descendants(root)
                        .forEach(
                            function(element) {
                                if (
                                    matches(
                                        element,
                                        selector
                                    )
                                ) {
                                    found.push(
                                        element
                                    );
                                }
                            }
                        );
                }
            );

            return new Collection(found);
        };

    Collection.prototype.each =
        function(callback) {
            this.items.forEach(
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

    Collection.prototype.hasClass =
        function(name) {
            return (
                this.items.length > 0 &&
                !!this.items[0]
                    .classes[name]
            );
        };

    Collection.prototype.addClass =
        function(name) {
            this.items.forEach(
                function(element) {
                    element.classes[name] =
                        true;
                }
            );

            return this;
        };

    Collection.prototype.tooltip =
        function(options) {
            tooltipCalls +=
                this.items.length;

            this.items.forEach(
                function() {
                    tooltipOptions.push(
                        options
                    );
                }
            );

            return this;
        };

    Collection.prototype.dropdown =
        function() {
            dropdownCalls +=
                this.items.length;

            return this;
        };

    var documentRoot = {
        children:
            []
    };

    function $(value) {
        if (value instanceof Collection) {
            return value;
        }

        if (
            value === documentRoot ||
            elements.indexOf(value) >= 0
        ) {
            return new Collection(
                [value]
            );
        }

        throw new Error(
            "Unexpected jQuery stub input."
        );
    }

    return {
        $:
            $,
        document:
            documentRoot,
        addElement:
            addElement,
        append:
            function(parent, child) {
                parent.children.push(
                    child
                );

                child.parent =
                    parent;
            },
        tooltipCalls:
            function() {
                return tooltipCalls;
            },
        tooltipOptions:
            function() {
                return tooltipOptions;
            },
        dropdownCalls:
            function() {
                return dropdownCalls;
            }
    };
}

function loadBootstrapUi(fakeJquery) {
    var originalLoad =
        Module._load;

    var modulePath =
        require.resolve(
            "../public/javascripts/bootstrap-ui"
        );

    delete require.cache[modulePath];

    Module._load =
        function(request, parent, isMain) {
            if (request === "jquery") {
                return fakeJquery;
            }

            return originalLoad.call(
                this,
                request,
                parent,
                isMain
            );
        };

    try {
        return require(modulePath);
    } finally {
        Module._load =
            originalLoad;
    }
}

describe(
    "Bootstrap UI installer",
    function() {
        it("installs existing tooltips and dropdowns", function() {
            var environment =
                createEnvironment();

            environment.addElement({
                attributes: {
                    "data-toggle":
                        "tooltip"
                }
            });

            environment.addElement({
                classes: [
                    "dropdown-toggle"
                ]
            });

            var bootstrapUi =
                loadBootstrapUi(
                    environment.$
                );

            var result =
                bootstrapUi.install(
                    environment.document
                );

            assert.deepStrictEqual(
                result,
                {
                    dropdownsMatched:
                        1,
                    dropdownsInstalled:
                        1,
                    tooltipsMatched:
                        1,
                    tooltipsInstalled:
                        1
                }
            );

            assert.strictEqual(
                environment
                    .tooltipCalls(),
                1
            );

            assert.deepStrictEqual(
                environment
                    .tooltipOptions(),
                [
                    {
                        animation:
                            false
                    }
                ]
            );

            assert.strictEqual(
                environment
                    .dropdownCalls(),
                1
            );
        });

        it("does not reinstall initialized elements", function() {
            var environment =
                createEnvironment();

            environment.addElement({
                attributes: {
                    "data-toggle":
                        "tooltip"
                }
            });

            environment.addElement({
                classes: [
                    "dropdown-toggle"
                ]
            });

            var bootstrapUi =
                loadBootstrapUi(
                    environment.$
                );

            bootstrapUi.install(
                environment.document
            );

            var second =
                bootstrapUi.install(
                    environment.document
                );

            assert.strictEqual(
                second.dropdownsInstalled,
                0
            );

            assert.strictEqual(
                second.tooltipsInstalled,
                0
            );

            assert.strictEqual(
                environment
                    .tooltipCalls(),
                1
            );

            assert.strictEqual(
                environment
                    .dropdownCalls(),
                1
            );
        });

        it("installs elements created after the first scan", function() {
            var environment =
                createEnvironment();

            var lateRoot =
                environment.addElement({});

            var bootstrapUi =
                loadBootstrapUi(
                    environment.$
                );

            bootstrapUi.install(
                environment.document
            );

            var tooltip =
                environment.addElement({
                    attributes: {
                        "data-toggle":
                            "tooltip"
                    }
                });

            var dropdown =
                environment.addElement({
                    classes: [
                        "dropdown-toggle"
                    ]
                });

            environment.append(
                lateRoot,
                tooltip
            );

            environment.append(
                lateRoot,
                dropdown
            );

            var result =
                bootstrapUi.install(
                    lateRoot
                );

            assert.strictEqual(
                result.dropdownsMatched,
                1
            );

            assert.strictEqual(
                result.dropdownsInstalled,
                1
            );

            assert.strictEqual(
                result.tooltipsMatched,
                1
            );

            assert.strictEqual(
                result.tooltipsInstalled,
                1
            );
        });

        it("supports a matching root element", function() {
            var environment =
                createEnvironment();

            var tooltip =
                environment.addElement({
                    attributes: {
                        "data-toggle":
                            "tooltip"
                    }
                });

            var bootstrapUi =
                loadBootstrapUi(
                    environment.$
                );

            var result =
                bootstrapUi
                    .installTooltips(
                        tooltip
                    );

            assert.strictEqual(
                result.matchedCount,
                1
            );

            assert.strictEqual(
                result.installedCount,
                1
            );
        });
    }
);
