---
name: project-topp-continuous-dispatch
description: TOPP (Topology-Optimized Parallel Pipeline) — continuous-dispatch wave-barrier removal. ADR-064 accepted Sprint 178. Wave-based execution yerine flag-agnostik fan-out. W-E.4 stream ile bağlı.
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**TOPP = Topology-Optimized Parallel Pipeline** — Brain spawn coordination'ı için wave-barrier yerine continuous-dispatch pattern. **ADR-064 accepted Sprint 178**, supersedes ADR-045 §3 wave-barrier semantic.

### Problem (pre-TOPP, ADR-045 wave-barrier)

```
DALGA 0 (1 task) → DALGA 1 (3 task paralel) → BARRIER → DALGA 2 (2 task)
```

- DALGA 1'in 3 task'ı sırasıyla 5/10/30 dakika sürdüğünde, **30 dakika hep beklenir**
- En yavaş worker barrier'ı tutar — fan-out ineffective
- DALGA 2 task'lar gereksiz yere PENDING

### TOPP solution (continuous-dispatch)

```
Worker pool (max_workers slots)
  → Bir slot boşaldıkça SıraDaki ELIGIBLE task spawn
  → Dependency-aware (Kahn topology) AMA wave-barrier YOK
  → DAG'taki tüm ready node'lar her an dispatched
```

- DALGA 1'in 5dk biten task'ı serbest kalır → DALGA 2'nin ready task'ı hemen spawn
- 30dk worker hâlâ çalışırken, paralelde 4-5 task daha
- Sprint süresi ~%40 azalır (Sprint 178 dogfood kanıt)

### Implementation

- `src/orchestra/dependency-pipeline.ts` — Kahn topology + continuous dispatch
- `respawnEligibleTasks()` — boş slot için sıradaki eligible task seç (13 grep match — Beta gate 18)
- Config `dependency_pipeline_enabled` flag — default `true` (Sprint 167)
- Deckent-dev override `false` (ADR-047 manuel subagent dispatch) — self-host disipline

### W-E.4 stream bağlantısı

- E-19 "always-on tohumu" — TOPP continuous-dispatch'in evrimsel mimari'de always-on agent pool ile birleşmesi
- ML-driven dispatch priority (post-beta)
- Self-modifying agent (`ADR-039`) ile TOPP otomatik DAG re-shape

### Sprint 178 (ADR-064) hikayesi

8 simultan failure mode'dan biri "wave-barrier rot" → TOPP B+C continuous-dispatch landed:
- B = Backpressure (slot boşalmadan spawn yok)
- C = Continuous (state-change-only dispatch trigger)
- Wave-barrier kalkar, flag-agnostik fan-out

### Beta scope

- **Beta INCLUDE:** TOPP B+C live Sprint 178'den itibaren
- **Post-beta:** ML-driven priority, always-on agent pool (W-E.4 E-19)

### Sprint 195-197 impact

- Sprint 195: 5 task, dependency_pipeline_enabled=false (deckent-dev override), wave-based manuel — TOPP yok
- Sprint 196: aynı manuel pattern
- Sprint 197: aynı — ADR-047 manuel subagent dispatch self-host disiplini için
- Kullanıcı projelerinde TOPP default ON

İlgili: [[project_nervous_activation_plan]], [[project_aegis_methodology]], [[project_deckent_agentic_os_vision]]
