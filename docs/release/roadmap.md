> ⚠️ **SUPERSEDED (2026-06-01, Sprint 211).** Consolidated into [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md) — the single source of truth. Note: "Phase 5: VSCode Extension" lives in MASTER-PLAN §6 (Native Chat Everywhere → IDE extension). Preserved for provenance.

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

## Phase 3.6: Embedded Web Terminal (May 2026, Sprint 175) — COMPLETE

VSCode-style dockable terminal panel inside the web dashboard. Sub-project #1 of a 4-part path toward agentic-OS-grade workflows; sub-projects #2-4 (self-security, multi-tenant/k8s, enterprise integrations) follow in dedicated sprints — `AuthProvider`, `SessionBackend`, and `tenantId` seams are in place from day one.

- [x] **PTY backend** — `node-pty` spawn behind a pluggable `SessionBackend` interface (Sprint 175 W1)
- [x] **WS gateway** — `server.on('upgrade')` + `Sec-WebSocket-Protocol` token auth verified BEFORE pty spawn; backpressure + reattach replay (W2)
- [x] **HTTP control** — sessions CRUD at `/api/terminal/sessions`; localhost-only bootstrap injection of `window.__DECKENT_TERMINAL_TOKEN__` into served `index.html` (W2)
- [x] **Bypass-independent auth** — `LocalTokenAuthProvider` deliberately ignores `DECKENT_API_AUTH_DISABLED`; SHA-256 + `timingSafeEqual` constant-time compare; aligns with Sprint-171 B-022 hardening (W1)
- [x] **Multi-tab UI** — `claude` / `gemini` / `codex` / `deckent` / shell quick-launch; resizable + collapsible bottom `DockPanel` mounted outside the React Router `Outlet` for session persistence across page navigation (W3)
- [x] **tmux-style reattach** — bounded in-memory scrollback ring buffer per session; `detach ≠ kill`; e2e test verifies MARKER replay across client disconnect (W4)
- [x] **Transparent audit** — low-volume structured events (session.create/attach/detach/kill/exit, auth.ok/deny) → `memory.db` with `tenant_id` column; raw PTY output is never persisted (W1)
- [x] **`deckent serve --host` / `--no-terminal`** — remote bind refuses to enable the terminal without an explicit token (spec §5) (W2)
- [x] **ADR-062 + ADR-010 amendment** — both runtime deps (`node-pty`, `ws`) are ADR-justified (W0)
- [ ] **Sub-project #2** — self-security procedure (prompt/command guard, planner state-hygiene)
- [ ] **Sub-project #3** — million-scale: multi-tenant isolation, sandbox, rate/resource limits
- [ ] **Sub-project #4** — enterprise external-world integrations + secure data exchange

See `docs/guide/terminal.md` for the user guide and ADR-062 for the architectural record.

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
- [ ] Landing page at deckent.ai
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

*Current status: Sprint 285+ completed — 20,668+ tests passing, 88.58% coverage, 55+ CLI commands, v1.0.0-beta.1*
*Source of truth: ADR records (`.brain/exports/decisions.md`) and the [CHANGELOG](../../CHANGELOG.md).*
