# DIRECTIVES — Sprint 488: Terminal Evidence · Verification Authority Closure

## Goal

Close the four Sprint-487 residual authority gaps without coupling source implementation to a stale
in-sprint `dist/`: canonical logical task identity, structured landing-proposal publication,
concurrency-safe verification, and an explicit post-settlement binary-promotion stage. Every
production slice must reach its real consumer and ingress; foundation-only code cannot count as
completion. The sprint runs with a heterogeneous provider pool and at most six concurrent workers.

## Governing Work IDs

- `RECOVERY-BORN-487-POST-SETTLEMENT-BINARY-001` (3275)
- `RECOVERY-BORN-487-LANDING-PROPOSAL-WRITER-001` (3276)
- `RECOVERY-BORN-487-CONCURRENT-TYPECHECK-001` (3277)
- `RECOVERY-BORN-487-CLEANUP-ARTIFACT-IDENTITY-001` (3280, regression guard)
- `RECOVERY-BORN-487-TERMINAL-LOGICAL-ID-001` (3281)

---

## Task 1: Canonical logical-progress identity contract

- Provider: codex
- Model: gpt-5.6-sol
- Auth: subscription
- Effort: high
- Skills: system-architect, typescript-expert, testing-expert
- Files: src/core/logical-progress-projection.ts, tests/core/logical-progress-projection.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
- Wiring: Producer=`LogicalProgressAttempt`; Consumer=`projectLogicalProgress`; Ingresses=Sprint,RunFlow,status,receipt; Enablement=unconditional; Proof=`logical-progress-canonical-identity`; Disposition=staged-foundation(488-002,488-003)

Add an explicit canonical logical-task identity to attempt input. Validate that every repair lineage
has one stable root identity while exact attempt IDs remain opaque. Never parse embedded delimiters
or infer logical identity from display strings.

**Test:** `npx vitest run tests/core/logical-progress-projection.test.ts`

**NO-GO:** NUL splitting, suffix heuristics, attempt-count denominator or silent conflicting identity.

## Task 2: Finalizer canonical logical-ID producer

- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: high
- Skills: typescript-expert, testing-expert, system-architect
- Files: src/orchestra/sprint-finalizer.ts, tests/orchestra/sprint-finalizer-terminal-wire.test.ts, tests/orchestra/sprint-terminal-receipt-order.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, tests/core/
- Dependencies: 488-001
- Wiring: Producer=`terminalAttemptEvidence.logicalTaskId`; Consumer=`buildFinalizerTerminalTruth`; Ingresses=finalize,controller; Enablement=unconditional; Proof=`finalizer-logical-id-producer`; Disposition=production-wired

Feed canonical root task IDs separately into logical-progress projection. Receipt lineages must expose
`487-006`, never `487-006\u0000<attempt>`, while retaining exact attempt identity and the same digest
stability, counts and repair-leaf semantics.

**Test:** `npx vitest run tests/orchestra/sprint-finalizer-terminal-wire.test.ts tests/orchestra/sprint-terminal-receipt-order.test.ts`

**NO-GO:** Receipt rewrite without fencing, denominator change, lost attempt identity or migration by string parsing.

## Task 3: Logical-ID cross-surface consumers

- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/core/sprint-terminal-publication-status.ts, src/cli/commands/status.ts, src/mcp/tools/status.ts, tests/cli/status-terminal-receipt.test.ts, tests/mcp/status-terminal-receipt.test.ts
- Scope: src/core/, src/cli/, src/mcp/, tests/core/, tests/cli/, tests/mcp/
- Dependencies: 488-002
- Wiring: Producer=`canonical terminal receipt lineages`; Consumer=`CLI/MCP terminal publication projection`; Ingresses=CLI-human,CLI-json,CLI-watch,MCP; Enablement=receipt-observed; Proof=`terminal-logical-id-surface-parity`; Disposition=production-wired

Project canonical logical IDs unchanged through shared core, CLI and MCP surfaces. Malformed legacy
composite labels remain typed compatibility evidence and cannot silently become canonical IDs.

**Test:** `npx vitest run tests/cli/status-terminal-receipt.test.ts tests/mcp/status-terminal-receipt.test.ts`

**NO-GO:** CLI/MCP-specific parsing, presentation clamp, receipt mutation or silent legacy promotion.

## Task 4: Structured landing-proposal schema and atomic writer

- Provider: codex
- Model: gpt-5.6-sol
- Auth: subscription
- Effort: high
- Skills: system-architect, typescript-expert, security-specialist, testing-expert
- Files: src/core/execution-landing-proposal.ts, tests/core/execution-landing-proposal.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
- Wiring: Producer=`LandingProposalV2`; Consumer=`writeExecutionLandingProposal`; Ingresses=all worker backends; Enablement=landing-required; Proof=`structured-landing-writer`; Disposition=staged-foundation(488-005,488-006,488-007)

Define one versioned provider-neutral proposal schema and same-directory atomic writer. Validate task,
attempt, generation, sequence, result reference and bounded risk arrays before rename. Reject symlink,
path traversal, duplicate identity and non-serializable data with typed diagnostics.

**Test:** `npx vitest run tests/core/execution-landing-proposal.test.ts`

**NO-GO:** Shell JSON serialization, process-global temp path, partial overwrite or fail-open validation.

## Task 5: Docker landing writer integration

- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: high
- Skills: typescript-expert, docker-expert, testing-expert
- Files: src/orchestra/spawn-backend-docker.ts, src/orchestra/execution-landing-coordinator.ts, tests/orchestra/docker-settlement-monitor-wire.test.ts, tests/orchestra/execution-landing-coordinator.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, tests/core/
- Dependencies: 488-004
- Wiring: Producer=`Docker settlement observation`; Consumer=`structured landing writer`; Ingresses=Docker worker; Enablement=backend=docker; Proof=`docker-landing-writer-wire`; Disposition=production-wired

Replace Docker/free-form landing serialization with the structured writer and carry exact host-owned
attempt identity. Malformed or stale proposals produce typed HOLD and retain bounded forensic data.

**Test:** `npx vitest run tests/orchestra/docker-settlement-monitor-wire.test.ts tests/orchestra/execution-landing-coordinator.test.ts`

**NO-GO:** Container shell owns JSON, last-writer-wins, provider-specific schema or auth mutation.

## Task 6: Host worker landing writer parity

- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: high
- Skills: typescript-expert, testing-expert, system-architect
- Files: src/agents/worker.ts, src/orchestra/sprint-spawner.ts, src/orchestra/spawn-backend-subprocess.ts, tests/agents/worker-landing-proposal-wire.test.ts, tests/orchestra/host-landing-proposal-parity.test.ts
- Scope: src/agents/, src/orchestra/, src/core/, tests/agents/, tests/orchestra/, tests/core/
- Dependencies: 488-004
- Wiring: Producer=`host/subprocess worker settlement`; Consumer=`structured landing writer`; Ingresses=in-process,subprocess,tmux; Enablement=backend capability; Proof=`host-landing-writer-parity`; Disposition=production-wired

Route every non-Docker worker settlement path through the same writer. Unsupported backend access
returns typed HOLD; no backend may construct proposal JSON independently.

**Test:** `npx vitest run tests/agents/worker-landing-proposal-wire.test.ts tests/orchestra/host-landing-proposal-parity.test.ts`

**NO-GO:** Backend-specific duplicate writer, shell heredoc, missing generation fence or pretend parity.

## Task 7: Landing diagnostics and cleanup compatibility

- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: normal
- Skills: typescript-expert, testing-expert, security-specialist
- Files: src/core/task-artifact-classifier.ts, src/cli/commands/cleanup.ts, src/orchestra/sprint-lifecycle.ts, tests/core/task-artifact-classifier.test.ts, tests/cli/commands/cleanup.test.ts, tests/orchestra/cleanup-state-truth.test.ts
- Scope: src/core/, src/cli/, src/orchestra/, tests/core/, tests/cli/, tests/orchestra/
- Dependencies: 488-005, 488-006
- Wiring: Producer=`landing writer diagnostics`; Consumer=`artifact classifier + cleanup`; Ingresses=finalize,cleanup,recover; Enablement=unconditional; Proof=`landing-cleanup-regression`; Disposition=production-wired

Preserve proposal identity as non-task evidence through finalize and retire only the settled sprint's
temporary residue during cleanup. Surface malformed schema diagnostics without routing proposals as Tasks.

**Test:** `npx vitest run tests/core/task-artifact-classifier.test.ts tests/cli/commands/cleanup.test.ts tests/orchestra/cleanup-state-truth.test.ts`

**NO-GO:** Global temp glob, foreign-run deletion, proposal-as-task or cleanup hiding malformed evidence.

## Task 8: Verification isolation authority contract

- Provider: claude
- Model: claude-opus-5
- Auth: subscription
- Effort: high
- ModelEffort: medium
- Skills: system-architect, typescript-expert, testing-expert, security-specialist
- Files: src/core/verification-isolation-authority.ts, tests/core/verification-isolation-authority.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
- Wiring: Producer=`task attribution + repository generation`; Consumer=`verification adapter`; Ingresses=worker verify,evaluator,self-audit; Enablement=verification-required; Proof=`verification-isolation-authority`; Disposition=staged-foundation(488-009,488-010,488-011)

Define a language-neutral authority choosing immutable snapshot, scoped project graph or typed HOLD.
Bind task/attempt/generation, changed paths and allowed consumers. Never classify ambient concurrent
errors as the current task's failure.

**Test:** `npx vitest run tests/core/verification-isolation-authority.test.ts`

**NO-GO:** TypeScript-only policy, mutable HEAD authority, repository-global lock or fail-open fallback.

## Task 9: TypeScript scoped verification adapter

- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/core/verification-typescript-adapter.ts, tests/core/verification-typescript-adapter.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 488-008
- Wiring: Producer=`verification isolation authority`; Consumer=`TypeScript verification adapter`; Ingresses=TypeScript projects; Enablement=stack capability; Proof=`typescript-isolated-verification`; Disposition=production-wired

Build a shell-free TypeScript verification invocation against the admitted snapshot/scoped graph.
Return executed files, config identity, output digest and foreign-error diagnostics separately.

**Test:** `npx vitest run tests/core/verification-typescript-adapter.test.ts`

**NO-GO:** Ambient `npx tsc --noEmit` as task verdict, shell=true, temporary tsconfig in source tree or ignored exit evidence.

## Task 10: Worker verification consumer

- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/agents/worker-verify.ts, src/orchestra/worker-verify-tool.ts, tests/agents/worker-verify-isolation-wire.test.ts, tests/orchestra/worker-verify-isolation-wire.test.ts
- Scope: src/agents/, src/orchestra/, src/core/, tests/agents/, tests/orchestra/, tests/core/
- Dependencies: 488-008, 488-009
- Wiring: Producer=`verification adapter result`; Consumer=`worker verification loop`; Ingresses=all worker backends; Enablement=task verify contract; Proof=`worker-verification-isolation-wire`; Disposition=production-wired

Replace ambient global typecheck verdicts in worker paths with admitted verification results. A foreign
concurrent failure must be diagnostic/HOLD, not NO_GO and not a consumed FIX retry.

**Test:** `npx vitest run tests/agents/worker-verify-isolation-wire.test.ts tests/orchestra/worker-verify-isolation-wire.test.ts`

**NO-GO:** Retry loop on identical foreign error, global execution mutex, mock-only adapter or false DONE.

## Task 11: Evaluator and FIX-budget isolation semantics

- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: high
- Skills: typescript-expert, testing-expert, system-architect
- Files: src/orchestra/result-evaluator.ts, src/core/task-result-settlement.ts, src/orchestra/fix-repair-authority.ts, tests/orchestra/evaluation-verification-isolation.test.ts, tests/core/task-result-settlement.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, tests/core/
- Dependencies: 488-010
- Wiring: Producer=`isolated verification evidence`; Consumer=`result evaluator + FIX authority`; Ingresses=EVALUATE,FIX; Enablement=verification evidence present; Proof=`verification-hold-fix-budget`; Disposition=production-wired

Ensure isolation HOLD parks the attempt without manufacturing NO_GO or spending retry budget. A scoped
failure attributable to the task remains NO_GO and follows normal repair authority.

**Test:** `npx vitest run tests/orchestra/evaluation-verification-isolation.test.ts tests/core/task-result-settlement.test.ts`

**NO-GO:** HOLD→DONE, HOLD→NO_GO, duplicate attempt count or global sprint pause for an unrelated task.

## Task 12: Concurrent verification two-writer canary

- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: high
- Skills: testing-expert, typescript-expert, system-architect
- Files: tests/orchestra/concurrent-verification-isolation.integration.test.ts
- Scope: tests/orchestra/, src/orchestra/, src/core/, src/agents/, tests/core/, tests/agents/
- Dependencies: 488-009, 488-010, 488-011
- Wiring: Producer=`two concurrent source generations`; Consumer=`bounded isolation canary`; Ingresses=worker verify,evaluator; Enablement=explicit-test; Proof=`concurrent-verification-canary`; Disposition=test-only

Create two independent task snapshots where one contains a temporary type error. Prove the other task
can pass its own scoped authority, the failing task is attributed correctly, and no retry is consumed
for foreign evidence. Use tmpdirs and async child processes; no repository mutation.

**Test:** `npx vitest run tests/orchestra/concurrent-verification-isolation.integration.test.ts`

**NO-GO:** Fixed sleep, shared mutable fixture, global lock, full suite or timing-dependent success.

## Task 13: Post-settlement verification stage contract

- Provider: codex
- Model: gpt-5.6-sol
- Auth: subscription
- Effort: high
- Skills: system-architect, typescript-expert, testing-expert
- Files: src/core/post-settlement-verification.ts, tests/core/post-settlement-verification.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
- Wiring: Producer=`terminal receipt + build identity`; Consumer=`post-settlement stage reducer`; Ingresses=Sprint,RunFlow,Do,Autonomous,Process; Enablement=declared promotion proof; Proof=`post-settlement-stage-contract`; Disposition=staged-foundation(488-014,488-015,488-016)

Define a provider-neutral stage after terminal source settlement with fenced receipt identity, explicit
build permission, bounded command adapter, promotion result and typed HOLD. It is not a logical task,
does not alter N/N, and cannot run before coordinator containment.

**Test:** `npx vitest run tests/core/post-settlement-verification.test.ts`

**NO-GO:** In-sprint build bypass, synthetic task/result, timer transition or completion before receipt.

## Task 14: Planner projection for post-settlement proof

- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: high
- Skills: typescript-expert, system-architect, testing-expert
- Files: src/core/task-types.ts, src/orchestra/sprint-planner.ts, src/orchestra/task-builder.ts, src/orchestra/run-flow-plan-service.ts, tests/orchestra/post-settlement-planner-wire.test.ts
- Scope: src/core/, src/orchestra/, tests/core/, tests/orchestra/
- Dependencies: 488-013
- Wiring: Producer=`directive promotion-proof declaration`; Consumer=`plan projection`; Ingresses=Sprint,RunFlow,Do,Autonomous,Process; Enablement=explicit-declaration; Proof=`post-settlement-plan-projection`; Disposition=production-wired

Represent post-settlement proof separately from executable tasks across every planning surface. Its
scope, platform capability and command adapter are digest-bound without inflating task count.

**Test:** `npx vitest run tests/orchestra/post-settlement-planner-wire.test.ts`

**NO-GO:** Hidden task, provider/model hardcode, raw shell string or Sprint-only projection.

## Task 15: Controller post-settlement transition

- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: high
- Skills: typescript-expert, system-architect, testing-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-phases.ts, tests/orchestra/post-settlement-controller-wire.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, tests/core/
- Dependencies: 488-002, 488-013, 488-014
- Wiring: Producer=`cleanup-eligible terminal receipt`; Consumer=`post-settlement stage controller`; Ingresses=terminal lifecycle; Enablement=promotion proof declared; Proof=`post-settlement-controller-wire`; Disposition=production-wired

After exact containment and receipt publication, authorize the declared build/proof stage. Publish
COMPLETE source settlement monotonically while exposing promotion PENDING/RUNNING/PASSED/HOLD as a
separate authority. Crash/restart must resume by generation and never replay a consumed promotion.

**Test:** `npx vitest run tests/orchestra/post-settlement-controller-wire.test.ts`

**NO-GO:** Build while coordinator active, COMPLETE regression, duplicate promotion or receipt deletion.

## Task 16: Post-settlement CLI and recovery surfaces

- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/status.ts, src/cli/commands/recover.ts, src/core/sprint-terminal-publication-status.ts, tests/cli/post-settlement-status-recovery.test.ts
- Scope: src/cli/, src/core/, tests/cli/, tests/core/
- Dependencies: 488-003, 488-015
- Wiring: Producer=`post-settlement authority`; Consumer=`CLI status/recover`; Ingresses=CLI-human,CLI-json,CLI-watch,recover; Enablement=stage-present; Proof=`post-settlement-cli-recovery`; Disposition=production-wired

Expose source settlement and promotion state without conflation. Recovery resumes only a fenced held
promotion; source tasks never rerun and cleanup/receipt remain intact.

**Test:** `npx vitest run tests/cli/post-settlement-status-recovery.test.ts`

**NO-GO:** COMPLETE→ACTIVE regression, re-spawned worker, unapproved command or receipt-free resume.

## Task 17: Hermetic post-settlement lifecycle contract

- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: high
- Skills: testing-expert, typescript-expert, security-specialist
- Files: tests/orchestra/post-settlement-lifecycle.integration.test.ts
- Scope: tests/orchestra/, src/orchestra/, src/core/, src/cli/, tests/core/, tests/cli/
- Dependencies: 488-015, 488-016
- Wiring: Producer=`terminal receipt + promotion declaration`; Consumer=`bounded lifecycle canary`; Ingresses=Sprint,RunFlow,Do,Autonomous,Process,CLI; Enablement=explicit-test; Proof=`post-settlement-lifecycle-canary`; Disposition=test-only

Simulate exact containment, source COMPLETE, authorized promotion, crash/recovery and successful proof
inside a tmp project. Assert task denominator is unchanged and no command runs before terminal receipt.

**Test:** `npx vitest run tests/orchestra/post-settlement-lifecycle.integration.test.ts`

**NO-GO:** Running repository build, fixed sleep, mock phase shortcut, provider call or fabricated receipt.

## Task 18: Every-environment authority matrix

- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: normal
- Skills: testing-expert, system-architect, security-specialist
- Files: tests/core/terminal-verification-environment-matrix.test.ts
- Scope: tests/core/, src/core/, src/orchestra/
- Dependencies: 488-003, 488-007, 488-012, 488-017
- Wiring: Producer=`all four authority contracts`; Consumer=`platform capability matrix`; Ingresses=Linux,macOS,Windows-native,WSL; Enablement=explicit-test; Proof=`terminal-verification-environment-matrix`; Disposition=test-only

Prove path, atomic rename, process capability and unsupported-platform HOLD decisions for Linux,
macOS, Windows native and WSL without claiming unavailable runtime execution.

**Test:** `npx vitest run tests/core/terminal-verification-environment-matrix.test.ts`

**NO-GO:** POSIX-only path, fake Windows execution, silent unsupported platform or provider hardcode.

## Task 19: Canonical closure integration canary

- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: high
- Skills: testing-expert, system-architect, typescript-expert
- Files: tests/orchestra/terminal-verification-closure.integration.test.ts
- Scope: tests/orchestra/, src/orchestra/, src/core/, src/cli/, src/mcp/, src/agents/, tests/core/, tests/cli/, tests/mcp/, tests/agents/
- Dependencies: 488-003, 488-007, 488-012, 488-017, 488-018
- Wiring: Producer=`logical-id + landing + verification + post-settlement chains`; Consumer=`canonical closure canary`; Ingresses=Sprint,RunFlow,Do,Autonomous,Process,CLI,MCP; Enablement=explicit-test; Proof=`terminal-verification-closure`; Disposition=test-only

Exercise one bounded DAG covering exact logical IDs, structured landing publication, foreign-error
isolation, terminal receipt and post-settlement promotion. Assert every production producer has a real
consumer and no stage inflates logical task metrics.

**Test:** `npx vitest run tests/orchestra/terminal-verification-closure.integration.test.ts`

**NO-GO:** Import-only proof, full suite, repository build, skipped assertion or mock-only lifecycle.

## Task 20: Negative replay and regression ledger evidence

- Provider: claude
- Model: claude-opus-5
- Auth: subscription
- Effort: high
- ModelEffort: medium
- Skills: testing-expert, system-architect, security-specialist
- Files: tests/orchestra/sprint-487-residual-negative-replay.test.ts
- Scope: tests/orchestra/, src/orchestra/, src/core/, src/cli/, src/mcp/, src/agents/
- Dependencies: 488-019
- Wiring: Producer=`Sprint-487 malformed/composite/concurrent/stale-dist fixtures`; Consumer=`negative replay`; Ingresses=all repaired surfaces; Enablement=explicit-test; Proof=`sprint-487-residual-negative-replay`; Disposition=test-only

Replay the four exact Sprint-487 failure classes: composite logical ID, malformed landing JSON,
foreign concurrent type error and stale in-sprint dist. Each must reach its typed repaired outcome;
none may become DONE, consume a wrong retry or block unrelated work.

**Test:** `npx vitest run tests/orchestra/sprint-487-residual-negative-replay.test.ts`

**NO-GO:** Sanitized fixture that cannot reproduce the defect, timer success, test-only production branch or full suite.

---

## Stop Lines

1. The sprint must never run `npm run build`, `npm run build:all` or the repository binary-contract
   command while active. Task 013–017 implement and hermetically simulate the post-settlement stage;
   real built-binary promotion runs only after this sprint reaches terminal settlement.
2. Task 001 is foundation only; 002 and 003 must wire it through receipt, CLI and MCP before the
   logical-ID chain counts as complete.
3. Task 004 is foundation only; 005–007 must remove every backend/free-form writer and preserve
   cleanup diagnostics before the landing chain counts as complete.
4. Task 008 is foundation only; 009–012 must prove worker/evaluator behavior under concurrent writes.
5. Task 013 is foundation only; 014–017 must wire planning, controller and recovery without adding a
   logical task or regressing COMPLETE.
6. Unsupported provider, platform, snapshot or build capability is typed HOLD. No silent fallback,
   same-provider self-verification, fabricated parity or global execution mutex.
7. Automatic self-audit executes only task-declared scoped tests. Full suite remains prohibited.
8. Any required chain HOLD leaves a resumable sprint with evidence intact; no cleanup or synthetic result.

## Supervisor Verification

Sol verifies task/result lineage, exact scoped test evidence, event/heartbeat continuity, provider
admission, disk reachability and canonical status. After terminal settlement—and only then—the owner
may run the normal build plus real binary promotion proof. No start, finalize or cleanup is part of
this planning operation.
