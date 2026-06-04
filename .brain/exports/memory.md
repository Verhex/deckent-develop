# Sprint Learnings (auto-generated)

## Sprint sprint-228 Learnings
- Sprint sprint-228 Learnings: ## Sprint sprint-228 Learnings

## Gains
- 228-001 — [P0] autonomous CLI i18n retrofit (hardcode → getMessage) — Worker exited without writing result (exitCode=0)
- 228-002 — features-manifest entry (sync-manifest.mjs → regenerate) — Added autonomous-runtime to FEATURE_DEFINITIONS in scripts/sync-manifest.mjs with id='autonomous-...
- 228-003 — Autonomous usage doc (TR/EN, güvenlik modeli dahil) — Created docs/guide/autonomous.md covering: all 3 subcommands (start/status/stop) with exact optio...
- 228-004 — Autonomous e2e smoke harness (gerçek-binary start→status→stop) — Created scripts/autonomous-smoke.mjs — real binary e2e smoke harness for `deckent autonomous star...

## Sprint sprint-227 Learnings
- Sprint sprint-227 Learnings: ## Sprint sprint-227 Learnings

## Gains
- 227-001 — Rubric total diagnostic fix (coverage:null → renormalize) — Sprint 227 227-001 — Rubric total diagnostic fix.
- 227-002 — [P0] Export-wipe guard (dolu .md'yi boşla EZME) — Export-wipe guard implemented.
- 227-003 — [P0] Decay safety (decay_after_sprints'e uy, collapse ETME) — 227-003 Decay safety implemented.
- 227-004 — Brain-integrity regression e2e (3 bug birlikte) — Sprint 227 227-004 — Brain-integrity regression e2e.

## Sprint sprint-226 Learnings
- Sprint sprint-226 Learnings: ## Sprint sprint-226 Learnings

## Gains
- 226-001 — Authority adapter (checkAuthority → AuthorityChecker) — Created authority-adapter.ts wrapping checkAuthority from authority-enforcer.ts.
- 226-002 — Audit adapter (writeEvent → AuditSink) — makeAuditSink(projectRoot, sprintId='autonomous') wraps writeEvent from event-stream.ts.
- 226-003 — Approval gate adapter (nervous Executor → ApprovalGate, OTO-APPROVE YOK) — ApprovalGate adapter that wraps the nervous approval queue (Executor.resolveApproval pattern + 22...
- 226-004 — Action executor adapter (ActionHandler registry → ActionExecutor) — Implemented makeActionExecutor(handlers: Map<string, ActionHandler>): ActionExecutor.
- 226-005 — Trigger source adapter (scheduled-flow + self-dispatch → TriggerSource) — Created src/orchestra/autonomous/trigger-adapter.ts (97 LoC) — makeTriggerSource(deps) factory th...
- 226-006 — [P0] Sürekli loop + composition root (DORMANT'I ÖLDÜRÜR) — Composition root + tick loop: src/orchestra/autonomous/runtime-loop.ts (165 LoC).
- 226-007 — [P0] `deckent autonomous` CLI (start/stop/status, Tier-1 user-surface) — Sprint 226 Task 226-007 — `deckent autonomous` CLI (start/stop/status) Tier-1 user-surface delive...
