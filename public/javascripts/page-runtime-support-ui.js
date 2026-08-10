"use strict";

/*
 * Student-facing presentation for page-runtime support policy.
 *
 * This module does not classify failures, mutate runtime state, or perform
 * Sage computation itself. It renders the already-classified primary issue
 * and delegates Sage retry to the existing page retry control.
 */

function presentationForIssue(issue) {
    if (!issue) {
        return null;
    }

    var presentation = {
        severity: "danger",
        title: "This page needs attention",
        message:
            "Part of this activity did not finish loading correctly.",
        recovery:
            "Reload the page. If the problem continues, report it.",
        showSageRetry: false,
        showHardReloadHelp: false
    };

    switch (issue.recoveryAction) {
    case "keep-open-until-reconnected":
        presentation.severity = "warning";
        presentation.title =
            "Your work is not currently syncing";
        presentation.message =
            "Xronos lost its connection to the server.";
        presentation.recovery =
            "Keep this page open while Xronos reconnects. " +
            "Do not reload while you may have unsaved work.";
        break;

    case "keep-open-until-save-safe":
        presentation.severity = "warning";
        presentation.title =
            "Your work may not be saved yet";
        presentation.message =
            "Xronos could not safely synchronize the current page state.";
        presentation.recovery =
            "Keep this page open until saving recovers. " +
            "Do not reload while your work may still be unsaved.";
        break;

    case "retry-then-hard-reload":
        presentation.title =
            "Some computations did not load";
        presentation.message =
            "One or more Sage computations could not be completed.";
        presentation.recovery =
            "Try the computations again. If they still fail, " +
            "hard reload the page.";
        presentation.showSageRetry = true;
        presentation.showHardReloadHelp = true;
        break;

    case "hard-reload":
        presentation.showHardReloadHelp = true;

        if (issue.code === "XR-MATHJAX-INITIAL-101") {
            presentation.title =
                "Mathematical content failed to render";
            presentation.message =
                "Some mathematical content on this page could not be " +
                "rendered correctly, so answer checking may be unavailable.";
        } else if (
            issue.code === "XR-ANSWER-INITIAL-101"
        ) {
            presentation.title =
                "Answer boxes did not finish loading";
            presentation.message =
                "Some answer boxes may not be connected correctly.";
        } else if (
            issue.code === "XR-ACTIVITY-INITIAL-101"
        ) {
            presentation.title =
                "This activity did not finish loading";
            presentation.message =
                "Part of the activity initialization failed.";
        }

        presentation.recovery =
            "Hard reload the page. This is different from an ordinary Refresh.";
        break;
    }

    return presentation;
}


function findDestination($) {
    var destination =
        $("main.activity").first();

    if (destination.length === 0) {
        destination =
            $("#page-content").first();
    }

    if (destination.length === 0) {
        destination =
            $(".main-inhoud").first();
    }

    if (destination.length === 0) {
        destination =
            $("body");
    }

    return destination;
}


function findExistingSageRetry($) {
    var buttons =
        $(".xronos-sage-page-retry");

    var visible =
        buttons.filter(":visible").first();

    if (visible.length > 0) {
        return visible;
    }

    return buttons.first();
}


function showReportModal($, issue) {
    var existing =
        $("#xronos-runtime-support-report-modal");

    if (existing.length > 0) {
        existing.remove();
    }

    var modal =
        $("<div/>", {
            id:
                "xronos-runtime-support-report-modal",
            "class":
                "modal fade",
            tabindex:
                "-1",
            role:
                "dialog",
            "aria-labelledby":
                "xronos-runtime-support-report-title"
        });

    var dialog =
        $("<div/>", {
            "class":
                "modal-dialog",
            role:
                "document"
        });

    var content =
        $("<div/>", {
            "class":
                "modal-content"
        });

    var header =
        $("<div/>", {
            "class":
                "modal-header"
        });

    var closeButton =
        $("<button/>", {
            type:
                "button",
            "class":
                "close",
            "data-dismiss":
                "modal",
            "aria-label":
                "Close"
        }).append(
            $("<span/>", {
                "aria-hidden":
                    "true"
            }).html("&times;")
        );

    var title =
        $("<h4/>", {
            id:
                "xronos-runtime-support-report-title",
            "class":
                "modal-title"
        }).text(
            "Report this problem"
        );

    var body =
        $("<div/>", {
            "class":
                "modal-body"
        });

    body.append(
        $("<p/>").text(
            "If this problem continues, contact your instructor or course support."
        )
    );

    body.append(
        $("<p/>").append(
            document.createTextNode(
                "Include this Xronos support code: "
            ),
            $("<code/>").text(
                issue && issue.code
                    ? issue.code
                    : "XR-UNKNOWN"
            )
        )
    );

    var footer =
        $("<div/>", {
            "class":
                "modal-footer"
        }).append(
            $("<button/>", {
                type:
                    "button",
                "class":
                    "btn btn-default",
                "data-dismiss":
                    "modal"
            }).text(
                "Close"
            )
        );

    header.append(closeButton);
    header.append(title);

    content.append(header);
    content.append(body);
    content.append(footer);

    dialog.append(content);
    modal.append(dialog);

    $("body").prepend(modal);

    modal.on(
        "hidden.bs.modal",
        function() {
            modal.remove();
        }
    );

    modal.modal("show");
}


function hardReloadHelpText() {
    return (
        "Use your browser's hard reload rather than an ordinary Refresh. " +
        "On most Windows/Linux browsers use Ctrl+Shift+R; " +
        "on most Mac browsers use Cmd+Shift+R."
    );
}


function install(pageRuntime, $) {
    if (
        !pageRuntime ||
        typeof pageRuntime.onSupportChange !==
            "function" ||
        typeof $ !== "function"
    ) {
        return false;
    }

    var banner = null;
    var currentKey = null;

    function removeBanner() {
        if (banner) {
            banner.remove();
            banner = null;
        }

        currentKey = null;
    }

    function render(support) {
        var issue =
            support &&
            support.primaryIssue
                ? support.primaryIssue
                : null;

        if (!issue) {
            removeBanner();
            return;
        }

        var presentation =
            presentationForIssue(issue);

        var key =
            issue.code + "|" +
            issue.recoveryAction;

        if (
            banner &&
            currentKey === key
        ) {
            return;
        }

        removeBanner();

        currentKey = key;

        banner =
            $("<div/>", {
                id:
                    "xronos-runtime-support-banner",
                "class":
                    "alert alert-" +
                    presentation.severity,
                role:
                    "alert",
                "aria-live":
                    "polite"
            });

        banner.append(
            $("<h2/>", {
                "class":
                    "h4"
            }).text(
                presentation.title
            )
        );

        banner.append(
            $("<p/>").text(
                presentation.message
            )
        );

        banner.append(
            $("<p/>").text(
                presentation.recovery
            )
        );

        if (
            presentation.showHardReloadHelp
        ) {
            banner.append(
                $("<p/>", {
                    "class":
                        "small"
                }).text(
                    hardReloadHelpText()
                )
            );
        }

        var controls =
            $("<div/>", {
                "class":
                    "xronos-runtime-support-controls"
            });

        if (
            presentation.showSageRetry
        ) {
            var retry =
                $("<button/>", {
                    type:
                        "button",
                    "class":
                        "btn btn-primary btn-sm"
                }).text(
                    "Retry computations"
                );

            retry.on(
                "click",
                function(event) {
                    event.preventDefault();

                    var existing =
                        findExistingSageRetry($);

                    if (existing.length > 0) {
                        existing.trigger("click");
                    }
                }
            );

            controls.append(retry);
        }

        var report =
            $("<button/>", {
                type:
                    "button",
                "class":
                    "btn btn-secondary btn-sm"
            }).text(
                "Report this problem"
            );

        report.on(
            "click",
            function(event) {
                event.preventDefault();

                showReportModal(
                    $,
                    issue
                );
            }
        );

        controls.append(report);
        banner.append(controls);

        findDestination($)
            .prepend(banner);
    }

    pageRuntime.onSupportChange(
        function(support) {
            render(support);
        }
    );

    return true;
}


module.exports = {
    presentationForIssue:
        presentationForIssue,
    install:
        install
};
