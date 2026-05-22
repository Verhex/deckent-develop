# W1-T09 — Feature Envanteri ve Doğruluk Denetimi

**Sprint:** 188 (Self-Analysis)
**Task:** 188-009 (W1-T09)
**Tarih:** 2026-05-22
**Tür:** ANALYSIS-ONLY — kaynak kod / doküman / config değiştirilmedi
**Worker:** w-188-009 (docker backend, opus, low effort)

> Bu rapor `IDENTITY.md` "Features", `DECKENT.md` Memory V2 / MCP / Architecture, `README.md` "Highlights" + "Key Features", `CLAUDE.md` Architecture bölümlerinde ilan edilen tüm özellikleri çıkarır ve her birinin kod tarafındaki gerçek durumunu (**canlı / yarı-wire / dormant / dead / iddia**) `dosya:satır` kanıtıyla sınıflandırır. Memory V2 sonrası bayat referansların güncelliği ayrı bölümde işlenir. Sınıflandırma kriterleri Bölüm 1'de tanımlanmıştır.

---

## 1. Yöntem ve Sınıflandırma Kriterleri

**Kaynak materyal:**
- `/workspace/.deckent/workspace/IDENTITY.md` satır 23 — "Features:" satırının uzun listesi (40+ feature)
- `/workspace/DECKENT.md` Memory V2, MCP, Providers, Agents, Skills, Workflow blokları
- `/workspace/README.md` "Highlights" (satır 50–53), "Key Features" (140–181), "MCP Integration" (398–456), "Comparison" tablosu (190–209)
- `/workspace/CLAUDE.md` "Architecture" (modül sayıları, alt-sistem isimleri)

**Sınıflandırma:**

| Etiket | Tanım |
|--------|-------|
| **CANLI** | Production runtime path'inden çağrılır (CLI, MCP, sprint controller, brain). Test dışı en az 1 caller. |
| **YARI-WIRE** | Wire mevcut ama config-gated default-off / opt-in flag. Sprint'te aktive olabilir. |
| **DORMANT** | Sınıf/fonksiyon export edilir, `src/` içinde 0 caller; sadece test'lerde anılır. |
| **DEAD** | Hiç çağrılmaz + manifestte/CLI'de erişim yolu yok. |
| **STUB** | Kasıtlı placeholder; gerçek implementasyon ileriye atılmış. |
| **İDDİA** | Kaynak materyalde adı geçer fakat koda karşılık gelen sembol yok. |

**Çapraz referans:** Sibling raporlar `cli-command-inventory.md` (T01), `mcp-tool-inventory.md` (T02), `nervous-connectors-providers-health.md` (T06), `agents-monitor-health.md` (T05) ground-truth kaynağı olarak kullanılmıştır.

---

## 2. Çekirdek Orchestration Özellikleri

| Feature | İlan Kaynağı | Sınıf | Kanıt |
|---------|--------------|-------|-------|
| Sprint Lifecycle (8-phase) | README:143, DECKENT.md "Sprint Yasam Dongusu" | **CANLI** | `src/orchestra/sprint-controller.ts:583+982` runSprint akışı; PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP fazlar. |
| Dual Mode (sprint + task) | README:65, IDENTITY "Features" | **CANLI** | `src/cli/commands/mode.ts:38`, `src/orchestra/task-mode-runner.ts`, `src/core/config-types.ts deckent_style: 'sprint'|'task'`. |
| Multi-Worker Parallel (≤10) | README:145 | **CANLI** | `src/orchestra/sprint-spawner.ts` + tier config `mode-presets.ts:38–55` (`max_workers`). |
| GO/NO-GO Evaluation | README:146, brain.md kuralları | **CANLI** | `src/orchestra/result-evaluator.ts`, `worker.ts:347` selfAssessment shape. |
| Auditor Quality Gate | README:147 | **CANLI** | `src/monitor/auditor.ts` 2836 LoC; scan loop, boundary diff, lock-stale (T05 §4). |
| Sprint-Reporter 4-Way Split | IDENTITY Sprint 134 T-009 | **CANLI** | `src/orchestra/sprint-reporter.ts` (+ `sprint-finalizer.ts`, `sprint-retro-writer.ts`, `sprint-docs-updater.ts`). |
| Coordinator Resilience | IDENTITY Sprint 135 T-001 | **CANLI** | `src/cli/commands/start.ts:223` "Orphan Detection (Sprint 135 — coordinator resilience)". |
| `sprint-controller.ts` Slim (1890→209) | IDENTITY Sprint 136 T-008 | **CANLI** | God-object split ADR-024/026 sonrası `sprint-controller.ts` re-export shim, gerçek mantık `sprint-finalizer.ts:1198` + `sprint-phases.ts`. |
| Brain Spurious NO_GO Reconciliation | IDENTITY Sprint 136 T-003 + 137 wire | **CANLI** | `src/orchestra/result-evaluator.ts` (reconciliation), `mid-sprint-adapter.ts` rerouting. |
| Long-Running Sprint Resume MVP | IDENTITY Sprint 138 Task 9, README:385 | **CANLI** | `src/orchestra/sprint-checkpoint.ts` + `src/cli/commands/resume.ts`. |
| Mid-Sprint Adapter | DECKENT Arch | **CANLI** | `src/orchestra/mid-sprint-adapter.ts` — FIX phase real-time reroute. |

**Bulgu C-01:** Sprint Lifecycle iddiası (8-phase) kodla **tam uyumlu**. RETRO/DECAY/CLEANUP `sprint-finalizer.ts:887` + `cleanup.ts:111 runDecay`.

---

## 3. Güvenlik & Yetki Özellikleri

| Feature | İlan Kaynağı | Sınıf | Kanıt |
|---------|--------------|-------|-------|
| AST Sandbox (skill) | README:150 "AST validation", DECKENT.md skill-pool | **CANLI** | `src/core/marketplace/skill-sandbox.ts`, `src/core/skill-pool.ts`, `src/core/plugin-loader.ts`. |
| Scope Enforcement (filesWrite) | README:151 | **CANLI** | `src/agents/worker.ts:492-533 isWithinScope` realpath+ELOOP guard. |
| RBAC Protocol (ADR-037) | README:152, IDENTITY Sprint 139 T-34/35 | **YARI-WIRE** | `src/agents/worker.ts:537-574 checkWorkerAuthority` — advisory: `console.warn + emitAuthorityViolation` ama **her zaman `true`** döndürür. `src/orchestra/authority-enforcer.ts:299` Layer-1 lint. DECKENT gotchas "runtime advisory/soft" bunu kabul eder. |
| `.deck` Secret Interpolation | README:153, ADR-014 | **CANLI** | `src/core/deck-file.ts` + `src/core/deck-interpolation.ts`; `discord.ts`/`telegram.ts` `$DECK:` kullanır (T06 §3). |
| Brain Self-Audit Gate | IDENTITY Sprint 138 Task 1 alt-kombinasyon, README:359 | **CANLI** | `src/orchestra/sprint-finalizer.ts:222 runSelfAuditGate` — tsc+vitest+honesty+observability; CLI `audit.ts:17` + `recover.ts:39` çağırır. |
| Auditor Authority Extension 3-Pipeline | IDENTITY Sprint 138 T3 | **YARI-WIRE** | `src/monitor/auditor.ts` `verifyWorkerResult/verifyFunctional/validateTechDebt/checkADRCompliance` mevcut (pilot ADR-006/008/010). Pilot kapsam — tüm ADR'lere yayılmadı. |
| Layer 4 Runtime Wire (ADR-006) | IDENTITY Sprint 138 Task 6 | **CANLI** | `src/orchestra/authority-enforcer.ts` + ADR-006 enforcement breadcrumb log. |
| Self-Modifying Task Detection (ADR-038) | IDENTITY Sprint 139 T-51/52 | **DORMANT** | `src/orchestra/self-modifying-detector.ts:130 isSelfModifying` + `:155 isSelfModifyingSprint` — **0 caller** dışında `src/` (sadece kendi içinde, line 162). `authority-enforcer.ts:48` `isSelfModifyingSprint?: boolean` parametresi alır ama bu detector'dan **çağrı yok** — boolean dış kaynaktan iletilmek üzere kurgulanmış. Kritik mimari koruma için *intent-ready* ama wire eksik. |
| Verify Loop (worker-verify) | worker-default.md, IDENTITY | **DORMANT** | `src/agents/worker-verify.ts:163 runTestVerifyLoop` + `:454 enforceVerifyLoop` — **0 caller**; sadece docstring `worker.ts:345` "callers MUST run" iddiası var. Worker-default.md V1.0 not zaten "prompt talimatı, kod-enforce DEĞİL" diyor. |
| Embedded Web Terminal (ADR-062) | README:50, "Highlights" | **CANLI** | `src/api/terminal/` 8 modül (`ws-gateway.ts`, `session-backend.ts`, `audit-integrity.ts`, `command-guard.ts`, `auth-provider.ts`, vs.). |
| Terminal: prompt-guard | README:51 | **CANLI** | `src/api/terminal/prompt-guard.ts` + ws-gateway.ts:12 import. |
| Terminal: command-guard | README:51 | **CANLI** | `src/api/terminal/command-guard.ts`. |
| Terminal: outbound-limiter | README:51 | **CANLI** | `src/api/terminal/outbound-limiter.ts:41 class OutboundLimiter`; `ws-gateway.ts:13,24` kullanır. |
| Audit HMAC-SHA256 chain | README:51 | **CANLI** | `src/api/terminal/audit-integrity.ts` + `audit.ts`; `audit-verify.ts:21` CLI. |

**Bulgu G-01:** ADR-037 RBAC `worker.ts:570,573` koşulsuz `return true` — runtime advisory/soft, hard-flip V2 post-GA (DECKENT.md gotchas onaylar). README "strict role boundaries" tabiri yanıltıcı.
**Bulgu G-02:** ADR-038 self-modifying-detector tamamen kütüphane modu; gerçek "deckent-dev'i koruma" senaryosunda *kim* `isSelfModifyingSprint=true` set edecek? Wire boşluğu kalıcılaştı.

---

## 4. Hafıza & Akıl Özellikleri (Memory V2)

| Feature | İlan Kaynağı | Sınıf | Kanıt |
|---------|--------------|-------|-------|
| Memory V2 DB-First (SQLite FTS5) | README:157, DECKENT.md "Memory V2" | **CANLI** | `src/core/memory-store.ts:81 class MemoryStore`, `memory-query.ts:160 searchMemory`. |
| Dual-Layer Turkish Normalize | README:157 | **CANLI** | `src/core/memory-normalize.ts:14 turkishNormalize` — FTS5 unicode61 diakritik fix. |
| Brain Auto-Query (Task DNA) | README:158, DECKENT.md | **CANLI** | `memory-query.ts:402 buildAutoQuery` (PLAN/SPAWN/EVALUATE entegrasyonu). |
| `.brain/memory.db` SQLite | DECKENT.md | **CANLI** | better-sqlite3 dep + `MemoryStore` constructor. |
| Memory Export (.md snapshot) | API-surface | **CANLI** | `src/core/memory-export.ts`; `cli/commands/memory.ts:14 registerMemory` → export/rebuild/stats. |
| Memory Import (.md → DB) | API-surface | **CANLI** | `src/core/memory-import.ts` parseDecisionsMd/parseMemoryMd/parseDebtMd. |
| 96% Context Reduction iddiası | README:157 | **İDDİA (ölçüm yok)** | Benchmark/metrik kaynağı bulunamadı — pazarlama iddiası, kod kanıtı yok. |
| `deckent_memory_query` MCP | DECKENT.md | **CANLI** | `src/mcp/tools/memory-query.ts:10 server.registerTool` (T02 listesinde). |
| `deckent recall/remember/memory` CLI | README:322–327 | **CANLI** | `src/cli/commands/recall.ts`, `remember.ts`, `memory.ts`. |
| FTS5 dual-layer (original + turkishNormalize) | API-surface | **CANLI** | Schema 8 sütun FTS5 (4 original + 4 normalize) `memory-store.ts`. |
| Self-Learning (config suggestions) | README:159 | **YARI-WIRE** | `sprint-retro-writer.ts` retrospective yazıyor; "auto-suggest config tweak" kapsamı sınırlı — sadece NO_GO oranı / coverage metrikleri raporlanıyor, otomatik config patch yok. |
| Brain Budget Auto-Decay | IDENTITY Sprint 135 T-013 | **CANLI** | `src/cli/commands/cleanup.ts:111 runDecay`, `orchestra/index.ts` export; `decay_after_sprints` config opsiyonu. |

**Bulgu M-01:** Memory V2'nin tüm temel taşları (store, query, normalize, export, import) **canlı**. ADR-046 step ordering (memoryExport → adrInsert → ruleRegen → updateProjectDocs) `sprint-finalizer.ts:1198+` enforce ediyor.
**Bulgu M-02:** "96% context reduction" iddiası kanıtsız — benchmark dosyası yok. README'de düşürülmeli veya `docs/benchmark/memory-v2.md` eklenmeli.

---

## 5. Ajanlar, Yetenekler & Routing

| Feature | İlan Kaynağı | Sınıf | Kanıt |
|---------|--------------|-------|-------|
| 15 Built-in Agents | README:162, DECKENT.md | **CANLI** | `src/core/agent-pool.ts AgentPoolManager` + 15 manifest `src/core/builtins/agents/*/`. |
| 21 Built-in Skills | README:163 | **CANLI** | `src/core/builtins/skills/*/manifest.json`. |
| Temp Agent & Skill Generation | README:164, DECKENT.md | **YARI-WIRE** | `src/orchestra/temp-skill-generator.ts` mevcut; sprint-finalizer'da koşullu çağrı. Default-off kararı belirsiz. |
| Agent Evolution Pipeline (promote/demote) | README:165, IDENTITY | **CANLI** | `src/orchestra/promotion-pipeline.ts`, `sprint-finalizer.ts` + `sprint-planner.ts` import. |
| 3-Layer Routing (intent→activation→engine) | DECKENT.md | **CANLI** | `intent-classifier.ts`, `activation-engine.ts`, `routing-engine.ts:routeTaskV2`. |
| TaskDNA + V2 Manifest | DECKENT.md | **CANLI** | `routing-types.ts` TaskDNA, ActivationConfig; `manifest-migrator.ts` V1→V2. |
| ModelRegistry (13 models, 4 tier) | README:169–170 + DECKENT.md | **CANLI** | `src/core/model-registry.ts:43 BUILTIN_MODELS` + `:190 class ModelRegistry`; `grep id:` 18 kez (id alanı dahil), 13 provider satırı. |
| Tier-Based Routing (`brain_tier`/`worker_tier`) | README:170, ADR-023 | **CANLI** | `mode-presets.ts:16 brain_tier`, `auto-setup.ts:43 selectTiers`. |
| Context-Aware Routing | IDENTITY | **CANLI** | `routing-engine.ts routeTaskV2` confidence + override resolution. |
| Token Usage Tracker | IDENTITY | **CANLI** | `task-types.ts tokenUsage` Zod schema; `cli/commands/cost.ts:214 registerCostCommand` + `core/cost-calculator.ts`. |
| Token Cost Calculator | README:`deckent cost` | **CANLI** | `core/cost-calculator.ts` + `cost-config-loader.ts`. |
| Auto-Generated Rules (rule-evolver) | DECKENT.md | **YARI-WIRE** | `src/orchestra/rule-evolver.ts` + sprint-finalizer ruleRegen step; sprint sonrası adım canlı ancak çıktı `.claude/rules/` opsiyonel. |
| Outcome Tracker (synergy matrix) | DECKENT.md | **CANLI** | `src/orchestra/outcome-tracker.ts` — routing kararları + bonus. |
| Quality Assessor (multi-dim) | DECKENT.md | **CANLI** | `src/orchestra/quality-assessor.ts`. |

**Bulgu R-01:** Manifest sayıları (15 agent, 21 skill) `src/core/builtins/` ile birebir uyumlu. ADR-041 horizontal skills / vertical agents bölünmesi koda yansımış.
**Bulgu R-02:** "Temp Agent generation" Sprint 188 koşullarında pratik olarak default-off (init wizard'da işaretlenmeden çalışmaz). README'nin "Auto-generates" tonu daha temkinli olabilir.

---

## 6. Altyapı, Backend, Provider

| Feature | İlan Kaynağı | Sınıf | Kanıt |
|---------|--------------|-------|-------|
| 3 Backend (tmux / subprocess / docker) | README:168, DECKENT.md | **CANLI** | `src/orchestra/tmux.ts`, `spawn-backend.ts`, `spawn-backend-docker.ts`. |
| Docker Backend (10 e2e test) | IDENTITY | **CANLI** | `tests/e2e/spawn-docker-*.test.ts` çoklu suite; `Dockerfile` mevcut. |
| Docker Graceful Shutdown | IDENTITY Sprint 135 T-003 | **CANLI** | `src/orchestra/spawn-backend-docker.ts` SIGTERM grace period. |
| Docker HB Core Fix (atomicWrite + fsync) | IDENTITY Sprint 139 T-13 | **CANLI** | `worker-lifecycle.ts atomicWriteFileSync` + `worker.ts:425 verifyResultPersisted`. |
| Subprocess Backend (Windows native) | README:168/180 | **CANLI** | `spawn-backend.ts` `shell:true` + UTF-8; `tests/e2e/subprocess-e2e.test.ts`. |
| Backend Parity 3/3 | IDENTITY Sprint 139 T-17/18/19 | **CANLI** | docker + tmux + subprocess E2E suite (T05 + T06 dolaylı). |
| 3 Provider (Claude / Codex / Gemini) | README:169 | **CANLI** | `src/providers/{claude,codex,gemini}.ts` `implements ProviderAdapter` (T06 §4). |
| Sandbox Provider | DECKENT Architecture | **DORMANT** | `src/providers/sandbox.ts:28 SandboxSpawnBackend` — `grep` src/ içinde 0 caller; CLI `--sandbox-mode` git-stash kullanır, bu sınıfı değil. (T06 §4.5) |
| Configurable Timeouts | README:171 | **CANLI** | `sprint_timeout_minutes`, `docker_timeout` config. |
| Human Checkpoints | README, IDENTITY | **CANLI** | `cli/commands/checkpoint.ts:64` + `mcp/tools/checkpoint.ts:78` (T01/T02). |
| Heartbeat Daemon | IDENTITY | **CANLI** | `src/orchestra/heartbeat-daemon.ts` + `cli/commands/heartbeat.ts:20`. |
| Plan-Time Scope Collision Detection | IDENTITY Sprint 138 T-4 | **CANLI** | `src/orchestra/conflict-resolver.ts detectScopeCollisions` + `dependency-scheduler.ts buildCollisionAwareWaves` + `nervous/detectors/scope-collision.ts`. |
| Task Dependency Pipeline (Kahn's) | IDENTITY Sprint 134 T-001 + 139 T-28 | **CANLI** | `src/orchestra/dependency-scheduler.ts` topological sort + waves. |
| Chain Dependency Scheduler Wave 1 | IDENTITY Sprint 139 T-28 | **CANLI** | `dependency-scheduler.ts` + `sprint-spawner.ts` wire. |
| Auto-Archive ArchiveOrphanTasks Ext | IDENTITY Sprint 138 T-7 | **CANLI** | `sprint-finalizer.ts archiveOrphanTasks` + `sprint-pid-manager.ts`. |
| MCP Integration (31 tools + 8 resources) | README:18 + DECKENT.md | **CANLI** | `src/mcp/tools/index.ts` 31 registerTool çağrısı (T02 §1). 8 resource `mcp/resources/index.ts`. |
| Web Dashboard (7 pages) | README:21, DECKENT.md | **CANLI** | `src/dashboard/src/pages/*.tsx` — Chat, Config, Dashboard, History, Memory, Settings, Status (7/7 ✓). |
| HTTP API + SSE | DECKENT.md | **CANLI** | `src/api/server.ts` SSE handler + `text/event-stream`. |
| Rate Limiting | DECKENT.md (api/) | **CANLI** | `src/api/rate-limiter.ts`. |
| Incoming Message Router | DECKENT.md | **CANLI** | `connectors/incoming-router.ts` + `api/server.ts:742` (T06 §3.2). |

**Bulgu I-01:** "5 modül" providers (DECKENT.md) sayıca doğru, ancak 1'i (`sandbox.ts`) **dormant**. T06 raporu Sprint 189 follow-up'a aldı.

---

## 7. Connectors, Nervous & Notification

| Feature | İlan Kaynağı | Sınıf | Kanıt |
|---------|--------------|-------|-------|
| Nervous System (ADR-040, meta-orch) | README:156, DECKENT.md | **YARI-WIRE** | Pipeline tam (`nervous/bootstrap.ts:72-82`), `sprint-controller.ts:583` wire; `.deckent/config.json:111 nervous_system.enabled=false` (default-off, deckent-dev dogfood etmiyor). T06 §2. |
| 12 Detectors | DECKENT.md / ADR-040 | **YARI-WIRE** | `detector-registry.ts:11-22` 12 detector kayıtlı (T06 §2.3). ADR-040 metni "5 MVP" diyor → metin drift. |
| 30 Actions Registry | ADR-040 / T06 | **CANLI (lib)** | `nervous/action-registry.ts:328` 30 eylem; pure data. |
| Action Handlers (4 MVP + 26 stub) | ADR-040 | **YARI-WIRE** | `nervous/action-handlers.ts:196` — 4 MVP gerçek + 26 `outcome:'unimplemented'`. |
| Discord Connector | CLAUDE.md:55, README "Discord" | **DORMANT** | `src/connectors/discord.ts:74` sınıf mevcut; `grep "new DiscordConnector" src/` = 0 caller. T06 §3.3. |
| Telegram Connector | aynı | **DORMANT** | `src/connectors/telegram.ts:112`; 0 caller. |
| WhatsApp Connector | aynı | **STUB** | `whatsapp.ts:35-39` enabled=true → throw; whatsapp-README.md scaffold belgeli. |
| Webhook Yolu (Discord/Telegram) | DECKENT/T06 | **CANLI** | `api/server.ts:741-751` + `incoming-router.ts:187 route()`. |
| Notification Dispatcher | IDENTITY Sprint 139 T-41 | **CANLI** | `src/core/notification-dispatcher.ts` + `notify-adapters/{cli,file,mcp}-adapter.ts`. |
| NotifyDispatcher MCP entegrasyonu | T02 §3 | **CANLI** | `src/mcp/server.ts:151` initNotifyDispatcher. |
| Event Stream Runtime E2E | IDENTITY Sprint 139 T-44 | **CANLI** | `src/orchestra/event-stream.ts writeEvent` + `tests/e2e/event-stream-runtime.test.ts`. |
| Structured Event Stream (event-stream.ts) | IDENTITY Sprint 138 T-4 | **CANLI** | `src/orchestra/event-stream.ts` CHANNELS sabit + writeEvent. |
| `dead-event-stream` detector | DECKENT.md | **YARI-WIRE** | `.deckent/config.json:162` enabled=true ama nervous root false olunca yürütülmez. |

**Bulgu N-01:** "Nervous System — Proactive meta-orchestrator" iddiası README'de **canlı gibi** sunuluyor. Gerçek: deckent-dev'de default-off ve hâlâ aktive edilmedi (ADR-040'ın "Sprint 148 aktive" hedefi 40 sprint açık). README'de "configurable / opt-in" not eklenmeli.
**Bulgu N-02:** Discord/Telegram bot lifecycle wire-eksik — `package.json` `discord.js`+`telegraf` bundle yükü. Sprint 189 dead-code kararı bekliyor (T06 F2).

---

## 8. ADR Governance & Verification Protocol

| Feature | İlan Kaynağı | Sınıf | Kanıt |
|---------|--------------|-------|-------|
| ADR Governance Integration | IDENTITY Sprint 138 T-1 | **CANLI** | `scripts/adr-validator.mjs` mevcut; `.brain/exports/decisions.md` 64 ADR; brain.md/auditor.md/worker.md "Active ADR Constraints" injection. |
| MADR v3 hibrit format | IDENTITY | **CANLI** | `.brain/exports/decisions.md` ADR şablonları MADR v3. |
| 37 ADR migration → 64 ADR | IDENTITY/summary | **CANLI** | summary.md ADR listesi 64 satır (ADR-001..064, bazı boşluklar). |
| ADR-036 Self-Referential | IDENTITY | **CANLI** | summary.md `adr-036 ADR Governance Integration — accepted`. |
| Worker Prompt ADR Injection | IDENTITY | **CANLI** | Worker prompt'unda "Mandatory Architecture Rules (ADR)" bloku otomatik enjekte edildi (mevcut görevde de görüldü). |
| ADR-035 Verification Protocol (15 channel) | IDENTITY Sprint 138 T-2 | **CANLI** | `src/orchestra/event-stream.ts` CHANNELS sabitleri (HEARTBEAT, RESULT, CODE_VERIFY_REQUEST, NOTIFY, …). Worker→Auditor verify emit `worker.ts:347+`. |
| Worker Honest Self-Assessment Gate | IDENTITY Sprint 138 T-8 + 165 T1 | **CANLI** | `worker.ts:356-380` Self-Honesty Gate (Sprint 165 T1 — Bug X) DONE+linesAdded=0+testsPassed=false → NO_GO downgrade. |
| Brain Self-Update Hook (ADR-046) | README:52, IDENTITY | **CANLI** | `sprint-finalizer.ts:1198+` Step Ordering Contract: memoryExport → adrInsert → ruleRegen → updateProjectDocs. |
| Step Ordering Contract enforce | ADR-046 | **CANLI** | sprint-finalizer.ts `postFinalizeResult.adrInsert`/`ruleRegenCalled`/`memExport` log (`:1238–1243`). |
| 3-layer doc-sync ground-truth check | README:53 | **CANLI** | `src/orchestra/sprint-docs-updater.ts` + identity-generator agent-count drift blocker. |
| askBrain IPC Registry | IDENTITY Sprint 135 T-4 | **CANLI** | `src/orchestra/ipc-registry.ts` + `src/agents/worker-ipc.ts ChannelRegistry`. |

**Bulgu A-01:** ADR governance pipeline tam; mevcut worker prompt'unun başında ADR-029/030/032 enjeksiyonu canlı kanıt.
**Bulgu A-02:** ADR-046 step ordering kanıtlı çalışıyor, `summary.md` `Total entries: 322 | Generated: 2026-05-22` her finalize sonrası refresh.

---

## 9. CLI & MCP Yüzeyi

| Feature | İlan Kaynağı | Sınıf | Kanıt |
|---------|--------------|-------|-------|
| 55+/56+ CLI command iddiası | README CLI tablosu, IDENTITY | **CANLI** | T01 §1a — 48 `register*` + 9 destek = 57 dosya, ~50+ top-level command. |
| `deckent_init` wizard | README:233 | **CANLI** | `cli/commands/init.ts:117 registerInit`. |
| `deckent doctor` health gate | README:332 | **CANLI** | `cli/commands/doctor.ts:940`. |
| `deckent web` dashboard server | README:39 | **CANLI** | `cli/commands/web.ts:25`. |
| `deckent audit verify` | README:360 | **CANLI** | `cli/commands/audit-verify.ts:21` HMAC chain verify. |
| `deckent recover` | README:606 | **CANLI** | `cli/commands/recover.ts:102` + `mcp/tools/recover.ts:15`. |
| `deckent skill publish` | README:626 | **CANLI** | `cli/commands/skill-marketplace.ts:94 registerSkillMarketplace` + `core/signature.ts` Ed25519. |
| `deckent features` manifest query | README:374, MCP | **CANLI** | `cli/commands/features.ts:85` + `mcp/tools/feature-query.ts:43`. |
| `deckent plugin` create/install | README:388 | **CANLI** | `cli/commands/plugin.ts:9`; `core/plugin.ts` + `core/plugin-hooks.ts`. |
| `deckent_memory_query` MCP | DECKENT MCP | **CANLI** | T02 §1 listesi. |
| `deckent_watch` | DECKENT MCP, T02 | **CANLI** | `mcp/tools/watch.ts:23`. |
| 8 MCP resources | README:444 | **CANLI** | `mcp/resources/index.ts` 8 resource (dashboard/directives/memory/debt/config/retro/tasks/agents). |
| MCP Tool Sayısı: 27 (IDENTITY/server.ts) vs 31 (gerçek) | IDENTITY:30 + server.ts:33 | **DOC DRIFT** | T02 §2 — 4 tool eksik dize var (`watch`, `feature_query`, `audit`, `recover`). |
| CLI/MCP Parity (ADR-022) | DECKENT.md | **CANLI** (T10 detaylı) | Sibling task W2-T10 ayrıntılı. |

**Bulgu CLI-01:** T02 bulgusu — `IDENTITY.md` "MCP Tools: 27" YANLIŞ; `server.ts:33` `DECKENT_MCP_INSTRUCTIONS` da YANLIŞ. Gerçek 31. README:18 doğru.
**Bulgu CLI-02:** IDENTITY "CLI Commands: 55+/56+" — gerçek 50+ top-level command (T01 §3 detaylı). "+" yumuşatma payı kabul edilebilir.

---

## 10. Managed-Docs & Plugin (ADR-029/030/032)

| Feature | İlan Kaynağı | Sınıf | Kanıt |
|---------|--------------|-------|-------|
| Managed-Docs (ADR-029) | DECKENT, ADR-029 | **CANLI** | `src/orchestra/managed-docs/managed-doc-runner.ts` + `sprint-reporter.ts updateProjectDocs`. |
| Template Engine (ADR-030) | ADR-030 | **CANLI** | `src/orchestra/managed-docs/template-renderer.ts` + `plugin-loader.ts`. |
| i18n Pattern System (ADR-032) | ADR-032 | **CANLI** | `content-generators.ts I18nStrings/EN/TR/i18n()` + `types.ts patternsByLang`. |
| 8 Built-in Section Generators | ADR-029 | **CANLI** | `content-generators.ts` sprint-metrics, active-debt, sprint-history, agent-performance, changelog, test-coverage, module-map, dependencies. |
| JSON Generator (declarative) | ADR-030 | **CANLI** | `plugin-loader.ts loadUserGeneratorsSync` (.json). |
| MJS Generator (executable) | ADR-030 | **YARI-WIRE** | `plugin-loader.ts loadUserGeneratorsAsync` mevcut; default off, `--with-plugins` flag gerekir. |
| Content Hash Cache (ADR-031) | ADR-031 | **CANLI** | `managed-docs/doc-cache.ts`. |

**Bulgu D-01:** ADR-029/030/031/032 dörtlüsü kodla **birebir uyumlu** — bu sprint için Worker prompt'unda da gözüktü.

---

## 11. Memory V2 Sonrası Bayat / Eski Referanslar

| Bayat İddia / Referans | Konum | Gerçek | Aksiyon |
|------------------------|-------|--------|---------|
| ".brain/MEMORY.md" + DECISIONS.md doğrudan parse | brain.md eski text | DB-first, .md export | brain.md (eski .md dosyalarını parse etmeyin) ✓ güncel |
| "PROJECT-IDENTITY.md" | api-surface.md eski not | Removed Sprint 166 (ADR-046) | api-surface.md zaten "Removed" not'u var ✓ |
| "27 MCP tools" | IDENTITY:30 + mcp/server.ts:33 instructions | Gerçek 31 | **DOC DRIFT** — T02 F1 follow-up |
| "5 MVP detector" | ADR-040 metni | 12 detector kayıtlı | **DOC DRIFT** — T06 F1 |
| "Sprint 148 nervous aktive" | ADR-040 metni | Sprint 188 hâlâ false | **YANIK HEDEF** — ADR-040 metni güncellenmeli (T06 B1) |
| "agents/ — 20 modules" | CLAUDE.md | 21 dosya, 20 modül (index barrel hariç) | Sayıca tutarlı ✓ |
| "5 modül" providers | CLAUDE.md | 5 dosya, 4 canlı + 1 dormant (sandbox) | Sayıca doğru, semantik kısmi |
| "96% context reduction" | README:157 | Benchmark dosyası yok | **İDDİA** — kanıt gerekli |
| nervous "live" tonu | README:156 | default-off, opt-in | **YANILTICI** — README'ye not |
| Memory budget "900 lines" | DECKENT Rules | `cleanup.ts:98 decayMemoryBudget=900` | ✓ |

---

## 12. Dead / Dormant Risk Tablosu

| Modül | Sınıf | Sprint 188 Önerisi |
|-------|-------|---------------------|
| `src/agents/adaptive-agent.ts` | DORMANT (T05 §3) | Sprint 189 archive ya da `start.ts`'te runtime adaptation çağrısı ekle |
| `src/agents/cross-sprint-analyzer.ts` | DORMANT (T05) | Aynı |
| `src/agents/permission-guard.ts` | DORMANT (T05) | Aynı |
| `src/agents/agent-retirement.ts` | DORMANT (T05) | Aynı (promotion-pipeline ile birleşebilir) |
| `src/agents/agent-genealogy.ts` | DORMANT (T05) | Archive aday |
| `src/agents/prompt-rollback.ts` + `prompt-evolution.ts` + `specialization-drift.ts` | DORMANT (T05) | Archive aday |
| `src/orchestra/self-modifying-detector.ts` | DORMANT — wire boşluk | Detector çağrı yeri ekle (`sprint-controller.ts` plan-time) ya da archive |
| `src/agents/worker-verify.ts enforceVerifyLoop` | DORMANT | Worker-default.md not zaten kabul ediyor; ya runtime'a wire ya da yorumla "prompt-only" işaretle |
| `src/connectors/discord.ts` + `telegram.ts` + `connector-pool.ts` | DORMANT | T06 F2 — Sprint 189 dead-code kararı |
| `src/connectors/whatsapp.ts` | STUB | T06 F5 — activate ya da `archived` etiketi |
| `src/providers/sandbox.ts` SandboxSpawnBackend | DORMANT | T06 F3 — `--sandbox-mode` ile birleştir ya da archive |

---

## 13. İlan ↔ Gerçek Özet Tablosu

| Kategori | Toplam İddia | CANLI | YARI-WIRE | DORMANT | STUB | İDDİA (kanıtsız) |
|----------|-------------|-------|-----------|---------|------|-------------------|
| Çekirdek Orchestration | 11 | 11 | 0 | 0 | 0 | 0 |
| Güvenlik & Yetki | 14 | 11 | 1 (RBAC) | 2 (self-mod, verify-loop) | 0 | 0 |
| Memory V2 / Akıl | 12 | 11 | 1 (self-learning) | 0 | 0 | 1 (96% claim) |
| Ajanlar & Routing | 14 | 12 | 2 (temp-skill, rule-evolver) | 0 | 0 | 0 |
| Altyapı / Backend / Provider | 17 | 16 | 0 | 1 (sandbox provider) | 0 | 0 |
| Connectors / Nervous / Notify | 13 | 5 | 5 | 2 (Discord, Telegram) | 1 (WhatsApp) | 0 |
| ADR & Verification | 11 | 11 | 0 | 0 | 0 | 0 |
| CLI / MCP Yüzey | 14 | 13 | 0 | 0 | 0 | 1 (27→31 drift) |
| Managed-Docs | 7 | 6 | 1 (MJS plugin) | 0 | 0 | 0 |
| **TOPLAM** | **113** | **96 (85%)** | **10 (9%)** | **5 (4%)** | **1 (1%)** | **2 (2%)** |

---

## 14. Özet

**İlan-gerçek uyumu:** Deckent'in büyük çoğunluğu (**%85**) canlı ve production runtime path'inde. Modül sayıları (15 agent, 21 skill, 31 MCP tool, 8 resource, 7 dashboard page, 13 model, 4 tier, 8-phase lifecycle) **kodla birebir** kanıtlanmıştır.

**En dikkat çekici sapmalar:**

- **Nervous System** — README'de "live proactive meta-orchestrator" sunulurken kod tarafında **default-off** ve deckent-dev'de hâlâ aktive edilmedi (40 sprint gecikme). ADR-040 metni 5 MVP detector / Sprint 148 hedefi gibi bayat referanslar içeriyor. ADR-047 (Manual Subagent Dispatch) bunu zımnen meşrulaştırıyor.
- **Discord/Telegram connectors** — sınıf+dep mevcut, `new ...Connector()` call-site **yok**. Bundle yükü taşıyor. WhatsApp kasıtlı stub.
- **ADR-038 self-modifying-detector** — kütüphane var, hiçbir yerde çağrılmıyor. Kritik mimari koruma için *intent-ready* ama wire boş.
- **ADR-037 RBAC** — runtime advisory/soft; `worker.ts checkWorkerAuthority` koşulsuz `true` dönüyor. DECKENT gotchas bunu kabul ediyor; README "strict role boundaries" yanıltıcı.
- **MCP tool sayısı**: IDENTITY.md "27" + server.ts:33 "27" YANLIŞ; gerçek 31 (T02 §2).
- **"96% context reduction"** README iddiası — benchmark kanıtı yok.
- **8 dormant agent modülü** (T05 §3): adaptive-agent, cross-sprint-analyzer, permission-guard, agent-retirement, agent-genealogy, prompt-rollback, prompt-evolution, specialization-drift, vs.

**Doğru ve sağlam olanlar:** Memory V2 (DB+FTS5+normalize+export+import), 8-phase lifecycle, 3 backend, 3 provider, ADR governance pipeline (validator+inject+enforce), Brain Self-Update Hook (ADR-046 step ordering), Managed-Docs (ADR-029/030/031/032), Heartbeat Daemon, Token Usage Tracker, Audit HMAC chain, Embedded Web Terminal güvenlik katmanları (prompt+command+outbound).

---

## 15. Sprint 189 Follow-up

| ID | Eylem | Öncelik | Sahip | Bağımlı T |
|----|-------|---------|-------|-----------|
| F1 | `IDENTITY.md:30` "MCP Tools: 27" → **31**; `src/mcp/server.ts:33` `DECKENT_MCP_INSTRUCTIONS` listesini 31 tool ile güncelle | YÜKSEK | doc-writer | T02 |
| F2 | `ADR-040` metnini güncelle: 12 detector, MCP tool sayısı, "Sprint 148 aktivasyon" hedefini "ADR-047 manual dispatch ile birlikte yaşar" ile değiştir | YÜKSEK | doc-writer | T06 |
| F3 | `README.md:157` "96% context reduction" iddiasını ya `docs/benchmark/memory-v2.md` benchmark dosyasına bağla ya da kaldır | ORTA | doc-writer | — |
| F4 | `README.md:156` Nervous System tonunu "configurable / opt-in (disabled by default)" olarak yumuşat | ORTA | doc-writer | T06 |
| F5 | `src/connectors/{discord,telegram}.ts` + `connector-pool.ts` archive ya da aktive kararı (package.json bundle yükü) | YÜKSEK | architect | T06 F2 |
| F6 | `src/orchestra/self-modifying-detector.ts` `sprint-controller.ts` plan-time wire'ı ekle ya da archive | ORTA | architect | — |
| F7 | `src/agents/worker-verify.ts enforceVerifyLoop/runTestVerifyLoop` ya `worker-lifecycle.ts`'e wire ya da `// prompt-only` JSDoc + dosya başında dormant uyarısı | DÜŞÜK | architect | — |
| F8 | T05 dormant agent listesi (adaptive-agent, cross-sprint-analyzer, permission-guard, agent-retirement, agent-genealogy, prompt-{rollback,evolution}, specialization-drift) için tek tek archive/aktive kararı | YÜKSEK | architect | T05 |
| F9 | `README.md:152` ADR-037 "strict role boundaries" → "compile-time lint + audit-trail; runtime advisory/soft (V1.0; hard-flip V2 post-GA)" notu | ORTA | doc-writer | — |
| F10 | `src/providers/sandbox.ts SandboxSpawnBackend` ile `start.ts:212 applySandbox` arasındaki ikiliği netleştir (archive ya da birleştir) | ORTA | refactorer | T06 F3 |
| F11 | "Self-Learning (config suggestions)" gerçekten config patch öneriyor mu — `sprint-retro-writer.ts` çıktısını incele; README iddiasını gerçekçi yap | DÜŞÜK | doc-writer | — |
| F12 | `IDENTITY.md "Features:"` uzun satırını kategorilere böl (Memory, Routing, Backend, ADR, Connectors) ve dormant olanları "(opt-in)" etiketle | DÜŞÜK | doc-writer | — |

---

**Rapor sonu** — `docs/audits/sprint-188/feature-inventory.md` — Sprint 188 W1-T09 (188-009). Toplam 113 ilan edilen özellik denetlendi, 96 canlı (%85), 10 yarı-wire, 5 dormant, 1 stub, 2 kanıtsız iddia. Sprint 189 için 12 follow-up önerisi listelendi.
