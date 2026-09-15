# R38 — Cold HOLD query and registry contradiction classification

UTC 2026-09-15T08:05:17.327493+00:00. Existing owner-admitted ADR-D-007 package; MASTER 3178 / parent 120. PARTIAL/HOLD, no closure.

- Cold recovery catch preserves the exact producer query after constructing it from released authority and provider start. Registry carries the query into held entries and re-reads release evidence through the backend.
- Recovery report query identity (task/dispatch/admission ref) mismatch is a typed registry contradiction.
- Registry generation-chain, not-dispatched mismatch, accepted replay mismatch, registry replay conflict and execution mode conflict producers emit holdClassification AUTHORITY_CONTRADICTION. This is local registry classification, not a fabricated durable release receipt. A later generic HOLD does not erase the contradiction.
- Shared resumable predicate rejects either explicit registry contradiction or durable release contradiction.
- Lifecycle reconciliation permits resumable report holds; explicit registry contradictions still raise E091. Contain mode still requires workerInventoryState absent for every owned entry; unknown/present remains E091.
- Fresh verified released/accepted recovery can replace a held projection only for the same query and without an existing contradiction.
- Dashboard blocked count includes unique EFFECT_HOLD task IDs alongside staged closure IDs.

Verification: scheduler executor + controller fan-in + exact pause/resume, 89/89 PASS exit0. Final tsc --noEmit exit0. New test checks cold query propagation, evidence reader invocation, unknown containment refusal, absent containment acceptance, and sticky contradiction. Backend report/evidence are injected in this test: not real Docker or cold Store restart proof.

Remaining blocker: healthy pending-settlement task can still get PRIVATE_IPC_AUTHORITY_UNAVAILABLE and collector E077. Backend resolver maps missing live authority, capture/read failures and unexpected failures to this same code. No generic reason-string retry was added. Need typed producer classification, finite transient retry and a truthful containment/park outcome that preserves a live worker's authority. Real Docker A->C/B, restart/operator repair, physical liveness and subsequent settlement remain unproven.

No new sprint/build/MCP reconnect/runtime mutation/commit/push. Cache/current-progress proof still open. R38 does not justify DONE.
