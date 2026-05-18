# Analysis: src/orchestra/rollback.ts
**Task ID:** 141-002 | **LoC:** 293

## 1. Amaci (1-2 cumle)
Sprint başlamadan önce git güvenlik noktası oluşturur; tüm task'lar NO_GO ise git reset --hard ile geri döner. Güvenlik noktası meta verilerini kalıcı hale getirmek için disk'e yazar.

## 2. Public API (export listesi)
- `SafetyPoint` (interface)
- `RollbackResult` (interface)
- `RollbackPolicy` (type: 'auto' | 'ask' | 'never')
- `isCleanWorkingTree(projectRoot)` → boolean
- `getDirtyFiles(projectRoot)` → string[]
- `getCurrentCommitSha(projectRoot)` → string
- `getCurrentBranch(projectRoot)` → string
- `createSafetyPoint(projectRoot, sprintId)` → SafetyPoint
- `rollback(projectRoot, safetyPoint)` → RollbackResult
- `deleteSafetyPoint(projectRoot, safetyPoint)` → boolean
- `safetyBranchExists(projectRoot, sprintId)` → boolean
- `getRollbackPolicy(evaluations)` → RollbackPolicy
- `recordRollbackInDebt(projectRoot, sprintId, result)` → void
- `saveSafetyPoint(projectRoot, safetyPoint)` → void
- `loadSafetyPoint(projectRoot)` → SafetyPoint | null

## 3. Ic + Dis Bagimliliklar
**Node.js:**
- `node:fs` — existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync
- `node:path` — join
- `node:child_process` — spawnSync

**Core:**
- `../core/constants.js` — BRAIN_DIR, DEBT_FILE
- `../core/errors.js` — ErrorRegistry
- `../core/utils.js` — debugLog

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Export fonksiyonlar: 11
- İç yardımcı: 1 (git())
- Cyclomatic: orta (~10 toplamda) — git komut hata yönetimi, koşullu stash/pop
- createSafetyPoint: en karmaşık — dirty tree stash + branch oluşturma + pop

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `result.stdout ?? ''` — güvenli nullish coalescing
- `@ts-ignore`: yok
- `any`: yok
- Non-null assertion: yok

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-006:** Uyumlu — spawnSync(git) kullanımı ADR-006 standardına uygun
- **ADR-001:** Uyumlu
- **ADR-008:** Uyumlu
- **ADR-010:** Uyumlu — tek bağımlılık commander.js değil, git CLI
- **ADR-037:** Kısmi — rollback yetkisi Brain tarafından kontrol edilmeli; doğrudan çağrılabilir
- **ADR-040:** Uyumlu

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/brain-rollback.test.ts` — **MEVCUT** ✓ (aynı dosya için)
- Doğrudan `rollback.test.ts` yok; brain-rollback üzerinden entegrasyon testi

## 8. TODO/FIXME/HACK inventory
- Satır 135: `console.warn(...)` — debugLog yerine direkt console; tutarsızlık
- `recordRollbackInDebt`: DEBT.md dosyasına string format ile yazıyor — Memory V2 DB'ye yazmalı

## 9. Dead Code Candidates
- `getDirtyFiles`: export edilmiş ama çağrı yapan kod belirsiz; kullanım analizi gerekli

## 10. Security Findings
- `git reset --hard`: geri alınamaz işlem; ancak Sprint başında yalnızca Brain çağırıyor
- `createSafetyPoint`: `git stash push` dirty tree içeriyorsa çalışıyor — stash conflict riski var
- Branch adı: `deckent-backup-${sprintId}` — sprintId'de özel karakter riski düşük

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- **SORUN:** `recordRollbackInDebt` fonksiyonu doğrudan DEBT.md dosyasına string ekliyor (appendFileSync)
- Memory V2 DB-first mimarisine göre bu MemoryStore.insert() ile yapılmalıydı
- Teknik borç: DEBT.md yerine DB'ye yazma

## 12. Oneriler (Sprint 142+ input)
1. **Memory V2 (P1):** `recordRollbackInDebt` → `store.insert({type: 'debt', ...})` ile DB'ye yaz
2. **console.warn → debugLog (P2):** satır 135
3. **Test (P2):** Doğrudan rollback.test.ts yaz — git mock'lama ile izole testler
4. **getDirtyFiles kullanım kontrolü (P3):** Dead code mu kontrol et

## 13. Verdict: ANALYZED
