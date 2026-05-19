# ADR-024: sprint-controller.ts God Object Split — sprint-phases.ts Extract (Sprint 072)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** `sprint-controller.ts` 1300+ satıra büyüdü ve 8 sprint fazının tamamını içeriyordu. Bu durum bakım güçlüğü, yüksek cognitive load ve bağımsız test yazımını zorlaştırıyordu. Sprint 036'daki brain.ts split'inin ardından sprint-controller da god object haline geldi.

**Decision:** Sprint fazları `sprint-phases.ts` adlı yeni dosyaya çıkarıldı. `runSprint()` içindeki 7 faz fonksiyonu extract edildi:
- `runPlanPhase`, `runSpawnPhase`, `runEvaluatePhase`, `runFixPhase`
- `runRetroPhase`, `runDecayPhase`, `runCleanupPhase`

`sprint-controller.ts` orchestration mantığını korur, fazları import eder. Backward compatibility sprint-controller re-export layer üzerinden sağlandı.

**Consequence:** Her faz bağımsız olarak test edilebilir. `sprint-controller.ts` boyutu önemli ölçüde azaldı. Yeni faz eklemek veya mevcut fazı değiştirmek tek dosyayı etkiler. orchestra/ modül sayısı 36'dan 37'ye çıktı.

**Note (evolution):** This records the Sprint 072 **first step** — `sprint-phases.ts` exists and `sprint-controller.ts` shrank from 1300+ to ~780 LoC. The god-object split **continued well beyond this**: see **ADR-026 (God Object Split Stratejisi — Faz 1-3, Sprint 076)** plus `brain.ts` becoming a thin re-export layer. `orchestra/` now contains many dedicated `sprint-*` modules (`sprint-planner`, `sprint-spawner`, `sprint-finalizer`, `sprint-retro-writer`, `sprint-utils`, `sprint-checkpoint`, `sprint-metrics`, `sprint-lifecycle`, `sprint-docs-updater`, …); the original `runPlanPhase`/`runSpawnPhase`/… naming evolved into those modules' functions (`planSprint`, `spawnWorkers`, …). The "orchestra 36→37" figure is a Sprint-072 snapshot and is now far higher (drift-prone — canonical module counts are not pinned in ADRs). Behavior unchanged; documentation alignment only.
