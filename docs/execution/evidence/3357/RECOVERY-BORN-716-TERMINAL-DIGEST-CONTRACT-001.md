# RECOVERY-BORN-716-TERMINAL-DIGEST-CONTRACT-001 — IMPLEMENTED_PRODUCTION_VERIFIED

OUTCOME_ID: RECOVERY-BORN-716-TERMINAL-DIGEST-CONTRACT-001  
DOGFOOD_MODE: ON  
DOGFOOD_HEALTH: DEGRADED  
RECOVERY_SEAM: ADR-D-007  
BASE_SHA: ff2e47564232d05656b8645f4c3fd3449b322dc9  
BRANCH: main  
WORKSPACE_MODE: MAIN  
PARENT_MASTER_ID: 3357  
TRIGGER_RUN: sprint-716 / flow 4ebfc0f7-ee2b-4632-8ee6-d9f083bb0eef  
OWNER_DECISION_REF: owner-live-2026-09-04-fable-codex-merged-rca-start-and-complete  

## Bounded recovery outcome

Restore the terminal settlement digest contract before another main canary. The finalizer currently
produces a bare 64-character SHA-256 hex value while the skill-attribution integrity consumer
requires `sha256:<64-hex>`. Every task-bearing sprint can therefore fail before the attribution
batch is written and surface the unrelated generic label `Skill attribution batch conflict`.

This outcome changes only the digest producer/consumer contract and its direct tests. Sensitive
workspace admission, notifications, read-model reconciliation, model provenance, log cleanup,
agent manifests, heartbeat commands, normal feature work, and another provider invocation are
separate outcomes and are not admitted here.

## Host-computed admission receipt

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-716-TERMINAL-DIGEST-01",
  "outcomeId": "RECOVERY-BORN-716-TERMINAL-DIGEST-CONTRACT-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T22:45:39+03:00",
  "consumedAt": "2026-09-04T22:45:39+03:00",
  "baseSha": "ff2e47564232d05656b8645f4c3fd3449b322dc9",
  "branch": "main",
  "policyDigest": "sha256:f65334ba14584c2a7a8d451fa20e4c0aaf39bd4ad5383c3fa84cac0070375f14",
  "currentScopeDigest": "sha256:3e787ddb4f9b63745591b4db7f419adf721065ccaeed74b4a49f9c59be37a606",
  "scopeCount": 4,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-fable-codex-merged-rca-start-and-complete",
  "recoverySeam": "ADR-D-007"
}
```

The receipt digests current disk bytes before the implementation pass. They are computed by the
host and do not accept authored or model-produced digests.

## Exact write scope

- `src/orchestra/sprint-finalizer.ts`
- `src/core/routing/skill-attribution.ts`
- `tests/core/routing/skill-attribution-p0.test.ts`
- `tests/orchestra/sprint-finalizer-terminal-wire.test.ts`

## Negative scope

- No `.tasks`, `.deckent` runtime, `.brain`, `.brain/memory.db`, MASTER, closure-ledger, auth,
  provider, process, build, bot, cleanup, kill, commit, push, `/tmp`, or unrelated source mutation.
- No provider/model/worker/concurrency selection in prose.
- No canary or retry until this outcome is locally settled and the separately admitted workspace
  admission outcome is complete.

## TDD and proof manifest

1. A failing test reproduces the bare-hex producer → prefixed-digest consumer rejection.
2. One canonical digest representation is produced for new terminal settlements.
3. Historical bare-hex evidence has an explicit deterministic compatibility or migration rule;
   malformed digests remain fail-closed.
4. Integrity-format failure is distinguishable from a genuine immutable replay/batch conflict.
5. Task-bearing and zero-dispatch terminal paths are covered without fabricating execution.
6. Targeted tests and TypeScript checking for the exact scope pass; no real-surface completion is
   claimed until the later main run reaches a durable terminal receipt.

Finite budget: one implementation pass and at most one evidence-changing repair pass. An unchanged
failure fingerprint settles this outcome as HOLD. Return boundary: admit the sensitive workspace
outcome only after this scope has a reviewable diff and scoped green evidence.

## Local settlement candidate

- New attribution receipts canonicalize the finalizer's historical bare SHA-256 representation to
  `sha256:<64-hex>` at the producer boundary; the consumer repeats the check defensively.
- Integrity-valid historical bare batches remain readable and migrate atomically only when a
  semantically equivalent canonical replay arrives. Divergent evidence is not overwritten.
- Malformed input now raises `SKILL_ATTRIBUTION_BATCH_INTEGRITY_FAILED`; only a genuinely different
  immutable publication raises `SKILL_ATTRIBUTION_BATCH_CONFLICT`.
- Independent scoped verification: `2` test files, `29/29` tests passed; `git diff --check` passed.
- Compiled real-main `sprint-717` reached RETRO and wrote
  `.deckent/routing/skill-attribution/sprint-717.json` with a canonical prefixed
  `logicalSettlementDigest` plus a durable terminal receipt. The task had zero provider work, so
  this proves the task-bearing zero-dispatch finalizer path without fabricating execution. The old
  `Skill attribution batch conflict` crash did not recur. No commit, push, MASTER, closure-ledger,
  or `.brain/memory.db` mutation occurred.
