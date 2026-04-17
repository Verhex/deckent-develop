# Analysis: src/orchestra/promotion-pipeline.ts
**Task ID:** 141-002 | **LoC:** 286

## 1. Amaci (1-2 cumle)
Geçici (temp) agent/skill'lerin performans verilerine göre kalıcıya (permanent) terfi ettirilmesini ve düşük performanslı kalıcı varlıkların devre dışı bırakılmasını yönetir. OutcomeTracker istatistiklerini kullanarak terfi/tenzil kararları alır.

## 2. Public API (export listesi)
- `PromotionCriteria` (interface)
- `DemotionCriteria` (interface)
- `PromotionResult` (interface)
- `PromotionPipeline` (class)
  - `evaluatePromotions(tracker)` → PromotionResult[]
  - `evaluateDemotions(tracker)` → PromotionResult[]
  - `promote(entityId, entityType)` → boolean
  - `demote(entityId, entityType)` → boolean

## 3. Ic + Dis Bagimliliklar
**Dahili:**
- `./outcome-tracker.js` — OutcomeTracker, EntityPerformance

**Harici (Node.js):**
- `fs` — existsSync, mkdirSync, readFileSync, writeFileSync, cpSync

**Core:**
- `../core/utils.js` — debugLog

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Public metotlar: 4 (evaluatePromotions, evaluateDemotions, promote, demote)
- Private metotlar: 3 (evaluateEntityPromotion, isBuiltIn, evaluateEntityDemotion)
- Module-level helper: 1 (findTempEntityDir)
- Cyclomatic: orta (~12) — çift konum arama mantığı, koşullu terfi/tenzil yolları

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `require('fs')` kullanımı: findTempEntityDir içinde CommonJS `require('fs')` çağrısı var (satır 276) — ESM projesinde `require` kullanımı ADR-001 ihlali riski taşır
- Non-null assertion: yok
- `any`: yok
- `@ts-ignore`: yok

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-001 (ESM):** SORUN — satır 276'da `const { readdirSync } = require('fs')` kullanımı var; ESM modülünde CommonJS `require()` çağrısı. Üst seviyede `readdirSync` import edilmemiş, fonksiyon içinde lazily çekiliyor. Teknik borç.
- **ADR-006:** Uyumlu — spawnSync kullanılmıyor, doğrudan fs işlemleri.
- **ADR-008:** Uyumlu — doğrudan brain import yok.
- **ADR-010:** Uyumlu — harici bağımlılık yok.
- **ADR-037:** Kısmen — promote/demote işlemleri yetki kontrolü yapmıyor; Brain dışında da çağrılabilir.
- **ADR-040:** Uyumlu — Memory V2'ye dokunmuyor.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/promotion-guard.test.ts` mevcut — doğrudan `promotion-pipeline.test.ts` yok
- Dolaylı kapsam: promotion-guard üzerinden terfi mantığı test edilebilir
- **Gap:** promote/demote fs işlemleri ve findTempEntityDir için doğrudan unit test eksik

## 8. TODO/FIXME/HACK inventory
- Satır 133: `/* non-fatal — manifest update failed */` — sessiz hata yutma
- Satır 276: `require('fs')` lazy import — teknik borç notu yok, ama ESM uyumsuzluğu riski

## 9. Dead Code Candidates
- `buildWorkerCommand` alias gibi legacy adreslemeler yok; kod aktif kullanımda
- `promotionCriteria.minSprints` alanı yapıda tanımlı ama hesaplamada kullanılmıyor (satır 15 vs değerlendirme mantığı) — olası dead config field

## 10. Security Findings
- Manifest dosyalarına yazma: `writeFileSync` kullanımı file path injection riski taşımaz çünkü `entityId` join() aracılığıyla güvenli şekilde birleştirilir
- `cpSync` kullanımı: kaynak dizin doğrulaması yapılıyor (existsSync)
- **Risk:** `entityId` değeri dış kaynaklı olabilir; path traversal saldırısına karşı koruma yok (`../../` gibi)

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile doğrudan ilişkili değil; agent/skill dizin yapısını yönetiyor
- DB okuma yok — sadece `.deckent/agents/` ve `.tasks/agents/` dizinlerindeki JSON dosyaları okunuyor
- Memory V2 uyumlu: hiçbir eski .md parse kodu yok

## 12. Oneriler (Sprint 142+ input)
1. **ESM Fix (P1):** `require('fs')` → `import { readdirSync } from 'node:fs'` ile üst level import
2. **Path Traversal (P1):** entityId'yi sanitize eden bir yardımcı fonksiyon ekle (`/[^a-zA-Z0-9_-]/` gibi)
3. **ADR-037 (P2):** promote/demote çağrıları için Brain yetki kontrolü ekle
4. **Test (P2):** Doğrudan `promotion-pipeline.test.ts` dosyası yaz, fs mock ile

## 13. Verdict: ANALYZED
