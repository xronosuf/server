/*
 * Normalize the LaTeX representation Sage emits for Python/Sage strings when
 * those strings are used as canonical answer values.
 *
 * Sage's latex("DNE") form is typically:
 *
 *     \text{\texttt{DNE}}
 *
 * That is appropriate display TeX, but it is not the canonical value an
 * answer box should compare against. In particular, format=string must see
 * "DNE", not the TeX wrapper, while ordinary expression answers still need a
 * stable textual token that can be parsed by math-expressions.
 */

function readCommandArgument(source, commandName) {
    var prefix = "\\" + commandName;
    var index = 0;
    var depth = 0;
    var start;

    source = String(source || "").trim();

    if (source.indexOf(prefix) !== 0) {
        return null;
    }

    index = prefix.length;

    while (index < source.length && /\s/.test(source.charAt(index))) {
        index += 1;
    }

    if (source.charAt(index) !== "{") {
        return null;
    }

    start = index + 1;
    depth = 1;
    index += 1;

    while (index < source.length) {
        if (source.charAt(index) === "\\") {
            index += 2;
            continue;
        }

        if (source.charAt(index) === "{") {
            depth += 1;
        } else if (source.charAt(index) === "}") {
            depth -= 1;

            if (depth === 0) {
                if (source.slice(index + 1).trim() !== "") {
                    return null;
                }

                return source.slice(start, index);
            }
        }

        index += 1;
    }

    return null;
}

function decodeTextttContent(text) {
    return String(text)
        .replace(/\\([_#$%&{}])/g, "$1")
        .replace(/\\textbackslash\s*\{\s*\}/g, "\\");
}

exports.containsSageMacro = function(latex) {
    return /\\(?:sage|sagestr|xronosSageById|xronosSageStrById)\s*\{/.test(
        String(latex || "")
    );
};

exports.extractSageString = function(latex) {
    var textContent = readCommandArgument(latex, "text");
    var textttContent;

    if (textContent === null) {
        return null;
    }

    textttContent = readCommandArgument(textContent, "texttt");

    if (textttContent === null) {
        return null;
    }

    return decodeTextttContent(textttContent);
};
