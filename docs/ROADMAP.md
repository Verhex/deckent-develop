# Deckent Roadmap

> Your AI development team, orchestrated.

---

## Phase 1: Core Engine (March 2026)

Build the orchestration runtime — Brain, Auditor, Workers, Sprint lifecycle.

### Sprint 1 — Wave Breakdown

- [x] **Wave 1: Core Types & Config** — TypeScript types, constants, 3-layer config loader
- [ ] **Wave 2: tmux + Worker + Auditor** — tmux manager, worker lifecycle, auditor scan loop
- [ ] **Wave 3: Brain** — Sprint planning, GO/NO-GO evaluation, retrospective, memory updates
- [ ] **Wave 4: CLI** — `deckent init`, `start`, `plan`, `status`, `doctor` commands
- [ ] **Wave 5: Integration Tests** — Full sprint cycle end-to-end test

### Deliverables
- [ ] `deckent start` runs a full sprint (plan → execute → evaluate → retro)
- [ ] `deckent status` shows live terminal dashboard
- [ ] `deckent doctor` verifies system health
- [ ] Memory system operational (MEMORY.md, DECISIONS.md, RETRO.md decay)
- [ ] Usage-aware planning respects plan limits

---

## Phase 2: Self-Orchestration / Dogfooding (April 2026)

Use Deckent to build Deckent. Validate the sprint loop on real development work.

- [ ] Run 5+ consecutive sprints on Deckent's own codebase
- [ ] Brain learns from its own retros and improves plans
- [ ] Auditor catches real boundary violations and pattern regressions
- [ ] Tech debt escalation triggers automatically (2 sprint → HIGH, 3 sprint → CRITICAL)
- [ ] Memory decay keeps `.brain/` under 300 lines
- [ ] Plugin system: first community skill template

---

## Phase 3: UI — Terminal + Web Dashboard (April–May 2026)

- [ ] Terminal dashboard: rich TUI with live agent status, progress bars, usage meters
- [ ] Web dashboard: React + Vite + Tailwind, WebSocket file watcher → real-time
- [ ] Sprint history with charts (Recharts)
- [ ] DIRECTIVES.md editor in web UI
- [ ] Agent detail view (click → see work in progress)
- [ ] Dark/light theme, mobile responsive

---

## Phase 4: Distribution — npm publish, Landing Page, Docs Site (May 2026)

- [ ] `npm install -g deckent` works globally
- [ ] Landing page at deckent.agency
- [ ] Documentation site (VitePress or Starlight)
- [ ] Public GitHub repo (deckent) — clean, documented, installable
- [ ] Private dev repo (deckent-dev) — full artifacts, .brain/ history
- [ ] `deckent publish` sync script between repos

---

## Phase 5: VSCode Extension (June 2026)

- [ ] Sidebar panel with live agent status
- [ ] Command palette: `Deckent: Start Sprint`, `Deckent: Show Dashboard`
- [ ] Status bar: sprint progress, usage meter
- [ ] Terminal management from sidebar
- [ ] Inline decorations showing which agent modified which file
- [ ] Settings UI for `.deckent/config.json`

---

*Source of truth: [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md) — Sections 12, 19*
