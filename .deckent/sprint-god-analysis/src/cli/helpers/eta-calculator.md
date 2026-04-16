# Analysis: src/cli/helpers/eta-calculator.ts
**Task ID:** 142-022 | **Model:** opus | **LoC:** 62 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Sprint görev tamamlanma tahmini hesaplayan sınıf. Tamamlanan görev sayısı, toplam görev, geçen süre ve görev sürelerini girdi olarak alır. İki strateji kullanır: (1) son görevlere ağırlık veren weighted average, (2) doğrusal tahmin. ETA'yı milisaniye ve insan-okunur format (~Xm Ys) olarak döndürür. `deckent status --watch` modunda canlı ETA göstermek için kullanılır.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `class ETACalculator` — 3 metot:
  - `calculateETA(completed: number, total: number, elapsedMs: number, taskDurations?: number[]): number` — JSDoc: YOK
  - `formatETA(etaMs: number): string` — JSDoc: YOK
  - `private weightedAverage(durations: number[]): number` — JSDoc: YOK (private)
- **EKSIK:** Hiçbir metotta JSDoc yok.

## 3. İç Bağımlılıklar
- İç import: YOK — tamamen bağımsız.
- Döngüsel bağımlılık: YOK.

## 4. Dış Bağımlılıklar
- Dış bağımlılık: YOK.
- ADR-010: UYUMLU ✓

## 5. Complexity
- Fonksiyon sayısı: 3
- Max cyclomatic: ~5 (calculateETA — 4 return dalı)
- En karmaşık: `calculateETA()` (satır 4-27) — çoklu erken dönüş

## 6. Type Safety
- `durations[0] ?? 0` (satır 48), `durations[i] ?? 0` (satır 56), `lines[i]?.length ?? 0` — nullish coalescing ile güvenli erişim ✓
- `any`: 0 | `@ts-ignore`: 0 | `@ts-expect-error`: 0 | `as unknown`: 0 | Non-null `!`: 0
- **MÜKEMMEL** type safety.

## 7. ADR Compliance
- ADR-010: UYUMLU ✓
- Diğerleri: N/A — izole matematik sınıfı.

## 8. Test Coverage
- Test dosyası: `tests/cli/helpers/eta-calculator.test.ts` — MEVCUT ✓

## 9. TODO/FIXME/HACK inventory
- Hiçbiri bulunamadı. ✓ Temiz.

## 10. Dead Code
- Tüm metotlar kullanılıyor (calculateETA → public, formatETA → public, weightedAverage → private internal).
- Dead code yok ✓

## 11. Security
- Güvenlik riski: SIFIR — saf matematik hesaplaması.
- Input validation: `remaining <= 0` ve `completed === 0` kontrolleri var ✓
- Division by zero: `totalWeight` her zaman ≥1 (for döngüsü en az 1 kez çalışır), `completed > 0` kontrolü var (satır 21).

## 12. Memory V2 Uyumu
- Memory erişimi yok. N/A. ✓

## 13. i18n
- Hardcoded: "calculating..." (satır 30) — İngilizce.
- Format string'leri: "~0s", "~Xm", "~Xm Ys" — teknik format, i18n gereksiz.
- **P3:** "calculating..." çevrilebilir.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: 0/2 public metot — **EKSIK**.
- Modül başlık yorumu var (satır 1).

## 15. Performance
- Sync I/O: 0 ✓
- Saf CPU hesaplama — son derece hızlı.
- `weightedAverage` O(n) — küçük n (görev sayısı) ile çalışır.

## 16. Öneriler (severity P0-P3)
- **P3:** JSDoc ekle — özellikle `calculateETA` dönüş değeri semantiği (-1 = veri yok, 0 = tamamlandı).
- **P3:** "calculating..." string'ini i18n ile çevir.
- **P3:** `weightedAverage` ağırlık stratejisi (son 3 görev 2x) hardcoded — configurable olabilir ama over-engineering riski.
- **P3:** `calculateETA` parametreleri çok — options object pattern düşünülebilir ama 4 parametre sınırda.

## Verdict: ANALYZED
