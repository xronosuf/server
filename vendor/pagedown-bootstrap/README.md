# pagedown-bootstrap

These files are a vendored copy of the historical Pagedown implementation
used by Xronos for free-response Markdown editing.

Upstream repository:

    https://github.com/tchapi/pagedown-bootstrap

Pinned upstream commit:

    4e737546c7f73c1c50183c05a814c7b622658dd8

Xronos historically installed this repository through Napa when the browser
build was migrated from RequireJS to Browserify. The corresponding Aliasify
configuration referenced these files directly from
`node_modules/pagedown-bootstrap`.

The Napa installation mechanism was later removed, leaving the Xronos build
dependent on an undeclared checkout that happened to remain in the runtime
dependency tree. The separately declared npm package `pagedown` was not the
source of these files and was not consumed by the Xronos source.

The three JavaScript files and LICENSE.txt in this directory were verified
byte-for-byte against the pinned upstream commit before being vendored.

Only the files used by the Xronos browser build are retained here:

- Markdown.Converter.js
- Markdown.Sanitizer.js
- Markdown.Editor.js
- LICENSE.txt

Do not update these files as part of dependency cleanup. Any replacement or
upgrade of the Markdown editor should be treated as a separate functional
change and tested accordingly.
