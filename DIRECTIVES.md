# DIRECTIVES — 7081 XVERIFY-CHANNEL-TRUTH: approval freshness, durable evidence, waiting signal, finalize termination truth

> **SETTLED 2026-08-18 — NOT AN ACTIVE RUN.** sprint-556 closed 3/3 (001 DONE ·
> 002/003 GO_WITH_TECH_DEBT, debts hand-closed by Brain) and landed together with
> the full-suite debt payment (52 stale reds triaged: 1 real collector
> settlement-authority bug fixed, 1 ADR format gap completed, rest realigned to
> owner-approved behavior changes). Evidence: MASTER 7081 row. This file awaits
> the next run's contract.

## Goal

MASTER 7081 (owner-admitted 2026-08-18: "bulgularında düzeltme izni verildi sonraki
sprintte ele alınsın"). Six typed xverify/finalize failures across two days left ZERO
actionable evidence and killed honest verification: (a) approval-pending blocks
silently forever — `--timeout` never applies and no waiting signal prints; (b) the
provider-evidence-probe approval requestId is deterministic and first-writer-wins, so
a re-run adopts the PREVIOUS run's expired request/decision and dies
`DECISION_UNTRUSTED` (repro aprp-da1e516f); (c) `xverify_v2_bootstrap_failed` buries
the composition exception detail in a digest — zero durable raw record; (d) a
schema-rejected adjudication response ("Expected object, received null") persists no
raw provider output and no per-assertion breakdown, so nobody can see WHICH assertion
was undecidable; (e) settled xverify twin tasks stay PENDING with no receipt and HOLD
the clean gate; (f) finalize counts a worker-not-found (already dead) as
"could-not-terminate" and HOLDs terminal settlement (three sprints needed hand
settlement). This sprint closes all six with durable typed evidence.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- Parallel execution ADMITTED; single-writer chokepoints: ONLY task 1 writes
  src/orchestra/cross-verify-evidence-preparation.ts,
  src/orchestra/cross-verify-invocation-coordinator.ts,
  src/orchestra/cross-verify-runtime-bootstrap.ts and
  src/orchestra/cross-verify-runner.ts; ONLY task 2 writes
  src/cli/commands/xverify.ts and src/cli/helpers/messages.ts; ONLY task 3 writes
  src/cli/commands/kill.ts and src/cli/commands/finalize.ts.
- Approval/authority semantics NEVER weaken: fail-closed stays fail-closed; a fresh
  approval is still required per run; no auto-approve, no trust-bypass, no silent
  fallback. The fixes add FRESHNESS and EVIDENCE, not leniency.
- Billing/usage/audit counters never reset; durable writes are append/atomic
  temp+rename; mechanism modules string-free; user-visible text via getMessage en+tr.
- Hermetic tmpdir tests only. Use worker comms (sharedNotes + handoff notes).
- Echo the policy digest in your .result as runPolicyEvidence exactly as the prompt's
  Result contract instructs.

## Task 1: approval freshness + durable adjudication evidence (channel authority core)
- Files: src/orchestra/cross-verify-evidence-preparation.ts, src/orchestra/cross-verify-invocation-coordinator.ts, src/orchestra/cross-verify-runtime-bootstrap.ts, src/orchestra/cross-verify-runner.ts, tests/orchestra/cross-verify-channel-truth.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Provider: codex
- Model: gpt-5.6-sol

### Description
1. PROBE FRESHNESS: the provider-evidence-probe subject gains a per-run attempt nonce
   (the existing runId/runtimeFingerprint is available at the call site) so the
   requestId is unique per run — a re-run can NEVER adopt a previous run's expired
   request/decision. The APR_DUPLICATE_ID adoption branch stays only for genuine
   same-run concurrent contenders (same nonce). A found-but-stale decision keeps its
   typed hold BUT the hold record now persists {requestId, validation reason
   (request-expired/session-expired/…)} durably.
2. BOOTSTRAP DETAIL TRUTH: every composition/bootstrap hold
   (xverify_v2_bootstrap_failed, prompt-ceiling, evidence holds) writes one durable
   JSON record (append, atomic) under the existing .analysis/xverify/ area:
   {reasonCode, detail, at, taskId, digestRef} — the digest stays in the receipt, the
   DETAIL becomes readable. The runner's hold path threads `composed.detail` through
   instead of dropping it.
3. RAW ADJUDICATION EVIDENCE: when the v2 adjudication response fails schema
   validation, the RAW provider output (bounded, e.g. first 256KB) is persisted next
   to the report before the unclear verdict is returned; the record carries the
   schema-rejection reason. When validation SUCCEEDS, the per-assertion breakdown
   (assertionId → supported/contradicted/undecidable + missing-evidence entries) is
   persisted into the .analysis/xverify report file — the host disposition already
   derives from it, so this is projection, not new authority.
4. TWIN RECEIPT CLOSURE: when the runner reaches ANY terminal outcome (confirmed,
   unclear, unavailable, hold), the xverify twin task record it created is settled
   with a terminal status + result marker so the clean gate never reports a settled
   twin as receipt-missing PENDING.
5. Tests: nonce uniqueness across two composed runs (no adoption); stale-decision
   hold persists validation reason; bootstrap hold writes readable detail record;
   schema-reject persists raw output; per-assertion breakdown lands in the report;
   twin task terminal after each outcome class.

GO: suite green; tsc 0; every typed hold path proven to leave a durable, readable
record; fail-closed semantics byte-equivalent (no new allow path).
NO_GO: any weakened approval check, auto-approve, or a hold that still leaves zero
disk evidence.

## Task 2: xverify CLI waiting signal + approval-phase timeout (depends on Task 1)
- Files: src/cli/commands/xverify.ts, src/cli/helpers/messages.ts, tests/cli/xverify-waiting-signal.test.ts
- Scope: src/cli/, tests/cli/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
1. WAITING SIGNAL: while the run is blocked on a pending approval, the CLI prints ONE
   typed line per approval request (new i18n keys en+tr):
   "waiting-approval: <aprp-id> — decide via `deckent approvals decide <id>`" — the
   16-minute silent block dies. The signal goes to stderr so `--json` stdout stays
   machine-clean.
2. APPROVAL-PHASE TIMEOUT: `--timeout` now bounds the approval wait too (not only
   the provider call). On expiry the CLI reports the existing typed
   approval_undecided hold (no new outcome class) with the aprp id in the message,
   exit code unchanged for holds.
3. The JSON output for every hold/skip now includes the `detail` field Task 1 makes
   durable (skippedReason keeps its exact current value — additive field only).
4. Tests: fake approval authority — pending → waiting line printed once per request;
   timeout expiry → typed undecided with id; --json stdout parses clean with the
   additive detail field; decided-fast path prints no waiting line.

GO: suite green; tsc 0; waiting line + bounded wait proven; --json backward
compatible (existing keys byte-identical).
NO_GO: polluted --json stdout, a second timeout flag, or any change to decision
authority semantics.

## Task 3: finalize/kill already-terminated truth (depends on nothing)
- Files: src/cli/commands/kill.ts, src/cli/commands/finalize.ts, tests/cli/finalize-termination-truth.test.ts
- Scope: src/cli/, tests/cli/
- Provider: claude
- Model: claude-sonnet-5

### Description
1. killSingle returns a TYPED result ('killed' | 'not-found' | 'failed') instead of
   boolean — 'not-found' (backend reports no such worker/window) means the process is
   already gone. Existing callers that only need "is it dead now" treat
   killed|not-found as success. The not-found path still prints its current message
   and still releases locks/status exactly as today.
2. forceKillLiveWorkers counts 'not-found' as terminated (goal state reached:
   no live worker), 'failed' (real kill error: permission, backend error) still
   fails the sweep. Finalize therefore no longer HOLDs terminal settlement over
   workers that are already dead — the three-sprint hand-settlement class dies.
3. finalize prints a distinct typed line for already-dead workers (new i18n key
   en+tr) so the operator sees the truth ("already terminated: ids"), never a fake
   "terminated N workers".
4. Tests: not-found → sweep success + finalize proceeds; real kill failure → sweep
   fails + finalize HOLDs exactly as today; mixed case; message assertions via
   getMessage keys (no hardcoded strings).

GO: suite green; tsc 0; dead-worker finalize proceeds, real-failure finalize still
HOLDs; i18n keys en+tr.
NO_GO: treating a real kill failure as success, or any hardcoded user-facing string.
