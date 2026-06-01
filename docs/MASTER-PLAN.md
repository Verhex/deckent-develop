# Deckent — Master Plan

> **Status:** CANONICAL — this is the single source of truth for vision, current state, remaining work, business plan, and sequencing.
> **Last reconciled:** 2026-06-01 (Sprint 211 complete).
> **Version:** v1.0.0-beta.1 · **Beta GA window:** 2026-06-01 (OSS public beta).
> **Supersedes (now historical, preserved for provenance):** `docs/ROADMAP-GOD-LEVEL.md`, `docs/vision/roadmap.md`, `docs/release/roadmap.md`, `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md`, `docs/release/beta-tracker.md`. Those documents used pre-Sprint-211 sprint numbering (189–200) that never executed 1:1 — this plan is the reconciled reality.

---

## 1. North Star & Vision

**Deckent is an install-and-run AI agent orchestrator that lives on your machine, runs your sprints, and never calls home.**

Three immovable pillars (Alperen-approved 2026-05-31):

1. **Provider-free** — any LLM: cloud subscription *or* local Ollama, with a zero-API-key option. No vendor lock.
2. **Conversational** — native chat REPL (`deckent chat`), the way `claude` works, reachable from terminal, web UI, and IDE.
3. **Three-face (Trinity)** — one engine, three audiences: developer / company / individual.

**License & model:** MIT, free forever. No "pro" tier, no "team" plan, no enterprise edition with gated features. The same code that runs the dogfood loop runs in a 10,000-employee company (ADR-033 Product-Not-Service).

**The moat — evolutionary architecture:** Deckent learns from every sprint. Brain reads its own retros, routing outcomes feed agent/skill selection, prompt-evolution and adaptive-agent tune behavior over time. This self-improvement loop — not any single feature — is the core differentiator. Positioning: **the anti-Devin** (open-source, self-hosted, provider-agnostic, discipline-driven vs single-agent SaaS).

---

## 2. Trinity — Three Faces (maturity & path to 100%)

| Face | Audience | Mode | Maturity | Gap to 100% |
|------|----------|------|----------|-------------|
| **AI Developer** | Developer | Sprint Mode | **~90%** | F1-004/005 (docker provider-aware) → 95%; F6-004 API activation (post-beta) → 100% |
| **AI System Worker** | Company | Process Mode | **~80%** | F3-004 (k8s pod-exec) + F7-006 (enterprise UI) → 90%+ |
| **AI Assistant** | Individual | Chat Mode | **~80%** | F2 streaming + F7-003 (god-level UI/UX) + native-chat-everywhere surfaces → 90%+ |

> "Today's maturity is uneven, and that is honest." All three faces ship from the same engine; they mature in parallel, not in sequence.

---

## 3. Current State — Ground Truth (Sprint 211, 2026-06-01)

- **Sprint 211 closed:** 16/16 DONE, 0 tech-debt, 0 NO_GO, 16m19s.
- **Full test suite (measured):** 18,390 passed / 58 skipped (1,021 files) + dashboard 570 passed. **0 failures.** `tsc --noEmit` clean.
- **Shipped engine:** PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP lifecycle; 3 backends (docker/tmux/subprocess); 15 agents + 21 skills; routing-engine v2; Memory V2 (SQLite FTS5, dual-layer i18n); 32 MCP tools + 8 resources; 49+ CLI commands; React dashboard (7 pages) + embedded web terminal.
- **Provider-free:** 100% of P0 (Ollama bootstrap, claude-hardcode cleanup, provider-agnostic defaults).
- **Known debt carried into Sprint 212** (honest):
  - **F5 wire-gap:** `prompt-evolution` + `adaptive-agent` have integration entry-points but **0 external callers** — still dormant at runtime. Only `cross-sprint-analyzer` is genuinely wired (via `deckent evolve` CLI). Root cause: per-task scope split the module from its caller, and proof-greps counted the def file. (See memory `feedback_directive_kanit_letter_vs_goal`.)
  - **Agent routing skew:** plan-time/runtime distribution collapsed to 12/16 `refactorer` again. Skill routing diversifies correctly, but agent selection does not. (See memory `feedback_agent_routing_imbalance`.)

---

## 4. Feature Status Matrix (F1–F7, reconciled)

### F1 — Provider Independence — **~95%**
| ID | Item | Status |
|----|------|--------|
| F1-001/002/003/006/007 | Ollama bootstrap, provider-agnostic defaults, claude-hardcode cleanup, token throttle | ✅ DONE |
| F1-004 | Docker provider-aware CLI invocation (binary select + auth + build-arg) | ⬜ P1 |
| F1-005 | Dockerfile.worker multi-CLI (build-arg opt-in) | ⬜ P1 (depends F1-004) |

### F2 — Native Chat — **~90%**
| ID | Item | Status |
|----|------|--------|
| F2-001..003 | Tool-use loop, memory integration, streaming+multi-turn+resume | ✅ DONE |
| F2-004 | Real ProviderAdapter round-trip (subscription CLI spawn, live registry) | ✅ DONE (Sprint 211) |
| F2-005 | MCP tool dispatch (deckent_status/memory_query feedback) | ✅ DONE (Sprint 211) |
| F2-006 | Session persist + resume (memory.db) | ✅ DONE (Sprint 211) |
| F2-007 | **Streaming live** (real provider streaming, not mock) | ⚠️ in-progress |
| F2-008 | **Native SDK round-trip** (true standalone, Path C) | ⬜ Q3 2026 |

### F3 — Process Mode — **~85%**
| ID | Item | Status |
|----|------|--------|
| F3-001/002/003/005/006/007 | Tenant context, scheduled flows, event triggers, flow runtime, self-dispatch guard | ✅ DONE |
| F3-004 | SessionBackend k8s pod-exec | ⬜ P3 (post multi-tenant Phase 2) |

### F4 — Enterprise — **✅ 100%**
| ID | Item | Status |
|----|------|--------|
| F4-001 | RBAC enforcement (`enforceRbac` runtime) + grant/revoke CLI | ✅ DONE (Sprint 207/208/211) |
| F4-002 | Audit compliance export (JSON+CSV+HMAC chain) | ✅ DONE (Sprint 211) |
| F4-003 | Rate/resource limit per-tenant (token-bucket) | ✅ DONE (Sprint 211) |
| F4-004 | Enterprise config schema (opt-in) | ✅ DONE (Sprint 208) |
| — | SSO/OIDC depth, SIEM forwarder, compliance report generator | ⬜ optional post-212 |

### F5 — Evolutionary Architecture — **~60% (wire-gap)**
| ID | Item | Status |
|----|------|--------|
| F5-001 | prompt-evolution → outcome-tracker (rule-based suggestions) | ⚠️ entry-point only, **0 external caller** |
| F5-002 | adaptive-agent runtime adaptation | ⚠️ entry-point only, **0 external caller** |
| F5-003 | cross-sprint-analyzer (trend report) + `deckent evolve` CLI | ✅ DONE (genuinely wired) |
| F5-004 | **Real runtime callers** (sprint lifecycle invokes F5-001/002) | ⬜ Sprint 212 (hygiene priority) |

### F6 — Auth Flexibility — **~50%**
| ID | Item | Status |
|----|------|--------|
| F6-001 | Per-task `- Auth:` override | ⚠️ partial (readTaskAuthMode exists) |
| F6-002 | Hybrid mode (subscription brain + API/local workers) | ⚠️ config exists, not fully wired |
| F6-003 | Auth matrix test (4 combinations) | ⬜ |
| F6-004 | API real activation + tier-aware throttle | ⬜ **POST-BETA** (Tier-1 30K tok/min cap; subscription-only during beta) |

### F7 — Dashboard & Control Plane — **~75%**
| ID | Item | Status |
|----|------|--------|
| F7-001/002 | API auth fix (localhost auto-inject) + live data parity (SSE/WS) | ✅ DONE |
| F7-005/008 | Sprint control panel + onboarding wizard | ✅ DONE |
| F7-003 | **UI/UX god-level redesign** (modern, responsive, dark/light, info architecture) | ⚠️ ~30% (ThemeProvider base only) |
| F7-004 | Terminal hardening (multi-session, history, copy/paste) | ⚠️ ~60% (Sprint 211 partial) |
| F7-006 | Enterprise view (multi-tenant, RBAC UI) | ⚠️ ~40% (F4 backend ready, UI pending) |
| F7-007 | Memory/ADR/debt explorer (FTS5 search, ADR timeline) | ⚠️ ~20% (Sprint 211 base) |

---

## 5. Sub-Projects — Agentic-OS Pipeline (#1–#5)

| # | Sub-project | Status | Remaining |
|---|-------------|--------|-----------|
| **#1** | Embedded Web Terminal (PTY + WS gateway + token auth + audit; ADR-062) | ✅ **GA** (Sprint 175) | F7-004 polish |
| **#2** | Self-security (prompt/command guard, planner state-hygiene) | ⬜ **not started** | full scope |
| **#3** | Million-scale (multi-tenant isolation, k8s, mTLS, rate limits) | ⚠️ partial | F3-004 k8s pod-exec, mTLS impl, audit shard |
| **#4** | Enterprise integrations (RBAC/audit/rate done; SSO/SIEM/compliance) | ✅ core done | SSO/SIEM/compliance depth (optional) |
| **#5** | Local LLM (Ollama/CUDA) | ⬜ infra ready | adapter activation (RTX 5090 + CUDA 13.2 + WSL2 ready; 32GB VRAM → 70B residence) |

---

## 6. Native Chat Everywhere (priority arc — Alperen-decided)

The goal: `deckent` works as a native conversational agent the way `claude` does — in the **terminal**, in the **web UI**, and inside **any IDE**. Three architectural paths (A/B/C) and the VSCode extension overlay, not compete.

| Path | What | LoC | Effort | Prereq | ADR-033 fit |
|------|------|-----|--------|--------|-------------|
| **B** (host CLI) | `deckent chat` spawns user's claude/codex/gemini CLI + auto-attaches MCP | ~150 | 0.5 sprint | user CLI installed | ⚠️ partial |
| **A** (embedded) | "Deckent Chat" tab in dashboard, reuses Sprint-175 PTY/WS/auth/audit | ~600 | 1–2 sprint | none | ✅ |
| **C** (native SDK) | Own tool-use loop + REPL via Anthropic/OpenAI/Google SDKs; zero CLI prereq | ~1500 + migration | 3–4 sprint | none | ✅ full (ADR-010 amendment) |
| **IDE ext** | VS Code/JetBrains extension: sidebar, command palette, status bar, `deckent` command | new sub-project | 2+ sprint | none | ✅ |

**Current reality:** Path B effectively exists (`src/cli/commands/chat.ts` wired + `--native` flag → `runChatNativeLoop`). Path A, Path C, and the IDE extension are **not built** (the `extensions/vscode/` directory does not exist on disk despite a stale doc reference — release/roadmap.md "Phase 5: VSCode Extension (June 2026)" is the canonical home for this work).

**Approved sequence (Alperen):**
1. **Stability/hygiene first** — close the F5 wire-gap (real external callers) + fix agent routing skew.
2. **IDE extension** — `extensions/vscode/` from scratch; `deckent` command inside IDEs like `claude`.
3. **Web UI chat tab** — Path A (dashboard-native chat surface).
4. **F2 streaming + native SDK** — Path C (true standalone, zero prerequisite), Q3 2026 arc.

---

## 7. Work Streams (W-A … W-K, reconciled)

Most beta-critical streams already landed across Sprints 189–211. Remaining:

| Stream | Title | Status | Remaining |
|--------|-------|--------|-----------|
| W-A | OSS GA blockers | ✅ done | — |
| W-B | Doc/wire drift fixes | ✅ mostly | doc-reality sync (e.g. extensions/vscode reference) |
| W-C | Native chat (Path B→A→C) | Path B ✅ | Path A + C + IDE ext (see §6) |
| W-D | Dashboard rebirth (UI/UX) | ⬜ | F7-003 god-level redesign |
| **W-E** | **Evolutionary architecture crowning** | ⚠️ wire-gap | F5-004 real callers (Sprint 212) |
| W-F | Provider repair + local LLM + live catalog | ✅ P0 | F1-004/005, sub-#5 activation |
| W-G | API surface tests | ✅ done | — |
| W-H | Documentation perfection | ⚠️ partial | this consolidation + ref sync |
| W-I | OSS publish pipeline | ⬜ | public repo flip, npm publish (Alperen manual) |
| W-J | Million-user hardening | ⬜ post-beta | OTel/Prometheus, ADR-037 RBAC hard-flip V2 |
| W-K | Dead-code → live-feature wire-up | ⚠️ | overlaps W-E (F5 callers) |

---

## 8. Business / Launch / OSS

- **Model:** MIT, free forever, self-hosted. No paid tier, no feature gate, no `deckent.app` account. Enterprise capabilities (multi-tenant, mTLS, k8s, SSO, SIEM, compliance) ship under the same MIT license — **not** a separate Enterprise Edition.
- **Beta:** v1.0.0-beta.1, OSS public beta window **2026-06-01**. First `npm publish` is **manual by Alperen** (policy: `feedback_npm_publish_user_approval`).
- **Distribution:** `npm install -g deckent`; VitePress docs site; public repo flip (`VerhexIO/deckent`) — monorepo vs split decision pending; sensitive-data scrub (git-filter-repo) before flip.
- **Marketing channels:** Show HN, Reddit (r/LocalLLaMA, r/programming, r/opensource), Twitter/X, Turkish dev community, Discord, Dev.to, landing page + demo video.
- **Competitive position:** the only OSS tool combining multi-agent parallel execution + sprint lifecycle + scope enforcement + memory/learning + multi-provider + MCP-native. Free vs Devin ($20/mo), Cowork (M365), Perplexity ($200/mo).
- **Growth target:** million users (god-level, no-MVP scope).

---

## 9. Beta Gates (status as of 2026-06-01)

20 of the original gates pass: `tsc` clean, vitest ≥99.5% (now 18,390/18,448), coverage, all MCP tools (32) + CLI commands (49+) functional, `npm pack` clean, cross-platform (macOS/Linux/WSL2), multi-provider abstraction, i18n, Memory V2 stress, zero CRITICAL/HIGH debt, ADR governance, Brain stability, synthetic-NO_GO disk-verify gate.

Conditional/open:
- **Multi-provider runtime** — abstraction ready; docker backend Claude-only, tmux/subprocess support Codex/Gemini (full docker parity = F1-004/005).
- **Messaging trio** (Discord/Telegram/WhatsApp) — scaffold present, token activation pending.
- **Documentation sync** — this MASTER-PLAN consolidation + reference re-verify.

---

## 10. Sequencing — Sprint 212+ (consolidated, comprehensive)

Per Alperen's direction: **combine sprints, write larger comprehensive tasks** (Deckent handles the scale), keep the small-file/single-responsibility discipline *within* each task. Big-scope sprints, 10 workers, high parallelism.

| Sprint | Theme | Scope |
|--------|-------|-------|
| **212** | **Stability/Hygiene + Evolution crowning** | F5-004 real external callers (prompt-evolution + adaptive-agent wired into sprint lifecycle, scope includes caller modules); agent routing skew fix (skill→agent signal: frontend-design→frontend-designer, security-specialist→security-auditor); doc-reality sync; ≥1 forward task |
| **213–214** | **IDE Extension (new sub-project)** | `extensions/vscode/` from scratch — sidebar (live agent status), command palette (`Deckent: Start Sprint`), status bar (progress/usage), terminal management, inline agent-edit decorations, settings UI; `deckent` command native in IDEs |
| **215** | **Web UI Chat tab (Path A)** | Dashboard "Deckent Chat" surface on the embedded-terminal stack; multi-tenant by inheritance |
| **216** | **Dashboard god-level redesign (F7-003) + F7-004/006/007** | UI/UX redesign, terminal polish, enterprise view, memory/ADR explorer |
| **217+** | **F2 streaming + Native SDK (Path C)** | Real streaming; ADR-010 amendment; SDK migration; zero-prerequisite `npx deckent` chat — Q3 2026 |
| **post-beta** | **Provider/local LLM + million-user hardening** | F1-004/005, sub-#5 Ollama/CUDA, OTel/Prometheus, ADR-037 hard-flip V2, sub-#2 self-security |

---

## 11. Anchor Rules / DNA / Governance (unchanged)

- **No MVP, ever** — god-level scope; ask "is this god-level?" (`feedback_no_minimum_no_mvp_deckent`).
- **Disk-verify ground truth** — trust the disk, not Brain verdict or worker self-assessment (`feedback_trust_brain_eval_not_worker`).
- **Subscription-first** — API mode forbidden during beta (`project_api_mode_deferred_post_beta`).
- **npm publish = manual Alperen** (`feedback_npm_publish_user_approval`).
- **Karpathy 4-discipline** worker anchor (Think / Simplicity / Surgical / Goal-driven).
- **Wire proof must measure the goal, not the letter** — exclude def-file from caller greps; wire-task scope must include the caller (`feedback_directive_kanit_letter_vs_goal`).
- **Memory budget** 900 lines max in `.brain/`.
- **ADR-033** Product-Not-Service · **ADR-037** RBAC authority matrix · **ADR-041** agent taxonomy · **ADR-040** nervous system · **ADR-062** embedded terminal · **ADR-074** native chat + enterprise + evolution.

---

## 12. Top Risks

1. **F5 stays dormant** — entry-points without callers read as "DONE" but ship dead code; the evolutionary moat is unproven until F5-004 lands real callers. *Mitigation: Sprint 212 priority + per-sprint visible-change evidence.*
2. **Routing collapse** — agent diversity is fragile/non-deterministic; specialization value lost if everything routes to `refactorer`. *Mitigation: skill→agent activation signal.*
3. **Native-chat scope creep** — IDE extension + Path A + Path C is multi-sprint; risk of half-built surfaces. *Mitigation: strict sequence (hygiene → IDE → web → SDK), one surface fully landed before the next.*
4. **Doc-reality drift** — this consolidation fixes today; re-drift if future status lands only in scattered docs. *Mitigation: MASTER-PLAN is the only roadmap that gets status updates; others are frozen historical.*

---

*Single source of truth. Update this document — not the superseded roadmaps — when status changes.*
