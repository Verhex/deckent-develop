---
name: project-topp-continuous-dispatch
description: "TOPP (Topology-Optimized Parallel Pipeline) — continuous-dispatch wave-barrier removal. ADR-064 accepted Sprint 178. deckent-dev ARTIK dependency_pipeline_enabled=true (flip 2026-06-10)."
metadata:
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**TOPP = Topology-Optimized Parallel Pipeline** — Brain spawn coordination'ı için wave-barrier yerine continuous-dispatch pattern. **ADR-064 accepted Sprint 178**, supersedes ADR-045 §3 wave-barrier semantic.

### Problem (pre-TOPP, ADR-045 wave-barrier)
```
DALGA 0 (1 task) → DALGA 1 (3 task paralel) → BARRIER → DALGA 2 (2 task)
```
- DALGA 1'in 3 task'ı 5/10/30 dk sürdüğünde **30 dk hep beklenir**; en yavaş worker barrier'ı tutar → fan-out ineffective.

### TOPP solution (continuous-dispatch)
```
Worker pool (max_workers slots)
  → Bir slot boşaldıkça SıraDaki ELIGIBLE task spawn
  → Dependency-aware (Kahn topology) AMA wave-barrier YOK
```
- 5dk biten task serbest kalır → ready task hemen spawn. Sprint süresi ~%40 azalır (Sprint 178 dogfood kanıt).

### Implementation
- `src/orchestra/dependency-pipeline.ts` — Kahn topology + continuous dispatch; `respawnEligibleTasks()` boş slot için sıradaki eligible task seçer.
- Config `dependency_pipeline_enabled` — kod default `true` (Sprint 156/167); kullanıcı projelerinde de `true`.
- **deckent-dev ARTIK `true`** (flip 2026-06-10, `.deckent/config.json`) — otomatik multi-wave canlı-kanıtlı (Sprint 279/280 kademeli wave; ADR-045 amendment). **ADR-047 Brain-manuel wave artık yalnız FALLBACK.** Dependency-tatmin seti: `DONE ∪ MANUAL_REVIEW_REQUIRED` (Sprint 280 MRR-deadlock fix).

### W-E.4 stream bağlantısı
- E-19 "always-on tohumu" — TOPP'un evrimsel mimaride always-on agent pool ile birleşmesi; ML-driven dispatch priority (post-beta); ADR-039 self-modifying ile otomatik DAG re-shape.

### Tarihçe notu
- Sprint 195-197: deckent-dev o dönem `false` (ADR-047 manuel self-host disiplini) idi — **bu 2026-06-10'da `true`'ya çevrildi**. Eski "deckent-dev override false" notu ARTIK GEÇERSİZ.

İlgili: [[project_nervous_activation_plan]], [[project_aegis_methodology]], [[project_deckent_runtime_ecosystem]]
