# DIRECTIVES — Sprint 140: Deckent Self-Analysis (Revize)

## Goal

Deckent kendi kendini tam kapsamli analiz eder. Her TypeScript dosyasi, her test kategorisi, her dokuman, her config, her .brain/ yapisi paralel worker'lar tarafindan read-only incelenir. Hicbir dosya okunmamis kalmaz. Worker'lar rapor yazar, brain finalize'da tek FINAL-REPORT.md uretir. KOD YAZILMAZ, TEST CALISTIRILMAZ, COMMIT YAPILMAZ.

**Sprint 140 ruhu:** Deckent'in ayna sprinti — kendini her zerresiyle tanir.

---

## Kurallar (MUTLAK)

1. **READ-ONLY:** Worker'lar hicbir kaynak dosya degistirmez. Sadece `.deckent/sprint-140-analysis/` altina rapor yazar
2. **Test calistirma YASAK:** Worker verify loop devre disi
3. **Commit YASAK:** Sprint sonunda Alperen elle commit eder
4. **Cross-contamination YOK:** Her worker sadece kendi rapor dosyasina yazar
5. **Sink dizin:** `.deckent/sprint-140-analysis/<kategori>/<dosya>.md`
6. **TEK final rapor:** `.deckent/sprint-140-analysis/FINAL-REPORT.md`
7. **Basarisiz analiz → flag:** NO_GO worker'lar final rapor Section 16'da listelenir

---

## Worker Rapor Template

Her worker su template'i kullanir:

```
# Analysis: <dosya-yolu>
**Task ID:** 140-XXX | **LoC:** <sayi>

## 1. Amaci (1-2 cumle)
## 2. Public API (export listesi)
## 3. Ic + Dis Bagimliliklar
## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
## 5. Type Safety (any, @ts-ignore, non-null assertion)
## 6. ADR Compliance (ADR-006/008/010/037/039/040)
## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
## 8. TODO/FIXME/HACK inventory
## 9. Dead Code Candidates
## 10. Security Findings
## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
## 12. Oneriler (Sprint 142+ input)
## 13. Verdict: ANALYZED | PARTIAL | UNREADABLE
```

---

## Task 1: src/core/ Analysis (78 dosya)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/*.ts, src/core/**/*.ts
- Scope: src/core/

### Description

Read-only per-file analysis of all 78 TypeScript files in `src/core/`. Write individual reports to `.deckent/sprint-140-analysis/src/core/<filename>.md`. Ozellikle dikkat:
- memory-store.ts, memory-query.ts, memory-normalize.ts, memory-export.ts, memory-import.ts, memory-types.ts (Memory V2 yeni moduller — DB schema, FTS5, turkishNormalize dogrulugu)
- config-types.ts (memory V2 config section eklendi mi?)
- constants.ts (MEMORY_DB_FILE, MEMORY_EXPORTS_DIR eklendi mi?)
- utils.ts (parseDebtTable/generateDebtTable @deprecated mi? countBrainLines silindi mi?)
- token-counter.ts, subscription.ts (cost guard entegrasyonu)

**Kanit:** 78 rapor dosyasi `.deckent/sprint-140-analysis/src/core/` altinda, her biri ≥30 satir.

---

## Task 2: src/orchestra/ Analysis (82 dosya)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/*.ts, src/orchestra/**/*.ts
- Scope: src/orchestra/

### Description

Read-only per-file analysis of all 82 TypeScript files in `src/orchestra/`. Write reports to `.deckent/sprint-140-analysis/src/orchestra/<filename>.md`. Ozellikle dikkat:
- debt-manager.ts (V1 fallback tamamen kaldirildi mi? MemoryStore kullanimi dogru mu?)
- sprint-planner.ts (readContext DB-first mi?)
- sprint-retro-writer.ts (dual-write pattern dogru mu?)
- task-builder.ts (queryRelevantADRs, loadADRContent silindi mi?)
- sprint-finalizer.ts (memory decay DB-first mi?)
- event-stream.ts (ADR-035 compliance)
- authority-enforcer.ts (ADR-037 RBAC matrisi)
- self-modifying-detector.ts (ADR-039)

**Kanit:** 82 rapor dosyasi, her biri ≥30 satir.

---

## Task 3: src/cli/ Analysis (75 dosya)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/**/*.ts
- Scope: src/cli/

### Description

Read-only per-file analysis of all 75 TypeScript files in `src/cli/`. Write reports to `.deckent/sprint-140-analysis/src/cli/<subdir>/<filename>.md`. Ozellikle dikkat:
- recall.ts, remember.ts, memory.ts (Memory V2 yeni CLI komutlari)
- cleanup.ts (countBrainLines → getMemoryEntryCount refactor dogru mu?)
- doctor.ts (getMemoryEntryCount, brain budget check)
- archive-debt.ts (DB-first debt archival)

**Kanit:** 75 rapor dosyasi, her biri ≥20 satir.

---

## Task 4: src/mcp/ Analysis (37 dosya)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/**/*.ts
- Scope: src/mcp/

### Description

Read-only per-file analysis of all 37 TypeScript files in `src/mcp/`. Write reports to `.deckent/sprint-140-analysis/src/mcp/<subdir>/<filename>.md`. Ozellikle dikkat:
- tools/memory-query.ts (yeni MCP tool — deckent_memory_query)
- resources/memory.ts, debt.ts, retro.ts (DB-first, V1 fallback kaldirildi mi?)
- tools/index.ts (memory_query register edilmis mi?)
- server.ts (22 tool kayitli mi?)

**Kanit:** 37 rapor dosyasi.

---

## Task 5: src/agents/ + src/providers/ + src/monitor/ + src/api/ + src/extensions/ Analysis (30 dosya)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/*.ts, src/providers/*.ts, src/monitor/*.ts, src/api/*.ts, src/extensions/**/*.ts
- Scope: src/agents/, src/providers/, src/monitor/, src/api/, src/extensions/

### Description

Read-only per-file analysis of remaining 30 TypeScript files. Write reports to `.deckent/sprint-140-analysis/src/<module>/<filename>.md`. Ozellikle dikkat:
- monitor/auditor.ts (checkADRCompliance DB-first mi? MemoryStore import var mi?)
- agents/worker.ts (ADR'ler prompt'tan gelir, dosya okumaz — dogru mu?)

**Kanit:** 30 rapor dosyasi.

---

## Task 6: src/dashboard/ Batch Analysis (44 dosya, batch)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Agent: frontend-designer
- Files: src/dashboard/src/**/*.tsx, src/dashboard/src/**/*.ts
- Scope: src/dashboard/

### Description

Batch read-only analysis of all 44 non-CSS TypeScript/TSX files in `src/dashboard/src/`. Write single batch report to `.deckent/sprint-140-analysis/src/dashboard/dashboard-batch.md`. Her dosya icin 3-5 satir ozet. Component mimarisi, i18n uyumu, type safety, dead component tespiti.

**Kanit:** 1 batch rapor ≥200 satir, 44 dosya listelenmis.

---

## Task 7: tests/ Category Analysis (28 kategori)
- Model: sonnet
- Effort: high
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/**/*.test.ts
- Scope: tests/

### Description

Per-category batch analysis of all 562 test files across 28 categories. Her kategori icin `.deckent/sprint-140-analysis/tests/<kategori>.md` raporu:
1. Test dosya envanteri (describe/it blok sayilari)
2. Mock pattern audit (vi.mock, MemoryStore mock dogru mu?)
3. Coverage mapping (src/X → tests/X.test.ts eslesmesi)
4. Orphan test tespiti
5. Flaky candidate isaretleri
6. Memory V2 mock uyumu (eski countBrainLines mock kaldi mi?)

Kategoriler: agents(25), analytics(4), api(11), audits(1), blueprint(4), brain(1), cli(126), config(1), core(119), dashboard(12), docker(1), docs(25), e2e(10), extensions(1), github(5), helpers(2), integration(30), load(1), mcp(27), monitor(9), orchestra(118), providers(7), scripts(10), security(3), skills(1), smoke(1), unit(5), workflows(1)

**Kanit:** 28 rapor dosyasi, her biri ≥50 satir.

---

## Task 8: docs/ Analysis (260 markdown)
- Model: haiku
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/**/*.md
- Scope: docs/

### Description

Batch analysis of 260 markdown docs across categories. Write category reports to `.deckent/sprint-140-analysis/docs/<kategori>.md`:
- docs/audits/ — sprint audit raporlari guncellik kontrolu
- docs/superpowers/ — spec + plan dosyalari, Memory V2 spec var mi?
- docs/architecture/ — mimari dokumanlarin guncellik
- docs/development/ + docs/guide/ + docs/reference/ — kullanici rehberleri
- docs/vision/ — product vision uyumu

**Kanit:** 8 kategori raporu.

---

## Task 9: .brain/ + .brain/exports/ + config Analysis
- Model: sonnet
- Effort: normal
- Skills: system-architect
- Agent: architecture-planner
- Files: .brain/*, .brain/exports/*, .deckent/config.json, .contracts/api-surface.md
- Scope: .brain/, .deckent/, .contracts/

### Description

Analyze the Memory V2 DB state and brain file structure:
1. `.brain/memory.db` — entry sayilari, tip dagilimi, FTS5 calisiyor mu?
2. `.brain/exports/summary.md` — icerik dogrulugu, boyut < 5K mi?
3. `.brain/exports/decisions.md` — 40 ADR listesi dogru mu?
4. `.brain/archive/pre-v2/` — backup dosyalari tam mi?
5. `.brain/DECISIONS.md` — hala 96K mi yoksa exports'a mi tasindi?
6. `.deckent/config.json` — memory V2 config section var mi?
7. `.contracts/api-surface.md` — Memory V2 DB schema dokumante edilmis mi?
8. `.claude/rules/brain.md, auditor.md, worker-default.md` — DB-first kurallari yazilmis mi?

Write report to `.deckent/sprint-140-analysis/brain/brain-state.md`.

**Kanit:** 1 rapor ≥100 satir.

---

## Task 10: Root files + scripts/ Analysis
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Agent: doc-writer
- Files: *.md, scripts/*.mjs, package.json, tsconfig.json
- Scope: .

### Description

Analyze 18 root markdown files + 12 scripts + config JSONs. Write report to `.deckent/sprint-140-analysis/meta/root-files.md`:
- CLAUDE.md / DECKENT.md / AGENTS.md — Memory V2 dokumante edilmis mi?
- DIRECTIVES.md — guncel mi?
- package.json — better-sqlite3 dependency var mi?
- .gitignore — memory.db gitignore'da mi?
- scripts/migrate-brain-v2.mjs — migration script mevcut mu?

**Kanit:** 1 rapor ≥60 satir.

---

## Task 11: META — Architecture Graph + Circular Dependency
- Model: opus
- Effort: high
- Skills: system-architect, typescript-expert
- Agent: architect
- Files: src/**/*.ts
- Scope: src/

### Description

Cross-cutting: src/ modul bagimllik grafi. Import chain analizi, Brain/Auditor/Worker/Core/CLI/MCP/Memory kategorizasyonu. ADR-008 dongusel bagimllik tespiti. Memory V2 modullerin import zinciri dogru mu? Write to `.deckent/sprint-140-analysis/meta/architecture-graph.md`.

**Kanit:** ≥150 satir, modul graf + ihlal listesi.

---

## Task 12: META — Dead Code + Type Safety + Security
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/**/*.ts
- Scope: src/

### Description

3 cross-cutting analiz tek task'ta:
1. Dead code: unused export envanteri, unreferenced fonksiyonlar, ADR-038 compliance
2. Type safety: `any`, `@ts-ignore`, `@ts-expect-error`, unsafe cast, non-null assertion sayimi
3. Security: OWASP, secret detection, input validation (HTTP API, MCP, CLI args, worker prompts), better-sqlite3 SQL injection riski

Write to `.deckent/sprint-140-analysis/meta/dead-code-type-security.md`.

**Kanit:** ≥200 satir, 3 bolum.

---

## Task 13: META — ADR Compliance + CLI/MCP Parity + i18n
- Model: opus
- Effort: high
- Skills: system-architect, api-builder
- Agent: architect
- Files: src/**/*.ts, .brain/DECISIONS.md
- Scope: src/, .brain/

### Description

3 cross-cutting analiz:
1. ADR compliance: 40 ADR ihlal taramasi (ADR-001 ESM, ADR-006 spawnSync, ADR-008 brain import, ADR-010 deps, ADR-022 parity, ADR-037 RBAC, ADR-039 self-modifying, **ADR-040 Memory V2 DB-first**)
2. CLI/MCP parity: 40+ CLI komut ↔ 22 MCP tool eslesmesi (ADR-022)
3. i18n: TR/EN parity (dashboard, CLI help, MCP descriptions, Memory V2 turkishNormalize)

Write to `.deckent/sprint-140-analysis/meta/adr-parity-i18n.md`.

**Kanit:** ≥200 satir, 3 bolum.

---

## Task 14: META — Test Coverage Map + Performance + Error Handling + TODO inventory
- Model: sonnet
- Effort: high
- Skills: testing-expert, performance-optimizer
- Agent: code-reviewer
- Files: src/**/*.ts, tests/**/*.test.ts
- Scope: src/, tests/

### Description

4 cross-cutting analiz:
1. Test coverage: src/X.ts → tests/X.test.ts eslesmesi, orphan src + orphan test listesi
2. Performance: sync I/O sayimi (readFileSync, writeFileSync, spawnSync), hot path tespiti
3. Error handling: try/catch uniformity, BrainError tipleri, silent swallow anti-pattern
4. TODO/FIXME/HACK: tum src/ + tests/ comment envanteri, kategorize (urgent/planned/archived)

Write to `.deckent/sprint-140-analysis/meta/coverage-perf-errors-todo.md`.

**Kanit:** ≥200 satir, 4 bolum.

---

## Task 15: META — Memory V2 Integrity Verification
- Model: opus
- Effort: high
- Skills: system-architect, typescript-expert
- Agent: architect
- Files: src/core/memory-*.ts, .brain/memory.db, .brain/exports/
- Scope: src/core/, .brain/

### Description

Memory V2 ozel derinlemesine analiz:
1. DB schema dogruluk: 5 tablo + FTS5 + trigger'lar + indeksler tam mi?
2. Migration integrity: 55 entry dogru mu? ADR count = .brain/archive/pre-v2/DECISIONS.md ADR sayisi?
3. FTS5 turkishNormalize: dual-layer calisiyor mu? Ornek sorgular (docker, guvenlik, brain import)
4. Export roundtrip: DB → export → reimport → count eslesmesi
5. @ referans surekliligi: CLAUDE.md, DECKENT.md, AGENTS.md → summary.md dogru mu?
6. Eski .md parse kodu: src/ icinde readFileSync + parseDebtTable + countBrainLines hala var mi?
7. brain.md/auditor.md/worker-default.md kurallari DB-first mi?

Write to `.deckent/sprint-140-analysis/meta/memory-v2-integrity.md`.

**Kanit:** ≥200 satir, 7 bolum.

---

## Task 16: FINAL — Aggregation Report
- Model: opus
- Effort: high
- Priority: CRITICAL
- Dependencies: Task 1-15 tamamlanmis olmali
- Skills: documentation-writer, system-architect
- Agent: architecture-planner
- Files: .deckent/sprint-140-analysis/FINAL-REPORT.md (YENI)
- Scope: .deckent/sprint-140-analysis/

### Description

TUM diger task raporlarini oku, analiz et, tek kapsamli FINAL-REPORT.md uret. Alperen icin karar noktalarini ve Sprint 142+ onceliklerini belirle.

**Rapor Yapisi (20 section):**
1. Executive Summary (top 10 finding + health score /100)
2. src/ Module-by-Module Ozeti (her modul top 5 finding)
3. Test Coverage Gap Heatmap
4. Documentation Coverage Gap
5. ADR Compliance Report (40 ADR × ihlal sayisi)
6. Dead Code Inventory
7. Security Findings
8. Performance Hot Paths (sync I/O baseline)
9. Type Safety Issues
10. Circular Dependency Report
11. i18n Coverage Gap
12. CLI/MCP Parity Gap
13. Memory V2 Integrity Summary
14. Config Schema Consistency
15. Error Handling Anti-Patterns
16. Failed Analysis Flags (NO_GO worker raporlari)
17. Sprint 142+ Debt Candidates (prioritized P0/P1/P2)
18. Alperen Decision Points (strategic calls + risk trade-offs)
19. Sprint 140 Meta-Metrics (task throughput, coverage %)
20. References (worker rapor dosya listesi + linked ADR'ler)

**Kanit:** FINAL-REPORT.md ≥2000 satir, 20 section basligi mevcut.

---

## Hedef Metrikleri

| Metrik | Hedef |
|--------|-------|
| Task sayisi | **16** (yonetilibilir bloklar, toplam ~355 src + 562 test + 260 doc kapsar) |
| Read-only violation | **0** |
| Dosya coverage | **%100** (hicbir dosya okunmamis kalmasin) |
| Final report | **1 adet** (FINAL-REPORT.md ≥2000 satir) |
| Worker report dosyalari | ~300+ (per-file + batch + meta) |
| Sure hard cap | **12 saat** |
| Commit count | **0** |
| Memory V2 integrity check | **PASS** (Task 15) |
