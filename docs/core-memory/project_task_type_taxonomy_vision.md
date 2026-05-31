---
name: project-task-type-taxonomy-vision
description: "TaskType + EnvironmentType + Hybrid Scoring 5-layer pipeline vision. ADR-053 (TaskType taxonomy) accepted, ADR-055 (Hybrid Scoring 5-layer) proposed. W-E stream'i ile bağlı."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**TaskType taxonomy + Hybrid Scoring** = Sprint 188+ proposed mimari — task'ları **kategorize et** + **çoklu boyutta scoring** uygula → evaluation accuracy ↑.

### TaskType taxonomy (ADR-053 accepted)

3 ana kategori + extensibility:

1. **Audit task** — sadece keşif/rapor, kod yazma yok (örn. Sprint 196 196-007 test categorize)
2. **Document-write task** — sadece doc/markdown (örn. Sprint 195 195-003 SECURITY/README)
3. **Code-development task** — src/ + tests/ değişikliği (varsayılan)

Her TaskType **farklı evaluation kriterleri**:
- Audit: structure check + content validation
- Document-write: link check + content check, test gerekmez
- Code-development: tsc + vitest + git diff + rubric

### EnvironmentType (proposed)

- **Local dev** — full IDE access, Docker host
- **Docker container** — worker-default
- **CI environment** — GitHub Actions, no Docker-in-Docker
- **Cloud sandbox** — future (Sprint 200+)

Her environment'ta **farklı verify pipeline**:
- Local: tsc + vitest + manual smoke
- Docker: container-side tsc + tests
- CI: GitHub Actions matrix
- Cloud: sandboxed exec

### Hybrid Scoring 5-Layer (ADR-055 proposed)

5-katmanlı evaluation pipeline:

```
1. Schema layer    — task JSON structure validation
2. Gates layer     — honest-gate + boundary check + disk-verify
3. Quality layer   — rubric (correctness, test_coverage, scope, documentation)
4. Outcome layer   — disk-verify ground truth (Sprint 195+ gate)
5. Auditor layer   — meta-evaluation (cross-task consistency, sprint-level)
```

Final verdict = `min(layer1..5)` (zayıf halka taşıma) veya weighted average (mode'a göre).

### Beta scope

- **Beta INCLUDE:** ADR-053 TaskType accepted, Layer 1-3 live
- **Post-beta:** Layer 4 (disk-verify Sprint 195+ wire), Layer 5 (Auditor meta), ADR-055 accepted'a geçiş Sprint 198-199

### W-E stream bağlantısı

- E-22 Hybrid Scoring 5-Layer implementation
- E-23 EnvironmentType detection runtime
- E-24 Adaptive scoring per environment

### Self-modifying ile uyum

- ADR-039 self-modifying detector + TaskType → "audit task self-modify ediyor mu?" (deckent-dev dogfood vs user project)
- ADR-046 self-update hook + EnvironmentType → cloud sandbox'ta different update path

İlgili: [[project_deckent_agentic_os_vision]], [[project_aegis_methodology]]
