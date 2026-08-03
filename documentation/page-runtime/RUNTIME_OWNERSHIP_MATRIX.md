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
| Activity bootstrap | coordinator-owned one-shot trigger in `main.js`; state-dependent release coordinator-owned through `activity.js`; initialization body remains in `activity.js` | coordinator receives document-ready and invokes guarded `.activity()` once; activity registers a release request when its initial-state consumer becomes available | initial state, activity initialization request; generic `fetchData()` queue remains database-owned | `activity-bootstrap-trigger` succeeds after invocation; `activity-initialization-release` succeeds after the initialization body runs; activity component becomes initialized | guarded legacy fallbacks if coordinator ownership cannot be configured or requested; duplicate invocation and duplicate release requests ignored | `ACTIVE MIGRATION`; trigger and state-dependent release ownership transferred, internal activity behavior remains component-owned |
| MathJax startup and authoritative initial Process | `main.js`, `mathjax.js`, `page-runtime.js`, and the coordinator adapter | coordinator-owned startup trigger followed by authoritative MathJax Begin/End Process hooks | page TeX and extensions; matching initial MathJax generation | generation-bound `mathjax-initial-process` terminal result with discovery and error metadata | coordinator-owned 15-second deadline (`XR-MATHJAX-INITIAL-101`); stale or mismatched completion rejected; permitted late completion preserves earlier diagnostic history | `ACTIVE MIGRATION`; generation binding, timeout ownership, error association, terminal metadata, and one-shot fault injection are committed. Any initial processing error is a page-level pedagogical failure for mathematical coursework; interaction-block implementation remains under review and browser validation |
| Problem runtime | `problem.js` | activity bootstrap | persistent data, answer events | implicit initialization; `ximera:complete` per problem | none | `RETAIN` |
| Math answer | `math-answer.js`, `main.js`, `page-runtime.js` | MathJax `New Math` connection and activity bootstrap | stable logical answer identity, state, parsed MathJax answer model, optional validator | `initial-math-answers`: `settled`, `degraded`, or `not-required`; successful attachment retained despite DOM replacement; later passes may recover; submissions still end implicitly | no separate initial-answer deadline; an initial `Process` that never ends remains covered by the MathJax deadline | `RETAIN`; verified late recovery now implemented without erasing failure history; next add submission transaction boundary and broader attachment diagnostics |
| Grouped validator | `validator.js`, `math-answer.js`, `page-runtime.js` | activity initialization and contained-answer attachment | contained answer globals/state, optional author-defined combined validator | one logical grouped submission currently persists a Boolean; malformed or unavailable validator results emit `XR-VALIDATOR-RESULT-101` and become incorrect | none | `RETAIN`; treat as one composite answer transaction in coordinator design. Full later overhaul: atomic grouped submission, ordinary-answer-consistent behavior, validator-unavailable/error outcome, save acknowledgement, reliable Enter/button behavior, and DOM replacement resilience. |
| Progress calculation | `progress-bar.js` | activity bootstrap | problems, answers, videos, database | debounced update | none | `RETAIN` |
| Completion persistence | `database.js`, `routes/state.js` | completion event | open state socket | no direct client acknowledgement | none | `RETAIN`; add operation result |
| Sage request | `sagemath.js`, `app.js` | Sage consumer | seed, auth token, proxy service | promise resolve/reject | implementation-specific retries | `RETAIN`; explicit operation state |
| Sage display | `main.js`, `sagemath.js`, MathJax, `page-runtime.js` | Sage request result and initial MathJax discovery | mapping, placeholder, MathJax rerender | `sage-inline-initial`: `settled`, `degraded`, or `not-required`; visible render or grouped fallback | 15-second passive readiness deadline (`XR-SAGE-INLINE-INITIAL-101`); late settlement recovers | `RETAIN`; terminal initial-display state now participates in `content-ready`; continue per-request diagnostics |
| Author JavaScript block | browser parser, `javascript.js`, `page-runtime.js` | inline script parsing; explicit post-state reevaluation only for random setup | author code, optional seed/state, document position | parser execution is not directly observable; markup presence is recorded as `author-javascript-setup`; random setup emits explicit operation states | none | `RETAIN`; parser-owned contract. Author-defined answer validators are a common conditional interaction dependency and must eventually distinguish unavailable/failed validator code from an incorrect student answer. General author interactives should receive separate required/optional classification. |
| Hints and feedback | `activity.js`, `problem.js`, `hint.js`, `feedback.js`, MathJax, `page-runtime.js` | activity bootstrap after initial state; later explicit reveal or answer attempt | hidden DOM content, persistent availability state, optional legacy accordion conversion | contents initialize while hidden; legacy reveal emits `legacy-hint-reveal` and `legacy-hint-rerender` operations | none; reveal-time rerender is outside initial readiness | `RETAIN`; UF first-paint safeguard added for legacy accordion hints; clarify future XimeraLaTeX `.xmhint` contract before removing compatibility conversion |
| Author inline JavaScript | `activity.js`, `javascript.js`, `page-runtime.js` | activity bootstrap after initial state | generated `.inline-javascript` functions and author globals | `author-inline-javascript`: `initialized` or `not-required` | none | `RETAIN`; post-state lifecycle is now passively observable |
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
