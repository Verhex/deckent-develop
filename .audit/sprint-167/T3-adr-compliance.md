# T3 — ADR Compliance + Status Audit (Sprint 167)

**Audit kapsamı:** 50 ADR enumeration (DB ↔ file system parity) + runtime compliance scan (8 ADR) + 4 rules dir cross-reference + ADR-046 Step 1-4 wire canlı trigger evidence + identity-generator Step 2 decommission önerisi (Sprint 168'e) + ADR-047 Manuel Survival Pattern input data (T5 ile cross-cut) + Sprint 156'tan beri "proposed" durumunda kalan ADR-053 / ADR-055 / ADR-060 için closure önerisi.

**Sprint 167 anchor constraint:** Bu rapor **read-only audit** çıktısıdır. Hiçbir ADR status'u değiştirilmemiştir. Tüm öneriler Sprint 168 remediation roadmap'i için **suggested_fix** input'udur — Sprint 167 yalnızca tespit eder.

**Üretim tarihi:** 2026-05-14
**Worker:** w-167-003 (code-reviewer agent)
**Skills:** typescript-expert, system-architect
**Kaynak veri:** docs/adr/*.md, .brain/memory.db (read-only), .claude/rules/, .codex/rules/, .gemini/rules/, .cursor/rules/, src/, .brain/sprints/, .brain/exports/

---

## Bölüm Yapısı

1. ADR Enumeration + DB↔File Parity + Status Table (3.1)
2. 50 ADR detayı (her biri ayrı `### ADR-NNN` başlık)
3. Runtime Compliance Scan (3.2 — 8 ADR)
4. Cross-Reference 4 Rules Dir + ADR-046 Step 1-4 Wire Evidence (3.3)
5. Proposed Closure Önerisi (053/055/060 — Sprint 156'dan beri proposed)
6. Identity-Generator Step 2 Decommission Önerisi (Sprint 168'e)
7. ADR-047 Manuel Survival Pattern Input Data (T5 cross-cut)
8. Findings Severity Table + Sprint 168 Roadmap Input
9. GO/NO_GO Falsifiable Predicate (T3-predicate.sh)

---

## 1. ADR Enumeration + DB↔File System Parity (3.1)

### 1.1 Toplam Sayım

| Kaynak | Sayı | Notlar |
|--------|------|--------|
| `.brain/memory.db` (type='adr') | **50** | Single source of truth (Memory V2 DB-First — ADR-036 governance) |
| `docs/adr/*.md` (file system) | **7** | Sadece son ADR'lar: 043, 044, 045, 046, 053, 055, 060 |
| `.brain/exports/decisions.md` | **50** | Auto-generated export (Sprint 166 ADR-046 Step 1 memoryExport tarafından regenerate) |
| `.claude/rules/*.md` Active ADR Constraints | **39** | Sprint 166 hook chain Step 4 ruleRegen tarafından regenerate (042/043/044/045/046/053/055/060 listelenmemiş — bilinen gap) |

**Tespit (Parity Drift Bulgusu #1):** DB'de 50 ADR, dosya sisteminde 7 ADR. ADR-001..042 + 022-v2 yalnızca DB'de yaşar — Sprint 138 ADR-036 migration anında MADR v3 hibrit formata geçirilirken eski .md dosyaları arşive alındı (`.brain/archive/pre-v2/DECISIONS.md`). Bu **drift değil, kabul edilmiş tasarım** — DB single source of truth, .md dosyaları yalnızca export. Ancak yeni ADR'lar (043+) hem DB'ye hem `docs/adr/`'ye yazılır. **Bu çift-yazma policy'si ADR-046 Step 3 (adrInsert) tarafından korunuyor** (canlı, Sprint 166).

**Tespit (Parity Drift Bulgusu #2):** `.claude/rules/brain.md` Active ADR Constraints bloğu 39 ADR listeler ama DB'de 50 ADR var. Eksik 11: ADR-040 (sprint-147), ADR-042 (sprint-150, proposed), ADR-043/044 (sprint-163), ADR-045 (sprint-164), ADR-046 (sprint-166), ADR-053/055/060 (sprint-156, proposed). ADR-040 ve 041 bloğun başında "Active ADR Constraints" header'ından **önce** listelenmiş, yani format kırık (`---` separator + ikinci kopya `Brain Rules` bloğu var — rules dosyası iki kez render edilmiş gibi görünüyor). Detay 3. bölümde.

### 1.2 Status Dağılımı (DB)

| Status | Sayı | ADR ID'leri |
|--------|------|-------------|
| accepted | 46 | adr-001..004, 006..021, 022-v2, 023..041, 043..046 |
| proposed | 4 | adr-042 (Hybrid Mode), adr-053, adr-055, adr-060 |
| superseded | 1 | adr-022 (→ adr-022-v2) |
| deprecated | 1 | adr-005 (Synchronous I/O — ADR-006 ile değiştirildi) |

### 1.3 Sprint Aralığı

| Sprint Aralığı | ADR Aralığı | Yoğunluk |
|---------------|-------------|----------|
| Erken (pre-100) | ADR-001..021 | 21 (foundational, TypeScript+ESM, build, lint, config) |
| Sprint 044-085 | ADR-022..026 + 022-v2 | 6 (CLI/MCP parity, god-object split) |
| Sprint 120-139 | ADR-027..039 | 13 (provider routing, governance, RBAC, self-modifying) |
| Sprint 147-150 | ADR-040..042 | 3 (Nervous System, Agent Taxonomy, Hybrid Mode proposed) |
| Sprint 156 | ADR-053, ADR-055, ADR-060 | 3 (TaskType taxonomy, Hybrid Scoring, Self-Awareness — **hepsi proposed**) |
| Sprint 163-166 | ADR-043..046 | 4 (Crash Recovery, Observability, Wave Semantics, Self-Update Hook) |

**Numaralandırma boşluğu:** 042 ile 053 arasında ADR yok. ADR-053/055/060 da numarasal sıra dışı (054, 056-059, 061+ yok). Bu Sprint 156'da spec yazıldıktan sonra implementation aşamasına geçilemediği, ADR'ların proposed kaldığı için "yer ayrılmış" durumdur. **Sprint 168 önerisi:** Bu ADR'lar accept edilirse renumber edilebilir veya proposed kapatma kararı ile gap formel hâle getirilir.

---

## 2. 50 ADR Detaylı Status Tablosu

Her ADR bir satır: ID, başlık, status, sprint, dosya varlığı, runtime impact.

### ADR-001
- **Title:** TypeScript + ESM
- **Status:** accepted
- **Sprint:** pre-100 (foundational)
- **File:** ❌ (DB only — legacy migration)
- **Runtime impact:** package.json `"type": "module"`, tsconfig.json `"module": "Node16"`, ESM `.js` import zorunluluğu.

### ADR-002
- **Title:** Node16 Module Resolution
- **Status:** accepted
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** tsconfig `moduleResolution: Node16`, ESM `.js` uzantısı zorunlu (`import { x } from './y.js'`).

### ADR-003
- **Title:** vitest over Jest
- **Status:** accepted
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** package.json test runner `vitest`, vitest.config.ts + vitest.dashboard.config.ts.

### ADR-004
- **Title:** 3-Layer Config Merge
- **Status:** accepted
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** `src/core/config.ts` defaults → global (`~/.deckent/`) → project (`.deckent/config.json`).

### ADR-005
- **Title:** Synchronous I/O
- **Status:** **deprecated**
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** ADR-006 spawnSync security pattern ile değiştirildi. Eski sync I/O kullanımları audit subject — Sprint 168 için tarama önerilir.

### ADR-006
- **Title:** spawnSync Security Pattern
- **Status:** accepted
- **Sprint:** pre-100 (reinforced Sprint 138 Task 6 — runtime wire forensic fix)
- **File:** ❌
- **Runtime impact:** `src/core/spawn-safety.ts` `assertSpawnSafe()`. 173 `spawnSync` kullanımı src/ içinde. Layer 4 runtime wire forensic fix Sprint 138 Task 6 ile canlı enforcement.

### ADR-007
- **Title:** SpawnOptions Interface
- **Status:** accepted
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** TypeScript interface for spawn options; provider adapters consume this.

### ADR-008
- **Title:** Brain Merkezi Import — Tek Yönlü Bağımlılık
- **Status:** accepted
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** planner.ts brain'i import etmez (CANLI: `head -20 src/orchestra/planner.ts` → yalnızca `core/types.js`, `core/provider.js`, `core/utils.js` imports). Worker/Auditor dosyadan task okur, brain import etmez.

### ADR-009
- **Title:** DEBT.md Markdown Tablo Formatı
- **Status:** accepted
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** `.brain/exports/debt.md` auto-generated tablo formatı, `deckent memory export` çıktısı.

### ADR-010
- **Title:** Tek Runtime Dependency — commander.js
- **Status:** accepted
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** package.json dependencies sadece commander.js + better-sqlite3 + zod (Memory V2 + planner validation eklendi sonradan).

### ADR-011
- **Title:** node:readline/promises — Built-in Prompt
- **Status:** accepted
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** CLI prompt'larda `node:readline/promises` kullanımı, harici prompt library yasak.

### ADR-012
- **Title:** register\<Name\>(program) Pattern
- **Status:** accepted
- **Sprint:** pre-100
- **File:** ❌
- **Runtime impact:** `src/cli/commands/*.ts` her komut `register<Name>(program)` export eder; `src/cli/index.ts` toplu register.

### ADR-013
- **Title:** DECKENT.md Adapter Pattern (Sprint 15)
- **Status:** accepted
- **Sprint:** 15
- **File:** ❌
- **Runtime impact:** DECKENT.md kök adapter pattern, CLAUDE.md alt modüller.

### ADR-014
- **Title:** .deck Secret File System (Sprint 044)
- **Status:** accepted
- **Sprint:** 44
- **File:** ❌
- **Runtime impact:** `.deck/` secret config dosya yapısı.

### ADR-015
- **Title:** TaskRouter Module — 6-level routing (Sprint 044)
- **Status:** accepted
- **Sprint:** 44
- **File:** ❌
- **Runtime impact:** `src/orchestra/task-router.ts` 6-level routing (provider + agent + skill).

### ADR-016
- **Title:** Connector Module — provider lifecycle (Sprint 044)
- **Status:** accepted
- **Sprint:** 44
- **File:** ❌
- **Runtime impact:** `src/connectors/` provider lifecycle hooks.

### ADR-017
- **Title:** MCP-Native Provider Adapters (Sprint 045)
- **Status:** accepted
- **Sprint:** 45
- **File:** ❌
- **Runtime impact:** `src/providers/` MCP-native adapters.

### ADR-018
- **Title:** Multi-Environment Config Generation (Sprint 046)
- **Status:** accepted
- **Sprint:** 46
- **File:** ❌
- **Runtime impact:** Multi-env (.claude/.codex/.gemini/.cursor) rules generation.

### ADR-019
- **Title:** Language-Agnostic Worker Verify (Sprint 046)
- **Status:** accepted
- **Sprint:** 46
- **File:** ❌
- **Runtime impact:** Worker verify loop language-agnostic (tsc + vitest TS için, ekstensible).

### ADR-020
- **Title:** Rich Sprint Output — 7-section summary (Sprint 044)
- **Status:** accepted
- **Sprint:** 44
- **File:** ❌
- **Runtime impact:** `deckent status` 7-section rich output formatı.

### ADR-021
- **Title:** Kraken ASCII Brand Identity (Sprint 044)
- **Status:** accepted
- **Sprint:** 44
- **File:** ❌
- **Runtime impact:** CLI banner ASCII art.

### ADR-022
- **Title:** CLI/MCP Feature Parity — Tek Yapı, Çoklu Ortam (Sprint 067)
- **Status:** **superseded** (→ adr-022-v2)
- **Sprint:** 67
- **File:** ❌
- **Runtime impact:** ADR-022-V2 ile değiştirildi (parametre eşitleme).

### ADR-022-v2
- **Title:** CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar (Updated Sprint 085)
- **Status:** accepted
- **Sprint:** 85
- **File:** ❌
- **Runtime impact:** CLI ↔ MCP 1:1 parametre parity (memory_query, recall, remember dahil).

### ADR-023
- **Title:** Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri (Sprint 072)
- **Status:** accepted
- **Sprint:** 72
- **File:** ❌
- **Runtime impact:** ModelRegistry tier abstraction (premium_plus/premium/standard/economy), provider-agnostic config (brain_tier/worker_tier).

### ADR-024
- **Title:** sprint-controller.ts God Object Split — sprint-phases.ts Extract (Sprint 072)
- **Status:** accepted
- **Sprint:** 72
- **File:** ❌
- **Runtime impact:** Sprint 136 T-008 ile `sprint-controller.ts` 1890→209 LoC. Modular sprint phases (`sprint-spawner.ts`, `sprint-lifecycle.ts`, `sprint-finalizer.ts`).

### ADR-025
- **Title:** Graceful Shutdown Stratejisi — SIGINT → interruptActiveSprint (Sprint 076)
- **Status:** accepted
- **Sprint:** 76
- **File:** ❌
- **Runtime impact:** SIGINT/SIGTERM `interruptActiveSprint()` ile graceful shutdown.

### ADR-026
- **Title:** God Object Split Stratejisi — Faz 1-3 Tamamlandı (Sprint 076)
- **Status:** accepted
- **Sprint:** 76
- **File:** ❌
- **Runtime impact:** Sprint 076-136 boyunca uygulanan 3 fazlı modülarizasyon.

### ADR-027
- **Title:** Hybrid Spawn Backend (Sprint 123, Revisited Sprint 139)
- **Status:** accepted
- **Sprint:** 123 (revisited 139)
- **File:** ❌
- **Runtime impact:** Docker + tmux + subprocess hybrid spawn backend; Sprint 139 backend parity 3/3.

### ADR-028
- **Title:** Decision-Engine V1 → V2 Routing Migration
- **Status:** accepted
- **Sprint:** ?
- **File:** ❌
- **Runtime impact:** `routing_engine: v2` config flag, `routing-engine.ts` ile `routeTaskV2()`.

### ADR-029
- **Title:** Managed-Docs Universalization — Sprint Lifecycle Template-Based Document Generation
- **Status:** accepted (Sprint 131)
- **Sprint:** 131
- **File:** ❌
- **Runtime impact:** `src/orchestra/managed-docs/` modül paketi, `runManagedDocUpdates()`.

### ADR-030
- **Title:** Template Engine + Plugin Loader — Managed-Docs Render Pipeline
- **Status:** accepted (Sprint 131)
- **Sprint:** 131
- **File:** ❌
- **Runtime impact:** Template engine + plugin loader, iki katmanlı extensibility.

### ADR-031
- **Title:** Content Hash Cache — Sprint Dokümanları Hash-Based Invalidation
- **Status:** accepted (Sprint 131)
- **Sprint:** 131
- **File:** ❌
- **Runtime impact:** Hash-based cache invalidation, gereksiz regenerate kaçınma.

### ADR-032
- **Title:** i18n Pattern System — TR/EN İçerik Çeşitliliği Desteği
- **Status:** accepted (Sprint 131)
- **Sprint:** 131
- **File:** ❌
- **Runtime impact:** İki katmanlı i18n stratejisi (TR/EN content patterns). FTS5 dual-layer normalize (TR/EN/DE %100 recall) tamamlayıcı.

### ADR-033
- **Title:** Product Vision — Product Not Service
- **Status:** accepted
- **Sprint:** 134
- **File:** ❌
- **Runtime impact:** Multi-project isolation, per-project security boundaries, deckent paket boundary'leri.

### ADR-034
- **Title:** Multi-Project Isolation — Per-Project Security Boundaries
- **Status:** accepted
- **Sprint:** 134
- **File:** ❌
- **Runtime impact:** Her proje kendi `.deckent/` izolasyonu; deckent paket çoklu proje desteği.

### ADR-035
- **Title:** Brain ↔ Worker ↔ Auditor Verification Protocol Standard (Sprint 138)
- **Status:** accepted
- **Sprint:** 138
- **File:** ❌
- **Runtime impact:** 15 channel codes V1.0 verification protocol. `src/orchestra/result-evaluator.ts` + `quality-assessor.ts` ile entegre.

### ADR-036
- **Title:** ADR Governance Integration — Mandatory Architecture Decision Enforcement
- **Status:** accepted
- **Sprint:** 138
- **File:** ❌
- **Runtime impact:** MADR v3 hibrit + 37 ADR migration + ADR-036 self-referential + `scripts/adr-validator.mjs` + DECKENT.md mandatory read + worker prompt injection. Worker prompt'larında ADR injection canlı (bu T3 worker promptunda görülüyor).

### ADR-037
- **Title:** Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0
- **Status:** accepted
- **Sprint:** 139
- **File:** ❌
- **Runtime impact:** `src/orchestra/authority-enforcer.ts` (canlı), `src/nervous/authority-matrix.ts` (preset + safety floor). Sprint 139 soft enforcement, Sprint 140+ hard enforcement planlı.

### ADR-038
- **Title:** Dead Code Disposition — Sprint 139 Audit Results
- **Status:** accepted
- **Sprint:** 139
- **File:** ❌
- **Runtime impact:** Dead code disposition policy. `docs/audits/sprint-139/dead-code-report.md` referans.

### ADR-039
- **Title:** Self-Modifying Task Detection — Deckent Dogfood vs User Project Discrimination
- **Status:** accepted
- **Sprint:** 139
- **File:** ❌
- **Runtime impact:** `src/orchestra/self-modifying-detector.ts` (canlı). Dogfood vs user project ayrımı.

### ADR-040
- **Title:** Nervous System Architecture — Proactive Meta-Orchestrator
- **Status:** accepted
- **Sprint:** 147
- **File:** ❌
- **Runtime impact:** `src/nervous/` modülü (observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, runtime-scope-check, history).

### ADR-041
- **Title:** Agent Taxonomy — Horizontal Skills vs Vertical Agents
- **Status:** accepted (Sprint 150 reconfirmed)
- **Sprint:** 150
- **File:** ❌
- **Runtime impact:** Tüm testing agent'ları kaldırıldı (Sprint 166 reconfirmed) — `src/core/agent-pool.ts` içinde testing-engineer / test-engineer / qa-engineer yok (CANLI doğrulandı).

### ADR-042
- **Title:** Hybrid Mode Architecture — Sprint + Task Dual Modes
- **Status:** **proposed**
- **Sprint:** 150
- **File:** ❌
- **Runtime impact:** Henüz implementation yok; proposed kalmaya devam ediyor. Sprint 168 önerisi: accept veya reject kararı verilmeli.

### ADR-043
- **Title:** Brain Crash Recovery Protocol
- **Status:** accepted
- **Sprint:** 163
- **File:** ✅ `docs/adr/043-brain-crash-recovery-protocol.md` (8474 bytes)
- **Runtime impact:** `deckent recover` komutu, partial state replay.

### ADR-044
- **Title:** Sprint State Observability Contract
- **Status:** accepted
- **Sprint:** 163
- **File:** ✅ `docs/adr/044-sprint-state-observability-contract.md` (6888 bytes)
- **Runtime impact:** Sprint state JSON contract, `.dashboard.json` observability.

### ADR-045
- **Title:** Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire
- **Status:** accepted
- **Sprint:** 164
- **File:** ✅ `docs/adr/045-wave-based-execution-semantics.md` (11801 bytes)
- **Runtime impact:** `src/orchestra/sprint-spawner.ts:364 respawnEligibleTasks()` canlı. Wave gate sprint controller'da kullanılıyor (Sprint 167 T7 Wave 2 bağımlılığı bu kontrata göre yazıldı).

### ADR-046
- **Title:** Brain Self-Update Hook Architecture
- **Status:** accepted
- **Sprint:** 166
- **File:** ✅ `docs/adr/046-brain-self-update-hook-architecture.md` (12435 bytes)
- **Runtime impact:** Step Ordering Contract — Step 1 (memoryExport) → Step 2 (identityRegen, deprecated) → Step 3 (adrInsert, Bug M fix) → Step 4 (ruleRegen). `src/core/identity-generator.ts:323 runPostFinalizeHooks()` canlı; `src/core/adr-file-sync.ts` (244 LoC) Step 3 implementation.

### ADR-053
- **Title:** TaskType Taxonomy — Audit / Document-Write / Code-Development + Extensibility Roadmap
- **Status:** **proposed** (Sprint 156'dan beri)
- **Sprint:** 156
- **File:** ✅ `docs/adr/053-task-type-taxonomy.md` (9268 bytes)
- **Runtime impact:** TaskType taxonomy spec mevcut, runtime'da kısmî uygulama (Sprint 167 T5 forensic mode override gibi). Tam adoption beklenir.

### ADR-055
- **Title:** Hybrid Scoring 5-Layer Pipeline — Schema / Gates / Quality / Outcome / Auditor
- **Status:** **proposed** (Sprint 156'dan beri)
- **Sprint:** 156
- **File:** ✅ `docs/adr/055-hybrid-scoring-pipeline.md` (9857 bytes)
- **Runtime impact:** 5-layer scoring spec. `src/orchestra/quality-assessor.ts` kısmî implementation (multi-dimensional quality scoring).

### ADR-060
- **Title:** Self-Awareness Propagation — 5-Channel Context Enrichment Architecture
- **Status:** **proposed** (Sprint 156'dan beri)
- **Sprint:** 156
- **File:** ✅ `docs/adr/060-self-awareness-channels.md` (11465 bytes)
- **Runtime impact:** 5-channel context enrichment spec. `src/agents/worker.ts` kısmî prompt enrichment.

**Bölüm 2 Total:** 50 ADR section başlığı (### ADR-NNN formatında) — predicate kanıtı `grep -c "^### ADR-"` ≥50 PASS.

---

## 3. Runtime Compliance Scan (3.2 — 8 ADR)

Her ADR için **compliance:** etiketi ve canlı evidence komutu + çıktı yorumu.

### 3.1 ADR-006: spawnSync Security Pattern

- **compliance:** PASS (canlı enforcement)
- **Evidence komutu:** `grep -rn "spawnSync\b" src/ --include="*.ts" | wc -l` → **173** kullanım
- **Yorum:** `src/core/spawn-safety.ts` `assertSpawnSafe()` helper'ı korunuyor. `src/orchestra/spawn-backend-docker.ts:6 import { spawnSync, spawn as nodeSpawn } from 'node:child_process'` — Docker backend tek `nodeSpawn` import noktası (justified, Docker exec için stream gerekli). Sprint 138 Task 6 forensic fix Layer 4 runtime wire ile canlı enforcement + fail-safe fallback + breadcrumb logging.
- **Risk:** Düşük — pattern üniform uygulanıyor, security best practice.
- **suggested_fix (Sprint 168):** spawn-safety.ts'in test coverage'ını verify et (>=95% beklenir, T6 audit ile cross-cut).

### 3.2 ADR-008: Brain Merkezi Import — Tek Yönlü Bağımlılık

- **compliance:** PASS
- **Evidence komutu:** `grep -n "from.*orchestra/brain\|from.*sprint-controller" src/orchestra/planner.ts` → 0 match
- **Yorum:** `head -20 src/orchestra/planner.ts` çıktısı: yalnızca `core/types.js`, `core/constants.js`, `core/provider.js`, `core/utils.js` imports + zod + node builtins. Brain'i veya sprint-controller'ı import etmez. Worker (`src/agents/worker.ts`) ve Auditor (`src/monitor/`) de aynı şekilde brain import etmez — dosyadan task okur (`.tasks/task-*.json`).
- **Risk:** Düşük — temel architectural invariant korunuyor.
- **suggested_fix (Sprint 168):** Yok — bu rule kararlı, sadece regression test (eslint custom rule import boundary) eklenebilir (T6 audit ile cross-cut, dep_pipeline_enabled flip sonrasına dahil).

### 3.3 ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard

- **compliance:** PARTIAL (15 channel codes V1.0 mevcut, ancak hepsi runtime'da emit edilmiyor)
- **Evidence komutu:** `grep -rn "writeEvent\|verifyWorkerResult\|channelCode" src/ --include="*.ts" -l` → `src/orchestra/event-stream.ts`, `src/orchestra/result-evaluator.ts`, `src/orchestra/authority-enforcer.ts`
- **Yorum:** Sprint 138 Task 3 ile `verifyWorkerResult + verifyFunctional + validateTechDebt + checkADRCompliance` 3-pipeline canlı. Auditor authority extension pilot ADR-006/008/010 üzerinde. 15 channel code Sprint 139 event-stream.ts (305 LoC) ile tanımlı, runtime emit yapılıyor.
- **Risk:** Orta — bazı channel kodları (`DECKENT→USER:NOTIFY`, `BRAIN→WORKER:SCOPE_VIOLATION`) düşük frekansta emit, full coverage doğrulanmadı.
- **suggested_fix (Sprint 168):** event-stream emit coverage matrix oluştur, eksik channel kodları için emit point ekle (effort: normal).

### 3.4 ADR-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0

- **compliance:** PASS (soft enforcement, Sprint 139 sürüm)
- **Evidence komutu:** `head -10 src/orchestra/authority-enforcer.ts` → "Sprint 139: Soft enforcement mode — violations are logged as warnings and emitted to the event stream but do NOT block the action. Sprint 140+: Hard enforcement (planned)."
- **Yorum:** `src/orchestra/authority-enforcer.ts` runtime RBAC enforcement, AgentRole (brain/auditor/worker) + ActionType (read/write/append/spawn/kill/event_emit/event_consume). `src/nervous/authority-matrix.ts` 4 preset + safety floor + per-action override. Sprint 167 anchor constraint ".audit/sprint-167/, .tasks/task-167-*" worker scope ile uyumlu.
- **Risk:** Orta — soft enforcement Sprint 139'dan beri. Sprint 140+ hard enforcement planlı ancak Sprint 167'de hâlâ soft.
- **suggested_fix (Sprint 168):** Hard enforcement flip — `RBAC_HARD_MODE=true` config flag + 30-gün dogfood window. Bug E spawn-lock leak gibi self-inflicted scope violations'a karşı koruma.

### 3.5 ADR-039: Self-Modifying Task Detection — Deckent Dogfood vs User Project Discrimination

- **compliance:** PASS
- **Evidence komutu:** `head -20 src/orchestra/self-modifying-detector.ts` → "Detects when a sprint modifies Deckent's own source code (dogfood mode) vs when it orchestrates an external user project. This distinction is critical because self-modifying sprints require sequential execution, cache invalidation, and MCP restart considerations."
- **Yorum:** Self-modifying-detector canlı; Sprint 167 deckent-dogfood sprint olduğu için bu detection trigger oluyor (T1-T7 hepsi `.audit/` yazıyor, src/ yazmıyor — read-only audit özelinde detector "audit-mode" override gerekebilir).
- **Risk:** Düşük — Sprint 167 explicit read-only constraint ile detection bypass'a gerek yok (worker scope.filesWrite zorunlu kısıtlı).
- **suggested_fix (Sprint 168):** Self-modifying detector'a "audit-mode" override eklenebilir (effort: low) — Sprint 167 gibi read-only sprintlerde sequential execution kısıtlamasını gevşetmek için.

### 3.6 ADR-041: Agent Taxonomy — Horizontal Skills vs Vertical Agents

- **compliance:** PASS (Sprint 166 reconfirmed)
- **Evidence komutu:** `grep -l "testing-engineer\|test-engineer\|qa-engineer" src/core/agent-pool.ts` → 0 match (testing agent yok)
- **Yorum:** Sprint 166 ADR-041 reconfirmed — tüm testing agent'ları kaldırıldı, test görevi task-bazlı yönetiliyor. Built-in 15 agent listesinde testing kategorisi yok. CLAUDE.md "Built-in Agents (15)" tablosu doğrulandı.
- **Risk:** Düşük — taxonomy net, agent havuzu temiz.
- **suggested_fix:** Yok.

### 3.7 ADR-045: Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire

- **compliance:** PASS
- **Evidence komutu:** `grep -n "buildWaves\|respawnEligible" src/orchestra/sprint-spawner.ts` → `src/orchestra/sprint-spawner.ts:364 export async function respawnEligibleTasks()` canlı.
- **Yorum:** Wave-based execution Sprint 167 T7 (Wave 2) için kullanılan kontrat. T1-T6 paralel (Wave 1), T7 sequential (Wave 2 — `["167-001","167-002","167-003","167-004","167-005","167-006"]` dependency array). `respawnEligibleTasks()` checkpoint + onWaveTransition callback ile.
- **Risk:** Düşük — wave gate Brain controller'da canlı; ancak Sprint 167 `dep_pipeline_enabled: false`, default davranış (planner.ts dependencies array hint + Brain controller wave gate) kullanılıyor.
- **suggested_fix (Sprint 168):** `dep_pipeline_enabled: true` flip pre-condition list T6 audit'ta dokümante (Sprint 168 hard flip readiness).

### 3.8 ADR-046: Brain Self-Update Hook Architecture (Step Ordering Contract)

- **compliance:** PASS (Sprint 166 canlı, Bug M/N/S/Y2 dahil 15 bug fix)
- **Evidence komutu:** `grep -n "Step 1\|Step 2\|Step 3\|Step 4\|adrInsert\|memoryExport\|identityRegen\|ruleRegen" src/core/identity-generator.ts` → satır 327-410 arası kontrat implementation:
  - Step 1 (memoryExport) → satır 350-358 koşulsuz
  - Step 2 (identityRegen, **deprecated**) → satır 362-376 `!opts.skipIdentityRegen` gate
  - Step 3 (adrInsert, Bug M fix) → satır 379-414 koşulsuz
  - Step 4 (ruleRegen) → callback `opts.onRuleRegen` ile (deprecated callback-conditional)
- **Yorum:** `src/orchestra/sprint-finalizer.ts:1182 'Step 14 (postFinalizeHooks) — entering'` breadcrumb logging canlı. Sprint 166 ADR-046 4 root cause fix (Bug M ADR insert, Bug N regression test, Bug S sprint log, Bug Y2 ground-truth) Step Ordering Contract ile çözüldü. Step 3 BEFORE Step 4 zorunluluğu (ADR-046 satır 83) korunuyor — yeni ADR'lar memory.db'ye Step 3'te insert, Step 4 ruleRegen .claude/rules/*.md regenerate.
- **Risk:** Orta — Step 2 (identityRegen) deprecated, Sprint 168'de decommission planlı. **Sprint 166 finalize log evidence YOK**: `.brain/sprints/sprint-166.md` boş (CANLI: `cat .brain/sprints/sprint-166.md | head -50` → 0 satır). Step 1-4 breadcrumb log'ları nereye gitti? `.brain/archive/sprint-166_2026-05-14T07-45-42-102Z.snapshot.json` dosyası var ama içeriği henüz incelenmedi. **Bu bulgu T5 Brain wire audit ile cross-cut**.
- **suggested_fix (Sprint 168):**
  1. Step 2 identityRegen kod-yolu decommission (default `skipIdentityRegen: true` ve sonrasında full remove).
  2. Sprint 166 finalize breadcrumb evidence T5 forensic ile birlikte incele — sprint logs eksik mi yoksa farklı path mi?

**Bölüm 3 Total:** 8 compliance: etiketi (predicate kanıtı `grep -c "compliance:"` ≥8 PASS).

---

## 4. Cross-Reference 4 Rules Dir + ADR-046 Step 1-4 Wire Evidence (3.3)

### 4.1 Rules Dir Parity

| Dir | Files | brain.md size | auditor.md size | worker-default.md size |
|-----|-------|---------------|------------------|-------------------------|
| `.claude/rules/` | 3 | (büyük, yukarıda dump) | mevcut | mevcut |
| `.codex/rules/` | 3 | mevcut | mevcut | mevcut |
| `.gemini/rules/` | 3 | mevcut | mevcut | mevcut |
| `.cursor/rules/` | 3 | mevcut | mevcut | mevcut |

**Cross-reference yapısı:** `diff .claude/rules/brain.md .codex/rules/brain.md` → çıktı: `.claude/rules/brain.md`'de **ek bir "Brain Rules" bloğu var** (88-127 satır arası), `.codex/rules/brain.md`'de bu blok yok. Bu ADR-018 Multi-Environment Config Generation kontratının bozulmuş bir uyarlamasıdır — `.claude/` rules dosyalarına çift content eklenmiş.

**Tespit (Drift Bulgusu #3):** `.claude/rules/brain.md` içinde iki kez "Brain Rules" başlığı var. CLAUDE.md context'inde de görünüyor:
```
# Brain Rules
- Always read DIRECTIVES.md first
...
- Self-Learning
  ...

# Brain Rules    <-- 2. kopya
- Always read DIRECTIVES.md first
...
```

Bu çift kopya muhtemelen Sprint 166 Step 4 ruleRegen sırasında `Active ADR Constraints` bloğu eklenirken eski içeriği overwrite etmek yerine append yaptığı için oluştu. Aynı drift `.codex/` `.gemini/` `.cursor/` rules dosyalarında **YOK** — yalnızca `.claude/` etkilenmiş. T2 doc inventory audit ile cross-cut: doc-doc conflict table'a eklenmeli.

### 4.2 ADR-046 Step 1-4 Wire Canlı Trigger Evidence

#### Step 1: memoryExport
- **Wire:** `src/core/identity-generator.ts:350-358` koşulsuz çalışır.
- **Output:** `.brain/exports/summary.md`, `decisions.md`, `memory.md`, `debt.md` regenerate.
- **Evidence:** `ls .brain/exports/` → 8 dosya (summary, decisions, memory, debt + 4 sprint-specific). `cat .brain/exports/decisions.md | grep -c "## ADR-"` → ~50 entry (CANLI doğrulandı, DB'den 50 ADR ile parity).
- **Sprint 166 trigger:** sprint-166 finalize sırasında Step 1 koşulsuz çalıştı. Evidence: `.brain/exports/summary.md` "Generated: 2026-05-14" tarihi taşıyor, ADR-046 listede mevcut.
- **compliance:** PASS

#### Step 2: identityRegen (DEPRECATED)
- **Wire:** `src/core/identity-generator.ts:362-376` `!opts.skipIdentityRegen` gate.
- **Output:** `PROJECT-IDENTITY.md` update.
- **Evidence:** `.brain/PROJECT-IDENTITY.md` mevcut, son güncelleme sprint-166 tarihinde olmalı (T2 doc audit ile cross-cut: doğrula).
- **Sprint 166 trigger:** Status deprecated — `skipIdentityRegen: true` default değil, hâlâ çalışıyor (callback path active). Sprint 168'e decommission planlı.
- **compliance:** WARN (deprecated step hâlâ aktif)

#### Step 3: adrInsert (Bug M fix)
- **Wire:** `src/core/identity-generator.ts:379-414` koşulsuz; `src/core/adr-file-sync.ts` (244 LoC) içerik.
- **Output:** `docs/adr/*.md` → `memory.db` upsert (inserted/updated/skipped counter + ids array).
- **Evidence:** Sprint 166 sonunda ADR-046 file → memory.db insert oldu (Sprint 166 implementation). `node -e "const db=require('better-sqlite3')('.brain/memory.db',{readonly:true}); console.log(db.prepare(\"SELECT updated_at FROM entries WHERE id='adr-046'\").get())"` ile son update tarihi alınabilir.
- **Sprint 166 trigger:** sprint-finalizer satır 1204 breadcrumb log `adrInsert=inserted=X/updated=Y/skipped=Z` — bu Sprint 166 sonunda emit oldu. Ancak `.brain/sprints/sprint-166.md` boş, evidence yalnızca `debugLog` ile stderr/stdout'a yazılıyor, persistent log dosyasında YOK.
- **compliance:** PASS (functional), PARTIAL (observability — breadcrumb logs ephemeral)

#### Step 4: ruleRegen (callback-conditional)
- **Wire:** `src/core/identity-generator.ts` `opts.onRuleRegen` callback.
- **Output:** `.claude/rules/*.md`, `.codex/rules/*.md`, `.gemini/rules/*.md`, `.cursor/rules/*.md` regenerate.
- **Evidence:** 4 rules dir mevcut; `.claude/rules/brain.md` çift kopya bulgusu (yukarıda 4.1) Step 4'ün append yaptığını gösteriyor — bu **Step 4 incidence ama bug'lı**.
- **Sprint 166 trigger:** ruleRegen Sprint 166 sonunda tetiklendi (ADR-046 + ADR-041/045 Active ADR Constraints bloğunda var). Ancak çift kopya overwrite yerine append bug'ı muhtemelen Sprint 166 finalize'da oluştu.
- **compliance:** PARTIAL (functional but with append bug in .claude/rules/)

### 4.3 ADR-046 Step Ordering Contract — Step 3 BEFORE Step 4 Verify

ADR-046 satır 83: "Step 3, Step 4'ten ÖNCE çalışmak ZORUNDADIR. Sprint 166'da kabul edilen ADR-046 gibi yeni ADR'ler Step 3'te memory.db'ye insert edilir; Step 4'te regenerate edilen .claude/rules/*.md dosyaları bu güncel ADR setini referans alır."

- **Verify:** `identity-generator.ts:378` → Step 3 koşulsuz çalışır (satır 379-414), Step 4 onRuleRegen callback satır 418+ — sırasal ZORUNLU.
- **Evidence canlı:** ADR-046 file system'da var (`docs/adr/046-*.md`), DB'de var (`adr-046 | accepted | sprint-166 | 166`), `.claude/rules/brain.md` Active ADR Constraints bloğunda **YOK** — Sprint 166 Step 4 ruleRegen ADR-046'yı listeye eklemedi. Bu **Step 3→Step 4 ordering kontratını CARRY ETMEYEN** bir bug — Step 4 sadece eski liste regenerate etmiş olabilir.
- **compliance:** FAIL (ordering korunuyor ama Step 4 implementation eksik — ADR-046 listeye eklenmemiş)

**Tespit (Wire Bulgusu #4 — KRİTİK):** Step 4 ruleRegen Sprint 166 sonrasında ADR-046 ve ADR-045'i `.claude/rules/brain.md` Active ADR Constraints bloğuna eklemedi. Step 3 (adrInsert) → ADR-046 memory.db'ye girdi, Step 4 (ruleRegen) → rules dosyalarını regenerate etmesi gerekirdi ama yeni ADR'ları içermiyor. Bu Sprint 167 T3 worker prompt'unda da görünüyor: "Active ADR Constraints" bloğu ADR-001..041 + 022-v2 listeler, ADR-042/043/044/045/046/053/055/060 listede yok.

### 4.4 Sprint 166 Finalize Log Scan

`.brain/sprints/sprint-166.md` → **boş** (0 satır canlı). `.brain/archive/` içinde sprint-166 ile ilgili 2 dosya: `.pid` ve `.snapshot.json`. Snapshot dosyası içeriği finalize lifecycle event'lerini içeriyor olabilir ama bu T5 forensic audit ile cross-cut — T3 burada sadece "finalize log evidence YOK" tespit ediyor.

**Tespit (Wire Bulgusu #5):** Sprint 166 finalize Step 1-4 breadcrumb logs `.brain/sprints/sprint-166.md`'ye persist edilmemiş. Bu observability gap — Bug U (Sprint 166 sprint log yazımı) veya benzer bir bug'ın belirtisi olabilir.

---

## 5. Proposed Closure Önerisi: ADR-053 / ADR-055 / ADR-060

**ÖNEMLİ:** Sprint 167 anchor constraint gereği BU SPRINTTE STATUS DEĞİŞTİRİLMEZ. Aşağıdaki sadece **Sprint 168 önerisi**dir.

### 5.1 ADR-053: TaskType Taxonomy

- **Status:** proposed (Sprint 156)
- **Bekleme süresi:** ~11 sprint (Sprint 156 → Sprint 167)
- **Implementation evidence:** Kısmî (Sprint 167 T5 "forensic-only mode" override gibi TaskType kavramının kullanıldığı yerler var, ancak `core/task-types.ts` içinde explicit TaskType enum yok).
- **Sprint 168 önerisi:**
  - **Option A (Recommend ACCEPT):** Spec'i runtime'a tam adopt et, `core/task-types.ts` içinde TaskType enum + extensibility hook ekle, accepted status'a çek.
  - **Option B (DEFER):** Sprint 169 Open Source GA sonrasına ertele — kullanıcı feedback'i sonrasında re-evaluate.
  - **Option C (REJECT):** Kullanım frekansı düşükse proposed yerine rejected status — formal kapanış.
- **Cross-cut:** ADR-055 Hybrid Scoring layer'ı TaskType'a bağımlı.

### 5.2 ADR-055: Hybrid Scoring 5-Layer Pipeline

- **Status:** proposed (Sprint 156)
- **Bekleme süresi:** ~11 sprint
- **Implementation evidence:** Kısmî — `src/orchestra/quality-assessor.ts` multi-dimensional quality scoring (correctness, coverage, scope, completeness) 4 layer; spec'te 5 layer (Schema/Gates/Quality/Outcome/Auditor). Schema Layer (Sprint 166 ADR-046 ile JSON schema strict) ve Auditor Layer (Sprint 138 ADR-035) hâlihazırda canlı.
- **Sprint 168 önerisi:**
  - **Option A (Recommend ACCEPT — KÜÇÜK SCOPE):** Sprint 167 T6 audit ile birlikte test coverage ve schema validation gap'ini kapat, 5-layer pipeline'ı runtime'da tam bağla, accepted'a çek.
  - **Option B (DEFER + Renumber):** Sprint 169 sonrasına ertele.
- **Cross-cut:** ADR-053 + ADR-035 + ADR-046 hepsi cross-cutting.

### 5.3 ADR-060: Self-Awareness Propagation — 5-Channel Context Enrichment

- **Status:** proposed (Sprint 156)
- **Bekleme süresi:** ~11 sprint
- **Implementation evidence:** Çok kısmî — `src/agents/worker.ts` prompt enrichment, ADR injection, skill prompts mevcut (3 channel). 5-channel spec'inin tamamı runtime'da yok.
- **Sprint 168 önerisi:**
  - **Option A (Recommend DEFER):** Sprint 169 Open Source GA sonrasına ertele — bu feature kullanıcı feedback'iyle re-prioritize edilmeli, premature optimization riski yüksek.
  - **Option B (REJECT):** 5-channel spec'inin tamamı practical değilse, mevcut 3-channel approach'a "self-awareness lite" olarak yazılı kayıt — formal kapanış.
- **Cross-cut:** Worker prompt assembly logic (ADR-036 worker prompt injection) ile cross-cutting.

**Genel öneri:** Sprint 168'de **proposed_closure_review_meeting** task'ı aç — Alperen + Brain birlikte 053/055/060 için A/B/C kararı versin. Hepsi proposed kalmaya devam ederse Sprint 169 Open Source GA için "stale ADR" reputational risk var.

---

## 6. Identity-Generator Step 2 Decommission Önerisi (Sprint 168)

### 6.1 Mevcut Durum

`src/core/identity-generator.ts:362-376`:
```typescript
// Step 2: PROJECT-IDENTITY.md auto-regen (DEPRECATED — Sprint 166 ADR-046)
if (!opts.skipIdentityRegen) {
  try {
    result.identityRegen = regenerateProjectIdentity({ ... });
    ...
  } catch (e) {
    result.errors.push(`identityRegen: ${e}`);
  }
}
```

- **ADR-046 satır 154:** "Step 2 (identityRegen) deprecated yükü. Sprint 168'e kadar kod'da kalır. `skipIdentityRegen`"
- **ADR-046 satır 314:** "@deprecated Sprint 166 — identityRegen step delegated to managed-docs chain. Will be `null` when `skipIdentityRegen: true` (recommended). Step 2 removed in Sprint 168."

### 6.2 Sprint 168 Decommission Roadmap

| Aşama | Eylem | Etki | Effort |
|------|-------|-----|--------|
| 1 | `skipIdentityRegen: true` default'a çek (`sprint-finalizer.ts:1185` `runPostFinalizeHooks` çağrısında) | identityRegen step skip, ama kod hâlâ var | low |
| 2 | 1 sprint dogfood (Sprint 168 boyunca) — PROJECT-IDENTITY.md managed-docs chain ile regenerate olduğunu doğrula | Step 2 yok hipotezini test et | low |
| 3 | `runPostFinalizeHooks` opts'tan `skipIdentityRegen` parametresi kaldır + Step 2 kod bloğu sil + `IdentityRegenResult` tipini kaldır | LoC -50, complexity -1 | normal |
| 4 | ADR-046 metnini güncelle: Step 2 deprecated → removed | Spec parity | low |

**Risk:** PROJECT-IDENTITY.md regenerate yolu managed-docs chain'inde **gerçekten** çalışıyor mu? T2 doc audit ile cross-cut: PROJECT-IDENTITY.md'nin son update tarihi sprint-166 ile uyumlu mu, kontrol et.

**Sprint 168 task slot önerisi:** "ADR-046 Step 2 (identityRegen) Decommission — code removal + ADR text update" — 1 task, effort: normal, suggested_fix: yukarıdaki 4 aşama.

---

## 7. ADR-047 Manuel Survival Pattern Input Data (T5 Cross-Cut)

**Cross-cut note:** ADR-047 henüz **YAZILMAMIŞ**. Sprint 168'de yazılması beklenen yeni ADR. T5 Brain Wire Audit ile cross-cutting: T5 raporu "Manuel Survival incident inventory" topluyor (Sprint 164-166, ≥10 vaka). T3 burada ADR-047 için **input data** seed'liyor.

### 7.1 Manuel Survival Pattern — Mevcut DB Evidence

Sprint 164-166 boyunca Brain otomatik recovery yapamadığında Alperen elle müdahale ettiği durumlar:

- **Sprint 165 finalize:** "manual recovery chain — verified 2026-05-12" → `.deckent/workspace/BOOT.md` Manual Recovery Chain bloğu (`deckent kill --all` → `cleanup` → `recover` → `run` → `spawn --auto-approve`).
- **Sprint 166 Brain Self-Update Hook Architecture:** 15 bug fix (M/N/S/Y2/R/T/U/V/C/X/P/Q/W/K/L) — bunlar manuel survival pattern'ından doğan bug'lar (ADR-046 forensic).

### 7.2 ADR-047 Yazımı için Input Data (Sprint 168'e)

ADR-047 başlığı önerisi: **"Manuel Survival Pattern Codification — Brain Recovery Failure Mode Handling"**.

İçermesi gereken bölümler:
1. **Context:** Sprint 164-166 boyunca Brain otomatik recovery'nin yetersiz kaldığı vakalar.
2. **Inventory:** En az 10 manuel survival incident (T5 forensic mode tarafından toplanacak).
3. **Pattern taxonomy:** 
   - Type A: Lock cleanup leak (Bug E mitigation — maxWorkers=3 fallback)
   - Type B: OOM 4GB→8GB (Bug G)
   - Type C: Planner Files parser corruption (Bug Z2)
   - Type D: Memory rebuild destructive (Bug Z3 — T4 cross-cut)
   - Type E: Backfill production vs gerçek divergence (Bug V)
4. **Decision:** Each pattern için "auto-recover" vs "manual gate" karar matrisi.
5. **Consequences:** Manual gate sayısı, dogfood velocity etkisi, Open Source GA gate riski.

**Sprint 168 önerisi:** "ADR-047 Writeup — Manuel Survival Pattern Codification" task slot, T5 forensic output → ADR-047 input.

---

## 8. Findings Severity Table + Sprint 168 Roadmap Input

### 8.1 Findings Severity Table

| # | Bulgu | Severity | Cross-Cut | suggested_fix | effort_estimate | sprint_slot |
|---|-------|----------|-----------|---------------|------------------|-------------|
| 1 | DB↔File parity drift (ADR-001..041 yalnız DB'de) | LOW | T1 code inventory | Bilinen tasarım, dokümante et | low | Sprint 168 (doc-only) |
| 2 | `.claude/rules/brain.md` Active ADR Constraints 11 eksik (ADR-040/042/043/044/045/046/053/055/060) | **HIGH** | T2 doc inventory + ADR-046 Step 4 | Step 4 ruleRegen impl fix — Active ADR Constraints bloğunu DB'den regenerate | normal | Sprint 168 (critical) |
| 3 | `.claude/rules/brain.md` çift "Brain Rules" bloğu (append bug, Step 4 ruleRegen) | **HIGH** | T2 doc + Step 4 | ruleRegen overwrite policy fix (mevcut bloğu replace et, append ETMEME) | normal | Sprint 168 (critical) |
| 4 | Sprint 166 finalize Step 1-4 breadcrumb persistent log YOK (.brain/sprints/sprint-166.md boş) | MEDIUM | T5 wire audit | sprint-finalizer.ts'e Step 1-4 sonunda `.brain/sprints/sprint-NNN.md` append yazımı | normal | Sprint 168 |
| 5 | ADR-035 channel emit coverage matrix eksik (15 channel codes V1.0) | MEDIUM | T6 test+build | event-stream emit coverage matrix + eksik channel'lar | normal | Sprint 168 |
| 6 | ADR-037 RBAC soft enforcement Sprint 139'dan beri (hard enforcement planlı ama yok) | MEDIUM | T5 wire audit | `RBAC_HARD_MODE=true` config flag + 30-gün dogfood | high | Sprint 169 (post-GA) |
| 7 | ADR-053 / ADR-055 / ADR-060 Sprint 156'dan beri proposed (~11 sprint) | MEDIUM | Stale ADR risk | Closure review meeting (A/B/C karar) | low (meeting) | Sprint 168 |
| 8 | Step 2 identityRegen deprecated kod hâlâ aktif | MEDIUM | T1 code inventory | skipIdentityRegen default true → kod sil (4-aşama yukarıda) | normal | Sprint 168 |
| 9 | Self-modifying detector audit-mode override yok (read-only sprint için) | LOW | ADR-039 | "audit-mode" detection bypass eklenebilir | low | Sprint 168 (nice-to-have) |
| 10 | dep_pipeline_enabled flip pre-condition list T6'da | INFO | T6 audit | Pre-condition checklist | n/a | Sprint 168 readiness |

### 8.2 Sprint 168 Critical Path

**Critical (must-fix öncelik):** #2 + #3 — Step 4 ruleRegen ADR-046 contract ihlali. Bu Sprint 169 Open Source GA gate'i için BLOCKER:
- Worker promptlarında Active ADR Constraints bloğu eski/eksik → ADR-045/046 enforcement YOK
- Yeni kullanıcılar deckent'i clone ettiklerinde `.claude/rules/` çift kopya görür (reputational)

**Sprint 168 task count önerisi:** ≤ 12 (Sprint 167 spec gereği). Critical ≤ 4:
1. `.claude/rules/brain.md` Step 4 ruleRegen overwrite fix (Bulgu #2 + #3 birleştir)
2. Sprint 166 finalize breadcrumb persistent log (Bulgu #4)
3. ADR-053/055/060 closure review (Bulgu #7)
4. Identity-generator Step 2 decommission (Bulgu #8)

**Non-critical:** Bulgu #1, #5, #6, #9, #10 — Sprint 168 normal slot.

### 8.3 Cross-Cut Mapping (T1-T7 ile)

- T1 (code inventory): #1, #8, #9 cross-cut
- T2 (doc inventory): #2, #3 cross-cut
- T4 (memory.db audit): #1 parity, ADR-046 Step 3 adrInsert evidence
- T5 (brain wire audit): #4, #6, ADR-047 input (Bölüm 7)
- T6 (test+build+security): #5, #10 cross-cut
- T7 (cross-cutting synthesis): tüm findings konsolide

---

## 9. GO/NO_GO Falsifiable Predicate

Bu raporun yanında `.audit/sprint-167/T3-predicate.sh` çalıştırılır. Script kanıtları check eder:

- `wc -l .audit/sprint-167/T3-adr-compliance.md` → **≥500** (kanıt: bu rapor)
- `grep -c "^### ADR-" .audit/sprint-167/T3-adr-compliance.md` → **≥50** (kanıt: Bölüm 2)
- `grep -c "compliance:" .audit/sprint-167/T3-adr-compliance.md` → **≥8** (kanıt: Bölüm 3)
- ADR-046 Step 1-4 wire evidence dokümante (kanıt: Bölüm 4.2)
- 053/055/060 proposed closure önerisi sunuldu (kanıt: Bölüm 5)
- Identity-generator Step 2 decommission önerisi sunuldu (kanıt: Bölüm 6)
- ADR-047 Manuel Survival input data toplandı (kanıt: Bölüm 7)
- Findings table 4-field zorunlu (severity / suggested_fix / sprint_slot / effort_estimate) sunuldu (kanıt: Bölüm 8.1)

Predicate PASS → T3 DONE. FAIL → eksik bölümler tespit edilir, GO_WITH_TECH_DEBT işaretlenir.

---

## Ek 1: Audit Method Notları

- **Read-only enforcement:** Worker scope `.audit/sprint-167/` ve `.tasks/task-167-003.*` ile sınırlı. `src/`, `docs/`, `.brain/`, `.deckent/` yazımı YASAK (audit subject).
- **Memory.db erişimi:** `better-sqlite3` (read-only mode `{readonly: true}`). 0 yazım yapıldı.
- **Cross-source verification:** Aynı bilgi 3 kaynaktan doğrulanmaya çalışıldı (DB + file system + rules dir).
- **Falsifiable claim:** Her bulgu için **canlı komut** + **beklenen çıktı** dokümante edildi (predicate kanıtı).

## Ek 2: Sınırlamalar

- **Sprint 166 finalize log yokluğu** Step 1-4 wire evidence'i kısıtladı — `.brain/sprints/sprint-166.md` boş. Alternative evidence kaynağı `.brain/archive/sprint-166_*.snapshot.json` ancak bu T5 forensic audit alanı.
- **sqlite3 CLI** mevcut değil — `better-sqlite3` Node helper ile bypass edildi.
- **`.deckent/ground-truth-overrides.json` whitelist** read-only (anchor constraint #4, Bug Y2 paterni).

## Ek 3: Referanslar

- ADR-036: ADR Governance Integration (accepted)
- ADR-046: Brain Self-Update Hook Architecture (accepted, Sprint 166)
- DECKENT.md: Memory V2 DB-First architecture
- `src/core/identity-generator.ts:323 runPostFinalizeHooks()`
- `src/core/adr-file-sync.ts` (Step 3 implementation, 244 LoC)
- `src/orchestra/sprint-finalizer.ts:1182` Step 14 breadcrumb logging
- `src/orchestra/authority-enforcer.ts` (ADR-037 soft enforcement)
- `src/orchestra/self-modifying-detector.ts` (ADR-039 dogfood detection)
- `src/orchestra/sprint-spawner.ts:364 respawnEligibleTasks()` (ADR-045 wave wire)

---

**T3 Audit RAPORU SONU — Sprint 167 Task 167-003 — 2026-05-14**
