# R43 — live deadline recovery contract, not implemented

Parent: MASTER 3178 / 120. Existing ADR-D-007 recovery scope. Source audit only; production closure HOLD.

Accepted direction: collector deadline closes new dispatch, preserves genuine results and live custody; adopted pending exact attempts re-enter EXECUTE rather than EVALUATE. No global timeout override, no new retry engine, no synthetic result or settlement.

## Code-confirmed blockers in a literal implementation of the supplied design

1. Existing staged PAUSED exit cannot own a live attempt: sprint-controller.ts ~4302–4360 writes state/checkpoint, stops heartbeat/resource/snapshot, removes beforeExit, releases sprint lock, clears active sprint and PID, returns. Reusing the full exit leaves the same orphan as the E077 path. Only its persistence operations can be reused until containment or a verified observer transfer occurs.
2. workerInventoryState active alone is not fresh daemon liveness: backend falls back to containers.has(taskId). R41's map is observation-scoped and can originate in a previous reconcile. Deadline classification needs a fresh exact-identity-bound read, not this map or .hb mtime.
3. A relative taskTimeoutSeconds is not remaining drain time. The execution scope has taskTimeoutSeconds, provider-start bundle has observedAt but providerState NOT_STARTED; blindly anchoring to this timestamp or starting a new full duration on resume is unsafe. Require actual durable provider-execution start binding and any narrower execution budget. Provider completion and host effect settlement have distinct deadlines.
4. Promise-only drain suppresses IPC. Current question polling/approval forwarding lives in collector tick. Awaiting terminalWait alone can deadlock a still-live worker waiting for its question answer. Preserve existing IPC servicing while dispatch is closed.
5. Post-expiry tick can currently dispatch: loop checks time before watcher.waitForChange, but dispatch happens after that await. Admission cutoff must be checked at dispatch time as well, across normal scheduler, nervous respawn, rescan and dependency-ready paths.

## Connected implementation DAG

D1 backend/registry: exact fresh daemon observation + durable approved execution remaining-window reader, identity/attempt/generation bound. Missing/contradictory evidence distinct from transient unavailable. Reads confer no spending/termination authority.
D2 collector: close all dispatch paths at deadline; keep existing observation/IPC/settlement tick for already-admitted attempts only. Use original execution window; no reset on restart. Return structured disposition for unrun, held, live/unknown and collected task sets, without TaskResult fabrication.
D3 controller: while live/unknown ownership remains, do not enter EVALUATE or reuse coordinator-retirement PAUSED exit. Persist truthful phase/disposition and retain observer lease. Retire only with proven containment or explicit validated observer transfer. Exact terminal authority guard unchanged.
D4 restore/resume: rehydrate/adopt exact attempt before EXECUTE; preserve settled siblings and original deadline. No duplicate dispatch for adopted attempts; descendants need normal admission and current dependency settlement. Reuse same ingest evaluator, IPC and checkpoint path; do not duplicate a simplified resume loop.
D5 verification: real registry/collector/controller deadline test including watcher wake past cutoff and IPC question; process restart with original budget, A live/B settled/C unrun, actual Docker capture/release/acceptance, resume then C. Present/unknown ownership cannot silently disappear; contradiction remains fatal.

No production code or runtime was changed in this round. Additional bounded design clarification is required for D1/D3 retirement semantics before coding; see FABLE-OWNERSHIP-CLARIFICATION.md. This is not a new owner approval request.
