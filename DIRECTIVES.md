# DIRECTIVES — Sprint 130: Kapsamlı Codebase Analiz ve Düzeltme — MCP Instructions Fix + Decision-Engine Arşivleme + Coverage Doğrulama

## Goal: Kapsamlı audit bulgularını çöz. MCP server.ts instructions string'inde 15 tool listeleniyor, gerçek 21 — MCP host'lar 6 tool'u görmüyor. README/CONTRIBUTING'deki eski sayıları düzelt, Key Features'a 4 yeni özellik ekle. Decision-engine V1 modüllerini @deprecated ile arşivle, ADR-028 yaz. Gerçek test coverage ölç ve 96%+ iddiasını doğrula. Sıfır regresyon.

---

## Task 1: MCP Instructions Fix + Dokümantasyon Kapsamlı Güncelleme
- Model: opus
- Effort: high
- Skills: documentation-writer, typescript-expert
- Agent: doc-writer
- Files: src/mcp/server.ts, README.md, README-TR.md, CONTRIBUTING.md, VISION.md, .contracts/api-surface.md
- Scope: src/mcp/, docs/, .contracts/, .deckent/

### Description
MCP server.ts instructions string'i sadece 15 tool listeliyor ama gerçekte 21 tool register ediliyor. README ve CONTRIBUTING'de de eski sayılar var. Ayrıca Key Features'ta Sprint 125-129 özellikleri eksik.

**Düzeltme adımları:**

1. `src/mcp/server.ts` — MCP_INSTRUCTIONS string'ini bul (satır ~18 civarı, "## Tools (15)" yazan yer). Düzelt:
   - "## Tools (15)" → "## Tools (21)"
   - Eksik 6 tool'u listeye ekle (mevcut tool açıklamalarının formatını takip et):
     - `deckent_help`: Runtime yetenekleri, proje durumu ve kullanım rehberi göster
     - `deckent_agent_list`: Kayıtlı agent'ları listele (built-in ve temp)
     - `deckent_skill_list`: Kayıtlı skill'leri manifest bilgisiyle listele
     - `deckent_checkpoint`: Checkpoint approve/reject
     - `deckent_docs`: Sprint lifecycle doküman yönetimi (add/remove/list)
     - `deckent_explain`: Sprint geçmişini ve sonuçlarını açıkla

2. `README.md` satır 83: "20 MCP tools + 8 resources" → "21 MCP tools + 8 resources"

3. `README.md` Key Features bölümüne şu 4 özelliği ekle (mevcut feature listesinin sonuna):
   - "**Rubric-Based Grading** -- 4-criteria structured evaluation (correctness, coverage, scope, docs) with configurable weights"
   - "**Worker Question Mechanism** -- IPC + file-based fallback for worker-to-brain communication during task execution"
   - "**Context-Aware Routing** -- Token budget estimation and contextFit scoring for intelligent model selection"
   - "**Token Usage Tracker** -- Per-task token counting with provider-native metrics and RETRO.md summary table"

4. `README-TR.md` satır 85: "20 MCP tool + 8 resource" → "21 MCP tool + 8 resource"

5. `README-TR.md` Temel Özellikler bölümüne aynı 4 özelliğin Türkçe çevirisini ekle:
   - "**Rubrik Tabanlı Notlama** -- 4 kriterli yapılandırılmış değerlendirme (doğruluk, kapsam, scope uyumu, dokümantasyon)"
   - "**Worker Soru Mekanizması** -- Görev yürütme sırasında worker-brain IPC + dosya tabanlı fallback iletişimi"
   - "**Bağlam Farkında Yönlendirme** -- Token bütçesi tahmini ve contextFit puanlama ile akıllı model seçimi"
   - "**Token Kullanım İzleyici** -- Provider-native metriklerle görev bazlı token sayımı ve RETRO.md özet tablosu"

6. `CONTRIBUTING.md` satır 118: "16 MCP tool handlers" → "21 MCP tool handlers"
7. `CONTRIBUTING.md` satır 150: "16 tools (enriched responses) and 9 resources" → "21 tools (enriched responses) and 8 resources"

8. `VISION.md` satır 79: "Sprint 119-123" → "Sprint 119-129"
9. `VISION.md` satır 117-124: Sprint metriklerini sprint-129 olarak güncelle

10. `.contracts/api-surface.md` Result File Format bölümüne şu opsiyonel alanları ekle:
    - `"rubricScores": { "correctness": 90, "test_coverage": 85, "scope_compliance": 100, "documentation": 70 }` (opsiyonel)
    - `"evaluationDecision": "DONE | GO_WITH_TECH_DEBT | NO_GO"` (opsiyonel — rubric-based decision)

**Kanıt:** 
- `grep -n "Tools (15)" src/mcp/server.ts` → sonuç yok
- `grep -n "20 MCP" README.md README-TR.md` → sonuç yok
- `grep -n "16 MCP" CONTRIBUTING.md` → sonuç yok
- `grep "Rubric-Based" README.md` → var
- `grep "rubricScores" .contracts/api-surface.md` → var

**Test:** `npx tsc --noEmit` → temiz. Mevcut testler kırılmamalı.

---

## Task 2: Decision-Engine Arşivleme + .brain/ Temizlik + ADR Yazımı
- Model: opus
- Effort: high
- Skills: typescript-expert, code-simplifier
- Agent: refactorer
- Files: src/orchestra/decision-engine.ts, src/orchestra/decision-replay.ts, src/orchestra/decision-steps/agent-step.ts, src/orchestra/decision-steps/scope-step.ts, .brain/DECISIONS.md, .brain/ERRORS.md
- Scope: src/orchestra/, .brain/

### Description
Decision-engine modülleri Sprint 031'de 6-adımlı keyword-based routing pipeline olarak tasarlandı. Sprint 066'da V2 intent-based routing engine (src/core/routing-engine.ts) tarafından supersede edildi. Kod çalışıyor (38 test geçiyor) ama hiçbir production kodu import etmiyor. SİLİNMEYECEK — @deprecated ile işaretlenecek.

**Düzeltme adımları:**

1. `src/orchestra/decision-engine.ts` — Dosya başına (ilk satır, tüm import'lardan ÖNCE) şu JSDoc bloğunu ekle:
```
/**
 * @deprecated Since Sprint 066. Superseded by V2 intent-based routing engine
 * (src/core/routing-engine.ts → routeTaskV2). Kept as reference implementation.
 * V1: keyword-based 6-step pipeline (TaskAnalysis → AgentSelection → SkillSelection
 *   → ModelResolution → EffortResolution → ScopeComputation)
 * V2: intent-based 3-layer engine (Intent Classification → Activation Evaluation → Routing Decision)
 * All 38 tests still pass. Do not delete without ADR update.
 */
```

2. `src/orchestra/decision-replay.ts` — Aynı @deprecated JSDoc bloğunu ekle (kısa versiyon: "@deprecated Since Sprint 066. Part of V1 routing. See decision-engine.ts.")

3. `src/orchestra/decision-steps/agent-step.ts` — Aynı kısa @deprecated bloğu

4. `src/orchestra/decision-steps/scope-step.ts` — Aynı kısa @deprecated bloğu

5. `.brain/DECISIONS.md` sonuna ADR-028 ekle:
```markdown
## ADR-028: Decision-Engine V1 → V2 Routing Migration

**Context:** Sprint 031'de keyword-based DecisionOrchestrator tasarlandı (6-step pipeline). Sprint 066'da intent-based V2 routing engine (routeTaskV2) ile değiştirildi.

**Decision:** V1 kod silinmeyecek — referans implementasyonu olarak korunacak. @deprecated ile işaretlendi.

**Consequences:** 4 kaynak dosya + 38 test maintained but unused in production. decision-logger.ts hâlâ V2 tarafından kullanılıyor.

**Status:** ACCEPTED (Sprint 130)
```

6. `.brain/DECISIONS.md` sonuna büyük dosya analiz notu ekle:
```markdown
## NOTE: Büyük Dosya Split Analizi (Sprint 130)

- sprint-controller.ts (2133 satır) — Split önerisi: sprint-lifecycle.ts (faz yönetimi) + sprint-orchestrator.ts (worker koordinasyonu)
- sprint-reporter.ts (2132 satır) — Split önerisi: retro-writer.ts (retrospektif) + performance-reporter.ts (metrik)
- **Status:** Gelecek sprint'te değerlendirilecek — bu sprint'te sadece belgelendi.
```

7. `.brain/ERRORS.md` — İçeriği `.brain/archive/errors-sprint-129.md` dosyasına kopyala (Bash ile `cp`), sonra ERRORS.md'yi boşalt (sadece boş dosya bırak)

**Kanıt:**
- `grep "@deprecated" src/orchestra/decision-engine.ts` → var
- `grep "ADR-028" .brain/DECISIONS.md` → var
- `grep "Büyük Dosya" .brain/DECISIONS.md` → var
- `wc -l .brain/ERRORS.md` → 0 veya 1 satır
- `npx tsc --noEmit` → temiz
- `npx vitest run` → tam suite geçer (decision-engine testleri DAHİL)

**Test:** `npx tsc --noEmit` → temiz. `npx vitest run` → tam suite geçer.

---

## Task 3: Coverage Altyapısı Doğrulama + Gerçek Ölçüm
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: vitest.config.ts, .deckent/workspace/IDENTITY.md, CLAUDE.md
- Scope: tests/, src/, .deckent/

### Description
vitest.config.ts'de v8 coverage konfigürasyonu mevcut ama hiç çalıştırılmamış. IDENTITY.md "Coverage: 96%+" iddia ediyor ama bu hiç ölçülmemiş. Gerçek coverage'ı ölç ve dokümanları güncelle.

**Düzeltme adımları:**

1. `npx vitest run --coverage` çalıştır — gerçek v8 coverage al. Eğer v8 provider yüklü değilse: `npm install -D @vitest/coverage-v8` yükle, sonra tekrar çalıştır.

2. Coverage sonucunu oku:
   - Terminal çıktısından Lines %, Branches %, Functions %, Statements % değerlerini al
   - VEYA `coverage/coverage-summary.json` dosyasını oku

3. `.deckent/workspace/IDENTITY.md` satır 11: "Coverage: 96%+" → gerçek Lines % değeri ile güncelle (örneğin "Coverage: XX%")

4. `CLAUDE.md` Sprint Metrics tablosunda "Coverage | 0.0%" → gerçek Lines % değeri ile güncelle

5. Vitest timeout investigate:
   - `[vitest-worker] Timeout calling onTaskUpdate` hatasını ara
   - Bu hata hangi test dosyasında oluşuyor? `npx vitest run --reporter=verbose 2>&1 | grep -A5 "Timeout"` ile bul
   - Eğer reproducible ve belirli bir dosyada oluşuyorsa: vitest.config.ts'de `pool: 'forks'` veya `poolOptions: { threads: { maxThreads: 4 } }` ekle
   - Eğer sporadic (CI flakiness) ise: DECISIONS.md'ye not ekle, config değiştirme

6. **Coverage iyileştirme YAPMA** — sadece ölç ve raporla. Threshold ekleme, exclude düzeltme vb. yapmak bu sprint'in kapsamında DEĞİL.

**Kanıt:**
- `npx vitest run --coverage` → coverage raporu üretilir
- `ls coverage/` → dosyalar var (boş değil)
- `grep "Coverage" .deckent/workspace/IDENTITY.md` → gerçek değer
- `grep "Coverage" CLAUDE.md` → gerçek değer

**Test:** `npx vitest run --coverage` başarıyla tamamlanır.

---

## Quality Rules
- `npx tsc --noEmit` temiz olmalı — SIFIR hata
- `npx vitest run` tam suite geçmeli — decision-engine testleri DAHİL (silinmiyor)
- `npx vitest run --coverage` başarıyla çalışıp coverage raporu üretmeli
- Mevcut testler kırılmamalı — SIFIR regresyon
- Her task bağımsız — birbirine bağımlılık YOK, paralel çalışabilir