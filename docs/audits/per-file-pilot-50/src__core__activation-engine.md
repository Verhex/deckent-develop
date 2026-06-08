# Audit — src/core/activation-engine.ts

**Sprint:** 187 (per-file pilot 50) · **Task:** 186-022 · **Audited:** 2026-05-21 · **Model:** opus · **Effort:** low

---

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/core/activation-engine.ts` |
| LoC (raw) | 320 (DIRECTIVES'in deklare ettiği 321 LoC ile +/-1 sapma; final `\n` farkı) |
| Module type | Pure functions (no class, no top-level state) |
| Side effects | None — deterministik, I/O yok |
| Imports (production) | `./routing-types.js` (5 types), `./skill-types.js` (2 types), `./condition-evaluator.js` (`evaluateCondition`) |
| Imports (runtime) | Sadece `evaluateCondition` — diğerleri type-only |
| Public exports (7) | `evaluateActivation`, `evaluateRule`, `evaluateRuleViaSecondary`, `evaluateExclusion`, `migrateV1AgentToActivation`, `migrateV1SkillToActivation`, `getDynamicExclusions` |
| Private helpers (3) | `taskDNAToRecord`, `inferIntentsFromKeywords`, `extractDomainFromScope` |

### Reverse Dependencies (callers)

| Dosya | Kullanılan API | Notlar |
|-------|----------------|--------|
| `src/core/routing-engine.ts` | `evaluateActivation` (3×), `migrateV1AgentToActivation`, `migrateV1SkillToActivation`, `getDynamicExclusions` | **Ana tüketici** — agent/skill scoring + dynamic exclusion |
| `src/core/manifest-migrator.ts` | `migrateV1AgentToActivation`, `migrateV1SkillToActivation` | V1→V2 manifest dönüşümü |
| `src/orchestra/prompt-token-optimizer.ts` | `evaluateActivation` | Skill aktivasyon filtresi |
| `src/core/index.ts` | Re-export: `evaluateActivation`, `evaluateRule`, `evaluateExclusion` | Public API surface (3/7 — diğer 4 export sadece dahili kullanım) |
| `tests/core/activation-engine.test.ts` | 25 test case (7 describe bloğu) | Tüm 7 export kapsanmış |

---

## 2. Bağlam

`activation-engine.ts`, Sprint 144'te tanıtılan 3-katmanlı routing pipeline'ının **Layer-2**'sidir:

```
TaskDNA ────► intent-classifier (Layer 1) ────► activation-engine (Layer 2) ────► routing-engine (Layer 3)
                  intent + tags                    score per agent/skill           confidence + decision
```

Görevi: Bir agent veya skill'in `ActivationConfig` (rules + exclude + minScore) tanımını alıp, verilen `TaskDNA`'ya karşı **deterministic score** üretmek. Önceki nesil (V1) `triggerKeywords` ile string-içerik eşleştiriyordu; bu modül **structured, intent-aware** matching getirir.

### Modülün üç mantıksal bölümü

1. **Activation evaluation** (satır 15-96) — runtime scoring + exclusion pipeline. `evaluateActivation` exclude-first, then accumulate-rules; sıralama deterministik.
2. **V1 → V2 migration** (satır 104-207) — eski manifest'lerin (sadece `triggers: string[]`) `ActivationConfig`'e çevrilmesi. `inferIntentsFromKeywords()` 11 intent kategorisi için 40+ keyword mapping içerir.
3. **Dynamic exclusions** (satır 278-320) — intent + scope kombinasyonuna göre çalışma anında agent dışlamaları üretir. Sprint 148 taxonomy reform'unda `testing` primary intent kaldırıldı (yorum satır 291).

### İlgili ADR'ler

| ADR | Bağlantı |
|-----|----------|
| ADR-028 | Decision-Engine V1 → V2 Routing Migration — bu modül V2 routing'in matching motoru |
| ADR-041 | Agent Taxonomy — Horizontal Skills vs Vertical Agents — `getDynamicExclusions` taxonomy'yi runtime'da uygular |
| ADR-053 | TaskType Taxonomy — `IntentType` değerleri (`'documentation'`, `'security'`, `'design'`...) bu enumla hizalı |

---

## 3. Debt Risk

| Risk | Şiddet | Açıklama |
|------|--------|----------|
| **Hard-coded keyword map** (`KEYWORD_TO_INTENT`, satır 234-248) | Orta | 40+ kelime in-source; yeni dil/proje eklenince kod değişikliği gerekir. İdeal: config-driven veya intent-classifier ile paylaşılan registry. |
| **Hard-coded scope exclusions** (`getDynamicExclusions`, satır 303-317) | Orta | `src/orchestra/`, `src/cli/`, `src/dashboard/` deckent codebase'ine özel string'ler — kullanıcı projelerinde anlamlı değil (ADR-039 self-modifying detection çerçevesinde değerlendirilmeli). |
| **Empty/incomplete migrations** (`migrateV1AgentToActivation`, satır 137-143) | Düşük | File pattern rule sadece `.test.`/`.spec.` substring kontrol eder — diğer file pattern türleri (e.g. `**/*.tsx`) sessizce yutulur. |
| **Magic score weights** (`Math.min(strength * 2, 10)`, `Math.min(strength * 2, 8)`) | Düşük | Score katsayıları (2×, cap 10/8) gerekçesiz; outcome data ile kalibre edilmemiş. |
| **`secondary` cast** (`taskDNA.intent.secondary as string[]`, satır 68) | Düşük | `IntentType[]` → `string[]` cast type-safety bypass; `includes()` `string` parametresi alıyor. Yeni intent eklenince derleyici uyarmayabilir. |
| **`patternsByLang`-style i18n yok** (ADR-032 paralel) | Düşük | Keyword map yalnızca İngilizce — TR projelerde `'guvenlik'`, `'hata'` eşleşmez. ADR-032 i18n şablonunu izlemiyor. |

---

## 4. Dead Code Candidates

Gerçek dead code **tespit edilmedi**. Aşağıda incelenen aday/uyarılar:

| Sembol | Durum | Kanıt |
|--------|-------|-------|
| `evaluateRule` (named export) | **Canlı** | `tests/core/activation-engine.test.ts` (3 test) + `evaluateActivation` içinden çağrılıyor (satır 36). `src/core/index.ts:33` re-export. |
| `evaluateExclusion` (named export) | **Canlı** | Test kapsamı 3 case + `evaluateActivation` içinden (satır 21). Re-export `src/core/index.ts:33`. |
| `evaluateRuleViaSecondary` | **Canlı** | `evaluateActivation` içinden çağrılıyor (satır 43). 4 test case (`evaluateRuleViaSecondary (C)` describe bloğu). Export edilmesi sade testability için; runtime dış tüketici yok. |
| `migrateV1SkillToActivation`'da `category === 'language'` ile `category === 'framework'` blokları (satır 164-180) | **Duplicate kod** | İki dal **tam aynı şeyi yapıyor** (`'v1-language-' / 'v1-framework-'` prefix farkı dışında). Refactor adayı. |
| `extractDomainFromScope` `'index'`/`'utils'` filtresi (satır 267) | **Canlı** | Kullanılan domain liste oldukça dar — `'lib'`, `'common'` da filtrelenmesi gerekebilir; ama dead değil. |

**Grep komutları (kanıt):**
- `grep -rn "evaluateRule\b\|evaluateExclusion\b\|evaluateRuleViaSecondary" src/` → 7 hit, tümü kullanımda.
- `grep -rn "from ['\"].*activation-engine" src/` → 4 callers.

---

## 5. Documentation Gaps

| Eksik | Etki |
|-------|------|
| **Module-level JSDoc/intro** | İlk yorum bloğu 1-satırlık başlık; "Layer 2 of 3-layer routing pipeline" bağlamı dosya içinde belgelenmemiş. Yeni okuyucu için routing pipeline'da nereye düştüğü görünmüyor. |
| **`taskDNAToRecord`** | Niçin nested obje düzleştirilmediği belirsiz — `condition-evaluator` path-based erişim destekliyor (`intent.primary`); doc'da bu kontrat yok. |
| **`KEYWORD_TO_INTENT` kapsamı** | `intent-classifier.ts` muhtemelen daha geniş bir map içeriyor; bu **shadow map**'in neden ayrı tutulduğu (sadece V1 migration için mi?) belgelenmemiş. |
| **`getDynamicExclusions` ADR-041 bağlantısı** | "Replaces hard-coded global exclusion of architecture-planner, frontend-designer, migration-specialist" yorumu var (satır 274-277) ama ADR-041'e atıf yok. |
| **Score scale convention** | Score'ların hangi aralıkta toplandığı (0-30? 0-100?) ve `minScore` ile karşılaştırmanın nerede yapıldığı (`routing-engine`'de) doc edilmemiş. |
| **Sprint 148 yorumu** (satır 291) | `'testing' removed as primary intent (Sprint 148 taxonomy reform)` — ek bağlam yok; ADR-053 referansı eklenmeli. |
| **`@example` blokları yok** | Hiçbir export'ta usage example yok. Public API surface (3 re-export) için en azından `evaluateActivation` örneği eklenmeli. |

---

## 6. ADR Compliance Check

| ADR | Beklenti | Bu modülde | Durum |
|-----|----------|------------|-------|
| **ADR-001** TypeScript + ESM | `.js` uzantısı zorunlu | Tüm importlar `.js` ile (`routing-types.js`, `skill-types.js`, `condition-evaluator.js`) | ✅ |
| **ADR-002** Node16 Module Resolution | Relative import + `.js` | Uyumlu | ✅ |
| **ADR-008** Brain Merkezi Import | core/ → sadece core/ içine | Sadece 3 core import, hiçbiri brain/orchestra/agents/auditor yönüne değil | ✅ |
| **ADR-010** Tek Runtime Dependency | Yalnızca commander.js + Node stdlib | Hiçbir 3rd-party import yok | ✅ |
| **ADR-028** V1→V2 Routing Migration | V2 routing skoru + V1 manifest desteği | `migrateV1AgentToActivation` + `migrateV1SkillToActivation` mevcut; `routing-engine` her ikisini de tüketiyor | ✅ |
| **ADR-041** Agent Taxonomy | Horizontal skill vs vertical agent | `getDynamicExclusions` intent + scope ile çapraz eleme yapıyor; taxonomy alignment OK | ✅ (genel olarak) — ama deckent-spesifik scope path'leri kullanıcı projelerinde geçerli değil (bkz. ADR-039) |
| **ADR-053** TaskType Taxonomy | `IntentType` enum hizalanmalı | `inferIntentsFromKeywords` ürettiği intent string'leri (`'security'`, `'bugfix'`, `'testing'`, `'refactor'`...) `IntentType` enum'unda **var**, ancak `'testing'` Sprint 148'de kaldırıldı — yine de KEYWORD_TO_INTENT (satır 238-239) `'testing'` üretmeye devam ediyor | ⚠️ **Drift** (aşağıda 7. bölüm) |
| **ADR-032** i18n Pattern System | TR/EN dual matching | Keyword map sadece İngilizce; `patternsByLang` benzeri TR map yok | ⚠️ Eksik (kapsam dışı olabilir — keyword inference V1 manifest'ler için) |
| **ADR-036** ADR Governance | ADR ihlali NO_GO + amendment | Test suite ADR-028 davranışlarını doğruluyor (intent matching, secondary path) | ✅ |
| **ADR-039** Self-Modifying Task Detection | Deckent codebase'ine özel path'ler diğer projelere sızmamalı | `getDynamicExclusions` `src/orchestra/`, `src/cli/`, `src/dashboard/` hard-coded — kullanıcı projelerinde no-op olur, bug değil ama design smell | ⚠️ Drift |

---

## 7. Refactor Recommendations

| # | Öneri | Kazanım | Risk |
|---|-------|---------|------|
| R1 | **`migrateV1SkillToActivation` `language`/`framework` dallarını birleştir** (satır 164-180 → tek loop, prefix parametresi) | -16 LoC, duplicate kod eliminasyonu | Çok düşük — davranış birebir korunabilir |
| R2 | **`KEYWORD_TO_INTENT`'i `intent-classifier.ts` ile paylaş** veya `src/core/intent-keywords.ts` adında tek SoT'ye taşı | İki yerde drift riski sıfırlanır; ADR-053'e uyum | Düşük — refactor + import güncellemesi |
| R3 | **ADR-053 drift fix:** `KEYWORD_TO_INTENT` içinden `'test'/'spec'/'coverage'/'vitest'/'mock'/'unit'/'integration' → 'testing'` mappinglerini kaldır (Sprint 148 reform'a göre `'testing'` artık primary intent değil; `tags: ['test-coverage']` route'una taşınmalı) | Taxonomy tutarlılığı; routing decision kalibrasyonu | Orta — `routing-engine` testleri etkilenebilir, V1 migration davranışı değişir |
| R4 | **`taskDNA.intent.secondary as string[]` cast'ini kaldır** — `IntentType` tipinde `includes()` kullan veya generic helper | Type safety, future enum genişlemesinde compiler check | Çok düşük |
| R5 | **`getDynamicExclusions` exclusion tablolarını config-driven yap** (e.g. `.deckent/exclusions.json`) — ADR-039 uyumu | Deckent-spesifik path'ler kullanıcı projelerinde overrideable hale gelir | Orta — config şeması + migration |
| R6 | **Score weights için outcome-tracker integrasyonu** — `2×`, `cap 10/8` magic number'ları öğrenilen weight'lerle değiştir | Adaptive routing; kalibre skorlar | Yüksek — ayrı çalışma kapsamı |
| R7 | **Module header JSDoc ekle** — pipeline pozisyonu + score scale + extension noktaları | Onboarding süresini düşürür | Sıfır |
| R8 | **`extractDomainFromScope` filtre listesini genişlet** (`'lib'`, `'common'`, `'shared'`) ve testlerini ekle | False-positive domain rule'ları azaltır | Çok düşük |

---

## 8. Sprint 188 Follow-up Items

| Öncelik | Item | Tahmini effort | İlgili refactor |
|---------|------|---------------|-----------------|
| P0 | **R3 — Taxonomy drift fix:** Sprint 148 reform'a göre `'testing'` keyword mapping'ini kaldır + outcome regression testi | normal | ADR-053 alignment |
| P1 | **R1 — Duplicate language/framework migration kollarını birleştir** | low | Lokal cleanup |
| P1 | **R2 — Shared keyword registry** (`intent-classifier.ts` ile drift önle) | normal | Single Source of Truth |
| P2 | **R5 — `getDynamicExclusions` config-driven** (ADR-039 self-modifying detection ile birlikte) | high | Multi-project safety |
| P2 | **`docs/architecture/routing-pipeline.md`** yaz — 3-katman akışı + bu modülün rolü diyagramı | normal | Documentation |
| P3 | **R4 — `as string[]` cast eliminasyonu** + lint kuralı | low | Type safety |
| P3 | **R7 — Module-level JSDoc + `@example`** her public export için | low | DX |
| P3 | **Property-based test** — `fast-check` ile rule scoring monotonicity property'leri | normal | Test rigor |

---

## 9. Summary

`src/core/activation-engine.ts`, 3-katmanlı routing pipeline'ın **Layer-2 scoring motoru**. 320 LoC, **7 export + 3 private helper**, 25 unit test ile kapsanmış, side-effect'siz pure-function tasarımıyla **sağlam** durumda. ESM/ADR-008/ADR-010 kurallarına tam uyumlu, runtime'da yalnızca `evaluateCondition` çağırıyor.

**Genel sağlık:** Yeşil. Refactor önerileri kozmetik ve evrimsel; üretim riski yok.

**Kritik bulgu (tek):** ADR-053 + Sprint 148 taxonomy reform sonrası `'testing'` primary intent kaldırıldığı belirtildiği halde `KEYWORD_TO_INTENT` map'i hâlâ 7 keyword'ü `'testing'`'e map'liyor (satır 238-239). V1 migration yolundan oluşan `ActivationRule`'lar artık geçerli olmayan bir intent için score üretiyor — `'testing'` primary intent'i route etmek mümkün olduğu için, FIX agent V1 manifest'lerden gelen route'larda sessiz "ölü dal" oluşuyor. **R3 (Sprint 188 P0)** olarak takip edilmeli.

**Yüzeysel iyileştirmeler:** Duplicate `language`/`framework` migration kolları (R1), magic score weight'ler (R6), deckent-spesifik scope hard-code'ları (R5).

**Risk yok:** Tip güvenliği bir cast dışında temiz; dead code yok; ADR drift yalnızca taxonomy düzeyinde ve davranışsal değil sınıflandırmasal.

---

*Generated by w-186-022 · doc-only audit · no source modifications*
