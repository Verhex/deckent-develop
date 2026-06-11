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

---

## Amendment — Sprint 281 (2026-06-11, ADR-review re-audit, full code-verification)

**Classification: dogfood** (iç mimari hijyen; user'a dolaylı yansır).

**Re-verified + Note'ta 2 düzeltme:**
1. **7 faz fonksiyonunun 7'si de orijinal adlarıyla CANLI** — `sprint-phases.ts`: `runPlanPhase:631`, `runSpawnPhase:744`, `runEvaluatePhase:1078`, `runFixPhase:1782`, `runRetroPhase:1997`, `runDecayPhase:2094`, `runCleanupPhase:2108`. Note'un "isimler `planSprint`/`spawnWorkers`'a evrildi" cümlesi yanlış/abartılıydı — `run*Phase` API'si duruyor; `sprint-*` modül-ailesi (bugün 12+ modül, orchestra toplam 94 .ts) onun YANINA büyüdü.
2. **God-object yeniden-büyüme bulgusu:** Note "~780 LoC'a indi" der; Sprint 136 kaydı "1890→209 slim"; bugün `sprint-controller.ts` = **1513 LoC** — slim-sonrası ~145 sprint'te kademeli geri-büyüme. Split kararının kendisi geçerli (controller hâlâ fazları import eder, `:70`; `brain.ts` 53-satır ince re-export ✓) ancak boyut-disiplini sürdürülemedi. **Bağlantı:** ADR-026 amendment'indeki MOD-SPLIT modülerlik çalışması (community/enterprise modüler ayrım) controller'ı yeniden ele alırken bu regrowth kapsama dahil edilir — ayrı iş-maddesi açılmadı, ADR-026 kaydına not düşüldü. md+db senkron (Alperen ADR-review).
