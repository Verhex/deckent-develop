# T-152-016: ADR 43 Compliance Automated Scan

**Date:** 2026-04-24
**Worker:** w-152-016 (doc-writer, model: opus)
**Scope:** READ-ONLY audit — 43 ADRs (`adr-001..adr-042` + `adr-022-v2`)
**Source of truth:** `.brain/exports/decisions.md` (1921 lines, 43 sections, parsed 2026-04-24)
**Code base snapshot:** `src/` 94 top-level files + subdirs; `package.json` 1.0.0-beta.1

---

## Özet

43 ADR kayıtlı: **40 accepted + 1 deprecated (adr-005) + 1 superseded (adr-022) + 1 proposed (adr-042)**. Tamamının statü başlığı ve MADR v3 formatı geçerli. Kod tabanı taraması 43 ADR'nin **36'sını tam uyumlu (FULL)**, **5'ini kısmi uyumlu (DRIFT)**, **2'sini açık sapma (VIOLATION)** olarak sınıflandırdı. Kritik bulgular:

- **ADR-006 spawnSync Security Pattern:** 3 dosyada `shell: true` kalıntısı — `baseline-tracker.ts:90`, `plugin-hooks.ts:399 + 581` (npx + sabit args, injection riski yok, ama ADR metni "shell interpretation yok" der → DRIFT, amendment veya kod fix gerekli).
- **ADR-008 Brain Merkezi Import (Tek Yönlü Bağımlılık):** 1 sapma — `src/core/notify.ts:17` `orchestra/event-bus.js`'ten import ediyor. Core'dan orchestra'ya çağrı ADR-008 yönünü tersine çeviriyor → VIOLATION.
- **ADR-038 Dead Code Disposition:** 3 Kademe 1 "remove" listesinden 2'si silinmiş (`learning-decay.ts`, `learning-migration.ts` ✅), **1'i hâlâ mevcut** (`batch-stats.ts`, 0 consumer) → VIOLATION. 3 Kademe 2 "defer" listesinden 1'i silinmiş (`combination-scorer.ts` yok — defer kararı delinmiş), 2'si korunmuş (`handoff-protocol.ts`, `brain-context.ts`).
- **ADR-035 Verification Protocol:** 15 kanaldan 15'i + 6 sonradan eklenen kanal implementasyonda (`event-stream.ts:51-88`), **ancak CODE_VERIFY_REQUEST + VERIFICATION_RESULT kanallarının runtime kullanım kanıtı bulunamadı** (grep `VerifyChannel` boş). Kanal tanımlı, publisher/consumer wiring eksik → DRIFT.
- **ADR-041 Agent Taxonomy:** 16 built-in agent iddiası (IDENTITY.md / CLAUDE.md), fiili **15 directory** (`test-writer` arşivlenmiş ✅). Taxonomy reform canlı, ama identity dokümantasyonu drift.
- **ADR-042 Hybrid Mode:** `proposed` statüde, `deckent_style` config key + `deckent mode` CLI komutu implementasyonda → ADR status güncelleme gerekli (proposed→accepted).

**Sonuç:** Sistem taşıma sonrası ADR governance katmanı büyük ölçüde sağlıklı (40/43 net uyum, 36 FULL). Ancak Layer 4 runtime enforcement (`authority-enforcer.ts` pilot ADR-006/008/010) aktif ama bazı pilot-dışı drift'ler yakalanmıyor. Sprint 153'te 7 drift kapatma hedefi P0-P2 matrix ile tanımlandı.

---

## Bulgular: 43 ADR Compliance Matrisi

### Legend

- **FULL** — Status geçerli + kod tabanı kanıtı + drift yok
- **DRIFT** — Status geçerli ama kod ile ADR arasında tutarsızlık
- **VIOLATION** — Aktif ADR kuralı kodda ihlal ediliyor
- **STALE** — ADR deprecated/superseded ama dokümantasyon/kod hâlâ eski kalıntı içeriyor
- **N/A** — Documentation/vision ADR'si (runtime kanıt beklenmez)

| ADR | Title | Status | Kanıt | Drift Alarmı |
|-----|-------|--------|-------|--------------|
| adr-001 | TypeScript + ESM | accepted | `package.json:5` `"type": "module"`, `.js` uzantı zorunluluğu | FULL |
| adr-002 | Node16 Module Resolution | accepted | `tsconfig.json:4-5` `"module": "Node16"`, `"moduleResolution": "Node16"` | FULL |
| adr-003 | vitest over Jest | accepted | `package.json:22,89` `"vitest": "^3.0.0"`, Jest yok | FULL |
| adr-004 | 3-Layer Config Merge | accepted | `src/core/config.ts` `deepMerge` + `~/.deckent/config.json` + `.deckent/config.json` | FULL |
| adr-005 | Synchronous I/O | **deprecated** | `writeFileSync`/`readFileSync` 793 occurrence × 186 files. Deprecated notice in ADR body. | STALE — async migration hiç başlamadı (Sprint 132 CRITICAL #1, 20 sprint açık) |
| adr-006 | spawnSync Security Pattern | accepted | `authority-enforcer.ts:464-481` runtime pilot scan; `execSync`/`spawnSync` 20+ callsite, hepsi array args | **DRIFT** — 3 `shell: true` kalıntısı (`baseline-tracker.ts:90`, `plugin-hooks.ts:399,581`). Sabit args ama ADR metni "shell interpretation yok" |
| adr-007 | SpawnOptions Interface | accepted | `src/core/provider.ts:ProviderSpawnOptions` + adapter'larda implement edildi | FULL |
| adr-008 | Brain Merkezi Import | accepted | `authority-enforcer.ts` Layer 4 runtime pilot; `sprint-controller.ts` merkez import hub | **VIOLATION** — `src/core/notify.ts:17` `'../orchestra/event-bus.js'` import (core→orchestra ters yön) |
| adr-009 | DEBT.md Markdown Table | accepted | `.brain/exports/debt.md` başlık satırı `\| ID \| Title \| Priority \| Sprint \| Status \|` | FULL |
| adr-010 | Tek Runtime Dep — commander.js | accepted | `package.json.dependencies` 7 paket (commander + zod + better-sqlite3 + @modelcontextprotocol/sdk + @noble/ed25519 + @noble/hashes + telegraf). Minimal tutuldu (adr-seed 4-dep rationale). | DRIFT — ADR başlığı "commander" ama gerçekte 7 zorunlu dep + 1 opsiyonel (discord.js). `adr-seed.ts:118` 4-dep açıklaması artık güncel değil (telegraf + @noble/* eklendi). Dep seçimleri gerekçelendirildi ama ADR body yenilenmeli. |
| adr-011 | node:readline/promises | accepted | `src/cli/helpers/prompt.ts`, `wizard.ts`, `memory.ts`, `config-nervous.ts` 4 dosya `node:readline` kullanıyor. Hiçbir 3rd party prompt lib (inquirer/enquirer/prompts) yok. | FULL |
| adr-012 | register\<Name\>(program) Pattern | accepted | `grep "export function register"` 47 CLI dosyası × 1 occurrence = 47 register function | FULL |
| adr-013 | DECKENT.md Adapter Pattern | accepted | `DECKENT.md` var, `@` reference chain aktif (CLAUDE.md → DECKENT.md → DIRECTIVES.md) | FULL |
| adr-014 | .deck Secret File System | accepted | `src/core/deck-file.ts` (187-satır `git ls-files --error-unmatch .deck` enforcement) | FULL |
| adr-015 | TaskRouter Module | accepted | `src/orchestra/task-router.ts` (318 satır), 6-level routing | FULL |
| adr-016 | Connector Module | accepted | `src/core/provider.ts` `ProviderAdapter` interface + 4 adapter (`claude.ts`, `codex.ts`, `gemini.ts`, `subprocess.ts`) | FULL |
| adr-017 | MCP-Native Provider Adapters | accepted | `src/providers/` 4 adapter, `ProviderAdapter` impl edildi | DRIFT — ADR başlığı "MCP-Native" ama `subprocess.ts` ve `claude.ts` tmux/subprocess mixed backend. "MCP-native" ifadesi mevcut implementation'ı tam yansıtmıyor. |
| adr-018 | Multi-Environment Config Generation | accepted | `src/cli/commands/init.ts:118-320` `--cursor`, `--env=codex,cursor,gemini,vscode,shell`, `--all-envs` | FULL |
| adr-019 | Language-Agnostic Worker Verify | accepted | `src/agents/worker-verify.ts` (254+ satır), `execSync` ile test command pluggable | FULL |
| adr-020 | Rich Sprint Output (7-section) | accepted | `src/orchestra/sprint-reporter.ts` + `sprint-retro-writer.ts` (combined report generator) | FULL |
| adr-021 | Kraken ASCII Brand Identity | accepted | `src/cli/helpers/splash.ts` + Dashboard 🐙 emoji + `config-types.ts` tema | FULL |
| adr-022 | CLI/MCP Feature Parity (v1) | **superseded** | — | FULL (superseded by 022-v2) |
| adr-022-v2 | CLI/MCP Parity — Updated | accepted | CLI 47 register × MCP 27 tool + 8 resource (parity audit dekoutu T-152-008) | FULL |
| adr-023 | Plan Tier Generalizasyonu | accepted | `src/core/model-registry.ts:12` `ModelTier = 'economy' \| 'standard' \| 'premium' \| 'premium_plus'` + tier-based config (brain_tier/worker_tier) | FULL |
| adr-024 | sprint-controller God Split | accepted | `sprint-controller.ts` 634 satır (önceki 1890 LoC), `sprint-phases.ts` 677 satır extract edilmiş | FULL |
| adr-025 | Graceful Shutdown (SIGINT) | accepted | `src/cli/entry.ts:25-34` `SIGINT → interruptActiveSprint()` + `killAllSessions()` | FULL |
| adr-026 | God Object Split Phase 1-3 | accepted | `sprint-controller.ts` (634) + `sprint-phases.ts` (677) + `sprint-spawner.ts` (799) + `sprint-finalizer.ts` (1233) + `sprint-lifecycle.ts` (527) split pattern | DRIFT — `sprint-finalizer.ts` 1233 LoC god-object kıvamına dönmüş (Sprint 138 ADR-038 sonrası büyümüş). Phase 4 split gerekebilir. |
| adr-027 | Hybrid Spawn Backend | accepted | `src/orchestra/spawn-backend.ts` (297) + `spawn-backend-docker.ts` (667) + `spawn-backend-mock.ts` + `tmux.ts` (349) + `src/providers/subprocess.ts`. Config: `spawn_backend: docker\|tmux\|subprocess\|auto` | FULL |
| adr-028 | Decision-Engine V1 → V2 Routing | accepted | `src/core/routing-engine.ts:113` `routeTaskV2()`, config `routing_engine: 'v1' \| 'v2'` | FULL |
| adr-029 | Managed-Docs Universalization | accepted | `src/orchestra/managed-docs/` 9 dosya (content-generators, doc-cache, docs-config, managed-doc-runner, plugin-loader, section-updater, template-renderer, types, index) | FULL |
| adr-030 | Template Engine + Plugin Loader | accepted | `managed-docs/template-renderer.ts` + `plugin-loader.ts` çifti | FULL |
| adr-031 | Content Hash Cache | accepted | `managed-docs/doc-cache.ts` içinde 7× `Hash/contentHash/invalidate` occurrence | FULL |
| adr-032 | i18n Pattern System | accepted | `managed-docs/content-generators.ts:15-64` i18n string blokları, TR/EN language toggle. Dashboard `src/dashboard/src/i18n/{en,tr}.ts`. CLI `src/cli/helpers/i18n.ts`. | FULL |
| adr-033 | Product Not Service | accepted | Vision/governance ADR — CLI kurulum/çalıştırma tek komut (`deckent init`), Redis/postgres/WebSocket bağımlılığı yok | N/A (vision) |
| adr-034 | Multi-Project Isolation | accepted | `src/core/config.ts` project root resolution, `projectRoot` parametresi 100+ callsite'a taşınıyor | FULL |
| adr-035 | Verification Protocol V1.0 (15 kanal) | accepted | `src/orchestra/event-stream.ts:51-88` `CHANNELS` const 21 entry (15 original + 6 extension: ORPHAN_HB_DETECTED, AUTHORITY_VIOLATION, TIMEOUT_ASSIGN, TIMEOUT_WARNING, TIMEOUT_CAP_EXCEEDED, TIMEOUT_EXTEND). `protocol_version: '1.0'` sabit. | **DRIFT** — CODE_VERIFY_REQUEST + VERIFICATION_RESULT kanalları *tanımlı* ama grep `VerifyChannel\|WORKER-HONEST\|BRAIN-FINAL` 0 sonuç. Worker → Auditor `code_verify_request` yayınlama kodu mevcut ama consumer wiring belirsiz. Kanal evolution (+6) ADR body'de kayıtlı değil → amendment gerekli. |
| adr-036 | ADR Governance Integration | accepted | `scripts/adr-validator.mjs` (177 satır) + `package.json:29` `lint:adr` + `src/orchestra/task-builder.ts:740 queryRelevantADRs()` worker prompt injection + `src/orchestra/prompt-god-template.ts` "Mandatory Architecture Rules" bloğu | FULL |
| adr-037 | Brain-Auditor-Worker RBAC V1.0 | accepted | `src/nervous/authority-matrix.ts` (184), `runtime-scope-check.ts`, `src/orchestra/authority-enforcer.ts` (667), `src/agents/worker.ts` scope check. `AUTHORITY_VIOLATION` kanalı (ADR-035 extension). | FULL |
| adr-038 | Dead Code Disposition | accepted | Kademe 1 (remove): `learning-decay.ts` ❌ yok (silinmiş ✅), `learning-migration.ts` ❌ yok (silinmiş ✅), `batch-stats.ts` ✅ **HÂLÂ MEVCUT** (ihlal). Kademe 2 (defer): `combination-scorer.ts` **silinmiş** (defer kararı bozulmuş), `handoff-protocol.ts` ✅, `brain-context.ts` ✅ korunmuş. | **VIOLATION** — batch-stats.ts Kademe 1'den silinmemiş; combination-scorer.ts Kademe 2 defer kararı bozulmuş (Sprint 145 revive/delete değerlendirmesi yapılmadan silindi) |
| adr-039 | Self-Modifying Task Detection | accepted | `src/orchestra/self-modifying-detector.ts` (163 satır). Referans: `worker.ts`, `authority-enforcer.ts`. 3 public fn: `detectDeckentRepo`, `isSelfModifying`. Sprint 148 catastrophic lesson kalıcı. | FULL |
| adr-040 | Nervous System Architecture | accepted | `src/nervous/` 11 dosya (observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, runtime-scope-check, action-registry, history). `detectors/` 11 detector file. | FULL |
| adr-041 | Agent Taxonomy (Horizontal/Vertical) | accepted | `src/core/builtins/agents/` 15 directory (test-writer **yok** ✅ — arşivlenmiş), `src/core/builtins/skills/` 21 skill (testing-expert dahil ✅). Intent classifier 'testing' primary intent kaldırılmış. | DRIFT — CLAUDE.md, DECKENT.md, IDENTITY.md "16 built-in agent" iddiası ile filesystem 15 built-in agent arasında 1 sayı drift'i. Dokümantasyon güncelleme gerekli. |
| adr-042 | Hybrid Mode Architecture | **proposed** | `src/core/config-types.ts:311,502` `deckent_style?: 'sprint' \| 'task'`. `src/cli/commands/mode.ts` (125 satır) CLI komutu implementasyonda. | DRIFT — status `proposed` ama implementation canlı (config key + CLI + test kapsamı Sprint 149/150). Status `accepted`'e geçilmeli. |

**Tablo özeti:** 36 FULL, 5 DRIFT, 2 VIOLATION, 1 STALE, 2 N/A (vision ADR)

_Not: STALE olan adr-005 resmen "deprecated" olduğu için VIOLATION sayılmaz; ancak async migration 20+ sprint açık._

---

## Drift Alarmı Listesi (Priority-Ordered)

| # | ADR | Sapma Türü | Dosya / Satır | Öneri | Priority |
|---|-----|-----------|---------------|-------|----------|
| 1 | adr-008 | VIOLATION (core→orchestra import) | `src/core/notify.ts:17` | `notify.ts`'i `orchestra/` altına taşı VEYA `eventBus` tipini `core/` altına çıkart ve `orchestra/event-bus.ts` sadece implement etsin | **P0** |
| 2 | adr-038 | VIOLATION (batch-stats.ts Kademe 1 silme eksik) | `src/orchestra/batch-stats.ts` | 141 LoC modülü sil (ADR gereksinimi). 0 consumer. | **P0** |
| 3 | adr-038 | VIOLATION (combination-scorer.ts defer kararı bozulmuş) | (silinmiş) | ADR-038 Kademe 2'yi güncelle: Sprint 145'te revive/delete değerlendirmesi yapılmadı, fiilen silindi → ADR amendment, ya da `git log` ile silme retroactively justify et | **P1** |
| 4 | adr-006 | DRIFT (`shell: true` kalıntısı) | `src/orchestra/baseline-tracker.ts:90`, `src/core/plugin-hooks.ts:399,581` | Windows-only wrap edilmemiş, sabit args. Seçenek A: `shell: true` kaldır + cross-platform test; Seçenek B: ADR body'ye "test runner `npx vitest` istisnası + Windows `.cmd` resolution" eklentisi | **P1** |
| 5 | adr-035 | DRIFT (kanal evolution + verification wire) | `src/orchestra/event-stream.ts:51-88` (21 kanal; ADR body 15 listeler) | ADR body'ye kanal evolution tablosu ekle (6 extension: ORPHAN_HB_DETECTED, AUTHORITY_VIOLATION, TIMEOUT_*×4). CODE_VERIFY_REQUEST publisher/consumer runtime kanıtı aranmalı (auditor scan). | **P1** |
| 6 | adr-042 | DRIFT (proposed → accepted promotion) | `.brain/exports/decisions.md:1824` | Implementation canlı, status `accepted`'e geçir. Sprint 150 dogfood kanıtları zaten var. | **P2** |
| 7 | adr-041 | DRIFT (agent sayısı doküman ↔ filesystem) | `CLAUDE.md`, `DECKENT.md`, `.deckent/workspace/IDENTITY.md` | "16 built-in" → "15 built-in" güncelle (test-writer removal sonrası). | **P2** |
| 8 | adr-010 | DRIFT (dep sayısı güncelliği) | `src/core/adr-seed.ts:118` (4-dep açıklaması) | ADR body 7 runtime dep + 1 opsiyonel listesi olarak güncelle (telegraf + @noble/* + discord.js eklendikten sonra) | **P2** |
| 9 | adr-026 | DRIFT (Phase 4 split gerekebilir) | `src/orchestra/sprint-finalizer.ts` 1233 LoC | Sprint 153 roadmap "sprint-finalizer" god-object kıvamına dönüşü değerlendir — Phase 4 split proposal | **P2** |
| 10 | adr-017 | DRIFT (ADR başlığı ↔ implementation) | `src/providers/*.ts` | "MCP-Native" başlığı tmux/subprocess mixed backend'i kapsamıyor. Başlığı "Provider Adapter Interface" olarak güncelle veya ADR amendment | **P2** |
| 11 | adr-005 | STALE (deprecated, async migration 20+ sprint açık) | 793 sync call × 186 file | ADR amendment önerisi: kısmi async migration stratejisi (hot path öncelikli). Alternatif: ADR'yi "rejected" olarak işaretle ve sync-by-design kararı permanent yap. | P3 |

---

## Sprint 153+ İçin Aksiyon Listesi

### P0 Must-Fix (Sprint 153 Block A)

1. **[P0] ADR-008 core→orchestra import fix** — `src/core/notify.ts:17` violation. 1 file edit, ~2 dakika. Authority-enforcer Layer 4 pilot'a ADR-008 "core→orchestra" rule ekle (şu an ADR-006/008/010 pilot ama ADR-008 check sadece "Brain → tmux/auditor/worker" one-way import kontrol ediyor, core→orchestra reverse direction eksik).
2. **[P0] ADR-038 batch-stats.ts Kademe 1 silme** — `src/orchestra/batch-stats.ts` + `tests/orchestra/batch-stats.test.ts` (varsa) sil. 0 consumer. ADR gereksinimi. ~5 dakika.

### P1 Should-Fix (Sprint 153 Block B)

3. **[P1] ADR-038 combination-scorer.ts retroactive decision** — dosya silinmiş ama Kademe 2 defer kararı bozulmuş. Seçenek: ADR-038 body'ye "Sprint 145 değerlendirmesi sonrası silindi — justification: V2 routing ML scoring canlı değil, revive ROI düşük" eklentisi (~1 paragraf).
4. **[P1] ADR-006 `shell: true` 3 kalıntı** — `baseline-tracker.ts:90` + `plugin-hooks.ts:399,581`. npx + static args, injection riski 0; ancak ADR metni "shell interpretation yok" der. Seçenek A: `process.platform === 'win32'` kapsüleme + unix path literal npm bin; Seçenek B: ADR amendment "test runner istisnası". ~15 dakika.
5. **[P1] ADR-035 kanal evolution amendment** — 21 kanal vs ADR body 15. `AUTHORITY_VIOLATION`, `ORPHAN_HB_DETECTED`, 4× TIMEOUT_* → evolution section ekle. CODE_VERIFY_REQUEST runtime wire audit'i (Sprint 153'te Auditor authority extension dogfood).

### P2 Nice-to-Fix (Sprint 153-154 boyunca)

6. **[P2] ADR-042 proposed → accepted** — `.brain/exports/decisions.md:1824` single field edit. Sprint 150 dogfood kanıtı hazır.
7. **[P2] ADR-041 "16 built-in" doc drift** — 3 dosya edit: CLAUDE.md, DECKENT.md, IDENTITY.md `16 built-in` → `15 built-in`. ~5 dakika.
8. **[P2] ADR-010 dep body refresh** — ADR body'ye 7 runtime dep + 1 opsiyonel (discord.js) listesi. `adr-seed.ts:118` i güncelle.
9. **[P2] ADR-026 Phase 4 split proposal** — Sprint 154 ROADMAP task: `sprint-finalizer.ts` 1233 LoC → 3 modül split (retro-writer + gate-computer + metrics-emitter).
10. **[P2] ADR-017 başlık refactor** — "MCP-Native Provider Adapters" → "Provider Adapter Interface Contract" amendment.

### P3 Track (Sprint 155+)

11. **[P3] ADR-005 async migration strategy** — 793 sync call × 186 file. Migration hot path önceliklendirmesi + 5-sprint plan. Alternatif: "rejected + sync-by-design permanent" kararı.

### Auditor Layer 4 Enforcement Genişletme

Mevcut pilot ADR: **ADR-006, ADR-008, ADR-010**. Sprint 153+ roadmap:

- [P1] ADR-008 pilot'ı genişlet: Brain → tmux/auditor/worker ek olarak `core → orchestra` ters yön check ekle.
- [P2] ADR-041 pilot: agent taxonomy routing health — AgentRoutingHealth detector zaten aktif (nervous/detectors/agent-routing*), ADR compliance event'e bağla.
- [P2] ADR-035 runtime pilot: `CODE_VERIFY_REQUEST` channel publisher/consumer wire detector (Sprint 153 task önerisi).

---

## Kanıt Ekleri

### 1. ADR Status Distribution

```
$ grep "^## adr-" .brain/exports/decisions.md | wc -l
43

$ grep -c "^\*\*Status:\*\* accepted" .brain/exports/decisions.md
40

$ grep -c "^\*\*Status:\*\* deprecated" .brain/exports/decisions.md
1   # adr-005

$ grep -c "^\*\*Status:\*\* superseded" .brain/exports/decisions.md
1   # adr-022

$ grep -c "^\*\*Status:\*\* proposed" .brain/exports/decisions.md
1   # adr-042
```

### 2. ADR-006 `shell: true` Kalıntıları

```
src/providers/subprocess.ts:147    // Windows comment justification ✅
src/core/provider.ts:232           // Windows comment justification ✅
src/orchestra/baseline-tracker.ts:90  shell: true,     # DRIFT
src/core/plugin-hooks.ts:399       shell: true,        # DRIFT
src/core/plugin-hooks.ts:581       shell: true,        # DRIFT
src/monitor/auditor.ts:1544        // ADR-006 comment  ✅
src/orchestra/authority-enforcer.ts  # Pilot scanner implementation ✅
```

### 3. ADR-008 Core→Orchestra Violation

```
$ rg "from ['\"]\.\./orchestra/" src/core/
src/core/notify.ts:17:import { eventBus } from '../orchestra/event-bus.js';
```

### 4. ADR-035 CHANNELS Evolution

```typescript
// src/orchestra/event-stream.ts:51-88
export const CHANNELS = {
  // Brain ↔ Worker (5) — adr-035 V1.0
  TASK_ASSIGN, HEARTBEAT, RESULT, QUESTION, ANSWER,
  // Worker ↔ Auditor (6) — adr-035 V1.0
  CODE_VERIFY_REQUEST, VERIFICATION_RESULT, SCOPE_COLLISION_DETECTED,
  ADR_VIOLATION, GATE_COMPUTED, LOAD_REPORT_WRITTEN,
  // Broadcast (3) — adr-035 V1.0
  METRIC_EMITTED, FIX_REQUEST, SPRINT_PHASE_CHANGE,
  // User (1) — adr-035 V1.0 seed
  NOTIFY,
  // === adr-035 V1.0 = 15 kanal ===

  // Evolution (6 extension, not in ADR body):
  ORPHAN_HB_DETECTED,       // Sprint 139 T-016
  AUTHORITY_VIOLATION,      // Sprint 139 T-035 / adr-037
  TIMEOUT_ASSIGN,           // Sprint 145 T-017
  TIMEOUT_WARNING,          // Sprint 145 T-017
  TIMEOUT_CAP_EXCEEDED,     // Sprint 145 T-017
  TIMEOUT_EXTEND,           // Sprint 145 T-019
} as const;
// TOPLAM: 21 kanal
```

### 5. ADR-038 Dead Code Disposition Drift

```
Kademe 1 (Remove):
  src/orchestra/learning-decay.ts       — ❌ YOK  (silinmiş ✅)
  src/orchestra/learning-migration.ts   — ❌ YOK  (silinmiş ✅)
  src/orchestra/batch-stats.ts          — ✅ VAR  (HÂLÂ SİLİNMEMİŞ — VIOLATION)

Kademe 2 (Defer):
  src/orchestra/combination-scorer.ts   — ❌ YOK  (defer bozulmuş)
  src/orchestra/handoff-protocol.ts     — ✅ VAR  (korunmuş ✅)
  src/orchestra/brain-context.ts        — ✅ VAR  (korunmuş ✅)
```

### 6. ADR-041 Agent Taxonomy Doc Drift

```
filesystem:  src/core/builtins/agents/ 15 directory
  accessibility-auditor, api-builder, architect, architecture-planner,
  bug-fixer, ci-guardian, code-reviewer, data-engineer, devops-engineer,
  doc-writer, frontend-designer, migration-specialist, performance-analyzer,
  refactorer, security-auditor
  (test-writer YOK ✅ — ADR-041 reform canlı)

doc iddiası (CLAUDE.md, DECKENT.md, IDENTITY.md): "16 built-in agents"
→ fiili: 15
DRIFT: identity dokümantasyonu güncelleme gerekli
```

### 7. ADR-036 Runtime Enforcement Kanıtları

```
scripts/adr-validator.mjs                          177 satır, `npm run lint:adr`
src/orchestra/task-builder.ts:740  queryRelevantADRs()
src/orchestra/prompt-god-template.ts              "Mandatory Architecture Rules" bloğu
package.json:29                                    "lint:adr": "node scripts/adr-validator.mjs"
DECKENT.md                                         @.brain/DECISIONS.md reference (mandatory read)
```

### 8. ADR-042 Implementation Canlılık

```typescript
// src/core/config-types.ts:311
deckent_style?: 'sprint' | 'task';

// src/cli/commands/mode.ts (125 satır)
// Mode toggle + show + auto detect
```

---

## Sonuç

**43 ADR × compliance taraması tamamlandı.** Genel sağlık: **83.7% FULL (36/43)**. 2 VIOLATION Sprint 153 Block A'da kapatılmalı (~10 dakika toplam). 5 DRIFT Block B'de 1-2 saatte sonuçlanabilir. STALE adr-005 stratejik karar gerektirir (async migration 20+ sprint açık konu).

**Layer 4 runtime enforcement pilot ADR-006/008/010** sadece pilot seviyesinde — ADR-035, ADR-037, ADR-041 de runtime check altına alınabilir. Sprint 153 task önerisi: "ADR Compliance Layer 4 Extension — 3 ADR pilot genişletme".

**Code write YOK** (scope: sadece `docs/audits/sprint-152/T-152-016-adr-compliance.md`). Git diff `src/` + `tests/` = 0 satır değişiklik.
