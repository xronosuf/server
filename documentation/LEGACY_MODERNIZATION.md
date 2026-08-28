# Xronos legacy modernization

This branch (`legacy-modernization`) is an incremental modernization of the cleaned-up legacy Xronos server. The goal is to move the remaining legacy service onto supported infrastructure with the smallest practical compatibility risk while the replacement server is being developed.

## Current modernization strategy

1. Separate infrastructure services from the Xronos application container.
2. Establish a supported container/base OS and Node.js runtime.
3. Upgrade or replace only the application dependencies that block the supported runtime or present meaningful security/support concerns.
4. Avoid expensive browser/UI migrations (for example MathJax major-version migrations) unless a concrete security requirement makes them necessary.
5. Validate each compatibility boundary on the test server before proceeding to the next one.

## External MongoDB and Redis support

`config.js` already supports an external MongoDB host through `XIMERA_MONGO_URL` and database name through `XIMERA_MONGO_DATABASE`. It likewise supports Redis through `XIMERA_REDIS_URL` and `XIMERA_REDIS_PORT`.

Historically `start.sh` always launches both `mongod` and `redis-server` inside the Xronos application container. On this branch that remains the default for compatibility, but the bundled service launches can be disabled independently:

- `XIMERA_START_MONGODB=0` prevents `start.sh` from launching the bundled `mongod`.
- `XIMERA_START_REDIS=0` prevents `start.sh` from launching the bundled `redis-server`.

For an external MongoDB service, set both:

```text
XIMERA_START_MONGODB=0
XIMERA_MONGO_URL=<mongo-host-or-host:port>
```

`mdb.js` currently constructs the application URI as:

```text
mongodb://<XIMERA_MONGO_URL>/<XIMERA_MONGO_DATABASE>
```

The database-driver/Mongoose layer has not yet been modernized. A compatible external MongoDB target must therefore be established and tested before changing the application runtime or database packages.

## Baseline test-container inventory (2026-08-28)

The pre-modernization test application container reported:

- Debian GNU/Linux 9 (stretch)
- Node.js 12.22.12
- npm 6.14.16
- MongoDB server/shell 3.2.11
- Redis 3.2.6
- Git 2.11.0
- glibc 2.24

These versions motivate replacing the legacy base container rather than attempting an in-place OS/runtime upgrade.

## Provisional runtime target

Node.js 24 LTS is the provisional target. Node.js 22 remains acceptable if repository testing finds a material reduction in migration effort. The choice should be based on actual compatibility blockers rather than version preference.

## Deliberately deferred work

The following changes are intentionally deferred until the external-service boundary is tested:

- MongoDB server version selection and data migration;
- Mongoose / MongoDB Node driver / connect-mongo upgrade;
- Node.js base-image replacement;
- NodeGit replacement or compatibility work;
- Redis extraction;
- general npm dependency upgrades.
