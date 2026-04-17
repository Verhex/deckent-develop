# Analysis: src/orchestra/debt-manager.ts
**Task ID:** 141-002 | **LoC:** 393

## 1. Amaci
Tech debt yaşam döngüsünü yönetir: değerlendirme sonucu işleme, çapraz bağımlılık analizi, debt escalation, çözme ve memory decay. Memory V2 DB-first mimariyle tamamen uyumludur.

## 2. Public API (export listesi)
- `handleEvaluation(projectRoot, task, evaluation, result)` — task değerlendirme sonucunu işler
- `handleCrossDependencies(projectRoot, sprint, evaluations)` — NO_GO cross-fix taskları oluşturur
- `escalateDebt(projectRoot)` — açık debt'leri sprintsOpen artışına göre yükseltir
- `resolveDebt(projectRoot, debtId, resolvedInSprintId)` — bir debt'i çözüldü olarak işaretler
- `archiveResolvedDebt(projectRoot)` — çözülmüş debt sayısını döner
- `auditBrainBudget(projectRoot, budget)` — bellek bütçesi denetimi
- `runDecay(projectRoot, sprintId, opts)` — memory decay sürecini çalıştırır
- `decay(projectRoot, currentSprintId)` — runDecay'in backward-compat alias'ı
- `BrainBudgetAudit` interface, `RunDecayOptions` interface, `DECAY_EXEMPT` set

## 3. Ic + Dis Bagimliliklar
- **İç:** ../agents/worker.js (updateTaskStatus, releaseAllLocks), ../core/memory-store.js (MemoryStore), ../core/memory-types.js
- **Dış:** node:fs, node:path, ../core/types.js, ../core/constants.js

## 4. Complexity
8 export fonksiyon. `handleEvaluation`: 3 ana dal (DONE/GO_WITH_TECH_DEBT/NO_GO). `runDecay`: 1 ana dal + DB fallback. `escalateDebt`: loop + priority hesaplaması. Genel cyclomatic: ~12.

## 5. Type Safety
- `JSON.parse(debt.metadata || '{}') as Record<string, unknown>` — güvenli cast, metadata string
- `(task.sprintId ?? '').replace(/\D/g, '')` — sprint numarası parse edilirken `||0` fallback var
- Hiç `any` yok, `@ts-ignore` yok. İyi.

## 6. ADR Compliance
- **ADR-040 (Memory V2 DB-first):** FULLY COMPLIANT — tüm işlemler MemoryStore üzerinden. V1 DEBT.md parse kodu yok.
- **ADR-005 (Sync I/O):** DEPRECATED ADR. `writeFileSync` kullanılıyor (NO_GO fix task oluşturma). Bu `writeFileSync` performans kritik yolda değil.
- **ADR-008:** debt-manager.ts brain.ts tarafından import ediliyor — COMPLIANT.

## 7. Test Coverage
- `tests/orchestra/debt-manager.test.ts` mevcut beklenir.
- `getMemoryStore` DB yoksa null dönüyor — bu dal test edilmeli.

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
`DECAY_EXEMPT` set: `'DECISIONS.md'` ve `'PROJECT-IDENTITY.md'` — DB'ye geçildikten sonra bu set'in V1 semantiği var. DB context'inde `identity` ve `adr` tipleri exempt sayılıyor. Mantık korunmuş ama isim kafa karıştırıcı olabilir.

## 10. Security Findings
- `JSON.parse(entry.metadata || '{}')` — parse hatası catch edilmiyor. `debtEntryToInput` fonksiyonunda bu potansiyel throw var. Try/catch eklenmeli.
- Fix task `writeFileSync` — path injection riski düşük (task.id içeri alınıyor ama sabit format).

## 11. Memory V2 Uyumu
EXCELLENT: `getMemoryStore()` yardımcı fonksiyonu DB yoksa `null` döner, tüm işlemler DB-first pattern'i izliyor. V1 DEBT.md fallback tamamen kaldırılmış — `// No DB available — debt entry skipped` yorumları V1 fallback olmadığını teyit ediyor. `MemoryStore.decay()` doğrudan çağrılıyor.

## 12. Oneriler
- `debtEntryToInput` içinde `JSON.parse` için try/catch eklenmeli.
- `DECAY_EXEMPT` set'in amacı DB context'inde yorum ile belgelenebilir.
- `writeFileSync` → async `writeFile` geçişi düşünülebilir (Sprint 139 async migration pattern'i).

## 13. Verdict: ANALYZED
