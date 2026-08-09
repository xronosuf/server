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
| Initial state sync | `database.js`, `routes/state.js`, `page-runtime.js`, coordinator adapter | `watch` -> `sync` | identity, activity hash, MongoDB | external `initial-state` terminal signal | 15-second `XR-STATE-INITIAL-101`; late success allowed; detailed timeout ownership still legacy-driven | `ACTIVE MIGRATION`; distinguish found/empty/failed/unauthorized before fallback design |
| Activity bootstrap | coordinator-owned one-shot trigger in `main.js`; state-dependent release coordinator-owned through `activity.js`; initialization body remains in `activity.js` | coordinator receives document-ready and invokes guarded `.activity()` once; activity registers a release request when its initial-state consumer becomes available | initial state, activity initialization request; generic `fetchData()` queue remains database-owned | `activity-bootstrap-trigger` succeeds after invocation; `activity-initialization-release` succeeds after the initialization body runs; activity component becomes initialized | guarded legacy fallbacks if coordinator ownership cannot be configured or requested; duplicate invocation and duplicate release requests ignored | `ACTIVE MIGRATION`; trigger and state-dependent release ownership transferred, internal activity behavior remains component-owned |
| MathJax startup and authoritative initial Process | `main.js`, MathJax, `page-runtime.js`, coordinator adapter | coordinator startup trigger then authoritative Begin/End Process | page TeX/extensions; matching initial generation | generation-bound `mathjax-initial-process` terminal result with discovery/error metadata | coordinator-owned 15-second `XR-MATHJAX-INITIAL-101`; stale/mismatched completion rejected; matching late recovery allowed | `IMPLEMENTED`; any associated initial parse/processing error fails the leaf, degrades readiness, and blocks mathematical coursework until reload |
| Problem runtime | `problem.js` | activity bootstrap | persistent data, answer events | implicit initialization; `ximera:complete` per problem | none | `RETAIN` |
| Initial math-answer attachment | `math-answer.js`, `main.js`, `page-runtime.js`, coordinator adapter | MathJax `New Math` under initial generation | authored `data-id`, generated persistence/DOM ID, initial generation, state, resolved MathJax answer model, optional validator | `initial-math-answers`: `settled`, `degraded`, or `not-required`; successful attachment retained across DOM replacement; later passes may repair; same-operation degraded coordinator leaf may recover to success | no separate answer deadline; unfinished initial Process remains covered by MathJax deadline | `IMPLEMENTED / RECONCILED`; missing-model degradation, later repair, ID preservation, same-operation leaf recovery, and transitive readiness recovery browser-validated |
| Answer submission | `math-answer.js`, validator modules, `database.js` | student submit or Enter-key path | attached answer model, validator when present, persistent state | validation/result and persistence currently span several callbacks without one explicit transaction terminal signal | none | `RETAIN`; keep outside the initial-attachment reconcile patch; later add explicit submission operation identity, stale-result protection, validation outcome, and persistence acknowledgement |
| Grouped validator | `validator.js`, `math-answer.js`, `page-runtime.js` | activity initialization and contained-answer attachment | contained answer globals/state, optional author-defined combined validator | one logical grouped submission currently persists a Boolean; malformed or unavailable validator results emit `XR-VALIDATOR-RESULT-101` and become incorrect | none | `RETAIN`; treat as one composite answer transaction in coordinator design. Full later overhaul: atomic grouped submission, ordinary-answer-consistent behavior, validator-unavailable/error outcome, save acknowledgement, reliable Enter/button behavior, and DOM replacement resilience. |
| Progress calculation | `progress-bar.js` | activity bootstrap | problems, answers, videos, database | debounced update | none | `RETAIN` |
| Completion persistence | `database.js`, `routes/state.js` | completion event | open state socket | no direct client acknowledgement | none | `RETAIN`; add operation result |
| Canonical Sage request | `sagemath.js`, `app.js`, coordinator adapter | initial manifest or later canonical generation consumer | seed, page auth, proxy service, canonical identity | explicit `canonical-sage` terminal attempt; explicit Retry creates a new operation | request/proxy implementation-specific behavior | `IMPLEMENTED`; canonical-only, invariant failure does not fall back to legacy executor |
| Initial Sage display | `main.js`, `sagemath.js`, MathJax, `page-runtime.js`, coordinator adapter | canonical result + initial MathJax placeholder discovery | manifest stable ID, placeholder, MathJax rerender, request-attempt token | `sage-inline-initial`: `settled`, `degraded`, or `not-required`; known failure terminates visibly | 15-second `XR-SAGE-INLINE-INITIAL-101`; same-request late recovery allowed | `IMPLEMENTED`; visible deadline, missing-anchor handling, Retry, and stale-attempt rejection browser-validated |
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
