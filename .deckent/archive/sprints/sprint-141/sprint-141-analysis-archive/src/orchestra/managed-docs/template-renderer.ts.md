# Analysis: src/orchestra/managed-docs/template-renderer.ts
**Task ID:** 140-002 | **LoC:** 135

## 1. Amaci
Kullanıcı tanımlı `{{path.to.value}}` mustache-benzeri template'leri sprint context verisiyle render eder. `buildTemplateScope()` dokümana erişilebilir tüm değerleri düz objeye flatten eder, `resolvePath()` nokta notasyonlu path'leri çözer.

## 2. Public API
- `buildTemplateScope(ctx: DocUpdateContext): Record<string, unknown>`
- `resolvePath(scope: unknown, path: string): unknown`
- `renderTemplate(template: string, ctx: DocUpdateContext): string`

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:path`
- **Dis:** `../../core/constants.js` (BRAIN_DIR, SPRINTS_DIR)
- **Dis:** `../../core/agent-pool.js` (AgentPoolManager)
- **Dis:** `../../core/skill-pool.js` (SkillPoolManager)
- **Dis:** `../../core/model-registry.js` (modelRegistry)
- **Dis:** `../../core/types.js` (TaskEvaluation)
- **Dis:** `../doc-updaters/types.js` (DocUpdateContext)

## 4. Complexity
- 3 fonksiyon, cyclomatic ~12 (regex replace + nested try/catch + for loop)

## 5. Type Safety
- `Record<string, unknown>` scope — tip silinmesi, ancak template rendering için intentional ✓
- `(value as () => unknown)()` — unsafe cast ama try/catch korumalı ✓

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-030 (Template Engine):** tam implementasyon ✓
- **ADR-032 (i18n):** `language` scope'a ekleniyor ✓

## 7. Test Coverage
- `tests/docs/template-renderer.test.ts` bekleniyor — özellikle `resolvePath` ve `renderTemplate`

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Yok

## 10. Security Findings
- `renderTemplate` regex: `/\{\{\s*([^}]+)\s*\}\}/g` — `[^}]+` closing brace içermez, ReDoS riski minimal ✓
- `resolvePath` Map access desteği — güvenli ✓

## 11. Memory V2 Uyumu
- Yok

## 12. Oneriler
- `latestSprintId` için Memory V2 DB sorgulanabilir (DB'den `getByType('retro')` son kayıt)

## 13. Verdict: ANALYZED
