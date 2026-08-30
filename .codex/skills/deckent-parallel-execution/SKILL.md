---
name: deckent-parallel-execution
description: Execute an admitted Deckent outcome through independent DAG lanes with exact authority, custody, and fan-in. Do not use for audits, vague work, or arbitrary agent multiplication.
---

# Deckent Parallel Execution

## Preconditions

Require an active owner-admitted outcome and an accepted `$deckent-outcome-plan`. Re-run
`$deckent-authority-bootstrap` if HEAD, worktree, runtime, config, or capacity changed. Use the
official Goal/Mission/Flow/Run/Autonomous/Do surface required by live policy.

## Admission and decomposition

- Resolve providers, models, effort, worker pool, concurrency, budgets, and capability from
  effective config, registry, auth/reachability evidence, resource policy, and the dependency DAG.
  Never force them from instruction prose.
- Split only genuinely independent work. Assign exact disjoint write scopes, negative scopes, and
  one writer per hot file. A single small task does not justify parallel agents.
- Give each lane the exact outcome, task, operation, invocation, causation, and attempt identities,
  along with its accepted proof manifest and stop conditions.
- Preserve immutable task snapshots and attempt-private result, partial-result, timeout, log, and
  IPC custody. Never accept a sibling, prior, unrun, replayed, or unattributed result.

## Supervision and fan-in

Use `$deckent-observe` throughout the active lifecycle. The supervising Brain must compare
heartbeats, receipts, disk diff, effective run policy, result evidence, evaluation, finalizer,
settlement, and archive; worker self-report is not sufficient.

Fan in only at declared DAG joins. Recheck scope collisions and exact attempt identity before
acceptance. Fail closed on missing, stale, ambiguous, tampered, or mismatched custody. Apply the
finite FIX budget; require a changed evidence fingerprint before retrying.

## Boundaries

Do not broaden the active outcome, silently recover, clean `.tasks`, mutate `.brain/memory.db`, run
a build during an active sprint, change auth, or cross an owner-only gate. Return typed HOLD or
ABORTED truth when execution cannot safely continue.
