# Provider observation adoption truth — 2026-08-22

**Technical adoption:** `COMPLETE`
**Database mutation by adoption verification:** `NONE`
**Closure OS Work 480:** `OPEN`

Provider-observation adoption is technically complete. This statement is limited to the
read-only adoption proof and its implementation evidence. It does not settle Work 480: only the
canonical append-only Closure authority can admit that disposition.

## Authority and state verified

- The canonical store default is `.deckent/provider-execution-observations.db`, exported as
  `PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH`. Read-only store access uses
  `readonly: true` and `fileMustExist: true`; it cannot create or migrate database authority.
- Adoption compares two explicit authorities: an immutable schema-v1 database or exact retained
  backup (`v1PreimagePath`), and the current schema-v2 database (`currentDatabasePath`). Both are
  opened read-only, must be regular non-symlink files, and must match their exact schema versions
  and table shapes.
- The preserved v1 preimage remains legacy evidence. Its rows must appear in v2 with `run_id =
  NULL` and `retired = 0`; adoption never invents run ownership for them.
- Current v2 rows not present in the v1 preimage are accepted only when they carry a non-empty
  `run_id`. They are reported separately as extra run-owned rows and never contaminate the legacy
  lineage.

## Lineage and receipt semantics

The proof is row-exact, not count-only. It compares every legacy interval field, including the
original `start_json` and `end_json` strings byte-for-byte, and compares every contradiction row.
It binds the following into the plan and verifier receipt:

- source and target database byte digests;
- source and adopted-legacy row-lineage digests;
- adopted legacy row count;
- the sorted identities, run IDs, and retirement states of additional run-owned v2 rows; and
- the content-bound plan digest.

Verification re-inspects both files and recomputes the plan. Any post-plan file or plan change
fails closed as `CONCURRENT_CHANGE`. A successful verifier-produced receipt declares
`databaseMutation: "none"`; the verifier returns the receipt value but does not write it or open a
writable database. Repeating verification against unchanged inputs is receipt-stable and leaves
both database byte sequences unchanged.

The compiled adoption evidence confirms the production instance of these semantics: the
canonical v2 database contained 898 interval rows, with all 43 historical v1 interval rows
matched and 855 additional rows classified as run-owned. The aggregate receipt reports
`databaseMutation=none`, and the source and current database digests were unchanged before and
after verification. Published evidence remains aggregate and redacted; this note does not
reproduce raw provider, execution, tenant, project, receipt, or filesystem identities.

## Migration is not adoption

Migration and adoption have distinct authority and effects:

- A v1→v2 migration is a separately approved mutation. Its tests require authenticated,
  project-, tenant-, generation-, and digest-bound allow authority; denial, expiry, tamper, or
  mismatch fails before filesystem mutation.
- Migration preserves an exact backup and legacy lineage. Replay after the database is already
  v2 returns `already-current` and does not assign legacy ownership.
- Adoption only verifies an already-current v2 database against the preserved v1 preimage. An
  existing migration, backup, or migration receipt is not implicit adoption, and adoption does
  not authorize migration replay.

Accordingly, no database apply, owner decision, or mutation is performed or inferred by this
evidence note.

## Closure boundary

The implementation, canonical-path selection, v1-preimage preservation, v2 lineage proof,
receipt semantics, and no-mutation replay behavior are complete. Work 480 remains `OPEN` only at
its canonical settlement boundary: MASTER state and the append-only Closure ledger are outside
this implementation evidence. This note is not a Closure disposition, cannot mark the work
`DONE`, and does not convert a different-provider verification `HOLD` into a seal.

## Evidence basis

- `src/core/provider-execution-observation-store.ts`
- `src/core/provider-execution-observation-adoption.ts`
- `tests/core/provider-execution-observation-adoption.test.ts`
- `tests/core/provider-execution-observation-migration.test.ts`
- `tests/core/provider-execution-observation-migration-approval.test.ts`
- `docs/evidence/PROVIDER-OBS-MIGRATION-001-result-2026-08-22.md`
- `docs/evidence/PROVIDER-OBS-MIGRATION-001-verification-2026-08-22.md`
