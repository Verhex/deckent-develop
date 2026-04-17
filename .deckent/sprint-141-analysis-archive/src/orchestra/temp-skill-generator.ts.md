# Analysis: src/orchestra/temp-skill-generator.ts
**Task ID:** 140-002 | **LoC:** 391

## 1. Amaci
Proje analizi sonucunda geçici skill'ler (project-conventions, framework-specific, security-patterns vb.) oluşturan template-based generator. AI call yok — deterministic ve zero-cost. `generateProjectConventionsSkill()` ana export. Temp→permanent promotion için `promotion-pipeline.ts`'e bağlı.

## 2. Public API
- `interface ProjectAnalysisInput`
- `generateProjectConventionsSkill(analysis): SkillDefinition`
- Ve ek skill generator fonksiyonları

## 3. Ic + Dis Bagimliliklar
- **Dis:** `../core/skill-types.js` (SkillDefinition, SkillCategory, StackDetectionRule, ProjectStack, createSkillDefinition)
- **Dis:** `../core/routing-types.js` (ActivationConfig)
- **Dis:** `../core/agent-types.js` (AgentDefinition, createAgentDefinition)

## 4. Complexity
- 391 LoC, 5+ generator fonksiyon, cyclomatic ~15
- Template string builder pattern — okunabilir

## 5. Type Safety
- `SkillWithContent = SkillDefinition & { _generatedContent?: string }` — internal extension type ✓
- `createSkillDefinition` factory kullanımı — validated construction ✓

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-008 (Brain Import):** core/ import ediyor ✓
- Project conventions skill: boilerplate ama değerli context

## 7. Test Coverage
- `tests/orchestra/temp-skill-generator.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- İkincil generator fonksiyonlarının kullanımı `promotion-pipeline.ts` üzerinden kontrol edilmeli

## 10. Security Findings
- Template injection riski yok — sadece string concatenation, user input yok

## 11. Memory V2 Uyumu
- Temp skill'ler `.deckent/skills/temp-*/skill.json`'a yazılıyor — Memory V2 DB'ye de kaydedilebilir

## 12. Oneriler
- `generateProjectConventionsSkill` üretilen skill'i Memory V2 DB'ye de `store.insert({ type: 'pattern' })` ile kaydet (Sprint 142)

## 13. Verdict: ANALYZED
