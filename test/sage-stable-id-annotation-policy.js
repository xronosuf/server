"use strict";

var assert = require("assert");

var policy =
    require(
        "../public/javascripts/" +
        "sage-stable-id-annotation-policy"
    );


describe(
    "Sage stable authored-occurrence annotation",
    function() {
        it(
            "preserves identity across indexed-root execution reordering",
            function() {
                var source =
                    "\\sqrt[\\sage{root}]{\\sage{factor}}";

                var rootStart =
                    source.indexOf(
                        "\\sage{root}"
                    );

                var factorStart =
                    source.indexOf(
                        "\\sage{factor}"
                    );

                var result =
                    policy.annotateSource(
                        source,
                        [
                            {
                                stableId:
                                    "sage-expression-0001",
                                macro:
                                    "sage",
                                expression:
                                    "root",
                                sourceStartIndex:
                                    rootStart,
                                sourceEndIndex:
                                    rootStart +
                                    "\\sage{root}".length -
                                    1
                            },
                            {
                                stableId:
                                    "sage-expression-0002",
                                macro:
                                    "sage",
                                expression:
                                    "factor",
                                sourceStartIndex:
                                    factorStart,
                                sourceEndIndex:
                                    factorStart +
                                    "\\sage{factor}".length -
                                    1
                            }
                        ]
                    );

                assert.strictEqual(
                    result.skipped,
                    0
                );

                assert.strictEqual(
                    result.annotated,
                    2
                );

                assert.strictEqual(
                    result.source,
                    "\\sqrt[" +
                    "\\xronosSageById" +
                    "{sage-expression-0001}{root}" +
                    "]{" +
                    "\\xronosSageById" +
                    "{sage-expression-0002}{factor}" +
                    "}"
                );
            }
        );


        it(
            "keeps identical authored expressions distinct",
            function() {
                var source =
                    "\\sage{x}+\\sage{x}";

                var firstStart =
                    source.indexOf(
                        "\\sage{x}"
                    );

                var secondStart =
                    source.indexOf(
                        "\\sage{x}",
                        firstStart + 1
                    );

                var result =
                    policy.annotateSource(
                        source,
                        [
                            {
                                stableId:
                                    "sage-expression-0001",
                                macro:
                                    "sage",
                                expression:
                                    "x",
                                sourceStartIndex:
                                    firstStart,
                                sourceEndIndex:
                                    firstStart +
                                    "\\sage{x}".length -
                                    1
                            },
                            {
                                stableId:
                                    "sage-expression-0002",
                                macro:
                                    "sage",
                                expression:
                                    "x",
                                sourceStartIndex:
                                    secondStart,
                                sourceEndIndex:
                                    secondStart +
                                    "\\sage{x}".length -
                                    1
                            }
                        ]
                    );

                assert.strictEqual(
                    result.skipped,
                    0
                );

                assert.strictEqual(
                    result.annotated,
                    2
                );

                assert.strictEqual(
                    result.source,
                    "\\xronosSageById" +
                    "{sage-expression-0001}{x}" +
                    "+" +
                    "\\xronosSageById" +
                    "{sage-expression-0002}{x}"
                );
            }
        );


        it(
            "preserves sagestr semantics",
            function() {
                var source =
                    "\\sagestr{message}";

                var result =
                    policy.annotateSource(
                        source,
                        [
                            {
                                stableId:
                                    "sage-expression-0001",
                                macro:
                                    "sagestr",
                                expression:
                                    "message",
                                sourceStartIndex:
                                    0,
                                sourceEndIndex:
                                    source.length - 1
                            }
                        ]
                    );

                assert.strictEqual(
                    result.skipped,
                    0
                );

                assert.strictEqual(
                    result.source,
                    "\\xronosSageStrById" +
                    "{sage-expression-0001}" +
                    "{message}"
                );
            }
        );


        it(
            "reports an invalid source mapping instead of guessing",
            function() {
                var result =
                    policy.annotateSource(
                        "\\sage{x}",
                        [
                            {
                                stableId:
                                    "sage-expression-0001",
                                macro:
                                    "sage",
                                expression:
                                    "x",
                                sourceStartIndex:
                                    1,
                                sourceEndIndex:
                                    8
                            }
                        ]
                    );

                assert.strictEqual(
                    result.annotated,
                    0
                );

                assert.strictEqual(
                    result.skipped,
                    1
                );

                assert.strictEqual(
                    result.source,
                    "\\sage{x}"
                );
            }
        );
    }
);
