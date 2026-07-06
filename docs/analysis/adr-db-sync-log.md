# ADR DB Sync Log — 2026-07-06 (Task 375-002)

Processes the 2026-07-06 acceptances into `.brain/memory.db` (SSOT): `adr-d-009`, `adr-d-010`,
`adr-d-011` (Option C), `adr-d-012`, `adr-d-013` (Option C). Script:
`scripts/adr-db-sync-2026-07-06.mjs`.

## Pre-existing state finding

Before writing any code, the DB was queried read-only to inspect the existing `adr`-type row
schema (per task instructions: "mevcut adr-tipli kayıt-şemasını ÖNCE DB'den oku"). All 5 target
rows were **already present** in `.brain/memory.db`, `status='accepted'`, `adr_class='D'`,
`updated_at` timestamps `2026-07-06 12:07:43`–`44` — a few minutes before this task's own
`createdAt` (`12:11:46`). `dist/core/adr-file-sync.js` was freshly built at `12:09`.

This is consistent with `.tasks/task-375-002.partial-result` (a pre-existing marker stating a
prior run of this same task id was killed before it could write its `.result` file): the DB-side
sync work evidently completed before that crash. Both `adr-d-011` and `adr-d-013` DB content
already contain "Option C" language, matching the task's stated selected options.

This did not make the task moot — the deliverable is a checked-in, reusable, idempotent sync
script plus this evidence log, not a one-off manual DB edit.

## Approach

`scripts/adr-db-sync-2026-07-06.mjs` reuses the existing forward-sync primitives from
`src/core/adr-file-sync.ts` — `parseAdrFile` + `adrToEntryInput` (the same functions
`identity-generator.ts`'s post-finalize hook and `src/cli/commands/memory.ts`'s `rebuild` action
already use) — applied to exactly the 5 target `docs/adr/*.md` files, with the identical
skip-if-unchanged idempotency rule `syncAdrFilesToDb` uses (compare title + content + status +
sprint_id against the existing row; skip if all match, else `store.upsert`). Scoping to the 5
named files (rather than sweeping the whole `docs/adr/` directory via `syncAdrFilesToDb`
directly) keeps the run surgical — no unrelated ADR row is touched.

Writes go through `MemoryStore.upsert` only (insert-if-absent / field-level update +
`entry_history` row) — no `DELETE`, no schema change. `--apply` takes a `.brain/memory.db.bak-*`
snapshot first (gitignored, matches the `scripts/sprint-166/167-memory-backfill.mjs` precedent).

## Run 1 — dry-run (`node scripts/adr-db-sync-2026-07-06.mjs`)

```
PRE STATE:
  {"id":"adr-d-009","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:43"}
  {"id":"adr-d-010","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:43"}
  {"id":"adr-d-011","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:43"}
  {"id":"adr-d-012","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:44"}
  {"id":"adr-d-013","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:44"}

STAGE: parse + idempotency-check + upsert (5 target files)
  SKIP (already in sync): adr-d-009
  SKIP (already in sync): adr-d-010
  SKIP (already in sync): adr-d-011
  SKIP (already in sync): adr-d-012
  SKIP (already in sync): adr-d-013

SUMMARY: {"inserted":0,"updated":0,"skipped":5,"errors":[]}
Mode: DRY-RUN (no writes)
```

## Run 2 — apply (`node scripts/adr-db-sync-2026-07-06.mjs --apply`)

```
.bak created: .brain/memory.db.bak-pre-adr-db-sync-2026-07-06-2026-07-06T12-15-55-074Z

STAGE: parse + idempotency-check + upsert (5 target files)
  SKIP (already in sync): adr-d-009
  SKIP (already in sync): adr-d-010
  SKIP (already in sync): adr-d-011
  SKIP (already in sync): adr-d-012
  SKIP (already in sync): adr-d-013

POST STATE:
  {"id":"adr-d-009","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:43"}
  {"id":"adr-d-010","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:43"}
  {"id":"adr-d-011","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:43"}
  {"id":"adr-d-012","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:44"}
  {"id":"adr-d-013","status":"accepted","adr_class":"D","updated_at":"2026-07-06 12:07:44"}

SUMMARY: {"inserted":0,"updated":0,"skipped":5,"errors":[]}
Mode: APPLIED (bak: .brain/memory.db.bak-pre-adr-db-sync-2026-07-06-2026-07-06T12-15-55-074Z)
```

## Idempotency proof

`--apply` produced **zero writes** (`updated_at` identical pre/post for all 5 ids, `inserted:0,
updated:0, skipped:5`) — the DB content already matched `docs/adr/*.md` byte-for-byte
(title + content + status + sprint_id). A second `--apply` run would produce the identical
`skipped:5` result, since no state changed. The `.bak` snapshot was created (non-destructive
safety net per the established backfill-script convention) but is unused, as no restore was
needed.

## Verification

- `store.getByType('adr')`-equivalent query (`SELECT id,status,adr_class,updated_at FROM entries
  WHERE id IN (...)`) — confirmed 5 rows, all `status='accepted'`, `adr_class='D'` (evidence
  above).
- `.brain/memory.db` schema: unchanged. `MemoryStore`'s `initSchema()` only runs `CREATE TABLE IF
  NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` — a no-op against an already-initialized schema.
  `sqlite_master` table+index count: 35 (unchanged across both runs).
- No `DELETE`, no `DROP`, no raw schema DDL anywhere in the new script — only
  `MemoryStore.upsert` (2 call sites, both behind an `if (existing) {...} else {...}` guarded by
  the skip-if-unchanged check).
- `git status` / `git diff --stat`: only `scripts/adr-db-sync-2026-07-06.mjs` (new, untracked)
  and this log file are attributable to this task; `.brain/memory.db` and its `.bak-*` sibling
  are gitignored (`.gitignore:21` and `:24`).
- `npx tsc --noEmit`: clean (0 errors). The new file is a `.mjs` script outside the TypeScript
  project; no `src/` code was touched, so this run also confirms no regression from unrelated
  concurrent sprint-375 work in this shared workspace.
