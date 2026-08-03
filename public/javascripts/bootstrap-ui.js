"use strict";

var $ = require("jquery");

var tooltipInstalledClass =
    "xronos-bootstrap-tooltip-installed";

var dropdownInstalledClass =
    "xronos-bootstrap-dropdown-installed";

function elementsWithin(root, selector) {
    var scope =
        root
            ? $(root)
            : $(document);

    var matched =
        scope.is(selector)
            ? scope
            : scope.find(selector);

    return matched;
}

function installTooltips(root) {
    var matched =
        elementsWithin(
            root,
            '[data-toggle="tooltip"]'
        );

    var installedCount =
        0;

    matched.each(function() {
        var element =
            $(this);

        if (
            element.hasClass(
                tooltipInstalledClass
            )
        ) {
            return;
        }

        element.tooltip();
        element.addClass(
            tooltipInstalledClass
        );

        installedCount += 1;
    });

    return {
        matchedCount:
            matched.length,
        installedCount:
            installedCount
    };
}

function installDropdowns(root) {
    var matched =
        elementsWithin(
            root,
            ".dropdown-toggle"
        );

    var installedCount =
        0;

    matched.each(function() {
        var element =
            $(this);

        if (
            element.hasClass(
                dropdownInstalledClass
            )
        ) {
            return;
        }

        element.dropdown();
        element.addClass(
            dropdownInstalledClass
        );

        installedCount += 1;
    });

    return {
        matchedCount:
            matched.length,
        installedCount:
            installedCount
    };
}

function install(root) {
    var dropdowns =
        installDropdowns(root);

    var tooltips =
        installTooltips(root);

    return {
        dropdownsMatched:
            dropdowns.matchedCount,
        dropdownsInstalled:
            dropdowns.installedCount,
        tooltipsMatched:
            tooltips.matchedCount,
        tooltipsInstalled:
            tooltips.installedCount
    };
}

exports.install =
    install;

exports.installDropdowns =
    installDropdowns;

exports.installTooltips =
    installTooltips;

exports._test = {
    tooltipInstalledClass:
        tooltipInstalledClass,
    dropdownInstalledClass:
        dropdownInstalledClass
};
