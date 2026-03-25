# DIRECTIVES — Sprint 063: Epic→Multi-Sprint Decomposition

## Goal: Büyük hedefleri otomatik alt-sprint'lere böl. "Build me an e-commerce site" → 5 sprint, sıralı execution, cross-sprint MEMORY.

---

## Task 1: Epic Planner
- Model: opus
- Effort: high
- Files: src/orchestra/epic-planner.ts (new), src/core/epic-types.ts (new)
- Scope: src/orchestra/, src/core/

### Description
`EpicPlanner` class: büyük hedefi alt-sprint'lere böl. Input: natural language goal + project analysis. Output: EpicPlan { sprints: SprintGoal[], dependencies: string[][], estimatedTotal: number }. AI planner'ı kullan (mevcut planner.ts pattern). Zod validation. Max 10 sprint per epic.
10+ test.

---

## Task 2: Sequential Sprint Executor
- Model: opus
- Effort: high
- Files: src/orchestra/epic-executor.ts (new), src/orchestra/sprint-controller.ts
- Scope: src/orchestra/

### Description
EpicPlan'ı sırayla execute et: Sprint 1 → evaluate → Sprint 2 → ... Her sprint arası MEMORY güncelle. Önceki sprint'in sonuçlarını sonraki sprint'in context'ine ekle. Pause/resume epic level. `deckent start --epic "Build e-commerce site"`.
10+ test.

---

## Task 3: Epic Progress Tracking
- Model: sonnet
- Effort: normal
- Files: src/orchestra/epic-tracker.ts (new), src/api/server.ts
- Scope: src/orchestra/, src/api/

### Description
Epic durumunu .deckent/epics/{id}.json'a kaydet. API endpoint: GET /api/epic/{id} → progress. Dashboard'da epic view (sprint listesi, overall progress). `deckent status --epic` komutu.
5+ test.

---

## Task 4: Cross-Sprint Context
- Model: sonnet
- Effort: normal
- Files: src/orchestra/cross-sprint-context.ts (new)
- Scope: src/orchestra/

### Description
Sprint N'in sonuçlarını Sprint N+1'in DIRECTIVES'ine otomatik ekle: "Önceki sprint'te Auth tamamlandı, şimdi Products üzerine çalış. Auth modülü src/auth/ altında, JWT token formatı: ...". MEMORY + git diff + task results birleştir.
5+ test.

---

## Quality Rules
- Epic plan Zod-validated
- Cross-sprint MEMORY tutarlı
- Epic pause/resume çalışır
- 10+ sprint'lik epic test
