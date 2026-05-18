# Analysis: src/cli/helpers/error-handler.ts
**Task ID:** 142-022 | **Model:** opus | **LoC:** 85 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
CLI hata yakalama ve formatlama modülü. `DeckentError` (yapısal hata: whatHappened, why, howToFix) ve genel `Error` nesnelerini kullanıcı dostu formata dönüştürür. ANSI renk kodları ile renkli çıktı üretir, `noColor` seçeneğiyle düz metin modu destekler. `verbose` modda stack trace ekler. Tüm CLI komutlarının hata yakalama katmanında kullanılır. GitHub issue URL'si ile hata raporlama yönlendirmesi yapar.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `interface ErrorHandlerOpts { verbose?: boolean; noColor?: boolean }` — JSDoc: YOK
- `function handleError(error: unknown, opts?: ErrorHandlerOpts): void` — JSDoc: VAR ✓ (satır 11-15)
- Internal: `handleDeckentError(error: DeckentError, opts?)` — JSDoc: YOK
- Internal: `handleGenericError(error: Error, opts?)` — JSDoc: YOK
- Internal: `colorizeHumanError(text: string): string` — JSDoc: VAR ✓ (satır 74-76)

## 3. İç Bağımlılıklar
- `import { DeckentError, formatHumanError } from '../../core/errors.js'` — hata sınıfı ve formatlayıcı.
- Döngüsel bağımlılık: YOK — tek yönlü core→cli akışı.

## 4. Dış Bağımlılıklar
- Dış bağımlılık: YOK (process.stderr native).
- ADR-010: UYUMLU ✓

## 5. Complexity
- Fonksiyon sayısı: 4
- Max cyclomatic: ~6 (handleDeckentError — satır 26-62, çoklu if dallanmaları)
- En karmaşık: `handleDeckentError()` — whatHappened var/yok dallanması + noColor/color dallanması + suggestion/docLink opsiyonel alanlar

## 6. Type Safety
- `error: unknown` (satır 16) — **MÜKEMMEL** — catch parametresi doğru tiplenmiş.
- `instanceof` kontrolü ile narrowing (satır 17-23) — type guard pattern ✓
- `any`: 0 | `@ts-ignore`: 0 | `@ts-expect-error`: 0 | `as unknown`: 0 | Non-null `!`: 0

## 7. ADR Compliance
- ADR-010: UYUMLU ✓
- ADR-008: UYUMLU ✓ — brain import etmiyor.
- Memory V2: N/A.
- DeckentError dual hierarchy (code + whatHappened/why/howToFix) — **İYİ** tasarım.

## 8. Test Coverage
- Test dosyaları: 
  - `tests/cli/helpers/error-handler.test.ts` — MEVCUT ✓
  - `tests/cli/error-handler.test.ts` — İKİNCİ test dosyası (eski konum?) ✓
- **UYARI:** İki test dosyası var — biri eski biri yeni. Orphan test riski.

## 9. TODO/FIXME/HACK inventory
- Hiçbiri bulunamadı. ✓ Temiz.

## 10. Dead Code
- `colorizeHumanError` private — sadece `handleDeckentError` içinden çağrılır. Export edilmiyor ✓
- Dead code yok.

## 11. Security
- **P3:** GitHub URL hardcoded: `'Report: https://github.com/VerhexIO/deckent/issues\n'` (satır 68) — public repo URL, güvenlik riski yok ama repo adı değişirse güncellenmeli.
- ANSI escape kod injection riski: `error.message` doğrudan stderr'a yazılıyor — eğer mesaj ANSI kodları içerirse terminal davranışı etkilenebilir. Düşük risk — internal hatalar.

## 12. Memory V2 Uyumu
- Memory erişimi yok. N/A. ✓

## 13. i18n
- Hardcoded EN string'ler: "Error:" (satır 22, 66), "Report:" (satır 68), "Suggestion:" (satır 44-48), "Docs:" (satır 53-57).
- Locale-aware: HAYIR.
- **P2 SORUN:** Hata mesajları İngilizce sabit kodlanmış. TR çevirisi yok.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: 2/4 fonksiyonda (handleError + colorizeHumanError) — kısmi.
- `ErrorHandlerOpts` interface JSDoc'suz.

## 15. Performance
- Sync I/O: 0 ✓ (process.stderr.write senkron ama hafif).
- Regex (satır 78-83) — 5 replace çağrısı. Hata durumunda çağrılır, hot path değil.

## 16. Öneriler (severity P0-P3)
- **P2:** i18n — hata mesajları çevrilebilir olmalı.
- **P2:** İki test dosyası (tests/cli/error-handler.test.ts vs tests/cli/helpers/error-handler.test.ts) — birini kaldır veya birleştir.
- **P3:** `handleDeckentError` içinde tekrarlayan `if (opts?.noColor)` dallanmaları — helper fonksiyon ile sadeleştirilebilir (ör. `writeLine(text, color?, opts?)`).
- **P3:** GitHub URL'yi constant'a taşı.

## Verdict: ANALYZED
