# Analysis: src/orchestra/batch-stats.ts
**Task ID:** 141-002 | **LoC:** 140

## 1. Amaci (1-2 cumle)
Stats guncelleme islemlerini kuyruklayip tek I/O operasyonunda `.deckent/stats/` dizinine batch olarak yazar. Ayri ayri writeFileSync cagrilarini optimize ederek I/O overhead'i azaltir.

## 2. Public API (export listesi)
- `StatsUpdateType` type alias: `'agent' | 'skill' | 'sprint' | 'task'`
- `StatsUpdate` interface
- `FlushResult` interface
- `BatchStatsUpdater` class:
  - `queue(update: StatsUpdate): void`
  - `queueAll(updates: StatsUpdate[]): void`
  - `flush(): FlushResult`
  - `pending` getter
  - `clear(): void`
  - `getQueue(): StatsUpdate[]`

## 3. Ic + Dis Bagimliliklar
- **Icsel:** `node:fs`, `node:path`
- **Dissal:** `../core/utils.js` (debugLog)
- Hicbir diger orchestra modulu import etmiyor
- `.deckent/stats/{type}-{id}.json` dosyalarina yazar

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- 1 class, 6 public metot, 2 private metot
- `flush()`: for loop + try/catch + deep merge — orta karmasiklik
- `_groupUpdates()`: O(n) map grouping — basit
- `_mergeUpdates()`: shallow object merge — basit
- Toplam cyclomatic rough: ~8

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `data: Record<string, unknown>` — hafif any benzeri ama daha guvenlice tiplanmis
- `any` kullanimi: yok direkt
- `@ts-ignore`: yok
- Non-null assertion: yok
- Tip guvenligi iyi

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- ADR-006: spawnSync kullanimi yok — compliant
- ADR-008: sadece core/utils.js — compliant
- ADR-010: runtime dep yok — compliant
- Bu modul RBAC/memory V2 kapsam disinda

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/batch-stats.test.ts` beklenir
- Sinif tabanlari testleri kolaydir: queue → flush → disk kontrolu

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `getQueue()` metodu: ic queue kopya donduruyor — test'ler ve debugging icin kullanilabilir, production'da nadiren cagrilir
- `clear()` metodu: flush olmadan queue temizliyor — test cleanup icin kullanilir

## 10. Security Findings
- Dosya adi: `${type}-${id}.json` — type ve id degerlerinin guvenli olmayan karakterler icermesi durumunda path traversal olabilir
- Path sanitizasyon yok — `id` parametresinin `../` icermesi durumunda risk var
- Dusuk ciddiyet: bu modul sadece ic brain/auditor tarafindan cagrilir

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile iliskisi yok — stats dosyalari `.deckent/stats/` altinda
- MemoryStore bagimliligi yok
- V2 uyumlu (etkilenmez)

## 12. Oneriler (Sprint 142+ input)
- `id` parametresi icin path sanitizasyon ekleyin (replace ile guvenli karakter seti)
- `flush()` sonucunda hata varsa loglama daha ayrintili olabilir
- Stats dosyalari icin TTL/cleanup mekanizmasi eklenebilir

## 13. Verdict: ANALYZED
