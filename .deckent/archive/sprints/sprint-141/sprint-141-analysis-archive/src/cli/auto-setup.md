# Analysis: src/cli/auto-setup.ts
**Task ID:** 141-003 | **LoC:** 113

## 1. Amacı
`deckent init --auto` için setup recommendation üretir. SystemProfile + subscription + projectAnalysis'e göre worker sayısı, tier, planning mode seçer.

## 2. Public API
- `generateSetupRecommendation(systemProfile, subscription, projectAnalysis): SetupRecommendation`

## 3. İç + Dış Bağımlılıklar
- `../../core/model-registry.js` (modelRegistry)
- `../../core/mode-presets.js` (getModePreset)
- `../../core/types.js`

## 4. Complexity
Cyclomatic: ~4. subscription → mode → workers → tiers → planning.

## 5. ADR Compliance
✅ ADR-023: Provider-agnostic tier isimler kullanılıyor.

## 6. Memory V2 Uyumu
N/A.

## 13. Verdict: ANALYZED
