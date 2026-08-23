# Provider-observation adoption: disk inventory

**Observed:** 2026-08-22 UTC
**Mode:** read-only
**Audience:** operators deciding whether the current provider-observation database has durable adoption authority

## Decision

The current disk authority is the schema-v2 database and its aggregate row lineage. There is **no
persisted adoption receipt** established by the inspected production implementation. The missing
component is a durable receipt writer: verification constructs and returns a receipt in memory,
and the CLI projects that receipt to output, but neither path stores it. Therefore a prior prose
claim that an “existing immutable adoption receipt” was matched is not receipt proof and cannot
authorize replay.

No database or ledger was written while preparing this inventory. Raw provider principal,
execution, run, task, attempt, tenant, project, user, or receipt identities are intentionally
omitted.

## Predecessor disposition

The immediately preceding run remains visible as historical evidence; it is not rewritten into a
successful adoption. The archived manifest for `sprint-1780659451557` records the terminal outcome
as **`ABORTED`**. Its run stopped at **7 of 20** planned tasks. The manifest preserves 148 artifacts
and reports no archive conflicts, but artifact retention does not upgrade the aborted outcome or
create adoption-receipt authority.

This inventory therefore carries two truths forward without merging them:

- predecessor execution truth: `sprint-1780659451557` is `ABORTED` at 7/20; and
- current disk truth: the retained v1 preimage has 43 rows and the current v2 aggregate has 898
  rows, comprising those 43 matched legacy rows plus 855 run-owned rows.

The predecessor remains provenance only. It cannot replace a fresh read-only disk comparison, and
neither its prose nor its retained artifacts are treated as a durable adoption receipt.

## Exact production caller inventory

The bounded production sources expose this chain:

1. `registerProviderObservations()` registers `provider-observations adopt`.
2. The command action calls the private `render('adoption', ...)`.
3. `render()` calls the private `defaultAdoption()` unless a dependency is injected.
4. `defaultAdoption()` calls, in order:
   - `inspectProviderExecutionObservationAdoption()`;
   - `planProviderExecutionObservationAdoption()`;
   - only with `--apply` and an exact plan digest,
     `verifyProviderExecutionObservationAdoption()`.
5. `providerObservationJson()` redacts the returned aggregate projection for `--json`.

Within the two inspected production source files, `defaultAdoption()` is the sole production
caller of the three adoption functions. The compiled CLI entry contains the registered command
surface, but the attempted compiled inspection was stopped by the binary-identity guard before
the command handler ran.

## Persisted receipt inventory

| Artifact class | Persisted count established on disk | Authority |
|---|---:|---|
| Schema-v1 preimage database | 1 | Immutable source preimage for byte- and row-lineage comparison |
| Current schema-v2 database | 1 | Current live aggregate and row-lineage authority |
| Adoption plan | 0 | Returned/projected value only; no writer in the adoption implementation |
| Adoption receipt | 0 | Returned/projected value only; no durable writer in the adoption implementation |
| Replay receipt | 0 | No replay producer or replay path exists in the adoption implementation |

This table counts only artifacts backed by an identified persistence path. Prose, terminal output,
and an in-memory `ProviderExecutionObservationAdoptionReceipt` do not increase the persisted
receipt count.

## Schema and aggregate row evidence

The disk-backed evidence previously measured by the compiled command is:

| Evidence | Schema | Rows |
|---|---:|---:|
| Historical claim from 2026-08-03 | v1 | 53 legacy intervals |
| Current immutable preimage | v1 | 43 historical rows |
| Current database | v2 | 898 total rows |
| Legacy rows matched byte-for-byte into v2 | v1 projection over v2 | 43 |
| Additional run-owned v2 rows | v2 | 855 |

The arithmetic closes: **43 + 855 = 898**. The adoption inspector does not accept that arithmetic
as proof by itself. It opens both databases read-only, requires exact schema versions and columns,
compares every legacy row projection (including original start/end JSON strings), compares
contradiction rows, requires legacy v2 rows to remain unowned and not retired, rejects every
unowned extra row, and computes database and lineage digests. The current evidence reported equal
source and adopted-legacy lineage for all 43 historical rows.

The MASTER plan explicitly labels the 53-row statement as a stale, bounded 2026-08-03 snapshot,
not a current-live fact. It must not be combined with the 43-row current preimage or used as a
migration/replay input.

## Why there is no receipt and no replay authority

`verifyProviderExecutionObservationAdoption()` re-inspects both files, checks the plan digest, and
returns a frozen receipt whose `databaseMutation` value is `none`. It opens no writable database.
Neither it nor `defaultAdoption()` calls a file, database, ledger, or receipt-store writer.
`providerObservationJson()` only serializes the receipt subset to stdout.

Consequently:

- verification can prove the two files matched at that invocation;
- stdout can carry redacted aggregate evidence;
- no durable artifact records that invocation after the process exits;
- no consumer can load a receipt and bind a later replay to it; and
- `--apply` is verification naming, not database mutation or durable adoption.

The earlier compiled result document is useful provenance for the 43/855/898 measurement, but its
statement that an existing immutable receipt was matched is unsupported by a receipt path or
writer in the inspected production code. Under the task's evidence rule, that statement remains
prose rather than receipt proof.

## Command check

Command executed exactly:

```text
node dist/cli/entry.js provider-observations inspect --json
```

The binary-identity guard returned `DECKENT_BINARY_IDENTITY_HOLD` with reason
`build-root-mismatch` before inspection. No JSON aggregate was emitted and no database was opened
by the command handler. This is a fail-closed source/build authority result, not permission to
build during this documentation-only task and not evidence that the database or receipt state
changed.

## Current authority and next closure

Until a durable, append-only, content-bound receipt writer and reader are wired, the current
authority is limited to a fresh read-only comparison of the immutable v1 preimage and current v2
database. A later replay must remain blocked unless it can load a persisted receipt, validate its
file and lineage bindings against fresh disk state, and fail closed on any mismatch. The missing
durable writer—not row migration—is the adoption-authority gap identified by this inventory.
