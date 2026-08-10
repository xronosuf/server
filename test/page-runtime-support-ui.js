"use strict";

var should = require("should");

var supportUi = require(
    "../public/javascripts/page-runtime-support-ui"
);

describe(
    "page runtime support UI presentation",
    function() {
        it(
            "presents connection loss as keep-open recovery",
            function() {
                var result =
                    supportUi.presentationForIssue({
                        code:
                            "XR-STATE-CONNECTION-101",
                        recoveryAction:
                            "keep-open-until-reconnected"
                    });

                result.severity
                    .should.equal("warning");
                result.recovery
                    .should.match(/Keep this page open/);
                result.showSageRetry
                    .should.equal(false);
            }
        );

        it(
            "presents unsafe save state without reload advice",
            function() {
                var result =
                    supportUi.presentationForIssue({
                        code:
                            "XR-STATE-DIFF-101",
                        recoveryAction:
                            "keep-open-until-save-safe"
                    });

                result.recovery
                    .should.match(/Do not reload/);
                result.showHardReloadHelp
                    .should.equal(false);
            }
        );

        it(
            "presents retryable Sage failure with computation retry",
            function() {
                var result =
                    supportUi.presentationForIssue({
                        code:
                            "XR-SAGE-INLINE-INITIAL-101",
                        recoveryAction:
                            "retry-then-hard-reload"
                    });

                result.showSageRetry
                    .should.equal(true);
                result.showHardReloadHelp
                    .should.equal(true);
                result.recovery
                    .should.match(/Try the computations again/);
            }
        );

        it(
            "does not confuse Sage retry with Another",
            function() {
                var result =
                    supportUi.presentationForIssue({
                        code:
                            "XR-SAGE-INLINE-INITIAL-101",
                        recoveryAction:
                            "retry-then-hard-reload"
                    });

                (
                    result.title +
                    " " +
                    result.message +
                    " " +
                    result.recovery
                ).should.not.match(/\bAnother\b/);
            }
        );

        it(
            "presents MathJax failure as hard-reload recovery",
            function() {
                var result =
                    supportUi.presentationForIssue({
                        code:
                            "XR-MATHJAX-INITIAL-101",
                        recoveryAction:
                            "hard-reload"
                    });

                result.title
                    .should.equal(
                        "Mathematical content failed to render"
                    );
                result.showHardReloadHelp
                    .should.equal(true);
                result.showSageRetry
                    .should.equal(false);
            }
        );

        it(
            "returns no presentation without an issue",
            function() {
                should(
                    supportUi.presentationForIssue(
                        null
                    )
                ).equal(null);
            }
        );
    }
);
