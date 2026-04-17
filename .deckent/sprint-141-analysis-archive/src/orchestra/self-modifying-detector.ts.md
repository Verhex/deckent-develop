# Analysis: src/orchestra/self-modifying-detector.ts
**Task ID:** 141-002 | **LoC:** 163

## 1. Amaci
ADR-039: Deckent dogfood vs kullanıcı proje ayrımı. Bir sprint'in Deckent'in kendi kaynak kodunu değiştirip değiştirmediğini algılar — self-modifying sprint'ler sıralı yürütme, önbellek geçersizleştirme ve MCP yeniden başlatma gerektiriyor.

## 2. Public API (export listesi)
- `DECKENT_SOURCE_PATTERNS` readonly string[] — Deckent kaynak dizin pattern'ları
- `SelfModifyCheckable` interface — task shape
- `clearDetectionCache()` — test için cache temizleme
- `detectDeckentRepo(projectRoot)` → boolean — package.json name='deckent' kontrolü
- `isSelfModifying(task, projectRoot)` → boolean — tek task kontrolü
- `isSelfModifyingSprint(tasks, projectRoot)` → boolean — sprint seviyesi kontrol

## 3. Ic + Dis Bagimliliklar
- **Dış:** ../core/task-types.js (TaskScope)
- **Node:** node:fs (readFileSync, existsSync), node:path (join)

## 4. Complexity
3 export fonksiyon. `detectDeckentRepo`: try/catch + cache, cyclomatic ~3. `isSelfModifying`: pattern matching, cyclomatic ~3. `isSelfModifyingSprint`: Array.some, cyclomatic ~2. Toplam: ~10.

## 5. Type Safety
- `JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string }` — güvenli optional access.
- `ReadonlyArray<SelfModifyCheckable>` — tip güvenli parameter.
- Hiç `any` yok.

## 6. ADR Compliance
- **ADR-039 (Self-Modifying Task Detection):** FULLY COMPLIANT — iki koşul (`.deckent/` + `package.json name='deckent'`) spec'e uygun implement edilmiş.
- **ADR-038:** `authority-enforcer.ts`'de `isSelfModifyingSprint` flag'i işleniyor — bağlantı doğru.
- **ADR-006:** spawnSync yok — sadece readFileSync/existsSync.

## 7. Test Coverage
- `tests/orchestra/self-modifying-detector.test.ts` beklenir.
- `clearDetectionCache()` test reset için.
- Kullanıcı projesi vs deckent repo için iki senaryo.

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
`clearDetectionCache` — sadece test için; üretim kodunda çağrılmıyor. Ama test yardımcısı olarak tutulabilir.

## 10. Security Findings
- `readFileSync(pkgPath, 'utf-8')` — try/catch ile sarılmış, SAFE.
- Path traversal: `join(projectRoot, 'package.json')` — projectRoot dışarıdan geldiği için göz önünde bulundurulmalı ama normal kullanımda güvenli.

## 11. Memory V2 Uyumu
Memory V2 ile doğrudan ilişkisi yok — pure detection logic.

## 12. Oneriler
- `DECKENT_SOURCE_PATTERNS` listesine `.deckent/workspace/` eklenebilir (IDENTITY.md, BOOT.md vs.)
- Detection cache process-lifetime'da tutulabilir (şu an tutulmuş) — test reset için `clearDetectionCache` export doğru.

## 13. Verdict: ANALYZED
