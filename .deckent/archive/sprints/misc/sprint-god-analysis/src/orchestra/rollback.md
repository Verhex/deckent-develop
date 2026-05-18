# Analysis: src/orchestra/rollback.ts
**Task ID:** 142-016 | **Model:** opus | **LoC:** 293 | **Effort:** max

## 1. Amaci (detayli)
Sprint oncesi git guvenlik noktasi olusturur ve sprint basarisiz olursa geri alma mekanizmasi saglar. `deckent-backup-{sprintId}` branch'i olusturarak mevcut HEAD'i yedekler. Working tree kirli ise stash yapar. Sprint sonunda tum task'lar NO_GO ise otomatik rollback onerir, kismi NO_GO ise kullaniciya sorar. Rollback olaylarini DEBT.md'ye kaydeder. Brain tarafindan sprint lifecycle'in baslangicinda ve sonunda kullanilir.

## 2. Public API
- `isCleanWorkingTree(projectRoot): boolean` — uncommitted degisiklik var mi. JSDoc VAR.
- `getDirtyFiles(projectRoot): string[]` — degismis dosya listesi. JSDoc VAR.
- `getCurrentCommitSha(projectRoot): string` — HEAD SHA. JSDoc YOK.
- `getCurrentBranch(projectRoot): string` — aktif branch adi. JSDoc YOK.
- `createSafetyPoint(projectRoot, sprintId): SafetyPoint` — yedek branch olustur. JSDoc VAR, detayli.
- `rollback(projectRoot, safetyPoint): RollbackResult` — git reset --hard ile geri al. JSDoc VAR, WARNING.
- `deleteSafetyPoint(projectRoot, safetyPoint): boolean` — yedek branch sil. JSDoc VAR.
- `safetyBranchExists(projectRoot, sprintId): boolean` — branch var mi. JSDoc YOK.
- `getRollbackPolicy(evaluations): RollbackPolicy` — policy belirle. JSDoc VAR, detayli.
- `recordRollbackInDebt(projectRoot, sprintId, result): void` — DEBT.md'ye kaydet. JSDoc VAR.
- `saveSafetyPoint(projectRoot, safetyPoint): void` — disk'e persist et. JSDoc VAR.
- `loadSafetyPoint(projectRoot): SafetyPoint | null` — disk'ten oku. JSDoc VAR.
- Tipler: SafetyPoint, RollbackResult, RollbackPolicy — EXPORTED

## 3. Ic Bagimliliklar
- `../core/constants.js` — BRAIN_DIR, DEBT_FILE
- `../core/errors.js` — ErrorRegistry
- `../core/utils.js` — debugLog
- `node:fs` — existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync
- `node:path` — join
- `node:child_process` — spawnSync
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- Node built-in: fs, path, child_process
- ADR-010: UYUMLU
- **ADR-006 spawnSync:** Bu modul `spawnSync('git', ...)` kullanir. ADR-006'ya UYUMLU (spawnSync guvenlik pattern'i).

## 5. Complexity
- Fonksiyon sayisi: 13 (12 export + 1 private helper)
- En karmasik: `createSafetyPoint()` (sat 104-147, 43 satir, stash+branch+unstash)
- Max cyclomatic: ~5

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `as` cast: 1 — sat 288: `JSON.parse(...) as SafetyPoint`. try/catch ile korunuyor.
- Non-null `!`: 0
- Genel: IYI type safety.

## 7. ADR Compliance
- ADR-006 spawnSync: **UYUMLU** — spawnSync sadece `git` komutlari icin kullanilir, encoding belirtilmis
- ADR-008 brain import: UYUMLU (core/ imports only)
- ADR-010 deps: UYUMLU
- ADR-037 RBAC: N/A
- Memory V2 DB-first: **SORUN** — `recordRollbackInDebt()` (sat 237-259) DEBT.md dosyasina dogrudan yazar. Memory V2 DB'ye degil, eski .md dosyasina yazim. Bu Memory V2 prensiplerine aykiri.

## 8. Test Coverage
- tests/orchestra/rollback.test.ts — MEVCUT
- Mock kalitesi: spawnSync mock ile git simülasyonu
- Edge case: dirty tree, stash fail, branch exists, rollback branch not found

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- orchestra/index.ts'de rollback fonksiyonlari export YOK — DIS API degil
- Ama sprint-controller.ts, sprint-spawner.ts, cleanup.ts icinden import ediliyor

## 11. Security
- **spawnSync git komutu:** Sabit arguman listesi, kullanici input'u yalnizca `sprintId` (branch adinda kullanilir)
- sprintId sanitizasyon: YOK — eger sprintId icinde ozel karakter varsa git branch adi sorunlu olabilir
  - Dusuk risk: sprintId format "sprint-NNN" ve Brain tarafindan kontrol ediliyor
- `git reset --hard` (sat 182) — DESTRUKTIF operasyon, rollback fonksiyonu tarafindan bilerek kullanilir
- `git branch -D` (sat 203) — DESTRUKTIF, bilerek kullanilir (cleanup)
- `git stash push/pop` — veri kaybi riski (pop basarisiz olursa console.warn ile uyari)

## 12. Memory V2 Uyumu
- **IHLAL:** `recordRollbackInDebt()` DEBT.md'ye dogrudan appendFileSync ile yazir (sat 257)
- Memory V2'de debt bilgisi DB'de saklanmali — MemoryStore.insert({ type: 'debt', ... })
- Bu fonksiyon guncellenmeli

## 13. i18n
- Mesajlar tamamen Ingilizce — tutarli
- DEBT.md entry format sabit — i18n N/A

## 14. Dokumantasyon Tutarliligi
- JSDoc WARNING: rollback fonksiyonunda "WARNING: This will discard all uncommitted changes" — DOGRU
- SafetyPoint interface iyi dokumante
- getCurrentCommitSha, getCurrentBranch — JSDoc EKSIK

## 15. Performance
- spawnSync: 6 kullanim (git status, rev-parse, branch, reset, stash) — tumu plan/cleanup zamaninda
- Hot path: HAYIR
- Gereksiz I/O: YOK

## 16. Oneriler
- **P1:** `recordRollbackInDebt()` Memory V2 DB'ye tasima — DEBT.md yerine `store.insert({ type: 'debt' })`
- **P2:** getCurrentCommitSha, getCurrentBranch, safetyBranchExists icin JSDoc eklenmeli
- **P3:** sprintId sanitization — branch adi icin gecersiz karakterleri strip et

## Verdict: ANALYZED
