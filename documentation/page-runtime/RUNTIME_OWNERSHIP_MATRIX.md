# Runtime Ownership Matrix

## Purpose

This matrix records current runtime ownership and the intended future
classification of each subsystem.

Disposition terms:

- `RETAIN`
- `DECOUPLE_FROM_PAGE_READY`
- `STOP_AUTO_INITIALIZATION`
- `DEPRECATE`
- `REMOVE_BROWSER_CODE`
- `REMOVE_BACKEND_SUPPORT`
- `REMOVE_XIMERALATEX_MARKUP_SUPPORT`
- `INVESTIGATE`

## Core services and components

| Feature or service | Current owner | Current trigger | Important dependencies | Current terminal signal | Current timeout | Intended treatment |
|---|---|---|---|---|---|---|
| Application version check | `version.js` | jQuery ready | `/version`, page metadata | match or automatic reload | none visible | `RETAIN`; make navigation observable |
| Cache-bust reload | `cache-bust.js` | jQuery ready | query string, History API | reload | none | `RETAIN`; make navigation observable |
| Subpath discovery | `main.js` | bundle execution | synchronous page `HEAD` | request returns | browser/network dependent | `RETAIN`; replace synchronous request |
| Current-user identity | `users.js` | jQuery ready | `/users/me` | promise success only | none visible | `RETAIN`; `DECOUPLE_FROM_PAGE_READY`; localized failure |
| Main state socket | `database.js` | jQuery ready | activity hash, WebSocket | socket open; unsupported differential state is contained and emits `XR-STATE-DIFF-101` | reconnect forever | `RETAIN`; distinguish connection from state readiness and add offending-state paths to sync diagnostics |
| Initial state sync | `database.js`, `routes/state.js`, `page-runtime.js` | `watch` message | identity, activity hash, MongoDB | `sync` message / `initial-state: available` | 15-second passive readiness deadline (`XR-STATE-INITIAL-101`); no fallback release | `RETAIN`; add explicit found/not-found/failed outcome |
| Activity bootstrap | `activity.js` | `.activity()` after document ready | initial `fetchData()` | callback body completes implicitly | none | `RETAIN`; place under coordinator |
| MathJax startup | `main.js`, `mathjax.js`, `page-runtime.js` | configured/startup hooks | page TeX and extensions | initial `mathjax-pass: ended` with `passType: process` | 15-second passive readiness deadline (`XR-MATHJAX-INITIAL-101`); late completion recovers | `RETAIN`; explicit rendering state |
| Problem runtime | `problem.js` | activity bootstrap | persistent data, answer events | implicit initialization; `ximera:complete` per problem | none | `RETAIN` |
| Math answer | `math-answer.js`, `main.js`, `page-runtime.js` | MathJax `New Math` connection and activity bootstrap | stable logical answer identity, state, parsed MathJax answer model, optional validator | `initial-math-answers`: `settled`, `degraded`, or `not-required`; successful attachment retained despite DOM replacement; later passes may recover; submissions still end implicitly | no separate initial-answer deadline; an initial `Process` that never ends remains covered by the MathJax deadline | `RETAIN`; verified late recovery now implemented without erasing failure history; next add submission transaction boundary and broader attachment diagnostics |
| Grouped validator | `validator.js`, `math-answer.js`, `page-runtime.js` | activity bootstrap | contained answer globals/state | Boolean result persisted; malformed results emit `XR-VALIDATOR-RESULT-101` and become incorrect | none | `RETAIN`; result containment added; later repair button ownership and atomic grouped submission |
| Progress calculation | `progress-bar.js` | activity bootstrap | problems, answers, videos, database | debounced update | none | `RETAIN` |
| Completion persistence | `database.js`, `routes/state.js` | completion event | open state socket | no direct client acknowledgement | none | `RETAIN`; add operation result |
| Sage request | `sagemath.js`, `app.js` | Sage consumer | seed, auth token, proxy service | promise resolve/reject | implementation-specific retries | `RETAIN`; explicit operation state |
| Sage display | `main.js`, `sagemath.js`, MathJax, `page-runtime.js` | Sage request result and initial MathJax discovery | mapping, placeholder, MathJax rerender | `sage-inline-initial`: `settled`, `degraded`, or `not-required`; visible render or grouped fallback | 15-second passive readiness deadline (`XR-SAGE-INLINE-INITIAL-101`); late settlement recovers | `RETAIN`; terminal initial-display state now participates in `content-ready`; continue per-request diagnostics |
| Author JavaScript block | `javascript.js` | ready/state callbacks | author code, optional seed/state | implicit execution | none | `RETAIN`; document contract and isolate failures |
| Author `\js` output | `javascript.js`, MathJax | evaluation/reevaluation | author definitions, MathJax | implicit rerender | none | `RETAIN`; explicit component lifecycle |
| Optional interactives | `interactives.js` | activity bootstrap | external libraries | callback invocation | none | `RETAIN`; `DECOUPLE_FROM_PAGE_READY`; add local timeout |
| Desmos | `desmos.js` | requested dependency | remote script and global object | deferred resolve only | none | `RETAIN`; local timeout/error |
| Image modal | `image-environment.js` | jQuery ready | generated modal markup | handlers installed | none | `RETAIN`; `DECOUPLE_FROM_PAGE_READY` |
| Math palette | `math-palette.js` | jQuery ready and answer focus | Guppy UI | modal interaction | none | `RETAIN`; separate from page readiness |
| Sticky scrolling | `sticky-scroll.js` | jQuery ready | Bootstrap affix markup | implicit | none | `RETAIN`; `DECOUPLE_FROM_PAGE_READY` |
| Clickable rows | `rowclick.js` | explicit call from `main.js` | table markup | handlers installed | none | `RETAIN`; `DECOUPLE_FROM_PAGE_READY` |
| Xourse layout | `xourse.js` | jQuery ready | Isotope, DOM sizing | delayed relayouts | several timers | `RETAIN`; visual lifecycle only |
| Instructor statistics | `instructor.js` | jQuery ready and instructor actions | identity, statistics routes, Sage UI | AJAX callbacks/modal | polling exists | `RETAIN`; replace DOM polling eventually |

## Dormant, discontinued, or ethically sensitive features

| Feature | Current status | Current ownership | Intended disposition |
|---|---|---|---|
| Chat | auto-initialized browser UI and state-socket handlers | `chat.js`, `database.js`, `routes/state.js`, chat modal | `STOP_AUTO_INITIALIZATION`; later `REMOVE_BROWSER_CODE` and `REMOVE_BACKEND_SUPPORT` |
| Live supervision | active menu exposure, WebSocket context-room observation, supervision page | `users.js`, `supervision.js`, `routes/state.js`, `routes/supervising.js`, templates | `STOP_AUTO_INITIALIZATION`; later remove live-observation support |
| Pencil | auto-initialized full-page SVG drawing stored as ordinary persistent state | `pencil.js` | `STOP_AUTO_INITIALIZATION`; later `REMOVE_BROWSER_CODE`; investigate old saved keys |
| Annotator | plugin bundled, initializer commented out, placeholder backend URL | `annotator.js`, commented `activity.js` call | `DEPRECATE`; likely `REMOVE_BROWSER_CODE` |
| Invigilator | explicitly disabled by an immediate `return`; hard-coded abandoned CKA flow | `invigilator.js`, old header markup | `DEPRECATE`; likely `REMOVE_BROWSER_CODE`; investigate markup support |
| Masquerade | authorized instructor view of a particular learner | `routes/supervising.js`, page routes/templates | `RETAIN`; distinct from live supervision; repair SpeedGrader path later |

## Future detailed-entry fields

As the coordinator is developed, each row should gain:

- current owner
- trigger
- explicit prerequisites
- implicit prerequisites
- side effects
- completion signal
- failure signal
- timeout behavior
- fallback behavior
- repeatability
- teardown behavior
- diagnostic owner
- operation or generation ID
- future coordinator adapter
