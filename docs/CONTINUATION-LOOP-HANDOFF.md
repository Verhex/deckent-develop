# Deckent — Dogfood→Verify Loop · Session Handoff Prompt

> **Paste this whole file as the opening prompt of a fresh Claude Code session.** It hands off
> the working loop losslessly. Repo: `/home/alperen/deckent-dev` (`VerhexIO/deckent-develop`,
> branch `main`, currently at `731d0243`). Speak **Turkish** with Alperen. **Build is Alperen's
> action** — when you change `src/`, signal "🔨 BUILD GEREKLİ" + `/mcp restart`; do NOT run build
> yourself, and do NOT run any deckent command after editing `.deckent/config.json` until Alperen
> rebuilds (old dist rejects unknown config). Last session ended 2026-06-10 after sprints 261-263
> + the Fable-5 model integration; the **immediate resume point is §5 (the wiring work)**.

---

## 0. THE GOAL (anchor every decision here)
Deckent = **agentic-OS + agentic-run ecosystem**: install it, run it, ready+orchestrated,
integrates everywhere, takes/gives data, understands structure, learns, uses the models
correctly. **One engine, three faces** (Trinity: AI Assistant / AI System Worker / Developer
Platform) × three audiences (end-user / developer / enterprise) — all MIT, no edition-split, no
gate. **Million-user, enterprise-grade, god-level — NEVER MVP.** Works for zero/in-dev/finished/
daily/ERP/enterprise scenarios.

## 1. NON-NEGOTIABLE QUALITY BAR (CLAUDE.md)
- **i18n-FIRST:** never hardcode a user-facing string — `getMessage(key, lang)` (en/tr). Mechanism modules string-free.
- **No tech debt by default.** No MVP/placeholder. Mark + explain anything left; never silent.
- **SSOT discipline (hard-won — WM-2 + advisor lesson):** never re-define logic that already exists. Before creating a "helper"/"resolver"/"map", grep for the existing source. role→capability lives in `authority-matrix.ts`/`rbac.ts`; budget-min in `cost-gate.ts`; strict-tenant in `memory-store.ts`; model catalog is `model-registry.ts`-derived (ALL_MODELS/MODEL_API_IDS/PROVIDER_MODEL_MAP all derive from it). A "consumable seam with no caller" that greps as DONE but does nothing is the `feedback_directive_kanit_letter_vs_goal` trap — **don't manufacture dormant code faster than you consume it.**
- **ADRs** (`.brain/memory.db`, query via MemoryStore): ADR-008 (core/ doesn't import orchestra/nervous — but orchestra→nervous IS legal), ADR-010 (one runtime dep — hand-roll w/ node:crypto etc.), ADR-037 (RBAC advisory V1→V2), ADR-053/070/019, ADR-066/077.
- **Karpathy 4-discipline** (`.claude/rules/karpathy-discipline.md`): think→simplicity→surgical→goal-driven.
- **Proof-of-function:** user-surface (cli/dashboard/api) needs a real-binary run-proof, not a mock.

## 2. THE OPERATING MODEL (replicate it)
- **deckent runs CODE tasks (dogfood); YOU (Claude Code) = verify / fix / hand-code the self-modifying live-path.** Don't dogfood the spawn/eval/autonomous-loop edits (self-modifying risk) — those are yours. At each sprint end YOU verify: disk + `tsc` + **TARGETED** tests (not the full suite) + `git diff` review of risky tasks, catching plausible-but-wrong fixes.
- **BIG sprints (13-16+ tasks), not 1-2.** Pull a coherent THEME. One framing line keeps evaluation disciplined.
- **Fleet is FABLE-weighted right now** (claude-fable-5 is free on subscription until 2026-06-22 — see §6). Use `Model: fable` on code tasks. codex = light/secondary; gemini = doc-only secondary. **Note: codex + gemini have a recurring "exit-without-result" bug** — they produce a real deliverable on disk but don't write `.result` → false NO_GO. Disk-verify before trusting a NO_GO. **fable does NOT have this bug** (writes .result correctly).
- **All new behavior OPT-IN / default-off** (enforce_rbac, risk_gate_enabled, strict_tenant_isolation, autonomous.enabled, nervous_system.enabled all default false). Backward-safe.
- **Each code-task scope INCLUDES its matching `tests/` dir** (so a worker's test-add stays in-scope; else honest-gate BOUNDARY_VIOLATION → false NO_GO).
- **One writer per file** in DIRECTIVES (grep `- Files:` for dup paths before launch — pipeline=false + the structured-planner drops `Dependencies:` so all tasks spawn in one wave; two tasks on one file = lock contention).
- **Verify NUMERICALLY when the task is quantitative** — recompute the numbers from ground truth, don't trust the worker's claim (last session: fable's 3 analysis docs verified ~96.5% literal / ~100% at-snapshot accurate).

## 3. THE LOOP
```
1. Pick a coherent theme → write a 13-16 task DIRECTIVES.md (per-task Provider/Model/Backend/
   ModelEffort/Agent/Skills/Files/Scope[+tests/]/Description/Kanıt). Use Model: fable for code tasks.
2. cp .brain/memory.db .brain/memory.db.backup-$(date +%Y%m%d-%H%M%S)
3. grep '^- Files:' DIRECTIVES.md | ... | sort | uniq -d   → must be empty (no dup file owners)
4. git add DIRECTIVES.md && git commit
5. node dist/cli/entry.js plan --structured --no-confirm
6. node dist/cli/entry.js start --auto-approve > /tmp/dogfood-NNN.log 2>&1   (run_in_background:true → harness notifies on finalize)
7. On finalize: BATCH-VERIFY — npx tsc --noEmit + npx vitest run <touched module test files>
   + git diff review of risky/self-modifying tasks + read .result (.brain/archive/sprint-NNN-tasks/*.result).
8. Stuck/hung → Alperen-approved: kill --all --force + finalize --sprint sprint-NNN --force.
9. git add src tests docs CLAUDE.md AGENTS.md .deckent/{agents,skills,workspace} .brain/exports → commit + push. Signal 🔨 BUILD GEREKLİ if src changed.
10. Update MASTER-PLAN (mark done) + memory. Pick next theme.
```
- Sprint kill/cleanup/`rm .tasks/*` need Alperen approval. `.brain/memory.db` is NEVER deleted.
- Shared worktree: `git branch -vv` before git surgery (a concurrent agent may exist).
- advisor() before substantive work + before declaring done — it caught the file-collision + the SSOT-duplication twice last session.

## 4. WHAT'S DONE (committed + pushed to main; do NOT redo)
- **Sprint 261** (`2381ecc4`) Contract-Enforced, 16 tasks: policy-engine, authorizeExecution RBAC bridge, audit hash-chain+verify, strict_tenant_isolation, multi-backend capability selection, http/env/shell handlers, recurring-backlog re-enqueue (fn), bounded ExecutionPool, withNervousObserver, work-generator, budget.maxTokens, audit-query. CC hand-fix: renamed duplicate `buildEngineRuntime`→`withNervousObserver`.
- **Sprint 262** (`2c9682e9`) Enterprise Integrations, 13 tasks: OIDC/JWT verify (alg:none-safe), SSO session, SIEM forwarder, compliance report, audit retention, ERP read-only connector, db/mail capability handlers, **AUT-4 full 5-field cron into core (live latent-bug fixed)**, actor data-plumbing (Task.actor), capability-audit bridge.
- **Sprint 263** (`731d0243`) fable-authored analysis, 3 docs in `docs/analysis/`: architecture-inventory, capability-maturity, quality-posture. CC-verified numerically (see §5 for the key finding).
- **Fable-5 integration** (`4f0cc63f`): `claude-fable-5` in model-registry (id `fable`, premium_plus, $10/$50, 1M ctx), 6 test files' counts updated (13→14 models), `.deckent/config.json` Brain+worker = fable. **Live-proven** (a real `deckent run --model fable` worker created its file, .result model=fable). Alperen built+restarted.
- **scheduled-flow dedup** (`12129505`): `orchestra/autonomous/scheduled-flow.ts` now re-exports core's full cron (T11 closed, SSOT). **Committed but NOT yet built into dist** (orphaned file, non-critical — fold into next build).

## 5. ⭐ IMMEDIATE RESUME POINT — the wiring work (CC hand-code)
**Sprint 263's `docs/analysis/deckent-capability-maturity.md` (fable, CC-verified 100% accurate) is the map.** It quantified the core finding: **deckent's gap profile is WIRING, NOT ABSENCE** — 19 enterprise/autonomous capabilities = 7 BUILT / 12 PARTIAL / 0 MISSING, with **13 dormant seams (2,441 LoC, zero production callers) + 1 function-level seam**. The capability code is built but unwired. Your job (self-modifying live-path = CC hand-code, NOT dogfood) is to wire them, **ranked by that doc's top-5**, all behind existing default-off gates, unit-tested:

1. **`reenqueueRecurring` → autonomous runtime loop** (`backlog.ts:146` → `runtime-loop.ts` cycle). Smallest diff, largest unlock: today a `recurring` backlog entry runs once → `done` → never fires again. 0 callers currently. **Start here.**
2. **`makeWorkGeneratorSource` → trigger composition** (`work-generator-source.ts:20` → source array in `runtime-loop.ts:211`). Self-generated work = the defining autonomy feature; both halves finished, adapter already imports execute-dispatcher. 1 import + 1 array element. Closes 2 seams.
3. **Capability-broker cluster → dispatch path** (`capability-broker.ts` + 3 handler/bridge files, 857 LoC → `execute-dispatcher`/`work-model.ts` CapabilityTarget). Prerequisite for waking ERP (E12).
4. **`evaluatePolicy` → flow/self-dispatch enforcement** (`policy-engine.ts:121`) — converts RBAC from advisory to enforced for machine-initiated dispatch.
5. **SIEM forwarder + compliance report → audit read-side** (one-call integrations on the live audit log).

**#1 and #2 are the autonomous-engine completion** — they directly prep the autonomous-engine loop test Alperen deferred to "today" (2026-06-10). Note these are inert in dogfood (autonomous.enabled=false) but real for users who enable autonomous; verify them with UNIT TESTS that simulate the enabled path (not a dogfood run). **Caveat learned last session:** RBAC-into-spawn (#4-ish for sprint dispatch) is premature — `Task` carries `actor` but not `requirements`/capabilities, so the consult has nothing to check; build the capability-on-task plumbing first OR keep RBAC wiring to the autonomous/policy path where capabilities exist.

After the wiring: resume the big-sprint dogfood loop (§3) on remaining MASTER-PLAN themes (ENT-5 live SSO wire, real SIEM transports, concrete ERP connectors, F9 MCP-client, dashboard control-plane).

## 6. FABLE-5 — ⏰ TIME-BOXED (revert 2026-06-22)
`claude-fable-5` is free on Pro/Max/Team **only through 2026-06-22**, then paid ($10/$50). Memory: `project_fable5_subscription_window`. **On/after June 22: revert** `.deckent/config.json` modes.performance brain_model+default_model `fable`→`opus` (registry entry can stay; just stop defaulting to it + stop using `Model: fable`). Build-ordering: editing config to an unknown model makes the OLD dist reject ALL deckent calls until rebuild — edit config LAST, signal build, don't run deckent until rebuilt.

## 7. KNOWN PRE-EXISTING TEST FAILURES (Doc 3 categorized — don't let them false-NO_GO)
Full `vitest run` ≈ **60 failures (~0.28% of 21,131 descriptors)**. Clusters: (1) **provider-bootstrap/ollama** live-env — *fails on this host because real ollama runs on :11434* (mockNoneAvailable only stubs spawnSync, not the ollama HTTP probe); passes in clean CI/docker. (2) doctor `runProviderDiagnosticsWithOllama` live-env. (3) `commands.test.ts` init — readline-mock 10s-timeout flaky (22 tests, verified still red 2026-06-10). ~~(4) gpt-5.5 apiIds stale~~ **OUTDATED CLAIM — verified green 2026-06-10:** `gpt-5.5` IS the live apiId (`model-registry.ts:126`); all 6 files pass (191/191). ~~(5) error-registry-lint drift~~ **OUTDATED CLAIM — verified 31/31 green 2026-06-10.** **Always run TARGETED tests, not the full suite.** Greening deterministic-stale ones is valid hygiene; never fake live-env ones.

## 8. KEY MEMORY + ARTIFACTS (recall these)
`project_fable5_subscription_window` (⏰ revert June 22), `sprint_261_contract_enforced`, `sprint_254_followup_fixes`, `feedback_scale_up_autonomous`, `feedback_proof_of_function_dod`, `feedback_directive_kanit_letter_vs_goal`, `feedback_trust_brain_eval_not_worker`, `project_autonomous_engine_direction`, `project_merged_product_flow_analysis`. **Analysis docs (the wiring map):** `docs/analysis/deckent-capability-maturity.md` (top-5 wiring gaps + 13 dormant seams), `deckent-architecture-inventory.md`, `deckent-quality-posture.md`. Ledger: `docs/MASTER-PLAN.md`.

**Start by:** read `docs/analysis/deckent-capability-maturity.md` §5 (top-5 wiring gaps) + recall the memory above, then BEGIN THE WIRING at §5 item 1 (`reenqueueRecurring` → runtime-loop) — CC hand-code, unit-tested, behind autonomous gate. This preps the autonomous-engine test. Verify honestly, commit+push, signal 🔨 BUILD when src changes. Keep the ledger current.
