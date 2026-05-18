# Analysis: src/cli/helpers/hints.ts
**Task ID:** 142-022 | **Model:** opus | **LoC:** 59 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Sprint fazına göre bağlamsal ipuçları üreten modül. COMPLETE, EXECUTE, PLAN ve IDLE fazları için kullanıcıya yönlendirici mesajlar döndürür. `getMessage()` fonksiyonu aracılığıyla i18n destekli (TR/EN). EXECUTE fazında ek bilgi ekler (çalışan görev sayısı, aktif sprint ID). CLI status ve dashboard çıktılarında kullanılır.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `function getContextualHints(phase: string, status?: object, lang?: string): string[]` — JSDoc: VAR ✓ (satır 7-10)
- Internal: `buildExecuteHints(status: object | undefined, lang: string): string[]` — JSDoc: YOK
- **KISMEN:** 1/1 public fonksiyonda JSDoc var.

## 3. İç Bağımlılıklar
- `import { getMessage } from './messages.js'` — i18n mesaj sistemi.
- Döngüsel bağımlılık: YOK.

## 4. Dış Bağımlılıklar
- Dış bağımlılık: YOK.
- ADR-010: UYUMLU ✓

## 5. Complexity
- Fonksiyon sayısı: 2
- Max cyclomatic: ~5 (getContextualHints — 4-case switch, buildExecuteHints — 2 typeof koşulu)
- En karmaşık: `buildExecuteHints()` (satır 34-58) — status nesne alan kontrolü

## 6. Type Safety
- `status?: object` parametresi (satır 11) — geniş tip ama kabul edilebilir (faz-agnostik API).
- `status as Record<string, unknown>` (satır 39) — **unsafe cast** ama typeof kontrolü ile korunan erişim (satır 40, 48).
- `any`: 0 | `@ts-ignore`: 0 | `@ts-expect-error`: 0 | Non-null `!`: 0
- **P3:** `object` tipi yerine `StatusInfo` interface tanımlanabilir.

## 7. ADR Compliance
- ADR-010: UYUMLU ✓
- ADR-032 (i18n): UYUMLU ✓ — `getMessage()` ile i18n desteği var.
- Memory V2: N/A.

## 8. Test Coverage
- Test dosyası: `tests/cli/hints.test.ts` — MEVCUT ✓
- **UYARI:** Test dosyası `tests/cli/hints.test.ts` (eski konum) — `tests/cli/helpers/hints.test.ts` olmalı. Yanlış dizinde.

## 9. TODO/FIXME/HACK inventory
- Hiçbiri bulunamadı. ✓ Temiz.

## 10. Dead Code
- Tüm fonksiyonlar kullanılıyor.
- Default case `return []` — bilinmeyen faz için boş array. Kullanılması mümkün ama edge case ✓

## 11. Security
- Güvenlik riski: DÜŞÜK.
- `String(s['taskCount'])` (satır 43) — XSS riski yok (CLI çıktı).
- `s['sprintId']` (satır 49) — doğrudan string, injection riski yok.

## 12. Memory V2 Uyumu
- Memory erişimi yok. N/A. ✓

## 13. i18n
- **İYİ:** `getMessage()` kullanılıyor — TR/EN desteği var ✓
- Default lang = 'en' — config'den alınmıyor. Çağıran taraf dil bilgisi geçirmeli.
- `status.tasks_running` ve `status.sprint_active` — mesaj anahtarları `messages.ts`'de tanımlı.
- **UYUMLU** ADR-032 ile.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: 1/1 public ✓
- Faz isimleri büyük harf (COMPLETE, EXECUTE, PLAN, IDLE) — normalizePhase ile eşleştirme ✓

## 15. Performance
- Sync I/O: 0 ✓
- Hafif string operasyonları.
- `toUpperCase()` her çağrıda — minimal overhead.

## 16. Öneriler (severity P0-P3)
- **P2:** `object` → `StatusInfo` interface tanımla (taskCount?: number, sprintId?: string).
- **P2:** Test dosyası yanlış dizinde: `tests/cli/hints.test.ts` → `tests/cli/helpers/hints.test.ts` taşınmalı.
- **P3:** EVALUATE, FIX, RETRO, DECAY, CLEANUP fazları için hint'ler yok — eksik kapsam.
- **P3:** `buildExecuteHints` private olarak işaretlenmemiş ama export da edilmemiş — module-scoped ✓

## Verdict: ANALYZED
