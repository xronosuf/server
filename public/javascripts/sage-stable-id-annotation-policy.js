"use strict";


/*
 * Rewrite immutable authored \sage / \sagestr occurrences to internal
 * stable-ID macros.
 *
 * Entries must contain source offsets from the original unmodified TeX.
 * Replacements are applied right-to-left so those offsets remain valid.
 *
 * This function is deliberately independent of DOM and MathJax so its
 * identity semantics can be regression-tested directly.
 */
function annotateSource(source, entries) {
    var working =
        String(source || "");

    var ordered =
        (entries || [])
            .slice()
            .sort(
                function(left, right) {
                    return (
                        right.sourceStartIndex -
                        left.sourceStartIndex
                    );
                }
            );

    var annotated = 0;
    var skipped = 0;

    ordered.forEach(
        function(entry) {
            if (
                !entry ||
                entry.parseError ||
                entry.expression === null ||
                typeof entry.sourceStartIndex !==
                    "number" ||
                typeof entry.sourceEndIndex !==
                    "number" ||
                !entry.stableId
            ) {
                skipped += 1;
                return;
            }

            var original =
                working.slice(
                    entry.sourceStartIndex,
                    entry.sourceEndIndex + 1
                );

            var expectedPrefix =
                entry.macro ===
                "sagestr"
                    ? "\\sagestr"
                    : "\\sage";

            if (
                original.indexOf(
                    expectedPrefix
                ) !== 0
            ) {
                skipped += 1;
                return;
            }

            var replacement =
                (
                    entry.macro ===
                    "sagestr"
                        ? "\\xronosSageStrById"
                        : "\\xronosSageById"
                ) +
                "{" +
                entry.stableId +
                "}{" +
                entry.expression +
                "}";

            working =
                working.slice(
                    0,
                    entry.sourceStartIndex
                ) +
                replacement +
                working.slice(
                    entry.sourceEndIndex + 1
                );

            annotated += 1;
        }
    );

    return {
        source:
            working,
        annotated:
            annotated,
        skipped:
            skipped
    };
}


module.exports = {
    annotateSource:
        annotateSource
};
