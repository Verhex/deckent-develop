# ADR-026: God Object Split Stratejisi — Faz 1-3 Tamamlandı (Sprint 076)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** `sprint-controller.ts` zamanla god object haline geldi (1300+ satır). Sprint 036'da brain.ts split'i yapılmıştı ama sprint-controller yeniden şişti. Test ve bakım güçlüğü arttı.

**Decision:** 3 fazlı kademeli split stratejisi:
- **Faz 1 (Sprint 072):** `sprint-phases.ts` — 7 sprint faz fonksiyonu extract edildi (`runPlanPhase`, `runSpawnPhase`, vb.)
- **Faz 2 (Sprint 075):** `sprint-utils.ts` — shared sprint utility fonksiyonları extract edildi
- **Faz 3 (Sprint 076):** `result-collector.ts` — `waitForResults()` ve IPC+fs.watch döngüsü extract edildi

Her fazda backward compatibility sprint-controller re-export layer üzerinden korundu.

**Consequence:** `sprint-controller.ts` orchestration koordinatörü rolüne döndü — iş mantığı bağımsız modüllerde. orchestra/ modül sayısı 37'den 47'ye çıktı. Her yeni modül bağımsız unit test kapsamı kazandı. Kademeli split stratejisi büyük refactor riskini minimize etti.

**Note (verified / evolution):** Faz 1-3 confirmed against code — `sprint-phases.ts`, `sprint-utils.ts`, `result-collector.ts` (`waitForResults` + IPC) all exist; `src/orchestra/brain.ts` is a ~53-line *"Slim Re-export Layer"* re-exporting from `sprint-controller.js` ✓. The split **continued past Faz 3** (many more dedicated `sprint-*` modules now — see the ADR-024 note). The "orchestra 37→47" figure is a Sprint-076 snapshot and is now far higher (drift-prone — canonical module counts are not pinned in ADRs; see `docs/architecture/architecture.md`). Behavior unchanged; documentation alignment only.
