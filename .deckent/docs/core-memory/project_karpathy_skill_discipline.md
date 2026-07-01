---
name: project-karpathy-skill-discipline
description: "Karpathy 4-Discipline rule — Deckent worker anchor. Andrej Karpathy software engineering philosophy AI-agent workflows için adapted. Sprint 191-197 anchor, .claude/rules/karpathy-discipline.md canonical."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Karpathy 4-Discipline = Deckent worker zorunlu disiplin** (Sprint 191 191-013 task-builder injection landed).

### 4 Discipline

1. **Think Before Coding** — Read + plan + ADR check FIRST, .plan dosyası yaz, assumption'ları listele
2. **Simplicity First** — YAGNI, existing pattern prefer, 3+ callsite olmadan abstraction yok, ADR-010 (tek runtime dep)
3. **Surgical Changes** — Minimum diff, scope.filesWrite only, reformatting yok, preserve existing behavior
4. **Goal-Driven Execution** — goCriteria mapping her satır için, honest self-assessment 3-kademe (DONE/GO_WITH_TECH_DEBT/NO_GO), false DONE > truthful NO_GO daha pahalı

### Canonical source

- `.claude/rules/karpathy-discipline.md` (proje root) — full discipline definition
- `.claude/rules/worker-default.md` — Worker rules + Karpathy anchor
- Runtime injection: `src/orchestra/task-builder.ts` `buildWorkerPrompt` Karpathy block her worker prompt'una

### Sprint anchor history

- **Sprint 191 191-013:** Karpathy 4-discipline ilk runtime inject (worker-default.md + task-builder)
- **Sprint 191 L-1..L-5:** Core wire (worker-guide.md, brain.md, auditor.md)
- **Sprint 195 195-001:** Disk-verify gate (Karpathy D1 anchor — read existing first)
- **Sprint 197 197-001:** Worker disiplinli — production wire Sprint 195'te zaten land etti, sadece 6 test ekledi (Karpathy D1+D3 + D4 anti-pattern: kod yeniden yazma)
- **Sprint 197 197-005:** Persona-task matcher canlı doğrulama (Karpathy D2 alignment)

### AEGIS ile ilişki

AEGIS makro-methodology, Karpathy mikro-discipline:
- Think Before Coding → AEGIS Iterative Refinement (PLAN phase)
- Simplicity First → AEGIS Effect Visibility (YAGNI)
- Surgical Changes → AEGIS Scope Boundary
- Goal-Driven → AEGIS Honest Self-Assessment

([[project_aegis_methodology]])

### god-level alignment

Karpathy disiplini **complete** prefer eder, MVP/minimum'a karşı (`[[feedback_no_minimum_no_mvp_deckent]]`). YAGNI gereksiz abstraction'ı yasaklar AMA full pattern'i değil — "complete vision, narrow execution".

### W-L stream (Sprint 191-199)

Karpathy refactor work stream:
- L-1..L-5: Core wire (worker-default, brain.md, auditor.md, task-builder, worker-guide)
- L-6..L-9: Agent PROMPT.md Karpathy refactor (5 ek)
- L-10..L-11: Skill SKILL.md Karpathy refactor (5 ek)
- L-12..L-20: Skill tail (10 daha)
- L-26..L-41: Skill genişleme
- L-43..L-44: Lint guard + prompt builder Karpathy inject doğrulama

### Anti-pattern (Karpathy ihlali)

- Worker `.plan` dosyası yazmıyor → D1 violation
- 1-callsite helper function → D2 violation
- Scope dışı reformatting → D3 violation
- DONE iddiası + tests fail → D4 violation

İlgili: [[project_aegis_methodology]], [[feedback_prompt_completeness_over_brevity]]
