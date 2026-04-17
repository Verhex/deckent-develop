# Analysis: src/orchestra/sprint-docs-helpers.ts
**Task ID:** 140-002 | **LoC:** 347

## 1. Amaci
Sprint doküman işlemlerinin pure string builder ve transformer fonksiyonlarını içerir. `sprint-docs-updater.ts`'den extract edilmiş — dosya I/O içermez. Sprint log, PROJECT-IDENTITY.md, DIRECTIVES placeholder ve ADR entry oluşturma için template builder'lar.

## 2. Public API
- `interface ProjectIdentityInfo` — proje kimlik verisi
- `buildSprintLogLines(sprint, metrics, evaluations?, results?): string[]`
- `generateProjectIdentity(info): string`
- `buildCurrentStateLines(testCount, coverage, sprintId, ...): string[]`
- `buildDirectivesPlaceholder(archivedSprintId, archiveFileName, nextNum): string`
- `readPreviousCompletedTasks(content): number`
- `readPreviousCoverage(content): number | null`
- `replaceCurrentStateSection(content, stateLines): string`
- `sprintFileNumber(filename): number`
- `parseAddedSrcFiles(diffOutput): string[]`
- `findMaxAdrNumber(content): number`
- `buildAdrEntry(adrNumber, dirName, sprintNum): string[]`

## 3. Ic + Dis Bagimliliklar
- **Dis:** `../core/types.js` (Sprint, SprintMetrics, TaskResult, TaskEvaluation)
- **Ic:** Tüm fonksiyonlar pure — dosya I/O yok ✓

## 4. Complexity
- 12 export fonksiyon, cyclomatic toplam ~20 (döngüler + regex + string replace)
- Pure fonksiyonlar — ideal test edilebilirlik

## 5. Type Safety
- `match[1] ?? '0'` — güvenli fallback pattern yaygın ✓
- `lines[i]!` non-null assertion: `replaceCurrentStateSection` içinde `i` bounds-safe ✓

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-008 (Brain Import):** core/ import ediyor ✓
- `buildAdrEntry`: ADR-036 governance formatında — MADR v3 hibrit değil (tek satırlık draft)

## 7. Test Coverage
- `tests/orchestra/sprint-docs-helpers.test.ts` kesinlikle bekleniyor — pure fonksiyonlar test için ideal

## 8. TODO/FIXME/HACK inventory
- `buildDirectivesPlaceholder` içinde `.brain/MEMORY.md` referansı var — Memory V2'de bu dosya artık export, kullanıcıya yanıltıcı olabilir

## 9. Dead Code Candidates
- `findMaxAdrNumber` ve `buildAdrEntry`: Memory V2 sonrası DECISIONS.md dosya tabanlı ADR parse — DB'den okunmalı

## 10. Security Findings
- `parseAddedSrcFiles`: `diffOutput.split('\n')` + regex — güvenli
- `replaceCurrentStateSection`: string manipulation, I/O yok — güvenli

## 11. Memory V2 Uyumu
- `buildDirectivesPlaceholder` içindeki `.brain/MEMORY.md` referansı eskimiş — `.brain/exports/memory.md` olmalı
- `findMaxAdrNumber`: DECISIONS.md dosyasını parse ediyor — Memory V2'de `store.getByType('adr')` kullanılmalı

## 12. Oneriler
- `buildDirectivesPlaceholder` içindeki MEMORY.md → exports/memory.md güncelle (Sprint 142)
- `findMaxAdrNumber` → Memory V2 DB'den ADR sayısı sorgusu ile değiştir

## 13. Verdict: ANALYZED (2 Memory V2 migration candidates)
