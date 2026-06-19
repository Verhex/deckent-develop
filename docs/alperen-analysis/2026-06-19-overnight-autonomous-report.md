# Overnight Autonomous Dogfood Report — 2026-06-19 (human out-of-loop 01:40 → 08:30)

> **Mandate (Alperen ~01:40):** dogfood deckent's OWN flows (sprint / autonomous / process), find+fix bugs so **auto-mode runs smoothly by morning**; produce real deliverables; keep docs reality-synced; opus-weighted / sonnet-ok / **no haiku**; CLI-only (no `/mcp restart`); don't kill sprints; report findings. Human back 08:30.

---

## TL;DR (good morning 👋)
- **Auto-mode lifecycle dogfood: SUCCESS.** Ran a real `deckent start` sprint (291, docker, 3 sonnet workers, $0 subscription) end-to-end through PLAN→…→RETRO. **3/3 DONE, disk-verified** (not trusting Brain verdict). No false-NO_GO, no ADR-noise, no haiku — the Sprint-290 eval fixes hold live.
- **The dogfood caught + I fixed a real registration regression** (process command wired in the wrong file → harness fail) — exactly what dogfooding is for.
- **WSL crashed ~06:1x** (same risk as Sprint 270). Sprint had already finalized; I recovered, disk-verified, fixed the regression, and committed.
- **Shipped to main (synced @ `16ff9a1d`):** MCP-W1 writer-lease split, doc reality-sync, **`deckent process` CLI** (process-mode now has a CLI surface — ADR-022 parity), MCP-W1 review-minors closeout.
- **Beta verdict (independent opus audit): NEAR-READY.** One hard blocker (npm not published — your call), then a short polish list. Detail in §Beta-Readiness.
- **2 stale-queue corrections:** REPL-TOOL-DEBT-1 + WP-13..20 were already DONE; #2 reduced to DASH-D3.

---

## Deliverables landed on main (this session)
| Commit | What |
|--------|------|
| `c2cc7a3e`→`a0ac4f71` | **MCP-W1 writer-lease split** — `-32000` multi-window fix (boot-singleton removed, per-project writer-lease, graceful denial, fail-open). 9 commits, full TDD + opus review, 2 review-bugs caught+fixed, 5441 tests pass. |
| `8d979007` | MASTER-PLAN §10 EK — MCP-W1. |
| `a9985024` | Doc reality-sync (README+lifecycle-diagram 34→35) + dashboard dead-area inventory. |
| `16ff9a1d` | **Sprint 291 dogfood** — `deckent process` CLI (submit/status/result, runtime-proven) + MCP-W1 review-minors (TR `{pid}` test, server.ts comment) + writer-lease release-hooks test + recovery-fix. |
| `d4ad9a46`,`9ddebcbc` | **DASH-D3 (beta-blocker #2 partial)** — Enterprise **RBAC role CRUD + Rate-limit rule CRUD UI** wired to the existing backend endpoints (admin-gated `canManage`, mirrors Tenants pattern, shared `mutate()` helper, lucide icons / i18n en+tr, 8 hermetic component tests). RBAC & Rate tabs are no longer read-only. |
| `26387940` | **Dashboard suite GREEN** (was 5 pre-existing failures → **1066/1066**). Fixed: nav-count 15→16 (docs-health route), nav group-label drift (i18n stable-ids), and a **real user-facing i18n bug** — `docs_health.docs_count` used single-brace `{count}` which `t()` rendered LITERALLY ("{count} docs"); now `{{count}}`. |

## Auto-mode dogfood findings (the headline)
**Sprint lifecycle (`deckent start`) — VALIDATED.** Planned structured (no-haiku via explicit models), spawned 3 docker workers, executed, evaluated, finalized, archived, wrote retro/learnings. Cost $0 (subscription). All 3 tasks DONE and **disk-verified** (process.ts real not stub; tsc clean; 21 affected tests green). The known false-NO_GO / ADR-noise families did NOT fire — Sprint-290's eval fixes (auditor count_check pkg-only guard; backlog-eval coverage-exemption) are live-confirmed.

**Findings (logged):**
- **REGRESSION (found+FIXED):** sprint worker wired `registerProcess` in `entry.ts` as a one-off after `buildProgram()`, but the canonical registration file is `src/cli/index.ts` (where all `register*` live, and what `registration-harness.test.ts` checks) → 1 test failed. Fixed: moved `registerProcess` into `buildProgram()` (index.ts), reverted entry.ts to HEAD, no double-registration. tsc clean, harness 57/57 + process 9/9 green, `deckent process --help` runtime-proven. **Root cause was my DIRECTIVES (said "entry.ts")** — lesson: directives must name the canonical registration file.
- **F1 (autonomous, stale):** old backlog entry `sweep-stale-comments` failed 06-17 = timeout (task too broad — "sweep src/"). Task-sizing lesson.
- **F2 (autonomous eval, stale-FIXED):** old entry `fix-stale-comment-cli-helpers` failed 06-17 with "Schema violation: missing [coverage] → NO_GO" + spurious "ADR-010 dependency-count" on a comment task. **Both are fixed in current code** (06-17 = pre-Sprint-290): `auditor.ts:2217` count_check now fires only when `package.json` changed; `backlog-eval.ts` has the coverage-optional exemption for doc/comment tasks. (Live re-validation of the autonomous path still pending — see Next.)
- **F3 (routing / ROUTE-1):** structured-mode planning routed ALL 3 tasks → `refactorer` (Task1 CLI-cmd should=api-builder; Task3 test→refactorer is arguably OK per ADR-041 no-test-agent). Agent-diversity is weak in structured mode; routing-engine has anti-collapse bonuses but they didn't diversify here. Worth a look — agent is advisory (deliverables were fine), so this is a quality/precision issue not correctness. **(Not yet fixed.)**
- **F4 (CLI gap, FIXED):** there was no `deckent process` CLI — process mode was MCP-only. Sprint 291 Task 1 added it (ADR-022 parity). You can now dogfood process mode from the CLI: `deckent process submit/status/result`.
- **F5 (parity, minor):** CLI `plan --structured` vs MCP `mode:'structured'` — different surface spelling. Cosmetic.

## Documentation reality-sync
- **Wave 1 (opus audit + fix):** README ×2 + `docs/reference/lifecycle-diagram.md` → 35 tools. Verified already-accurate: DECKENT.md, api-surface.md, IDENTITY.md, mcp-tools.md.
- **GOV-1 (ADR-090) — RESOLVED during the night:** ADR-090 (doc-tracking) was referenced in docs but **absent from `.brain/memory.db`** (highest was adr-089). It is now present (summary.md shows `adr-090 | … | accepted`); the sprint's Brain/sync regenerated the rules + exports with it. Worth a 30-sec confirm that the DB row is well-formed.
- **Flagged (not auto-fixed):** `docs/reference/mcp-guide.md` says "31 Tools" + documents only 10/35 — needs a real rewrite or generator (don't one-number-bump). MASTER-PLAN DOC-35 backlog `[ ]` is effectively done.

## Beta-readiness (independent opus audit — full text: `docs/alperen-analysis/2026-06-19-…` agent run)
**Verdict: NEAR-READY for a strong beta.** Engine quality is genuinely high (orchestrator happy-path production-grade; 28K test descriptors, hermetic CI, tsc clean; last-3-days closed real architectural gaps). Gap = "works for the dogfood author" vs "delights a fresh-install user."

**Top blockers/polish (priority order):**
1. **🔴 SHIP-BLOCKER — npm package not published.** `npm view deckent` → E404, but README says `npm install -g deckent`. A new user's first command fails. **Publish `1.0.0-beta.1` (your call — `npm publish` is manual-Alperen) or correct the README.** Highest leverage for a public beta.
2. **🟠 Dashboard dead areas (DASH-D3).** Highest-value: wire enterprise RBAC + Rate **CRUD UI** (backend already live, `enterprise-endpoint.ts:631/762`); fix the empty terminal DockPanel (renders on every page when terminal default-off); persist settings language/theme. Inventory ready at `docs/alperen-analysis/2026-06-19-dashboard-dead-area-inventory.md`.
3. **🟠 ADR-090 memory.db integrity** — confirm the now-present row is correct (Brain self-audits against the DB).
4. **🟡 First-run/onboarding** — surface "how to safely enable" nervous/autonomous; add a non-Claude quickstart (only the Claude-primary path is fully proven).
5. **🟡 Finalize/recovery edge-debt** — `finalize --force` double-counts + archive-blind; process mode has no step rollback / no parallelism. Document as known beta-limitations.

## Per-surface maturity (one-liners)
Orchestrator: **solid happy-path**, documented edge-case (crash-recovery) debt. Autonomous: **works for dogfood, default-off**, narrow reconcile. Process mode: **partial** (sequential, no rollback). Providers: **Claude solid**, codex/gemini/ollama real-but-thinner, no failover e2e. Dashboard: **wired core + inventoried dead areas**. Native REPL/Ink: **daily-driver, rough streaming (F11-016)**. Memory V2: **production**, was 1 ADR out of sync (now fixed). Enterprise: **backend wired, admin UI partial**. Nervous: **functional, opt-in**. Evolution: **scaffolded, largely dormant**. Tests: **large, green, hermeticity-disciplined**.

## Open-work count (MASTER-PLAN, taken 2026-06-19)
**124 open `- [ ]`** + 17 🔜 planned arcs + 30 ⚠️ partial. (#2 → DASH-D3 only after stale-queue correction.)

## Recommended next (when you're back)
1. **Decide the npm-publish blocker** (#1) — biggest beta lever, needs you.
2. **DASH-D3** — RBAC/Rate CRUD UI + terminal DockPanel + settings persistence (backend done; execution not discovery).
3. **Validate the autonomous loop live** (`deckent autonomous` end-to-end) — I validated `deckent start`; the continuous loop deserves the same on a fresh small goal (I held off running it unattended right after a WSL crash).
4. **F3 routing diversity** (structured-mode all→refactorer) — quality polish for ROUTE-1.
5. **#4 ledger follow-ups** (provider tech-debt F1-PD/AD, MF-4..9, planner precedence) per MASTER-PLAN.

---

## Timeline
- **01:40** Mandate. Doc-audit wave 1 (README/diagram → 35).
- **~02:00** Autonomous recon: 2 stale failures analyzed (F1/F2 = pre-Sprint-290, fixed in current code). `deckent process` CLI gap found (F4).
- **~02:08** Sprint 291 launched (docker, 3 sonnet, $0). Capability/beta-readiness opus audit run in parallel.
- **~02:13** Sprint finalized (3/3 DONE, ADR-090 added to DB, retro written). WSL crashed shortly after.
- **~06:1x** Recovered post-crash. Disk-verified deliverables, found+fixed registration regression, runtime-proved `deckent process`, committed `16ff9a1d`, pushed. Wrote this report.
- **~06:25** GOV-1 closed: ADR-090 confirmed well-formed in `memory.db` (type=adr, accepted, decay_exempt, proper content).
- **~06:40** DASH-D3 RBAC + Rate CRUD UI (opus subagent) — verified (enterprise-crud 8/8 + no-emoji pass, tsc clean, file-scope isolated, i18n purely additive), committed `d4ad9a46`/`9ddebcbc`, pushed.

## Pre-existing dashboard test debt — ✅ RESOLVED tonight (commit `26387940`, suite now 1066/1066)
`npm run test:dashboard` has **5 pre-existing failures** (confirmed present at `394035a7`, before any of tonight's dashboard work; the DASH-D3 i18n additions carry no single-brace placeholder, en.ts already had 1 at parent):
- `nav-render.test.tsx` ×2 — expects "exactly 15 unique routes / 15 nav links", but the app now has 16 routes (the doc-tracking `/docs-health` route was added without updating the nav test count). Likely a stale test expectation OR a missing nav-group entry.
- `layout-chat-first.test.tsx` ×2 — nav-group assertions ("Konuş/İzle/Yönet" 3 groups, chat first) — same nav-structure drift.
- `workers-directives-pages.test.tsx` ×1 — A2 i18n sweep: one en/tr value carries a single-brace `{x}` placeholder (should be double-brace/interpolated). A real i18n bug to track down.
**Action for the morning:** quick win to get the dashboard suite green — reconcile the nav-count (15→16 + docs-health nav entry) and fix the one single-brace i18n value.

> **Uncommitted leftovers** (`.brain/exports/*`, `.claude|.codex|.cursor|.gemini/rules/*`, `.deckent/agents/*.json`, manifests) are auto-generated sprint/stat artifacts that were already dirty before this session — left untouched (they regenerate from `memory.db`).
