# Analysis: src/orchestra/batch-stats.ts
**Task ID:** 142-014 | **Model:** opus | **LoC:** 141 | **Effort:** max

## 1. Amaci (detayli)
Batch istatistik guncelleme modulu. Agent, skill, sprint ve task istatistiklerini queue'ya alir, tek seferde disk'e flush eder. `.deckent/stats/` altina JSON dosyalari olarak yazar. I/O operasyonlarini birlestirerek performans iyilestirmesi saglar. Sprint lifecycle'da evaluation sonrasi agent/skill stats guncellemesi icin tasarlanmis.

## 2. Public API
- `BatchStatsUpdater` class:
  - `constructor(projectRoot)` — Instance olusturur.
  - `queue(update)`: void — Tekil guncelleme queue'ya ekler.
  - `queueAll(updates)`: void — Birden fazla guncelleme ekler.
  - `flush()`: FlushResult — Tum queue'yu disk'e yazar.
  - `get pending`: number — Queue uzunlugu.
  - `clear()`: void — Queue'yu bosaltir.
  - `getQueue()`: StatsUpdate[] — Queue kopyasi dondurur.
- Type exports: `StatsUpdateType`, `StatsUpdate`, `FlushResult`.
**JSDoc durumu: TAMAM — tum public method'lar ve type'lar belgelenmis.**

## 3. Ic Bagimliliklar
- `../core/utils.js` (debugLog)
**Dongusel bagimllik riski: YOK.**

## 4. Dis Bagimliliklar
- `node:fs` (namespace import: `import * as fs`)
- `node:path` (namespace import: `import * as path`)
**ADR-010 uyumu: TAMAM.**
**NOT:** Namespace import (`import * as fs`) diger modullerin named import stilinden farkli — tutarsizlik ama fonksiyonel sorun yok.

## 5. Complexity
- **Method sayisi:** 7 public + 2 private (_groupUpdates, _mergeUpdates)
- **En karmasik method:** `flush()` (satir 54-93) — group + merge + read-modify-write loop. Cyclomatic ~5.
- **Genel:** DUSUK karmasiklik. Basit queue + flush pattern.

## 6. Type Safety
- **any sayisi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown: 0**
- **non-null !: 0**
- **Genel:** Mukemmel type safety.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Kullanilmiyor. TAMAM.
- **ADR-008 (brain import):** Brain'den import almaz. TAMAM.
- **ADR-010 (deps):** Sadece Node.js built-in. TAMAM.
- **ADR-038 (dead code):** **POTANSIYEL DEAD CODE ADAYI.** Bu modulu kim kullaniyor? Arastirma gerekiyor.
- **Memory V2 DB-first:** Stats verileri `.deckent/stats/` altina JSON olarak yaziliyor — bu DB'ye tasanmali mi? Soru: agent/skill stats DB'de mi tutulmali? Mevcut durumda agent-pool ve skill-pool kendi stats'larini JSON manifest'lerinde tutuyor. BatchStatsUpdater muhtemelen alternatif/ek bir mekanizma. **UYUMLU ama redundant olabilir.**

## 8. Test Coverage
- **Test dosyasi:** `tests/orchestra/batch-stats.test.ts` MEVCUT.
- **Beklenen testler:** queue, queueAll, flush (empty, single, grouped), pending, clear, getQueue, error handling.
- **Genel:** Test mevcut.

## 9. TODO/FIXME/HACK Inventory
**YOK** — Temiz.

## 10. Dead Code
- **KRITIK SORU:** Bu modul ne tarafindan kullaniliyor? Import taramasi gerekli.
- **ADR-038 dead code adayi** olarak isaretlenmis (DIRECTIVES'te belirtilmis).
- **Potansiyel dead code:** Eger hicbir modul `BatchStatsUpdater` import etmiyorsa, bu modul tamamen kullanilmiyor olabilir.
- **_mergeUpdates:** Shallow merge (`{ ...merged, ...update.data }`) — deep merge degil. Eger update'lar nested object iceriyorsa veri kaybi olabilir. **TASARIM EKSIKLIGI.**

## 11. Security
- **Dosya yazma:** `.deckent/stats/` altina — kullanici girdisi ile path olusturmuyor (type+id key kullaniliyor). Risk: DUSUK.
- **JSON.parse:** Mevcut stats dosyasi okuyor (satir 75) — hata durumunda sessizce bos obje kullanir. Risk: COK DUSUK.
- **Genel risk: COK DUSUK.**

## 12. Memory V2 Uyumu
- Bu modul `.deckent/stats/` JSON dosyalari kullaniyor — Memory V2 DB'si ile entegre degil.
- **UYUMLU ama redundant:** Agent/skill stats zaten pool manager'larin JSON manifest'lerinde tutuluyor. Bu modul ek bir katman.

## 13. i18n
- Kullanici-facing mesaj yok — ic mekanizma.
- i18n uygulanabilir degil.

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: UYUMLU.
- `_mergeUpdates` shallow merge oldugu belgelenmemis — deep merge beklentisi yaniltici olabilir.

## 15. Performance
- **Sync I/O sayisi:** fs.mkdirSync (1), fs.existsSync (1), fs.readFileSync (1), fs.writeFileSync (1) = **per-group 4 sync I/O, toplam N gruplari kadar.**
- **Hot path mi?:** HAYIR — sprint evaluation sonrasinda tek seferlik.
- **Batch advantage:** Queue → single flush — iyi I/O pattern.
- **Performans sorunu YOK.**

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P1** | ADR-038: Bu modulu kim import ediyor? Kullanilmiyorsa dead code olarak kaldir. Kullaniliyorsa referanslari belgele |
| **P2** | _mergeUpdates: Shallow merge → deep merge (lodash-free) degistirilmeli veya API dokumaninda belirtilmeli |
| **P2** | `import * as fs` → named import stiline cevrilmeli (codebase tutarliligi) |
| **P3** | Stats verisi Memory V2 DB'ye tasanabilir (redundancy azaltma) |

## Verdict: ANALYZED
