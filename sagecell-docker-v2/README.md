# SageCell Docker image for Xronos

Default build is service-only and targets the SageCell `/service` endpoint used for server-side Sage computations.

```bash
docker build -t local/sagecell-xronos .
docker run --rm -p 8888:8888 --name sagecell local/sagecell-xronos
```

Smoke test from another terminal:

```bash
curl -fsS -X POST --data-urlencode 'code=print(2+2)' http://localhost:8888/service
```

or:

```bash
./smoke-test.sh local/sagecell-xronos
```

For Docker Compose:

```bash
docker compose up --build
```

Inside a Compose network, point Xronos to:

```text
http://sagecell:8888
```

Optional browser UI/static build:

```bash
docker build --build-arg BUILD_STATIC=1 -t local/sagecell-xronos:full .
```

The optional static build is more fragile because SageCell's Makefile assumes certain Sage-shipped JSmol/Jmol/threejs locations and fetches vendor JS during build.
