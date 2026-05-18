# Analysis: src/core/system-profile.ts
**Task ID:** 142-007 | **Model:** opus | **LoC:** 30 | **Effort:** max

## 1. Amacı
Sistem kaynaklarını (CPU çekirdek sayısı, toplam/boş RAM) sorgulayarak önerilen maksimum worker sayısını hesaplar. Brain'in sprint başlangıcında kaç paralel worker başlatacağını belirlemek için kullanılır. `getSystemProfile()` fonksiyonu `SystemProfile` tipini döner.

## 2. Public API
- `calcRecommendedMaxWorkers(freeMemMB: number, cpuCores: number): number` — JSDoc VAR ✓ Formül dokümante edilmiş.
- `getSystemProfile(): SystemProfile` — JSDoc VAR ✓

Her iki export'un da JSDoc'u mevcut ve açıklayıcı.

## 3. İç Bağımlılıklar
- `import type { SystemProfile } from './types.js'` — Tek bağımlılık, salt tip.
- Döngüsel bağımlılık riski: YOK.

## 4. Dış Bağımlılıklar
- `node:os` — Node.js built-in. ADR-010 uyumlu (sadece built-in).
- Üçüncü parti bağımlılık: YOK ✓

## 5. Complexity
- 2 fonksiyon. Cyclomatic complexity: 1 (her ikisi de düz hesaplama).
- En karmaşık fonksiyon: `getSystemProfile` — 4 basit atama + return. Çok basit.

## 6. Type Safety
- `any` kullanımı: 0 ✓
- `@ts-ignore`: 0 ✓
- `@ts-expect-error`: 0 ✓
- `as unknown`: 0 ✓
- Non-null `!`: 0 ✓
- Unsafe cast: 0 ✓
- Mükemmel type safety. Tüm değerler number tipinde, cast yok.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — spawnSync kullanmıyor.
- **ADR-008 (brain import):** ✓ — Yalnızca core/types'dan import, brain'e bağımlılık yok.
- **ADR-010 (tek dependency):** ✓ — Sadece node:os built-in kullanıyor.
- **ADR-033 (product vision):** ✓ — Telemetri/veri gönderimi yok.
- **ADR-037 (RBAC):** N/A.
- **ADR-039 (self-modifying):** N/A.
- **Memory V2 DB-first:** N/A — Memory ile etkileşimi yok.

## 8. Test Coverage
- Test dosyası: `tests/core/system-profile.test.ts` ✓ MEVCUT
- Eşleşme: src/core/system-profile.ts → tests/core/system-profile.test.ts ✓
- Fonksiyonların test edilmesi beklenir: calcRecommendedMaxWorkers (boundary cases: 0 CPU, 0 mem, large values), getSystemProfile (gerçek os değerleri).

## 9. TODO/FIXME/HACK Inventory
- NONE ✓ — Temiz.

## 10. Dead Code
- Tüm export'lar aktif kullanımda:
  - `getSystemProfile`: 6 import (doctor.ts, onboard.ts, init.ts, sprint-utils.ts, sprint-spawner.ts, mcp/doctor.ts)
  - `calcRecommendedMaxWorkers`: getSystemProfile tarafından kullanılıyor
- Dead code: YOK ✓

## 11. Security
- Input validation: Fonksiyonlar direkt node:os'tan gelen değerleri kullanıyor.
- Injection riski: YOK — dış giriş yok.
- Secret exposure: YOK.
- OWASP: N/A — no user input, no network, no file write.

## 12. Memory V2 Uyumu
- N/A — Bu modül hafıza sistemiyle etkileşimde bulunmuyor. DB-first geçişten etkilenmemiş.

## 13. i18n
- Hardcoded string: YOK — Bu modül kullanıcıya yönelik metin üretmiyor.
- turkishNormalize: N/A.

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✓ UYUMLU. Formül dokümentasyonu (max(1, min(floor(freeMemMB / 400), cpuCores - 1, 30))) kodla eşleşiyor.
- .md referans: N/A.

## 15. Performance
- Sync I/O: 0 ✓ — Sadece os.cpus(), os.totalmem(), os.freemem() (memory-mapped, hızlı).
- Hot path: Hayır — Sprint başlangıcında bir kez çağrılır.
- Gereksiz disk okuma/yazma: YOK.

## 16. Öneriler
- **P3 (Low):** `calcRecommendedMaxWorkers`'ın 30 üst sınırı hardcoded. Config'den okunabilir ama mevcut hali yeterli.
- **Genel:** Bu dosya örnek seviyede temiz ve iyi yapılandırılmış. Değişiklik gerekmez.

## Verdict: ANALYZED
