# Analysis: src/core/stack-detector.ts
**Task ID:** 140-001 | **LoC:** 736

## 1. Amaci
Proje technology stack'ini otomatik algılar. package.json, dosya uzantıları, config dosyaları üzerinden dil, framework, build tool, CI, test framework tespit eder. `ProjectStack` nesnesi üretir.

## 2. Public API (export listesi)
- `detectProjectStack(projectRoot, opts?): Promise<ProjectStack>`
- `detectSubProjects(projectRoot): string[]`
- İç yardımcılar: `detectLanguage`, `detectFramework`, `detectBuildTool`, `detectTestFramework`, `detectCI`

## 3. İç + Dış Bağımlılıklar
- **Dış**: `node:fs`, `node:path`
- **İç**: `skill-types.ts` (ProjectStack)

## 4. Complexity
- `detectProjectStack()`: yüksek — çok sayıda heuristic
- `detectLanguage()`: yüksek — dosya uzantısı sayımı
- Tüm detect fonksiyonları: orta

## 5. Type Safety
- `any` kullanımı: düşük
- Optional chaining kullanımı iyi

## 6. ADR Compliance
- **ADR-001** (ESM): UYUMLU

## 7. Test Coverage
- `tests/core/stack-detector.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- Muhtemelen bazı hardcoded pattern listeler

## 9. Dead Code Candidates
- Bazı küçük framework detection helper'ları

## 10. Security Findings
- `readdirSync` ile dizin okuma — path traversal riski minimal (projectRoot sınırlı)

## 11. Memory V2 Uyumu
- N/A — detection utility

## 12. Öneriler
- 736 satır büyük — refactor fırsatı var. Detect fonksiyonları ayrı modüle taşınabilir.

## 13. Verdict: ANALYZED
