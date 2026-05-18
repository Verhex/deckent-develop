# Analysis: src/cli/commands/resume.ts
**Task ID:** 141-003 | **LoC:** 100

## 1. Amacı
Sprint checkpoint'ten devam etme MVP. readCheckpoint + runSprint çağırır.

## 2. Public API
- `registerResume(program)`, `listCheckpointedSprints(projectRoot)`

## 3. İç + Dış Bağımlılıklar
- `../../orchestra/brain.js` (runSprint)
- `../../orchestra/sprint-checkpoint.js` (readCheckpoint, hasCheckpoint)

## 4. Complexity Cyclomatic: ~3. Basit checkpoint + runSprint.

## 5-13.
Type Safety: `opts.root ?? resolveProjectRoot()` — --root override ✅.
Comment: "Sprint 140+ will add mid-worker resume" — future work belgelenmiş.
Memory V2: N/A. Verdict: ANALYZED
