# SageCell Workflow for Xronos

This document describes how Xronos sends Sage code to SageCell, how the local and fallback SageCell services are selected, and how server-side caching works.

For the host-vs-container meaning of `0.0.0.0`, `127.0.0.1`, Podman `-p`, and internal-only service ports, also see `documentation/NETWORK_BINDINGS.md`.

## Quick Reference: Environment Variables

### `SAGECELL_SERVICE`

Primary SageCell service endpoint.

The application-code fallback/default is:

```bash
SAGECELL_SERVICE=http://127.0.0.1:8888/service
```

The current Podman test deployment overrides that value because SageCell is a separate container on the shared `xronos-net` network:

```bash
SAGECELL_SERVICE=http://sagecell:8888/service
```

In that deployment, `sagecell` is the container/network DNS name. SageCell port `8888` is not published on the host.

---

### `SAGECELL_FALLBACK_SERVICE`

Fallback/remote SageCell service endpoint.

Default:

```bash
SAGECELL_FALLBACK_SERVICE=https://sagecell.sagemath.org/service
```

Important note: in testing on 2026-06-03, direct POST requests to `https://sagecell.sagemath.org/service` returned HTTP 520 from both the dev server and the production server. Static public SageCell assets were reachable, so this appears specific to the `/service` endpoint. This means the fallback framework exists and works, but `SAGECELL_FALLBACK_SERVICE` should be pointed to a tested SageCell `/service` endpoint before relying on `remote-only` mode or automatic remote fallback in production.

In the future, this variable should be changed to the dedicated Ximera SageCell service endpoint once that exists.

Example future setting:

```bash
SAGECELL_FALLBACK_SERVICE=https://<future-ximera-sagecell-host>/service
```

---

### `SAGECELL_SERVICE_MODE`

Controls how Xronos routes SageCell requests.

Default:

```bash
SAGECELL_SERVICE_MODE=local-with-fallback
```

Supported values:

```bash
SAGECELL_SERVICE_MODE=local-with-fallback
SAGECELL_SERVICE_MODE=local-only
SAGECELL_SERVICE_MODE=remote-only
```

Recommended production default:

```bash
SAGECELL_SERVICE_MODE=local-with-fallback
```

Emergency bypass mode:

```bash
SAGECELL_SERVICE_MODE=remote-only
```

Use `remote-only` if the local SageCell service needs to be bypassed entirely. This sends requests directly to `SAGECELL_FALLBACK_SERVICE`. This is only useful if `SAGECELL_FALLBACK_SERVICE` points to a working SageCell `/service` endpoint.

Strict local mode:

```bash
SAGECELL_SERVICE_MODE=local-only
```

Use `local-only` if fallback behavior should be disabled.

Changing this variable requires restarting the Xronos server container/process.

---

### `SAGECELL_FALLBACK_COOLDOWN_MS`

How long Xronos should temporarily treat the local SageCell service as unavailable after an infrastructure-style local failure.

Default:

```bash
SAGECELL_FALLBACK_COOLDOWN_MS=30000
```

That is 30 seconds.

In `local-with-fallback` mode, if the local SageCell service fails due to an infrastructure-style problem, Xronos sends that request to fallback and marks the local service unhealthy for this cooldown period. During cooldown, requests that cannot be served from local cache are sent directly to fallback. After cooldown expires, the next uncached request tries local again.

---

### `SAGECELL_PROXY_LOG`

Controls normal SageCell proxy diagnostic logging.

Default: unset/off.

Enable with:

```bash
SAGECELL_PROXY_LOG=1
```

or:

```bash
SAGECELL_PROXY_LOG=true
```

When enabled, normal cache/routing messages such as cache hits, misses, waits, and fallback routing decisions are logged. Real proxy errors may still be logged even when this variable is off.

Changing this variable requires restarting the Xronos server container/process.

---

## Architecture Overview

The browser does not talk directly to SageCell. Instead, the browser sends Sage code to the Xronos server:

```text
Browser
  -> Xronos /sagecell/service
      -> local SageCell service, or
      -> fallback SageCell service
```

The Xronos proxy route is:

```text
POST /sagecell/service
```

The request body includes form data such as:

```text
code=print(2+2)
```

A successful SageCell response looks like:

```json
{
  "stdout": "4\n",
  "success": true,
  "execute_reply": {
    "status": "ok",
    "execution_count": 1,
    "user_expressions": {},
    "payload": []
  }
}
```

The Xronos proxy adds diagnostic headers such as:

```text
X-SageCell-Proxy-Cache: MISS
X-SageCell-Proxy-Source: local
```

or:

```text
X-SageCell-Proxy-Cache: HIT-LOCAL
X-SageCell-Proxy-Source: local
```

or:

```text
X-SageCell-Proxy-Source: fallback
```

---

## Local SageCell Container Workflow

The SageCell container source is maintained separately in
`/home/ximera/xronosuf/sagecell-server` (`xronosuf/sagecell-server`).
The old embedded `server/sagecell-docker-v2` build has been retired.
Build, patch, and image-maintenance work belongs in the standalone SageCell
repository; Xronos communicates with the running service through its configured
SageCell service URL.

The current Podman test stack uses a normal shared Podman network rather than sharing the Xronos container's network namespace. SageCell is created on `xronos-net`, and the Xronos application container is also attached to `xronos-net`.

Conceptually:

```bash
podman run -d \
  --name sagecell \
  --network xronos-net \
  -v sagecell-data:/var/lib/sagecell \
  local/sagecell-xronos:latest sagecell
```

The Xronos container is separately attached to that network. Xronos then reaches SageCell by container/network DNS name:

```bash
http://sagecell:8888/service
```

No host port publication is required for SageCell. In particular, do not add either of these merely to make a connectivity test succeed:

```bash
-p 0.0.0.0:8888:8888
-p 127.0.0.1:8888:8888
```

A host-side request to `http://127.0.0.1:8888/service` should therefore fail/refuse in the intended internal-only configuration. That is expected, not evidence that SageCell is unavailable to Xronos.

The normal test-stack startup path is `scripts/xronos-start.sh`, which ensures the required networks exist, starts SageCell, starts/attaches Xronos, and waits for the services to become ready.

Check that SageCell is healthy:

```bash
podman ps --filter name=sagecell
```

Check the internal service directly from Xronos:

```bash
podman exec devximserver \
  curl -sS --data-urlencode 'code=print(2+2)' \
  http://sagecell:8888/service
```

Smoke test through the Xronos proxy:

```bash
curl -i --max-time 90 -sS \
  --data-urlencode 'code=print(2+2)' \
  http://127.0.0.1:2022/sagecell/service
```

Expected successful body includes:

```json
"stdout": "4\n"
```

Expected header in normal local mode:

```text
X-SageCell-Proxy-Source: local
```

See `documentation/NETWORK_BINDINGS.md` before changing either Xronos host publication or SageCell network exposure.

---

## Routing Modes

### `local-with-fallback`

This is the default and recommended mode.

Behavior:

```text
1. If a local cached result exists for the exact Sage code, return it.
2. If local SageCell is not in cooldown, try local SageCell.
3. If local SageCell succeeds, cache the successful local result in the local cache.
4. If local SageCell has an infrastructure-style failure, mark local unhealthy for the cooldown period and try fallback.
5. During cooldown, use fallback for uncached requests.
6. After cooldown expires, the next uncached request tries local again.
```

Infrastructure-style failures include things like local connection failure, timeout, reset, unavailable service, or HTTP gateway/unavailable statuses such as 502, 503, or 504.

Normal Sage execution failures should not trigger fallback. For example, if local SageCell returns HTTP 200 with `success:false` because the Sage code itself has an error, that is treated as a Sage/content problem rather than a local infrastructure outage.

---

### `local-only`

Use only the local SageCell service.

Behavior:

```text
1. Use local cache if available.
2. Otherwise call SAGECELL_SERVICE.
3. Never use SAGECELL_FALLBACK_SERVICE.
```

Use this mode if fallback should be disabled.

---

### `remote-only`

Use only the fallback/remote SageCell service.

Behavior:

```text
1. Use fallback cache if available.
2. Otherwise call SAGECELL_FALLBACK_SERVICE.
3. Never call local SageCell.
```

This is intended as an emergency bypass switch if the local SageCell service should not be used.

Important: this mode is only useful if `SAGECELL_FALLBACK_SERVICE` points to a working SageCell `/service` endpoint.

---

## Cache Workflow

Xronos maintains an in-memory server-side cache for SageCell proxy responses.

This is separate from browser caching.

The cache is keyed by a SHA-256 hash of the exact Sage code submitted to `/sagecell/service`.

There are separate caches for local and fallback results:

```text
local cache
fallback cache
```

The local cache is canonical. Fallback results do not overwrite or contaminate the local cache.

### Why local and fallback caches are separate

The fallback server may run a different Sage version from the local server. This matters because Sage syntax or behavior can change over time.

A dangerous scenario would be:

```text
1. Local SageCell is temporarily down.
2. Xronos sends a request to public/fallback SageCell.
3. Public/fallback SageCell fails because it runs a different Sage version.
4. Xronos caches that failure.
5. Local SageCell comes back.
6. Future students still receive the cached public/fallback failure.
```

The current cache design avoids this.

### Cache rules

Local success:

```text
Cache in local cache.
```

Fallback success:

```text
Cache in fallback cache only.
```

Local failure:

```text
Do not cache.
```

Fallback failure:

```text
Do not cache.
```

Fallback non-2xx HTTP response:

```text
Do not cache.
Return a JSON proxy error to the browser.
```

A response is cacheable only if:

```text
HTTP status is 2xx
response body parses as JSON
response.success === true
```

This means a public/fallback Sage syntax failure or HTTP 520 failure will not poison the cache.

### Cache lookup behavior

In `local-with-fallback` mode:

```text
1. Check local cache first.
2. If local cache has the exact code hash, return it, even during a local outage.
3. If no local cached result exists and local is healthy, try local.
4. If local is in cooldown, use fallback cache/fallback server.
5. When local recovers, local results are preferred again.
```

In `remote-only` mode:

```text
Use fallback cache/fallback server.
```

In `local-only` mode:

```text
Use local cache/local server.
```

The current cache is in-memory. It is cleared when the Xronos server process/container restarts.

---

## In-Flight Request Deduplication

Xronos also tracks in-flight SageCell requests.

If multiple students request the exact same Sage code while one request is already being computed, the first request is sent to SageCell and the later requests wait for that same result.

Headers distinguish this behavior:

```text
X-SageCell-Proxy-Cache: MISS
```

for the first request, and:

```text
X-SageCell-Proxy-Cache: WAIT
```

for requests that waited on the same in-flight computation.

This reduces repeated load when many students load the same page at the same time.

---

## Fallback Failure Behavior

If local SageCell is down and fallback is attempted, but the fallback service returns a non-2xx HTTP response, Xronos converts that into a JSON error.

For example, if fallback returns:

```text
HTTP 520
error code: 520
```

Xronos returns something like:

```json
{
  "success": false,
  "stderr": "SageCell fallback service returned HTTP 520. Body: error code: 520"
}
```

This is intentionally not cached.

---

## Current Public SageCell `/service` Status

As of testing on 2026-06-03:

```bash
curl -i --max-time 90 -sS \
  --data-urlencode 'code=print(2+3)' \
  https://sagecell.sagemath.org/service
```

returned HTTP 520 from both the dev server and the production server.

However:

```bash
curl -I --max-time 30 -sS \
  https://sagecell.sagemath.org/static/embedded_sagecell.js
```

returned HTTP 200.

This suggests that the public SageCell browser embed assets are reachable, but the blocking `/service` endpoint is not currently usable as a server-side fallback endpoint from these servers.

For that reason, `SAGECELL_FALLBACK_SERVICE` should be treated as a configurable placeholder until it is pointed to a tested SageCell `/service` endpoint, such as a future dedicated Ximera SageCell service.

We are currently in contact with the public SageCell maintainers to clarify whether there is a supported public `/service` endpoint for external server-side POST requests, and whether the HTTP 520 behavior is expected, temporary, or configuration-dependent. Update this section once that conversation resolves.

---

## Testing Commands

### Test local SageCell through Xronos

```bash
curl -i --max-time 90 -sS \
  --data-urlencode 'code=print(11+1)' \
  http://127.0.0.1:2022/sagecell/service
```

Expected:

```text
X-SageCell-Proxy-Source: local
```

and body containing:

```json
"stdout": "12\n"
```

Run the same command twice. The second request should usually show:

```text
X-SageCell-Proxy-Cache: HIT-LOCAL
```

---

### Test fallback path

Stop local SageCell:

```bash
podman stop sagecell
```

Then request a new uncached code string:

```bash
curl -i --max-time 120 -sS \
  --data-urlencode 'code=print(13+1)' \
  http://127.0.0.1:2022/sagecell/service
```

If `SAGECELL_FALLBACK_SERVICE` points to the current public `https://sagecell.sagemath.org/service`, the expected result may be a clean JSON failure like:

```json
{
  "success": false,
  "stderr": "SageCell fallback service returned HTTP 520. Body: error code: 520"
}
```

The response should include:

```text
X-SageCell-Proxy-Source: fallback
```

This confirms fallback routing is occurring, even if the configured fallback endpoint itself is not usable.

---

### Test local recovery

Restart the existing SageCell container:

```bash
podman start sagecell
```

Wait for the container to become healthy:

```bash
podman ps --filter name=sagecell
```

After the fallback cooldown expires, test a new code string:

```bash
sleep 35

curl -i --max-time 90 -sS \
  --data-urlencode 'code=print(17+1)' \
  http://127.0.0.1:2022/sagecell/service
```

Expected:

```text
X-SageCell-Proxy-Source: local
```

and body containing:

```json
"stdout": "18\n"
```

---

## Logs

Normal cache/routing logs are quiet by default.

To enable normal SageCell proxy logs, set:

```bash
SAGECELL_PROXY_LOG=1
```

and restart the Xronos server container/process.

Error logs may still appear without `SAGECELL_PROXY_LOG`.

Useful log command:

```bash
podman logs --since=10m devximserver 2>&1 | grep -i "SageCell"
```

Some Podman versions require options before the container name, so use:

```bash
podman logs --since=10m devximserver
```

rather than:

```bash
podman logs devximserver --since=10m
```

---

## Operational Notes

Changing any SageCell-related environment variable requires restarting the Xronos server container/process.

In the current shared-network design, SageCell and Xronos are separate containers attached to `xronos-net`. Restarting the Xronos container does not inherently require recreating SageCell merely to repair a shared network namespace. If either container is recreated, verify that both are attached to the intended network and that Xronos still resolves `sagecell:8888`.

No frontend asset rebuild is required for changes to these environment variables.

No frontend asset rebuild is required for the SageCell routing code in `app.js` or settings in `config.js`; a server restart is sufficient.

Frontend asset rebuild is only needed when changing browser JavaScript, SCSS, or other compiled assets.

---

## Recommended Production Defaults

For a container-network deployment analogous to the current test architecture:

```bash
SAGECELL_SERVICE=http://sagecell:8888/service
SAGECELL_SERVICE_MODE=local-with-fallback
SAGECELL_FALLBACK_COOLDOWN_MS=30000
```

Do not publish raw SageCell port `8888` on the host. Xronos should reach it on the internal container network. See `documentation/NETWORK_BINDINGS.md` for the exposure rules and the `0.0.0.0` / `127.0.0.1` distinction.

Recommended once a tested dedicated Ximera SageCell fallback exists:

```bash
SAGECELL_FALLBACK_SERVICE=https://<dedicated-ximera-sagecell-host>/service
```

Optional debugging:

```bash
SAGECELL_PROXY_LOG=1
```

Emergency bypass, only if fallback endpoint is confirmed working:

```bash
SAGECELL_SERVICE_MODE=remote-only
```

### Public SageCell `/service` endpoint

The public SageCell servers should **not** be used as the fallback `/service` endpoint.

Andrey Novoseltsev confirmed by email that although `/service` exists in the SageCell codebase, the public SageCell servers do not support it. The public service is intended for interactive use with relatively small computational load, and `/service` access was disabled because automated traffic generated too much load.

Therefore:

- `https://sagecell.sagemath.org/service` is not a supported fallback target.
- `SAGECELL_FALLBACK_SERVICE` should remain configurable, but should point only to a dedicated SageCell server.
- Until the Ximera Project has its own dedicated SageCell server, the local Xronos SageCell container is the only supported `/service` endpoint.
