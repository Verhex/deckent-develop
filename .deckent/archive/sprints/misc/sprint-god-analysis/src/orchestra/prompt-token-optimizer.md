# Analysis: src/orchestra/prompt-token-optimizer.ts
**Task ID:** 142-016 | **Model:** opus | **LoC:** 152 | **Effort:** max

## 1. Amaci (detayli)
V2 routing aktifken worker prompt'larina enjekte edilecek skill prompt'larini filtreleyerek token kullanimini azaltir. Her skill'in TaskDNA'ya uygunlugunu scorer ve esik altinda kalanlari cikartir. Uc fonksiyon sunar: SkillDefinition-bazli filtreleme, SkillPrompt (name+content) bazli filtreleme, ve tek skill skor hesaplama. task-builder tarafindan buildWorkerPrompt icinde kullanilir.

## 2. Public API
- `computeSkillRelevance(skill: SkillDefinition, taskDNA: TaskDNA): number` — 0.0-1.0 skor. JSDoc VAR.
- `filterSkillPrompts(skills: SkillDefinition[], taskDNA: TaskDNA): SkillDefinition[]` — irrelevant filtreleme. JSDoc VAR.
- `filterSkillPromptsByDNA(skillPrompts: Array<{name,content}>, taskDNA): Array<{name,content}>` — prompt bazli filtreleme. JSDoc VAR.
- INTENT_SKILL_AFFINITY (internal) — intent → keyword mapping. Module-scoped const.

## 3. Ic Bagimliliklar
- `../core/routing-types.js` — TaskDNA, IntentType
- `../core/skill-types.js` — SkillDefinition
- `../core/activation-engine.js` — evaluateActivation
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- Node built-in: YOK
- node_modules: YOK
- ADR-010 uyumu: UYUMLU (sifir runtime dep)

## 5. Complexity
- Fonksiyon sayisi: 3 (3 public)
- En karmasik: `filterSkillPromptsByDNA()` (sat 115-152, ~37 satir)
- Max cyclomatic: ~5

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- Non-null `!`: 0
- Genel: MUKEMMEL type safety. Sifir unsafe pattern.

## 7. ADR Compliance
- ADR-006 spawnSync: UYUMLU
- ADR-008 brain import: UYUMLU
- ADR-010 deps: UYUMLU
- Memory V2: N/A

## 8. Test Coverage
- tests/orchestra/prompt-token-optimizer.test.ts — MEVCUT
- Mock kalitesi: IYI — skill ve TaskDNA mock'lari
- Edge case: bos skills array, tek skill (always return), tum low-score (fallback)

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- YOK. orchestra/index.ts'den export ediliyor (sat 106): filterSkillPrompts, filterSkillPromptsByDNA, computeSkillRelevance

## 11. Security
- Input validation: skill.triggers iteration guvenli (empty array → score 0)
- Injection riski: YOK (string comparison only, no eval)

## 12. Memory V2 Uyumu
- N/A — memory sistemiyle etkilesmiyor

## 13. i18n
- INTENT_SKILL_AFFINITY keyword'leri tamamen Ingilizce — Turkce task description'lar icin missed match riski
- Ornek: Turkce "guvenlik" → 'security' affinity keyword'leriyle eslesmez
- **P2 SORUN:** TR proje icin intent-keyword eslesmesi zayif olabilir

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: TUTARLI
- RELEVANCE_THRESHOLD = 0.3 dokumante
- "Guarantees at least one skill" → kod dogru (fallback best skill)

## 15. Performance
- Sync I/O: 0
- Hot path: EVET — her worker prompt build'inde calisir
- computeSkillRelevance V2 path'inde evaluateActivation cagirir — activation engine cost'u
- filterSkillPromptsByDNA content scan: ilk 200 char (sat 140) — dogru sinirlama

## 16. Oneriler
- **P2:** INTENT_SKILL_AFFINITY'ye Turkce keyword'ler eklenmeli (ornek: 'guvenlik', 'performans', 'test', 'mimari')
- **P3:** computeSkillRelevance V1 fallback normalization magic number (score / 6) dokumante edilmeli

## Verdict: ANALYZED
