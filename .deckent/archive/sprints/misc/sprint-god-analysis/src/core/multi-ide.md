# Analysis: src/core/multi-ide.ts
**Task ID:** 142-006 | **Model:** opus | **LoC:** 181 | **Effort:** max

## 1. Amaç (detaylı)
Çoklu IDE/process ortamında eşzamanlı sprint çalıştırılmasını engelleyen dosya tabanlı PID kilit mekanizması. `.deckent/sprint.lock` dosyasına PID, ortam bilgisi ve timestamp yazar. Stale lock'ları (ölü PID) otomatik temizler. Claude Code, Cursor, VS Code gibi farklı IDE'lerden aynı anda sprint başlatmayı önler.

## 2. Public API
- `SprintLockInfo` interface — Kilit durumu bilgisi. JSDoc ✅
- `acquireSprintLock(projectRoot, sprintId, env?): boolean` — Kilit al, stale lock temizle. JSDoc ✅
- `isSprintLocked(projectRoot): SprintLockInfo` — Kilit durumunu sorgula. JSDoc ✅
- `releaseSprintLock(projectRoot): void` — Sadece kendi PID'in kilidi ise serbest bırak. JSDoc ✅

## 3. İç Bağımlılıklar
- `./environment.js` → `detectEnvironment` (IDE tespiti)
- `./utils.js` → `debugLog`
- **Döngüsel bağımlılık riski:** Yok. Yalnızca leaf utility modüllerini import eder.

## 4. Dış Bağımlılıklar
- `node:fs` → existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync
- `node:path` → join
- ADR-010: ✅ — Yalnızca Node.js built-in modülleri

## 5. Complexity
- Fonksiyon sayısı: 5 (3 public + 2 private)
- Max cyclomatic complexity: ~5 (`acquireSprintLock` — nested try/catch + if)
- En karmaşık fonksiyon: `acquireSprintLock` (satır 74) — lock dosya okuma, PID canlılık kontrolü, stale temizlik, yazma

## 6. Type Safety
- `any` sayısı: **0** ✅
- `@ts-ignore`: **0** ✅
- `@ts-expect-error`: **0** ✅
- Non-null `!`: **0** ✅
- Unsafe cast: `JSON.parse(raw) as LockFileData` (satır 87, 132, 170) — Schema validation yok ama dosya kendi modülü tarafından yazılıyor, risk düşük.

## 7. ADR Compliance
- ADR-006 (spawnSync): N/A — spawnSync kullanmıyor ✅
- ADR-008 (brain import): ✅ — Brain'den import yok
- ADR-010: ✅ — Sadece Node.js built-in
- ADR-033: ✅ — Yerel dosya kilidi, ağ çağrısı yok
- ADR-034 (multi-project): ✅ — projectRoot parametresi ile izolasyon
- ADR-037: N/A
- Memory V2: N/A

## 8. Test Coverage
- Test dosyası: `tests/core/multi-ide.test.ts` ✅
- Beklenen test senaryoları: acquire/release döngüsü, stale lock temizleme, concurrent process simulasyonu, corrupt lock dosyası

## 9. TODO/FIXME/HACK Inventory
- **Hiç yok.** ✅

## 10. Dead Code
- Unused export: Yok. `acquireSprintLock`, `isSprintLocked`, `releaseSprintLock` sprint lifecycle'da kullanılıyor.
- Barrel export: index.ts'de **listelenmemiş** — doğrudan import ediliyor.

## 11. Security
- **TOCTOU Race Condition (P2):** `existsSync` + `readFileSync` + `writeFileSync` arasında race condition var. İki process aynı anda acquireSprintLock çağırırsa, ikisi de lock dosyasını "yok" olarak görebilir ve ikisi de yazabilir. Ancak PID tabanlı kontrol sonraki çağrılarda bunu yakalayacaktır.
- `process.kill(pid, 0)` kullanımı: Unix/Linux'ta güvenli — yalnızca process varlığını kontrol eder, sinyal göndermez.
- Secret exposure: Yok.
- Path traversal: `projectRoot` dışarıdan gelir — `lockPath` join kullanıyor ama path traversal koruması yok. Ancak bu internal API, kullanıcı girişi değil.

## 12. Memory V2 Uyumu
- Bu modül Memory V2 ile doğrudan etkileşimi yok. N/A. ✅

## 13. i18n
- Hardcoded string: Yok — hata mesajları yok, log debugLog üzerinden.
- turkishNormalize: N/A

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✅ Tam uyumlu.
- Modül açıklaması (satır 1-6) doğru.
- `isPidAlive` JDoc `process.kill(pid, 0)` mekanizmasını doğru açıklıyor.

## 15. Performance
- Sync I/O sayısı: 8 (existsSync ×4, readFileSync ×3, writeFileSync ×1)
- Hot path: Hayır — sprint başlangıcında bir kez çağrılır.
- Gereksiz disk I/O: Hayır — minimum gerekli I/O.

## 16. Öneriler
- **P2 — TOCTOU:** `acquireSprintLock` atomik dosya yazma kullanmıyor. İki process aynı ms'de çağırırsa race condition oluşabilir. `writeFileSync` + `O_EXCL` flag (exclusive create) veya rename atomicity pattern önerilebilir. Sprint 142+ düşünülebilir.
- **P3 — LockFileData validation:** `JSON.parse` sonrası schema doğrulaması yok. Corrupt dosya durumu try/catch ile yakalanıyor ama partial JSON (geçerli ama eksik alanlar) sorun yaratabilir.

## Verdict: ANALYZED
