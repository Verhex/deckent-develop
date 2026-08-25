# MASTER and generated projection parity measurement

Measured read-only on 2026-08-22. `docs/MASTER-PLAN.md` is the canonical authority. The generated Markdown and JSON files are derived projections only; this measurement does not use either generated file as authority and does not regenerate or settle them.

## Canonical rows

| Work | Definition identity | Status | Priority | Dependencies | Truth counts |
|---:|---|---|---|---|---|
| 7084 | `CLOSURE-OS-TRANSITION-TRUTH-001` | `OPEN` | `P1` | `—` (empty) | `1/0/0/0/0/?/?` |
| 480 | `PROVIDER-OBS-MIGRATION-001` | `OPEN` | `P1` | `—` (empty) | `1/0/0/?/0/?/?` |

Additional identity observations:

- Work 7084 outcome remains “Closure OS transition-brief truth-sync — projection drift, doküman drift, approval-claim kapsamlama (Codex denetim paketi)”.
- Work 480 outcome remains “Provider-execution-observation DB'sinin owner-controlled v1→v2 migration'ı: backup, migrate, adoption proof”.
- No status, priority, dependency, truth count, definition identity, or acceptance field was changed by this measurement.

## Active count and parity

The canonical lint scan reports:

- canonical source SHA-256: `21c1c4d1fc00e2aeecdf14c7c207896af12af2be10c495e771b7afc0e48266d1`
- total rows: **521**
- active rows: **456**
- terminal rows: **65** (total minus active)
- identity continuity: `continuous`
- source stable during validation: `true`
- `docs/generated/master-plan-active.md`: **stale**
- `docs/generated/master-plan-active.json`: **stale**

The checked-in JSON projection still embeds `521 total / 456 active / 65 terminal`, and both generated projections still contain Work 7084 and Work 480 with the same identity, `OPEN` status, `P1` priority, and empty dependency list shown above. That row-level agreement does **not** make the projections current: the deterministic whole-file comparison rejects both as stale. In particular, the JSON projection records normalized source digest `31bcf72f940f4e42058eff2496397f0586ad5915dc8f335bb54a3d520bd68cbb`, which is not the current canonical normalized source digest reported by the lint scan.

## Declared check

`node scripts/lint-master-plan.mjs --check` exits **1** and reports both generated files as `stale`. Therefore projection parity is currently red. This note records that state without running `--write`, changing MASTER, changing either generated file, or performing manual settlement.
