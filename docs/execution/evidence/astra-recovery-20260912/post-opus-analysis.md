# Post-Opus evidence: exact discovery versus recovery readiness

Status: DEGRADED/HOLD. No product source mutation or runtime recovery was performed.

Two fresh Node processes used the production createExactDockerTaskAuthorityDiscriminator
against real748 custody, both exit0 and state exact. This proves durable authority
discovery after process restart, not reconstruction of rejected-result readers or
retirement/settlement. The complete cold fan-in proof remains missing.

Production source cold path: spawn-backend-docker.ts:19761 reads accepted first;
19777 reads cold completion; 19799 installs observeExactDockerCompletionAcceptance;
19042 sends it through the canonical assembler; 15056 emits typed schema rejection;
21262 preserves its released query in recovery inventory; 14082 awaits that outcome.
These are source-wiring links, not a live execution receipt.

Daemon risk qualification: spawn-backend-docker.ts:19084-19109 reports absent ONLY
for the exact No-such-object observation. A stopped but existing container reports
present (regardless of State.Running=false); restart-policy alone does not satisfy
absence. Exact ID/reappearance/termination fencing still needs full proof, not
just an extra inspection that introduces another TOCTOU interval.

Real read-only inspectExactDockerPlanningRecoveryHealth completed exit0 at
2026-09-12T15:03:42.373Z: HOLD, sole unresolved748-001, reason
STARTED_ATTEMPT_RECONCILIATION_REQUIRED. Canonical health producer5508, consumer
spawn-backend.ts:1381, accepted-only test17770+. Current typed rejection lives in
startup registry but the planning health reader still requires accepted or retained
failure authority. This is an additional integration boundary, not a reason to
mark rejection successful or skip the health gate. CLI-only repair is insufficient
for general dogfood ingress closure. The structured plan previously passed; an
external-planning health gate and startup preflight are distinct surfaces.

Next admitted engine slice must align the readiness reader and historical rejection
authority, with common exact evidence and typed recoverable/HOLD semantics. Require
real immutable result validation, earlier-generation terminal owner, proven worker
absence, preserved effect/result custody, and fresh revalidation. No synthetic
accepted result, manual task-state write or default-on bypass. Regression matrix:
accepted history, rejected schema, host authority error, current/future/unknown run,
missing/tampered/mutable evidence, daemon present/unknown, fresh-process replay and
changed generation. Then wire CLI to the same authority and run ONE changed-
fingerprint canonical continuation. Provider closure remains HOLD until that proof.

Additional source finding (not exercised): sprint-pid-manager.ts:521 archiveOrphan
retires PID/snapshot and at550-557 moves global sprint-state.json without checking
its sprintId. CLI start.ts:376 invokes it under autoApprove from dead-PID evidence.
Do not use this as a recovery shortcut. Classify RELATED_BUT_NONBLOCKING for the
current no-archive path; it blocks any proposed automatic archive remedy.

Cursor terminal remains owner-paused/collecting; no new Cursor implementation
assignment, new Opus call, build, run, cleanup, commit or push. ENTRY219 was already
consumed; owner's repeated delivery is not another message or receipt.
