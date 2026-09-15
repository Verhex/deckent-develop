# R43 bounded clarification — preserve the live observer

Read-only, no run/build/source/runtime/auth mutations. Follow up R42 timeout analysis; no communication.md. Scope MASTER3178/120 only.

The proposed collector drain + existing PAUSED exit has three unresolved contracts. Verify source and return one connected implementation recommendation:

1. Exact absolute deadline: scope.execution.taskTimeoutSeconds exists, but providerStartReceipt.observedAt is START_AUTHORIZATION_ACCEPTED with providerState NOT_STARTED. Find the durable actual execution start anchor, any narrower execution/continuation budget and distinct post-provider capture/release deadline. Specify exact producer and reader. No Date.now()+full timeout on resume, no arbitrary grace.
2. Live owner: existing staged barrier at sprint-controller4302–4360 stops all monitors, releases lock, clears PID and returns. That cannot be reused for live/unknown A. Find an existing observer-transfer receipt/service, or validate PAUSED admission with coordinator observer retained (no EVALUATE, no return) until proven containment/terminal boundary. Explain CLI/RunFlow/lease/checkpoint semantics and behavior when drain budget expires with daemon present/unknown. No unauthorized kill, no unbounded paid extension and no merely labelling an orphan PAUSED.
3. Drain must still serve IPC questions; awaitTaskResultAuthority alone does not. Specify reusing existing collector polling with all dispatch producers gated after watcher wake, including nervous respawn. Validate that this does not create a new execution budget.

Give exact edits for D1–D4 in IMPLEMENTATION-CONTRACT.md and one connected test. Preserve contradictory identity guards. If current product contracts cannot simultaneously guarantee finite observer lifetime, no orphan and no automatic containment, name that incompatibility rather than inventing a handoff or default kill permission. No repeat audit of already-verified R41/R42.
