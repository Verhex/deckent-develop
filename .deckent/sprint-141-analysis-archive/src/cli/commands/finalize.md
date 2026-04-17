# Analysis: src/cli/commands/finalize.ts
**Task ID:** 141-003 | **LoC:** 185

## 1. Amacı
Sprint finalizasyonunu manuel tetikler. brain.js:finalizeSprint çağırır. Sprint zaten finalize edildiyse guard, incomplete task guard, mixed sprint detection.

## 2. Public API
- `registerFinalize(program)`, `detectIncompleteTasks(tasks)`, `detectMixedSprints(tasks)`

## 3. İç + Dış Bağımlılıklar
- `../../orchestra/brain.js` (finalizeSprint)
- `../../orchestra/sprint-controller.js` (evaluateResult)
- `./review.js` (loadReviewState)

## 4. Complexity
Cyclomatic: ~5. Sprint guard, incomplete guard, duplicate guard.

## 5. Type Safety
`buildSprintFromTasks` — return type explicit ✅.

## 6. ADR Compliance ✅. finalizeSprint API-level çağrı.

## 7-13.
Review state entegrasyonu: rejected task → NO_GO ✅.
Memory V2: brain.js:finalizeSprint DB'ye yazıyor (dolaylı) ✅.
Verdict: ANALYZED
