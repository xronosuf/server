# Xronos legacy modernization

This branch (`legacy-modernization`) is an incremental modernization of the cleaned-up legacy Xronos server. The goal is to move the remaining legacy service onto supported infrastructure with the smallest practical compatibility risk while the replacement server is being developed.

## Current modernization strategy

1. Separate infrastructure services from the Xronos application container.
2. Establish a supported container/base OS and Node.js runtime.
3. Upgrade or replace only the application dependencies that block the supported runtime or present meaningful security/support concerns.
4. Avoid expensive browser/UI migrations (for example MathJax major-version migrations) unless a concrete security requirement makes them necessary.
5. Validate each compatibility boundary on the test server before proceeding to the next one.

## External MongoDB and Redis support

Historically `start.sh` always launches both `mongod` and `redis-server` inside the Xronos application container. On this branch that remains the default for compatibility, but the bundled service launches can be disabled independently:

- `XIMERA_START_MONGODB=0` prevents `start.sh` from launching the bundled `mongod`.
- `XIMERA_START_REDIS=0` prevents `start.sh` from launching the bundled `redis-server`.

MongoDB configuration supports either a complete URI or the older host/database pair:

```text
XIMERA_MONGO_URI=mongodb://mongo-host:27017/ximera
```

or:

```text
XIMERA_MONGO_URL=mongo-host:27017
XIMERA_MONGO_DATABASE=ximera
```

When `XIMERA_MONGO_URI` is set, it takes precedence. If it is unset, the historical URI is constructed as `mongodb://<XIMERA_MONGO_URL>/<XIMERA_MONGO_DATABASE>`.

Redis continues to use `XIMERA_REDIS_URL` and `XIMERA_REDIS_PORT`.

## MongoDB 5 compatibility bridge

MongoDB 5.0.31 is used only as a temporary compatibility bridge while the application is still running Node 12 and Mongoose 5.13. It is not the final security target.

The bridge infrastructure is deliberately reproducible from repository scripts:

```bash
bash scripts/modernization/provision-mongo5-bridge.sh --status
bash scripts/modernization/provision-mongo5-bridge.sh --create
bash scripts/modernization/test-mongo5-bridge.sh
```

`provision-mongo5-bridge.sh --create` manages these default resources:

- application container: `devximserver`
- private Podman network: `xronos-modernization-net`
- bridge Mongo container: `xronos-mongo5-bridge`
- persistent bridge volume: `xronos-mongo5-data`
- bridge image: `docker.io/library/mongo:5.0.31-focal`

The provisioning script is idempotent: it reuses the expected network, volume, and container when they already exist. It does **not** dump, restore, delete, or switch the live Xronos database.

`test-mongo5-bridge.sh` waits for the bridge Mongo server, checks container-to-container networking, initializes the real Xronos `mdb.js` against a disposable `ximera_connectivity_test` database, removes that disposable database, and finally verifies representative counts from the still-running original internal MongoDB.

The data migration will remain a separate explicit operational step. It must not run automatically merely because the repository is pulled or the application container starts.

## Baseline test-container inventory (2026-08-28)

The pre-modernization test application container reported:

- Debian GNU/Linux 9 (stretch)
- Node.js 12.22.12
- npm 6.14.16
- MongoDB server/shell 3.2.11
- Redis 3.2.6
- Git 2.11.0
- glibc 2.24

The existing MongoDB 3.2 test database uses WiredTiger. The `ximera` database is small (about 58 MiB logical data), has ten ordinary collections, no special collection options, and conventional Mongoose-created indexes plus the expected session TTL index.

These versions motivate replacing the legacy base container rather than attempting an in-place OS/runtime upgrade.

## Provisional runtime target

Node.js 24 LTS is the provisional target. Node.js 22 remains acceptable if repository testing finds a material reduction in migration effort. The choice should be based on actual compatibility blockers rather than version preference.

## Deliberately deferred work

The following changes are intentionally deferred until the external-service boundary is tested:

- migration of the existing Xronos data into the bridge Mongo container;
- final supported MongoDB server version selection;
- Mongoose / MongoDB Node driver / connect-mongo upgrade;
- Node.js base-image replacement;
- NodeGit replacement or compatibility work;
- Redis extraction;
- general npm dependency upgrades.
