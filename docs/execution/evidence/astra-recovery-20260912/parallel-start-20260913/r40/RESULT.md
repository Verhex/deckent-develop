# R40 — Run-scoped historical contradiction filtering

UTC: 2026-09-15T10:09:00.321332+00:00. MASTER3178 / parent120, existing owner-authorized ADR-D-007 recovery. Source LOCAL_VERIFIED; outer capability PARTIAL/HOLD.

## Implemented

ExactLifecycleReconcileOptionsV1 now accepts currentTaskIds. The registry snapshots membership for the pass. A contradiction can be excluded only when the task is outside that set AND the caller's existing isHistoricalForeignTask predicate proves earlier terminal ownership. Missing/throwing/false provenance or current membership keeps E091.

Excluded history is retained in entries with its contradiction; historical-unsettleable projection records RUN_EXCLUDED_RETAINED. This does not delete Store records or settle the task. Legacy retiredAt field is the observation timestamp for that projection, not a new physical retirement claim.

All five existing controller historical-provenance call sites now pass exact current task IDs. pauseSprintExact binds membership to its supplied sprint. resumeSprintExact supports the same optional provenance and binds membership; without proven history it remains strict. Existing production historical predicate consults canonical owning-run terminal disposition, not task-name inference alone.

Lifecycle and spawner checkpoint snapshots filter current task IDs before raising a foreign HOLD. Controller snapshots already did this. Containment physical inventory check remains unchanged: unknown/present is fatal even for excluded history. The backend project-wide recovery scan itself was NOT removed or optimized.

## Verification

Three suites: scheduler spawn executor, controller terminal fan-in, exact pause/resume custody — 90/90 PASS exit0. Final tsc --noEmit exit0. Logs and source SHA256s attached.

New fixture tests prove prior-terminal exclusion, retained contradiction visibility, unscoped strict behavior, false provenance rejection, current-task rejection, and unknown-container containment rejection. This is injected recovery evidence, not a real cold Store/Docker restart claim.

## Next boundary / limits

No build, MCP reconnect, new sprint, runtime mutation, commit or push this turn. Queryless operator recovery remains unresolved. Heartbeat-aware global timeout behavior still needs inspection before live proof. R39 read-deadline retry does not prove growing stream/cursor artifacts safe: include monotonic-cursor versus immutable receipt mutation in real proof.

Next: check timeout exit does not synthesize accepted results or retire a live exact worker; build only after no active sprint is confirmed; then documented MCP reconnect and real Docker A->C/B with restart, recovery, settlement. A gate is NOT complete.
