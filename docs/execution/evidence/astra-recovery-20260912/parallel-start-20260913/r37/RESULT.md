# R37 — Collector held-set and lifecycle wiring (PARTIAL / HOLD)

UTC: 2026-09-15T07:55:51.434941+00:00. Existing owner-admitted recovery, MASTER 3178 / parent 120.

## Implemented

- Shared isResumableTaskAuthorityHold: authority-hold without affirmative AUTHORITY_CONTRADICTION evidence remains unresolved/resumable. No reason-string allowlist.
- Collector keeps a separate held set, marks held tasks PAUSED and never fabricates TaskResult. It re-reads authority on subsequent collection, excludes held entries from IPC, handles a new HOLD racing an IPC poll, and exits on collected+held or only pending descendants of held tasks. Held PAUSED tasks count in repair yielding.
- A/B/C real-Store-backed accepted-result fixture: A held, B crosses normal acceptance/settlement consumer, C pending/unrun; no A/C result. This is NOT Docker or restart proof.
- The test found legacy processQueue and reducer completed-worker cleanup could kill already collected exact B. Both now leave retirement to exact backend settlement; legacy paths preserved.
- TaskEvaluation.EFFECT_HOLD maps to normative HOLD. Controller seeds EFFECT_HOLD/PAUSED from registry, exempts resumable held work from terminal-authority requirement, snapshots skip non-contradictory holds. Spawner/lifecycle snapshot consumers use same predicate; resume retains existing PAUSED task instead of requeueing it.
- Outer barrier blocks any EFFECT_HOLD even with no staged foundation, preserves independent settled tasks, reports held IDs. It writes PAUSED state and checkpoint before stopping coordinator resources.

## Verification and honest scope

- Seven-file package before final A/B/C test: 203/203 PASS exit 0 (checks-before-abc.log).
- Added A/B/C test initially failed on a duplicate exact-worker kill; negative result retained (abc-first-failure.log).
- After kill correction, settlement-authority + scheduler-spawn-executor: 51/51 PASS exit 0 (final-collector-tests.log), including A/B/C and fatal contradiction sibling cases.
- Final npx tsc --noEmit exit 0 (tsc.log). Do not add overlapping subset counts.
- IPC race test now expects unresolved HOLD parking/no result; fatal sibling fixture carries explicit contradiction classification. Foreign/forged accepted terminal rejection tests remain passing.
- Runtime observation: docker ps only local-llm; no task JSON/HB found under .tasks. No build/new sprint/recovery mutation/MCP reconnect/commit/push.

## Remaining blocker before build/live proof

E5 is NOT closed. scheduler-effects.ts reconcileExactLifecycle still rehydrates report holds and throws E091 for heldForThisRun > 0. Cold recovery currently yields a hold without durable query rehydration, so changing snapshot guards alone cannot make restart/resume work. This gate was intentionally not bypassed: classification, exact query and containment provenance must survive cold rehydration. Existing pause/resume tests only exercise delegation, not full held restart.

Next exact work: cold held-entry rehydration plus lifecycle reconcile disposition (unknown evidence parks, contradiction fatal, containment cannot be invented), prove durable PAUSED checkpoint round-trip and later authoritative operator repair/acceptance. Then build, coordinated MCP reconnect and real Docker A->C/B integration. E1-E3 cache/current-progress, missing-outcome and replay-race real proof remain unclaimed. No product DONE or formal XVerify.
