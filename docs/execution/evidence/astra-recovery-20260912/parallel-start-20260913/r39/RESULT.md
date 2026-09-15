# R39 — Typed transient IPC read deadline (PARTIAL / HOLD)

UTC 2026-09-15T08:23:59.429718+00:00. Existing admitted ADR-D-007 recovery, MASTER 3178 / parent 120.

## Measured path and repair

resolveExactAttemptIpcAuthority previously cached every non-ExactAttemptIpcHold read error in exactPendingCaptureFailures. monitorExactDockerCustody consumes that first failure after provider exit and publishes an immutable capture diagnostic, so a temporary first read failure can poison final capture.

The producer now recognizes ONLY TaskAttemptCustodyHold(DISPATCH_DISCOVERY_DEADLINE_EXCEEDED) as unavailable{transient:true,cause:CUSTODY_READ_DEADLINE}. It returns before the terminal capture failure cache. No generic PRIVATE_IPC_AUTHORITY_UNAVAILABLE retry allowlist, no inference that integrity errors are temporary.

The IPC boundary validates exact data keys, task identity, transient flag and closed cause. Poll report records unavailable and pending, with no fatal hold. Existing collector polling therefore retries naturally; no new retry engine or counter. No worker status is changed by this unavailable observation.

## Evidence

- Real TaskAttemptCustodyStore fixture; injected one cursor-read deadline: unavailable/pending, no holds, no cached terminal failure; next backend read returns question-ready.
- Negative ARTIFACT_CHANGED remains HOLD and remains in failure cache.
- Final backend IPC port suite 4/4 PASS exit0; IPC registry/bridge 66/66 PASS exit0. Earlier collector+port run 19/19 PASS exit0, overlaps the port subset; do not add totals.
- Final tsc --noEmit exit0. Logs and exact source hashes attached.
- This proves a typed Store deadline path with injected failure, not real Docker stall or live provider proof. Other native/storage errors may still be collapsed into generic unavailable and are NOT claimed fixed.

## Still open before A gate

1. Budget expiry plus authoritative fresh heartbeat: current global wait timeout was not changed. No claim that an alive pending worker continues beyond it. Need existing heartbeat/attempt liveness authority wired to expiry, and genuine absent-only park/registration; missing heartbeat alone cannot prove absence.
2. E091 contradiction scan remains project-wide. Current-run scope and typed historical-unsettleable exclusion must be tied to caller's proven historical ownership, preserving possibly-live foreign work.
3. Queryless HOLD operator recovery remains explicit unresolved; no invented query/receipt or guaranteed recovery path.
4. Cold Store / real Docker A->C and independent B, restart, operator repair and final settlement still unproven. Old immutable capture diagnostics are not rewritten.

No build/MCP reconnect/new sprint/runtime mutation/commit/push. Source remains PARTIAL/HOLD.
