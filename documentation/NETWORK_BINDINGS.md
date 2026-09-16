# Xronos network and port binding reference

This note records the distinction between container-internal listeners, host-published ports, and container-network-only services. It exists primarily to avoid repeating the `0.0.0.0` / `127.0.0.1` confusion during future Xronos and SageCell maintenance.

## The important distinction

A process listening on `0.0.0.0` **inside a container** is not the same thing as Podman publishing a port on `0.0.0.0` **on the host**.

For example, the Xronos Node process normally listens on container port `2000`. It may listen on all interfaces in its own container namespace. That is ordinary container behavior and does not by itself expose port 2000 on the host.

Host exposure happens when Podman is given a publish rule such as:

```bash
-p 0.0.0.0:2022:2000
```

That means:

```text
host 0.0.0.0:2022  ->  container port 2000
```

Here, `0.0.0.0` is significant: host port `2022` is bound on all host interfaces rather than only on host loopback.

By contrast:

```bash
-p 127.0.0.1:2022:2000
```

means that the published port is reachable only through the host loopback interface.

## Current development/test Xronos behavior

`scripts/xronos-start.sh` currently creates the development/test Xronos application container with:

```bash
-p "0.0.0.0:${APP_HOST_PORT}:${APP_CONTAINER_PORT}"
```

with the defaults:

```text
APP_HOST_PORT=2022
APP_CONTAINER_PORT=2000
```

Therefore a normal test deployment appears in `podman ps` as approximately:

```text
0.0.0.0:2022->2000/tcp
```

That is an intentional host publication of the **Xronos web application** in the current test setup. It should not be copied automatically to internal backend services.

For a host reverse-proxy deployment where nginx is the only component that needs to reach Xronos directly, prefer a loopback host binding, for example:

```text
127.0.0.1:2000 -> container port 2000
```

unless the deployment deliberately requires direct access on other host interfaces.

## SageCell must remain an internal service

The current test stack runs SageCell as a separate container on the shared `xronos-net` network. It is **not** published to a host port.

Xronos reaches SageCell through the container network using:

```bash
SAGECELL_SERVICE=http://sagecell:8888/service
```

The expected path is therefore:

```text
browser
  -> Xronos published web port
      -> Xronos /sagecell/service proxy
          -> http://sagecell:8888/service on xronos-net
```

There should normally be no host rule such as:

```bash
-p 0.0.0.0:8888:8888
```

or:

```bash
-p 127.0.0.1:8888:8888
```

for SageCell. Raw SageCell port `8888` is an implementation service and should not be exposed directly to students, browsers, or the public internet.

Consequently, this host-side test is expected to fail/refuse when the stack is configured correctly:

```bash
curl http://127.0.0.1:8888/service
```

while this container-network test should work from the Xronos container:

```bash
podman exec devximserver \
  curl -sS --data-urlencode 'code=print(2+2)' \
  http://sagecell:8888/service
```

The normal external test should go through the Xronos proxy instead:

```bash
curl -sS --data-urlencode 'code=print(2+2)' \
  http://127.0.0.1:2022/sagecell/service
```

## Reading `podman ps` correctly

Examples:

```text
0.0.0.0:2022->2000/tcp
```

means that the host publishes port 2022 on all interfaces and forwards it to port 2000 in the container.

```text
127.0.0.1:2022->2000/tcp
```

means that the host publishes port 2022 only on loopback.

No `PORTS` entry for a container does **not** mean that the service is unreachable from other containers. Containers attached to the same Podman network can still communicate by container/network DNS name and container port.

That is the intended SageCell case.

## Useful verification commands

See the actual host publication for Xronos:

```bash
podman port devximserver
```

Inspect the application networks:

```bash
podman inspect devximserver \
  --format '{{range $name, $net := .NetworkSettings.Networks}}{{$name}} {{end}}'
```

Inspect SageCell networks:

```bash
podman inspect sagecell \
  --format '{{range $name, $net := .NetworkSettings.Networks}}{{$name}} {{end}}'
```

Verify the intended internal SageCell endpoint from Xronos:

```bash
podman exec devximserver \
  curl -sS --data-urlencode 'code=print(2+2)' \
  http://sagecell:8888/service
```

Verify that SageCell was not accidentally host-published:

```bash
podman port sagecell
```

For the intended internal-only setup, that command should report no published host port for `8888`.

## Maintenance rule

When adding or changing a container, decide explicitly which of these categories applies before adding `-p`:

1. **Public/reverse-proxied application endpoint** — may need a host publication. Choose `127.0.0.1` or `0.0.0.0` deliberately based on who must reach it.
2. **Container-to-container backend service** — normally attach it to the appropriate Podman network and do **not** publish its service port on the host.
3. **Temporary diagnostic publication** — document it as temporary and remove it when the diagnostic is finished.

In particular, do not use `0.0.0.0` merely because it makes a connectivity test succeed. It changes the host exposure boundary.