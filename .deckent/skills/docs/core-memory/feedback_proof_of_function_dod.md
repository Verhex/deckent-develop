---
name: feedback_proof_of_function_dod
description: "Proof-of-Function DoD — user-surface tasks DONE only with real-binary run, deckent auto-classifies + auto-gates in-sprint"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

**Proof-of-Function DoD (✅ accepted 2026-06-01, Alperen).** A user-facing surface (serve / dashboard / chat / any CLI command a human runs) is **DONE only with a recorded real-binary run** (`node dist/cli/entry.js <cmd>` → captured real output: HTTP 200 + `__DECKENT_API_TOKEN__` present + `/api/*` 200 + real chat text). A mocked unit test alone = **GO_WITH_TECH_DEBT (wired, not user-verified)**, never DONE. Tier-0 internal/structural tasks (provider register, F5 callers, refactors) stay unit-test-sufficient — proof is structural & externally verifiable.

**Why:** mocked unit tests certify WIRING, not user-working UX. Sprint 214 "serve token-inject DONE" passed a mocked test but the REAL binary returned 401 — localhost serve never auto-mints an API token, served HTML lacks `__DECKENT_API_TOKEN__`, so `/api/status` 401 → dashboard loads but every data call fails → fully non-functional. Caught only by running the real bin (`http_root=200`, `has_API_TOKEN_placeholder=0`, `http_api_status=401`). This is the root of "we mark things DONE but the dashboard still doesn't work / feels like no progress."

**How to apply (deckent does it ITSELF, in-sprint — NOT manual cc/user):**
- **Auto-classify:** extend `detectTaskType()` in `src/orchestra/rubric-registry.ts:166` with `isUserSurfaceTask(task)` — inspects `scope.filesWrite` for `src/cli/commands/`, `src/dashboard/`, `src/api/`. Parallel flag, NOT a 4th TaskType (a CLI task is both code-development AND user-surface → code rubric + proof-of-function criterion). Worker does not self-declare.
- **Auto-gate:** Brain runs the `Smoke:` command host-side via existing `src/orchestra/post-sprint-smoke.ts` (`shouldTriggerPostSprintSmoke` — fires after primaries pass). Worker can't boot servers (container/subprocess can't bind+curl). Fail → auto-downgrade DONE→GO_WITH_TECH_DEBT + emit audit channel event (pattern: `DISK_VS_CLAIM_MISMATCH_CHANNEL`). Hook in `result-evaluator.ts:1130 evaluateWithRubric` → `scoreCriterion()`.
- **Routing:** same `isUserSurfaceTask` signal feeds routing-engine v2 domain bonus (`routing-engine.ts:101-128 getDomainMatchBonus`, `TASK_DOMAIN_TO_AGENT_ID`) → surface→frontend-designer/api-builder/ci-guardian, beats refactorer-collapse ([[feedback_agent_routing_imbalance]]).
- **DIRECTIVES:** Tier-1 tasks get a mandatory `Smoke:` line (real run cmd + expected real output) alongside `Kanıt:`/`Test:`.
- **Permanent guard:** `npm run test:e2e-surfaces` boots real server + asserts 200+token (like `test:ci-sim` for hermeticity).
- **Rule lives in** `.claude/rules/karpathy-discipline.md` (CUSTOM — Proof-of-Function DoD). **Implementation = Sprint 216.**

Extends [[feedback_wiring_pct_vs_user_working]] (the "wired ≠ user-working" lesson) and [[feedback_trust_brain_eval_not_worker]] (disk-verify → now run-verify). Related: [[project_task_type_taxonomy_vision]] (ADR-053), [[project_dashboard_control_plane]].
