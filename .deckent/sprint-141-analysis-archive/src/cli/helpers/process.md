# Analysis: src/cli/helpers/process.ts
**Task ID:** 141-003

## 1. Amacı
CLI process yardımcıları. Exit kodları, error handler, project root resolver.

## 2. Key Exports
- `EXIT_CODES` const, `handleCliError(error)`, `resolveProjectRoot(): string`

## 3. Öneriler
`resolveProjectRoot()` → `process.cwd()` — basit, yeterli. Multi-project senaryolarda daha akıllı root detection gerekebilir.

## 13. Verdict: ANALYZED
