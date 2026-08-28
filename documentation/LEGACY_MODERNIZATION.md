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

The compatibility test on `ls-xronos03` succeeded with Node 12.22.12, Mongoose 5.13.14, and MongoDB 5.0.31.

### Guarded bridge data migration

Existing test data is copied only by the separate explicit migration script:

```bash
bash scripts/modernization/migrate-mongo3-to-mongo5-bridge.sh --check
bash scripts/modernization/migrate-mongo3-to-mongo5-bridge.sh --migrate
bash scripts/modernization/migrate-mongo3-to-mongo5-bridge.sh --migrate-quiesced
```

The migration script:

- refuses a normal migration unless the destination database is empty;
- has a quiesced mode that temporarily pauses `node app.js` and disables the source TTL monitor while making an exact snapshot;
- streams BSON from the bundled MongoDB directly into the bridge rather than writing an unprotected database dump into the repository;
- restores documents only (`--noIndexRestore` and `--noOptionsRestore`) so legacy MongoDB 3.2 index metadata is not imported into MongoDB 5;
- verifies exact document counts with `find({}).itcount()` rather than relying on MongoDB 3.2's stale collection count metadata;
- restores the TTL monitor and resumes Node automatically after the quiesced copy.

Application indexes are rebuilt natively on MongoDB 5 with:

```bash
bash scripts/modernization/build-mongo5-indexes.sh --build
```

This recreates the current Mongoose schema indexes and the `connect-mongo` session TTL index. The destination indexes on the test host were verified as MongoDB index version 2 rather than imported MongoDB 3.2 version-1 metadata.

### Test-server cutover completed 2026-08-28

`ls-xronos03` / `devximserver` was successfully cut over to the external MongoDB bridge after a final quiesced copy and native index rebuild.

Verified post-cutover state:

- `XIMERA_START_MONGODB=0` is stored in `repositories/.env`;
- `XIMERA_MONGO_URI='mongodb://xronos-mongo5-bridge:27017/ximera'` is stored in `repositories/.env`;
- bundled `mongod` does not run inside `devximserver`;
- Redis remains bundled and unchanged;
- the running Node 12 / Mongoose 5 application connects to MongoDB 5.0.31;
- the external database received new live `users` / `sessions` activity after cutover;
- the service returned HTTP 200 after restart;
- the original MongoDB 3.2 data remains on the application-container storage as a rollback source;
- `configure-external-mongo.sh` recorded a protected `.env` backup for configuration rollback.

The first cutover restart required Podman to SIGKILL the old container after SIGTERM did not stop it within ten seconds. The legacy `start.sh` ended in an `npm run start | tee` pipeline, preventing Node from receiving the container stop signal directly. `start.sh` has therefore been changed so `node app.js` becomes PID 1 while output is still mirrored to the per-start logfile.

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

The following changes are intentionally deferred until the external MongoDB cutover and shutdown behavior are validated:

- final supported MongoDB server version selection;
- Mongoose / MongoDB Node driver / connect-mongo upgrade;
- Node.js base-image replacement;
- NodeGit replacement or compatibility work;
- Redis extraction;
- general npm dependency upgrades.
