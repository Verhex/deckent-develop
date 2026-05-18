# Analysis: src/orchestra/sprint-pid-manager.ts
**Task ID:** 142-014 | **Model:** opus | **LoC:** 259 | **Effort:** max

## 1. Amaci (detayli)
Sprint koordinator PID yonetimi ve orphan sprint tespiti. Coordinator resilience (Sprint 135) kapsaminda eklenmis. PID dosyasi yazma/okuma, atomik write (temp+rename), state snapshot persistence, orphan detection (process.kill(pid, 0) ESRCH/EPERM), arsivleme islevleri saglar. Coordinator process beklenmedik olurse sprint durumunu kurtarabilir. Doctor komutu tarafindan orphan tespiti icin kullanilir.

## 2. Public API
- `writePid(root, sprintId)`: void — PID dosyasi yazar, collision detection iceren. JSDoc VAR.
- `readPid(root, sprintId)`: number | null — PID dosyasini okur. JSDoc VAR.
- `clearPid(root, sprintId)`: void — PID dosyasini temizler. JSDoc VAR.
- `writeStateSnapshot(root, sprintId, snap)`: void — State snapshot atomik yazar. JSDoc VAR.
- `readStateSnapshot(root, sprintId)`: SprintStateSnapshot | null — State snapshot okur. JSDoc VAR.
- `isProcessAlive(pid)`: boolean — Process canli mi kontrol eder. JSDoc VAR.
- `detectOrphan(root, sprintId)`: OrphanInfo | null — Orphan sprint tespit eder. JSDoc VAR.
- `archiveOrphan(root, orphan)`: void — Orphan dosyalarini arsivler. JSDoc VAR.
- `listPidFiles(root)`: string[] — PID dosyalarini listeler. JSDoc VAR.
- Interface exports: `SprintStateSnapshot`, `OrphanInfo`.
**JSDoc durumu: TAMAM — tum 9 fonksiyon ve 2 interface belgelenmis.**

## 3. Ic Bagimliliklar
- `../core/constants.js` (DECKENT_DIR, BRAIN_DIR)
- `../core/errors.js` (ErrorRegistry)
**Dongusel bagimllik riski: YOK. Minimal import chain.**

## 4. Dis Bagimliliklar
- `node:fs` (writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, renameSync, readdirSync)
- `node:path` (join, dirname)
**ADR-010 uyumu: TAMAM.**

## 5. Complexity
- **Fonksiyon sayisi:** 9 public + 3 private (pidFilePath, snapshotFilePath, atomicWriteSync)
- **En karmasik fonksiyon:** `archiveOrphan` (satir 206-242) — 3 dosya kopyalama + silme islemleri. Cyclomatic ~4.
- **Ikinci:** `writePid` (satir 63-82) — collision detection + atomic write. Cyclomatic ~3.
- **Genel:** DUSUK karmasiklik. Her fonksiyon odakli ve kisa.

## 6. Type Safety
- **any sayisi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown:** Satir 161: `err as NodeJS.ErrnoException` — catch block icinde standard pattern. Guvenli.
- **non-null !: 0**
- **Genel:** Cok iyi type safety.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Kullanilmiyor. TAMAM.
- **ADR-008 (brain import):** Brain'den import almaz, brain/doctor tarafindan cagirilir. TAMAM.
- **ADR-010 (deps):** Sadece Node.js built-in. TAMAM.
- **Memory V2 DB-first:** Bu modul PID/state yonetimi yapar, memory ile ilgisiz. UYUMLU.

## 8. Test Coverage
- **Test dosyasi:** `tests/orchestra/sprint-pid-manager.test.ts` MEVCUT.
- **Beklenen test'ler:** writePid, readPid, clearPid, isProcessAlive, detectOrphan, archiveOrphan, collision detection.
- **Genel:** Test mevcut, iyi coverage beklentisi.

## 9. TODO/FIXME/HACK Inventory
**YOK** — Temiz.

## 10. Dead Code
- **archiveOrphan:** sprint-state.json dosyasini da tasir (satir 234-241) — bu dosya her sprint icin mevcut olmayabilir ama defensive coding.
- **Dead code YOK.**

## 11. Security
- **process.kill(pid, 0):** POSIX kill(0) sinyal gonderme — sadece process varlik kontrolu. Guvenli.
- **Collision detection:** Mevcut PID dosyasi varsa canlilik kontrolu yapar — race condition riski: 2 coordinator ayni anda baslarsa TOCTOU (time-of-check-to-time-of-use). **Risk: DUSUK** cunku PID dosyasi `.deckent/pids/` altinda ve tipik kullanim tek koordinator.
- **atomicWriteSync:** temp dosya + rename — iyi pratik, partial write'a karsi koruma. TAMAM.
- **Dosya silme:** unlinkSync kullaniliyor — orphan cleanup icin uygun.

## 12. Memory V2 Uyumu
- Bu modul Memory V2 ile ilgisiz — PID/state yonetimi yapar.
- **UYUMLU.**

## 13. i18n
- Error mesaji (satir 71): Ingilizce hardcoded. Kullanici-facing olabilir (ErrorRegistry araciligiyla).
- debugLog mesajlari Ingilizce — ic kullanim.
- **i18n gap: MINOR** (error mesaji cevirilmemis).

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: UYUMLU.
- isProcessAlive JSDoc POSIX davranisini dogru acikliyor (ESRCH, EPERM).
- SprintStateSnapshot interface field'lari anlamli isimlendirilmis.

## 15. Performance
- **Sync I/O sayisi:** writeFileSync (3), readFileSync (4), existsSync (6), unlinkSync (3), mkdirSync (2), renameSync (1), readdirSync (1) = **TOPLAM 20 sync I/O.**
- **Hot path mi?:** HAYIR — coordinator baslatma/kapatma ve doctor icinde.
- **atomicWriteSync:** temp dosya + rename = 2 islem ama atomiklik icin zorunlu.
- **Performans sorunu YOK.**

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P3** | writePid TOCTOU race condition — flock/advisory lock kullanilabilir (mevcut durumda pratik risk cok dusuk) |
| **P3** | archiveOrphan: timestamp format (replace /[:.]/g) daha standart hale getirilebilir |
| **P3** | Error mesaji (DECKENT_E055) i18n-ready yapilabilir |

## Verdict: ANALYZED
