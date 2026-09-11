# RECOVERY-BORN-716-MODEL-PROVENANCE-001 — IMPLEMENTED_PRODUCTION_VERIFIED

OUTCOME_ID: RECOVERY-BORN-716-MODEL-PROVENANCE-001  
DOGFOOD_MODE: ON  
DOGFOOD_HEALTH: DEGRADED  
RECOVERY_SEAM: ADR-D-007  
BASE_SHA: ff2e47564232d05656b8645f4c3fd3449b322dc9  
BRANCH: main  
WORKSPACE_MODE: MAIN  
PARENT_MASTER_ID: 3357  
TRIGGER_RUN: sprint-716 / task 716-001  
OWNER_DECISION_REF: owner-live-2026-09-04-fable-codex-merged-rca-start-and-complete  

## Exact outcome

Prevent a config/planner-selected model from becoming a fabricated owner `forceModel` override
when a generated run proposal is round-tripped through directive text. Sprint-716 recorded
`gpt-5.6-terra -- user override` although the owner supplied no such override.

## Host-computed admission receipt

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-716-MODEL-PROVENANCE-01",
  "outcomeId": "RECOVERY-BORN-716-MODEL-PROVENANCE-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T23:28:00+03:00",
  "consumedAt": "2026-09-04T23:28:00+03:00",
  "baseSha": "ff2e47564232d05656b8645f4c3fd3449b322dc9",
  "branch": "main",
  "policyDigest": "sha256:f65334ba14584c2a7a8d451fa20e4c0aaf39bd4ad5383c3fa84cac0070375f14",
  "currentScopeDigest": "sha256:e59b1d73971261ae2bd894ad5a34e4fa3e27b8d5cb5274fb6e2b5292be9970a0",
  "scopeCount": 2,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-fable-codex-merged-rca-start-and-complete",
  "recoverySeam": "ADR-D-007"
}
```

## Exact scope and proof

- Write: `src/orchestra/run-proposal-compiler.ts`
- Write: `tests/orchestra/run-proposal-compiler.test.ts`
- Read-only proof: `src/core/task-types.ts`, `src/orchestra/directives-builder.ts`,
  `src/orchestra/task-builder.ts`, `src/orchestra/sprint-planner.ts`,
  `src/orchestra/task-router.ts`, `tests/orchestra/run-proposal-planner.test.ts`

Required behavior:

1. `PlannerTask.model` remains an effective/config planning fact and does not emit a `- Model:`
   directive or populate parsed `forceModel`.
2. Only explicit `PlannerTask.forceModel` emits the directive and survives as an owner override.
3. Effective config continues to resolve the worker model downstream; provider/model/concurrency is
   never forced by instruction prose.
4. Failing-first tests prove both branches and preserve existing explicit override behavior.

Negative scope: no notification, finalizer, workspace admission, routing policy changes, runtime,
`.tasks`, `.deckent`, `.brain`, `.brain/memory.db`, MASTER, ledger, build, bot, auth, provider,
`/tmp`, cleanup, kill, commit, or push mutation.

Finite budget: one implementation pass and one evidence-changing repair. Completion remains local
until the shared compiled real-main run proves the generated plan/task provenance on disk.

## Local settlement candidate

- Generated directives now emit a `Model:` override only from explicit `PlannerTask.forceModel`.
  The config/planner-selected `PlannerTask.model` no longer fabricates owner intent.
- Compile → directive → parse tests prove both the config-selected and explicit-override branches.
- Independent verification: compiler and planner policy suites passed `19/19`; scoped
  `git diff --check` passed. The implementation lane reported full `tsc --noEmit` success.
- Compiled real-main `sprint-717` resolved `gpt-5.6-terra` from routing while its plan-time contract
  durably states `Requested model override: not explicitly requested`; the archived task contains
  no `forceModel`. This proves effective-model selection no longer becomes fabricated owner intent.
  No `/tmp`, MASTER, closure-ledger, `.brain/memory.db`, commit, or push mutation occurred.
