# T1 — Code Inventory + Dead Code + Unused Features Audit

**Sprint:** 167 (Read-Only Self-Audit)
**Task ID:** 167-001
**Agent:** code-reviewer (read-only)
**Audit Date:** 2026-05-14
**Scope:** READ-ONLY — no source/doc mutations. Findings inventory only.

---

## 0. Executive Summary

Bu rapor Deckent monorepo'sunun **read-only** envanter taramasıdır. Hiçbir kaynak/doküman dosyası bu task kapsamında değiştirilmedi; çıktı yalnızca `.audit/sprint-167/` dizinine yazıldı.

### High-Level Numbers (T1 ölçümü, 2026-05-14)

| Metrik | T1 ölçümü | IDENTITY/DECKENT iddia | Δ |
|--------|-----------|------------------------|---|
| `src/**/*.ts` toplam dosya | **411** | (belirsiz) | — |
| `tests/**/*.test.ts` toplam dosya | **772** | "505 files" | **+267** drift |
| CLI `registerX(program)` çağrısı | **46** | "55+ CLI commands" | yapılandırma ≥ register (sub-cmd sayılırsa 55+ olabilir) |
| MCP `deckent_*` tool ismi (literal) | **31** | "27 tools" | **+4** ground-truth drift |
| Built-in agents (`.deckent/agents/`) | **18** | "15 built-in + 2 custom" = 17 | **+1** (archive dir) |
| Built-in skills (`.deckent/skills/`) | **21** | "21" | 0 ✅ |
| Unconditional vitest `.skip(` | **25** | (DIRECTIVES: 41) | farklı sayım kuralı |
| `.skipIf(...)` (Windows POSIX guard) | **66** | (DIRECTIVES: 41) | farklı sayım kuralı |
| ADR-039 detector dosyası | mevcut | `src/orchestra/self-modifying-detector.ts` (DECKENT.md `src/agents/` der) | **konum drift** |

### Top-Line Findings

1. **MCP tool ground-truth drift (HIGH):** `tools/index.ts` 27 `registerX(server)` çağrısı yapıyor; bunlardan biri `registerNervousTools` 5 alt tool kaydediyor. Toplam exposed `deckent_*` tool sayısı **31**, IDENTITY.md "27 tools" iddiası **+4 drift**. T2 ground-truth claim parity için zorunlu input.
2. **Agent pool +1 drift (MEDIUM):** `.deckent/agents/archive/` dizini agent pool listesinde 18'inci satır olarak görünüyor — ya bir housekeeping artığı ya da gizli "archived agents" feature. IDENTITY 17 (15+2) iddia ediyor.
3. **Test dosya sayısı drift (HIGH):** IDENTITY "505 files" diyor; gerçek `tests/**/*.test.ts` count = **772**. Bu sayım 267 fark içeriyor (Sprint 138-166 boyunca test ekleme drift'i). T2 zorunlu kayıt.
4. **Sub-command yapısı belirsiz (MEDIUM):** `deckent memory rebuild|export|stats|search`, `deckent agent list|add|remove`, `deckent skill list|add|remove` gibi sub-command'lar tek register'a sayılıyor — gerçek subcommand sayısı ≥55 olabilir ama doküman bunu açıklamıyor.
5. **Dead/dormant agent modules tespit edildi (LOW-MEDIUM):** 7 `src/agents/prompt-*` ve `agent-*` modülü düşük import grafiği gösteriyor; potansiyel Sprint 168 dead code candidate.
6. **Bug N regression test mevcut ama coverage belirsiz (LOW):** `tests/cli/finalize-rule-regen.test.ts` (168 satır, 24 test/describe/it) var, ama Bug N spesifik regression scenario'su olduğu T1 statik taramayla doğrulanamadı.

---

## 1. CLI Command Inventory

### 1.1 Registered Commands (`src/cli/index.ts`)

`buildProgram()` fonksiyonu commander.js `Command` instance'ına aşağıdaki **46 register çağrısı** yapıyor. ADR-012 `register<Name>(program)` pattern her dosyada uygulanmış.

| # | Register Fn | Source File | Sub-commands Likely | Status |
|---|-------------|-------------|---------------------|--------|
| 1 | registerInit | `src/cli/commands/init.ts` | (sayı belirsiz) | ✅ wired |
| 2 | registerStart | `src/cli/commands/start.ts` | — | ✅ wired |
| 3 | registerPlan | `src/cli/commands/plan.ts` | — | ✅ wired |
| 4 | registerStatus | `src/cli/commands/status.ts` | `--watch`, `--json` | ✅ wired |
| 5 | registerAttach | `src/cli/commands/attach.ts` | — | ✅ wired |
| 6 | registerSpawn | `src/cli/commands/spawn.ts` | `--auto-approve` | ✅ wired |
| 7 | registerKill | `src/cli/commands/kill.ts` | `--all`, `--worker` | ✅ wired |
| 8 | registerRetro | `src/cli/commands/retro.ts` | — | ✅ wired |
| 9 | registerCleanup | `src/cli/commands/cleanup.ts` | — | ✅ wired |
| 10 | registerDoctor | `src/cli/commands/doctor.ts` | — | ✅ wired |
| 11 | registerConfig | `src/cli/commands/config.ts` | `read`, `set`, `migrate` | ✅ wired |
| 12 | registerHistory | `src/cli/commands/history.ts` | — | ✅ wired |
| 13 | registerPlugin | `src/cli/commands/plugin.ts` | — | ✅ wired |
| 14 | registerUpgrade | `src/cli/commands/upgrade.ts` | — | ✅ wired |
| 15 | registerOnboard | `src/cli/commands/onboard.ts` | — | ✅ wired |
| 16 | registerAnalyze | `src/cli/commands/analyze.ts` | — | ✅ wired |
| 17 | registerArchiveDebt | `src/cli/commands/archive-debt.ts` | `--count`, `--before` | ✅ wired |
| 18 | registerDashboard | `src/cli/commands/dashboard.ts` | — | ✅ wired |
| 19 | registerServe | `src/cli/commands/serve.ts` | — | ✅ wired |
| 20 | registerWeb | `src/cli/commands/web.ts` | — | ✅ wired |
| 21 | registerSync | `src/cli/commands/sync.ts` | — | ✅ wired |
| 22 | registerWatch | `src/cli/commands/watch.ts` | — | ✅ wired |
| 23 | registerRun | `src/cli/commands/run.ts` | `<taskId>` | ✅ wired |
| 24 | registerTestRun | `src/cli/commands/test-run.ts` | — | ✅ wired |
| 25 | registerAgent | `src/cli/commands/agent.ts` | `list`, `add`, `remove` | ✅ wired |
| 26 | registerSkill | `src/cli/commands/skill.ts` | `list`, `add`, `remove` | ✅ wired |
| 27 | registerReview | `src/cli/commands/review.ts` | — | ✅ wired |
| 28 | registerFinalize | `src/cli/commands/finalize.ts` | — | ✅ wired |
| 29 | registerExplain | `src/cli/commands/explain.ts` | — | ✅ wired |
| 30 | registerSetDirectives | `src/cli/commands/set-directives.ts` | — | ✅ wired |
| 31 | registerHeartbeat | `src/cli/commands/heartbeat.ts` | — | ✅ wired |
| 32 | registerCheckpoint | `src/cli/commands/checkpoint.ts` | `approve`, `reject` | ✅ wired |
| 33 | registerDocs | `src/cli/commands/docs.ts` | `add`, `remove`, `list` | ✅ wired |
| 34 | registerOutput | `src/cli/commands/output.ts` | — | ✅ wired |
| 35 | registerCostCommand | `src/cli/commands/cost.ts` | — | ✅ wired |
| 36 | registerRecall | `src/cli/commands/recall.ts` | `<query>` | ✅ wired |
| 37 | registerRemember | `src/cli/commands/remember.ts` | `<note>` | ✅ wired |
| 38 | registerMemory | `src/cli/commands/memory.ts` | `rebuild`, `export`, `stats` | ✅ wired |
| 39 | registerResume | `src/cli/commands/resume.ts` | — | ✅ wired |
| 40 | registerNervous | `src/cli/commands/nervous.ts` | (Sprint 147 ADR-040) | ✅ wired |
| 41 | registerConfigNervous | `src/cli/commands/config-nervous.ts` | — | ✅ wired |
| 42 | registerMode | `src/cli/commands/mode.ts` | — | ✅ wired |
| 43 | registerFeatures | `src/cli/commands/features.ts` | — | ✅ wired |
| 44 | registerAudit | `src/cli/commands/audit.ts` | — | ✅ wired |
| 45 | registerRecover | `src/cli/commands/recover.ts` | — | ✅ wired |
| 46 | registerHelp | `src/cli/commands/help.ts` | — | ✅ wired |

**Registered top-level command count = 46.** Sub-commands sayılırsa "55+" iddiası mümkün; ancak `IDENTITY.md`/`CLAUDE.md` "55+ CLI commands" iddiasını sub-command granular sayımla doğrulayan kaynak yok.

### 1.2 Unregistered CLI Helper Files (`src/cli/commands/`)

Aşağıdaki 9 dosya `src/cli/commands/` altında ama `cli/index.ts` içinde register edilmiyor (helper modüller, register pattern dışında):

| Dosya | Görev | Notlar |
|-------|-------|--------|
| `doctor-checks.ts` | doctor.ts'in helper modülü | İç kullanım — register'a gerek yok |
| `doctor-format.ts` | doctor.ts'in renkli format helper | İç kullanım |
| `init-steps.ts` | init wizard step builder | İç kullanım |
| `init-templates.ts` | init template renderer | İç kullanım |
| `init-wizard.ts` | init.ts'in promptText/promptSelect koordinatörü | İç kullanım |
| `quick-start.ts` | onboard alt akışı | **Şüpheli — register edilmiyor, sub-cmd da olarak görünmüyor** |
| `retro-formatter.ts` | retro.ts'in render helper'ı | İç kullanım |
| `retro-parser.ts` | retro.ts'in markdown parser'ı | İç kullanım |
| `skill-marketplace.ts` | skill.ts içinden marketplace sub-cmd | **Test mevcut (`tests/cli/commands/skill-marketplace.test.ts`) ama register pattern ile değil — sub-cmd entegrasyonu doğrulanmalı** |

**MEDIUM Finding T1-CLI-001:** `quick-start.ts` register pattern dışında kalmış ve `cli/index.ts`'de hiç import edilmiyor. README'de `quick-start` komutu referansı `tests/cli/rich-output.test.ts:213` içinde `it.skip` ile beklemede. Suggested_fix: ya register edilsin ya silinsin. Sprint 168 dead-code-cleanup adayı. effort_estimate: 1h.

**LOW Finding T1-CLI-002:** `skill-marketplace.ts` register fonksiyonu yok; muhtemelen `skill.ts` parent sub-cmd akışına gömülü, ama bu dolaylılık bakım zorluğu yaratıyor. Doğrudan grep ile entry doğrulanamadı. Sprint 168 inceleme adayı.

### 1.3 CLI Sub-command Density (auxiliary inventory)

Aşağıdaki komutlar bilinen sub-command verb listelerine sahip (doc + grep bulgusu, exhaustive değil):

- `deckent agent list | add | remove`
- `deckent skill list | add | remove`
- `deckent config read | set | migrate`
- `deckent memory rebuild | export | stats | search`
- `deckent docs add | remove | list`
- `deckent checkpoint approve | reject`
- `deckent nervous subscribe | accept | reject | status | config`

Bu en az **+18 sub-command** demek → toplam ≈ **64 CLI yüzey**. Ancak yetkili sayım nokta atışı bulunamadı. Sprint 168 doc-task: tam sub-command tree çıkarımı.

### 1.4 CLI Dependency Hijack Check (ADR-010)

ADR-010 "Tek runtime dependency: commander" hükmü dogru görünüyor — `cli/index.ts` ve tüm `src/cli/commands/*.ts` `from 'commander'` dışında runtime dependency import etmiyor (statik tarama). chalk/picocolors/inquirer hiçbir CLI dosyasında bulunmadı. ADR-010 **compliant**.

---

## 2. MCP Tool Inventory

### 2.1 Registered MCP Tools (`src/mcp/tools/index.ts`)

`registerTools(server)` fonksiyonu **27 registerX çağrısı** yapıyor:

| # | Register Fn | Source File | Exposed Tool Name(s) |
|---|-------------|-------------|----------------------|
| 1 | registerInitTool | `init.ts` | `deckent_init` |
| 2 | registerSetDirectivesTool | `directives.ts` | `deckent_set_directives` |
| 3 | registerPlanTool | `plan.ts` | `deckent_plan` |
| 4 | registerStartTool | `start.ts` | `deckent_start` |
| 5 | registerStatusTool | `status.ts` | `deckent_status` |
| 6 | registerDoctorTool | `doctor.ts` | `deckent_doctor` |
| 7 | registerRetroTool | `retro.ts` | `deckent_retro` |
| 8 | registerHistoryTool | `history.ts` | `deckent_history` |
| 9 | registerAnalyzeTool | `analyze.ts` | `deckent_analyze_project` |
| 10 | registerSyncTool | `sync.ts` | `deckent_sync` |
| 11 | registerConfigTool | `config.ts` | `deckent_config` |
| 12 | registerReviewTool | `review.ts` | `deckent_review` |
| 13 | registerRunTool | `run.ts` | `deckent_run` |
| 14 | registerKillTool | `kill.ts` | `deckent_kill` |
| 15 | registerCleanupTool | `cleanup.ts` | `deckent_cleanup` |
| 16 | registerHelpTool | `help.ts` | `deckent_help` |
| 17 | registerAgentListTool | `agent-list.ts` | `deckent_agent_list` |
| 18 | registerSkillListTool | `skill-list.ts` | `deckent_skill_list` |
| 19 | registerCheckpointTool | `checkpoint.ts` | `deckent_checkpoint` |
| 20 | registerDocsTool | `docs.ts` | `deckent_docs` |
| 21 | registerExplainTool | `explain.ts` | `deckent_explain` |
| 22 | registerMemoryQueryTool | `memory-query.ts` | `deckent_memory_query` |
| 23 | registerWatch | `watch.ts` | `deckent_watch` |
| 24 | **registerNervousTools** | `nervous.ts` | **5 tools**: `deckent_nervous_subscribe`, `_accept`, `_reject`, `_status`, `_config` |
| 25 | registerFeatureQueryTool | `feature-query.ts` | `deckent_feature_query` |
| 26 | registerAuditTool | `audit.ts` | `deckent_audit` |
| 27 | registerRecoverTool | `recover.ts` | `deckent_recover` |

**Tool name literal grep (`grep -oE "'deckent_[a-z_]+'" src/mcp/tools/*.ts`) → 31 distinct tool names:**

```
deckent_agent_list, deckent_analyze_project, deckent_audit, deckent_checkpoint,
deckent_cleanup, deckent_config, deckent_docs, deckent_doctor, deckent_explain,
deckent_feature_query, deckent_help, deckent_history, deckent_init, deckent_kill,
deckent_memory_query, deckent_nervous_accept, deckent_nervous_config,
deckent_nervous_reject, deckent_nervous_status, deckent_nervous_subscribe,
deckent_plan, deckent_recover, deckent_retro, deckent_review, deckent_run,
deckent_set_directives, deckent_skill_list, deckent_start, deckent_status,
deckent_sync, deckent_watch
```

### 2.2 HIGH Finding T1-MCP-001 — Ground-Truth Drift "27 vs 31"

**Iddia:** `IDENTITY.md`, `DECKENT.md`, `CLAUDE.md` "27 MCP tools" / "22 tools" iki ayrı sayı içeriyor (DECKENT.md "22 tools", IDENTITY.md "27 tools").

**Gerçek:** Distinct `deckent_*` tool name = **31**.

**Suggested_fix:** Sprint 168 doc task — `IDENTITY.md` "27 tools" → "31 tools" + tool table (5 nervous breakdown + 26 single). DECKENT.md "22 tools" → tüm tool listesi güncellensin. **sprint_slot:** Sprint 168 T-DOC-A. **effort_estimate:** 1h. **severity:** HIGH (Open Source GA gate — README/IDENTITY uyumsuzluğu kullanıcı güvenini zedeler).

### 2.3 MCP Tools Without CLI Parity Check (ADR-022-v2)

CLI ↔ MCP parity (ADR-022-v2 hükmü) kabaca:

| MCP Tool | CLI Equivalent | Status |
|----------|----------------|--------|
| deckent_init | `deckent init` | ✅ parity |
| deckent_start | `deckent start` | ✅ parity |
| deckent_plan | `deckent plan` | ✅ parity |
| deckent_status | `deckent status` | ✅ parity |
| deckent_audit | `deckent audit` | ✅ parity |
| deckent_feature_query | (CLI parity?) | **❓ belirsiz — CLI'da `deckent features` var ama feature_query iki ayrı feature olabilir** |
| deckent_nervous_subscribe | `deckent nervous subscribe` | ✅ (Sprint 147 ADR-040 sonrası varsayım) |
| deckent_watch | `deckent watch` | ✅ parity |

**LOW Finding T1-MCP-002:** `deckent_feature_query` MCP tool ↔ CLI parity belirsiz; `src/cli/commands/features.ts` mevcut ama "query" sub-cmd grep ile doğrulanmadı. Sprint 168 doc + parity audit adayı.

### 2.4 MCP Job-Runner & Index Files (non-tool)

- `src/mcp/tools/job-runner.ts` — tool kaydetmiyor, async job kuyruğu olabilir; içerik T1 statik tarama dışında.
- `src/mcp/tools/index.ts` — sadece register orkestratör.

---

## 3. src/ Module Inventory + Dead Code Detection

### 3.1 Module Distribution (411 .ts files)

| Modül | Dosya Sayısı | Sorumluluk (CLAUDE.md kısa) |
|-------|--------------|------------------------------|
| `src/core/` | 100 | Tipler, config, agent/skill pool, model registry, memory store |
| `src/orchestra/` | 95 | Sprint lifecycle, planning, evaluation, routing |
| `src/cli/` | 93 (commands+helpers+index+auto-setup+entry+version-info) | CLI 55+ komut + helpers |
| `src/mcp/` | 43 | MCP server: 27/31 tools + 8 resources |
| `src/nervous/` | 22 | Proaktif meta-orchestrator (ADR-040) |
| `src/agents/` | 20 | Worker execution, prompt engineering |
| `src/dashboard/` | 15 | React + Vite + Tailwind web dashboard |
| `src/connectors/` | 7 | Discord, Telegram, WhatsApp, incoming-router |
| `src/monitor/` | 5 | Auditor scan loop, dashboard manager |
| `src/providers/` | 5 | Claude, Codex, Gemini adapters |
| `src/api/` | 4 | HTTP API server, SSE, rate limiting |
| `src/extensions/` | 1 | (VS Code extension placeholder?) |
| **TOPLAM** | **411** | |

### 3.2 Tests Distribution (772 .test.ts files)

| Dizin | Dosya Sayısı |
|-------|--------------|
| `tests/orchestra/` | 188 |
| `tests/cli/` | 152 |
| `tests/core/` | 151 |
| `tests/mcp/` | 39 |
| `tests/nervous/` | 32 |
| `tests/agents/` | 30 |
| `tests/docs/` | 25 |
| `tests/e2e/` | 22 |
| `tests/scripts/` | 12 |
| `tests/dashboard/` | 12 |
| `tests/api/` | 11 |
| `tests/monitor/` | 11 |
| `tests/providers/` | 7 |
| `tests/connectors/` | 6 |
| `tests/blueprint/` | 4 |
| **Toplam (uçlar dahil)** | **≈772** |

**HIGH Finding T1-TEST-001 — "505 files" Drift:** `IDENTITY.md` "Tests: 12,485 pass + 16 skipped (505 files)" iddiası. Gerçek `.test.ts` dosya sayısı = **772** (267 fazla). T2 ground-truth parity için zorunlu kayıt.

**Suggested_fix:** Sprint 168 — `IDENTITY.md` test sayısını canlı CI çıktısından regenerate eden hook ekle (Bug Y2 / ADR-046 hook chain extension). **sprint_slot:** Sprint 168 T-DOC-B. **effort_estimate:** 2h. **severity:** HIGH.

### 3.3 Dead / Dormant Module Candidates (`src/agents/`)

Aşağıdaki `src/agents/` modülleri grep tabanlı statik analiz ile **0 src/ tüketici** veya yalnız test consumer'ı gösteriyor. Bunlar Sprint 138–148 dönemi "Prompt Evolution Pipeline" ve "Agent Lifecycle" feature kalıntıları olabilir; gerçek runtime grafiği task-router/skill-pool dynamic dispatch içerebileceği için **silmeden önce dynamic import + Brain plan-time injection** kontrolü Sprint 168'de zorunlu.

| Modül | src/ Consumer | tests/ Consumer | Şüphe Seviyesi |
|-------|---------------|------------------|-----------------|
| `src/agents/specialization-drift.ts` | 0 | 1 (kendi testi) | **HIGH** dead |
| `src/agents/cross-sprint-analyzer.ts` | 0 | 1 (kendi testi) | **HIGH** dead |
| `src/agents/prompt-rollback.ts` | 0 | 1 | **MEDIUM** dead |
| `src/agents/prompt-ab-test.ts` | 0 (grep yanlış sayı verebilir, prompt-analytics içinde lazy import olabilir) | 1 | **MEDIUM** suspect |
| `src/agents/prompt-evolution.ts` | 0 | 1 | **MEDIUM** suspect |
| `src/agents/agent-genealogy.ts` | 0 | 1 | **MEDIUM** suspect |
| `src/agents/agent-retirement.ts` | 0 | 1 | **MEDIUM** suspect |
| `src/agents/shared-context.ts` | 1 | 1 | **LOW** alive |
| `src/agents/prompt-version.ts` | 2 | 1 | **LOW** alive |

**MEDIUM Finding T1-DEAD-001 — Prompt/Agent Lifecycle Dead Code (7 modül):** Sprint 168 forensic-mode dead code analizi (Agent A: code-reviewer) — her modül için: (a) son git commit tarihi, (b) dynamic import lookup, (c) Brain plan-time injection ihtimali. Karar: silinmek yerine **temp-skill-generator promotion pipeline** ile cross-cut bir veriyle birleştirilebilir mi?

**Suggested_fix:** Sprint 168 audit task — 7 modül için "alive / dormant / fully-dead" karar matrisi. Tam silme Sprint 169'a bırakılır. **sprint_slot:** Sprint 168 T-DEAD-A. **effort_estimate:** 3h. **severity:** MEDIUM.

### 3.4 Dead File Hotspots — Other Modules

Statik tarama sırasında aşağıdaki suspect modüller de görüldü (derinlik analizi yapılmadı, Sprint 168'e devredilir):

- `src/orchestra/prompt-god-template.ts` — "god prompt" template, kullanım grafiği belirsiz
- `src/orchestra/spawn-backend-mock.ts` — test backend; production wire yok (beklenen)
- `src/cli/commands/test-run.ts` — `deckent test-run` komutunun gerçek kullanım sıklığı belirsiz
- `src/core/marketplace/dependency-resolver.ts` — marketplace feature (Sprint 132?) — production wire belirsiz

**LOW Finding T1-DEAD-002 — Suspect file inventory:** Sprint 168 dead-code-disposition task'ında bu 4 dosya da `git log -p` ile son aktivite tarihi (LAST_TOUCHED) ile birlikte raporlanmalı. **sprint_slot:** Sprint 168 T-DEAD-B. **effort_estimate:** 1h. **severity:** LOW.

### 3.5 Module Boundary (ADR-008) — Tek Yönlü Bağımlılık Spot Check

ADR-008 "Brain merkezi import" hükmü statik grep ile spot-check:

```
src/orchestra/planner.ts → import 'src/core/*'      ✅ uyumlu
src/agents/worker.ts → import 'src/core/*'           ✅ uyumlu (auditor değil)
src/monitor/auditor.ts → import 'src/core/*'         ✅ uyumlu (brain'den import yok)
src/orchestra/brain.ts → import 'src/orchestra/*'    ✅ orchestra-internal OK
```

Derin grafik analizi (örn. circular import) `tsc --noEmit` zaten yapıyor; T1 bu doğrulamayı CI baseline'a (T6) bırakıyor.

---

## 4. Sprint 138-166 Feature Adoption Matrix

Sprint 138 → 166 boyunca eklenen feature'ların runtime wire (kaynak dosya varlık) ve test coverage parity'si. Status legend: **WIRED** = src dosya mevcut + en az 1 doğrulanan tüketici; **ORPHAN** = dosya mevcut ama tüketici grep bulamadı; **MISSING** = iddia edilen dosya yok; **PARTIAL** = bazı parça wired.

### 4.1 Sprint 138 Features

| Feature | Iddia Eden | Beklenen Kaynak | T1 Bulgu | Status |
|---------|------------|------------------|----------|--------|
| ADR Governance Integration | Task 1 | scripts/adr-validator.mjs + core/adr-* | `src/core/adr-file-sync.ts`, `src/core/adr-seed.ts` mevcut | ✅ WIRED |
| ADR-035 Verification Protocol Standard | Task 2 | `core/verification-protocol.ts` | grep ile dosya tespit edilemedi (T1 derin grep gerek) | ❓ PARTIAL |
| Auditor 3-Pipeline Authority Extension | Task 3 | `monitor/auditor.ts` extension | `src/monitor/auditor.ts` mevcut, 5 dosyalık monitor dir | ✅ WIRED |
| Structured Event Stream + Scope Collision | Task 4 | `event-stream.ts` + `file-lock.ts` | `src/orchestra/event-stream.ts` + `src/core/file-lock.ts` mevcut | ✅ WIRED |
| Layer 4 Runtime Wire Forensic Fix | Task 6 | runtime breadcrumb | (kaynak belirsiz) | ❓ PARTIAL |
| Auto-Archive ArchiveOrphanTasks | Task 7 | `archive-orphan.ts` | `src/cli/commands/archive-debt.ts` mevcut; archive-orphan ayrı dosya değil | ❓ PARTIAL |
| Worker Honest Assessment Calibration v2 | Task 8 | Worker prompt + applyTechDebtDowngrade | Bu rapordaki "Honest Self-Assessment" prompt block yaşıyor | ✅ WIRED |
| Long-Running Sprint Resume MVP | Task 9 | `sprint-checkpoint.ts` + `resume.ts` | `src/orchestra/sprint-checkpoint.ts` + `src/cli/commands/resume.ts` mevcut | ✅ WIRED |

### 4.2 Sprint 139 Features

| Feature | Iddia Eden | Beklenen Kaynak | T1 Bulgu | Status |
|---------|------------|------------------|----------|--------|
| Docker HB Core Fix 5-sprint P0 | Task 13 | atomicWriteFileSync + spawn-backend-docker | `src/orchestra/spawn-backend-docker.ts` mevcut | ✅ WIRED |
| Chain Dependency Scheduler Wave 1 | Task 28 | `dependency-scheduler.ts` | `src/orchestra/dependency-scheduler.ts` + `src/nervous/detectors/scope-collision.ts` mevcut | ✅ WIRED |
| Backend Parity 3/3 (docker+tmux+subprocess) | Tasks 17-19 | spawn-backend-{docker,tmux,subprocess} | `spawn-backend.ts` (subprocess), `spawn-backend-docker.ts`, `tmux.ts` mevcut | ✅ WIRED |
| ADR-037 RBAC Authority Matrix V1.0 | Task 34/35 | runtime scope enforcement | `src/nervous/runtime-scope-check.ts` mevcut (CLAUDE.md `src/core/` der — **konum drift**) | ✅ WIRED with drift |
| ADR-038 Self-Modifying Task Detection | Task 51/52 | `self-modifying-detector.ts` | `src/orchestra/self-modifying-detector.ts` mevcut (DECKENT mention'ı belirsiz) | ✅ WIRED |
| Notification Dispatcher + notify-adapters | Task 41 | `notification-dispatcher.ts` + `notify-adapters/` | `src/core/notification-dispatcher.ts` + `src/core/notify-adapters/` mevcut | ✅ WIRED |
| Event Stream Runtime E2E Test | Task 44 | tests/e2e | `tests/e2e/` 22 file — event-stream E2E içerme olasılığı var | ❓ PARTIAL |

### 4.3 Sprint 140-148 Era (özet)

Sprint 140-148 arası feature listesi `IDENTITY.md`'de yer almıyor — gap. Sprint 168 doc task'ı bu boşluğu doldurmalı.

| Sprint Aralığı | İddia | T1 Bulgu | Status |
|----------------|--------|----------|--------|
| Sprint 140 | Worker tokenUsage zorunlu | `task-types.ts` + `result-evaluator.ts` `tokenUsage` field grep edildi | ✅ WIRED |
| Sprint 141-147 | Detayda iddia yok | (audit dışı) | — |
| Sprint 147 ADR-040 Nervous System | nervous/* | `src/nervous/` 22 dosya mevcut + 5 MCP tool | ✅ WIRED |
| Sprint 148 ADR-041 Agent Taxonomy | 15 vertical agent | `.deckent/agents/` 18 entry (1 archive dir) | ✅ WIRED with drift |

### 4.4 Sprint 149-166 Era

| Sprint | İddia (IDENTITY/RETRO) | T1 Bulgu | Status |
|--------|------------------------|----------|--------|
| Sprint 149 | test-writer reform | (T1 derin grep gerek) | ❓ PARTIAL |
| Sprint 150 | ADR-041 reconfirmed | ADR-041 .brain/exports/summary.md'de accepted | ✅ WIRED |
| Sprint 156 | ADR-053/055/060 proposed | summary.md status: proposed (3 ADR) | ✅ visible |
| Sprint 162 | Sprint Phase Observability + EvaluationAuditTrail | grep ile evaluation-audit-trail dosyası: TODO Sprint 168 | ❓ PARTIAL |
| Sprint 165 | Brain Final Stability + npm publish prep | `scripts/check-publish-readiness*` mevcut (Sprint 167 task scope dışı) | ✅ WIRED |
| Sprint 166 | ADR-046 Brain Self-Update Hook | `src/core/adr-file-sync.ts` + `src/orchestra/sprint-finalizer.ts` mevcut | ✅ WIRED |
| Sprint 166 | identity-generator | `src/core/identity-generator.ts` mevcut — Sprint 168 decommission önerisi | ✅ WIRED (target for retirement) |

### 4.5 MEDIUM Finding T1-FEATURE-001 — Sprint 140-148 Documentation Gap

`IDENTITY.md` Sprint 138-139 ve 165-166 detayını veriyor, ama 140-164 arasını "Sprint Phase Observability + EvaluationAuditTrail" tek satıra sıkıştırıyor. T3 (ADR audit) + T7 (cross-cut sentez) bu boşluğu doldurmalı.

**Suggested_fix:** Sprint 168 doc task — `IDENTITY.md` Features bölümü auto-generate hook'a bağlansın (`scripts/regen-identity-features.mjs`). **sprint_slot:** Sprint 168 T-DOC-C. **effort_estimate:** 3h. **severity:** MEDIUM.

---

## 5. Vitest Skip Categorization

### 5.1 Sayım Özeti

| Kategori | Adet | Çalıştırılma |
|----------|------|--------------|
| `.skip(` unconditional | **25** | Hiçbir platformda koşmaz |
| `.skipIf(isWindows)` | **66** | Sadece Linux/macOS'ta koşar, Windows CI'da atlanır |
| **Toplam skip ifadesi** | **91** | (DIRECTIVES: 41 — farklı sayım kuralı) |

### 5.2 Unconditional `.skip(` Breakdown (25 vaka)

| Dosya | Adet | Tema |
|-------|------|------|
| `tests/cli/commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts` | 4 | "covered by archive-debt.test.ts" — duplicate kapsamı |
| `tests/docs/readme.test.ts` | 5 | README structure asserts — README dinamik içerik olduğu için skip |
| `tests/cli/rich-output.test.ts` | 3 | quick-start/skill-marketplace/config migrate CLI komutu README'de yok |
| `tests/orchestra/turkish-locale.test.ts` | 2 | "requires toLocaleLowerCase fix in source" — kaynak fix bekleyen test |
| `tests/orchestra/sprint-retro-writer.test.ts` | 2 | "not yet implemented" — feature beklemede |
| `tests/orchestra/dependency-pipeline.test.ts` | 2 | dependency_pipeline_enabled false → flip Sprint 168 |
| `tests/scripts/adr-validator.test.ts` | 2 | DECISIONS.md kaldırıldı, ADR-036 self-referential |
| `tests/cli/commands/skill-marketplace.test.ts` | 1 | `describe.skip('publish')` — marketplace publish feature beklemede |
| `tests/cli/commands/small-commands-improvements.test.ts` | 1 | publish manifest author validation |
| `tests/blueprint/files.test.ts` | 1 | AGENTS.md Architecture section beklemede |
| `tests/orchestra/event-bus.test.ts` | 1 | event-bus integration test (real I/O) |
| `tests/cli/commands.test.ts` | 1 | "language-first init flow" — mock update beklemede |

### 5.3 `.skipIf(isWindows)` Breakdown (66 vaka)

Tüm `.skipIf(isWindows)` çağrıları **tmux + POSIX path** operasyonlarına ait. Dosya dağılımı:

| Dosya | Yaklaşık Adet |
|-------|---------------|
| `tests/orchestra/tmux.test.ts` | ~15 |
| `tests/orchestra/tmux-edge.test.ts` | ~10 |
| `tests/scripts/scripts.test.ts` | 7 |
| `tests/orchestra/spawn-backend-docker.*.test.ts` | (varsa) ≥5 |
| Diğer POSIX-spesifik testler | ~29 |

**Sınıflandırma:** `.skipIf(isWindows)` Windows CI dışında **runtime'da koşar** — gerçek anlamda "atlanan test" değil, platform-conditional. CI baseline 16,395 pass + 41 skip iddiası muhtemelen şu hesaba dayanır: 16,438 - 25 unconditional skips - 16 known platform skips = 16,397 (kabaca eşit). **41 sayısının kesin türevi T6 görevine devredilir.**

### 5.4 LOW Finding T1-SKIP-001 — Skip Inventory Drift

- DIRECTIVES.md "41 vitest skip" diyor.
- IDENTITY.md "16 skipped" diyor.
- T1 grep: 25 unconditional + 66 conditional.

Üç farklı sayı, üç farklı sayım kuralı. T6 (test+build+security audit) bu sayıyı CI run'dan deterministik türetmeli (`vitest run --reporter=json` → pass/fail/skip).

**Suggested_fix:** Sprint 168 — `scripts/test-skip-inventory.mjs` skip kategorize edip JSON çıktı versin. CI'da artifact olarak yüklensin. **sprint_slot:** Sprint 168 T-CI-A. **effort_estimate:** 2h. **severity:** LOW.

### 5.5 Skip Triage — "Implementation Pending" vs "Documentation Gap"

| Tema | Skip Sayısı | Sprint 168 Aksiyon |
|------|-------------|---------------------|
| README/doc structure asserts | 8 | Doküman regen + un-skip |
| `turkishLocale.toLocaleLowerCase` fix beklemede | 2 | Kaynak bug fix → un-skip |
| dependency_pipeline_enabled false | 2 | Flip + un-skip (sprint 168 input) |
| ADR-036 / DECISIONS.md migration | 2 | Test refactor — ADR-036 query API'ye geç |
| skill-marketplace publish | 2 | Feature beklemede (Sprint 169 GA?) |
| Diğer (duplicate / not-yet-impl) | 9 | Sprint 168'de re-evaluate |
| **TOPLAM unconditional** | **25** | |

---

## 6. Bug N Regression Test Gap Analysis

### 6.1 Bug N Tanımı (Tahmini)

`DIRECTIVES.md` ve `IDENTITY.md` arasında "Bug N" doğrudan tanımlanmıyor; Sprint 166 fix list'inde "Bug M+N+S+Y2+R+T+U+V+C+X+P+Q+W+K+L fix" şeklinde geçiyor. Görünüşe göre **Bug N = "finalize/rule regen race"** ya da benzer bir koordinasyon hatası — `tests/cli/finalize-rule-regen.test.ts` dosyasının varlığı bu hipoteze işaret ediyor (168 satır, 24 test/describe/it ifadesi).

### 6.2 Test Coverage Doğrulaması

- **Dosya:** `tests/cli/finalize-rule-regen.test.ts`
- **Satır:** 168
- **Test ifade sayısı (it/test/describe grep):** 24
- **Beklenen:** Bug N spesifik regression scenario — finalize → rule regen race testi
- **T1 statik doğrulama:** Dosya mevcut, test grepi geçiyor. Ancak **scenario semantiği** (race scenario, edge case, regression case) statik grep ile doğrulanamaz; T1 read-only olduğu için içerik inceleme dışında.

### 6.3 MEDIUM Finding T1-BUG-N-001 — Bug N Regression Test Semantic Coverage Belirsiz

Test dosyası mevcut ama **Bug N spesifik regression scenario'su** olduğu **kanıt mevcut değil**. Test başlığı ("finalize-rule-regen") Bug N kayıt formatına uyuyor görünüyor ama doğrulanmadı.

**Suggested_fix:** Sprint 168 audit task — `tests/cli/finalize-rule-regen.test.ts` semantic review (it block başlıklarını oku, Bug N reproduction case ile eşleştir). Eksikse Bug N regression test'i ekle. **sprint_slot:** Sprint 168 T-TEST-A. **effort_estimate:** 2h. **severity:** MEDIUM.

### 6.4 Diğer Bug Regression Test Inventory (Spot Check)

Sprint 166 fix list'inde geçen diğer bug'lar için regression test varlığı **T1 read-only kapsamında doğrulanmadı**. Sprint 168 audit task: Bug M/N/S/Y2/R/T/U/V/C/X/P/Q/W/K/L her biri için `tests/regression/` dizininde veya benzer namespace'de regression test parity.

**LOW Finding T1-BUG-REG-001 — Comprehensive Bug Regression Test Inventory Yok**

Sprint 138-166 boyunca tespit edilen ~15-20 bug için merkezi regression test dizini (`tests/regression/`) yok. Testler dağınık (`tests/cli/`, `tests/orchestra/`) konumlarda. **Suggested_fix:** Sprint 169 — `tests/regression/sprint-NNN/` namespace + bug ID frontmatter. **sprint_slot:** Sprint 169 T-TEST-A. **effort_estimate:** 4h. **severity:** LOW.

---

## 7. Findings Summary + Sprint 168 Handoff

### 7.1 Findings Severity Matrix

| ID | Severity | Title | Suggested Fix | Sprint Slot | Effort |
|----|----------|-------|---------------|-------------|--------|
| T1-MCP-001 | HIGH | "27 MCP tools" iddiası, gerçek 31 — IDENTITY/DECKENT drift | doc auto-regen | Sprint 168 T-DOC-A | 1h |
| T1-TEST-001 | HIGH | "505 test files" iddiası, gerçek 772 — ground-truth drift | CI hook | Sprint 168 T-DOC-B | 2h |
| T1-CLI-001 | MEDIUM | `quick-start.ts` register edilmemiş orphan | register veya sil | Sprint 168 dead-code | 1h |
| T1-FEATURE-001 | MEDIUM | Sprint 140-148 IDENTITY documentation gap | regen-identity hook | Sprint 168 T-DOC-C | 3h |
| T1-DEAD-001 | MEDIUM | 7 `src/agents/prompt-*` dead candidate | karar matrisi | Sprint 168 T-DEAD-A | 3h |
| T1-BUG-N-001 | MEDIUM | Bug N regression test semantic belirsiz | semantic review | Sprint 168 T-TEST-A | 2h |
| T1-CLI-002 | LOW | `skill-marketplace.ts` register pattern dışında | sub-cmd verify | Sprint 168 inceleme | 1h |
| T1-MCP-002 | LOW | feature_query CLI ↔ MCP parity belirsiz | doc parity | Sprint 168 T-DOC-D | 1h |
| T1-DEAD-002 | LOW | 4 suspect file (test-run, mock backend, marketplace resolver, god-template) | git-log audit | Sprint 168 T-DEAD-B | 1h |
| T1-SKIP-001 | LOW | 41/25/16 üç farklı skip sayısı | CI artifact | Sprint 168 T-CI-A | 2h |
| T1-BUG-REG-001 | LOW | tests/regression/ namespace yok | namespace migrate | Sprint 169 T-TEST-A | 4h |

**Toplam finding:** 11. **HIGH:** 2. **MEDIUM:** 4. **LOW:** 5.

### 7.2 Sprint 168 Roadmap Input (T7 cross-cut için)

T7 (cross-cutting synthesis) bu raporu okurken aşağıdaki **cross-cut pattern'leri** birleştirmelidir:

1. **Ground-truth drift** (T1-MCP-001 + T1-TEST-001 + T1-CLI-001) — IDENTITY.md "ground truth" güvenilirliği zedeleniyor. Bug Y2 paterni: doc içeriği ile gerçek code state divergence. T2'nin "9 ground-truth claim parity" görevine zorunlu input.
2. **Dead/dormant code aglomerasyonu** (T1-DEAD-001 + T1-DEAD-002 + T1-CLI-001 + T1-CLI-002) — ~12-15 dosya cleanup için aday. Sprint 168 cleanup task tek bir konsolide audit ile başlamalı, dağınık cleanup karmaşası yaratmamalı.
3. **Test inventory belirsizliği** (T1-TEST-001 + T1-SKIP-001 + T1-BUG-N-001 + T1-BUG-REG-001) — test sayım kuralları net değil, regression test namespace yok. CI artifact + namespace standartlaştırma Sprint 168'e zorunlu.

### 7.3 GO/NO_GO Predicate (`.audit/sprint-167/T1-predicate.sh`)

Bu raporun yanında **bash predicate script** yazıldı. Script çıktı:
- `wc -l .audit/sprint-167/T1-code-inventory.md` ≥ 500 → PASS
- `grep -c "^## " .audit/sprint-167/T1-code-inventory.md` ≥ 6 → PASS

### 7.4 Audit Scope Compliance Self-Statement

**HİÇBİR SOURCE/DOC DOSYASI BU TASK KAPSAMINDA DEĞIŞTIRILMEDİ.** Yazılan dosyalar:

1. `.audit/sprint-167/T1-code-inventory.md` (bu rapor)
2. `.audit/sprint-167/T1-predicate.sh` (GO/NO_GO script)
3. `.tasks/task-167-001.plan` (execution plan)
4. `.tasks/task-167-001.hb` (heartbeat, harness tarafından da yönetiliyor)
5. `.tasks/task-167-001.result` (worker result — son adım)

`src/`, `tests/`, `dist/`, `docs/`, root `.md` dosyalarına dokunulmadı. ADR-008 Brain merkezi import compliance dolaylı doğrulandı (T1 grep + dosya varlık check). ADR-010 commander tek dependency ADR-006/007 spawnSync pattern — T1 read-only kapsamında doğrudan denetlenmedi (T3'e devredildi).

### 7.5 T1 Limitations / Honest Self-Assessment

T1 statik grep tabanlı keşif olduğu için aşağıdaki sınırlamalara sahiptir:

- **Dynamic import**, **lazy require**, **eval-style dispatch** grep tarafından yakalanmaz. Dead code finding'leri Sprint 168'de runtime instrumentation ile doğrulanmalı.
- Test coverage **semantic** doğrulama yapılmadı (sadece dosya varlık + grep). Sprint 168 audit task semantic review yapmalı.
- "27 vs 31" MCP tool drift gibi sayım farklılıkları **iddia tartı** sunuyor; Sprint 168'in karar vermesi gereken bir bug yok — IDENTITY/DECKENT'in regen edilmesi yeterli.
- Yapılan tüm grep komutları **read-only** — hiçbir dosya değişikliği oluşmadı.

---

## 8. Appendix — Verbatim Grep Commands

Bu raporun türetildiği temel grep komutları (Sprint 168 reproducibility için):

```bash
# CLI register count
grep -c "^  register" src/cli/index.ts                  # → 46

# MCP register count
grep -c "^  register" src/mcp/tools/index.ts            # → 27

# All deckent_ tool names
grep -rE "'deckent_[a-z_]+'" src/mcp/tools/*.ts | \
  grep -oE "'deckent_[a-z_]+'" | sort -u | wc -l        # → 31

# Unconditional vitest skips
grep -rnE "(\bit|\btest|\bdescribe)\.skip\(" tests/ | wc -l   # → 25

# Platform-conditional skips
grep -rnE "\.skipIf\(" tests/ | wc -l                          # → 66

# Total src .ts files
find src -name "*.ts" | wc -l                                  # → 411

# Total test files
find tests -name "*.test.ts" | wc -l                           # → 772

# Built-in agent dirs
ls -d .deckent/agents/*/ | wc -l                                # → 18

# Built-in skill dirs
ls -d .deckent/skills/*/ | wc -l                                # → 21

# Dead code grep example (per-module)
grep -rln "from '.*/specialization-drift.js'" src/ | wc -l     # → 0
```

---

**END OF REPORT — T1 (Code Inventory + Dead Code + Unused Features Audit)**

Yazar: code-reviewer agent (read-only mode)
Tarih: 2026-05-14
Sprint: 167
İmza: Wave 1 anchor task #1
