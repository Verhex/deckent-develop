---
name: project-aegis-methodology
description: "AEGIS (Agentic Effect-Governed Iterative Stewardship) methodology — Deckent'ın agentic orchestration prensipleri, ADR-061 (proposed), W-E.5 stream, ICSE/FSE 2027 paper hedefi, agentaegis.io standard draft Sprint 200 milestone."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**AEGIS = Agentic Effect-Governed Iterative Stewardship**

**Tanım:** AI-agent orchestration için bir methodology — her agent action **effect-governed** (gerçek dünya etkisi izlenir + audit), **iterative** (sprint döngüsüyle gelişir), **stewardship** (autonomous değil, human-in-loop authorized).

### 5 Core Discipline

1. **Effect Visibility** — Her agent eylem audit trail'e yazılır (HMAC chain, ADR-037)
2. **Scope Boundary** — Worker scope.filesWrite içinde kalır, git diff --stat ile doğrulanır
3. **Honest Self-Assessment** — DONE / GO_WITH_TECH_DEBT / NO_GO 3-kademe; sahte DONE > truthful NO_GO daha maliyetli
4. **Iterative Refinement** — Sprint 8-faz lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP)
5. **Stewardship Authority Matrix** — Brain (orchestrator) + Auditor (observer) + Worker (executor) RBAC ADR-037

### Karpathy 4-Discipline ile ilişki

AEGIS makro-methodology, Karpathy mikro-discipline:
- **Think Before Coding** → AEGIS Iterative Refinement (PLAN phase first)
- **Simplicity First** → AEGIS Effect Visibility (YAGNI = no spurious effect)
- **Surgical Changes** → AEGIS Scope Boundary (minimum-diff)
- **Goal-Driven Execution** → AEGIS Honest Self-Assessment (goCriteria mapping)

([[project_karpathy_skill_discipline]])

### ADR-061 (proposed)

`docs/decisions/061-aegis-methodology.md` — Sprint 196-199 W-E.5 stream'i ile accepted'a geçirilir. Hibrit format MADR v3.

### agentaegis.io standard draft

- **Sprint 200 milestone:** Public standard draft yayını
- **W-I stream (Sprint 200-202):** OSS publish pipeline + community
- **Akademik:** ICSE 2027 veya FSE 2027 paper submission ("AEGIS: Agentic Effect-Governed Iterative Stewardship")
- **Certification:** "AEGIS-compliant orchestrator" sertifika framework — Deckent ilk implementation

### Self-modifying agents için AEGIS

ADR-046 (Brain Self-Update Hook) + ADR-064 (TOPP Continuous Dispatch) + ADR-039 (Self-Modifying Task Detection) AEGIS prensipleriyle uyumlu:
- Effect Visibility → self-modifying event'leri audit trail'e
- Stewardship → Alperen onayı self-modify accept/reject
- Honest Assessment → self-modify NO_GO durumunda revert

### W-E.5 task adayları (Sprint 196-199)

- E-20: AEGIS spec doküman (`docs/methodology/aegis-spec.md`)
- E-21: AEGIS compliance check script (`scripts/aegis-compliance.mjs`)
- E-22: agentaegis.io landing page taslağı
- E-23: ICSE/FSE 2027 paper outline

### Deckent ↔ AEGIS bidirectional

- Deckent **AEGIS-compliant** ilk implementation
- AEGIS **Deckent'ten doğdu** — dogfood loop (180+ sprint) sonrası abstract edildi
- AEGIS başka orchestrator'lara da uygulanır (vendor-agnostic)

İlgili: [[project_deckent_god_level_vision]], [[project_karpathy_skill_discipline]], [[project_topp_continuous_dispatch]]
