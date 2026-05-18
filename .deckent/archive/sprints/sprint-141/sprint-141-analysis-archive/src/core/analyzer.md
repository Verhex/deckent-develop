# Analysis: src/core/analyzer.ts
**Task ID:** 141-001 | **LoC:** 344

## 1. Amaci (1-2 cumle)
Proje stack analizi: framework, dil, test framework, build tool, CI/CD tespiti. `analyzeProject()` ile proje yapisi okunarak `ProjectAnalysis` objesi ve konfigurasyon onerileri uretilir.

## 2. Public API (export listesi)
- `analyzeProject(projectRoot): Promise<ProjectAnalysis>`
- `detectProjectSize(fileCount, locCount): ProjectSize`
- `generateConfigSuggestions(analysis): AnalyzerSuggestion[]`

## 3. Ic + Dis Bagimliliklar
- **Ic import:** `./config-types.js`, `./utils.js`
- **Node.js:** `node:fs`, `node:path`

## 4. Complexity
- 10+ fonksiyon, cyclomatic rough: 30-35

## 5. Type Safety
- `any`: 1 (package.json parse), Non-null: 2

## 6. ADR Compliance
- ADR-001 (ESM): UYUMLU

## 7. Test Coverage
- `tests/core/analyzer.test.ts` MEVCUT olmali

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Framework detection pattern'leri: bazilari kullanilmiyor olabilir

## 10. Security Findings
- Dosya sistemi traverse; proje root disina cikmamali (path validation)

## 11. Memory V2 Uyumu
- Dogrudan iliskisi yok; analiz sonuclari DB'ye kaydedilebilir

## 12. Oneriler
- `analyzeProject()` sonucu MemoryStore'a `identity` tipi olarak kaydedilebilir

## 13. Verdict: ANALYZED
