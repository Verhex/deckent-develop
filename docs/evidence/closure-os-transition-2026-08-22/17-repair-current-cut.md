# Current MASTER projection measurement after canonical regeneration

**Measured:** 2026-08-22
**Mode:** Read-only post-regeneration measurement
**Verdict:** **GO — canonical source and both generated projections are in parity**

This note records the current cut after the Brain-owned canonical writer regenerated the projections. `docs/MASTER-PLAN.md` remains the only writable work-plan authority. The Markdown and JSON files under `docs/generated/` are derived, read-only views; this task did not hand-edit them or change a Work status, priority, dependency, or owner disposition.

## Current canonical and projected counts

The canonical ledger contains **521 rows**. The regenerated projections report the same population:

| Measure | Current value |
| --- | ---: |
| Total canonical rows | **521** |
| Active rows | **456** |
| Terminal rows | **65** |
| Receipt registry entries | **187** |

The current state distribution is `361 OPEN`, `0 READY`, `0 IN_PROGRESS`, `69 BLOCKED`, `26 VERIFY`, `65 DONE`, `0 DEFERRED`, and `0 DISPOSED`. The generated JSON identity registry contains all 521 canonical identities, while its active `workItems` projection contains 456 rows.

Both generated files now bind the canonical normalized-LF source digest:

`sha256(normalized-lf-utf8):21c1c4d1fc00e2aeecdf14c7c207896af12af2be10c495e771b7afc0e48266d1`

## Work 7084 and Work 480

| Work | Definition identity | State / priority | Dependencies | Truth | Projection result |
| ---: | --- | --- | --- | --- | --- |
| 7084 | `CLOSURE-OS-TRANSITION-TRUTH-001` | `OPEN / P1` | `—` (empty) | `1/0/0/0/0/?/?` | Present with the same identity and fields in regenerated Markdown and JSON |
| 480 | `PROVIDER-OBS-MIGRATION-001` | `OPEN / P1` | `—` (empty) | `1/0/0/?/0/?/?` | Present with the same identity and fields in regenerated Markdown and JSON |

These are measurements, not transitions. Work 7084's outcome still includes the phrase “projection drift”; that phrase defines the admitted repair outcome and is not evidence that the current generated files remain stale. Work 480 remains open because its owner-controlled live migration acceptance is not settled by projection regeneration.

## Current cut versus sprint 1555

Sprint 1555's historical observation is preserved in [`02-master-parity.md`](02-master-parity.md). At that cut, the canonical scan already measured `521 total / 456 active / 65 terminal`, but the checked-in generated files were rejected as stale: they embedded the older normalized source digest `31bcf72f940f4e42058eff2496397f0586ad5915dc8f335bb54a3d520bd68cbb`, while the canonical scan reported `21c1c4d1fc00e2aeecdf14c7c207896af12af2be10c495e771b7afc0e48266d1`. The check exited 1.

That stale-projection result is historical evidence, not the current repository state. After the canonical writer ran, both projections carry the current `21c1…66d1` digest, retain the same `521 / 456 / 65` counts, and pass deterministic whole-file comparison. Regeneration repaired projection bytes; it did not alter the canonical row count or dispose, reprioritize, or transition Work 7084 or Work 480.

## Declared check

`node scripts/lint-master-plan.mjs --check` exits **0** and reports:

- `docs/generated/master-plan-active.md` — `in-sync`
- `docs/generated/master-plan-active.json` — `in-sync`
- `OK — 521 rows, 456 active, 187 receipts, 13 blocker classes; projections in sync`

The exact current projection truth is therefore green. Sprint 1555's red result remains an explicit, time-bounded historical cut.
