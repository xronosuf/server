# Production MongoDB Migration Rehearsals — 2026-08-30

## Scope

Two non-disruptive migration rehearsals were performed against logical copies of the live production MongoDB 3.2.22 `ximera` database on `ls-xronos01`.

Production remained live throughout both rehearsals. The production MongoDB data directory was not upgraded or modified by the migration work.

## Production source topology discovered

- Production Xronos runs in the legacy `xronos` container.
- The running Node application connects to MongoDB on the host through `host.containers.internal` / `10.36.32.41:27017`.
- The authoritative host MongoDB is 3.2.22 with data at `/var/lib/mongo`.
- The separate MongoDB instance bundled inside the legacy Xronos container is not the authoritative production database.
- Redis in the legacy production Xronos container is still local to that container.

## Authoritative production database size at inventory

- Physical host data directory: about 6.2 GiB.
- Logical `ximera` data size: about 14.9 GiB.
- Allocated database size including indexes: about 5.8 GiB.
- Approximately 44.9 million documents total.
- Largest collections include `users`, `states`, `sessions`, `completions`, and `ltibridges`.

## Rehearsal #1

The migration was exercised manually in stages:

1. `mongodump` from production MongoDB 3.2.22.
2. Restore documents only into MongoDB 5.0.31 using `--noIndexRestore --noOptionsRestore`.
3. Exact per-collection count verification.
4. Clean shutdown and reopen the same volume under MongoDB 6.0.27.
5. Set FCV to 6.0 and verify exact counts.
6. Clean shutdown and reopen the same volume under MongoDB 7.0.40.
7. Set FCV to 7.0 and verify exact counts.
8. Build fresh indexes from the Node 24 / Mongoose 7 application schemas.
9. Add the session TTL index.
10. Verify Node 24 / Mongoose can connect to and read representative production collections.
11. Verify isolated Redis 7.4.11 connectivity and a temporary write/read/delete round trip.

Observed timings included:

- Mongo 3.2 logical dump: 00:03:03
- Mongo 5 restore: 00:07:02
- Mongo 5 baseline exact verification: 00:08:02
- Mongo 6 exact verification: 00:07:50
- Mongo 7 exact verification: 00:04:40
- Modern application index build: 00:03:42
- Session TTL index: 00:00:08
- Post-index exact verification: 00:04:51
- Node24/Mongoose Mongo7 model acceptance: 00:00:37

### TTL finding

Once the new `sessions.expires` TTL index was active, MongoDB began removing already-expired session records asynchronously. A follow-up comparison confirmed that only `sessions` changed; durable collections such as `users`, `states`, `completions`, and `ltibridges` remained unchanged.

Required migration behavior therefore is:

- disable destination TTL processing before creating the TTL index;
- perform the final exact integrity gate while TTL processing remains disabled;
- re-enable TTL only after the migrated database has been accepted as correct and the cutover is ready to proceed.

## Rehearsal #2 — committed script

Commit `9248d6c75161e7c2ce9d62027ae272c5ebd8ad50` added:

`scripts/modernization/migrate-production-mongo3-to-mongo7.sh`

A completely fresh rehearsal copy was created after deleting the bulky first rehearsal dump and Mongo volume. The committed script then reproduced the complete migration successfully.

Captured destination snapshot: 44,927,948 documents restored successfully with zero restore failures.

The exact captured snapshot was preserved through:

- MongoDB 5.0.31 restore;
- MongoDB 6.0.27 / FCV 6.0;
- MongoDB 7.0.40 / FCV 7.0;
- fresh modern application index creation;
- Node 24 / Mongoose application reads;
- isolated Redis 7 acceptance;
- final exact integrity verification.

Rehearsal #2 timing summary:

| Phase | Time |
| --- | ---: |
| Source exact count scan before dump | 00:06:28 |
| Mongo 3.2 logical dump | 00:03:05 |
| Source exact count scan after dump | 00:04:22 |
| Start Mongo 5 + restore | 00:07:22 |
| Mongo 5 exact count verification | 00:08:25 |
| Mongo 5 -> 6 + FCV 6.0 | 00:00:09 |
| Mongo 6 exact count verification | 00:08:03 |
| Mongo 6 -> 7 + FCV 7.0 | 00:00:10 |
| Mongo 7 pre-index exact verification | 00:04:40 |
| Modern indexes + session TTL index | 00:03:51 |
| Mongo 7 post-index exact verification | 00:04:50 |
| Node 24 / Mongoose data acceptance | 00:00:35 |
| Isolated Redis 7 acceptance | 00:00:03 |
| Final exact integrity gate | 00:04:56 |
| **Total script runtime** | **00:57:00** |

The Mongo binary/FCV transitions themselves take only seconds. Most elapsed time is exact integrity scanning and restore/index work.

## Cutover policy

Correctness has priority over minimizing downtime. On maintenance day, students must not be allowed back onto Xronos until the migrated MongoDB 7 database has passed the complete integrity and application compatibility gates.

The final cutover procedure should therefore:

1. quiesce the legacy application;
2. disable source TTL cleanup;
3. capture and verify a frozen source snapshot;
4. migrate that snapshot using the rehearsed 3.2 -> 5 -> 6 -> 7 path;
5. keep destination TTL cleanup disabled while validating exact counts;
6. build the modern indexes;
7. verify exact counts again;
8. run Node 24 / Mongoose acceptance against the migrated database;
9. declare the migrated database safe;
10. switch explicitly to the modern Xronos + Mongo 7 + Redis 7 stack;
11. re-enable normal TTL processing only after the integrity gate and planned cutover point.

The original MongoDB 3.2 host data remains the rollback source until the modern stack is accepted and new student writes are allowed.
