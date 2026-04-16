# Analysis: src/orchestra/temp-skill-generator.ts
**Task ID:** 142-016 | **Model:** opus | **LoC:** 391 | **Effort:** max

## 1. Amaci (detayli)
Proje analizinden gecici skill'ler ve agent'lar otomatik uretir. Tamamen template-bazli (AI cagrisi yok), deterministik ve sifir maliyetli. Uc ana fonksiyon: (1) proje konvansiyonlari skill'i (her zaman olusturulur), (2) domain-bazli ogrenilmis skill'ler (veri yeterli oldugunda), (3) stack-bazli gecici agent'lar (React, TypeScript, Python, Go, Rust uzmanliklarindan eslesen). sprint-controller basinda calisir, brain otomatik uretilen entity'leri pool'a ekler.

## 2. Public API
- `generateProjectConventionsSkill(analysis: ProjectAnalysisInput): SkillDefinition` — proje konvansiyonlari skill'i. JSDoc VAR.
- `getGeneratedContent(skill: SkillDefinition): string | undefined` — _generatedContent accessor. JSDoc VAR.
- `generateDataDrivenSkills(accumulations, existingSkillIds): SkillDefinition[]` — data-driven skill'ler. JSDoc VAR.
- `generateTempAgents(stack: ProjectStack): AgentDefinition[]` — stack-bazli gecici agent'lar. JSDoc VAR.
- Tipler: ProjectAnalysisInput, DomainAccumulation — EXPORTED

## 3. Ic Bagimliliklar
- `../core/skill-types.js` — SkillDefinition, SkillCategory, StackDetectionRule, ProjectStack, createSkillDefinition
- `../core/routing-types.js` — ActivationConfig
- `../core/agent-types.js` — AgentDefinition, createAgentDefinition
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- Node built-in: YOK
- node_modules: YOK
- ADR-010: UYUMLU (sifir runtime dep)

## 5. Complexity
- Fonksiyon sayisi: 4 (4 public)
- En karmasik: `generateTempAgents()` (sat 335-391, 56 satir, 7 template x 4 filtre)
- Max cyclomatic: ~8 (nested filtre zincirleri)

## 6. Type Safety
- `any` sayisi: 0
- `as` cast: 3 — sat 108 `as SkillCategory`, sat 113 `as StackDetectionRule`, sat 122 `(skill as SkillWithContent)`
  - SkillCategory cast: createSkillDefinition 'domain' string literal icin gerekli — anlasma (factory tipi strict)
  - SkillWithContent: internal type extension — gercek risk YOK
- Non-null `!`: 1 — sat 358: `tpl.depHint!` — guvenli: `tpl.depHint &&` kontrolu oncesinde
- Genel: IYI type safety.

## 7. ADR Compliance
- ADR-006 spawnSync: UYUMLU
- ADR-008 brain import: UYUMLU
- ADR-010 deps: UYUMLU
- ADR-033 product vision: UYUMLU (template-based, AI bagimsiz)

## 8. Test Coverage
- tests/orchestra/temp-skill-generator.test.ts — MEVCUT
- Mock kalitesi: ProjectStack ve ProjectAnalysisInput mock'lari
- Edge case: bos dependencies, mixed language, framework matching

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- orchestra/index.ts'den export: `generateProjectConventionsSkill`, `generateDataDrivenSkills` — AKTIF
- `generateTempAgents` export: index.ts'de YOK — POTANSIYEL DEAD CODE dis API'da
  - Ama sprint-controller.ts veya agent-pool.ts icinden dogrudan import ediliyor olabilir

## 11. Security
- Template string interpolation: tamamen kontrollü degerler (analysis.language, dependencies) — injection riski YOK
- ActivationConfig rules statik skor degerleri — manipülasyon riski YOK

## 12. Memory V2 Uyumu
- N/A — template-based skill generation, memory ile etkilesmiyor

## 13. i18n
- Uretilen skill icerigi tamamen Ingilizce (Stack, Key Dependencies, Languages, Testing)
- **P3:** TR lokalizasyon destegi eklenebilir (skill.md icerigi)
- AGENT_TEMPLATES description/systemPrompt Ingilizce — uygun (LLM prompt'lari)

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: TUTARLI
- "At most one agent per template" (sat 337) — kod dogru (loop break YOK ama template unique, eslesen template push edilir)
- generateDataDrivenSkills "5+ tasks, 70%+ success" threshold'lari dokumante — TUTARLI

## 15. Performance
- Sync I/O: 0
- Hot path: HAYIR — sprint baslangicinda bir kez
- Template iteration O(7) — sabit

## 16. Oneriler
- **P2:** `generateTempAgents` orchestra/index.ts'den export kontrolu — dis API'da yoksa dogrudan import path'i belgelenmeli
- **P3:** AGENT_TEMPLATES'e Java/Kotlin, Next.js gibi yaygin stack'ler eklenebilir
- **P3:** SkillWithContent internal type — _generatedContent ayrı bir Map<skillId, content> ile yonetilebilir (type assertion kaldirmak icin)

## Verdict: ANALYZED
