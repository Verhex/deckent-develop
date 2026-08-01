# Audit Report: `src/agents/adaptive-agent.ts`

**Sprint:** sprint-186 (per-file pilot batch 1)
**Auditor:** w-186-001 (doc-writer / typescript-expert)
**Date:** 2026-05-21
**Source LoC:** 213 (header comment + blank line = task spec'teki 214)
**Companion test LoC:** `tests/agents/adaptive-agent.test.ts` (250 LoC)

---

## 1. Inventory

| Aspect | Value |
|--------|-------|
| Path | `src/agents/adaptive-agent.ts` |
| LoC | 213 |
| Module type | Pure TypeScript class + interfaces (zero runtime deps) |
| Imports | **HİÇBİRİ** — bağımsız modül (no `import` statement) |
| Exports | `AdaptiveAgent` (class), `PromptDiff` (interface), `EffectivenessResult` (interface), `ResultEntry` (interface), `WeaknessPattern` (interface, *internal — not exported*) |
| Public methods | `AdaptiveAgent.analyzePromptEffectiveness(_agentId, recentResults)`, `AdaptiveAgent.suggestPromptChange(_agentId, currentPrompt, weaknesses)` |
| Internal constants | `IMPROVEMENT_THRESHOLD = 0.7`, `MIN_SPRINTS_FOR_ANALYSIS = 1`, `RECENT_WINDOW = 3`, `WEAKNESS_PATTERNS` (5 detection patterns) |
| Reverse dependencies (production `src/`) | **0 (sıfır)** — `grep -r "adaptive-agent\|AdaptiveAgent" src/` yalnızca dosyanın kendisini bulur |
| Reverse dependencies (tests) | 3 dosya: `tests/agents/adaptive-agent.test.ts`, `tests/integration/collaboration-adaptive.test.ts`, `tests/orchestra/agent-routing-health.test.ts` (sonuncusu sadece string referans, runtime import değil) |
| Side effects | Yok — pure class, sadece veri dönüştürür |
| Async surface | Yok — tüm metodlar sync |

**Notable signature detail:** `_agentId` parametresi her iki public metodda da underscore prefix ile işaretlenmiş — kullanılmıyor ama API simetrisi için tutuluyor.

---

## 2. Baglam (Architectural Context)

`adaptive-agent.ts` Deckent'in **prompt evolution / agent self-improvement** vizyonunun erken bir prototipi olarak görünüyor. Header yorumu net: *"Analyzes prompt effectiveness and suggests improvements. Never auto-applies."*

**Mantıksal yerleşim (varsayım):**
- Sprint sonunda Brain'in agent başına çalıştıracağı bir analyzer.
- Recent N sprint result'larına bakar, başarı oranı %70 altındaysa zayıflıkları tespit eder ve prompt'a eklenecek bölümler (`## Error Handling`, `## Test Coverage`, vb.) önerir.
- Kararı uygulamak (write to `agent.json` / `PROMPT.md`) **insan onayı** gerektirir — `never auto-applies` kontratı.

**Beklenen entegrasyon noktaları (yokluğu kritik):**
| Beklenen çağıran | Var mı? | Not |
|-------------------|---------|-----|
| `sprint-controller.ts` finalize fazı | ❌ | Hiçbir referans yok |
| `agent-pool.ts` (agent stats güncellemesi) | ❌ | Hiçbir referans yok |
| `promotion-pipeline.ts` (promote/demote kararı) | ❌ | Hiçbir referans yok |
| `prompt-evolution.ts` (ilgili modül) | ❌ — kontrol gerekli | İsim benzerliği var ama bu modülü import etmiyor |
| Brain ↔ Auditor verification protocol (ADR-035) | ❌ | Hiçbir bağ yok |

**Sonuç:** Bu modül **production runtime'da çağrılmıyor**. Yalnızca unit ve integration testler tarafından doğrudan instantiate ediliyor. `tests/orchestra/agent-routing-health.test.ts:334` içindeki referans bir string literal'dir (task scope test verisi) — gerçek bir import değil.

**ADR ilişkisi (zayıf):**
- ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents) — adaptive agent'ın varlığı ile gevşek ilgili
- ADR-048 (Prompt Lifecycle Contract) — adaptive-agent'ın *amacı* bu kontratla uyumlu görünüyor ama runtime wire yok
- ADR-038 (Dead Code Disposition) — bu modül kendisini doğrudan ilgilendiriyor (aşağıdaki Dead Code section)

---

## 3. Debt Risk

| Risk | Severity | Açıklama | Mitigation |
|------|----------|----------|------------|
| **Production runtime wire yok** | HIGH | Modül 213 LoC kod + 250 LoC test taşıyor ama hiçbir production module tarafından çağrılmıyor. Bu **dormant feature debt** (ADR-038'in tarif ettiği "Dead Code Disposition" kategorisine düşüyor). | Karar verilmeli: wire et (prompt evolution pipeline'a bağla) veya kaldır (ADR amendment + 3 test dosyası temizliği) |
| **`_agentId` unused parameter** | LOW | Her iki public metoda da geçilen `agentId` hiç kullanılmıyor. Parametre underscore prefix ile gizleniyor (TS lint geçiriyor) ama API contract aldatıcı — "agent başına" analiz vaat ediyor, gerçekte sadece result array'i işliyor. | Parameter'ı kaldır VEYA gerçekten agent-specific davranış ekle |
| **Magic numbers** | LOW | `0.7`, `0.4`, `60`, `0.5`, `25`, `0.15` gibi threshold'lar inline sabit. `IMPROVEMENT_THRESHOLD` constant olarak çıkarılmış ama diğerleri WEAKNESS_PATTERNS içinde gömülü. | Tüm threshold'ları `THRESHOLDS` object olarak çıkar (config'e geçirilebilir hale gelir) |
| **`suggestPromptChange` string-matching fragility** | MEDIUM | `weakness.includes('NO_GO')`, `weakness.includes('coverage')` gibi substring kontrolleri WEAKNESS_PATTERNS `label` alanına sıkı bağımlı. Label metni İngilizce'den Türkçe'ye çevrildiğinde tüm öneri sistemi sessizce bozulur. | `WeaknessPattern.id` (örn. `'high-nogo-rate'`) üzerinden eşleştir, label sadece görüntüleme için kullan |
| **Patterns dizisi extensibility yok** | MEDIUM | 5 hard-coded weakness pattern var. Yeni pattern eklemek kaynak kodu değişikliği gerektirir. Plugin loader yok. | Plugin registry (ADR-030 stilinde) |
| **i18n eksik** | LOW | Tüm `label` ve önerilen markdown bölümleri yalnızca İngilizce. ADR-032 (i18n Pattern System) ile uyumsuz. | TR string'leri ekle (DECKENT TR-first vizyonu) |
| **Test isolation riski** | LOW | Modül `Math.pow` ve `Math.sqrt` kullanıyor — deterministic ama floating-point edge case'ler (NaN, Infinity) için savunma yok. `coverage` her zaman ≥0 varsayılıyor. | Input validation eklenebilir veya `branded type` (`NonNegativeNumber`) kullanılabilir |

**Toplam debt risk:** MEDIUM (dormant feature + string-matching fragility). Acil değil çünkü production kullanılmıyor — ama her yeni sprint bu modülü taşımaya devam ediyor.

---

## 4. Dead Code Candidates

`grep`-bazlı kanıt:

```bash
$ grep -rn "adaptive-agent\|AdaptiveAgent" src/
src/agents/adaptive-agent.ts:94:export class AdaptiveAgent { ... }
# (yalnızca dosyanın kendisi)
```

```bash
$ grep -rn "AdaptiveAgent" tests/
tests/agents/adaptive-agent.test.ts:2:import { AdaptiveAgent } ...
tests/agents/adaptive-agent.test.ts:18:describe('AdaptiveAgent', ...
tests/integration/collaboration-adaptive.test.ts:11:import { AdaptiveAgent } ...
tests/integration/collaboration-adaptive.test.ts:249,284,365,414: new AdaptiveAgent()
# Yalnızca testler — production runtime kullanımı YOK
```

| Symbol | Verdict | Kanıt |
|--------|---------|-------|
| `AdaptiveAgent` class | **DORMANT** — production import 0, sadece test instantiation | grep yukarıda |
| `PromptDiff`, `EffectivenessResult`, `ResultEntry` | **DORMANT** — yalnızca test type-import'larında | `grep -r "PromptDiff\|EffectivenessResult\|ResultEntry"` src/ → 0 dış kullanım |
| `analyzePromptEffectiveness` metodu | **DORMANT** | Hiçbir caller yok |
| `suggestPromptChange` metodu | **DORMANT** | Hiçbir caller yok |
| WEAKNESS_PATTERNS dizisi | **DORMANT** | Yalnızca dosya içinde kullanılıyor |
| `_agentId` parametresi | **DEAD** (kullanılmıyor, sadece API simetrisi için tutulmuş) | Underscore prefix kanıt |

**Disposition önerisi (ADR-038 stilinde):**
1. **KEEP (preferred):** Modülü `prompt-evolution.ts` veya `sprint-reporter.ts` retro fazına wire et. Mevcut test coverage zaten yeterli (~250 LoC test).
2. **ARCHIVE:** `src/_archive/adaptive-agent.ts` altına taşı, testleri skip et, ADR amendment yaz.
3. **DELETE:** Sprint 188+ karar verirse, 213 + 250 = 463 LoC silinebilir.

**Sprint 188 karar gerekliliği:** Bu modül **5+ sprint** boyunca dormant kalmış. ADR-038 disposition pattern'ine göre `DORMANT > 3 sprint = ARCHIVE candidate`.

---

## 5. Documentation Gaps

| Gap | Açıklama | Öncelik |
|-----|----------|---------|
| **Module-level docstring yok** | Header sadece 2 satırlık yorum. Modülün kim tarafından, nasıl, ne zaman çağrılacağı belirtilmemiş. | HIGH |
| **`AdaptiveAgent` class JSDoc yok** | Class-level docblock yok. `analyzePromptEffectiveness` ve `suggestPromptChange` minimal JSDoc'lara sahip ama `@param`, `@returns`, `@example` eksik. | HIGH |
| **WEAKNESS_PATTERNS açıklaması yok** | 5 pattern var, neden bu eşikler (0.4, 60, 25, 0.15) seçildiği açıklanmamış. | MEDIUM |
| **Threshold tuning kılavuzu yok** | `IMPROVEMENT_THRESHOLD = 0.7` neden %70 (ne %60 ne %80)? Kanıt yok. | LOW |
| **Integration example yok** | Hangi caller'ın bu API'yi nasıl tüketmesi gerektiğine dair tek bir örnek yok. | HIGH |
| **ADR cross-reference yok** | ADR-048 (Prompt Lifecycle Contract) ile bağlantı dosya içinde belirtilmemiş. | MEDIUM |
| **README/architecture doc'unda yok** | `CLAUDE.md` veya `docs/reference/api-surface.md` bu modülü listelenmiyor. | MEDIUM |
| **"Never auto-applies" kontratı test edilmiyor** | Header kontrat sözü veriyor ama test suite bunu ayrı bir test ile doğrulamıyor — `suggestPromptChange` döndürür, hiçbir mutasyon yapmaz: bu davranış implicit olarak test ediliyor ama explicit bir "contract test" yok. | LOW |

---

## 6. ADR Compliance Check

| ADR | Relevance | Compliance | Detay |
|-----|-----------|------------|-------|
| **ADR-001** (TypeScript + ESM) | ✅ Applies | ✅ COMPLIANT | Pure TS, ESM-safe (zero imports → no `.js` extension issue) |
| **ADR-002** (Node16 Module Resolution) | ✅ Applies | ✅ COMPLIANT | Import yok, sorun yok |
| **ADR-003** (vitest over Jest) | ✅ Applies | ✅ COMPLIANT | Test dosyaları vitest kullanıyor |
| **ADR-008** (Brain Merkezi Import — Tek Yönlü Bağımlılık) | ✅ Applies | ✅ COMPLIANT | Bu modül hiçbir şeyi import etmiyor — yön ihlali yok |
| **ADR-010** (Tek Runtime Dependency — commander.js) | ✅ Applies | ✅ COMPLIANT | External dep yok |
| **ADR-032** (i18n Pattern System — TR/EN) | ⚠️ Applies | ❌ **NON-COMPLIANT** | Tüm `label` ve önerilen markdown bölümleri yalnızca EN. `patternsByLang`/`I18nStrings` paterni uygulanmamış. |
| **ADR-035** (Brain ↔ Worker ↔ Auditor Verification Protocol) | ⚠️ Applies | ⚪ N/A | Modül runtime'a wire değil — protokole katılmıyor |
| **ADR-037** (RBAC Authority Matrix V1.0) | ⚠️ Applies | ⚪ N/A | Runtime'a wire değil |
| **ADR-038** (Dead Code Disposition) | ✅ Applies | ❌ **NON-COMPLIANT** | Modül 5+ sprint dormant — disposition kararı yapılmamış |
| **ADR-041** (Agent Taxonomy) | ✅ Applies | ⚠️ PARTIAL | Konseptual olarak agent-related ama agent pool'a register edilmemiş |
| **ADR-048** (Prompt Lifecycle Contract) | ✅ Applies | ⚠️ PARTIAL | Modülün amacı bu kontratla uyumlu; ancak runtime wire eksikliği nedeniyle kontrat enforce edilmiyor |
| **ADR-053** (TaskType Taxonomy: Audit / Document-Write / Code-Development) | ⚪ Indirect | ✅ COMPLIANT | Bu task `document-write` taxonomy'sine uyuyor |

**Aksiyon gereken iki ADR:**
1. **ADR-032 violation:** i18n eksik — Sprint 188'de TR string seti eklenmeli VEYA modül arşivleneceği için bu ADR kapsam dışı kalır.
2. **ADR-038 violation:** Disposition kararı yapılmamış — Sprint 188 follow-up.

---

## 7. Refactor Recommendations

**Senaryo A — modül KEEP (production'a wire edilecek):**

1. **i18n migration (ADR-032):**
   - `WeaknessPattern` arayüzüne `labelI18n: { en: string; tr: string }` ekle.
   - Önerilen markdown bölümlerini `I18nStrings` patterni ile TR/EN üret.
   - `i18n(ctx)` helper'ını import et (varsa managed-docs'tan).

2. **String-matching fragility fix:**
   ```typescript
   // ÖNCE (kırılgan):
   if (weakness.includes('NO_GO')) { ... }

   // SONRA (id-based):
   for (const weakness of detectedPatterns) {
     switch (weakness.id) {
       case 'high-nogo-rate': suggestions.push(...); break;
       case 'low-coverage': suggestions.push(...); break;
       ...
     }
   }
   ```
   Bu için `analyzePromptEffectiveness` `weaknesses: string[]` yerine `weaknesses: WeaknessPattern[]` döndürmeli (breaking change — test güncellemesi gerekir).

3. **`_agentId` ya kullan ya kaldır:**
   - Agent başına farklı eşik kullanılacaksa: signature'ı `(agentId, results, options?)` haline getir.
   - Aksi takdirde: parametreyi tamamen kaldır.

4. **Threshold extraction:**
   ```typescript
   const ADAPTIVE_THRESHOLDS = {
     IMPROVEMENT: 0.7,
     NOGO_RATE: 0.4,
     LOW_COVERAGE: 60,
     TECH_DEBT_RATE: 0.5,
     INCONSISTENT_COVERAGE_STDDEV: 25,
     DECLINE_DELTA: 0.15,
   } as const;
   ```
   Config-driven hale getirmek için `loadAdaptiveThresholds(config)` helper'ı ekle.

5. **Wire to sprint pipeline:** `sprint-reporter.ts` RETRO fazına entegre et — her agent için son N sprint result'ı topla, `AdaptiveAgent.analyzePromptEffectiveness` çağır, sonucu `.brain/exports/agent-suggestions.md` dosyasına yaz (manuel review için).

**Senaryo B — modül ARCHIVE (önerilen):**

1. `src/_archive/sprint-186-adaptive-agent/` klasörü oluştur.
2. `src/agents/adaptive-agent.ts` → archive'e taşı.
3. 3 test dosyasını da archive'e veya `tests/_archive/` altına taşı (veya skip et).
4. ADR-038 amendment yaz: "adaptive-agent: dormant > 5 sprint, archived for future restoration."
5. CLAUDE.md / DECKENT.md güncellenmesi gerekmez (zaten listelenmiyor).

**Senaryo C — modül DELETE:**

Yalnızca 2+ sprint daha dormant kalırsa önerilir. 463 LoC tasarrufu (213 source + 250 test).

---

## 8. Sprint 188 Follow-up Items

| Item | Owner | Priority | Effort | Notes |
|------|-------|----------|--------|-------|
| **F1:** ADR-038 disposition kararı: KEEP / ARCHIVE / DELETE seç | Brain + İnsan onayı | HIGH | low | 5+ sprint dormant; karar yokluğu architecture debt'tir |
| **F2:** Eğer KEEP → sprint-reporter.ts RETRO fazına wire et | architecture-planner | HIGH | normal | Önerilen integration point: `sprint-reporter.ts:updateAgentStats()` |
| **F3:** Eğer KEEP → ADR-032 i18n compliance fix | doc-writer | MEDIUM | normal | TR/EN label + suggestion string'leri |
| **F4:** `_agentId` parametresi kullan ya da kaldır | refactorer | LOW | low | API contract ↔ implementation tutarsızlığı |
| **F5:** WEAKNESS_PATTERNS plugin extensibility | architect | LOW | normal | ADR-030 stilinde plugin registry |
| **F6:** Eğer ARCHIVE → `src/_archive/` taşı + ADR-038 amendment | refactorer | HIGH | low | Test dosyaları da taşınmalı |
| **F7:** Eğer DELETE → 3 test dosyası + 1 source sil + git history not | refactorer | HIGH | low | Yalnızca 2+ sprint daha dormant kalırsa |
| **F8:** Module-level docstring + JSDoc completion | doc-writer | MEDIUM | low | Senaryo A seçilirse zorunlu |
| **F9:** "Never auto-applies" contract test | testing-expert | LOW | low | Header kontratını explicit test |
| **F10:** Per-file pilot retro: bu audit'in faydası ölç | architect | LOW | low | Audit→action conversion oranı |

---

## 9. Summary

`src/agents/adaptive-agent.ts` (213 LoC) **fonksiyonel olarak sağlam** (250 LoC test ile desteklenmiş), tasarımı temiz (zero-dep, pure-function class) ama **production runtime'da çağrılmıyor** — 5+ sprint boyunca **dormant feature**. ADR-038 (Dead Code Disposition) kapsamında disposition kararı bekliyor.

**Kritik bulgular:**
- 🟡 **Dormant production code** — 0 reverse-dependency in `src/`
- 🔴 **ADR-038 non-compliance** — disposition kararı yapılmamış
- 🟡 **ADR-032 non-compliance** — i18n eksik (yalnızca EN)
- 🟡 **String-matching fragility** — label-based pattern eşleştirme i18n'le birlikte bozulur
- 🟢 **Test coverage iyi** — vitest ile kapsamlı

**Önerilen aksiyon (Sprint 188):** **ARCHIVE** kararı verilsin VE `prompt-evolution.ts` modülü ile entegrasyon planlanırsa restore edilsin. Mevcut haliyle modül 463 LoC architectural debt taşıyor.

**Per-file pilot meta-notu:** Bu dosya 50-task pilot'un en küçük dormant modüllerinden biri. Pilot başarılı olursa, src/agents/ altındaki diğer prompt-* modülleri (prompt-ab-test.ts, prompt-analytics.ts, prompt-rollback.ts) benzer disposition kararları gerektirebilir.
