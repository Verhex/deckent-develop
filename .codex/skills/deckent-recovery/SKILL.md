---
name: deckent-recovery
description: Perform one explicitly authorized, typed ADR-D-007 recovery package when Deckent dogfood health is degraded. Never use it as a normal feature or refactor path.
---

# Deckent Recovery

## Recovery gate

Proceed only when live policy keeps `DOGFOOD_MODE=ON`, evidence declares
`DOGFOOD_HEALTH=DEGRADED`, normal execution cannot safely progress, and the owner has authorized an
exact typed ADR-D-007 package. Run `$deckent-authority-bootstrap` first. Recovery selection itself
does not satisfy these conditions.

## Bound the package

- Name the blocked outcome, engine defect, exact root-cause evidence, recovery identity, read/write
  and negative scopes, protected paths, budget, finite attempts, proof manifest, and return-to-
  dogfood boundary.
- Keep one package and one writer per hot file. Do not absorb normal feature work, unrelated
  findings, broad cleanup, or a second workflow engine.
- Preserve canonical ABORTED, HOLD, receipt, archive, task, and memory truth. Never manually mutate
  `.brain/memory.db` or delete `.tasks`.
- Require exact task/attempt/result/effect/receipt attribution. Fail closed on stale, sibling,
  replayed, unrun, partial, missing, or tampered evidence.
- Stop when the budget is exhausted or the failure fingerprint is unchanged; do not create an
  unlimited FIX/retry chain.

## Separate owner gates

Kill/cleanup, destructive actions, build or host-adapter restart during runtime, auth changes,
XVerify, authenticated closure/MASTER mutation, commit, and push each require their current exact
authority. Do not infer one permission from another.

## Exit

Verify the repaired production wiring and the engine path needed to resume dogfood. Tests may help
diagnose but cannot close recovery. Return to the official Goal/Mission/Flow/Run/Do path at the
earliest safe boundary, then invoke `$deckent-closure`. If that return cannot be proven, report
DEGRADED/HOLD rather than declaring completion.
