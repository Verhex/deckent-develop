# Analysis: src/core/marketplace/rating-system.ts
**Task ID:** 142-007 | **Model:** opus | **LoC:** 200 | **Effort:** max

## 1. Amacı
Skill rating sistemi: lokal performans metrikleri (success rate, coverage, frequency) ile 0-5 ölçeğinde otomatik rating hesaplar ve kullanıcı puanlamalarını (1-5) kabul eder. Veriler `ratings.json` dosyasında saklanır. Ağırlıklı formül: `(successRate * 0.6 + avgCoverage/100 * 0.3 + min(frequency,100)/100 * 0.1) * 5`.

## 2. Public API
- `interface SkillRatingData` — JSDoc YOK ✗ (field yorumları mevcut)
- `interface RatingSubmission` — JSDoc YOK ✗
- `interface RatingsFile` — JSDoc YOK ✗
- `interface RatingSystemFS` — FS abstraction
- `class RatingSystem` — JSDoc YOK ✗
  - `constructor(dataDir, options?)`
  - `calculateLocalRating(skillId, stats): number` — JSDoc VAR ✓ (formül dokümante edilmiş)
  - `submitRating(skillId, rating, comment?): RatingSubmission` — JSDoc VAR ✓
  - `getRatings(): RatingsFile` — JSDoc VAR ✓
  - `getSkillRating(skillId): SkillRatingData | null` — JSDoc VAR ✓
  - `getSkillSubmissions(skillId): RatingSubmission[]` — JSDoc VAR ✓
  - `formatRating(rating): string` — JSDoc VAR ✓

## 3. İç Bağımlılıklar
- `import { ErrorRegistry } from '../errors.js'` — Hata kodu sistemi.
- Döngüsel bağımlılık riski: Düşük — errors.ts basit bir utility.

## 4. Dış Bağımlılıklar
- `node:fs` (existsSync, readFileSync, writeFileSync, mkdirSync) — Built-in ✓
- `node:path` (join) — Built-in ✓
- ADR-010 uyumlu ✓

## 5. Complexity
- 1 sınıf, 6 public + 3 private method.
- Max cyclomatic complexity: `calculateLocalRating` (satır 74-88) — 3 (Math.max/min clamping). Düşük.
- En karmaşık: `_saveRating` (satır 176-199) — find + conditional update. ~4.

## 6. Type Safety
- `any` kullanımı: 0 ✓
- `@ts-ignore`: 0 ✓
- `@ts-expect-error`: 0 ✓
- `as unknown`: 0 ✓
- Non-null `!`: 0 ✓
- `as RatingsFile` (satır 159) — JSON.parse sonucu. Array.isArray ile validasyon var ✓. Güvenli.
- `as string` (satır 156) — readFileSync utf-8. Güvenli.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A.
- **ADR-008 (brain import):** ✓ — Sadece core/errors'dan import.
- **ADR-010 (tek dependency):** ✓.
- **ADR-033 (product vision):** ✓ — Lokal rating, ağ bağlantısı yok.
- **Memory V2:** N/A.

## 8. Test Coverage
- Test dosyası: `tests/core/marketplace/rating-system.test.ts` ✓ MEVCUT
- Beklenen: calculateLocalRating (boundary: 0/1 successRate, 0/100 coverage), submitRating (valid/invalid), getRatings, getSkillRating, formatRating.

## 9. TODO/FIXME/HACK Inventory
- NONE ✓

## 10. Dead Code
- **🚨 DEAD CODE ALERT:** `RatingSystem` HİÇBİR src/ dosyasından import edilmiyor.
  - `grep 'from.*rating-system'` sonucu: 0 kullanım (src/ altında).
  - Sadece test dosyasında kullanılıyor.
- **Severity: P1** — Marketplace rating pipeline'ı henüz wire edilmemiş.

## 11. Security
- `submitRating`: Rating 1-5 integer kontrolü ✓ (satır 95).
- `ErrorRegistry.createError('DECKENT_E053')`: Standardize hata kodu ✓.
- JSON dosya I/O: Lokal, güvenli.
- **AMA:** `_saveRating` — her `calculateLocalRating` çağrısında dosyaya yazıyor (satır 86). Side-effect'li bir "get" operasyonu gibi. Sürpriz davranış.

## 12. Memory V2 Uyumu
- N/A.

## 13. i18n
- `formatRating`: "3.5/5" formatı — Dil bağımsız, sorun yok.

## 14. Dokümantasyon Tutarlılığı
- Header comment: ✓ "Local and remote skill rating system."
- Rating formülü JSDoc'ta dokümante edilmiş (satır 72-73) ✓
- Sabitler iyi adlandırılmış: SUCCESS_WEIGHT, COVERAGE_WEIGHT, FREQUENCY_WEIGHT.

## 15. Performance
- `calculateLocalRating` — Her çağrıda _readData + _writeData yapıyor (dosya I/O). Yoğun kullanımda performans sorunu olabilir.
- `_readData` — Her çağrıda dosya okuyor (cache yok). **P2.**

## 16. Öneriler
- **P1 (High):** DEAD CODE — Modül hiçbir yerden import edilmiyor.
- **P2 (Medium):** `calculateLocalRating` side-effect'li — dosyaya yazıyor. Saving ayrı bir method olmalı. İsim yanıltıcı.
- **P2 (Medium):** `_readData` cache'siz — her çağrıda disk I/O. In-memory cache eklenebilir.
- **P3 (Low):** Class ve interface JSDoc eksik.

## Verdict: ANALYZED
