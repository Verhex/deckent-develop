# Analysis: src/orchestra/rule-evolver.ts
**Task ID:** 141-002 | **LoC:** 278

## 1. Amaci (1-2 cumle)
Geçmiş outcome verilerinden yeni aktivasyon ve dışlama kuralları üretir. %85+ güvenle kural otomatik uygulanır, %65-85 arası önerilir. Synergy matrix'ten skill-skill kombinasyon kuralları da türetir.

## 2. Public API (export listesi)
- `EvolvedRule` (interface)
- `EvolutionResult` (interface)
- `RuleEvolver` (class)
  - `evolveRules()` → EvolutionResult
  - `saveRules(rules)` → void
  - `loadRules()` → EvolvedRule[]

## 3. Ic + Dis Bagimliliklar
**Node.js:**
- `fs` — existsSync, mkdirSync, readFileSync, writeFileSync

**Core:**
- `../core/routing-types.js` — ActivationRule, ExclusionRule

**Orchestra:**
- `./outcome-tracker.js` — OutcomeTracker, EntityPerformance

**Core:**
- `../core/utils.js` — debugLog

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Public metotlar: 3
- Private metotlar: 3 (evolveEntityRules, evolveSynergyRules, isAgentId)
- Cyclomatic: orta-yüksek (~15) — iç içe döngüler, eşik mantığı, synergy analizi

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `r.rule && 'name' in r.rule ? (r.rule as ActivationRule).name` — koşullu cast, güvenli ama inelegant
- `@ts-ignore`: yok
- `any`: yok

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-001 (ESM):** Kısmi — `import { existsSync } from 'fs'` (node: prefix eksik)
- **ADR-006/008:** Uyumlu
- **ADR-010:** Uyumlu
- **ADR-037:** Kısmen — evolved rules agent/skill routing'i etkiler ama yetki kontrolü yok
- **ADR-040:** Uyumlu

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/rule-evolver.test.ts` — **MEVCUT** ✓
- evolveRules, saveRules, loadRules test edilmiş olmalı

## 8. TODO/FIXME/HACK inventory
- `EVOLVED_RULES_FILE = '.deckent/routing/evolved-rules.json'` — sabit kodlanmış yol, constants'a alınabilir
- Olgunlaşmamış synergy kural üretimi: `when: {}` boş condition ile activation rule üretiliyor

## 9. Dead Code Candidates
- `isAgentId`: yalnızca synergy kurallarında kullanılıyor; private, aktif

## 10. Security Findings
- JSON dosyası yazma: girdi doğrulama yok; evolved rules harici kaynaklı olabilir
- `ruleMap.set(key, r)`: anahtar çakışma çözümü mevcut

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- `.deckent/routing/evolved-rules.json` dosyasına yazıyor — Memory V2 DB'de değil
- Teknik borç: evolved rules MemoryStore'da `type: 'pattern'` ile saklanabilir

## 12. Oneriler (Sprint 142+ input)
1. **Memory V2 (P2):** saveRules → store.insert({type: 'pattern', content: JSON.stringify(rule)})
2. **ESM (P2):** 'fs' → 'node:fs'
3. **Synergy Rules (P3):** `when: {}` boş condition yerine domain/intent bazlı condition
4. **Confidence Config (P3):** AUTO_APPLY_CONFIDENCE ve SUGGEST_CONFIDENCE configüre edilebilir olmalı

## 13. Verdict: ANALYZED
