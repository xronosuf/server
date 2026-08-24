/*
 * Locate and replace one Ximera \answer command inside a TeX string.
 *
 * This deliberately uses brace counting rather than a regular expression.
 * TeX answer bodies can contain nested groups such as:
 *
 *     \answer{\frac{1}{2}}
 *
 * and an answer can itself occur inside another command:
 *
 *     \vector{\answer{BC}}
 *
 * A greedy regex can consume the outer command's closing brace, while a
 * non-greedy regex stops at the first nested closing brace.  Walking the
 * braces lets us replace exactly the \answer{...} span.
 */

function escapedAt(text, index) {
    var backslashes = 0;
    var cursor = index - 1;

    while (
        cursor >= 0 &&
        text.charAt(cursor) === "\\"
    ) {
        backslashes += 1;
        cursor -= 1;
    }

    return backslashes % 2 === 1;
}


function findAnswerCommands(tex) {
    var commands = [];
    var needle = "\\answer";
    var searchFrom = 0;
    var start;

    while (
        (start = tex.indexOf(
            needle,
            searchFrom
        )) !== -1
    ) {
        var afterCommand =
            start + needle.length;
        var next =
            tex.charAt(afterCommand);

        /*
         * Do not interpret a longer TeX control word such as
         * \answerSomething as \answer.
         */
        if (
            next &&
            /[A-Za-z@]/.test(next)
        ) {
            searchFrom =
                afterCommand;
            continue;
        }

        commands.push(start);
        searchFrom =
            afterCommand;
    }

    return commands;
}


function findSingleAnswer(tex) {
    var commands =
        findAnswerCommands(tex);

    if (commands.length !== 1) {
        return null;
    }

    var start =
        commands[0];
    var cursor =
        start + "\\answer".length;
    var length =
        tex.length;

    while (
        cursor < length &&
        /\s/.test(tex.charAt(cursor))
    ) {
        cursor += 1;
    }

    /*
     * Skip the optional argument, for example:
     *
     *     \answer[format=string]{BC}
     */
    if (tex.charAt(cursor) === "[") {
        cursor += 1;

        while (cursor < length) {
            if (
                tex.charAt(cursor) === "]" &&
                !escapedAt(tex, cursor)
            ) {
                cursor += 1;
                break;
            }

            cursor += 1;
        }

        if (cursor > length) {
            return null;
        }

        while (
            cursor < length &&
            /\s/.test(tex.charAt(cursor))
        ) {
            cursor += 1;
        }
    }

    if (tex.charAt(cursor) !== "{") {
        return null;
    }

    var argumentOpen =
        cursor;
    var depth =
        0;

    for (
        cursor = argumentOpen;
        cursor < length;
        cursor += 1
    ) {
        var character =
            tex.charAt(cursor);

        if (escapedAt(tex, cursor)) {
            continue;
        }

        if (character === "{") {
            depth += 1;
            continue;
        }

        if (character === "}") {
            depth -= 1;

            if (depth === 0) {
                return {
                    start: start,
                    end: cursor + 1,
                    argument:
                        tex.slice(
                            argumentOpen + 1,
                            cursor
                        )
                };
            }

            if (depth < 0) {
                return null;
            }
        }
    }

    return null;
}


function replaceSingleAnswer(
    tex,
    replacementAnswerTex
) {
    var answer =
        findSingleAnswer(tex);

    if (!answer) {
        return null;
    }

    return (
        tex.slice(0, answer.start) +
        "{\\color{blue} " +
        replacementAnswerTex +
        "}" +
        tex.slice(answer.end)
    );
}


exports.findSingleAnswer =
    findSingleAnswer;

exports.replaceSingleAnswer =
    replaceSingleAnswer;
