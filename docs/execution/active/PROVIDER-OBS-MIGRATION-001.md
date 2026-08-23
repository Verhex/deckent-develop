# PROVIDER-OBS-MIGRATION-001 — active closure capsule

OUTCOME_ID: PROVIDER-OBS-MIGRATION-001
DOGFOOD_MODE: ON
BASE_SHA: eaba99b3167c72b8d74d1f3af9954ff63778eb43

## Status

- **Capsule:** `ACTIVE`.
- **Canonical work:** Work 480 remains `OPEN`.
- **Predecessor:** `sprint-1780659451557` is canonically `ABORTED`; its 148 preserved artifacts
  are historical evidence, not a successful adoption.
- **Current evidence class:** implementation wiring, scoped verification, final compiled binary,
  live apply/replay, privacy, archive and fail-closed behavior are `LOCAL_VERIFIED`.
- **Real compiled binary/live apply:** `PASS`. Final `build:all` completed with no active sprint;
  compiled inspect, digest-bound apply and a separate-process replay all completed.
- **Durable live receipt:** `sha256:5b4c3e75abb9d43a5f5e3d8490592100fbfbf761165ac5d53037f2bc0a8eb847`;
  create-only `0600` bytes under a `0700` scoped store, freshly reread, `databaseMutation=none`.
- **Post-finalizer archive verification:** `PASS`; sprint 1558 is `COMPLETE`, 294 artifacts,
  13,046,491 bytes, content digest `f2794adf…af5a`, zero conflict/missing/mismatch/untracked.
- **Independent XVerify:** different-provider unavailability remains `HOLD / NO SEAL`.
- **Owner Closure:** `OPEN`; only the canonical owner Closure authority may dispose Work 480.

Keep this capsule active. This is the single product outcome represented here. Local
implementation evidence is not a live adoption settlement, an independent verification seal, or
an owner decision.

## Current bounded counts

| Evidence context | Count | Meaning |
|---|---:|---|
| Retained schema-v1 preimage | 43 rows | Historical aggregate source measurement |
| Final compiled live schema-v2 adoption | 989 rows | 43 exact legacy + 946 run-owned; durable no-mutation receipt |
| Aborted predecessor `sprint-1780659451557` | 148 artifacts | Preserved predecessor evidence |
| Completed recovery `sprint-1780659451558` | 294 artifacts | Canonical COMPLETE manifest and byte verification |

The 43-row preimage, earlier 976-row timestamped measurement, final 989-row adoption cut, and stale
prose value 53 belong to different evidence times. Only the final receipt proves the exact 43+946
adoption relation; it does not make the owner Closure decision. Source and target main-file,
WAL and SHM digests remained unchanged across apply and replay.

## Evidence boundary

The production chain is implemented as:

`compiled CLI entry → registered adopt action → default adoption → inspect/plan → apply-time
verification → durable publication → exact fresh read → redacted projection`

Production-entrypoint subprocess coverage exercises replay and fail-closed concurrency,
collision, tampering, and disclosure behavior. These facts establish local implementation and
integration behavior only. Outputs remain aggregate/redacted; this capsule does not reproduce raw
provider, target, tenant, project, execution, receipt, secret, or filesystem identities.

## Exact pending authority gates

Brain must keep the capsule `ACTIVE` and Work 480 `OPEN` until both remaining authorities act:

1. **Independent XVerify:** obtain the required different-provider result. Provider
   unavailability remains `HOLD / NO SEAL`; same-provider review cannot substitute for a seal.
2. **Owner Closure:** after the preceding evidence is admitted, the canonical owner Closure
   authority must explicitly record the disposition of Work 480.

## DONE

- The authorized real compiled binary/live receipt gate is satisfied by the retained receipt above.
- The independent post-finalizer archive gate is satisfied by the verified sprint-1558 manifest.
- Required different-provider XVerify produces its independent result; unavailability remains
  explicitly `HOLD / NO SEAL` and cannot satisfy this criterion.
- Canonical owner Closure authority explicitly records the Work 480 disposition.
- Brain consumes this capsule only after all preceding gates are admitted.

## Non-negotiable boundaries

- Do not consume, delete, archive, rename, or promote this capsule while any gate is pending.
- Do not rewrite the `ABORTED` predecessor as successful adoption.
- Do not replay a migration or infer a durable receipt from an in-memory verifier or dry run.
- Do not mutate live state during inspection or disclose raw identity.
- Do not turn same-provider review or provider unavailability into an XVerify seal.
- Do not infer or record Work 480 `DONE`; disposition is owner-only.

## Consume rule

Consume this capsule only after the required different-provider XVerify result and canonical owner
Closure disposition for Work 480. Until then, its state is `ACTIVE` and its work state is `OPEN`.
