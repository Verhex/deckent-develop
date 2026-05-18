# Analysis: src/core/agent-cache.ts
**Task ID:** 142-003 | **Model:** opus | **LoC:** 172 | **Effort:** max

## 1. Amaci
AgentSelectionCache, agent secim sonuclarini bellekte onbellekleyen LRU cache moduludur. Task signature'indan deterministik hash uretir, secim sonuclarini TTL ile saklar, kapasite dolunca en eski entry'yi cikarir. Pure logic — dosya sistemi erisimi yok. Agent-selector.ts ciktilarini onbellekleyerek tekrarlanan task'lar icin routing performansini arttirir.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `TaskSignatureInput` | `interface { title, description, scope, taskType? }` | YOK (interface — self-documenting) |
| `CachedResult` | `interface { agentId, score, reason }` | YOK |
| `AgentSelectionCache` | `class` | JSDoc per-method VAR |
| `.taskSignature()` | `(task: TaskSignatureInput) => string` | VAR |
| `.cache()` | `(signature, result, ttl?) => void` | VAR |
| `.get()` | `(signature) => CachedResult \| undefined` | VAR |
| `.invalidate()` | `(agentId: string) => number` | VAR |
| `.clear()` | `() => void` | VAR |
| `.size` | `get: number` | VAR |
| `.has()` | `(signature) => boolean` | VAR |
| `.keys()` | `() => string[]` | VAR |

## 3. Ic Bagimliliklar
- **HIC YOK** — Sifir import. Pure self-contained modul.
- Dongusel bagimllik riski: IMKANSIZ.

## 4. Dis Bagimliliklar
- **HIC YOK** — Ne node: modulleri ne npm paketleri.
- ADR-010 uyumu: UYUMLU (bos bagimllik agaci).

## 5. Complexity
- Fonksiyon sayisi: 10 (8 public + 2 private)
- En karmasik fonksiyon: `_evictLru()` (satir 147-161) — Map uzerinde linear scan.
- Max cyclomatic rough: ~3 (basit)
- Toplam karmasiklik: **DUSUK** — temiz, anlasilir modul.

## 6. Type Safety
- **any kullanimi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown: 0**
- **non-null !: 0**
- **unsafe cast: 0**
- **MUKEMMEL** type safety. Tum tipler acikca tanimli, generic yok, union yok.

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 | N/A | spawn kullanmiyor |
| ADR-008 | UYUMLU | core/ icinde, brain/orchestra import yok |
| ADR-010 | UYUMLU | Sifir dis bagimllik |
| ADR-033 | UYUMLU | Dis iletisim yok |
| Memory V2 | N/A | Memory ile ilgisi yok |

## 8. Test Coverage
- Test dosyasi: `tests/core/agent-cache.test.ts` — MEVCUT
- Beklenen testler: taskSignature determinism, cache hit/miss, TTL expiry, LRU eviction, invalidate by agent, clear
- Memory V2 mock: N/A

## 9. TODO/FIXME/HACK Inventory
**HIC YOK** — temiz.

## 10. Dead Code
- Tum export'lar kullaniliyor (routing-engine.ts ve task-router.ts tarafindan).
- `_purgeExpired()` sadece `keys()` tarafindan cagirilir — ancak `keys()` aktif kullaniliyorsa dead code degil.
- **Potansiyel olarak dusuk kullanim**: `has()` methodu get() wrapper'i — kullanilip kullanilmadigi kontrol edilmeli.

## 11. Security
- **Hash collision**: `_simpleHash()` (satir 138-145) 32-bit hash kullanir (djb2 benzeri). Collision olasiligi yuksek degil ama kripografik degil.
  - **Severity: P3** — Cache icin yeterli, guvenlik-kritik degil. Yanlis cache hit en kotu ihtimalle yanlis agent secimi demek, rollback sonrasi anlasilir.
- Dis input: Sadece task title/description — injection riski yok (hash'e donusturuluyor).

## 12. Memory V2 Uyumu
- Bu modul Memory V2 ile **tamamen ilgisiz**. Pure in-memory cache, hicbir .brain/ dosyasina dokunmuyor.
- **UYUMLU** — scope disinda.

## 13. i18n
- Hardcoded string: Yok (cache key uretimi icin sadece hash var)
- turkishNormalize: Kullanmiyor — **dikkat noktasi**: eger task title turkce ise, lowercase() yeterli mi? turkishNormalize kullanilmazsa "I" harfi farklilik yaratabilir.
  - **Severity: P3** — `taskSignature()` satir 46-47'de `toLowerCase()` kullaniyor. Turkce "I"→"i" donusumu Node.js locale-dependent olabilir, ama pratikte agent selection icin minimal etki.

## 14. Dokumantasyon Tutarliligi
- JSDoc: Her public method icin mevcut. **IYI.**
- `MAX_ENTRIES = 100` ve `DEFAULT_TTL_MS = 5 * 60 * 1000`: Hicbir yerde dokumante edilmemis ama internal constant olarak kabul edilebilir.

## 15. Performance
- **Sync I/O: 0** — Pure in-memory, disk erisimi yok.
- `_evictLru()`: O(N) linear scan (N = max 100). Ihmal edilebilir.
- `invalidate()`: O(N) — tum cache'i tarar. N=100 icin sorun degil.
- `_purgeExpired()`: O(N) — tum cache'i tarar. Sadece `keys()` cagirildiginda calisir.
- **PERFORMANS SORUNU YOK.**

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P3** | `taskSignature()` icinde `toLowerCase()` yerine `turkishNormalize()` dusunulebilir, ancak agent selection icin pratik etkisi minimal. |
| **P3** | `_simpleHash()` 32-bit — collision monitoring eklenebilir ama sprint-scoped cache oldugu icin dusuk oncelik. |

## Verdict: ANALYZED
