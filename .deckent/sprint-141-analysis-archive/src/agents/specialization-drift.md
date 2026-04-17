# Analysis: src/agents/specialization-drift.ts
**Task ID:** 141-005-fix | **LoC:** 107

## 1. Amacı
Agent'ın gerçek görevlerinin ilan ettiği uzmanlıktan sapmasını tespit eden dedektör. Token tabanlı overlap karşılaştırması ile driftScore hesaplar. Öneri: keep, respecialize, create_new_agent.

## 2. Public API
- `RecentResult`, `DriftReport` types
- `SpecializationDriftDetector` class (detect, _extractActualKeywords, _computeDriftScore, _computeRecommendation)

## 3. Complexity
- Düşük-orta — set operations, heuristic scoring

## 4. Type Safety
- `any` yok

## 5. ADR Compliance - OK.

## 6. Dead Code Candidates
- `DRIFT_THRESHOLD = 0.6`, `RESPECIALIZE_THRESHOLD = 0.8` — sabit eşikler; config'den alınabilir.

## 7. Security Findings - Yok.

## 8. Memory V2 Uyumu - İlgisiz.

## 9. Verdict: ANALYZED
