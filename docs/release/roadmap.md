# Deckent Roadmap

> Your AI development team, orchestrated.

---

## Phase 1: Core Engine (March 2026) — COMPLETE

Build the orchestration runtime — Brain, Auditor, Workers, Sprint lifecycle.

### Sprint 1 — Wave Breakdown

- [x] **Wave 1: Core Types & Config** — TypeScript types, constants, 3-layer config loader
- [x] **Wave 2: tmux + Worker + Auditor** — tmux manager, worker lifecycle, auditor scan loop
- [x] **Wave 3: Brain** — Sprint planning, GO/NO-GO evaluation, retrospective, memory updates
- [x] **Wave 4: CLI** — `deckent init`, `start`, `plan`, `status`, `doctor` + 12 more commands
- [x] **Wave 5: Integration Tests** — Full sprint cycle end-to-end test

### Deliverables
- [x] `deckent start` runs a full sprint (plan → execute → evaluate → retro)
- [x] `deckent status` shows live terminal dashboard
- [x] `deckent doctor` verifies system health
- [x] Memory system operational (MEMORY.md, DECISIONS.md, RETRO.md decay)
- [x] Usage-aware planning respects plan limits

---

## Phase 2: Self-Orchestration / Dogfooding (March-April 2026) — COMPLETE

Use Deckent to build Deckent. Validate the sprint loop on real development work.

- [x] Run 5+ consecutive sprints on Deckent's own codebase (65 sprints completed)
- [x] Brain learns from its own retros and improves plans
- [x] Auditor catches real boundary violations and pattern regressions
- [x] Tech debt escalation triggers automatically (2 sprint → HIGH, 3 sprint → CRITICAL)
- [x] Memory decay keeps `.brain/` under 600 lines
- [x] DECKENT.md as single source of truth (Sprint 15 — additive adapter pattern)
- [x] Plugin system: full install + runtime hooks (Sprint 037)
- [x] Security hardening: timing-safe auth, credential redaction (Sprint 037)
- [x] Memory system fix: budget increase, PROJECT-IDENTITY.md, finalizeSprint (Sprint 037)
- [x] Skill sandbox AST enhancement (Sprint 037)

---

## Phase 3: UI — Terminal + Web Dashboard (March 2026) — MOSTLY COMPLETE

- [x] Terminal dashboard: rich TUI with live agent status, progress bars, usage meters (Sprint 10)
- [x] Web dashboard: React + Vite + Tailwind, SSE file watcher → real-time (Sprint 11)
- [x] Sprint history with charts (Recharts)
- [ ] DIRECTIVES.md editor in web UI
- [ ] Agent detail view (click → see work in progress)
- [x] Dark/light theme, mobile responsive

---

## Phase 3.5: Multi-Provider & Platform Support (March 2026) — COMPLETE

Make Deckent provider-agnostic and cross-platform ready.

- [x] Multi-provider support: Codex and Gemini adapters (Sprint 038)
- [x] Provider-aware model selection across all planning and execution paths (Sprint 038)
- [x] Platform decoupling: planner, tmux, subprocess made provider-agnostic (Sprint 038)
- [x] CLI entrypoint side-effect fix (Sprint 038)
- [x] Platform support matrix documented (Sprint 038)
- [x] Cross-platform test infrastructure (Sprint 038)

---

## Phase 4: Distribution — npm publish, Landing Page, Docs Site (March-April 2026) — IN PROGRESS

Sprint 051-065 ile planlanan ve ilerleme durumu:
- [x] `npm install -g deckent` works globally (Sprint 051 — npm publish dry-run, package validation)
- [ ] Landing page at deckent.agency
- [x] Documentation site — VitePress (Sprint 052 — setup, getting-started, guide, reference)
- [ ] SWE-bench benchmark
- [ ] GitHub Issue Mode — `deckent do --issue 42`
- [x] CLI deep analysis — 158 improvement opportunities identified and systematically resolved (Sprint 055-065)
- [x] CI Guardian agent — ci-guardian + ci-testing skill + plugin hooks (Sprint 062)
- [x] Routing v2 engine — intent-based 3-layer agent/skill selection with learning (Sprint 063)
- [x] Community infrastructure — CONTRIBUTING.md, CODE_OF_CONDUCT.md, GitHub templates
- [ ] Git Auto-Workflow — branch-per-sprint, auto-commit, PR
- [ ] Public GitHub repo (deckent) — clean, documented, installable
- [x] Private dev repo (deckent-dev) — full artifacts, .brain/ history, 65 sprints

---

## Phase 5: VSCode Extension (June 2026)

- [ ] Sidebar panel with live agent status
- [ ] Command palette: `Deckent: Start Sprint`, `Deckent: Show Dashboard`
- [ ] Status bar: sprint progress, usage meter
- [ ] Terminal management from sidebar
- [ ] Inline decorations showing which agent modified which file
- [ ] Settings UI for `.deckent/config.json`

---

---

*Current status: Sprint 065 completed — 11,862 tests passing, 96%+ coverage, 33+ CLI commands*
*Source of truth: [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md) — Sections 12, 19, 23, 24*
