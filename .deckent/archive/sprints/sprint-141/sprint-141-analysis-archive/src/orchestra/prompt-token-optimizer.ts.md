# Analysis: src/orchestra/prompt-token-optimizer.ts
**Task ID:** 141-002 | **LoC:** 152

## 1. Amaci (1-2 cumle)
V2 routing aktifken worker prompt boyutunu azaltmak için skill promptlarını TaskDNA'ya göre filtreler. İlgisiz skill promptlarını worker'a göndermeden önce eleyerek token kullanımını optimize eder.

## 2. Public API (export listesi)
- `computeSkillRelevance(skill, taskDNA)` → number (0.0–1.0)
- `filterSkillPrompts(skills, taskDNA)` → SkillDefinition[]
- `filterSkillPromptsByDNA(skillPrompts, taskDNA)` → Array<{name, content}>
- `RELEVANCE_THRESHOLD` (const, 0.3)

## 3. Ic + Dis Bagimliliklar
**Dahili (core):**
- `../core/routing-types.js` — TaskDNA, IntentType
- `../core/skill-types.js` — SkillDefinition
- `../core/activation-engine.js` — evaluateActivation

**Modül içi:**
- `INTENT_SKILL_AFFINITY` — private const map

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Export fonksiyonlar: 3
- Internal const: 2 (RELEVANCE_THRESHOLD, INTENT_SKILL_AFFINITY)
- Cyclomatic: düşük-orta (~8) — döngüler ve koşullu puanlama mantığı var

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any`: yok
- `@ts-ignore`: yok
- Non-null assertion: yok
- Tip güvenli: Record<IntentType, string[]> anahtar eşlemesi kullanıyor

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-001 (ESM):** Uyumlu — `.js` uzantılı importlar
- **ADR-006:** Uyumlu — spawnSync yok
- **ADR-008:** Uyumlu — brain import yok
- **ADR-010:** Uyumlu — harici bağımlılık yok
- **ADR-037:** Uyumlu — saf fonksiyonlar, yetki kapsamı dışında
- **ADR-040:** Uyumlu — Memory V2 ile ilgisiz

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/prompt-token-optimizer.test.ts` — **MEVCUT** ✓
- İyi kapsam: 3 ana fonksiyon test edilmiş olmalı

## 8. TODO/FIXME/HACK inventory
- Yorum (satır 75): `// Normalize: a well-matching skill with 2+ triggers scores ~6–8 raw` — magic number 6
- Yorum (satır 147): `const PROMPT_THRESHOLD = 1` — magic number, konfigüre edilebilir olmalı

## 9. Dead Code Candidates
- `INTENT_SKILL_AFFINITY.unknown: []` — boş array, hiçbir zaman eşleşme üretmez; güvenli ama işlevsiz

## 10. Security Findings
- Saf fonksiyon, dosya I/O yok — güvenlik riski minimal
- `sp.content.slice(0, 200)` — içerik snippet analizi için güvenli truncation uygulanmış

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile doğrudan ilgisiz
- Eski .md parse kodu yok; tamamen stateless utility modülü

## 12. Oneriler (Sprint 142+ input)
1. **Threshold Config (P2):** RELEVANCE_THRESHOLD ve PROMPT_THRESHOLD'u config'e taşı
2. **Cache (P3):** Aynı sprint içinde tekrar eden skill+DNA kombinasyonları için hafif cache eklenebilir
3. **Metrics (P3):** Kaç skill'in filtrelendiğini metric olarak yay — token tasarrufu görünürlüğü için

## 13. Verdict: ANALYZED
