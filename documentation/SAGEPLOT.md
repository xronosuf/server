# Sage plot SVG support

## Status

This document describes the experimental `sageplot` branch implementation.
It is intended for test-server validation before any production integration.

The author-facing source remains ordinary Ximera/SageTeX syntax:

```latex
\begin{image}
  \sageplot{plot(f(x), (x,-5,5))}
  \xmalt{Graph of ...}
\end{image}
```

For PDF output SageTeX retains its normal `\sageplot` behavior. The Ximera
HTML configuration emits an inert web marker containing the authored Sage
expression:

```html
<span class="sage-plot">
  <script type="text/x-sage-plot">plot(...)</script>
</span>
```

The authored `\xmalt` remains independent of the Sage plot expression and is
preserved by the surrounding Ximera image environment.

## Runtime design

`\sageplot` is a first-class canonical Sage result type. It does not use a
synthetic `\sagestr`, a hidden MathJax expression, or a separate SageCell
request.

The immutable pre-MathJax Sage manifest recognizes three kinds of source in
document order:

- `sagesilent` entries from `script[type="text/sagemath"]`;
- scalar/string `expression` entries from authored `\sage` and `\sagestr`;
- `plot` entries from `script[type="text/x-sage-plot"]`.

A plot entry has its own stable identity and metadata, for example:

```javascript
{
  kind: "plot",
  stableId: "sage-plot-0001",
  macro: "sageplot",
  consumer: "plot",
  expression: "plot(f(x), (x,-5,5))",
  mime: "image/svg+xml"
}
```

All three entry kinds are compiled into the same ordered Sage program. They
therefore share the same page seed, namespace, request, and explicit Another
generation.

### SVG serialization

For a `plot` entry, the canonical compiler:

1. evaluates the authored Sage expression in the current page namespace;
2. saves the resulting Sage Graphics object to a temporary `.svg` file;
3. reads the SVG back as UTF-8 text;
4. removes the temporary file in a `finally` block;
5. places the SVG text in the canonical result bundle.

A successful plot result has the explicit shape:

```javascript
{
  ok: true,
  kind: "plot",
  mime: "image/svg+xml",
  result: "<svg ...>...</svg>"
}
```

No SageCell filesystem path is exposed to the browser and no plot file is
intentionally persisted on the Xronos host or SageCell container.

### Browser rendering

`sageplot-bootstrap.js` registers a plot renderer with the canonical Sage
runtime. After the immutable manifest is captured it maps each published plot
marker to its `sage-plot-NNNN` manifest entry.

When the canonical request completes, `sagemath.js` delivers plot results
directly to that renderer. The SVG is parsed as XML, sanitized, imported into
the page, and inserted into the authored `.sage-plot` holder.

The sanitizer removes script-capable embedded elements and event-handler
attributes, and rejects `javascript:` links before importing the SVG.

Plot delivery is therefore independent of MathJax's `\sage`/`\sagestr`
placeholder lifecycle. MathJax sees only genuine scalar/string Sage calls.

## Another-generation lifecycle

An explicit **Another** generation still uses one canonical Sage request for
all Sage content on the page.

The generation is not considered request-settled until its plot results have
also been delivered to the plot renderer. The existing Another release gate
then additionally waits for the MathJax pass, the complete scalar Sage pass,
and all tracked scalar Sage call promises.

Consequently a new generation is intended to update displayed scalar values,
answer keys, and plots from one seed before the Another control is released.
A plot-only Sage page is also supported: with no scalar Sage expressions, the
scalar full-pass condition is immediately satisfied while the plot request and
render still participate in generation settlement.

## Browser diagnostics

The immutable manifest can be inspected with:

```javascript
xronosInspectInitialSagePageManifest()
```

A published plot should appear there explicitly as `kind: "plot"`, not as a
synthetic `sagestr` expression.

The canonical runtime inspector is:

```javascript
xronosInspectCanonicalPageSageRuntime()
```

It reports scalar and plot counts separately, including `manifestPlots`,
`plotResolutions`, `plotRejections`, and `plotFailureCount`.

The plot renderer inspector is:

```javascript
xronosInspectSagePlots()
```

Its `transport` field should be `first-class-canonical-plot`, and each plot
reports its stable ID, authored expression, render/failure counts, SVG
presence, MIME type, and most recent generation metadata.

For interactive debugging, prefer collecting these inspectors into one object
and using the Chromium DevTools `copy(JSON.stringify(report, null, 2))`
helper so the result can be pasted as one report.

## Test-server validation checklist

Use the published `testSuite/14-sageplot-svg` activity.

1. Build the browser bundle successfully on the `sageplot` branch.
2. Confirm the page loads without a JavaScript or MathJax startup failure.
3. Confirm the immutable manifest contains one `kind: "plot"` entry and no
   synthetic plot `sagestr` entry/helper block.
4. Confirm `xronosInspectSagePlots()` reports
   `transport: "first-class-canonical-plot"` and `hasSvg: true`.
5. Confirm the visible graph is an inline `<svg>`, not a raster image.
6. Confirm the displayed coefficients, graph, and answer keys describe the
   same seeded generation.
7. Reload normally and confirm the same seeded generation is retained.
8. Use **Another** and confirm the scalar values, answer keys, and graph change
   together in one generation.
9. Confirm the Another button remains busy until the generation is settled.
10. Confirm `\xmalt` remains present in the surrounding image environment.
11. Confirm initial inline-Sage readiness counts only genuine `\sage` and
    `\sagestr` MathJax consumers rather than expecting the plot as a ninth
    MathJax call.
12. Inspect the `/sagecell/service` response size and proxy cache behavior for
    the SVG-bearing canonical response before deciding whether the existing
    in-memory cache needs a separate body-size policy.

## Non-goals in the first implementation

- PNG fallback
- a separate Sage request per plot
- persistent plot files on the Xronos host
- independent plot random seeds
- web emulation of SageTeX's generated-file/includegraphics workflow
- automatic alt-text generation
- final plot sizing or zoom UI
