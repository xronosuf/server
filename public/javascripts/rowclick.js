var $ = require('jquery');

var CLICKABLE_ROW_SELECTOR =
    '.table tr[data-href]';

var INSTALLED_CLASS =
    'xronos-clickable-row-installed';

var EVENT_NAMESPACE =
    '.xronosClickableRow';

function installClickableRow(row) {
    var element = $(row);

    if (element.hasClass(INSTALLED_CLASS)) {
        return false;
    }

    element
        .addClass(INSTALLED_CLASS)
        .css('cursor', 'pointer')
        .off(EVENT_NAMESPACE)
        .on(
            'mouseenter' + EVENT_NAMESPACE,
            function() {
                $(this).addClass('active');
            }
        )
        .on(
            'mouseleave' + EVENT_NAMESPACE,
            function() {
                $(this).removeClass('active');
            }
        )
        .on(
            'click' + EVENT_NAMESPACE,
            function() {
                document.location =
                    $(this).attr('data-href');
            }
        );

    return true;
}

// Transforms Bootstrap table rows carrying data-href into clickable rows.
// Repeated calls are safe and only initialize rows not previously installed.
exports.addClickableTableRows = function(root) {
    var scope =
        root === undefined
            ? $(document)
            : $(root);
    var rows =
        scope.is(CLICKABLE_ROW_SELECTOR)
            ? scope
            : scope.find(
                CLICKABLE_ROW_SELECTOR
            );
    var installedCount = 0;

    rows.each(function() {
        if (installClickableRow(this)) {
            installedCount += 1;
        }
    });

    return {
        matchedCount: rows.length,
        installedCount: installedCount
    };
};

exports._test = {
    selector: CLICKABLE_ROW_SELECTOR,
    installedClass: INSTALLED_CLASS,
    eventNamespace: EVENT_NAMESPACE
};
