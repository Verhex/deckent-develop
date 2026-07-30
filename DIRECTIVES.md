# DIRECTIVES — Universal Execution Recovery Kernel · Foundation Dogfood

## Goal
Implement the first production-grade slice of `RECOVERY-001` as one provider-neutral,
cold-lane recovery authority shared by Sprint, Run, Flow, Do, Autonomous, Mission and
Process. Preserve the healthy execution hot path, forbid duplicate effects, and make every
ambiguous recovery outcome a typed HOLD.

## Governing Work IDs
- `RECOVERY-DECISION-001`
- `RECOVERY-MODE-ADAPTERS-001`
- `RECOVERY-COMMAND-SERVICE-001`
- `RECOVERY-TERMINATION-001`
- `RECOVERY-STALE-PROJECTION-001`
- `RECOVERY-ASSURANCE-001`
- `RECOVERY-DOGFOOD-BORN-001`

## Execution Contract
- ADR-G-025 and `docs/MASTER-PLAN.md` are authority. Workers may read them but must not
  modify MASTER, generated projections, ADRs, memory, config or DIRECTIVES.
- Recovery is a cold lane. No task may add a repository-wide scan, provider probe,
  synchronous process sweep or recovery lock to the healthy scheduler/dispatch tick.
- `executionId + generation + attemptId + leaseFence + processIdentity + settlement`
  is the recovery identity. Dashboard, PID, heartbeat, task files and job files are evidence
  projections, never independent state authorities.
- Unknown ownership, missing settlement, PID reuse, generation conflict and ambiguous
  process liveness produce typed HOLD. They never silently replay a provider, filesystem,
  ERP, payment or connector side effect.
- All public types and decisions are provider-, model-, surface- and language-neutral.
- All user-facing text uses the existing i18n message authority. Mechanism modules remain
  string-free.
- Cross-platform behavior is expressed through explicit platform/process adapters; Linux-only
  behavior must not masquerade as universal support.
- Every task must preserve existing behavior outside its declared files and dependencies.
- Every test is hermetic, tmpdir-based and async; `spawnSync`, real provider calls and writes
  to repository runtime authority are forbidden.
- Dogfood findings are not silently fixed. The supervising Sol session records each new,
  non-duplicate defect as a `RECOVERY-BORN-*` child with exact evidence before any follow-up
  task is admitted.
- Concrete provider/model assignments below are this run's effective-config projection, not
  product policy. Product code must not contain these identities.
- Worker count and concurrency are resolved from effective config with a hard ceiling of six.

## Expected Settlement
- Eight logical tasks, with dependency-gated dispatch.
- Task 2 starts only after Task 1 is aggregate DONE so the adapter imports one canonical
  decision schema instead of creating a temporary duplicate.
- Task 3 starts only after Tasks 1 and 2 are aggregate DONE.
- Tasks 4 and 5 start only after Task 3 is aggregate DONE.
- Task 6 starts only after Tasks 4 and 5 are aggregate DONE.
- Task 7 starts only after Task 6 is aggregate DONE because both surfaces extend the same
  i18n message authority.
- Task 8 starts only after Task 7 is aggregate DONE.
- A generated FIX belongs to the same logical task and does not increase logical task count.
- Provider/auth/admission failure is `NOT_DISPATCHED` or provider HOLD, not worker NO_GO.
- No MASTER outcome is marked DONE by this sprint unless its complete acceptance and truth
  matrix is independently proven.

## Task 1: RECOVERY-DECISION — canonical cold-lane decision engine
- Provider: codex
- Model: gpt-5.6-sol
- Auth: subscription
- Effort: high
- Files: src/core/execution-recovery.ts, tests/core/execution-recovery.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none

### Description
Create the provider-neutral recovery evidence and decision contract. The public API must be
pure and deterministic, require the exact attempt/fence identity, distinguish monotonic
progress from stale wall-clock projections, and return only the canonical decisions:
`HEALTHY`, `STALLED`, `ORPHANED`, `NOT_DISPATCHED`, `PAUSED`, `HELD`,
`SAFE_TO_RESUME`, `SAFE_TO_FINALIZE`.

The decision must include typed reason codes, evidence references, allowed next operations,
and a fail-closed explanation when evidence is incomplete or contradictory. Healthy input
must take an O(1) bounded path with no filesystem, provider, process or network access.

**Proof:** `test -f src/core/execution-recovery.ts && test -f tests/core/execution-recovery.test.ts`
**Test:** `npx vitest run tests/core/execution-recovery.test.ts`
**NO-GO:** Any provider/model literal, time-only orphan verdict, implicit replay permission,
unbounded evidence collection or second lifecycle authority.

## Task 2: RECOVERY-ADAPTER-CONTRACT — mode and platform adapter boundary
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: high
- Files: src/orchestra/execution-recovery-adapter.ts, tests/orchestra/execution-recovery-adapter.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 1

### Description
Define the mode/platform adapter boundary that translates native Sprint, Run, Flow, Do,
Autonomous, Mission and Process evidence into the canonical decision input and applies only
explicit, fenced effects returned by the application service. Include capability declarations
for inspect, resume, settle, abort and terminate; unsupported operations fail honestly with
typed results.

The contract must prevent adapters from inventing lifecycle state, clearing foreign authority,
or mutating evidence during inspection. Cover POSIX, Windows-native, WSL and OCI process
identity capabilities without pretending unsupported primitives exist.

**Proof:** `test -f src/orchestra/execution-recovery-adapter.ts && test -f tests/orchestra/execution-recovery-adapter.test.ts`
**Test:** `npx vitest run tests/orchestra/execution-recovery-adapter.test.ts`
**NO-GO:** Surface-specific decision enums, inspection-side writes, silent unsupported fallback
or adapter-owned retry loops.

## Task 3: RECOVERY-SERVICE — canonical inspect/resume/settle/abort service
- Provider: codex
- Model: gpt-5.6-sol
- Auth: subscription
- Effort: high
- Files: src/orchestra/execution-recovery-service.ts, tests/orchestra/execution-recovery-service.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 1, Task 2

### Description
Implement the application service consuming the canonical decision engine and registered
adapters. It must support read-only inspect plus approval/fence-bound resume, settle, abort
and terminate operations. Every mutation uses exact execution/generation/attempt identity,
idempotency key and lease fence; a failed continuation preserves the previous resumable
authority.

The service must separate decision from effect, produce immutable audit-ready receipts,
refuse duplicate or out-of-order effects, and expose dependency injection seams for clock,
process identity and persistence. Do not wire user-facing CLI text here.

**Proof:** `test -f src/orchestra/execution-recovery-service.ts && test -f tests/orchestra/execution-recovery-service.test.ts`
**Test:** `npx vitest run tests/orchestra/execution-recovery-service.test.ts`
**NO-GO:** Direct CLI/MCP dependency, global singleton state, blind retry, mutation during
inspect or success without durable settlement evidence.

## Task 4: RECOVERY-SPRINT-ADAPTER — migrate Sprint containment to shared service
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: high
- Files: src/orchestra/recovery-adapters/sprint-recovery-adapter.ts, src/cli/commands/recover.ts, src/cli/commands/finalize.ts, src/cli/commands/cleanup.ts, tests/orchestra/sprint-recovery-adapter.test.ts, tests/cli/recover-resume.test.ts, tests/cli/finalize-orphan-normal.test.ts, tests/cli/cleanup-authority.test.ts
- Scope: src/orchestra/recovery-adapters/, src/cli/commands/, tests/orchestra/, tests/cli/
- Dependencies: Task 3

### Description
Implement and wire the Sprint adapter over the existing canonical status, checkpoint, PID
ownership and verified termination foundations. Preserve the proven SIGTERM → configured wait
→ ownership recheck → SIGKILL → death-proof contract. Finalize and cleanup must remain HOLD
when coordinator death or ownership is unverified.

Move decision ownership into the shared service without duplicating process logic or weakening
current CLI behavior. Existing public CLI messages remain i18n-backed.

**Proof:** `test -f src/orchestra/recovery-adapters/sprint-recovery-adapter.ts`
**Test:** `npx vitest run tests/orchestra/sprint-recovery-adapter.test.ts tests/cli/recover-resume.test.ts tests/cli/finalize-orphan-normal.test.ts tests/cli/cleanup-authority.test.ts`
**NO-GO:** Regression of current death-proof finalize/cleanup, PID-only identity, status
projection becoming mutation authority or direct hardcoded user text.

## Task 5: RECOVERY-RUN-ADAPTERS — RunFlow and RunJob recovery evidence
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: high
- Files: src/orchestra/recovery-adapters/run-flow-recovery-adapter.ts, src/orchestra/recovery-adapters/run-job-recovery-adapter.ts, tests/orchestra/run-flow-recovery-adapter.test.ts, tests/orchestra/run-job-recovery-adapter.test.ts
- Scope: src/orchestra/recovery-adapters/, tests/orchestra/
- Dependencies: Task 3

### Description
Implement read/effect adapters for durable RunFlow handles and RunJob records. Translate raw
`DETACHED_RUNNING`, `RUNNING`, stale/dead process evidence and terminal receipts into the
shared decision contract. A raw running flag without matching process/attempt authority must
never become live truth or automatic replay permission.

Retain forensic records and return explicit reconciliation proposals. This task must not
bulk-mutate the current repository's historical runtime records; tests use isolated fixtures.

**Proof:** `test -f src/orchestra/recovery-adapters/run-flow-recovery-adapter.ts && test -f src/orchestra/recovery-adapters/run-job-recovery-adapter.ts`
**Test:** `npx vitest run tests/orchestra/run-flow-recovery-adapter.test.ts tests/orchestra/run-job-recovery-adapter.test.ts`
**NO-GO:** Destructive stale-file deletion, raw-status trust, automatic provider replay or
repository runtime-state mutation from tests.

## Task 6: RECOVERY-SURFACES — CLI and MCP shared recovery commands
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: high
- Files: src/cli/commands/recover.ts, src/cli/helpers/messages.ts, src/mcp/tools/recover.ts, src/mcp/tools/index.ts, tests/cli/recover-resume.test.ts, tests/mcp/recover.test.ts, tests/mcp/tools/index.test.ts
- Scope: src/cli/, src/mcp/, tests/cli/, tests/mcp/
- Dependencies: Task 4, Task 5

### Description
Expose the shared service through typed inspect, resume, settle and abort operations while
preserving the existing Sprint command compatibility. CLI and MCP must consume the same
application service and decision schema. CLI text is fully localized; MCP returns stable
structured fields and never re-derives lifecycle.

Mutating operations require exact execution identity, expected generation/fence and explicit
approval authority. Inspection stays read-only.

**Proof:** `test -f src/mcp/tools/recover.ts && test -f tests/mcp/recover.test.ts`
**Test:** `npx vitest run tests/cli/recover-resume.test.ts tests/mcp/recover.test.ts tests/mcp/tools/index.test.ts`
**NO-GO:** CLI/MCP semantic divergence, surface-owned decision logic, mutation without fence,
hardcoded natural-language output or breaking current Sprint recovery syntax.

## Task 7: RECOVERY-NERVOUS — durable notification and continuation approval
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: high
- Files: src/nervous/recovery-notification.ts, src/core/pending-approvals.ts, src/cli/commands/nervous.ts, src/cli/helpers/messages.ts, tests/nervous/recovery-notification.test.ts, tests/core/pending-approvals.test.ts, tests/cli/nervous.test.ts
- Scope: src/nervous/, src/core/, src/cli/, tests/nervous/, tests/core/, tests/cli/
- Dependencies: Task 6

### Description
Create durable, deduplicated Nervous notifications for `STALLED`, `ORPHANED`, `PAUSED` and
actionable `HELD` decisions. Bind approval to execution/generation/attempt, decision digest,
operation, expiry and single-use idempotency key. Acceptance invokes the shared recovery
service; rejection and expiry preserve evidence and produce terminal approval state.

Notifications must identify product impact, dogfood impact, root evidence and safe operations
without exposing secrets or inventing provider availability.

**Proof:** `test -f src/nervous/recovery-notification.ts && test -f tests/nervous/recovery-notification.test.ts`
**Test:** `npx vitest run tests/nervous/recovery-notification.test.ts tests/core/pending-approvals.test.ts tests/cli/nervous.test.ts`
**NO-GO:** Duplicate notification storms, unbound approval, approval replay, secret leakage,
same-provider inference or direct effect execution outside the shared service.

## Task 8: RECOVERY-ASSURANCE — adversarial contract and hot-path proof
- Provider: codex
- Model: gpt-5.6-sol
- Auth: subscription
- Effort: high
- Files: tests/orchestra/execution-recovery-assurance.test.ts, tests/cli/recovery-lifecycle-binary.integration.test.ts, scripts/verify-recovery-hot-path.mjs
- Scope: tests/orchestra/, tests/cli/, scripts/
- Dependencies: Task 6, Task 7

### Description
Build the adversarial assurance harness for auth absence, provider unreachability,
pre-dispatch death, partial/malformed result, no-progress coordinator, ignored SIGTERM, PID
reuse, stale dashboard, generation conflict and cleanup-during-live. Prove that healthy
dispatch does not invoke recovery scans/probes/locks and that each failure yields one typed,
idempotent decision without duplicate external effects.

The binary integration test uses isolated tmpdirs and async subprocesses. The verification
script is deterministic, bounded and read-only against production source.

**Proof:** `test -f tests/orchestra/execution-recovery-assurance.test.ts && test -f tests/cli/recovery-lifecycle-binary.integration.test.ts && test -f scripts/verify-recovery-hot-path.mjs`
**Test:** `npx vitest run tests/orchestra/execution-recovery-assurance.test.ts tests/cli/recovery-lifecycle-binary.integration.test.ts`
**NO-GO:** Mock-only binary claim, unbounded chaos loop, repository-state mutation, provider
call, hidden platform skip or healthy-path recovery work.
