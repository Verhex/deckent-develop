# RECOVERY-TRUTH-001 — continuation current-truth inventory

**Cut-off:** 2026-08-22 UTC
**Decision rule:** only bytes persisted under `docs/evidence/` are evidence. Chat narration, task-prompt assertions, and paths outside the bounded read authority are not substituted for disk proof.

## Evidence boundary and redaction

This continuation inventory was measured from the five evidence files present at the cut-off. A bounded search for `sprint-621`, `621-`, `621-015`, `621-016`, `621-019`, and `621-020` returned no persisted match. Consequently, the allowed evidence set contains **no verifiable Sprint-621 terminal receipt, archive manifest, snapshot digest, or task-specific lineage record**. The requested `ABORTED` disposition is therefore an unverified input, not a disk-proven outcome. Absence is not promoted to success or failure.

No secret, credential, chat identifier, raw task payload, prompt, or provider response is copied here. This follows the established redaction boundary in `docs/evidence/RECOVERY-TRUTH-001-inventory-2026-08-22.md:6-8`.

## Bounded snapshot

The current bounded snapshot consists of:

- `APPROVAL-SURFACE-UNIFICATION-001-evidence-archive-2026-08-21.md`
- `EVALUATION-001-9040-enforce-canary-evidence-2026-08-22.md`
- `PROVIDER-AUTHORITY-DOCKER-EVIDENCE-001-evidence-archive-2026-08-21.md`
- `RECOVERY-TRUTH-001-inventory-2026-08-22.md`
- `WORKER-PROMPT-COST-ARCHITECTURE-001-evidence-archive-2026-08-21.md`

This is a filename snapshot, **not** a Sprint-621 archive/snapshot digest. No Sprint-621 digest is present in those files, so none is manufactured here. The only persisted terminal receipt digest in the directly relevant recovery evidence belongs to Sprint 619: terminal receipt SHA-256 `95a56a9fb3a84ed42ce064bbb17cf3023e9c3e320cc08966f8a653c263c10a85` and logical settlement digest `d6c10b29489a774f25b589cc7f14d334bfb84df7db18dcd25df5ff1c76f69f81` at `docs/evidence/EVALUATION-001-9040-enforce-canary-evidence-2026-08-22.md:23-30`. It must not be relabeled as Sprint 621 evidence.

## Continuation DAG: four unresolved lineages

All four requested nodes are **OPEN / evidence-unavailable**. “Unknown” below is an exact current-truth value: the bounded disk evidence does not identify the field, and this inventory does not infer it from chat or task prose.

| Lineage | Current disk disposition | Producer | Durable authority | Consumer | Entrypoint | Reproducer | Exact owner / file ownership |
|---|---|---|---|---|---|---|---|
| `621-015` | **OPEN — no task record; Sprint-621 `ABORTED` receipt unverified** | Unknown in bounded evidence | Expected redacted canonical task/attempt result plus terminal receipt identity; exact artifact absent | Unknown in bounded evidence | Unknown in bounded evidence | Publish a redacted manifest in this directory, then verify its task identity, attempt/generation, terminal state, receipt digest, and archive-relative path against the named durable bytes. Until then, reproduce the evidence gap with `rg -n '621-015' docs/evidence` returning no match. | **RT-CONT-621-015 — task 621-015 continuation evidence owner.** Owns publication of the redacted lineage manifest under `docs/evidence/`; implementation-file ownership is not established by current evidence. |
| `621-016` | **OPEN — no task record; Sprint-621 `ABORTED` receipt unverified** | Unknown in bounded evidence | Expected redacted canonical task/attempt result plus terminal receipt identity; exact artifact absent | Unknown in bounded evidence | Unknown in bounded evidence | Publish the durable-authority references and demonstrate producer-to-consumer replay from the named entrypoint. Current negative reproducer: `rg -n '621-016' docs/evidence` returns no match. | **RT-CONT-621-016 — task 621-016 continuation evidence owner.** Owns its redacted manifest under `docs/evidence/`; no source owner may be assigned without persisted path evidence. |
| `621-019` | **OPEN — no task record; Sprint-621 `ABORTED` receipt unverified** | Unknown in bounded evidence | Expected redacted canonical task/attempt result plus terminal receipt identity; exact artifact absent | Unknown in bounded evidence | Unknown in bounded evidence | Persist the exact producer, authority, consumer, entrypoint, archive reference, and named regression; verify receipt/digest correspondence. Current negative reproducer: `rg -n '621-019' docs/evidence` returns no match. | **RT-CONT-621-019 — task 621-019 continuation evidence owner.** Owns its redacted manifest under `docs/evidence/`; implementation ownership remains unproven. |
| `621-020` | **OPEN — no task record; Sprint-621 `ABORTED` receipt unverified** | Unknown in bounded evidence | Expected redacted canonical task/attempt result plus terminal receipt identity; exact artifact absent | Unknown in bounded evidence | Unknown in bounded evidence | Persist and fresh-read the exact terminal and archive bytes, then run the named recovery entrypoint and show that its consumer follows those bytes rather than a stale projection. Current negative reproducer: `rg -n '621-020' docs/evidence` returns no match. | **RT-CONT-621-020 — task 621-020 continuation evidence owner.** Owns its redacted manifest under `docs/evidence/`; finalizer/source ownership is not established by bounded evidence. |

### DAG edges that are currently provable

For each node, the only provable continuation is:

`missing redacted lineage manifest` → `evidence-unavailable` → `OPEN` → `RT-CONT-<task> publication owner`

The desired runtime chain—`producer → durable authority → consumer → entrypoint`—cannot be drawn honestly for any of the four nodes until the missing manifest names those elements and anchors them to current bytes. There is likewise no disk basis to order the four nodes as dependencies of one another.

## Live recovery seams retained from current disk

These are the only live seams supported by the bounded evidence. They are context for continuation, not substitutes for missing Sprint-621 proof.

1. **Sprint-619 stale finalizer projection — OPEN.** Fresh task results reported four logical tasks/five attempts as `DONE`, but RETRO retained a pre-fix gate/projection and owner-forced finalization produced an honest `ABORTED` receipt (`docs/evidence/EVALUATION-001-9040-enforce-canary-evidence-2026-08-22.md:13-33,95-97`). Producer: fresh canonical task results. Durable authority: canonical results and validated host receipt bytes. Consumer: controller RETRO/finalizer. Entrypoint: owner-authorized `finalize --force`. Reproducer: fixed results must supersede a stale pre-fix gate projection. Exact owner: **RT-IMPL-09 — sprint finalizer/projection owner**, as assigned at `docs/evidence/RECOVERY-TRUTH-001-inventory-2026-08-22.md:22`.
2. **Sprint-595 evidence gap — OPEN.** No persisted artifact identifies its runtime chain (`docs/evidence/RECOVERY-TRUTH-001-inventory-2026-08-22.md:21`). Producer, durable authority, consumer, and entrypoint remain unestablished. Reproducer: bounded search has no Sprint-595 match. Exact owner: **RT-IMPL-08 — sprint-595 evidence owner**.
3. **Seven lifecycle chains — PARTIAL.** Nervous stale-worker veto, unavailable-checkpoint probe fallback, runtime-extension liveness, diff-based timeout progress, `probeProven` status gating, advisory plan-warning handling, and temporary-agent finalization are reported landed, but lack case-specific named regression proof (`docs/evidence/RECOVERY-TRUTH-001-inventory-2026-08-22.md:14-20`). Their exact owners remain **RT-IMPL-01…07** at those lines.

## Settlement

- Sprint-621 receipt status: **UNVERIFIED; do not claim `ABORTED` from the bounded disk evidence**.
- Sprint-621 archive/snapshot digest: **ABSENT; do not invent or reuse the Sprint-619 digest**.
- Requested unresolved lineage count: **4**, all OPEN (`621-015`, `621-016`, `621-019`, `621-020`).
- New implementation admission: **none**. The four exact owners above own evidence publication only until persisted manifests establish source-file ownership.

This is the exact continuation current truth available on disk: it preserves negative evidence, assigns every missing lineage an explicit publication owner, and refuses to turn chat assertions into durable authority.
