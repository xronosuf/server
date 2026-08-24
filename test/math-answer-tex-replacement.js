var assert = require("assert");

var mathAnswerTex =
    require(
        "../public/javascripts/math-answer-tex"
    );

describe(
    "completed math-answer TeX replacement",
    function() {
        it("replaces a bare answer", function() {
            assert.strictEqual(
                mathAnswerTex.replaceSingleAnswer(
                    "\\answer{BC}",
                    "BC"
                ),
                "{\\color{blue} BC}"
            );
        });

        it(
            "preserves an enclosing vector brace",
            function() {
                assert.strictEqual(
                    mathAnswerTex.replaceSingleAnswer(
                        "\\vector{\\answer{BC}}",
                        "BC"
                    ),
                    "\\vector{{\\color{blue} BC}}"
                );
            }
        );

        it(
            "handles optional answer arguments",
            function() {
                assert.strictEqual(
                    mathAnswerTex.replaceSingleAnswer(
                        "\\vector {" +
                        "\\answer " +
                        "[format=string]{BC}" +
                        "}",
                        "BC"
                    ),
                    "\\vector " +
                    "{{\\color{blue} BC}}"
                );
            }
        );

        it(
            "handles nested TeX in the answer",
            function() {
                var found =
                    mathAnswerTex.findSingleAnswer(
                        "\\answer{\\frac{1}{2}}"
                    );

                assert.ok(found);

                assert.strictEqual(
                    found.argument,
                    "\\frac{1}{2}"
                );

                assert.strictEqual(
                    mathAnswerTex.replaceSingleAnswer(
                        "\\answer{\\frac{1}{2}}",
                        "\\frac{1}{2}"
                    ),
                    "{\\color{blue} " +
                    "\\frac{1}{2}}"
                );
            }
        );

        it(
            "handles nested answer TeX inside a vector",
            function() {
                assert.strictEqual(
                    mathAnswerTex.replaceSingleAnswer(
                        "\\vector{" +
                        "\\answer{\\frac{1}{2}}" +
                        "}",
                        "\\frac{1}{2}"
                    ),
                    "\\vector{" +
                    "{\\color{blue} " +
                    "\\frac{1}{2}}" +
                    "}"
                );
            }
        );

        it(
            "does not guess when multiple answers exist",
            function() {
                assert.strictEqual(
                    mathAnswerTex.replaceSingleAnswer(
                        "\\answer{a}+\\answer{b}",
                        "a"
                    ),
                    null
                );
            }
        );

        it(
            "rejects an unterminated answer group",
            function() {
                assert.strictEqual(
                    mathAnswerTex.replaceSingleAnswer(
                        "\\answer{BC",
                        "BC"
                    ),
                    null
                );
            }
        );


        it(
            "does not try to validate surrounding TeX",
            function() {
                assert.strictEqual(
                    mathAnswerTex.replaceSingleAnswer(
                        "\\vector{\\answer{BC}",
                        "BC"
                    ),
                    "\\vector{{\\color{blue} BC}"
                );
            }
        );
    }
);
