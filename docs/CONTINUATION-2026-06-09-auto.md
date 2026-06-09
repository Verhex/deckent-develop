# Deckent — Comprehensive Continuation Brief (auto-mode)

> **Hand-off date:** 2026-06-09 · **Branch:** `main` @ `fd354e94` (pushed to `origin/main`,
> repo `VerhexIO/deckent-develop`). Feed this whole file to a fresh agentic session /
> auto-mode. It is self-contained: read it, pick the top unblocked item, execute, commit,
> repeat. The full backlog lives in `docs/MASTER-PLAN.md` — this brief orients you + sets
> the order; MASTER-PLAN is the source of truth for item detail.

---

## 0. Operating rules (READ FIRST — these override default behavior)

1. **God-level / no-MVP / i18n-first.** No shortcuts, no placeholders, no hardcoded
   user-facing strings (`getMessage(key,lang)`). If you leave something incomplete, mark it
   explicitly as TECH DEBT in MASTER-PLAN — never leave silent debt. (CLAUDE.md Quality Bar.)
2. **Hybrid execution.** Per item, choose: **dogfood** (give to deckent via DIRECTIVES →
   `plan --structured --no-confirm` → `start --auto-approve`, background, poll-never-kill,
   disk-verify) for self-contained docs/contained code; **hand-code** for the live
   spawn/eval/routing path (self-modifying risk) and anything subtle. Doc tasks dogfood
   cleanly; code tasks risk NO_GO on the ~13 pre-existing test failures (see §3) — prefer
   hand-code for code until those are fixed.
3. **"Bir süre test yok" (velocity window, set 2026-06-09).** Do NOT author new test
   suites for now. Keep changes **additive / backward-compatible** so the EXISTING suite
   stays green; run the affected suites to confirm zero regression; keep `tsc --noEmit`
   clean. Mark every deferred test as TECH DEBT. (When the user lifts this, backfill the
   deferred WM-7 / mismatch-penalty / criteria-deriver / coverage-adapter suites first.)
4. **Commit discipline.** Commit + push each logical unit to `main`. End commit messages
   with the `Co-Authored-By: Claude Opus 4.8 (1M context)` trailer. **Branch-awareness:**
   this is a shared working tree — a concurrent agent created `feat/docs-json-ai-author`
   (commit `3efe172e`, a docs.json-AI-author design spec). Before any git surgery, run
   `git branch -vv` + `git status -sb`; if HEAD drifted off `main`, surface it, don't blindly
   cherry-pick near another agent's commits.
5. **Disk-verify is ground truth.** Trust Brain evaluation + disk over worker `.result`
   self-claims. A doc/non-TS task that wrote its artifact is DONE even if `coverage:null`
   (WM-7 already handles this — see §1).
6. **Sprint kill/cleanup/`rm .tasks/*` need Alperen's approval.** `.brain/memory.db` is
   NEVER deleted (all Brain knowledge). Build + `/mcp restart` are Alperen's to run; signal
   "🔨 BUILD GEREKLİ" rather than assuming a fresh dist.
7. **Turkish with Alperen.** Always converse in Turkish.

---

## 1. What just shipped (context — do NOT redo)

- **WM-7 eval-layer + routing dual (DONE, on main):** GO/NO-GO criteria + coverage gate are
  now type × stack aware. `work-model.ts` `TechStackKind`/`normalizeTechStack`/
  `COVERAGE_MEASURABLE_STACKS`; new `core/criteria-deriver.ts` (`deriveBaseCriteria`) +
  `core/coverage-adapters.ts` (per-stack test patterns + `inferStackFromFiles` +
  `isCoverageMeasurable`); `extractGoNogoCriteria(…,opts?)` additive; `coverageOptional`
  exempts non-JS/TS code (vitest-only coverage → `coverage:null` = measurement gap, not
  failure); `routing-engine` `LANGUAGE_MISMATCH_PENALTY` (-6) stops typescript-expert
  routing on a Go project. REPL-proven; 360 eval/criteria/planner/routing tests green.
- Earlier this batch (also on main): MF-2 lazy adapter re-bootstrap; F1-CB billing-follows-
  auth (subscription/ollama = $0); F1-RE claude-host `--effort` wire (live-confirmed
  low/medium/high/xhigh/max); README/IDENTITY badges refreshed (coverage **88.58%**, tests
  20,668+); vitest coverage now emits `json-summary`.

---

## 2. IMMEDIATE next work — WM-7 / stack-aware enrichment (the approved hybrid, finish it)

The CORE + most enrichments are now DONE (Sprint 254 auto-mode batch). Status:

- **E1 ✅ DONE** — parametric `code-expert`: `generateProjectConventionsSkill` injects
  stack-correct Commands (STACK_COMMANDS) + per-language Idioms (STACK_IDIOMS). Go skill →
  `go test ./...`+gofmt, TS → tsc/vitest+ESM-`.js`. REPL-proven.
- **E2 ✅ DONE (was already wired)** — `generateTempAgents(stack)` is stack-GATED (filters
  AGENT_TEMPLATES by `tpl.language`) + planner-called: Go→`temp-go-specialist`,
  TS+React→`temp-react-ts/react-specialist`, Py+FastAPI→`temp-python-api/python-specialist`;
  horizontal quality agents stay stack-agnostic (ADR-041), forceAgent bypasses. REPL-proven.
  ⬜ Follow-up: extend AGENT_TEMPLATES to C++/Java/C#/Kotlin/Swift (content add, not wiring).
- **E4 ✅ DONE** — criteria carry exact stack commands (detectFullStack→deriver); the 3
  planner test mocks gained `detectFullStack`. TS task → "`npx tsc` succeeds; `npx vitest run`
  passes".
- **E3 ⬜ minor** — IDENTITY.md `Language:` feed. `detectFullStack` is already functionally
  equivalent (live detection cached to `.deckent/project-stack.json`); only do this if a
  user wants IDENTITY to OVERRIDE detection.
- **E5 ⬜ minor** — prompt-god-template verify-command injection. `worker-verify.ts` already
  runs the right commands (ADR-019) + the prompt has multi-lang examples; pure polish.
- **E6 ⬜ governance** — Formal ADR-087 (amends ADR-041): "Stack-Aware Evaluation & Routing +
  Parametric Stack-Axis". DB-first insert via `MemoryStore` + export — do this in a
  memory-export cycle (don't hand-edit memory.db mid-run). Decision is already recorded in
  this brief + MASTER-PLAN WM-7 + the commit messages.

---

## 3. Pre-existing test failures (hygiene — fix when the test window reopens)

Found during WM-7 regression (NOT introduced by WM-7; ~13 failures across 7 files):
- `model-types` / `model-selector-provider` — expect `gpt-5` but registry now returns
  `gpt-5.5` apiId (F1 debt). Update the expectations to `gpt-5.5`. (Quick, real.)
- `provider-bootstrap` / `provider-ollama-bootstrap` — assert "no providers" / specific
  bootstrap shape but the dev machine has live ollama/codex/gemini → env-dependent. Add a
  hermetic guard (skip when real providers detected) per the Test-Hermeticity rule.
- `error-registry-lint` — orchestra allowlist drift (16 > 9). Re-baseline the allowlist or
  fix the violations (none are from WM-7).
- `task-builder` priority self-parse — expects the Sprint-136 DIRECTIVES distribution but
  DIRECTIVES.md is now a 2-task verify sprint. Make the test parse a fixture, not the live
  DIRECTIVES.md.

---

## 4. Then — the prioritized backlog (full detail in docs/MASTER-PLAN.md)

Pick in this order (each is an MASTER-PLAN ID; read its entry for spec + acceptance):

**P0 — Foundation (the "everyone everywhere, any task" base):**
- **WM-1** canonical `ExecutionRequest` contract unifying the 3 execution paths
  (`deckent run` / `start` / autonomous) across CLI+MCP. The keystone everything else builds
  on. **WM-3** `EnvironmentType` (work-domain × execution-context), **WM-4**
  `RequirementProfile` — now have a natural home next to the WM-7 `TechStackKind` axis.
- **project_autonomous_ollama_execution_gap** (memory) — `spawn.ts` autonomous `kind=task`
  forces docker, doesn't route ollama→host-adapter → zero-cost ollama autonomous execution
  impossible. Pre-req for the autonomous-dogfood vision. Hand-code (live spawn path).
- **npm publish v1.0.0-beta.1** readiness (Alperen runs `npm publish` manually).

**P1 — Autonomous engine (the stated next big direction):**
- **AUT-1** nervous observer inside `autonomous start`; **AUT-3** scheduled-flow→sprint
  bridge (authority double-block); **AUT-5** recurring backlog executable; **AUT-7**
  concurrent ExecutionPool; **AUT-8** `deckent_autonomous*` MCP parity; **AUT-10** feed THIS
  backlog to autonomous deckent under approval gates.
- **F1-AD** autonomous subscription-model detection (de-hardcode apiId/model lists, resolves
  F1-PD; mythos-model readiness). **F1-IMG** consent-based worker-image auto-provision.

**P2 — Vision / design-stage (brainstorm → spec → approval before code):**
- Cluster S: **COMM-1** worker-to-worker comms, **DESK-1** desktop+mobile app + live
  dashboard, **TEAM-1** multi-provider team subscriptions + RBAC, **ROUTE-1** flawless
  model/effort assignment + evolution, **FB-1** opt-in-OFF feedback channel, **BOT-1**
  humanized Telegram bot-agent (haiku/sonnet, customizable). **F8/ERP/SCALE/ENT** enterprise
  pillars. These need the brainstorming skill (design + approval gate) first.

---

## 5. The operating loop (per item)

```
1. Read the MASTER-PLAN entry (+ linked memories/ADRs).
2. Decide dogfood vs hand-code (§0.2). For dogfood: write DIRECTIVES with
   - Provider/- Model/- Backend/- ModelEffort/- Agent/- Skills overrides as needed.
3. Implement additive + tsc-clean; run affected suites (no regression); REPL/disk proof.
4. Update MASTER-PLAN (mark done / record debt) + memory (durable facts) + commit+push main.
5. Pick the next unblocked item. Surface blockers (tier limits, quota, concurrent-agent
   branch drift) BEFORE acting on them.
```

**Done = on `main`, pushed, tsc-clean, existing suite green, MASTER-PLAN + memory updated.**
