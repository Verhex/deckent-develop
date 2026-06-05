# Deckent — Master Plan

> **Status:** CANONICAL — this is the single source of truth for vision, current state, remaining work, business plan, and sequencing.
> **Last reconciled:** 2026-06-03 (Sprint 224 in progress — F11 Native CLI Parity: pinned-bar/`/`-menu/markdown-stream/token-counter/activity/clickable-paths DONE; **Ink (React-for-CLI) REPL pivot landed, stabilizing** — F11-016). Prior baseline: Sprint 215 (CI-hermeticity permanent + 8-provider fleet + dashboard god-level + evolution moat).
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

**The moat — evolutionary architecture:** Deckent learns from every sprint. Brain reads its own retros, routing outcomes feed agent/skill selection, prompt-evolution and adaptive-agent tune behavior over time. This self-improvement loop — not any single feature — is the core differentiator.

**Positioning (Alperen 2026-06-02 — no more "anti-X" framing; compare, don't disparage):** Deckent is the **god-level orchestration + enterprise layer of an open agent**, made **so easy a single user can wield that same power**. One MIT product that scales from one developer on a laptop to a 10,000-employee enterprise — the full strength of multi-agent orchestration, sprint discipline, scope enforcement, memory/learning, and multi-provider freedom, given to everyone. **"Open source for open world."** We respect and *compare* with peers (Devin, Cursor, Claude Code, Cowork, Perplexity, open agent CLIs) on capability — we never frame ourselves as "anti" anyone.

**Data architecture (clarification, 2026-06-01, Alperen):** Two **orthogonal** DB concerns — do not conflate them.
1. **Deckent's own orchestration memory** = `.brain/memory.db` — embedded **SQLite + FTS5**, per-project, zero-config, never-calls-home. Single source of truth for ADR / sprint / retro / pattern / debt. **It STAYS SQLite** — it fits the install-and-run DNA and does **not** migrate to Postgres/Oracle just because a target project uses them. (`.brain/memory.db` gitignored, rebuilt from git-tracked `.brain/exports/*`.)
2. **A target project's data DB** (e.g. an ERP on Postgres/Oracle) is a **connector/capability concern** — accessed via the **Capability Broker (F8 `db.query`/`erp.read`, read-only first)** + RBAC + approval gate. Deckent neither stores its memory there nor lets it replace `memory.db`.
- **Vector DB / embeddings:** optional **post-GA** for semantic recall (DeckentHub 100-skill search, large-memory semantic search). Must use **local embeddings** (Ollama on the RTX 5090) to honor never-calls-home; FTS5 dual-layer normalize is sufficient at current scale.
- **Multi-tenant scale (sub-#3):** per-tenant SQLite isolation / row-level security for SaaS; the single-host product stays embedded SQLite.

**Positioning evolution (2026-06-01, Alperen):** Deckent is no longer just "a product you install" — it is becoming an **AI runtime ecosystem**: one engine that is (a) the individual developer's orchestrator, (b) the individual user's autonomous agent, and (c) the enterprise's god-level orchestration ecosystem — at million-user / million-environment / million-agent scale. Easy install, low requirements, evolving/learning. Enterprise (incl. ERP) is a *runtime target*, not a separate edition (ADR-033 holds).

---

## 2. Trinity — Three Faces (maturity & path to 100%)

| Face | Audience | Mode | Maturity | Gap to 100% |
|------|----------|------|----------|-------------|
| **AI Developer** | Developer | Sprint Mode | **~90%** | F1-004/005 (docker provider-aware) → 95%; F6-004 API activation (post-beta) → 100% |
| **AI System Worker** | Company | Process Mode | **~80%** | F3-004 (k8s pod-exec) + F7-006 (enterprise UI) → 90%+ |
| **AI Assistant** | Individual | Chat Mode | **~80%** | F2 streaming + F7-003 (god-level UI/UX) + native-chat-everywhere surfaces → 90%+ |

> "Today's maturity is uneven, and that is honest." All three faces ship from the same engine; they mature in parallel, not in sequence.

---

## 3. Current State — Ground Truth (Sprint 232, 2026-06-05)

- **Sprint 226–232 + Dashboard re-theme** (2026-06-04/05) — ✅ **DONE** (Brain-integrity + AS-1/5/6 + memory-loss kapanış + dashboard teal/gold):
  - **226** Autonomous Runtime Wire (AS-6, F3-009) 7/7 · **227** S-INT Brain integrity (rubric/export/decay) 4/4 · **228** autonomous finalize (i18n+manifest+doc+e2e) 5/5 · **229** AS-5 MCP-client P1 (broker + `deckent mcp` + REPL `/mcp`) 5/5 · **230** AS-1 Platform (**Windows-backend F3-010**, **models.dev-wire F1-011**, docker-monitor, dormant-wire) 8/8 · **231** Brain convergence (exit-0-no-result uniform disk-verify + debt-guard + decay-floor + handoff-recovery) 4/4 · **232** Memory-loss **5-katman kökten kapanış** (decay-config-wire + learnings-decay-exempt + abort-`>=` + WAL-safe-backup CLI + ci-sim-SIGINT + boş-DB-export-guard) 7/7.
  - **Dashboard re-theme FAZ 1-3b** (el-kodu): Decko teal/gold tema + Hanken/IBM Plex fontlar + WorkerCard restructure (top-bar+gold-tier+provider-bar) + terminal-dock tema/maximize; 796 dashboard test yeşil. **Kalan FAZ 5:** mockup-fidelity layout/polish (stat-row, header, Decko-mascot, density). Kaynak: `docs/design/web-console/`.
  - **§4G human-interaction-wire:** WIRE·APPROVE·MSG·CONFIRM·BOT epic'leri el-kodlandı (notify→CLI/MCP/terminal + Telegram bot inbound approve/reject canlı-doğrulandı). **Kalan:** REPL·DASH·PLANOBS·DEFER.
  - **🔴 Memory-loss saga:** 226+231'de catastrophic decay-wipe (memory 91→1, kök: decay-config-geçmiyor + not-decay-exempt + abort-`>`); **232 5-katman fix kapattı** (build-doğrulaması bekliyor). Detay §4F.
- **Sprint 224** (**224**) — ⚠️ **IN PROGRESS** (Native CLI Parity F11 — claude-code/codex/gemini kalitesi; **ADR-086** accepted). **Landed (PTY+disk-verified):** terminal-mode input (224-001), real token-streaming (224-011), kraken-renkli+sabit-fiil ticker (224-014/018), agentic-DO tool-exec+confirm+wire (224-005/006), permission memory `.deckent/settings.local.json` (224-016), pinned-input-bar (F11-007), interaktif `/` menü (F11-008), markdown-stream (F11-009), token-sayaç+süre (F11-010), canlı-aktivite (F11-011), tıklanır-path (F11-013), paste-coalescer (224-004). **Dogfood dalgası (deckent paralel):** AI plan-mode dürüst-hata fix (224-015), `/nervous` wire (224-008), banner (224-009), nervous re-enable (224-010), smoke-harness (224-027). **🆕 Ink (React-for-CLI) REPL pivotu** — `ink ^7.0.5`+`react ^19.2.7`, yeni `src/cli/repl/` modülü, manuel-TUI'yi supersede eden kanonik render yolu (F11-016, **ADR gerekli**, stabilize oluyor). **Yan-iş:** retro/mem `## Gains` + `Delivered:` (hafıza geriye-dönük zenginlik, `c0f96a1a`). **KALAN:** F11-012 UTF-8/Türkçe encoding-audit, F11-014 multi-provider parity, Ink stabilizasyon. CI yeşil KORUNDU.
- **Sprint 222–223** — ✅ **DONE** (Persistent-Session Wire + GUI-UX + Nervous Non-Blocking — **ADR-085** accepted). 222: persistent-session module + slash/status-line/streaming wire; nervous OOM-NO_GO'lar 223'e taşındı. 223: persistent-session `entry.ts` WIRE (2. mesaj <1s), layout (`›`/`● deckent`)+spinner+slash dispatch (PR #18 main), nervous panic-gate non-blocking + observer + finalizer recover.

- **Sprint 221** (**221**) — ✅ **DONE** (REPL Tam-Kapsam + Provider-Parity + Local-Model-Foundation — **ADR-083** accepted). DALGA A: handleReplCommand canlı slash-wire (221-001); agentic-dispatch wire classifyAgenticIntent/dispatchAgenticIntent (221-002); buildSlashRegistry dinamik katalog (221-003); renderStatusLine config-driven status-line (221-004). DALGA B: ollama-local+openai-compat REPL round-trip zero-API (221-005); resolveChatAdapter 5-fleet provider-parity (221-006); resolveChatProvider fallback chain + net-hata sözleşmesi (221-007). DALGA C: dispatchEnterpriseSlash REPL→enterprise köprü (221-008); resolveChatMode user/enterprise mod (221-009); CHAT_CONFIG_SCHEMA 3-katman merge (221-010). DALGA D: ChatPage streaming+slash parity (221-011); Layout chat-first (221-012). DALGA E: CLI argüman-routing fix (221-013); smoke field propagation hotfix (221-014); ADR-083+MASTER-PLAN (221-015). **`deckent` REPL tam-kapsamlı**: canlı slash-komut + doğal-dil→aksiyon + status-line + her-provider doğru + ollama-local zero-API + user/enterprise mod + özelleştirilebilir. Local-model foundation (yarın deckent-AI altyapısı). CI yeşil KORUNDU.

- **Sprint 220** (**220**) — ✅ **DONE** (Native-LLM-Wire + Nervous-Activation + Dashboard-v2 Canlı — **ADR-082** accepted). DALGA A: Native REPL gerçek LLM wire — config-driven `chat_provider ?? brain_provider ?? 'claude'` fallback (220-001); `chat --native --once/--message` headless flag (220-002); agentic dispatch canlı (220-003). DALGA B: Dashboard tam-canlı — `WorkerGrid.tsx` SSE real-time (220-004); `StatusPage.tsx` done→done render (220-005); `RefreshButton.tsx` manuel refresh+cooldown (220-006); `ChatPage.tsx` gerçek `/api/chat` round-trip+akan (220-007). DALGA C: `coverage-endpoint.ts` + `/api/coverage` (220-008); `DebtPage.tsx` filtre dropdown (220-009); `EnterprisePage.tsx` auth-wire+alert-dedup+provider-neutral (220-010). DALGA D: Nervous Faz-1 — `src/nervous/bootstrap.ts` `createNervousSystemIfEnabled` (220-011); 8 low-risk action-handler (220-012); `.deckent/config.json` `enabled:true` (220-013). DALGA E: ADR-082 + MASTER-PLAN güncel (220-015/016). **`deckent` GERÇEKTEN konuşur** (skeleton değil). Nervous aktif. Dashboard god-level tamamlandı. CI yeşil KORUNDU.

- **Sprint 219** (**219**) — ✅ **DONE** (Native Agentic Deckent — **ADR-081** accepted). DALGA A: bare `deckent` → agentic REPL (219-001 `entry.ts` `shouldLaunchDefaultRepl`); `runChatNativeLoop` round-trip run-proven (219-002); REPL UX god-level readline/history/Ctrl-C (219-003). DALGA B: agentic tool-use (219-004 natural-lang→MCP dispatch); riskli aksiyon onay kapısı (219-005); REPL oturum persist/resume memory.db (219-006). DALGA C: F2-007 token-streaming SSE `streamChatMessage` + `/api/chat/stream` + dashboard `chat-stream-client.ts` (219-007/008). DALGA D: dashboard nav tek-kaynak + RENDER-based 10-link test (219-009); cache-bust e2e smoke (219-010). DALGA E: `docs/MASTER-PLAN-TR.md` (219-011) + ADR-081 (219-012). DALGA F: `blueprint.md` baştan-aşağı güncel (219-013); `autonomous-runtime.ts` iskeleti (219-014). DALGA G: `routeTaskV2` plan-time wire (219-015); Smoke field propagation task-builder (219-016). **F2 → ~95%, F7 → ~95%, `deckent` = claude gibi. CI yeşil KORUNDU.**

- **Sprint 218** (**218**) — ✅ **DONE** (Dashboard God-Level — **ADR-080** accepted). DALGA ÖN: git self-mutation guard (ADR-039 `detectDeckentRepo` NO-OP guard, commit 64c97c2f). DALGA 0: sprint-start detach (`sprint-job-runner.ts` `startSprintDetached`, serve event loop no longer blocked, commit 9e2e7d34). DALGA A: 4 hollow pages wired to App.tsx routes + Sidebar.tsx links (EvolutionPage/NervousPage/EnterprisePage/MemoryExplorerPage now reachable); ChatPage real round-trip (`POST /api/chat` Bearer token, not status-only); DirectivesEditor component. DALGA B: god-level UI (`use-live-data.ts` SSE/stale-while-revalidate, `theme.ts` centralised tokens, `Layout.tsx` responsive shell). DALGA C: ADR-080 + dashboard user guide + e2e surface tests. **F7-003/006/009/010 run-proven DONE (Sprint 218).** CI yeşil KORUNDU.

- **Sprint 216** (**216**) — ✅ **DONE** (Proof-of-Function DoD, **ADR-079** accepted; implementation landed Sprint 216). `isUserSurfaceTask` Tier-0/Tier-1 classification + in-sprint Smoke gate (`proof-of-function.ts`) + routing surface bonus + `task-builder` Smoke parse + `test:e2e-surfaces`. **serve dashboard F7-001 FIXED** — localhost API-token auto-mint + inject → `/api/status` 200 (run-proven, not mocked). ⚠️ **Incident:** Sprint 216's uncommitted code was wiped by deckent's worker-spawn `git reset --hard`/stash (Sprint 177 rollback) when sprint-217 launched from the dashboard; reconstructed + committed Sprint 218. **Root bug → Sprint 218 P0:** worker-spawn must not reset the deckent-dev tree (ADR-039 self-modifying exemption).


- **Sprint 211 closed:** 16/16 DONE, 0 tech-debt, 0 NO_GO, 16m19s.
- **Sprint 212 closed:** 15/15 DONE — F5 evolution crowning (6 dormant modules → live callers), routing skew fix (skill→agent affinity signal), doc-reality sync (code-derived module counts), IDE extension scaffold.
- **Sprint 213 killed** — mass synthetic NO_GO due to auth-precedence bug (`spawn-backend-docker.ts` forwarding `ANTHROPIC_API_KEY` unconditionally into containers → CLI API mode → Tier-1 timeout). All tasks cleared; Sprint 214 relaunched with `env -u ANTHROPIC_API_KEY`.
- **Sprint 214 closed:** 20 tasks — P0 auth-precedence fix (ADR-076), user-facing surfaces (serve token-inject + Path A embedded chat), IDE extension real impl (command palette, sidebar, statusbar, settings bridge), F1-009 8-provider (OpenAICompatibleAdapter → DeepSeek/Qwen/GLM, dynamic ProviderName; adapter built but NOT yet bootstrap-registered — dormant, Sprint 215 P0; ADR-077), F7-003 UI/UX pass, chat CLI UX. ADR-076 + ADR-077 filed. (Sprint 215+ can launch without `env -u ANTHROPIC_API_KEY`.)
- **Sprint 215 closed:** 21 tasks (6 waves) — DALGA 0: CI-hermeticity permanent (`test:ci-sim` clean-state reproducer, `lint-test-hermeticity.mjs` guard, `tests/helpers/sandbox-home.ts` HOME isolation, karpathy-discipline Test Hermeticity anchor; ADR-078 Part A). DALGA A: F1-009 bootstrap-register DONE (`provider.ts` registers DeepSeek/Qwen/GLM when keys present; `provider-overflow.ts` subs→API overflow; `task-router.ts` per-worker auth uniform; 8-provider smoke validated; ADR-078 Part B). DALGA B: Dashboard god-level (AppShell responsive/dark/light shell, terminal-sessions multi-session/history/clipboard, EnterprisePage tenant/RBAC/audit UI, MemoryExplorerPage FTS5+ADR timeline). DALGA C: Evolution moat visible (EvolutionPage genealogy+retirement+prompt-diff, `evolution-endpoint.ts` 3 REST endpoints, NervousPage pending-approval/panic UI; `promotion-pipeline.ts` closed-loop identity-mutation `applyAdaptation` live; ADR-078 Part C+D). DALGA D: Routing fix (frontend-design→frontend-designer affinity, diversity guard extended), doc-drift sync (update-readme-stats.mjs, module-count generator). DALGA E: ADR-078 + karpathy-discipline rule. **CI yeşil KORUNDU, 0 failures.** ADR-078 filed.
- **Full test suite (measured):** 18,606 passed / 58 skipped (1,052 files) + dashboard 570 passed. **0 failures.** `tsc --noEmit` clean.
- **Shipped engine:** PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP lifecycle; **Sprint Mode + Task Mode dual-orchestration (ADR-042 — `deckent start` full sprint / `deckent run` single task)**; 3 backends (docker/tmux/subprocess); 15 agents + 21 skills; routing-engine v2 + skill→agent affinity signal; Memory V2 (SQLite FTS5, dual-layer i18n); 32 MCP tools + 8 resources; 49+ CLI commands; React dashboard (7 pages) + embedded web terminal; VS Code extension (real impl: commands/sidebar/statusbar/settings).
- **Provider-free:** 100% of P0 (Ollama bootstrap, claude-hardcode cleanup, provider-agnostic defaults). **Sprint 214 adds:** OpenAI-compatible HTTP adapter + PROVIDER_MAP built; bootstrap-register pending → dormant (F1-009 ~60%, Sprint 215 P0).
- **F5 wire-gap closed (Sprint 212):** 6 evolutionary modules now have real runtime callers — `prompt-evolution`, `adaptive-agent`, `prompt-rollback`, `agent-genealogy`, `agent-retirement`, `specialization-drift`. Self-improvement loop is live. ADR-075.
- **Known debt carried forward:**
  - **Doc-code drift (partial):** managed-docs generator now code-derived for module counts; README badge and "96% context reduction" claim still need verification (§7 W-H).
  - **F2 streaming:** Path A embedded chat backend connected; real streaming (F2-007) remains post-beta.
  - **F7-003 UI/UX:** Layout responsive/dark-light pass done (Sprint 214); full god-level redesign remains Sprint 216.

> ### ⚠️ User-Visible Reality vs Wiring % — DASHBOARD RUN-AUDIT (Alperen 2026-06-01, evidence-based)
> The F1–F10 percentages measure **internal wiring**, NOT **end-to-end user-working UX**. Real-binary audit on 2026-06-01:
> - **`npx deckent serve` API/token** — ✅ **RUN-PROVEN (Sprint 216-006):** localhost auto-mints API token + injects `__DECKENT_API_TOKEN__` → `/api/status` 200 (Bearer), real data; 401 without (auth enforced). `/api/evolution/genealogy`, `/api/memory/search` 200.
> - **🔴 P0 — sprint-start FREEZES the dashboard:** starting a sprint from the UI runs `runSprint` in the same serve process → event loop blocks → HTTP stops → UI hangs in skeleton-loading. **Fix: detach sprint-start from serve** (child-process/fire-and-forget). *(serve log: `Sprint started via dashboard` → freeze.)*
> - **🔴 Chat hollow** — only answers `status` intent; no real conversational round-trip (216-008 backend exists, ChatPage not wired).
> - **🔴 Missing pages** — sidebar shows 5 (Dashboard/History/Memory/Config/Chat); **Evolution/Nervous/Enterprise (Sprint 215 "DONE") are NOT in sidebar/route** — those F7-006/009/010 DONEs are hollow.
> - **🎨 Design must improve** — current UI is functional-skeleton, not god-level. F7-003 visual/UX redesign (modern, native-speed, zero freeze) is core Sprint 217 work, not cosmetic.
> - **✅ Real:** terminals work; runs from project dir; plan+spawn mechanics work (217-001 docker worker spawned healthy).
>
> **Developer face (Sprint Mode) genuinely works** (216 sprints of dogfood). serve API/data-load is run-proven; the **dashboard is only partially user-working** — full fix is **Sprint 217** under the Proof-of-Function DoD (§11, real browser/HTTP `Smoke:` proof; now live in code so these can't be marked DONE without a real run). Tracked: memory `project_dashboard_realrun_findings`.

---

## 4. Feature Status Matrix (F1–F7, reconciled)

### F1 — Provider Independence — **~95%**
| ID | Item | Status |
|----|------|--------|
| F1-001/002/003/006/007 | Ollama bootstrap, provider-agnostic defaults, claude-hardcode cleanup, token throttle | ✅ DONE |
| F1-004 | Docker provider-aware CLI invocation (binary select + auth + build-arg) | ⬜ P1 |
| F1-005 | Dockerfile.worker multi-CLI (build-arg opt-in) | ⬜ P1 (depends F1-004) |
| F1-008 | **Naive (conversational) chat mode** + intent classifier (CASUAL vs TASK→MCP tool invoke) | ✅ DONE — `src/cli/commands/chat.ts` (`classifyChatIntent`, `buildNaiveSystemPrompt`); delegates tool dispatch to host CLI via MCP auto-attach |
| F1-009 | **8-provider simultaneous fleet** (Alperen 2026-06-01) — run Claude+Gemini+Codex subscriptions + ≥5 API providers (DeepSeek, Qwen, GLM, …) + local Ollama **at the same time**, coordinated | ✅ **~95% (Sprint 215)** — `OpenAICompatibleAdapter` built (fetch `/chat/completions`; DeepSeek/Qwen/GLM presets); `PROVIDER_MAP` + `ProviderName` widened (ADR-077). **Sprint 215:** `provider.ts` bootstrap now calls `registerProvider` when DEEPSEEK/DASHSCOPE/ZHIPU keys present → DeepSeek/Qwen/GLM are runtime-selectable (wire-gap closed). `provider-overflow.ts` `resolveWithOverflow` (subs→API tier-preserving overflow). `task-router.ts` per-worker auth/provider resolution uniform across Sprint/Task/Process. 8-provider smoke validated (`multi-provider-fleet-smoke.mjs`). ADR-078 Part B. **Remaining:** per-provider model-catalog model IDs, e2e mixed-provider sprint test with live keys. |
| F1-010 | **Provider/auth load-balancing** — when a subscription hits its rate/quota limit, overflow that worker to an API provider automatically (subs *and* API together for max throughput) | ⬜ proposed — extends F6 authMode; today `authMode` is a static per-task field, no dynamic subs→api overflow orchestration |
| F1-011 | **models.dev native wire** — make `PROVIDER_MODEL_MAP` dynamic so live-catalog models route correctly | ✅ **DONE Sprint 230 (230-002)** — `PROVIDER_MODEL_MAP` statik→dinamik getter + adapter guard'ları registry-lookup (önceki tanı:) — `PROVIDER_MODEL_MAP` (`task-types.ts:33-46`) is computed STATICALLY at module-load; `bootstrapFromCatalog` (`entry.ts:771`, preAction) fetches models.dev AFTER → map never refreshes; `ModelType` union (`task-types.ts:10-19`) hardcoded + adapter guards (`isOpenAIModel` `codex.ts`) read the stale snapshot → any non-builtin-13 models.dev id is **rejected on the provider-selection path**. Fix: static→dynamic getter (live `modelRegistry.getByProvider()`), loosen type-guards to registry-lookup. Builds on F6-005 live catalog. → **AS-2 Faz 3** (§4A). |
| F1-012 | **Config-driven provider registry (any-key, zero-hardcode)** — `.deckent/config.json providers[]` declares ANY provider (`{name, kind: cli\|openai-compat\|bedrock\|ollama, baseURL?, apiKeyEnv?, region?, models:[{id,tier,apiId?}]}`); bootstrap registers dynamically; `ProviderName` union → registry-validated string; model-registry runtime-extends (tier+equivalence from config) | ⬜ **AS-2 Faz 1 (§4A)** — today registration is hardcoded in 3 places (`provider.ts` `adapterFactories:759` / `openaiCompatCandidates:823` / `applyDeckSecretsToEnv:659`); adding a provider = code change + `ProviderName` union widening. De-hardcodes all three. |
| F1-013 | **Agentic HTTP-worker** — CLI-less providers run REAL sprint workers via a headless agentic loop (subprocess node entrypoint) driving `adapter.send()` + the existing `chat-tool-exec` layer (auto-approve-in-scope), writing `.hb`/`.result`; reuses subprocess backend lifecycle | ⬜ **AS-2 Faz 1 (§4A)** — today `OpenAICompatibleAdapter.spawn()` THROWS (HTTP-only) and `ollama.spawn()` is a single-shot `curl /api/generate` (no tool loop) → API/HTTP providers can chat but **cannot run agentic workers**. Core enabler of a genuine multi-provider fleet. |
| F1-014 | **Per-worker auth isolation contract (load-bearing)** — each worker env gets ONLY its provider's credential; subscription Claude worker gets NO `ANTHROPIC_API_KEY`; zero cross-leak; per-worker non-leak test | ⬜ **AS-2 all phases (§4A)** — Sprint 213 was KILLED by the inverse (unconditional `ANTHROPIC_API_KEY` → API-mode → mass synthetic NO_GO; ADR-076, `feedback_container_auth_precedence`). `applyDeckSecretsToEnv` already returns per-provider override maps → make non-leakage a tested contract. |
| F1-015 | **Bedrock + non-OpenAI-wire native adapters** — Amazon Bedrock via hand-rolled SigV4 (Node `crypto`, no AWS SDK → ADR-010 preserved); optional Vertex | ⬜ **AS-2 Faz 4 (§4A)** — no Bedrock adapter today (only `pricing-updater.ts` data ref); Bedrock uses AWS SigV4, not OpenAI `/chat/completions`. |

### F2 — Native Chat — **~95%**
| ID | Item | Status |
|----|------|--------|
| F2-001..003 | Tool-use loop, memory integration, streaming+multi-turn+resume | ✅ DONE |
| F2-004 | Real ProviderAdapter round-trip (subscription CLI spawn, live registry) | ✅ DONE (Sprint 211) |
| F2-005 | MCP tool dispatch (deckent_status/memory_query feedback) | ✅ DONE (Sprint 211) |
| F2-006 | Session persist + resume (memory.db) | ✅ DONE (Sprint 211) |
| F2-006d | Session persist + **`deckent chat --resume <sessionId>`** | ✅ DONE — `ChatTurn` (session_id/turn_index/role/content/timestamp) via `MemoryStore.appendChatTurn`/`getChatHistory` with FTS5 `chat:<sessionId>` tags; CLI renders recent turns before launch |
| F2-007 | **Streaming live** (real provider streaming, not mock) | ✅ **DONE (Sprint 219)** — `src/api/chat-stream.ts` `streamChatMessage(message, adapter)` → `AsyncGenerator<ChatStreamEvent>` (chunk + done events); `adapter.stream` fallback; `/api/chat/stream` SSE endpoint wired in `server.ts`. Dashboard `chat-stream-client.ts` tüketir. ADR-081. |
| F2-008 | **Native SDK round-trip** (true standalone, Path C) | ⬜ Q3 2026 |
| F2-009 | **Path A embedded dashboard chat** (host-CLI-free, Sprint-214) | ✅ DONE (Sprint 214) — `chat-backend.ts` bridges browser messages to server-side ProviderAdapter; dashboard ChatPage wired; ADR-076 Part C |

### F3 — Process Mode — **~85%**
| ID | Item | Status |
|----|------|--------|
| F3-001/002/003/005/006/007 | Tenant context, scheduled flows, event triggers, flow runtime, self-dispatch guard | ✅ DONE |
| F3-004 | SessionBackend k8s pod-exec | ⬜ P3 (post multi-tenant Phase 2) |
| F3-008 | **Workflow Composer** — declarative/visual multi-step flow definition on top of scheduled-flow + flow-registry | ⬜ proposed (Copilot analysis, Sprint 212) — flows exist as code; a composable DAG/visual editor is the new layer |
| F3-010 | **Windows-native backend** — `resolveBackend` platform branch + docker POSIX-sleep removal | ✅ **DONE Sprint 230 (230-001)** — win32→subprocess guard + Atomics.wait (POSIX-sleep removal) (önceki tanı:) — `resolveBackend('auto')` → `'docker'` with **no `process.platform` check** (`spawn-backend.ts:253-256`); docker spawn uses `spawnSync('sleep')` (`spawn-backend-docker.ts:787-790,829` + shell `sleep 15` `:456`) → breaks on win32. Fix: `win32→subprocess` branch + Node-timer instead of POSIX sleep. Backend 4-method contract unchanged. Closes the cross-platform gap (§9 macOS/Linux/WSL2 → +Windows-native). |
| F3-009 | **Autonomous continuous runtime** (Alperen 2026-06-02) — the AI-System-Worker north star: a **long-lived, event-driven, authority-bounded** mode that goes BEYOND on-demand sprints. Installed into an enterprise it watches/analyzes (orders, MRP, customer requests) and **takes action within RBAC + approval limits** — not a 20-min sprint but a persistent agent. Cycle: trigger → analyze → ADR-037 authority check → nervous approval gate → execute → audit | ⚠️ **~40% — foundation only, full mode NOT wired.** Done: `self-dispatch.ts` (`SelfDispatchPolicy`/`evaluateDispatch`, `requiresApproval=true` guard — does NOT self-run yet), `flow-runtime.ts` (daemon tick-loop), `autonomous-runtime.ts` **skeleton** (Sprint 219-014, DI-shaped single cycle). **Missing (the real wire):** `autonomous-runtime` → `authority-enforcer.checkAuthority` + `nervous/executor` approval + `action-registry` execute + scheduled-flow trigger (the intended Sprint-220 wire **never landed** — Sprint 220 diverged to Nervous Faz-1 + LLM-wire). Docker timeout already raised to 8h for long autonomous jobs. Builds on F3 + F8 Capability Broker (ERP read→write) + ADR-040 nervous approval. **Refs:** memory `project_deckent_everyone_everywhere`, `feedback_scale_up_autonomous`, `project_deckent_runtime_ecosystem`. **Note:** "autonomous mode" is a PRODUCT goal — it does not change the human-approval gate on *me* starting sprints. |

### F4 — Enterprise — **✅ 100%**
| ID | Item | Status |
|----|------|--------|
| F4-001 | RBAC enforcement (`enforceRbac` runtime) + grant/revoke CLI | ✅ DONE (Sprint 207/208/211) |
| F4-002 | Audit compliance export (JSON+CSV+HMAC chain) | ✅ DONE (Sprint 211) |
| F4-003 | Rate/resource limit per-tenant (token-bucket) | ✅ DONE (Sprint 211) |
| F4-004 | Enterprise config schema (opt-in) | ✅ DONE (Sprint 208) |
| — | SSO/OIDC depth, SIEM forwarder, compliance report generator | ⬜ optional post-212 |

### F5 — Evolutionary Architecture — **✅ ~90% (wire-gap closed Sprint 212)**
| ID | Item | Status |
|----|------|--------|
| F5-001 | prompt-evolution → sprint-reporter (rule-based suggestions in retro) | ✅ DONE (Sprint 212 — `collectPromptEvolutionSuggestion` in `sprint-reporter.ts`) |
| F5-002 | adaptive-agent → outcome-tracker (skill add/remove suggestions) | ✅ DONE (Sprint 212 — `adaptAgentRuntime` called in `outcome-tracker.ts`) |
| F5-003 | cross-sprint-analyzer (trend report) + `deckent evolve` CLI | ✅ DONE (genuinely wired) |
| F5-004 | **Real runtime callers** (sprint lifecycle invokes F5-001/002/005) | ✅ DONE (Sprint 212 — ADR-075 — 6 external callers wired) |
| F5-005 | **Dormant evolution modules** → real callers (E-2 `prompt-rollback.ts`, E-4 `agent-genealogy.ts`, E-5 `agent-retirement.ts`, E-6 `specialization-drift.ts`) | ✅ DONE (Sprint 212 — all 4 modules now have external callers in `promotion-pipeline.ts` and `sprint-reporter.ts`) |
| F5-006 | **Evolution visibility** — retro "Next Sprint Behavior Changes" section | ✅ DONE (Sprint 212 — `sprint-retro-writer.ts` behavior-changes section) |
| F5-007 | **Evolution dashboard page** (`/evolution`: genealogy tree + retirement timeline + prompt-diff viewer) | ⬜ Sprint 216 (backend ready, no frontend layer) |
| F5-008 | **Active identity-mutation loop at scale** (Alperen 2026-06-01) — when an agent's success rate drops, actually mutate/refactor its identity (prompt+skill repertoire), not just *suggest*. Toward million customizable, evolvable agents/skills across million environments | ⚠️ **~70% (Sprint 215)** — `promotion-pipeline.ts` extended with `applyAdaptation`: low-success → adaptive-agent proposal → apply (prompt rewrite + skill delta) → `recordGenealogy` (parent/child versioned variant) → nervous checkpoint if `requiresApproval`. Closed-loop is live. **Remaining (post-beta):** A/B variant scoring integration (routing engine picks winner), mutation-frequency rate-limiter (max 1/3 sprints per agent), scale validation across 1000+ agent variants. ADR-078 Part C. |

### F6 — Auth Flexibility — **~50%**
| ID | Item | Status |
|----|------|--------|
| F6-001 | Per-task `- Auth:` override | ⚠️ partial — `readTaskAuthMode` exists; DIRECTIVES `Provider:` parsing + fallback chain (`resolveProviderWithFallback`/`getEquivalentModel`) wired w/ `tests/core/provider-fallback.test.ts`; **missing:** e2e mixed-provider sprint test (Claude brain + Codex worker + Gemini auditor, real MCP dispatch) |
| F6-002 | Hybrid mode (subscription brain + API/local workers) | ⚠️ config exists, not fully wired |
| F6-003 | Auth matrix test (4 combinations) | ⬜ |
| F6-004 | API real activation + tier-aware throttle | ⬜ **POST-BETA** (Tier-1 30K tok/min cap; subscription-only during beta) |
| F6-005 | **Live model catalog** (`model-catalog.ts` models.dev fetch + 24h cache + bundled fallback; `deckent models list/refresh/tier`) | ✅ DONE — 13 bundled models as offline fallback, overlaid by live catalog via `mergeApiIdOverrides`; ADR-023 tier routing preserved |
| F6-006 | **Per-worker auth/provider in task JSON across all 3 modes** (Sprint/Task/Process) — premium architecture so each worker picks subs-or-API-or-local correctly | ⚠️ partial — task JSON `authMode` field exists (api-surface.md); needs first-class per-worker `provider`+`authMode` resolution wired uniformly across Sprint/Task/Process mode + paired with F1-010 overflow |

### F7 — Dashboard & Control Plane — **~95%**
| ID | Item | Status |
|----|------|--------|
| F7-001/002 | API auth fix (localhost auto-inject) + live data parity (SSE/WS) | ✅ DONE |
| F7-005/008 | Sprint control panel + onboarding wizard | ✅ DONE |
| F7-003 | **UI/UX god-level redesign** (modern, responsive, dark/light, info architecture) | ✅ **DONE (Sprint 218, run-proven)** — `Layout.tsx` god-level shell (CSS grid, responsive breakpoints, meaningful loading-state not skeleton); `theme.ts` centralised design tokens (dark/light, color/spacing/radius/shadow); `use-live-data.ts` SSE/stale-while-revalidate (no freeze/skeleton-thrash, graceful reconnect). ADR-080. |
| F7-004 | Terminal hardening (multi-session, history, copy/paste) | ⚠️ ~75% (Sprint 215: `terminal-sessions.ts` — multi-session list/switch, command history ring buffer, clipboard helpers, ADR-062 WS-gateway interface compat) |
| F7-006 | Enterprise view (multi-tenant, RBAC UI) | ✅ **DONE (Sprint 218, run-proven)** — `EnterprisePage.tsx` built Sprint 215; **wired to App.tsx route `/enterprise` + Sidebar.tsx link Sprint 218**. Previously hollow (page existed, no route/link). Now reachable. ADR-080. |
| F7-007 | Memory/ADR/debt explorer (FTS5 search, ADR timeline) | ✅ **DONE (Sprint 218, run-proven)** — `MemoryExplorerPage.tsx` built Sprint 215; **wired to App.tsx route `/memory-explorer` + Sidebar.tsx link Sprint 218**. Previously hollow. Now reachable. ADR-080. |
| F7-009 | **Nervous System UI** — `NervousPage.tsx` + pending-approval / panic-guard badge | ✅ **DONE (Sprint 218, run-proven)** — `NervousPage.tsx` built Sprint 215 with real `POST /api/nervous/*` (pending-approval, accept/reject, panic badge, 30s poll); **wired to App.tsx route `/nervous` + Sidebar.tsx link Sprint 218**. Previously hollow (page existed, no route/link). ADR-080. |
| F7-010 | **Evolution dashboard page** (`/evolution`: genealogy tree + retirement timeline + prompt-diff viewer) | ✅ **DONE (Sprint 218, run-proven)** — `EvolutionPage.tsx` (3 tabs: genealogy tree, retirement timeline, prompt-diff table) + `evolution-endpoint.ts` (3 GET endpoints); **wired to App.tsx route `/evolution` + Sidebar.tsx link Sprint 218**. Previously hollow. ADR-080. |
| F7-011 | **Dashboard nav tek-kaynak + 8-sayfa RENDER-based garanti** | ✅ **DONE (Sprint 219)** — `Sidebar.tsx` `navItems` single-source export; `Layout.tsx` import eder (duplikasyon kaldırıldı). RENDER-based test: gerçek React render → DOM'da 10 link assert (kaynak-grep değil). Cache-bust e2e smoke `scripts/dashboard-e2e-smoke.mjs`. ADR-081. |

### F8 — Capability Broker — **⬜ not built (proposed)**
> *Source: Copilot enterprise-vision analysis (Sprint 212), DNA-filtered & code-verified. A `capability` abstraction above skills/connectors so an agent calls `mail.search` without knowing the backend.*

| ID | Item | Status |
|----|------|--------|
| F8-001 | Capability abstraction layer — `capability.invoke(name, args)` resolving to one of N backends (`mail.search` → IMAP / Graph / Exchange) | ⬜ proposed — no `CapabilityBroker` in `src/`; today routing is provider-level (`provider.ts`) + skill/tool-level, not capability-level |
| F8-002 | Capability registry + per-capability backend selection (config/availability driven) | ⬜ proposed — extends connector-pool pattern (`src/connectors/connector-pool.ts`) |
| F8-003 | Capability-scoped permissions (`workbook.read` style, least-privilege per agent) | ⬜ proposed — finer-grained than current scope.filesWrite / ADR-037 RBAC |

### F9 — MCP Client / Dynamic Discovery — **⬜ not built (proposed, high-value)**
> *Source: Copilot analysis. Today Deckent is an MCP **server** (exposes 32 tools); it cannot **consume** external MCP servers. Making it an MCP **client** opens the whole MCP ecosystem to Deckent agents — DNA-aligned (self-hosted, no vendor lock).*

| ID | Item | Status |
|----|------|--------|
| F9-001 | MCP client — connect to external MCP servers, list/call their tools from within a sprint/chat | 🔜 **AS-5 (§4C)** — central `McpClientBroker` (`src/mcp-client/`, new); SDK `Client` already available (`@modelcontextprotocol/sdk ^1.27.1`, no new dep); stdio + StreamableHTTP/SSE + OAuth; Claude-parity `deckent mcp add/list/remove` + 3-scope `.mcp.json`. |
| F9-002 | Dynamic tool discovery — register discovered external tools into the routing/tool registry at runtime | 🔜 **AS-5 (§4C)** — `tools/list`+`resources/list`+`prompts/list` on connect → namespaced (`<server>__<tool>`) runtime registration; reconnect refresh. |
| F9-003 | Trust/approval gate for external MCP tools (risky external calls → checkpoint, reuse nervous approval) | 🔜 **AS-5 (§4C)** — broker single choke-point: RBAC (ADR-037) + risk-tagged approval (tool-permissions / nervous, NO auto-approve) + audit (event-stream) + worker scope. Consolidates F10-002. |

### F10 — Policy Engine (maturation) — **⚠️ partial (proposed unification)**
> *Source: Copilot analysis. Unify the three existing decision surfaces into one declarative, self-hosted policy engine (OPA-style) — not a new dependency, a consolidation.*

| ID | Item | Status |
|----|------|--------|
| F10-001 | Unify RBAC (`rbac.ts`/ADR-037) + activation rules (`activation-engine.ts`) + condition evaluator (`condition-evaluator.ts`) under one policy model | ⚠️ pieces exist, not unified |
| F10-002 | Risk-tagged operation gating (`shell.exec`, `mail.send`, `erp.write`, `filesystem.delete` → mandatory approval) | ⬜ proposed — extends checkpoint/nervous approval with operation-risk tags |

### F11 — Native CLI Parity (claude-code / codex / gemini quality) — **⚠️ in progress (Sprint 222–224)**
> *Alperen 2026-06-02/03: `deckent` REPL must offer the FULL feature set + polish + speed of claude-code / codex / gemini CLIs — multi-model & multi-provider, native, fast. The bare `deckent` agentic REPL is the individual-face flagship surface.*

| ID | Item | Status |
|----|------|--------|
| F11-001 | Persistent warm session (no per-turn cold-start; 2nd msg <1s) | ✅ DONE (Sprint 223, `createPersistentClaudeSession` wired) |
| F11-002 | Terminal-mode input — line-editing, ↑/↓ history, ←/→ cursor, Del (no raw escape leak) | ✅ DONE (Sprint 224-001, recovery branch) |
| F11-003 | Real token-by-token streaming (claude `stream_event` envelope unwrapped) | ✅ DONE (Sprint 224-011, recovery branch) — was dumping whole reply (chunky/slow) |
| F11-004 | Thinking indicator — kraken-brand `● deckent · <fiil>…`, fixed-per-prompt verb + braille | ✅ DONE (Sprint 224-014/018, recovery branch) |
| F11-005 | Agentic-DO — own tool layer (write/edit/read/bash), provider-agnostic `<deckent_tool>` protocol, confirm-gated | ✅ DONE (Sprint 224-005/006/wire, recovery branch) |
| F11-006 | Permission memory — `.deckent/settings.local.json` `permissions.allow` (claude-code style, 3-way y/a/N) | ✅ DONE (Sprint 224-016, recovery branch) |
| F11-007 | **Pinned input bar** — prompt FIXED at bottom while tokens stream ABOVE it (claude-code render loop) | ✅ **DONE (Sprint 224)** — manual scroll-region TUI first (`8bf8cb40` true bottom-pinned + `5cd0836a` DEFAULT-ON, PTY-verified), now reimplemented in Ink `input-bar.tsx` (see F11-016, canonical path) |
| F11-008 | **Interactive `/` menu** — live popup menu as you type `/` (not just Tab-completion) | ✅ **DONE (Sprint 224)** — `2b59a0c9` keypress-wire (PTY-verified); `chat-slash-menu.ts` |
| F11-009 | **Markdown render during streaming** — `**bold**`, `` `code` ``, lists rendered inline (no literal `**`) | ✅ **DONE (Sprint 224)** — `59a11f44` streaming markdown + `f662e2b1` per-line render |
| F11-010 | **Token counter + elapsed time** per turn (claude `result.usage` + duration → `⏱ 3.2s · 1.2k tok`) | ✅ **DONE (Sprint 224)** — `30bf6685` per-turn token counter + elapsed footer; `status-renderer.ts` |
| F11-011 | **Live activity view** — show what it's DOING while thinking (tool calls / steps), not just a spinner | ✅ **DONE (Sprint 224)** — `1794f369` live tool-activity line |
| F11-012 | **UTF-8 / Turkish correctness** — no character shape corruption anywhere in the render path | 🟠 Sprint 224 — repro + encoding audit (`604bc197` fixed mid-word garble in streaming; full encoding audit still open) |
| F11-013 | **Clickable file paths** (VSCode terminal osc-8 / plain-path links) | ✅ **DONE (Sprint 224)** — `dc0be85f` clickable links/URLs/paths + final-line flush |
| F11-014 | **Multi-provider native parity** — claude/codex/gemini/ollama all give the SAME native REPL quality (not just claude) | 🟠 Sprint 224+ — codex/gemini per-turn today; persistent + agentic parity needed |
| F11-015 | MCP client in REPL (consume external MCP servers + own 32 tools agentically) | 🔜 ties to F9 |
| F11-016 | **Ink (React-for-CLI) REPL foundation** — pivot from manual ANSI/scroll-region TUI to a declarative React render tree (Static history + streaming + pinned input + queue + cursor/line-editing/history) | ⚠️ **IN PROGRESS (Sprint 224)** — `1f00af16` adopt Ink (`ink ^7.0.5` + `react ^19.2.7`) → `88f9ed7b` working Ink REPL → `64f80c80` cursor/edit/history/status-anchor → `524d30a8` chunked streaming + tool/change blocks → `814313b5` turn-end finalize. New module `src/cli/repl/` (`app.tsx`/`input-bar.tsx`/`run.tsx`). **Canonical render path** going forward — reimplements F11-007/009/010/011 in React; manual-TUI versions are the proving ground. **⚠️ Needs an ADR** (ink+react is a deliberate runtime-dependency decision vs ADR-010 single-dep-commander). Stabilization (cursor/queue/streaming cascade) still in flight. |

---

## 4A. AS-2 — Genuine Multi-Provider / Any-Key (per-worker mixed fleet)

> **Comprehensive design — 2026-06-04 (Alperen).** "multi-provider multi-model" **bir iddia olmaktan çıkar, gerçek olur**: herhangi model + herhangi API key (Amazon Bedrock, GLM, Groq, OpenRouter, … veya yalnız tek bir GLM key) deckent'te kolayca koşar; deckent sabit/hardcoded key ile çalışmaz — **her worker subs mı API-key mi neyle koşacaksa onu doğru ve İZOLE şekilde koşturur**. `deckent` REPL'i (copilot-benzeri) içinden model/provider geçişi yapılır; terminal-içi planlanan/koşan sprint'ler aynı registry+auth'u onurlandırır. **Bu, "sadece developer değil herkes için agentic-OS run ecosystem" (process/batch/otonom — AS-6 / F3-009) hedefinin ENABLER'ıdır:** otonom süreçler doğru per-worker provider/auth olmadan ölçeklenemez.

### 🔴 Yük-taşıyan kontrat — Per-worker auth izolasyonu
AS-2 baştan sona per-worker auth → sistemdeki en riskli yüzey. **Sprint 213 tam bunun tersi yüzünden ÖLDÜ** (container'a koşulsuz `ANTHROPIC_API_KEY` → Claude CLI API-moda → Tier-1 timeout → kitlesel sentetik NO_GO; ADR-076, `feedback_container_auth_precedence`). **Kontrat:** her worker env'ine **YALNIZ kendi provider'ının credential'ı**; subscription Claude worker'a `ANTHROPIC_API_KEY` **YOK**; GLM worker'a yalnız `ZHIPU_API_KEY`; **sıfır cross-leak**; per-worker non-leak testi zorunlu. (`applyDeckSecretsToEnv` zaten per-provider override map döndürüyor — bu sözleşmenin temeli.)

### Mimari bileşenler
1. **Config-driven provider registry (F1-012)** — `.deckent/config.json → providers[]`: `{name, kind: cli|openai-compat|bedrock|ollama, baseURL?, apiKeyEnv?, region?, models:[{id, tier, apiId?}]}`. Bootstrap dinamik kayıt; `ProviderName` union → **registry-doğrulamalı string**; model-registry **runtime-extend** (config modelleri + tier + equivalence merge — keyfi modelin routing/fallback'a yerleşmesi için tier şart). 3 hardcode listesi (`provider.ts` adapterFactories / openaiCompatCandidates / applyDeckSecretsToEnv) → config-türevli. *Zero-hardcode'un provider dilimi.*
2. **Agentic HTTP-worker (F1-013)** — CLI'si olmayan provider'lar için headless agentic loop (subprocess node entrypoint): registered `adapter.send()` + mevcut `chat-tool-exec` katmanı (auto-approve-in-scope), `.hb`/`.result` yazar; subprocess backend lifecycle (kill/heartbeat/scope) yeniden-kullanılır. *Bugün `OpenAICompatibleAdapter.spawn()` throw, `ollama.spawn()` tek-atış `curl` (tool-loop yok) → API/HTTP provider chat eder ama agentic worker koşamaz. Gerçek fleet'in çekirdek enabler'ı.*
3. **Per-worker auth resolver (F1-014)** — yukarıdaki kontrat; `.deck` + config + DIRECTIVES `- Provider:`/`- Auth:` katmanlı çözüm.
4. **REPL/terminal switcher parity** — `/model` `/provider` yeni registry'yi sürer; seçim chat `send()` + terminal-içi sprint spawn'da onurlanır (copilot-benzeri in-CLI geçiş). F11-014 native-parity ile hizalı.
5. **Failover wire (F1-010)** — `resolveWithOverflow` (subs→eş-tier API, bugün 0-caller) + `resolveProviderWithFallback` (unavailable→fallback, spawn/FIX'e wire değil) + 429/limit-detect→switch; spawn-error/FIX yoluna wire.
6. **models.dev dynamic (F1-011)** — `PROVIDER_MODEL_MAP` statik→getter; keyfi katalog modeli doğru route.
7. **Bedrock native (F1-015)** — elle SigV4 (Node `crypto`, yeni dep YOK → ADR-010); opsiyonel Vertex.

### Fazlama (Ollama-first, API-cost-deferred)
- **Faz 1 — Foundation + Ollama agentic-worker e2e (subscription-safe, ANAHTARSIZ):** bileşen 1+2+3. config'ten Ollama kaydı → gerçek agentic worker → sprint içinde `.result`. Tüm mimariyi tek ince e2e dilimde kanıtlar, API key gerekmez. **Hafta sonu Ollama (local, RTX 5090) kurulumu sonrası.**
- **Faz 2 — Mixed fleet + REPL switcher (API flag-gated, default OFF):** bileşen 4 + 3-fleet. Keyfi OpenAI-compat (GLM/Groq/OpenRouter/Together) config'ten + per-worker auth + REPL/terminal parity + **non-leak fleet testi**.
- **Faz 3 — Failover + models.dev dynamic:** bileşen 5+6.
- **Faz 4 — Bedrock SigV4 (+Vertex):** bileşen 7.

### 💸 Maliyet stratejisi (Alperen 2026-06-04 — bağlayıcı)
API çağrıları maliyetli; **şu an bu maliyete katlanılmıyor.** Bu yüzden:
- **Ollama (local) zero-cost** → Faz 1 + günlük dogfood buradan; never-calls-home, anahtarsız.
- **API-key yolları beta'da flag-gated, default-OFF** (CLAUDE.md "kör-default-on edilmez"; subscription-only beta, `project_api_mode_deferred_post_beta`). Egzersiz yalnızca: (a) **ucuz API-key modelleriyle basit sprint'ler**, (b) **ayrı bir sandbox proje** (deckent'i bozmadan; oradan data toplanır → deckent geliştirilir), veya (c) **deckent-hub geliştirmesi** sırasında. deckent-dev ana ağacında API-worker default koşulmaz.
- Subscription Claude + Ollama kombinasyonu beta boyunca asıl çalışma modu.

### Çapraz referanslar
F1-009 (8-provider fleet, ~95% iç-wiring — **gerçek any-key worker fleet = bu AS-2**) · F1-010/011/012/013/014/015 · F6 (auth flexibility) · **AS-6 / F3-009 (otonom — AS-2 enabler)** · ADR-076 (auth-precedence) · ADR-077 (multi-provider) · ADR-010 (no-new-dep). Memory: `feedback_container_auth_precedence` · `project_api_mode_deferred_post_beta` · `feedback_zero_hardcode_live_data` · `project_deckent_runtime_ecosystem` · `project_4cli_subscription_vision`.

---

## 4B. Agentic Run Ecosystem — Sub-System Map (AS-1 … AS-6)

> **Completion thesis (Alperen 2026-06-04):** DIRECTIVES Sprint 224 (REPL native-parity) + 225 (otonom runtime) + 226 (platform / dormant-wake) **artı** aşağıdaki AS-1…AS-6 alt-sistemleri tamamlandığında deckent **"tamamlanmış ürün" = agentic run ecosystem** olur — üç Trinity yüzü (developer / company / individual) olgunluğa erişir. Bu harita kalan işin **kanonik decompose'u**dur; her alt-sistem kendi **brainstorm → spec → sprint** döngüsünü hak eder. AS-2'nin derin tasarımı §4A'da; diğerleri ele alındıkça kendi §-bölümüne terfi eder.

| AS | Alt-sistem | Kapsam (özet) | Durum | Eşleştiği F-ID / sprint | Kalan |
|----|------------|---------------|-------|--------------------------|-------|
| **AS-1** | Dormant wake-up + ölçek sertleştirme | uykudaki primitive'leri uyandır + 50-100 worker ölçek | 🔜 **Sprint 230 LIVE** (8 task: Windows/models.dev/docker-monitor/dormant) | Sprint 230, W-K, W-K-detail (1/2/4/7), F3-010, F7-004 | Windows Job-Object, PTY `worker-attach`, RBAC-hard pre-write, 429-switch, cost↔billing köprüsü, auditor-async, docker-parallel spawn, `planDispatch` wire (kullanıcının 21-task planından merge) |
| **AS-2** | Gerçek multi-provider / any-key | per-worker mixed fleet, config-registry, agentic HTTP-worker, Bedrock | ✅ **tasarım §4A** | F1-009..015, F6 | Faz 1-4 impl (Ollama-first, API cost-deferred) |
| **AS-3** | Zero-hardcode + tam i18n | per-locale catalog + dynamic SUPPORTED_LANGS + add-a-language; tüm user-facing string→catalog; canlı-veri (stale const yok); "every-nation" | ✅ **tasarım §4E** | W-A, W-K-detail (8/9), ADR-032, `feedback_god_level_i18n_quality_bar`, `feedback_zero_hardcode_live_data` | Faz 1-3 impl (catalog infra+guard → tam sweep → add-a-language+live-data) |
| **AS-4** | Provider-native yetenekler | her sağlayıcının kendi gücü: Claude plugins / ultracode (workflow) / provider-native MCP / skills / subagents — provider-agnostic Capability Realization Layer + fallback | ✅ **tasarım §4D** | F11-014/015, AS-5 (MCP köprü), AS-2 | Faz 1-3 impl (persona/MCP native → skills/plugins → nested workflow flag-gated) |
| **AS-5** | MCP-CLIENT (dünyayla entegrasyon) | deckent'i server-only'den **MCP tüketicisine** evriltme; Claude-parity (her ortamda kur/kullan); harici sistemlerle veri alışverişi, enterprise-grade | ✅ **P1 DONE (Sprint 229)** · §4C | F9-001/002/003, F11-015, F8, #ERP | **Faz 1 ✅** (broker+REPL+`deckent mcp` CLI, 5/5); Faz 2-3 (worker+RBAC → otonom/enterprise+OAuth) kalan |
| **AS-6** | Otonom + process/batch mode | uzun-yaşayan, event-driven, yetki-sınırlı; "sadece developer değil herkes için" agentic-OS | 🔜 Sprint 226 + F3 | F3-001..009, Sprint 226, ADR-040 (nervous) / ADR-037 (RBAC) | 5 adapter + sürekli loop + `deckent autonomous` CLI (226); batch-mode; full-autonomy süreçleri |

*Not: §5 (Sub-Projects #1-#5) eski agentic-OS pipeline çerçevesidir; **AS-1…AS-6 kalan işin güncel decompose'udur** — örtüştükleri yerde AS-* önceliklidir. Güvenlik invariant'ı (AS-6): default-deny + insan-onay-gate, oto-sprint-start YOK; AS-6 bir ürün-hedefi, benim/Brain'in sprint-başlatma iznini değiştirmez.*

---

## 4C. AS-5 — MCP-Client (deckent dünyayla entegre — MCP tüketicisi)

> **Comprehensive design — 2026-06-04 (Alperen).** deckent'i server-only'den **MCP TÜKETİCİSİne** evriltme: harici MCP server'larına (yerel subprocess veya uzak/enterprise) bağlanır, tool/resource/prompt'larını keşfeder, deckent'in eylediği **HER yüzeyde** (REPL + sprint worker + AS-6 otonom + dashboard) kullanır. **Hedef: Claude Code'un MCP'yi her ortamda kurup kullandığı mimari tutarlılık + güç — deckent'te birebir parity, enterprise-grade / god-level.** "Dünyadaki tüm sistemlerle entegrasyon, veri alışverişi" (F9). SDK zaten dep (`@modelcontextprotocol/sdk ^1.27.1`) → **yeni dep YOK** (aynı SDK'nın `Client` tarafı).

### 🎯 Claude-parity (mimari tutarlılık + güç)
- **Yönetim CLI:** `deckent mcp add|list|remove|get` (claude `claude mcp …` ile aynı zihinsel model; ADR-012 register pattern) + REPL `/mcp` komutu + dashboard MCP sayfası.
- **3-scope config:** **project** (`.mcp.json`, takımla paylaşılır, git'te) + **user** (global, tüm projeler) + **local** (kişisel/gizli) — Claude Code scope modeli, 3-katman merge (ADR-004 ile uyumlu).
- **Tam transport gücü:** `stdio` (yerel subprocess) + `StreamableHTTP`/`SSE` (uzak/enterprise) + uzak server'lar için **OAuth** akışı.
- **Tam yüzey:** kurulan bir MCP server **her yerde** çalışır (REPL, sprint worker, otonom, dashboard) — Claude'daki gibi "her ortamda kullanır."

### 🔴 Güvenlik omurgası — tek choke-point (RBAC / Approval / Audit)
Harici MCP tool'ları keyfi yan-etkili (mail.send, db.write, shell). AS-2'nin auth-izolasyon kontratının AS-5 karşılığı: **her harici MCP çağrısı broker'dan (tek choke-point) geçer** → (1) **RBAC** (ADR-037: hangi agent/worker/tenant hangi server'ı), (2) **risk-tagged approval** (REPL'de tool-permissions confirm/always hiyerarşisi; otonom'da nervous approval-gate, **OTO-APPROVE YOK**), (3) **audit** (event-stream `writeEvent` — her çağrı iz bırakır), (4) **scope** (worker yalnız izinli server'lara). İz bırakmadan harici aksiyon YOK. (F9-003 + F10-002 risk-tag.)

### Mimari bileşenler
1. **McpClientBroker (`src/mcp-client/`, yeni)** — tek merkezi yönetici; SDK `Client` + transports; connection pool + lifecycle (connect/reconnect/health); **tüm yüzeyler buradan geçer** (merkezi RBAC/audit choke-point).
2. **3-scope config + yönetim** — `.mcp.json` (project) + user + local merge; `deckent mcp add/list/remove/get` CLI + `/mcp` REPL + dashboard. Secret `.deck` (AS-2 pattern) / OAuth token store.
3. **Dynamic discovery (F9-002)** — connect'te `tools/list` + `resources/list` + `prompts/list`; runtime'da **namespaced** (`<server>__<tool>`) tool-registry kaydı; reconnect refresh.
4. **Surface bridges** — REPL (agentic loop, confirm-gated) · Worker (prompt'a izinli tool inject + IPC→broker) · Otonom (AS-6 action-executor, authority+approval) · Dashboard (MCP sayfası).
5. **Trust/RBAC/Audit** — mevcut tool-permissions + ADR-037 + event-stream + nervous **reuse** (yeni güvenlik sistemi değil, consolidation).

### Fazlama
- **Faz 1 — Broker + REPL + yönetim CLI (F9-001 + F11-015):** McpClientBroker + 3-scope config + `deckent mcp add/list/remove` + `/mcp` + dynamic discovery + REPL dispatch + confirm-gate + audit. **Thin e2e:** yerel stdio reference server (`everything`/`filesystem`) ekle → `/mcp` listele → REPL agentic birini çağır (confirm'li) → audit kaydı. Yerel, ücretsiz.
- **Faz 2 — Worker surface + RBAC:** worker tool-injection + IPC→broker bridge + RBAC scope + scope/non-leak testi (sprint task'ı harici MCP çağırır).
- **Faz 3 — Otonom + enterprise:** AS-6 action-executor wire + remote HTTP+OAuth transport + per-tenant isolation + risk-tagged approval (F10-002) + dashboard MCP yönetim sayfası.

### Çapraz ref
F9-001/002/003 · F11-015 (REPL MCP) · F8 (capability broker — üst soyutlama; MCP-client onun bir backend'i olabilir) · #ERP · **AS-4** (provider-native MCP ile akraba) · **AS-6** (otonom tüketici) · ADR-037 (RBAC) / ADR-040 (nervous) / ADR-062 (audit chain) / ADR-004 (3-katman config) / ADR-012 (CLI register) / ADR-010 (SDK zaten dep). Memory: `project_deckent_runtime_ecosystem` · `project_embedded_web_terminal`.

---

## 4D. AS-4 — Provider-Native Capabilities (Capability Realization Layer)

> **Comprehensive design — 2026-06-04 (Alperen).** Bugün deckent provider CLI'larını **çıplak prompt + text-injection** ile çağırıyor (Karpathy/ADR/skill metin); hiçbir native güç (Claude plugins / ultracode-Workflow / native MCP / native skills / subagents) kullanılmıyor. AS-4 her sağlayıcının **KENDİ gücünü** açar — ama multi-provider parity'yi (AS-2) bozmadan: provider-agnostic **Capability Realization Layer**.

### Çekirdek prensip — soyut yetenek → per-provider native gerçekleme + graceful fallback
deckent bir worker/REPL için soyut **capability set** bildirir: `{persona, nativeTools, mcpServers, nativeSkills, workflow}`. Her `ProviderAdapter` bunları **native** gerçekler; desteklemeyen **text-injection'a düşer** (bugünkü davranış = fallback). Böylece Gemini/ollama bozulmaz, Claude tam gücü açar.

| Soyut capability | Claude native | Codex/Gemini | Fallback (hepsi) |
|---|---|---|---|
| persona (agent) | `--append-system-prompt` + `--agents` (subagent) | muadil flag/config | prompt'a text |
| nativeTools | `--allowedTools` (zaten) + native tool seti | `--full-auto` / approval-mode | text talimat |
| mcpServers | `--mcp-config` (provider KENDİ MCP'sini koşar) | codex/gemini mcp config | AS-5 broker (deckent-side) |
| nativeSkills | `--setting-sources` + `.claude/skills`/plugins | — | skill metin (bugünkü) |
| workflow (ultracode) | Claude Workflow tool (nested orchestration) | — | tek-pass worker |

### Mimari bileşenler
1. **CapabilitySpec + Realizer** — task/worker capability set'i; `adapter.realizeCapabilities(spec) → {extraArgs, extraEnv, promptAugment}` (opsiyonel adapter metodu).
2. **ProviderAdapter genişletme** — Claude adapter native flag üretir (`--append-system-prompt`/`--agents`/`--mcp-config`/`--setting-sources`); diğerleri muadil ya da fallback.
3. **Claude-first impl** — `buildCommand`'a capability-derived args; `.claude/` native skill/plugin/subagent + plugin marketplace (superpowers vb.) opt-in; `--mcp-config` **AS-5 broker config'inden türetilir** (AS-4 ↔ AS-5 köprü).
4. **Nested orchestration (ultracode/Workflow) — flag-gated ayrı faz** — Claude worker session-içi Workflow koşar (deckent→Claude→sub-agents). Güçlü ama recursive/maliyet → **default-OFF, flag-gated, cost-gate sınırlı**.
5. **Graceful degradation contract** — capability desteklenmiyorsa sessizce text-fallback (+opsiyonel log); davranış-eşdeğer (mevcut text-injection `feedback_prompt_completeness_over_brevity` korunur).

### Fazlama
- **Faz 1 — Capability Realizer + Claude persona/MCP native:** CapabilitySpec + `realizeCapabilities` + Claude `--append-system-prompt`/`--agents`/`--mcp-config` (AS-5 ile) + fallback contract. Worker persona native + Claude kendi MCP'sini koşar.
- **Faz 2 — Native skills/plugins:** `--setting-sources` + `.claude/skills`/plugin (superpowers vb.) opt-in; deckent-skill → native-skill map.
- **Faz 3 — Nested workflow (ultracode), flag-gated:** Claude Workflow nested orchestration + cost-gate guard; Codex/Gemini muadil keşfi.

### Çapraz ref
F11-014 (multi-provider parity) · F11-015 · **AS-5** (native MCP passthrough köprü) · **AS-2** (provider-agnostic core korunur) · ADR-079 (proof-of-function) · ADR-010. Memory: `feedback_prompt_completeness_over_brevity` (text-injection bugünkü temel — fallback olarak korunur) · `project_deckent_runtime_ecosystem`.

---

## 4E. AS-3 — Zero-Hardcode + Full i18n (every-nation)

> **Comprehensive design — 2026-06-04 (Alperen).** İki track: **A (i18n)** kullanıcıya görünen TÜM string `getMessage`/locale-catalog'a; **B (zero-hardcode live-data)** stale-const yerine canlı-veri. Hedef: **milyon-user / her-millet** + "iddia kalmasın" tutarlılığı. CLAUDE.md **i18n-FIRST** quality bar'ın executable hâli (`feedback_god_level_i18n_quality_bar`).

### Track A — i18n: per-locale catalog + dynamic + enforcement
Bugün: `getMessage(key,lang)` var ama `SUPPORTED_LANGS=['en','tr']` **hardcoded**, tek `messages.ts` (478 satır), getMessage yalnız ~31 dosyada.
1. **Catalog altyapısı:** `messages.ts` → `src/cli/locales/<xx>.json` (en canonical) + dynamic loader; **`SUPPORTED_LANGS` diskteki kataloglardan türetilir** (sabit union kalkar); en fallback; `{placeholder}` interpolation korunur; lazy-load (cold-start guard).
2. **String extraction sweep:** kullanıcıya görünen TÜM hardcoded string → key + catalog. Yüzeyler: CLI stdout / REPL / dashboard (React i18n) / **MCP tool-description** / error / wizard / notification.
3. **add-a-language path:** yeni dil = `locales/<xx>.json` düşür (kod değişmez); contribution guide; opsiyonel **local-Ollama makine-çeviri seed** (never-calls-home; en→xx taslak, insan düzeltir).
4. **Enforcement guard:** `lint-i18n-hardcode.mjs` — user-surface dosyalarda yeni hardcoded user-facing literal → **CI FAIL** (i18n-first quality bar executable; test-hermeticity guard pattern'i).
5. **MCP tool-desc i18n + `.codex`/`.gemini` rules sync** (W-A / W-K-detail 9).

### Track B — Zero-hardcode live-data
1. **Stale-const audit:** model ID'ler, sayımlar (agent/skill/tool counts), versiyonlar, fiyat → canlı kaynaktan (model-registry, code-derived, package.json). `feedback_zero_hardcode_live_data` (stale `opus-4-6` bundled fallback bulgusu).
2. **Live-data guard:** kritik user-facing sayı/ID için stale-const lint.

### Mimari notlar
- Provider-agnostic mekanizma modülleri **string-free** kalır (label caller'dan enjekte, en default) — CLAUDE.md kuralı; AS-3 bunu tüm kod tabanına yayar.
- Dashboard React i18n ayrı katman ama **aynı catalog kaynağını** paylaşabilir.

### Fazlama
- **Faz 1 — Catalog infra + guard + core CLI sweep:** `locales/` + dynamic loader + `SUPPORTED_LANGS` dynamic + `lint-i18n-hardcode` + en/tr migrate + yüksek-trafik CLI/REPL string'leri.
- **Faz 2 — Tam yüzey sweep:** dashboard + MCP tool-desc + error/wizard/notification + `.codex`/`.gemini` rules sync.
- **Faz 3 — add-a-language + Track B:** contribution path + Ollama-seed + zero-hardcode live-data audit/guard.

### Çapraz ref
W-A (i18n contribution) · W-K-detail 8/9 · ADR-032 (i18n pattern) · ADR-013/018 (per-provider rule gen). Memory: `feedback_god_level_i18n_quality_bar` · `feedback_zero_hardcode_live_data` · `project_deckent_everyone_everywhere` (every-nation).

---

## 4F. Brain Integrity — sprint-226 RETRO/Export/Decay Bug Cluster (🔴 P0)

> **Bulundu 2026-06-04**, sprint-226 (autonomous runtime) sonrası analizde. Sprint ÇIKTISI iyi (disk-verified: 7/7 adapter+CLI+test) ama **Brain'in defter-tutması bozuldu** — RETRO/EVALUATE/DECAY/export fazında 3 bug. ADR-070 (Evaluation Integrity) ailesi. **P0: export + memory-wipe HER sprintte tekrarlıyor → tekrar veri kaybı, fix'e kadar.**
>
> **⚠️ KISMİ — Sprint 227 (S-INT), commit `c58bb50d`:** 227-001 rubric renormalize (sabit 78.75 öldü ✅), 227-002 `writeGuardedExports` (boş-overwrite reddi — **dbCount>0 yolu**, ✅), 227-003 decay `skipDelete`(sprint_num>0) + catastrophic abort, 227-004 regression. 4/4 DONE. **Rubric + export-dbCount>0 guard kalıcı ÇALIŞTI.** Ama decay-wipe **227'de TAM kapanmadı.**
>
> **🔴 TEKRAR — Sprint 231 (canlı kanıt):** finalize'da memory 91→1, chat 30→0, retro/sprint 4→1 (adr 75 exempt kurtuldu). 227-003 abort ATEŞLEMEDİ. **Gerçek 3-bug kök zinciri (232'de file:line bulundu):** (1) **`decay_after_sprints=20` config runDecay'e GEÇMİYOR** → `debt-manager.ts:641` hardcoded `8`'e düşüyor (asıl tetikleyici); (2) **memory/retro/sprint/pattern decay-exempt DEĞİL** (sadece adr/identity); (3) **abort `>` kullanıyor** → tam %50'de tetiklenmiyor. + iki edge: ci-sim-SIGINT-yok + export dbCount===0 korumasız. Recovery: `bak-sprint229-complete` (206) → restore.
>
> **✅ KÖKTEN KAPANIŞ — Sprint 232 (5-katman, 7/7 DONE, commit `bceb7ed5`):** 232-001 decay-config-wire (PRIMARY) + 232-002 learnings-decay-exempt + 232-003 abort-`>=` & WAL-safe `deckent memory backup` CLI + 232-004 ci-sim-SIGINT-restore + 232-005 dbCount===0-export-guard. tsc temiz, 24 yeni test. **İlk kez finalize wipe ETMEDİ** (memory 218→222 büyüdü). **🔨 build-doğrulaması bekliyor** — build sonrası bir sprint daha intact kalırsa saga RESMEN kapanır. **WAL-cp tuzağı dersi:** pre-sprint `cp memory.db` WAL-modda BOŞ kopya üretir → `sqlite3 .backup`/checkpoint şart.

### Bug 1 — Rubric total sabit 78.75 (kalite ayrımı yok)
`sprint-phases.ts:1199` `rubric total ${totalScore}` basıyor. `totalScore` (`result-evaluator.ts:1192`) = Σ scoreCriterion×weight; `scoreCriterion` (`:1188`) **sinyalden** hesaplıyor, **worker'ın self-rubricScores'unu YOK SAYIYOR**. İyi-biçimli her DONE sonucu için (testsPassed:true + DONE + in-scope + notes≥100 + **coverage:null**): correctness 100(.4) + test_coverage **~15**(.25, coverage:null→cov0) + scope 100(.2) + doc 100(.15) = **her zaman 78.75**. sprint-218/224/226 hep aynı. Karar bozulmaz (78.75≥passingScore→DONE) ama rubric **non-diagnostic**. **Fix:** coverage yapısal-null'da ağırlıkları renormalize et / worker rubricScores'u dahil et / gerçek coverage sinyali. [[feedback_brain_rubric_bridge_broken]] kalıntısı.

### Bug 2 — Sprint-içi export `.brain/exports/*.md`'yi boşaltıyor (P0 veri-kaybı)
sprint-226 RETRO/export, DB'de 75 ADR varken exports'u **boşalttı** (`decisions.md` 8518→2 satır, **0 ADR**). Standalone `deckent memory export` ÇALIŞIYOR (631 ADR ref geri yazdı) → **sprint-finalizer'ın export yolu buggy** (yanlış zamanlama / kısmi DB / farklı kod yolu) CLI'a karşı. **Fix:** sprint-finalizer export çağrısını bul; **dolu export'u boşla EZME** (guard: DB'de N ADR var ama render boş → abort + öncekini koru).

### Bug 3 — Memory learnings DB'den silindi (P0, [[feedback_db_silmek_yasak]])
sprint-226 sonrası DB memory/sprint/pattern/retro **1'er taneye** düştü, `decay_after_sprints=20` olmasına rağmen (~20 sprint kalmalıydı). 159 önceki learning DB'den uçtu (git HEAD memory.md'de 160 vardı). ADR'ler hayatta (decay-exempt). **Fix:** DECAY + RETRO memory-write'ı denetle; decay decay_after_sprints'e uymalı, asla 1'e collapse etmemeli; guard (entries'in >%X'ini düşürecek decay reddedilir). History git HEAD memory.md'den kurtarılır.

### Operasyonel önlem (fix'e kadar — bağlayıcı)
Her sprint sonrası: `cp .brain/memory.db .brain/memory.db.bak` + `deckent memory export` + doğrula (ADR sayısı ~75) + gerekiyorsa `git checkout HEAD -- .brain/exports/memory.md` (history) + commit. Reset-bug ([[project_deckent_self_git_mutation_bug]]) + bu export-bug birlikte → **her sprint ÖNCESİ commit + DB backup ŞART.**

### 🔬 Kök Neden Analizi — "memory neden kayboldu" (2026-06-04, kesin)
1. **Tetik:** sprint-226 öncesi `memory` entry'leri **`sprint_num=0`** ile kayıtlıydı (INTEGER alan boş — eski import/rebuild yalnız `sprint_id` string'ini set etmiş). 
2. **Mass-wipe:** sprint-226'nın **eski** decay sorgusu `sprint_num < threshold` (threshold=226-20=**206**, `>0` guard YOK) → `0 < 206` TÜM undated entry'ler için doğru → **132-224 arası ~159 satır silindi**; hayatta kalan tek "1" = sprint-226 (sprint_num=226, pencere içi, decay sonrası yazıldı). **ADR'ler `decay_exempt=1` → dokunulmadı** (yani "DB reset" değil, undated-non-exempt hedefli decay-wipe).
3. **Fix (227-003):** `AND sprint_num > 0` skipDelete + >%50 catastrophic-abort → tekrar etmez. Write-path (`sprint-retro-writer.ts:768+`) zaten `sprint_num` set ediyor → yeni entry'ler güvenli.
4. **Recovery (2026-06-04):** `parseMemoryMd` ile git `memory.md`'den **87 learning (132-228) additive re-import** → DB memory 3→90; **ADR/chat/diğer DOKUNULMADI** (sadece `type=memory` INSERT, DELETE yok). Yedekler 7→**2** (`bak-sprint228-complete` güncel + `archive-deep-20260522` derin debt/retro/pattern).
5. **By-design not:** fix'le bile decay 20-sprint'ten eski entry'leri (memory budget) trim eder → restore edilen 132-207 sonraki decay'de düşebilir (DOĞRU); **git `memory.md` kalıcı arşiv**. Kalıcı DB-tutma istenirse: `decay_after_sprints` artır VEYA eski-önemli entry'leri `decay_exempt`.
6. **Açık follow-up:** undated (sprint_num=0) eski satırlara **defensive backfill** (`backfillSprintMemoriesFromSprintsDir` mevcut) — guard zaten koruyor ama temizlik için.

---

## 4G. Human-Interaction Wire — Feedback / Approval / Control Surfacing (🔴 P0 cluster)

> **Bulundu 2026-06-05**, ultracode 10-yüzey workflow audit'i (autonomous "safe-but-deaf" tespitinin tüm yüzeylere genellenmesi). 52 aday → **44 adversarial-doğrulanmış gap** (8 çürütüldü); producer-site+eksik-surface bazında dedup sonrası **~18 gerçek distinct** (15 unintentional + 3 honest-deferral kümesi). Tüm iddialar file:line grep-doğrulandı; finder+verifier "unwired" demeden önce dolaylı tüketici (string-key registry, event-sub, re-export, hook injection) aradı.
>
> **🎯 Tez — deckent SAFE-BUT-DEAF:** karar verir, diske persist eder, onayı **doğru** park eder (ADR-040 no-auto-approve + ADR-037 default-deny + 5 safety-floor sağlam) — ama pure-CLI/REPL koşumda bu kararları operatöre **SURFACE etmez** ve insanın accept/reject'ini **SOLICIT etmez**. Producer-side hook'lar (`onTick`, `approvalGate.accept/reject`, `NotifyDispatcher`, `executor.resolveApproval`, `ipc-queue.startPolling`) **hepsi VAR ve test'li** — sadece MCP-host dışında hiçbir consumer tarafından bağlanmıyor. "İnsan-döngüde"nin yarısı eksik: insan, onay istendiğini **fark edemiyor**.

### İki başlık P0 kök-neden (raporlanan ~10 gap'in çoğunu açıklar)
1. **`NotifyDispatcher` yalnız `mcp/server.ts`'te init** (`server.ts:116,156` tek call-site; CLI+File adapter sadece orada eklenir). `deckent start` CLI sprint'inde `getGlobalNotifyDispatcher()` → **null**, dolayısıyla her `notify()` (task-done, sprint-finalized, **human-checkpoint-required**) **sessiz no-op** (`notify.ts:84` `if(!dispatcher) return`). Tek fix 5+ gap'i aynı anda açar (dispatcher-mcp-only, notify-cli-gap, checkpoint-silent-block'un notify yarısı).
2. **Autonomous + nervous park edilen onaylar CLI/REPL'de accept/reject yüzeyine sahip değil.** `approval-adapter.ts:119-133` `accept()/reject()` tanımlı ama `autonomous.ts:96` `const { deps } = buildAutonomousRuntime(...)` **`approvalGate`'i ıskartaya atıyor**; sadece start/status/stop subcommand kayıtlı (`:213-261`). **Producer-first uyarı:** `accept/reject` in-memory map mute ediyor, **hiç persist etmiyor** → ayrı bir `deckent autonomous approve` PROCESS'i çalışan loop'un gate'ine ulaşamaz → **dosya-aracılı çözüm (APPROVE-001) CLI subcommand'den ÖNCE inmeli** yoksa smoke geçmez. Nervous round-trip de kırık: `executor.ts:201,247` pending'i in-memory tutar ama `.deckent/nervous-pending.json` **hiç yazmaz** (`ipc-queue.startPolling` **0 prod-caller** → MCP accept/reject IPC dosyaları okunmaz, onay sessizce düşer).

### Kesitler (kategori bazında, hepsi file:line doğrulandı)
- **Feedback (sağırlık):** `onTick` hook (`runtime-loop.ts:115,160`) CLI'da bağlanmıyor → loop sessiz tick; monitor scan-alert'leri (`sprint-phases.ts:700-704` yalnız `writeScanToDashboard`) terminale basılmıyor; uzun-sprint progress yalnız `debugLog` (DECKENT_DEBUG=1 gerekir, `result-collector.ts:852`); `ProgressRenderer`/`WorkerStatusTracker` tanımlı ama **0-instantiation**.
- **Approval (kör onay):** `waitForHumanApproval` (`sprint-lifecycle.ts:383-435`) CLI modda **sessiz blok** (notify null + sadece debugLog); worker `askBrain` soruları **auto-`continue`** (`ipc-registry.ts:227,234` — "Future: Human Checkpoint" yorumlu **documented-deferral**).
- **Control (eylemsizlik):** `deckent kill --all` **onaysız** `killAllCascade` (`kill.ts:307-314`, `--user-explicit` deklare ama okunmuyor — **P0 geri-dönülmez cascade**); `agent delete` onaysız recursive `rmSync`; dashboard **Kill-All butonu kırık** (`server.ts:753-764`→`tmux.ts:197-201` var olmayan `worker-all` penceresini hedefler, client 500'ü sessiz yutar `SprintControlPanel.tsx:50`); `chat-mcp-bridge` (Sprint 229-005) build+test'li ama REPL'e **import edilmemiş** (no `/mcp` slash).
- **i18n (CLAUDE.md i18n-FIRST regresyonu):** `nervous.ts` tüm yüzey **0 getMessage** (EN literal + TR `timeAgo` 'dk/sa/g' + 'TRT'); `checkpoint.ts`, `config-nervous.ts` (karışık EN/TR `PRESET_DESCRIPTIONS`), `chat-slash-registry.ts` 27 hardcoded desc — hepsi `getMessage` bypass.
- **Bot kanalları (kırık vaat):** `DiscordConnector`/`TelegramConnector`/`ConnectorPool` tam-implement+test'li ama **0-instantiation**; legacy `notify_channel`/`notify_url`/`notify_on_complete` config + `NotificationDispatcher` provider'ları **tamamen ölü** (config + dashboard UI i18n-label'ları çalışmayan özellik vaat ediyor); `INCOMING_MESSAGE` (`incoming-router.ts:175`) event-bus'a düşer ama approve/reject olarak **parse edilmez**.

### İş planı — 9 epic / ~24 task (dedup'lı, tek-wave parallel-safe: hiçbir 2 task aynı dosyaya yazmaz; PLANOBS 2026-06-05 eklendi)
> DIRECTIVES-hazır: distinct `filesWrite`, Tier-1 → `Smoke:` zorunlu, i18n-FIRST `getMessage`, ADR-040 no-auto-approve + ADR-037 default-deny korunur, notify-once (her tick değil, ilk-enqueue/state-transition). `MSG-001` tek `messages.ts`+`MessageKey` producer'ı; tüm i18n consumer'lar ona `dependsOn`.

| Epic | P | Task | Tier | Files (owner) | Bağımlılık |
|------|---|------|------|---------------|-----------|
| **WIRE** — NotifyDispatcher → CLI terminal | P0 | ✅ WIRE-001 `initializeNotifyDispatcher`'ı backend-agnostik helper'a çıkar (`bootstrapNotifyDispatcher`) — server.ts delege, duplikasyon kaldırıldı | T0 | `core/notify-bootstrap.ts` | — |
| | P0 | ✅ WIRE-002 CLI start + detached runner'dan notify-bootstrap çağır | T1 | `cli/commands/start.ts`, `orchestra/sprint-runner-entry.ts` | WIRE-001 |

> **✅ WIRE epic el-kodlandı (2026-06-05, hand-code dogfood):** `bootstrapNotifyDispatcher` (string-free, CLI→extra→file adapter; `DECKENT_PARENT_PID` inherited-safe), `mcp/server.ts` delege (adapter sırası korundu), CLI `start` (dry-run öncesi) + detached `sprint-runner-entry` wire. **Delivery kanıtı:** `tests/core/notify-bootstrap.test.ts` 5/5 (notify('human-checkpoint-required')→file-adapter jsonl + extra-adapter + CLI stderr; critical=anında awaited, flaky değil). **Reachability:** `start --dry-run` gerçek-binary EXIT=0. tsc temiz, regresyon yok (server/notify/dispatcher 28 + start 18 yeşil). Kalan epic'ler (APPROVE→CONFIRM→MSG→REPL→DASH→BOT→DEFER) sprint'lerle.
| **APPROVE** — park edilen onaylar çözülebilir | P0 | ✅ APPROVE-001 approval-adapter **dosya-aracılı cross-process** çözüm (`decisions.json` persist; `request()` her tick yeniden okur) | T0 | `orchestra/autonomous/approval-adapter.ts` | — |
| | P0 | ✅ APPROVE-002 autonomous CLI: `onTick` feedback + `approve/reject/pending` subcommand + audit-line i18n | T1 | `cli/commands/autonomous.ts`, `cli/helpers/messages.ts` | APPROVE-001 |
| | P0 | ✅ APPROVE-003 park-notification (CLI `onTick` → `notifyAsync`, ilk-park'ta **bir kez**) | T0 | `cli/commands/autonomous.ts` (audit-adapter yerine — i18n-temiz) | WIRE-001 |
| | P0 | ✅ APPROVE-004 nervous executor: park'ta `nervous-pending.json` yaz (DI `PendingApprovalStore`, CLI-okunur shape) — suggest-timeout countdown notice ERTELENDİ (i18n-layering) | T0 | `nervous/executor.ts`, `nervous/bootstrap.ts` | — |
| | P0 | ✅ APPROVE-005 nervous bootstrap: `startPolling(resolveApproval)` wire (**MCP** IPC onayları çözülür) | T0 | `nervous/bootstrap.ts` | — |
| | P0 | ✅ **APPROVE-007 (C-lite + tek-yazar, commit e00579ee)** — CLI accept/reject canlı executor'a `NervousIpcQueue.writeApproval`→poller→`resolveApproval`→**execute** route eder (executor pending+history'nin TEK yazarı, steady-state race kalktı); executor-yok→accept **dismiss + uyarı, 'accepted' history YAZMAZ** (audit-dürüst), reject 'rejected' kaydeder. Liveness=**heartbeat** (pid-reuse'a karşı; bootstrap 2s unref + dispose'da temizler). | T1 | `cli/commands/nervous.ts`, `nervous/ipc-queue.ts`, `nervous/bootstrap.ts` | APPROVE-005 |
| | P0 | ✅ **APPROVE-006 (run-on-approve)** — gate `takeResolved()` (disk-decision, decided-only) + trigger-source `resolvedProvider` re-drive + `buildAutonomousRuntime` wire → onay ~1 tick'te tüketilir+execute | T0 | `orchestra/autonomous/{approval-adapter,trigger-adapter,runtime-loop}.ts` | APPROVE-001 |

> **✅ APPROVE epic — onay KANALI + CLI + feedback el-kodlandı (2026-06-05, TDD; RED→GREEN→REFACTOR):** **APPROVE-001** `decisions.json` (pending.json kardeşi) ile **gate-seviyesi cross-process çözüm** — `accept/reject` persist eder, `request()` her cycle diskten okur → ayrı process'ten verilen onay aynı id'li `request()`'e ulaşır; **ADR-040 no-auto-approve korundu** (decision yalnız explicit accept/reject'ten; `request()` asla auto-resolve etmez). **APPROVE-002** `deckent autonomous approve/reject/pending` subcommand + `makeTickReporter` (per-cycle terminal feedback, notify-once/re-arm dedup) + audit-line `getMessage`. **APPROVE-003** park-notify CLI `onTick`→`notifyAsync('human-checkpoint-required')` (audit-adapter yerine — notify metni user-facing → i18n şart, getMessage CLI'da; YAGNI). i18n-FIRST (10 yeni `autonomous.*` key, en+tr). **Kanıt:** TDD RED→GREEN; `approval-adapter-resolution` 4/4 + `autonomous-approve` 4/4 + `autonomous-tick-reporter` 4/4 + mevcut 19 yeşil (36); tsc temiz. **Smoke (Tier-1):** `pending` listeler, `approve` → `decisions.json` cross-process yazıldı, `approve ghost` → lokalize not-found + exit=1, `--lang tr` TR.
>
> ✅ **ÇÖZÜLDÜ — APPROVE-006 (run-on-approve, Alperen seçimi B; commit sonraki):** Keşfedilen delik (`trigger-adapter.ts:93` id'si nextRun-gömülü → flow re-fire'da yeni id → onaylanan eski id yeniden-request edilmiyordu) **runtime re-drive** ile kapatıldı: approval-gate `takeResolved()` (in-memory değil **disk decisions.json** okur → cross-process; **sadece-decided** döner → zero-sleep busy-loop yok; tüketmez) + trigger-source `resolvedProvider` (policy.disabled'dan ÖNCE, flow'lardan önce) + `buildAutonomousRuntime` wire (`() => approvalGate.takeResolved()`). Onay artık ~1 tick'te tüketilir → execute. **Kanıt (TDD):** `approval-redrive` 7/7 — takeResolved disk+decided-only, trigger-source re-drive, **bundle-wiring** (`buildAutonomousRuntime` üzerinden, hook-tanımlı-ama-bağlanmamış anti-pattern'ine karşı), **end-to-end** (DI: real gate+trigger-source+loop, inline authority→needs_approval, recording executor → park→approve(cross-process)→re-drive→**handler çağrıldı**). Trigger id DEĞİŞMEDİ (identity korundu).
>
> **✅ APPROVE-004/005 — nervous round-trip (2026-06-05, TDD; nervous opt-in):** **APPROVE-004** Executor'a DI `PendingApprovalStore{add,remove}` (opsiyonel 3. ctor-param) — her park'ta `add`, resolveApproval + timer-expiry'de `remove`; bootstrap `makeFilePendingStore` CLI-okunur `NervousNotification[]` shape'iyle `.deckent/nervous-pending.json` yazar → `deckent nervous` + REPL `/nervous` artık parked onayları **görür** (eskiden hep boş). **APPROVE-005** bootstrap `ipcQueue.startPolling(req → executor.resolveApproval)` wire (eskiden 0-caller → MCP accept/reject sessizce düşüyordu) + dispose'da poll durdurulur. **Kanıt (TDD):** `executor-pending-store` 3/3 + `bootstrap` 7/7 (makeFilePendingStore→getPendingNervous CLI-okunur + **bundle-wiring** injectable-ipcQueue startPolling-çağrıldı); 295 nervous-alan testi yeşil; full-suite sadece bilinen-8 (sıfır yeni). Cross-process **doğru** (IPC dosya-tabanlı, poller executor ile aynı process → autonomous APPROVE-001 in-memory tuzağına düşmez). **Aktivasyon:** `nervous_system.enabled:true` (opt-in; deckent-dev'de KAPALI — APPROVE-006 gibi "wired+test'li, opt-in'de canlı"). **🔴 DÜRÜST SINIR (APPROVE-007):** CLI `deckent nervous accept/reject` (nervous.ts:237/260) executor'a ulaşmıyor (yalnız dosya-sil+history) → MCP path canlı, CLI path değil. **Bilinen sınır:** `nervous-pending.json` artık 2 yazar (executor pendingStore + CLI/MCP handler) — non-atomik RMW, lokal/düşük-frekans, teorik clobber-race.
>
> **✅ APPROVE-007 — CLI→IPC route (2026-06-05, TDD; commit e00579ee):** CLI accept/reject canlıyken `writeApproval`→poller→`executor.resolveApproval`→**execute** (executor pending+history TEK yazarı → 2-yazar steady-state race **kalktı**); executor-yok→accept dismiss+uyarı (**'accepted' history YAZMAZ** — advisor #3 audit-dürüstlük), reject 'rejected' kaydeder. Liveness=**heartbeat** (raw-pid değil → pid-reuse false-positive yok; bootstrap 2s unref + dispose temizler). **Kanıt:** `nervous-ipc-route` 3/3 — CLI-unit (alive→IPC / dead→dismiss, accepted-history-lie yok) **+ integration** (gerçek poller: writeApproval→tick→resolveApproval→action-handler çalıştı → routing DEĞİL execution kanıtlandı, advisor #1). Tier-1 smoke iki yol + TR. **Dürüst sınır:** success mesajı "executor'a iletildi" (kesin teslim vaadi DEĞİL — TOCTOU penceresi: executor liveness-check ile tüketim arasında ölebilir). **Kalan (APPROVE-007b):** REPL `/nervous` bridge (`chat-nervous-bridge`) + `handleEdit` (modified-payload IPC transport gerekir) hâlâ doğrudan dosya-mutasyonu.
| **REPL** — /autonomous · /mcp · /nervous parity | P1 | REPL-001 slash-registry: `/autonomous`+`/mcp` katalog + desc i18n | T1 | `cli/commands/chat-slash-registry.ts` | MSG-001 |
| | P1 | REPL-002 chat-native: `/autonomous`+`/mcp` dispatch (`buildMcpBridge` startup) + cancel/maxTurns i18n | T1 | `cli/commands/chat-native.ts` | REPL-001, MSG-001, APPROVE-002 |
| **MSG** — interaction-surface i18n ✅ | P1 | ✅ MSG-001 `getMessage(key:string)` zaten string alıyor → i18n.ts MessageKey'e gerek YOK; key'ler `messages.ts`'e epic-epic dağıtıldı (kümülatif ~75 yeni key) | T0 | `cli/helpers/messages.ts` | — |
| | P1 | ✅ MSG-002 nervous CLI + REPL bridge i18n (~22 string + timeAgo + 'TRT' kaldırıldı + langOf commander-fix) | T1 | `cli/commands/nervous.ts`, `cli/commands/chat-nervous-bridge.ts` | MSG-001 |
| | P1 | ✅ MSG-003 checkpoint CLI i18n (empty/approve/reject/headers) | T1 | `cli/commands/checkpoint.ts` | MSG-001 |
| | P2 | ✅ MSG-004 config-nervous CLI i18n (interactive TUI + PRESET_DESCRIPTIONS→i18n key, 36 key) | T1 | `cli/commands/config-nervous.ts` | MSG-001 |

> **✅ MSG epic el-kodlandı (2026-06-05, TDD; commit'ler 59122738·1f90e8f5·e5e61b18·b24ed580):** İnteraction-surface i18n-FIRST retrofit. **MSG-001:** `getMessage(key:string)` zaten `string` alıyor → `i18n.ts` MessageKey union'a dokunmaya gerek yok; key'ler her epic'le `messages.ts`'e additive eklendi (~75 yeni key: autonomous/kill/agent/checkpoint/nervous/config_nervous). **MSG-002/003/004:** her komut `--lang` + `getMessage`; `langOf()` commander'ın `--lang`'ı parent/ancestor'a iliştirmesini tolere eder; `nervous.ts` 'TRT' tz hardcode'u + TR `timeAgo` temizlendi; `config-nervous` `PRESET_DESCRIPTIONS` TR açıklamaları i18n-key'e taşındı; İngilizce değerler eski string'lerle birebir → mevcut testler korundu (lang opsiyonel default 'en'). **Kanıt:** TDD RED→GREEN her biri; ~17 yeni i18n testi; Tier-1 gerçek-binary smoke (TR/EN kontrast: nervous dashboard, checkpoint matris, config-nervous Yetki Matrisi). **🔴 Ders (b24ed580):** MSG-002'yi full-suite yerine subset koşarak commit'ledim → chat-nervous-bridge/repl-nervous-wire 5 testi (eski hardcoded-TR assert) kırıldı; düzeltildi (REPL session-lang wire + testler lang='tr'). **Kural pekişti:** paylaşılan-path (messages.ts) değişiminde commit ÖNCESİ `npx vitest run` (full). **Kalan §4G:** APPROVE-007 (CLI nervous→IPC, C-lite) · REPL-001/002 · DASH-001/002 · BOT-001/002.
| **DASH** — dashboard control plane | P1 | DASH-001 `/api/kill/all`→`killAllSessions` (500 fix) + SSE autonomous events/pending watch | T1 | `api/server.ts` | — |
| | P1 | DASH-002 sidebar Bell pending-count badge (`/api/nervous/status`) | T1 | `dashboard/src/components/Layout.tsx` | — |
| **CONFIRM** — destructive-action onay kapısı | P0 | ✅ CONFIRM-001 `kill --all` y/N confirm (veya `--user-explicit`/`--force`); non-TTY→flag-zorunlu | T1 | `cli/commands/kill.ts` | — |
| | P1 | ✅ CONFIRM-002 `agent delete` y/N + `--force` (recover.ts deseni); non-TTY→flag-zorunlu | T1 | `cli/commands/agent.ts` | — |

> **✅ CONFIRM epic el-kodlandı (2026-06-05, TDD):** İkisi de inject-edilebilir gate (`shouldProceedKillAll`/`shouldProceedAgentDelete` — `--force`/`--user-explicit` bypass, değilse confirm; non-TTY→false=flag-zorunlu → scripted-silent-cascade önlenir). ADR-040 no-silent-destructive. i18n-FIRST (kill.all_confirm/aborted + agent.delete_confirm/aborted, en+tr). **Kanıt:** RED→GREEN; `kill-all-confirm` 4/4 + `agent-delete-confirm` 3/3; davranış-değişikliği nedeniyle mevcut cascade testleri `--user-explicit`/`--force` opt-in ile güncellendi (kill 30 + agent 10 yeşil). **Smoke (Tier-1 gerçek-binary):** `kill --all`→abort/no-cascade, `--user-explicit`→geçer; `agent delete`→abort+dizin korundu, `--force`→silindi; `agent delete ghost`→not-found (confirm'den önce). Karpathy YAGNI: ortak util çıkarılmadı (2 callsite, farklı flag).
| **BOT** — connector + legacy notify | P1 | ✅ BOT-001 sprint notify → Telegram/Discord (per-chat-id, .deck secret, lazy+fail-safe) | T0 | `connectors/connector-notify-adapter.ts`, `connectors/connector-bootstrap.ts` | WIRE-001 |
| | P1 | ✅ BOT-002 inbound `approve/reject <id>`→sender-auth→ownership-route→durable gate çöz + `deckent bot listen` host | T0/T1 | `connectors/incoming-command-router.ts`, `connectors/incoming-command-resolver.ts`, `cli/commands/bot.ts` | APPROVE-001 |

> **✅ BOT-002 el-kodlandı (2026-06-05, TDD; commit'ler d93804d3·a753c0ec·99b61bee·c6fabe6f):** Mesaj wire'ının inbound yarısı — bota `approve <id>` / `reject <id>` yazınca insan onay-kapısını çözer. **4 katman, advisor-yönlendirmeli:** **(1) router** (`incoming-command-router.ts`) — saf + gate-agnostik; 🔴 **sender-auth çekirdek güvenlik**: sadece yapılandırılmış chat_id komut verebilir, yetkisiz göndericinin GEÇERLİ komutu resolver'a ULAŞMAZ + ack almaz (silent-ignore, oracle değil; ADR-040 default-deny); `parseCommand` strict `/?(approve|reject)\s+<id>`, gerisi chatter→null. **(2) resolver** (`incoming-command-resolver.ts`) — ownership-route (blind-try-both DEĞİL): autonomous `pending.json`→decisions.json (durable, cross-process) önce, sonra nervous `nervous-pending.json`→IPC writeApproval (durable, poller tüketir); idempotent, prefix-match. **(3) transport** — `telegram.start()` non-blocking launch (long-poll hang fix; canlı caller yok→güvenli, teste bağlı); `bootstrapConnectorCommands` tek-instance hem-poll-hem-gönder (ikinci poller/409 YOK), BOT-001 outbound path fallback'te dokunulmadı. **(4) host** — `deckent bot listen` uzun-ömürlü (parklar sprint'ten uzun yaşar; resolver durable yazdığı için poller sadece reply-anında canlı olmalı), i18n-first banner. **TDD RED→GREEN:** router 9 + resolver 7 + telegram non-blocking 1 + commands-bootstrap 6 + bot-listen 2 = 25 yeni test; 89 connector+cli yeşil; tsc temiz; additive i18n (bot.*, en+tr). **Smoke (Tier-1 gerçek-binary):** `bot listen --root <empty>` EN+TR listen_none, exit 0; help'te listen. **🟢 GERÇEK INBOUND ROUND-TRIP (receipt-log DEĞİL):** canlı telegram listener + seed'li gerçek autonomous park (`demo-bot-002`) → kullanıcı telefondan `approve demo-bot-002` → `decisions.json`'a `demo-bot-002: {outcome:"approved"}` DURABLE yazıldı + bot ack'ledi — kullanıcı doğruladı. Listener SIGTERM temiz durdu. **Kalan:** Discord gerçek-doğrulama (aynı yol, lazy); start.ts mid-sprint inbound unified-wire (opsiyonel, host yeterli).

> **✅ BOT-001 el-kodlandı (2026-06-05, TDD; commit 5ef0b6ce):** Connector altyapısı (Telegram/Discord/ConnectorPool) tam kuruluydu ama **0-instantiation** — `notify_channel`/`notify_url` config ölüydü. BOT-001 sprint bildirimlerini operatörün telefonuna ulaştırır. **ConnectorNotificationAdapter:** WIRE-001 `NotificationAdapter` kontratını uygular; her `DECKENT→USER:NOTIFY` bildirimini her connector'a **kendi chat_id'sine** yollar (`ConnectorPool.broadcast` DEĞİL — tek kanal değil per-connector); her send timeout-guard'lı (5s) + per-target hata-izole → yavaş/hang platform sprint lifecycle'ı bloke etmez. **connector-bootstrap:** `notify_connectors` config'i okur, enabled connector'ı **lazy import** eder (discord.js opsiyonel → yoksa log+skip), OUTBOUND başlatır; çözülmemiş `$DECK` token / eksik dep / start hatası → log+skip. **telegram.startOutbound():** Telegraf instance'ı `launch()` OLMADAN kurar (v4 long-poll launch() resolve olmaz → startup hang; inbound poller BOT-002). **config:** `notify_connectors { telegram|discord: {enabled, token:"$DECK:…", chat_id} }` DeckentConfig + ResolvedConfig'e; load'da `.deck` interpolate. **TDD:** RED→GREEN; notify-adapter 4/4 + bootstrap 5/5; 64 connector testi yeşil; tsc temiz; yeni-kırık sıfır. **🟢 GERÇEK DELIVERY (mock değil):** kullanıcının gerçek Telegram bot token (.deck) + chat_id ile, BUILT path'ten (loadConfig→interpolate→bootstrap→telegraf→sendMessage) geçen bildirim telefona DÜŞTÜ — kullanıcı doğruladı. Discord aynı lazy+fail-safe deseni arkasında (henüz gerçek-doğrulama yok — Telegram önce). WhatsApp deferred. Inbound (bot reply→approve/reject) = BOT-002.
| **PLANOBS** — plan/start observability + AI-notification-channel (🆕 2026-06-05) | P1 | PLANOBS-001 event-stream `PROGRESS` channel + emit (AI-planner-start / pre-vitest / spawn / EXECUTE-%); `deckent_watch` backfill'lenir | T0 | `orchestra/event-stream.ts`, `orchestra/result-collector.ts` | — |
| | P1 | PLANOBS-002 notify `progress`/`phase-change` event-tipi → tty + MCP + file (3 surface birden; enum'da yok) | T0 | `core/notification-dispatcher.ts`, `core/notify.ts` | WIRE-001 |
| | P1 | PLANOBS-003 `deckent_watch` tool-result'a event PAYLOAD koy (şu an yalnız count döner → AI/MCP event'i göremiyor) = **AI-notification-channel** | T0 | `mcp/tools/watch.ts` | PLANOBS-001 |
| | P1 | PLANOBS-004 plan/start sessiz-boşluk progress + **hata ANINDA insan-dönük notify** (AI parse_failed/timeout, start-fail — `console.error` değil) + spinner | T1 | `orchestra/sprint-planner.ts`, `cli/commands/plan.ts`, `cli/commands/start.ts` | PLANOBS-002 |
| | P2 | PLANOBS-005 (hız) `.tasks` cache → gereksiz re-plan önle + cost-gate çift-planSprint kaldır + pre-sprint vitest async/opsiyonel | T1 | `cli/commands/start.ts`*, `orchestra/sprint-controller.ts` | — |
> **🆕 PLANOBS — tanı (2026-06-05, ultracode 2-keşif, file:line grep-doğrulandı):** **Sorun (Alperen):** `deckent plan`/`start` core-komutları **uzun sessiz boşluk** bırakıyor → operatör + MCP + AI ne olduğunu bilmiyor; core/kritik komutlarda "plan yapılamadı (AI fail)", "sprint başlatılamadı: <sebep>" gibi anlık-insan-dönük dönüş gerek (direkt komutlarda sorun değil). **Kök-tanı:** (1) **AI-mode neden:** `brain_planning` default `'auto'` (`config.ts:402`) = önce-AI-dene → AI-planner subprocess timeout **900s/15dk** (`constants.ts:107`); `deckent start` **HER ZAMAN re-plan** (`.tasks` cache yok) + cost-gate **ikinci `planSprint`** (`start.ts:365`) → auto'da 25-68s ×2 (deckent-dev `structured` set'li → hızlı; ama default-auto+çift-plan genel yavaşlık). (2) **"sprint öncesi çok test":** `pre_sprint_check` (CI-guardian `track_test_count=true`) **PLAN fazında `npx vitest run` TÜM-suite** koşuyor (`plugin-hooks.ts:577`, timeout 300s) — worker'lar değil; sağlıklı ama feedback'siz. (3) **Feedback-boşluğu:** notify'da `progress`/`phase` event-tipi YOK (`notification-dispatcher.ts:13`); event-stream'de `PROGRESS` channel YOK (`event-stream.ts:51`); AI-fail `console.error` (notify'a gitmez, `sprint-planner.ts:344`); detached-child (deckent_start) **MCP-handle'sız** → push edemez (`start.ts:260` stdio:ignore) → yalnız `deckent_watch` poll; **`deckent_watch` payload değil count döner** (ampirik: bana 0/15 event sayısı geldi, içerik gelmedi); `chat-spinner.ts` var ama plan/start'ta kullanılmıyor. **Hedef:** YAVAŞLATMADAN, plan/start progress+hatasını 3 surface'e (MCP / CLI-terminal / REPL-Ink) anlık yüzeyle. **Bağımlılık:** WIRE-001 (notify-dispatcher CLI-wire) ✅ inili → PLANOBS onun üstüne. **Tek-wave not:** PLANOBS-004/005 `start.ts` paylaşır → sprint-zamanı sıralanır veya tek-task birleşir. İlgili: önceki "AI-planner silent-fallback" ([[feedback_ai_planner_silent_fallback]]) + bu sprint'in canlı gözlemleri (231/232 başlatma).

| **DEFER** — Phase-2/S9 (label-only, defect DEĞİL) | P2 | DEFER-001 autonomous MCP control + API/dashboard approval surface (S9 remote/OAuth) | T1 | `mcp/tools/autonomous.ts`, `api/autonomous-endpoint.ts` | APPROVE-001 |
| | P2 | DEFER-002 nervous MCP undo/edit + askBrain escalation + output-stream SSE register | T1 | `mcp/tools/nervous-extra.ts`, `dashboard/api/output-stream-register.ts` | — |

### Honest-deferral ayrımı (zero-loss — defect olarak SUNULMAZ)
- Autonomous **MCP/API/remote** yüzeyleri = bilinçli S9 (`MASTER-PLAN §10:540` "otonom/enterprise MCP — remote+OAuth"), ADR-071 **proposed**.
- `askBrain` auto-`continue` = `ipc-registry.ts:223` açık "Future: Human Checkpoint" yorumu.
- `output-stream.ts` SSE = "Sprint 140 hook point" işaretli.
- nervous MCP undo/edit = fırsatçı P2 parity (bloklamaz).

İlgili: [[feedback_proof_of_function_dod]] (Tier-1 Smoke) · [[feedback_god_level_i18n_quality_bar]] (i18n-FIRST) · [[feedback_directive_kanit_letter_vs_goal]] (def-dışla, caller'da grep) · [[project_mcp_client_not_wired_s229]] (REPL-002 `/mcp` wire = G1) · [[project_native_repl_tool_parity_gap]] · ADR-040 (nervous approval) · ADR-037 (RBAC default-deny) · ADR-062 (audit) · ADR-071 (autonomous, proposed). **Sıra:** WIRE → APPROVE (producer-first APPROVE-001!) → CONFIRM → MSG → REPL → DASH → BOT → DEFER. Tek wave (distinct files); `dependency_pipeline_enabled=false` → Brain manuel wave.

---

## 5. Sub-Projects — Agentic-OS Pipeline (#1–#5)

| # | Sub-project | Status | Remaining |
|---|-------------|--------|-----------|
| **#1** | Embedded Web Terminal (PTY + WS gateway + token auth + audit; ADR-062) | ✅ **GA** (Sprint 175) | F7-004 polish |
| **#2** | Self-security (prompt/command guard, planner state-hygiene) | ⬜ **not started** | full scope |
| **#3** | Million-scale (multi-tenant isolation, k8s, mTLS, rate limits) | ⚠️ partial | Only `LocalTokenAuthProvider` (SHA-256 single-token); `verifyClientCert?()` is a no-op seam — **no** `RemoteTokenAuthProvider`/mTLS, **no** audit shard, **no** SQLite row-level security; per-tenant `rate-limiter.ts` is the only landed piece. TPM/HSM (PKCS#11) + Redis cluster aggregation not built. Sprint 185–188 plan was redirected to stability work |
| **#3-ext** | Brain Evolution — retro **"Next Sprint Behavior Changes"** section | ⬜ not built | `sprint-retro-writer.ts` lacks behavior-mutation diff (agent prompt mutation, skill repertoire gained/strengthened/retired, Brain decision-pattern change); ≥3 visible-changes satisfaction threshold not implemented |
| **#3-mesh** | Distributed Agent Mesh — multi-host worker mesh (workers across nodes, not single-host) | ⬜ proposed (Copilot analysis, Sprint 212) | builds on sub-#3 k8s pod-exec (F3-004); today all workers run on one host. Cross-node scheduling + shared memory/lock coordination is the new scope |
| **#4** | Enterprise integrations (RBAC/audit/rate done; SSO/SIEM/compliance) | ✅ core done | SSO/SIEM/compliance depth (optional) |
| **#ERP** | ERP runtime integration (Alperen 2026-06-01) — Deckent runs *inside* enterprise: process automation, file usage, **DB access (read-only first)**, controlled management | ⬜ proposed | builds on Process Mode (F3) + Capability Broker (F8 `db.query`/`erp.read` capabilities, scoped read-only) + RBAC (ADR-037) + approval gate. The concrete "runtime ecosystem" vertical; least-privilege per ADR-037 |
| **#5** | Local LLM (Ollama/CUDA) | ⚠️ partial (adapter live, fully-local preset missing) | `OllamaAdapter` (HTTP probe + spawn) + `OLLAMA_BUILTIN_MODELS` (qwen2.5-coder:32b/7b, llama3:8b, llama3.2:3b) with tier mapping are implemented; missing: `worker_provider:ollama` fully-local sprint preset + data-sovereignty test (closed-network, zero-API-cost). RTX 5090 + CUDA 13.2 + WSL2 ready (32GB VRAM → 70B) |

---

## 6. Native Chat Everywhere (priority arc — Alperen-decided)

The goal: `deckent` works as a native conversational agent the way `claude` does — in the **terminal**, in the **web UI**, and inside **any IDE**. Three architectural paths (A/B/C) and the VSCode extension overlay, not compete.

| Path | What | LoC | Effort | Prereq | ADR-033 fit |
|------|------|-----|--------|--------|-------------|
| **B** (host CLI) | `deckent chat` spawns user's claude/codex/gemini CLI + auto-attaches MCP | ~150 | 0.5 sprint | user CLI installed | ⚠️ partial |
| **A** (embedded) | "Deckent Chat" tab in dashboard, reuses Sprint-175 PTY/WS/auth/audit | ~600 | 1–2 sprint | none | ✅ |
| **C** (native SDK) | Own tool-use loop + REPL via Anthropic/OpenAI/Google SDKs; zero CLI prereq | ~1500 + migration | 3–4 sprint | none | ✅ full (ADR-010 amendment) |
| **IDE ext** | VS Code/JetBrains extension: sidebar, command palette, status bar, `deckent` command | new sub-project | 2+ sprint | none | ✅ |

**Current reality (Sprint 219 update):** Path B is now fully native — bare `deckent` (no args) launches the agentic REPL (`runChatNativeLoop`) directly; `--native` flag still works; `shouldLaunchDefaultRepl` in `entry.ts` handles the routing (219-001, ADR-081). Doğal dil → MCP aksiyon dispatch (219-004), riskli aksiyon onay kapısı (219-005), oturum persist/resume (219-006), god-level REPL UX (219-003) hepsi Sprint 219'da teslim edildi. Path A (dashboard ChatPage) gerçek SSE streaming ile güçlendirildi (219-007/008). Path C ve IDE extension sıradaki yay (Q3 2026).

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
| **W-E** | **Evolutionary architecture crowning** | ✅ done | F5-004 real callers landed Sprint 212 (ADR-075) — 6 modules live; F5-007 dashboard page remains |
| W-F | Provider repair + local LLM + live catalog | ✅ P0 | F1-004/005, sub-#5 activation |
| W-G | API surface tests | ✅ done | — |
| W-H | Documentation perfection | ⚠️ partial | this consolidation + ref sync |
| W-I | OSS publish pipeline | ⬜ | public repo flip, npm publish (Alperen manual) |
| W-J | Million-user hardening | ⬜ post-beta | OTel/Prometheus, ADR-037 RBAC hard-flip V2 |
| W-K | Dead-code → live-feature wire-up | ⚠️ **active** | overlaps W-E (F5 callers); **Sprint 224 deep-analysis confirmed a recurring pattern — god-level primitives written but 0-caller.** Verified inventory (file:line) in W-K (detail) below. |
| W-INTEGRITY | Brain integrity hardening (Sprint 192) | ✅ done | — (`worker-liveness.ts` liveness checks, EVALUATE skips DEFERRED, `TaskEvaluation.DEFERRED`, adaptive `runtime_extension`, liveness-gated synthetic-result lint, `NEVER_DISPATCHED` event + retro reporting) |
| W-H (detail) | Documentation deliverables gap | ⚠️ partial | Missing: `docs/cookbook/`, full EN user guide, lifecycle/API-surface diagrams, `why-deckent-vs-X`, demo videos, `docs/benchmark/memory-v2.md` (96% claim), `docs/security/threat-model.md`, `docs/adr-index.md`, `npm run docs:test` |
| W-J (detail) | Performance hardening | ⬜ not built | cold-start <500ms (now ~2s eager imports), lazy-load commands, agent/skill-cache lazy-loader, Memory V2 query index, worker-spawn <3s SLA, `tests/load/`, OTel/Prometheus |
| W-B (detail) | CLI/MCP parity gaps | ⚠️ partial | MCP missing vs CLI: `deckent_agent_manage`/`deckent_skill_manage` (list-only), `deckent_memory_manage` (query-only), `deckent_cost`; ~20 missing options across history/retro/review/run/explain; no `lint-cli-mcp-parity.mjs` guard |
| W-A (detail) | i18n contribution path | ⚠️ partial | Dashboard EN/TR + CLI i18n + content-generators present; missing "add-a-language" contribution guide + MCP tool descriptions hardcoded English (no i18n wrapper) |
| **W-K (detail)** | **Verified wire-gaps — Sprint 224 deep-analysis (file:line confirmed by independent root-cause trace)** | ⚠️ **4 new-actionable + cross-refs** | **🆕 NEW-ACTIONABLE (each ≤200 LoC, distinct files, parallel-safe):** **(1) Nervous spawn-lock → blocks safe re-enable.** `executor.ts:241` `handleApprove` is a **timeout-less** Promise (only `pendingApprovals.set`, waits forever for `deckent nervous accept`) — unlike `handleSuggestTimeout:162` which has `setTimeout`. The fix exists: `panic-gate.ts` `awaitPanicGateApproval` (hard 10s timeout → auto-proceed, SAFETY_FLOOR excepted) but is **0-caller** (its own header: "wire is a follow-up"). → wire panic-gate timeout into the executor/spawn path. **F-home: F3-009 + 224-010.** **(2) Cost gate blind to `auth_mode`.** `start.ts:324` runs `estimateSprintCost` but never passes `billingMode`; `cost-calculator.ts:213` returns `costUsd=0` for `subscription`; claude `default_billing_mode:"subscription"` (`pricing-data-baseline.json:10`) → an API-mode dev burns real tokens while the `$5` cap estimates `$0` and never fires. → bridge `auth_mode→billingMode` + add mid-sprint token-usage abort (TokenSpikeDetector only fires in RETRO, post-hoc). **F-home: F6 + F1-010.** **(3) Windows-native backend.** `resolveBackend('auto')` always → `'docker'` with **no `process.platform` check** (spawn-backend.ts:253), and docker spawn uses `spawnSync('sleep')` → breaks on win32. → `win32→subprocess` branch + Node-timer instead of `sleep`. **F-home: cross-platform (§4 Trinity / §9 gates).** **(4) Provider failover unwired.** `provider-overflow.resolveWithOverflow` (subs→API tier-preserving overflow, opus→gpt-5) is **0-caller**; a fallback resolver DOES read `config.fallback_provider` (`provider.ts:609`) but is not wired into the live spawn/FIX path — FIX (`mid-sprint-adapter.ts`) reroutes agent/skill, never `task.provider` → same-provider retry on 429/timeout. → wire overflow + fallback-resolver into spawn-error/FIX. **F-home: F1-010.** **✅ CROSS-REF (already-acknowledged, NOT new debt):** worker-side `checkWorkerAuthority` (`worker.ts:602` unconditional `return true`, 0 prod caller) = **ADR-037 V1.0 advisory posture by design** — auditor-side `authority-enforcer.checkAuthority` IS active (don't conflate); V2 hard-flip already tracked in W-J. core→orchestra import cycle (`core/audit-writer`+`audit-query` → `orchestra/event-stream`, ADR-008 soft-violation) = architecture-cleanup candidate (move event-stream to `core/` or audit-modules to `orchestra/`). AI-plan `detectClaude` needs the `claude` CLI (API key alone insufficient) + `brain_planning:'auto'` silent-falls — 224-015 made the failure honest; a CLI-less API-adapter planning path = F6. |
| **W-K (detail-2)** | **Verified wire-gaps + drift — continuation analysis (file:line confirmed)** | ⚠️ **5 items** | **🆕 (5) Docker live-monitoring unwired (terminal + web).** `OutputCollector` (docker `logs --tail`, snapshot not follow), `output-stream.ts` SSE (`/api/output-stream`) **never mounted in `server.ts`**, `monitor-adapter.ts` `DockerMonitorAdapter` (logs/stats/ps) — all **0-external-caller**; PTY WS gateway (ADR-062) is live but only opens NEW shells, no `worker-attach` kind. → `logs --tail`→`logs -f`, mount output-stream SSE, add PTY `kind:'worker-attach'` (`docker logs -f deckent-w-<id>`, read-only), CLI `watch --follow` docker branch, WorkerCard grid fan-out. **F-home: F7-004 (terminal hardening) + sub-#1.** **🆕 (6) Team-collab primitives dormant.** `shared-memory.ts` / `handoff-protocol.ts` / `multi-agent.ts` all manifest-`dormant` with `blockedBy:"no integration point"` → every user is a solo orchestrator today; real multi-agent/team collab is unwired. → wire shared-memory + handoff into worker prompt/spawn. **F-home: Trinity "AI System Worker" / team layer.** **🆕 (7) Scale-async (50–100 worker).** `auditor.ts:108` runs `spawnSync('docker',…)` **per-worker inside the 30s scan** (O(n) blocking); docker spawn is serial+blocking (`spawnSync('sleep')`). Engineered for ~10 workers; ≥20 warns "resource contention" (`config.ts:508`, cap 100). → async-batch liveness probes, parallelize docker spawn, IPC back-pressure. **F-home: W-J perf + sub-#3 million-scale.** **🆕 (8) Provider docs drift (dangerous for setup).** `docs/reference/multi-provider.md` + `docs/guide/multi-provider.md`: Gemini needs the `gemini` CLI (`gemini.ts:294` `spawnSync('gemini','--version')`) but docs imply API-only; both docs **never mention ollama/deepseek/qwen/glm** (all implemented+bootstrap-registered); suspect `codex auth login`/`gemini auth login` commands (`guide:67,105`). → rewrite both multi-provider docs against code reality. **F-home: W-H docs.** **🆕 (9) Per-provider rule-file drift.** `karpathy-discipline.md` exists ONLY in `.claude/rules/`; `worker-default.md` is 139 lines in `.claude/` vs **112** in `.codex/`+`.gemini/` (missing Karpathy 4-Discipline + Proof-of-Function) → Codex/Gemini workers run weaker rules. ADR-018/013 say they must be sync-generated. → regenerate `.codex`/`.gemini` rules from `.claude` source. **F-home: W-B docs/governance.** |
| **W-L** | **Human-interaction wire — feedback/approval/control surfacing** | 🆕 **analyzed (not yet run)** | **Ultracode 10-yüzey audit (2026-06-05): 44 doğrulanmış gap → ~18 distinct → 8 epic / 19 task.** Tez: deckent **safe-but-deaf** — karar verir+park eder ama pure-CLI/REPL'de surface/solicit etmez. İki P0 kök: (1) `NotifyDispatcher` yalnız `mcp/server.ts`'te init → CLI `notify()` sessiz no-op; (2) autonomous+nervous park edilen onaylar CLI/REPL accept/reject yüzeysiz (+ producer-first: `approval-adapter` in-memory, persist yok → cross-process çözüm imkansız). Tam plan + file:line kanıt **§4G**. DIRECTIVES-hazır, tek-wave parallel-safe. |
| **W-K (Sprint 227)** | **Scheduled wire-up batch — DIRECTIVES Sprint 227 (8 tasks, code-verified, parallel-safe)** | 🔜 **planned (not yet run)** | Turns the verified W-K wire-gaps into a runnable sprint. Tasks: **227-001** Windows-native backend (= item 3, F3-010); **227-002** ⭐ models.dev dynamic map (= F1-011); **227-003** ecosystem-intelligence → routing-engine consumption (`ecosystem-intelligence.ts` only skill-CLI caller, routing-engine never consumes); **227-004** self-mod enforcement flag-gated (ADR-039, `authority-enforcer.ts:302` opt-in); **227-005** dead/orphan disposition ADR-038 (`multi-agent.ts` 0-importer orphan + `decision-replay.ts` 0-caller; **`decision-engine.ts` is LIVE — not a candidate**; original analysis's `decision-orchestrator-v1`/`parallel-pipeline-manager-standalone` **do not exist**, `ParallelPipelineManager` has 2 live callers); **227-006** worker-coordination wire (= item 6 part: `HandoffProtocol` 0-caller + heartbeat-daemon → sprint-controller); **227-007** shared-memory wire (= item 6 part: `SharedMemory` 0-caller → worker context); **227-008** [P0] docker live-monitor (= item 5: mount `output-stream` SSE in `server.ts` + `watch --follow` docker `logs -f` + WorkerCard fan-out). **Correction note:** original D5 "dedup" was wrong — nervous `runPipeline` (`bootstrap.ts:109`) is a separate function (different signature), merging would break the nervous path. **Brand-foundation (A1) excluded** — color defs live in the parallel Ink REPL core (`src/cli/repl/*`, `chat-render-region.ts`), handled by Alperen directly. |

---

## 8. Business / Launch / OSS

- **Model:** MIT, free forever, self-hosted. No paid tier, no feature gate, no `deckent.app` account. Enterprise capabilities (multi-tenant, mTLS, k8s, SSO, SIEM, compliance) ship under the same MIT license — **not** a separate Enterprise Edition.
- **Beta:** v1.0.0-beta.1, OSS public beta window **2026-06-01**. First `npm publish` is **manual by Alperen** (policy: `feedback_npm_publish_user_approval`).
- **Distribution:** `npm install -g deckent`; VitePress docs site; public repo flip (`VerhexIO/deckent`) — monorepo vs split decision pending; sensitive-data scrub (git-filter-repo) before flip.
- **Marketing channels:** Show HN, Reddit (r/LocalLLaMA, r/programming, r/opensource), Twitter/X, Turkish dev community, Discord, Dev.to, landing page + demo video.
- **Comparison (capability, not disparagement — Alperen 2026-06-02):** the only OSS tool combining multi-agent parallel execution + sprint lifecycle + scope enforcement + memory/learning + multi-provider + MCP-native, in **one MIT product** that serves both the individual (native `deckent` REPL, zero-config) and the enterprise (multi-tenant, RBAC, audit, ERP — same codebase, **NOT a gated Enterprise Edition**, ADR-033). We compare on merits with Devin, Cursor, Claude Code, Cowork, Perplexity and open agent CLIs; we do not position as "anti" any of them. Tagline: **"Open source for open world."**
- **Single-product model (decided 2026-06-02):** NOT open-core / NOT an Odoo-style separate Enterprise Edition. One MIT codebase; enterprise capabilities are modular layers (`core` + `enterprise-layer`) but **all open & free**. Individual ease (native agentic REPL) and enterprise complexity ship together. ADR-033 holds.
- **Growth target:** million users (god-level, no-MVP scope).
- **DeckentHub (skill marketplace, shipped seed):** `deckent-hub/skills/` holds the 20-skill seed set (spotify-control, telegram-bot, calendar-google, email-imap, weather-forecast, rss-reader, web-scraper, github-issues, slack-notifier, notion-sync, todoist, spotify-playlist, youtube-downloader, reddit-fetcher, twitter-post, screenshot-vision, file-organizer, currency-converter, translator, discord-moderator). `deckent skill publish` = sandbox + Ed25519 sign (`src/core/signature.ts`, @noble/ed25519) + registry push. Hub is a local directory, not yet flipped to a separate `VerhexIO/deckent-hub` repo.
- **DeckentHub growth + governance (planned):** signing infra done, CI `validate-skill.yml` scaffolded, `rating-system.ts` present. **Not built:** moderation queue, CI auto key-rotation, phased registry growth 20→50→100 with vector search. Post-beta maturation track.
- **OSS publish pipeline — decisions outstanding:** Done: `.gitignore` excludes `.brain/`/`.tasks/`/`.locks/`, `package.json bin.deckent`, validate-publish engine/entry-point gates. **Undecided/not built:** monorepo-vs-split flip, sensitive-info scrub (no git-filter-repo/BFG/gitleaks pre-commit), final npm package name, `.github/ISSUE_TEMPLATE/`, PR template, `FUNDING.yml`, landing page.
- **AEGIS public standard track (post-beta, deferred):** ADR-061 Phase 5 names `agentaegis.io` (open standard repo), an AEGIS-compliant-orchestrator certification program, and academic papers (ICSE/FSE 2027, NeurIPS 2026 multi-agent track). Not built — no domain, spec draft, or paper artifacts; deferred until AEGIS Phase 1–4 ship.

---

## 9. Beta Gates (status as of 2026-06-01)

20 of the original gates pass: `tsc` clean, vitest **18,390 passed / 58 skipped (1,021 files) + dashboard 570 passed (0 failures)**, coverage, all MCP tools (32) + CLI commands (49+) functional, `npm pack` clean, cross-platform (macOS/Linux/WSL2), multi-provider abstraction, i18n, Memory V2 stress, zero CRITICAL/HIGH debt, ADR governance, Brain stability, synthetic-NO_GO disk-verify gate.

Recently closed (Sprint 192–211):
- **Synthetic NO_GO KAYNAK 6+7 closure** — ✅ both timeout-synthesis (`gateSyntheticTimeoutResult`) and graceKill panic-guard (`gateSyntheticGraceKillResult`) now call `verifyDiskAgainstClaim`, emit `DISK_VS_CLAIM_MISMATCH`, and reclassify to MANUAL_REVIEW_REQUIRED on disk contradiction. Disk-verify gate 100% closed across both paths.
- **memory.db sprint-log finalize fix + backfill** — ✅ Sprint 197 missing-row bug fixed (`sprint-finalizer.ts` defensive `upsertSprintLog`); reconstruction tool `scripts/backfill-sprint-log-rows.mjs`.

Conditional/open:
- **✅ CI-CD GREEN (months-broken → FIXED Sprint 214, commit `b67c000`):** all GitHub Actions workflows pass — CI (Type Check, Security, every test shard, **Coverage Report 5m15s**, **Build 28s**), Docs, Cross-Platform E2E, Secret Scan. Coverage Report + Build now actually run (were never reached for months). **Root-cause family: green-local ≠ green-CI** (8 fixes): (A) non-hermetic tests reading gitignored `.deckent/config.json` / `.brain/memory.db` → skip-if-absent / MemoryStore mock (`spawn-backend-docker`, `nervous-faz1-smoke`, `tools.test` retro); (B) brittle assertion (`task-builder-skill` `===3000`→`>=3000`); (C) blocking `spawnSync` freezing the vitest worker (`dead-code-audit` → async spawn); (D) **Coverage-job teardown RPC starvation** on the 2-core runner (forks serialising v8 coverage at teardown) → `pool:'forks'` + `maxForks:2` under CI + `teardownTimeout:30s`; (E) 7 vitepress dead-links → GitHub URLs / absolute paths. Full pattern map: memory `project_ci_green_root_causes`. **Remaining hardening (Sprint 215):** `npm run test:ci-sim` (clean-state local reproducer) + CI-hermeticity lint + ci-guardian/ci-testing routing so this never silently regresses.
- **Multi-provider runtime** — abstraction ready; docker backend Claude-only, tmux/subprocess support Codex/Gemini (full docker parity = F1-004/005).
- **Messaging trio** (Discord/Telegram/WhatsApp) — scaffold present, token activation pending.
- **M1–M4 monitoring baseline auto-blocker** — ⬜ not built. Post-beta observability gate.
- **Documentation sync** — MASTER-PLAN consolidation done; remaining: README badge (190+ → 214+), unverified "96% context reduction" claim (no benchmark file), CLAUDE.md/DECKENT.md module-count re-sync (§3).

---

## 10. Sequencing — Sprint 212+ (consolidated, comprehensive)

Per Alperen's direction: **combine sprints, write larger comprehensive tasks** (Deckent handles the scale), keep the small-file/single-responsibility discipline *within* each task. Big-scope sprints, 10 workers, high parallelism.

| Sprint | Theme | Scope |
|--------|-------|-------|
| **212** | **Stability/Hygiene + Evolution crowning** | F5-004 real external callers (prompt-evolution + adaptive-agent wired into sprint lifecycle, scope includes caller modules); agent routing skew fix (skill→agent signal: frontend-design→frontend-designer, security-specialist→security-auditor); doc-reality sync; ≥1 forward task |
| **213** | **Killed** | Killed mid-sprint due to auth-precedence bug — mass synthetic NO_GO. All tasks cleared; Sprint 214 relaunched. |
| **214** | **P0 Auth-fix + User-Facing + IDE ext + 8-provider (DONE)** | Wave 0: auth-precedence fix (ADR-076). Wave A: serve token-inject + Path A embedded chat + chat CLI UX + F7-003 UI/UX. Wave B: VS Code extension real impl (commands/sidebar/statusbar/settings). Wave C: F1-009 8-provider (OpenAICompatibleAdapter + PROVIDER_MAP + bootstrap; ADR-077). Wave D: ADR docs + status. 20 tasks. |
| **215** | **✅ CI-Hermeticity Permanent + 8-Provider Fleet + Dashboard God-Level + Evolution Moat (DONE)** | 21 tasks, 6 waves, 0 failures. DALGA 0: `test:ci-sim` + `lint-test-hermeticity.mjs` + `sandbox-home.ts` + karpathy-discipline anchor. DALGA A: F1-009 bootstrap-register (DeepSeek/Qwen/GLM usable), `provider-overflow.ts`, `task-router.ts` per-worker auth uniform, 8-provider smoke. DALGA B: AppShell + terminal-sessions + EnterprisePage + MemoryExplorerPage. DALGA C: EvolutionPage + evolution-endpoint (3 GET) + NervousPage + `applyAdaptation` identity-mutation closed-loop + ADR-078 Part C. DALGA D: frontend-designer affinity fix + diversity guard + readme/module-count drift. DALGA E: ADR-078 + karpathy-discipline rule. CI yeşil KORUNDU. ADR-078 accepted. |
| **216** | **✅ DONE — Proof-of-Function DoD + serve F7-001** | ADR-079 accepted; `isUserSurfaceTask` Tier-0/Tier-1; in-sprint Smoke gate (`proof-of-function.ts`); serve localhost token auto-mint FIXED (run-proven). |
| **217** | **Killed (placeholder sprint — no impl)** | Sprint launched as placeholder with no task content; NO_GO. Root bug (self-mutation guard) confirmed and fixed in Sprint 218. |
| **218** | **✅ DONE — Dashboard God-Level (hollow → run-proven)** | DALGA ÖN: git self-mutation guard P0. DALGA 0: sprint-start detach (serve no longer freezes). DALGA A: 4 hollow pages wired (route+sidebar), chat real round-trip, DirectivesEditor. DALGA B: god-level UI (use-live-data SSE/stale-while-revalidate, theme tokens, Layout shell). DALGA C: ADR-080 + dashboard guide + e2e tests. F7 → ~95%. |
| **219** | **✅ DONE — Native Agentic Deckent (Agentic-OS + F2 Streaming + Dashboard Kalıcı-Fix)** | DALGA A: `deckent` argümansız → agentic REPL (219-001, ADR-081); `runChatNativeLoop` run-proven (219-002); REPL UX god-level (219-003). DALGA B: doğal dil → MCP aksiyon dispatch (219-004); riskli onay kapısı (219-005); oturum persist (219-006). DALGA C: F2-007 token-streaming SSE `chat-stream.ts` + `/api/chat/stream` (219-007); dashboard akan render (219-008). DALGA D: dashboard nav tek-kaynak + RENDER-based test (219-009); cache-bust e2e smoke (219-010). DALGA E: TR MASTER-PLAN (219-011) + ADR-081 (219-012). DALGA F: blueprint.md güncel (219-013); `autonomous-runtime.ts` iskelet (219-014). DALGA G: `routeTaskV2` wire (219-015); Smoke field propagation (219-016). **ADR-081 accepted.** CI yeşil KORUNDU. |
| **220** | **✅ DONE — Native-LLM-Wire + Nervous-Activation + Dashboard-v2 Canlı (ADR-082)** | DALGA A: `chat_provider ?? brain_provider ?? 'claude'` config-driven native wire — REPL gerçek cevap (220-001); `chat --once/--message` headless (220-002); agentic dispatch canlı (220-003). DALGA B: WorkerGrid SSE real-time (220-004); StatusPage done→done (220-005); RefreshButton cooldown (220-006); ChatPage round-trip+akan (220-007). DALGA C: coverage-endpoint+/api/coverage (220-008); DebtPage filtre (220-009); EnterprisePage auth+dedup+provider-neutral (220-010). DALGA D: Nervous Faz-1 — `createNervousSystemIfEnabled` bootstrap (220-011); 8 action-handler (220-012); config enabled:true (220-013). DALGA E: ADR-082+MASTER-PLAN (220-015/016). **ADR-082 accepted.** `deckent` GERÇEKTEN konuşur. Nervous aktif. CI yeşil KORUNDU. |
| **221** | **✅ DONE — REPL Tam-Kapsam + Provider-Parity + Local-Model-Foundation (ADR-083)** | DALGA A: handleReplCommand canlı slash-wire (221-001); classifyAgenticIntent/dispatchAgenticIntent wire (221-002); buildSlashRegistry canlı katalog (221-003); renderStatusLine config-driven (221-004). DALGA B: ollama-local+openai-compat REPL round-trip zero-API (221-005); resolveChatAdapter 5-fleet parity (221-006); resolveChatProvider fallback chain (221-007). DALGA C: dispatchEnterpriseSlash köprü (221-008); resolveChatMode user/enterprise (221-009); CHAT_CONFIG_SCHEMA 3-katman (221-010). DALGA D: ChatPage streaming+slash dashboard (221-011); Layout chat-first (221-012). DALGA E: CLI argüman-routing fix (221-013); smoke field propagation fix (221-014); ADR-083+MASTER-PLAN (221-015). **ADR-083 accepted.** REPL tam-kapsamlı (canlı slash+agentic+status-line). Ollama-local birinci-sınıf (zero-API). Provider-parity 5-fleet. CI yeşil KORUNDU. |
| **222** | **✅ DONE — REPL hız + görsel + nervous wire-gap** | persistent-session module + slash/status-line/streaming wire (ADR-085 hattı). Nervous OOM-NO_GO'lar carry → 223. |
| **223** | **✅ DONE — Persistent-wire + GUI-UX + nervous recover** | persistent-session entry.ts WIRE (2.msg <1s); layout (`›`/`● deckent`) + spinner + slash dispatch (PR #18 main'e indi); nervous/finalizer WIP `recover-sprint223-nervous-finalizer` branch'inde kurtarıldı. |
| **224** | **⚠️ IN PROGRESS — Native CLI Parity (F11) + Ink REPL pivot** | **El-kodlu DONE (PTY+disk-verified):** terminal-mode input (001), prompt-dedup (002), real token-streaming (011), kraken-renkli+sabit-fiil ticker (014/018), agentic-DO tool-exec+confirm+wire (005/006), permission memory (016), `/` completer (017), **pinned-bar F11-007, `/`-menü F11-008, markdown-stream F11-009, token-sayaç F11-010, canlı-aktivite F11-011, tıklanır-path F11-013, paste-coalescer (004)**. **Dogfood dalgası (deckent paralel, ayrık-dosya):** AI plan-mode dürüst-hata fix (224-015); `/nervous` wire (224-008); banner wire (224-009); nervous re-enable (224-010); smoke harness'lar (224-027); **ADR-086 accepted (224-012/006)**. **🆕 Ink (React-for-CLI) pivotu (F11-016):** `ink ^7.0.5`+`react ^19.2.7`, `src/cli/repl/` (`app.tsx`/`input-bar.tsx`/`run.tsx`) — manuel-TUI'yi supersede eden kanonik render yolu; **ADR gerekli** (ink+react dep kararı vs ADR-010), stabilize oluyor. **Yan-iş:** retro/mem `## Gains`+`Delivered:` (geriye-dönük hafıza zenginliği, `c0f96a1a`). **KALAN:** F11-012 UTF-8/Türkçe encoding-audit, F11-014 multi-provider parity, F11-016 Ink stabilizasyon. CI yeşil KORUNDU. |
| **226** | **🔜 Otonom Sürekli Runtime Wire (F3-009)** | DIRECTIVES Sprint 226 (7 task). `autonomous-runtime.ts` DI-iskeletinin 5 mock adapter'ını GERÇEK subsisteme bağlar: AuthorityChecker→`checkAuthority` (226-001), AuditSink→`writeEvent` (226-002), ApprovalGate→nervous pending **OTO-APPROVE YOK** (226-003), ActionExecutor→`ActionHandler` registry (226-004), TriggerSource→scheduled-flow+self-dispatch (226-005); [P0] sürekli loop + composition root (226-006); `deckent autonomous` CLI (226-007). **F3-009 ~%40→~%80.** Güvenlik invariant: default-deny + insan-onay-gate, oto-sprint-start YOK. Wave-1 (001-005) paralel, Wave-2 (006→007) elle sıra. |
| **227** | **🔜 Platform + Model-wire + Dormant-activation** | DIRECTIVES Sprint 227 (8 task, kod-doğrulanmış, tek-wave paralel). 227-001 Windows backend (F3-010); 227-002 ⭐ models.dev dinamik map (F1-011); 227-003 ecosystem→routing; 227-004 self-mod enforcement flag-gated; 227-005 ADR-038 ölü/orphan disposition (`multi-agent.ts`+`decision-replay.ts`); 227-006 worker-koordinasyon wire (handoff+heartbeat→sprint-controller); 227-007 shared-memory wire (worker context); 227-008 [P0] docker live-monitor (SSE mount + `watch --follow` + WorkerCard). W-K (Sprint 227) ile eş. Brand-foundation (A1) hariç (paralel Ink REPL, Alperen elle). |
| **AS-2·P1** | **🔜 Multi-provider foundation + Ollama agentic-worker e2e (ANAHTARSIZ)** | §4A AS-2 Faz 1 — config-driven provider registry + `ProviderName`→string + **agentic HTTP-worker** + per-worker **auth-izolasyon kontrat/test**; Ollama (local, zero-cost) ilk gerçek agentic worker → sprint içinde `.result`. Subscription-safe, API key gerekmez. **Hafta sonu Ollama kurulumu sonrası.** F1-012/013/014. |
| **AS-2·P2–P4** | **🔜 Mixed fleet + REPL switcher / failover / Bedrock (API flag-gated OFF)** | §4A AS-2 Faz 2-4 — any-key OpenAI-compat config + per-worker mixed fleet + REPL/terminal provider-switch parity + non-leak fleet test (P2); overflow/fallback/429-switch + models.dev dynamic (P3, F1-010/011); Bedrock SigV4 +Vertex (P4, F1-015). **Maliyet:** yalnız ucuz-key basit sprint / ayrı sandbox proje / deckent-hub geliştirmesinde egzersiz; beta'da default-OFF. AS-6/F3 otonomun enabler'ı. |
| **AS-5·P1** | **🔜 MCP-client broker + REPL + yönetim CLI (Claude-parity)** | §4C AS-5 Faz 1 — `McpClientBroker` (`src/mcp-client/`, SDK Client, yeni dep yok) + 3-scope `.mcp.json` + `deckent mcp add/list/remove` + `/mcp` + dynamic discovery + REPL confirm-gate dispatch + audit. Thin e2e: yerel stdio reference server ekle→listele→agentic çağır→audit. Yerel/ücretsiz. F9-001/002, F11-015. |
| **AS-5·P2–P3** | **🔜 Worker surface + otonom/enterprise MCP-client** | §4C AS-5 Faz 2-3 — worker tool-injection + IPC→broker + RBAC scope/non-leak test (P2); AS-6 action-executor wire + remote HTTP+OAuth + per-tenant isolation + risk-tagged approval + dashboard MCP sayfası (P3). F9-003, F10-002, ADR-037/040. |
| **AS-4·P1–P3** | **🔜 Provider-native capabilities (Capability Realization Layer)** | §4D AS-4 Faz 1-3 — CapabilitySpec + `realizeCapabilities` + Claude `--append-system-prompt`/`--agents`/`--mcp-config` native + graceful text-fallback (P1, AS-5 köprü); native skills/plugins `--setting-sources`/superpowers opt-in (P2); nested ultracode/Workflow flag-gated + cost-gate (P3). Multi-provider parity korunur (AS-2). |
| **AS-3·P1–P3** | **🔜 Zero-hardcode + full i18n (every-nation)** | §4E AS-3 Faz 1-3 — per-locale `locales/<xx>.json` catalog + dynamic `SUPPORTED_LANGS` + `lint-i18n-hardcode` guard + en/tr migrate (P1); tam yüzey sweep (dashboard/MCP-desc/error/wizard) + `.codex`/`.gemini` rules sync (P2); add-a-language path + local-Ollama çeviri-seed + Track B zero-hardcode live-data audit/guard (P3). |
| **228+** | **F2 Native SDK (Path C) + F9 MCP-client + Publish Readiness** | Real standalone SDK; zero-prerequisite `npx deckent`; MCP client (consume external); secret-scrub/gitleaks; .github eksikleri; 96%-claim doğrulama; threat-model — Q3 2026 |
| **post-beta** | **Provider/local LLM + million-user hardening** | F1-004/005, sub-#5 Ollama/CUDA fully-local preset, OTel/Prometheus (W-J), ADR-037 hard-flip V2, sub-#2 self-security |
| **post-beta (gated)** | **Voice + Mobile (milestone-gated)** | Voice (STT Whisper, wake-word Porcupine, TTS, real-time streaming) gated behind **10K GitHub stars**; Mobile (React Native iOS/Android MCP client, APNs+FCM push, Contacts/GPS/camera skills) gated behind **50K stars**. Both not built — zero source references |
| **post-beta (if approved)** | **AEGIS methodology (ADR-061)** | Forward-looking spec (status=proposed): 3 layers, 5 roles, 8 artifacts, 9-phase lifecycle, EffectClass-aware verification. Phase 0–5 (orig. Sprint 175–200) never executed — no `src/aegis/`. Phase-1 foundation is the entry point if approved |
| **post-beta (ecosystem)** | **Capability Broker (F8) + MCP Client (F9) + Policy Engine (F10) + Workflow Composer (F3-008) + Agent Mesh (#3-mesh)** | From the Copilot enterprise-vision analysis (Sprint 212), DNA-filtered. F9 (consume external MCP servers) is the highest-value, ecosystem-opening one. All self-hosted, no new SaaS dependency. Sequence after the native-chat arc |

---

## 10A. Completion Roadmap — 5-10 Sprint Arc (AS sequencing)

> **Onaylı sıra (Alperen 2026-06-04):** run-ready'ler önce, sonra fresh-design. **"Tamamlanmış ürün = agentic run ecosystem"** bu arkla gerçekleşir (DIRECTIVES 224 ✅ + 226/227 + AS-1…AS-6). Her sprint koşmadan önce DIRECTIVES.md'de **tek-sprint'e izole** + **commit-first** (`project_deckent_self_git_mutation_bug`). Sprint sayacı label'dan bağımsız otomatik artar. **Şu anki baş: S1 = Sprint 226** (live `DIRECTIVES.md`). **Koşulabilir backlog DIRECTIVES'ler:** `docs/sprints/` (S3 AS-5·P1, S4 AS-4·P1, S7 AS-3·P1 hazır; S2=227 `.brain/archive/`'de; S5/S6/S8-10 TODO) — swap rehberi `docs/sprints/README.md`.

> **✅ GERÇEK KOŞU DURUMU (2026-06-05 reconcile — aşağıdaki S-etiketleri plan-zamanı tahminiydi; gerçek sayaç 232):** **226** AS-6 autonomous ✅ · **227** S-INT Brain-integrity ✅ · **228** AS-6 finalize ✅ · **229** AS-5·P1 MCP-client ✅ · **230** AS-1 Platform ✅ (Windows-backend + models.dev-wire dahil) · **231** Brain-convergence ✅ · **232** memory-loss-5-katman ✅ (build-doğrulaması bekliyor). → **AS-1 + AS-5·P1 + AS-6 çekirdek + S-INT CANLI.** **KALAN:** S4 (AS-4 capability) · S5 (AS-2 Ollama, haftasonu) · S6 (AS-1 hardening 21-task) · S7 (AS-3 i18n/zero-hardcode) · S8-S10 (post-beta) + §4G kalan (REPL/DASH/PLANOBS) + **dashboard FAZ5 (mockup-fidelity)**.

| # | Sprint | İçerik | Alt-sistem | Maliyet | Durum |
|---|--------|--------|------------|---------|-------|
| **S1** | Sprint 226 | Otonom Runtime Wire (F3-009, 7 task) | AS-6 çekirdek | subs | ✅ run-ready (DIRECTIVES) |
| **S2** | Sprint 227 | Platform + Dormant-wake (8 task) | AS-1 çekirdek | subs | ✅ run-ready (DIRECTIVES) |
| **S-INT** | **🔴 P0 Brain RETRO/Export/Decay integrity fix** | §4F — rubric-78.75 (non-diagnostic) + sprint-içi export-wipe (.md boşalıyor) + memory-decay-wipe (159 learning DB'den uçtu). **Öneri: platform'dan ÖNCE** — her sprint veri kaybediyor. ADR-070 ailesi. | subs | ✅ **DONE Sprint 227** (c58bb50d; build-pending → 228+ aktif) |
| **S3** | AS-5·P1 | MCP-client broker + REPL + `deckent mcp` CLI (Claude-parity) | AS-5 §4C | local/free | tasarım ✅ |
| **S4** | AS-4·P1 | Capability Realization Layer + Claude native passthrough | AS-4 §4D | subs | tasarım ✅ |
| **S5** | AS-2·P1 | Ollama agentic-worker foundation (anahtarsız) | AS-2 §4A | local/free | hafta sonu Ollama sonrası |
| **S6** | AS-1·ext | Hardening kalan: Job-Object, worker-attach PTY, RBAC-hard, 429-switch, cost-billing, auditor-async, docker-parallel, planDispatch | AS-1 | subs | 21-task merge |
| **S7** | AS-3 | Zero-hardcode + i18n sweep (`getMessage` → tüm user-facing; canlı-veri) | AS-3 | subs | mekanik |
| **S8** | AS-5·P2 + AS-4·P2 | Worker MCP surface + RBAC; native skills/plugins (`--setting-sources`/superpowers) | AS-4/5 | subs/local | tasarım ✅ |
| **S9** | AS-6 full + AS-5·P3 | process/batch mode + autonomous polish; otonom/enterprise MCP (remote+OAuth, per-tenant) | AS-6/5 | subs | — |
| **S10** | AS-2·P2-P4 + AS-4·P3 | mixed-fleet/Bedrock (sandbox/cost-gated) + nested ultracode/Workflow + GA polish | AS-2/4 | API (sandbox) | cost-deferred |

> **Dürüst kapsam:** S1-S9 subscription/local (cost-safe, beta-içi koşulabilir); **S10** API mixed-fleet/Bedrock → sandbox/cost-gated, post-beta/ayrı proje (`project_api_mode_deferred_post_beta`). 10 sprint sonunda her alt-sistemin **çekirdeği canlı + beta-GA-ready**; uç fazlar (full API mixed-fleet, nested workflow, full-autonomy) post-beta'ya sarkabilir — abartısız tahmin.

---

## 11. Anchor Rules / DNA / Governance (unchanged)

- **No MVP, ever** — god-level scope; ask "is this god-level?" (`feedback_no_minimum_no_mvp_deckent`).
- **Disk-verify ground truth** — trust the disk, not Brain verdict or worker self-assessment (`feedback_trust_brain_eval_not_worker`).
- **Subscription-first** — API mode forbidden during beta (`project_api_mode_deferred_post_beta`).
- **npm publish = manual Alperen** (`feedback_npm_publish_user_approval`).
- **Karpathy 4-discipline** worker anchor (Think / Simplicity / Surgical / Goal-driven).
- **Wire proof must measure the goal, not the letter** — exclude def-file from caller greps; wire-task scope must include the caller (`feedback_directive_kanit_letter_vs_goal`).
- **Memory budget** 900 lines max in `.brain/`.
- **MASTER-PLAN = her zaman güncel proje defteri** (Alperen 2026-06-04) — planlanan / yapılan / devam-eden **TÜM** iş burada kayıtlanır: brainstorm'lanan tasarımlar §-bölümü (örn. §4A AS-2), alt-sistemler §4B haritası, sprint'ler §10 satırı. Dağınık dokümana değil, **buraya**. Bu, "single source of truth" kuralının operasyonel hâli.
- **ADR-033** Product-Not-Service · **ADR-037** RBAC authority matrix · **ADR-041** agent taxonomy · **ADR-040** nervous system · **ADR-062** embedded terminal · **ADR-074** native chat + enterprise + evolution.

---

## 12. Top Risks

1. **F5 stays dormant** — entry-points without callers read as "DONE" but ship dead code; the evolutionary moat is unproven until F5-004 lands real callers. *Mitigation: Sprint 212 priority + per-sprint visible-change evidence.*
2. **Routing collapse** — agent diversity is fragile/non-deterministic; specialization value lost if everything routes to `refactorer`. *Mitigation: skill→agent activation signal (212-008; frontend-design→frontend-designer mapping still incomplete — Sprint 213 plan sent UI to architecture-planner).*
5. **✅ Auth-precedence bug (RESOLVED Sprint 214):** `spawn-backend-docker.ts` env-forwarding is now provider+auth-aware — `ANTHROPIC_API_KEY` is stripped for Claude subscription workers and only forwarded when `authMode=api`. Sprint 215+ launches without `env -u`. ADR-076 Part A. ([[feedback_container_auth_precedence]])
3. **Native-chat scope creep** — IDE extension + Path A + Path C is multi-sprint; risk of half-built surfaces. *Mitigation: strict sequence (hygiene → IDE → web → SDK), one surface fully landed before the next.*
4. **Doc-reality drift** — this consolidation fixes today; re-drift if future status lands only in scattered docs. *Mitigation: MASTER-PLAN is the only roadmap that gets status updates; others are frozen historical.*
6. **✅ Non-hermetic tests / CI red (RESOLVED Sprint 214, commit `b67c000`):** green-local ≠ green-CI (tests reading gitignored `.deckent/config.json` / `.brain/memory.db`, blocking spawnSync, 2-core coverage-teardown RPC starvation) is FIXED — full CI green incl. Coverage + Build. *Residual risk: regression if new tests re-couple to local state; mitigated by Sprint 215 `test:ci-sim` + CI-hermeticity lint.* (memory `project_ci_green_root_causes`)

---

## 13. Explicitly Out-of-Scope (considered & deferred — recorded for zero-loss)

Items surfaced during the Sprint 211 doc-consolidation audit that were intentionally **not** added to the active plan, with reasons (so nothing silently vanishes):

- **Cloud-hosted SaaS offering** — rejected by ADR-033 (Product-Not-Service); permanent non-goal.
- **Microsoft-ecosystem core integration** (Graph / Teams / Outlook / Excel / Word / SharePoint) — from the Copilot analysis; considered & **deferred as optional, post-GA, non-core**. May ship as opt-in `connectors/` (the existing Discord/Telegram/WhatsApp pattern) but must NOT become a core direction — it would dilute the provider-free / self-hosted / anti-Devin DNA. Not an "Enterprise Edition."
- **LangSmith / external trace SaaS** — rejected: violates "never calls home". Use self-hosted OTel + own trace-graph (W-J) instead.
- **"Enterprise Operating Layer" positioning** — the Copilot framing; Deckent stays "install-and-run, MIT, self-hosted", not a managed enterprise platform. Enterprise *capabilities* ship under MIT (no gated edition).
- **Extra provider adapters** (Groq, Fireworks, Together, litellm), **embeddings/RAG**, **SWE-bench harness**, **monorepo planner**, **skill template gallery**, **blog campaign** — P3+/aspirational; Claude/OpenAI/Google/Ollama footprint meets beta GA.
- **`deckentd` daemon, Electron tray, native-window framework** — redundant vs Tauri/PWA + embedded terminal; out of scope.
- **Vector DB, Devin-style wiki semantic indexing, multi-model critique layer, browser/computer-use, deploy capability, progressive-disclosure UX, intent-classifier learning loop, hardware-attested HMAC** — post-GA vision/competitive-gap items with no current code foundation.
- **Verified non-issues** (claimed bugs that don't exist): memory-rebuild CLI split (Bug Z3 — semantics already correct), `auditor.md` PATTERNS.md regression (template clean), dedicated `brain-self-update.ts` module (hooks already dispersed correctly).
- **Already-adequately-represented partials** (Reversibility/EffectClass, TaskType extensibility, ADR-055 Hybrid Scoring, ADR-060 Self-Awareness, Nervous Phase 2/3, context-aware routing, rule-evolver) — folded into existing §3/§4/§5/§7 status text rather than duplicated.

---

*Single source of truth. Update this document — not the superseded roadmaps — when status changes.*
