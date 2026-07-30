# DIRECTIVES — Controlled FIX + Dependency Recovery Sprint

## Goal
Exercise Deckent's logical-task FIX lineage and dependency-unblock behavior with 18 bounded smoke tasks arranged as six independent three-stage chains.

## Execution Contract
- The graph is exactly six chains: Tasks `1–6` are roots, Tasks `7–12` consume those roots, and Tasks `13–18` verify the consumers.
- Every root task's original attempt intentionally produces one honest, deterministic test failure. Its generated priority-FIX attempt must repair the same scoped file and pass the same test.
- Controlled failures are product smoke evidence, not provider failures: each original root must write both declared files, run the declared failing command, return a valid result, and explicitly report `testsPassed=false` plus `selfAssessment=NO_GO`.
- A generated FIX task is identified by task metadata/id containing `-fix` and/or a `fixForTaskId`. The FIX worker must replace the injected `BROKEN-NN` state with `READY-NN`, rerun the exact command, and report `DONE` only when it exits zero.
- Downstream tasks are normal passing tasks. They must not dispatch while their direct dependency's logical lineage is unresolved.
- When a root FIX succeeds, its first consumer must become eligible. When that consumer succeeds, its verifier must become eligible.
- The expected logical settlement is 18/18 `DONE`: six roots resolved by FIX plus twelve first-attempt downstream successes. Raw attempt evidence must retain six original `NO_GO` verdicts and six successful FIX verdicts.
- The worker pool remains heterogeneous and provider-neutral at the product level. This effective-config projection assigns exactly six tasks each to Codex Terra, Codex Luna, and Claude Sonnet 5, including two controlled root failures per provider.
- Every task uses subscription auth. Provider quota/reachability governs admission; API/USD task budget does not.
- Concurrency and worker count come only from effective config.
- Each task may write only its two declared files. Consumers may read their dependency artifacts but must not modify them.
- No task may modify product source, configuration, memory, ADRs, lockfiles, existing tests, or another chain.
- Claude Haiku is excluded because every task writes TypeScript.
- Sprint start is not authorized by this document; Alperen starts the sprint separately.

## Expected Runtime Evidence
- Six original root results: `NO_GO`, `testsPassed=false`, files changed, no provider-limit classification.
- Six generated direct FIX tasks: one per failed root; no cross-fix fan-out.
- Six FIX results: `DONE`, `testsPassed=true`.
- Six `DEPENDENCY_UNBLOCK_APPLIED` events for the root consumers.
- Tasks `7–12` must start only after their corresponding root lineage is aggregate `DONE`.
- Tasks `13–18` must start only after Tasks `7–12` are `DONE`.
- No circuit-breaker pause when all six root lineages resolve within the configured FIX budget.

## Task 1: CHAIN-01-ROOT — controlled NO_GO then repair
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/chain-01/stage-1/README.md, deneme/chain-01/stage-1/example.ts
- Scope: deneme/chain-01/stage-1/
- Dependencies: none

### Description
Create the two declared files only. Write the declared Markdown document with title `# Chain 01 Stage 1`.

This task has an attempt-aware recovery contract:
1. If this is the original task (no `-fix` identity and no `fixForTaskId`), write the declared TypeScript example using `node:assert/strict`, export `chainState = 'BROKEN-01'`, and assert that it equals `READY-01`. Run the test, preserve the intentional non-zero result, and honestly return `testsPassed=false`, `selfAssessment=NO_GO`, with notes containing `CONTROLLED_FIX_INJECTION chain-01`.
2. If this is a generated FIX attempt, replace `BROKEN-01` with `READY-01`, keep the same export and assertion, run the exact test, and return `DONE` only if it exits zero.

Do not omit the files or simulate a provider/auth failure.

**Proof:** `test -f deneme/chain-01/stage-1/README.md && test -f deneme/chain-01/stage-1/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-01/stage-1/example.ts`

## Task 2: CHAIN-02-ROOT — controlled NO_GO then repair
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/chain-02/stage-1/README.md, deneme/chain-02/stage-1/example.ts
- Scope: deneme/chain-02/stage-1/
- Dependencies: none

### Description
Create the two declared files only. Write the declared Markdown document with title `# Chain 02 Stage 1`.

This task has an attempt-aware recovery contract:
1. If this is the original task (no `-fix` identity and no `fixForTaskId`), write the declared TypeScript example using `node:assert/strict`, export `chainState = 'BROKEN-02'`, and assert that it equals `READY-02`. Run the test, preserve the intentional non-zero result, and honestly return `testsPassed=false`, `selfAssessment=NO_GO`, with notes containing `CONTROLLED_FIX_INJECTION chain-02`.
2. If this is a generated FIX attempt, replace `BROKEN-02` with `READY-02`, keep the same export and assertion, run the exact test, and return `DONE` only if it exits zero.

Do not omit the files or simulate a provider/auth failure.

**Proof:** `test -f deneme/chain-02/stage-1/README.md && test -f deneme/chain-02/stage-1/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-02/stage-1/example.ts`

## Task 3: CHAIN-03-ROOT — controlled NO_GO then repair
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/chain-03/stage-1/README.md, deneme/chain-03/stage-1/example.ts
- Scope: deneme/chain-03/stage-1/
- Dependencies: none

### Description
Create the two declared files only. Write the declared Markdown document with title `# Chain 03 Stage 1`.

This task has an attempt-aware recovery contract:
1. If this is the original task (no `-fix` identity and no `fixForTaskId`), write the declared TypeScript example using `node:assert/strict`, export `chainState = 'BROKEN-03'`, and assert that it equals `READY-03`. Run the test, preserve the intentional non-zero result, and honestly return `testsPassed=false`, `selfAssessment=NO_GO`, with notes containing `CONTROLLED_FIX_INJECTION chain-03`.
2. If this is a generated FIX attempt, replace `BROKEN-03` with `READY-03`, keep the same export and assertion, run the exact test, and return `DONE` only if it exits zero.

Do not omit the files or simulate a provider/auth failure.

**Proof:** `test -f deneme/chain-03/stage-1/README.md && test -f deneme/chain-03/stage-1/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-03/stage-1/example.ts`

## Task 4: CHAIN-04-ROOT — controlled NO_GO then repair
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/chain-04/stage-1/README.md, deneme/chain-04/stage-1/example.ts
- Scope: deneme/chain-04/stage-1/
- Dependencies: none

### Description
Create the two declared files only. Write the declared Markdown document with title `# Chain 04 Stage 1`.

This task has an attempt-aware recovery contract:
1. If this is the original task (no `-fix` identity and no `fixForTaskId`), write the declared TypeScript example using `node:assert/strict`, export `chainState = 'BROKEN-04'`, and assert that it equals `READY-04`. Run the test, preserve the intentional non-zero result, and honestly return `testsPassed=false`, `selfAssessment=NO_GO`, with notes containing `CONTROLLED_FIX_INJECTION chain-04`.
2. If this is a generated FIX attempt, replace `BROKEN-04` with `READY-04`, keep the same export and assertion, run the exact test, and return `DONE` only if it exits zero.

Do not omit the files or simulate a provider/auth failure.

**Proof:** `test -f deneme/chain-04/stage-1/README.md && test -f deneme/chain-04/stage-1/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-04/stage-1/example.ts`

## Task 5: CHAIN-05-ROOT — controlled NO_GO then repair
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/chain-05/stage-1/README.md, deneme/chain-05/stage-1/example.ts
- Scope: deneme/chain-05/stage-1/
- Dependencies: none

### Description
Create the two declared files only. Write the declared Markdown document with title `# Chain 05 Stage 1`.

This task has an attempt-aware recovery contract:
1. If this is the original task (no `-fix` identity and no `fixForTaskId`), write the declared TypeScript example using `node:assert/strict`, export `chainState = 'BROKEN-05'`, and assert that it equals `READY-05`. Run the test, preserve the intentional non-zero result, and honestly return `testsPassed=false`, `selfAssessment=NO_GO`, with notes containing `CONTROLLED_FIX_INJECTION chain-05`.
2. If this is a generated FIX attempt, replace `BROKEN-05` with `READY-05`, keep the same export and assertion, run the exact test, and return `DONE` only if it exits zero.

Do not omit the files or simulate a provider/auth failure.

**Proof:** `test -f deneme/chain-05/stage-1/README.md && test -f deneme/chain-05/stage-1/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-05/stage-1/example.ts`

## Task 6: CHAIN-06-ROOT — controlled NO_GO then repair
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/chain-06/stage-1/README.md, deneme/chain-06/stage-1/example.ts
- Scope: deneme/chain-06/stage-1/
- Dependencies: none

### Description
Create the two declared files only. Write the declared Markdown document with title `# Chain 06 Stage 1`.

This task has an attempt-aware recovery contract:
1. If this is the original task (no `-fix` identity and no `fixForTaskId`), write the declared TypeScript example using `node:assert/strict`, export `chainState = 'BROKEN-06'`, and assert that it equals `READY-06`. Run the test, preserve the intentional non-zero result, and honestly return `testsPassed=false`, `selfAssessment=NO_GO`, with notes containing `CONTROLLED_FIX_INJECTION chain-06`.
2. If this is a generated FIX attempt, replace `BROKEN-06` with `READY-06`, keep the same export and assertion, run the exact test, and return `DONE` only if it exits zero.

Do not omit the files or simulate a provider/auth failure.

**Proof:** `test -f deneme/chain-06/stage-1/README.md && test -f deneme/chain-06/stage-1/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-06/stage-1/example.ts`

## Task 7: CHAIN-01-CONSUMER — consume repaired root
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/chain-01/stage-2/README.md, deneme/chain-01/stage-2/example.ts
- Scope: deneme/chain-01/
- Dependencies: Task 1

### Description
Run only after the logical lineage of Task 1 is aggregate `DONE`. Create the two declared stage-2 files without changing stage 1. Write the declared stage-2 Markdown document with title `# Chain 01 Stage 2`. In the declared stage-2 TypeScript file, import `chainState` from `../stage-1/example.ts`, derive and export `consumerState = chainState + ':CONSUMED'`, and assert that it equals `READY-01:CONSUMED`.

**Proof:** `test -f deneme/chain-01/stage-2/README.md && test -f deneme/chain-01/stage-2/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-01/stage-2/example.ts`

## Task 8: CHAIN-02-CONSUMER — consume repaired root
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/chain-02/stage-2/README.md, deneme/chain-02/stage-2/example.ts
- Scope: deneme/chain-02/
- Dependencies: Task 2

### Description
Run only after the logical lineage of Task 2 is aggregate `DONE`. Create the two declared stage-2 files without changing stage 1. Write the declared stage-2 Markdown document with title `# Chain 02 Stage 2`. In the declared stage-2 TypeScript file, import `chainState` from `../stage-1/example.ts`, derive and export `consumerState = chainState + ':CONSUMED'`, and assert that it equals `READY-02:CONSUMED`.

**Proof:** `test -f deneme/chain-02/stage-2/README.md && test -f deneme/chain-02/stage-2/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-02/stage-2/example.ts`

## Task 9: CHAIN-03-CONSUMER — consume repaired root
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/chain-03/stage-2/README.md, deneme/chain-03/stage-2/example.ts
- Scope: deneme/chain-03/
- Dependencies: Task 3

### Description
Run only after the logical lineage of Task 3 is aggregate `DONE`. Create the two declared stage-2 files without changing stage 1. Write the declared stage-2 Markdown document with title `# Chain 03 Stage 2`. In the declared stage-2 TypeScript file, import `chainState` from `../stage-1/example.ts`, derive and export `consumerState = chainState + ':CONSUMED'`, and assert that it equals `READY-03:CONSUMED`.

**Proof:** `test -f deneme/chain-03/stage-2/README.md && test -f deneme/chain-03/stage-2/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-03/stage-2/example.ts`

## Task 10: CHAIN-04-CONSUMER — consume repaired root
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/chain-04/stage-2/README.md, deneme/chain-04/stage-2/example.ts
- Scope: deneme/chain-04/
- Dependencies: Task 4

### Description
Run only after the logical lineage of Task 4 is aggregate `DONE`. Create the two declared stage-2 files without changing stage 1. Write the declared stage-2 Markdown document with title `# Chain 04 Stage 2`. In the declared stage-2 TypeScript file, import `chainState` from `../stage-1/example.ts`, derive and export `consumerState = chainState + ':CONSUMED'`, and assert that it equals `READY-04:CONSUMED`.

**Proof:** `test -f deneme/chain-04/stage-2/README.md && test -f deneme/chain-04/stage-2/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-04/stage-2/example.ts`

## Task 11: CHAIN-05-CONSUMER — consume repaired root
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/chain-05/stage-2/README.md, deneme/chain-05/stage-2/example.ts
- Scope: deneme/chain-05/
- Dependencies: Task 5

### Description
Run only after the logical lineage of Task 5 is aggregate `DONE`. Create the two declared stage-2 files without changing stage 1. Write the declared stage-2 Markdown document with title `# Chain 05 Stage 2`. In the declared stage-2 TypeScript file, import `chainState` from `../stage-1/example.ts`, derive and export `consumerState = chainState + ':CONSUMED'`, and assert that it equals `READY-05:CONSUMED`.

**Proof:** `test -f deneme/chain-05/stage-2/README.md && test -f deneme/chain-05/stage-2/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-05/stage-2/example.ts`

## Task 12: CHAIN-06-CONSUMER — consume repaired root
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/chain-06/stage-2/README.md, deneme/chain-06/stage-2/example.ts
- Scope: deneme/chain-06/
- Dependencies: Task 6

### Description
Run only after the logical lineage of Task 6 is aggregate `DONE`. Create the two declared stage-2 files without changing stage 1. Write the declared stage-2 Markdown document with title `# Chain 06 Stage 2`. In the declared stage-2 TypeScript file, import `chainState` from `../stage-1/example.ts`, derive and export `consumerState = chainState + ':CONSUMED'`, and assert that it equals `READY-06:CONSUMED`.

**Proof:** `test -f deneme/chain-06/stage-2/README.md && test -f deneme/chain-06/stage-2/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-06/stage-2/example.ts`

## Task 13: CHAIN-01-VERIFIER — verify consumer
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/chain-01/stage-3/README.md, deneme/chain-01/stage-3/example.ts
- Scope: deneme/chain-01/
- Dependencies: Task 7

### Description
Run only after Task 7 is `DONE`. Create the two declared stage-3 files without changing earlier stages. Write the declared stage-3 Markdown document with title `# Chain 01 Stage 3`. In the declared stage-3 TypeScript file, import `consumerState` from `../stage-2/example.ts`, derive `verifiedState = consumerState + ':VERIFIED'`, and assert that it equals `READY-01:CONSUMED:VERIFIED`.

**Proof:** `test -f deneme/chain-01/stage-3/README.md && test -f deneme/chain-01/stage-3/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-01/stage-3/example.ts`

## Task 14: CHAIN-02-VERIFIER — verify consumer
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/chain-02/stage-3/README.md, deneme/chain-02/stage-3/example.ts
- Scope: deneme/chain-02/
- Dependencies: Task 8

### Description
Run only after Task 8 is `DONE`. Create the two declared stage-3 files without changing earlier stages. Write the declared stage-3 Markdown document with title `# Chain 02 Stage 3`. In the declared stage-3 TypeScript file, import `consumerState` from `../stage-2/example.ts`, derive `verifiedState = consumerState + ':VERIFIED'`, and assert that it equals `READY-02:CONSUMED:VERIFIED`.

**Proof:** `test -f deneme/chain-02/stage-3/README.md && test -f deneme/chain-02/stage-3/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-02/stage-3/example.ts`

## Task 15: CHAIN-03-VERIFIER — verify consumer
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/chain-03/stage-3/README.md, deneme/chain-03/stage-3/example.ts
- Scope: deneme/chain-03/
- Dependencies: Task 9

### Description
Run only after Task 9 is `DONE`. Create the two declared stage-3 files without changing earlier stages. Write the declared stage-3 Markdown document with title `# Chain 03 Stage 3`. In the declared stage-3 TypeScript file, import `consumerState` from `../stage-2/example.ts`, derive `verifiedState = consumerState + ':VERIFIED'`, and assert that it equals `READY-03:CONSUMED:VERIFIED`.

**Proof:** `test -f deneme/chain-03/stage-3/README.md && test -f deneme/chain-03/stage-3/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-03/stage-3/example.ts`

## Task 16: CHAIN-04-VERIFIER — verify consumer
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/chain-04/stage-3/README.md, deneme/chain-04/stage-3/example.ts
- Scope: deneme/chain-04/
- Dependencies: Task 10

### Description
Run only after Task 10 is `DONE`. Create the two declared stage-3 files without changing earlier stages. Write the declared stage-3 Markdown document with title `# Chain 04 Stage 3`. In the declared stage-3 TypeScript file, import `consumerState` from `../stage-2/example.ts`, derive `verifiedState = consumerState + ':VERIFIED'`, and assert that it equals `READY-04:CONSUMED:VERIFIED`.

**Proof:** `test -f deneme/chain-04/stage-3/README.md && test -f deneme/chain-04/stage-3/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-04/stage-3/example.ts`

## Task 17: CHAIN-05-VERIFIER — verify consumer
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/chain-05/stage-3/README.md, deneme/chain-05/stage-3/example.ts
- Scope: deneme/chain-05/
- Dependencies: Task 11

### Description
Run only after Task 11 is `DONE`. Create the two declared stage-3 files without changing earlier stages. Write the declared stage-3 Markdown document with title `# Chain 05 Stage 3`. In the declared stage-3 TypeScript file, import `consumerState` from `../stage-2/example.ts`, derive `verifiedState = consumerState + ':VERIFIED'`, and assert that it equals `READY-05:CONSUMED:VERIFIED`.

**Proof:** `test -f deneme/chain-05/stage-3/README.md && test -f deneme/chain-05/stage-3/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-05/stage-3/example.ts`

## Task 18: CHAIN-06-VERIFIER — verify consumer
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/chain-06/stage-3/README.md, deneme/chain-06/stage-3/example.ts
- Scope: deneme/chain-06/
- Dependencies: Task 12

### Description
Run only after Task 12 is `DONE`. Create the two declared stage-3 files without changing earlier stages. Write the declared stage-3 Markdown document with title `# Chain 06 Stage 3`. In the declared stage-3 TypeScript file, import `consumerState` from `../stage-2/example.ts`, derive `verifiedState = consumerState + ':VERIFIED'`, and assert that it equals `READY-06:CONSUMED:VERIFIED`.

**Proof:** `test -f deneme/chain-06/stage-3/README.md && test -f deneme/chain-06/stage-3/example.ts`
**Test:** `node --experimental-strip-types deneme/chain-06/stage-3/example.ts`
