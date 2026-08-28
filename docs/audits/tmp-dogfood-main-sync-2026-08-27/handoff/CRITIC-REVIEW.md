# Deckent tmp Dogfood — Independent Design Critic Review

Date: 2026-08-27  
Artifact: `/tmp/deckent-md-contract-authority-20260827`  
Authority/evidence: built CLI captures, `sprint-010` terminal receipt and archive verification,
focused test batteries, [FINDINGS.md](./FINDINGS.md), [SOLUTIONS.md](./SOLUTIONS.md)

VERDICT: **NO-GO**

SCOPE: Terminal `do`, RunFlow/Runs/Start, sprint status/finalize/recovery, Autonomous backlog and
artifact cleanup, approval inbox, provider-observation projection, generated runtime evidence and
the available cross-surface contracts. This verdict applies to accepting or merging the tmp
snapshot as one product change; it does not reject the separately verified source-only packages.

## FINDINGS

### CR-01 — BLOCKER — Forced terminal outcome is not one uniform public lifecycle

- Surface/workflow/state: Terminal status, Runs/job feed and archive after force-finalize ABORTED.
- Evidence: built `status --json` reports `active:false`, `lifecycle/status:ABORTED` and a public
  receipt, but `phase:TRANSITION`; no runtime or archived terminal job exists. Archive verification
  is PASS. See F-050.
- Violated contract: product truth, agentic lifecycle, cross-surface parity, implementation closure.
- Impact: receipt-aware consumers see a closed abort while job/phase consumers see no terminal job
  or a transitional stage.
- Smallest durable remedy: version one terminal projection contract with outcome-neutral terminal
  stage and explicit COMPLETE/ABORTED outcome; migrate all job/feed/watch consumers before enabling
  the producer.
- Verification required: real normal, recovery, completed-checkpoint and force-abort runs must
  produce receipt-bound, archive-verified, byte-consistent status/job/Runs/API/MCP projections.

### CR-02 — BLOCKER — Approved RunFlow cannot be dependably joined in the foreground

- Surface/workflow/state: `runs <id> --start`, `start --consume-approved`, Do coordinator.
- Evidence: detached start reached `PROCESS_SPAWNED`, wrote a zero-byte log and was reaped with its
  parent; death sweep settled `START_PROCESS_DEAD`. Exact foreground ingress is coordinator-only.
  See F-005.
- Violated contract: core workflow, recovery, Every Environment and cross-surface parity.
- Impact: an approved exact plan can fail because of the caller process namespace rather than work
  semantics; Terminal/API/container hosts cannot wait for or reliably recover the same run.
- Smallest durable remedy: public coordinator-owned foreground execution plus durable join/cancel,
  preserving the same snapshot capability and CAS identity as detached mode.
- Verification required: parent-exit and join/cancel batteries on Linux, macOS, Windows native, WSL,
  containers and remote executors.

### CR-03 — HIGH — Approval-required work is not an immediate canonical transaction

- Surface/workflow/state: Process/Autonomous intake before the first runtime loop tick.
- Evidence: approval-required entries do not create a pending request until loop evaluation; provider
  authority HOLDs correctly remain outside human approvals after the tmp visibility fix. See F-029
  and corrected F-040.
- Violated contract: causality, ownership, auditability and information hierarchy.
- Impact: the operator can submit approval-required work and temporarily find no actionable request;
  retry/restart can observe split stores at different stages.
- Smallest durable remedy: intake atomically writes one request/entry identity and approval state,
  while provider HOLD remains a separate execution-admission state.
- Verification required: crash/restart and concurrent-reader tests before/after every transaction
  boundary, plus CLI/Desktop/API/MCP parity for the same request ID.

### CR-04 — HIGH — Long planner calls expose no live invocation identity or safe interruption

- Surface/workflow/state: canonical `do` planning during a real provider dispatch.
- Evidence: the fixed terminal response exposes typed process evidence and receipt, but the preceding
  170 seconds show only elapsed time. See F-003 and F-052.
- Violated contract: streaming interaction, interruption, causality and cost observability.
- Impact: operators cannot correlate, inspect or cancel the actual expensive call while it runs.
- Smallest durable remedy: publish redacted receipt/provider/model/attempt/stage/deadline and a
  cancellable operation ID as lifecycle events immediately after declaration.
- Verification required: real dispatch, retry, timeout and operator-cancel runs; cancellation must
  terminally settle the same receipt without exposing prompts or raw output.

### CR-05 — HIGH — Default terminal status mixes live admission with foreign forensic history

- Surface/workflow/state: `status --json` after ABORTED terminal settlement.
- Evidence: 22 `HOLD/unknown` rows remain; one reports four unresolved intervals while current
  attainment is zero. Existing tests explicitly pin foreign history in IDLE/COMPLETE/next-ACTIVE
  default projections, and ownership keys are not uniform. See F-051.
- Violated contract: freshness, evidence ownership, information hierarchy and scale.
- Impact: live admission appears unhealthy because of historical/foreign evidence; at large tenant
  scale the default payload grows with principals unrelated to the current decision.
- Smallest durable remedy: one canonical run-generation key, current-admission projection and a
  bounded observation-debt summary; full history moves to inspect/audit.
- Verification required: multi-run/multi-tenant interval retirement, foreign-history isolation,
  bounded payload and exact current-run HOLD tests.

## EVIDENCE GAPS

- Dashboard dependencies are absent in this worktree, so combined lint and rendered Dashboard proof
  are unavailable.
- No real Desktop workspace, keyboard/focus, screen-reader, zoom, forced-colors or reduced-motion
  evidence was produced.
- No macOS, Windows native, WSL or remote-executor run evidence was produced.
- MCP/API status and approval surfaces were inspected through contracts/tests, not one simultaneous
  live run correlated with the Terminal receipt.
- The tmp branch is 19 commits behind the audit-time main and both checkouts contain uncommitted
  runtime work; direct patch applicability is unproven.

## ACCEPTED STRENGTHS

- Force settlement never promoted unresolved work to COMPLETE; `sprint-010` is receipt-bound ABORTED
  and its archive verifier passes.
- Autonomous cleanup is archive-first and preserves foreign artifacts; selector failures are typed.
- Provider execution HOLDs are now visibly distinct from pending human approvals.
- Planner and self-audit terminal failures preserve secret-safe process evidence and durable digests;
  planner failure also surfaces the invocation receipt when dispatch occurred.
- Changed CLI strings use en/tr message authority; i18n and Markdown link gates pass.

## CLOSURE

The next critic verdict requires: (1) versioned terminal job/status migration across every consumer,
(2) foreground/join/cancel exact RunFlow proof across the platform matrix, (3) atomic approval intake,
(4) live planner lifecycle/cancel receipts, (5) canonical provider-observation ownership and bounded
default status, and (6) real Desktop/Dashboard accessibility and cross-surface evidence. Until those
exist, small source-only packages may be reviewed independently, but the combined snapshot remains
NO-GO.
