# Deckent — Autonomous Dogfood→Verify Loop · Session Handoff Prompt

> **Paste this whole file as the opening prompt of a fresh Claude Code session.** It
> hands off the working loop exactly as the prior session ran it. Repo: `/home/alperen/deckent-dev`
> (`VerhexIO/deckent-develop`, branch `main`). Speak **Turkish** with Alperen. **dist is
> current** (rebuilt after Sprint 260) — CLI dogfood works immediately; only run
> `/mcp restart` if you use the MCP tools (Alperen runs builds + restarts; signal
> "🔨 BUILD GEREKLİ" when source changed and a sprint/MCP needs the new dist).

---

## 0. THE GOAL (anchor every decision here)
Deckent = **agentic-OS + agentic-run ecosystem**: install it, run it, ready+orchestrated,
integrates everywhere, takes/gives data, understands the structure, learns, uses the models
correctly. **One engine, three faces** (Trinity: AI Assistant / AI System Worker / Developer
Platform) × three audiences (end-user / developer / enterprise) — all MIT, no edition-split,
no feature-gate. **Million-user, enterprise-grade, god-level — NEVER MVP.** "Everyone
everywhere": works for zero/in-dev/finished/daily/ERP/enterprise scenarios.

## 1. NON-NEGOTIABLE QUALITY BAR (CLAUDE.md, applies to YOU when hand-coding)
- **i18n-FIRST:** NEVER hardcode a user-facing string. All user text via `getMessage(key, lang)`
  (`src/cli/helpers/messages.ts`, en/tr). Mechanism modules stay string-free; labels injected
  by caller, English default. Hardcoded TR/EN = unacceptable tech debt.
- **No tech debt by default.** No MVP/placeholder/shortcut. If you must leave something, mark
  it explicitly + say why — never silent debt.
- **ADR-compliance:** ADRs live in `.brain/memory.db` (query via MemoryStore, not .md). They
  are mandatory constraints. Key: ADR-008 (orchestra is the central importer; cli/mcp import
  FROM orchestra/core, not vice-versa), ADR-010 (one runtime dep — hand-roll, no new packages),
  ADR-037 (RBAC advisory V1 → V2 in progress), ADR-053/070/019 (TaskKind/eval-integrity/
  language-agnostic-verify), ADR-066/077 (provider independence). A worker output violating an
  accepted ADR → NO_GO + amendment proposal.
- **Karpathy 4-discipline** (`.claude/rules/karpathy-discipline.md`): think-before-code,
  simplicity-first/YAGNI, surgical/minimum-diff/stay-in-scope, goal-driven/honest-assessment.
- **Proof-of-function:** user-surface (cli/dashboard/api) tasks need a real-binary run-proof
  (`Smoke:`), not just a mock test.

## 2. THE OPERATING MODEL (how the prior session worked — replicate it)
- **deckent runs CODE tasks; YOU (Claude Code) = verify / fix / manual-extend.** Don't
  hand-code features that deckent can dogfood; hand-code only the live spawn/eval/routing path
  (self-modifying risk) and subtle corrections. At each sprint end, YOU verify (disk + tsc +
  TARGETED tests + diff review) and fix/extend if needed.
- **BIG sprints, not 1-2 tasks.** Plan 16-20+ task enterprise batches (1-2-task sprints waste
  the sprint overhead). Pull a coherent THEME from MASTER-PLAN (e.g. "enterprise foundation",
  "autonomous completion", "capability broker depth").
- **claude-weighted fleet.** Code tasks → predominantly claude (opus for architecturally hard,
  sonnet for the rest). codex = light/secondary; gemini = secondary (login works but
  project-familiarity low + can 429 — fine for docs, the 257 fast-fail prevents hangs).
- **All new behavior OPT-IN / default-off** (config flags) → backward-safe, never break
  existing users. (enforce_rbac, risk_gate_enabled, mcp_client_enabled, pre_sprint_tests all
  default false; tenantId default 'local'.)
- **Each code-task scope INCLUDES its matching `tests/` dir** (so a worker's test-add stays
  in-scope; otherwise honest-gate BOUNDARY_VIOLATION → false NO_GO → FIX cycle).
- **Worker self-verify = TARGETED tests** (the touched module's test file), NOT the full suite
  (it has pre-existing failures). The prompt-god-template already instructs this (Sprint 257).

## 3. THE LOOP (run this, iterate)
```
1. Pick a coherent MASTER-PLAN theme → write a 16-20 task DIRECTIVES.md
   (per-task: Provider/Model/Backend/ModelEffort/Agent/Skills/Files/Scope[+tests/]/Description/Kanıt).
2. cp .brain/memory.db .brain/memory.db.backup-$(date +%Y%m%d-%H%M%S)   # backup before sprint
3. git add DIRECTIVES.md && git commit  (commit messages end with the Co-Authored-By trailer)
4. node dist/cli/entry.js plan --structured --no-confirm   # honors per-task Provider/Model overrides
5. node dist/cli/entry.js start --auto-approve > /tmp/dogfood-NNN.log 2>&1 &   # SPEED-fix → instant start
   echo $! > /tmp/dogfood-NNN-launch.pid        # launch-pid to /tmp, NOT .tasks (PID-1 lesson)
6. Arm a background watcher (run_in_background) that waits for finalize
   (start-process dead AND .deckent/sprint-state.json gone) → it notifies you.
7. On notify: BATCH-VERIFY — npx tsc --noEmit + npx vitest run <touched module test files>
   + git diff review of the risky tasks + read .result assessments
   (.brain/archive/sprint-NNN-tasks/*.result). Catch plausible-but-wrong fixes (e.g. a worker
   once added a no-op env var assuming a CLI flag that didn't exist — YOU caught it).
8. If a sprint stalls in FIX or a worker hangs: Alperen-approved force-finalize:
   `kill --all --force` + `finalize --sprint sprint-NNN --force`. Verify sprint-state cleared
   + pids clean afterward (feedback_finalize_force_orphan_state).
9. npm run build (rebuild so dist has the changes) → git add src/ tests/ docs/ .deckent/{skills,agents,workspace} .brain/exports/ → commit + push.
10. Update MASTER-PLAN (mark done) + memory. Pick the next theme. Repeat.
```
- **Sprint kill/cleanup/`rm .tasks/*` need Alperen approval** (he grants per-request). `.brain/memory.db` is NEVER deleted.
- **Branch-awareness:** shared worktree — run `git branch -vv` before any git surgery; a concurrent agent may exist (feedback_shared_worktree_branch_hazard).

## 4. WHAT'S ALREADY DONE (do NOT redo — all committed+pushed to main)
- **WM-7** (eval-layer + routing): type×stack-aware GO/NO-GO + coverage gate + LANGUAGE_MISMATCH_PENALTY + parametric code-expert (E1/E2/E4). `work-model.ts` TechStackKind, `criteria-deriver.ts`, `coverage-adapters.ts`.
- **WM-1** (canonical ExecutionRequest): 3-path unification (run/mcp/autonomous via `buildExecutionRequest`→`resolveToTask`) + **universal contract** (actor/tenantId/correlationId/causationId/capabilityTarget/budget/modelEffort + `resolveRiskClass`). **WM-1b** routing wired into all 3 paths.
- **SPEED-1:** pre-sprint full-vitest OFF by default (`pre_sprint_tests` flag) → sprints start instantly.
- **Sprint 260 (16-task enterprise):** ENT-1 RBAC, ENT-2 tenant, ENT-3 audit, WM-6/F10 risk-gate, budget→cost-gate, F8-001 capability-broker, AUT-1/4/6/8, WM-7 E3 + AGENT_TEMPLATES+5, BOUNDARY-TEST-PATTERN, test-staleness-cleanup, F9-001 MCP-broker-wire, enterprise doc. (1094 targeted tests green.)
- Earlier: MF-2, F1-CB ($0 subscription billing), F1-RE (reasoning-effort), PSL-1 (provider-aware spawn).

## 5. NEXT BATCHES (pick one as the next BIG sprint theme)
- **TECH_DEBT follow-up (from 260):** deepen WM-6 risk-gate (260-004), deepen AGENT_TEMPLATES 5-lang (260-012), complete the enterprise-foundation doc (260-016 gemini-partial).
- **Enterprise depth:** ENT-4 (secret vault), ENT-5 (SSO/OIDC + SIEM + compliance report), F8-002/003 (capability registry + least-privilege per agent), F10-001 (unify RBAC+activation+condition under one policy engine), ENT-3 deepen (immutable audit + causal lineage).
- **Autonomous completion:** AUT-3 (scheduled-flow→sprint bridge), AUT-5 (recurring backlog executable), AUT-7 (concurrent ExecutionPool), AUT-9/10 (work-generation engine, autonomous dashboard).
- **Contract-consumer deepening:** wire `mode` (interactive/batch) into chat; `capabilityTarget` into a real connector (mail/ERP); per-tenant isolation hardening (ENT-2 → real RLS).
- **Surfaces:** F7 dashboard control-plane, CHAT-A/CHAT-IDE, F9-002/003 (MCP discovery + trust gate).
- Full backlog + detail: `docs/MASTER-PLAN.md` (the development SSOT). Vision: `docs/vision/`.

## 6. KNOWN PRE-EXISTING TEST FAILURES (not yours; don't let them false-NO_GO)
Full `vitest run` has ~60 pre-existing failures (env/staleness): some gpt-5.5 apiId expectations
(260-014 fixed model-types/model-selector — more may remain), provider-bootstrap/ollama
(live-env), doctor runProviderDiagnosticsWithOllama (live-ollama), commands.test.ts `init`
(10s readline-mock timeouts), error-registry-lint drift. **Always run TARGETED tests, not the
full suite, for verification.** Greening these is a valid hygiene batch.

## 7. KEY MEMORY (recall these via the memory system)
`sprint_254_followup_fixes` (this session's full record: WM-7/WM-1/SPEED-1 + the 6-sprint loop +
all findings), `feedback_shared_worktree_branch_hazard`, `feedback_scale_up_autonomous` (big
sprints), `feedback_proof_of_function_dod`, `project_deckent_runtime_ecosystem` (positioning),
`project_merged_product_flow_analysis`. Specs: `docs/superpowers/specs/2026-06-09-*`.

**Start by:** reading MASTER-PLAN + recalling the memory above, then plan the first big batch
(suggest: TECH_DEBT-follow-up + Enterprise-depth combined, ~16-20 tasks, claude-weighted) and
run the loop. Verify honestly. Commit+push each sprint. Keep the ledger (MASTER-PLAN + memory) current.
