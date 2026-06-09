# DIRECTIVES — Sprint: Multi-Provider CODE Dogfood (Sprint 255 findings → fixes)

## Goal: Full-scope CODE dogfood — deckent's workers implement two real, contained code fixes surfaced live during the Sprint 255 doc dogfood. Fleet: claude + codex (gemini excluded this round — it is capacity-exhausted/login-hanging). Workers write CODE + run the project verify (tsc + targeted tests); CC verifies on completion. **Code tasks, Tier-0 (internal src/, not user-surface).**

## Ortak kurallar
- CODE tasks → run `npx tsc --noEmit` (must stay clean) + the targeted test file(s) for the touched module. Additive / surgical / minimum-diff (Karpathy). Stay strictly within `scope.filesWrite`.
- "Bir süre test yok": do NOT author NEW test suites; keep existing tests green (update an existing test only if your change legitimately changes its asserted behavior). Mark any deferred test as TECH DEBT in the `.result` notes.
- Her worker `.tasks/task-XXX.result` yazmalı (honest selfAssessment).

---

## Task 1: GEMINI-LOGIN-HANG — gemini worker must fail-fast, never hang on interactive login
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/providers/gemini.ts
- Scope: src/providers/

### Description
During the Sprint 255 dogfood, a gemini worker hit a 429 RESOURCE_EXHAUSTED (server capacity) and the gemini CLI dropped into an interactive `gemini login` flow with no TTY — hanging until the worker timeout. A non-interactive worker must NEVER enter an interactive login. Make the gemini spawn/buildArgs non-interactive: ensure the spawn environment + args prevent an interactive login prompt (e.g. a non-interactive / `--no-browser` style flag if the gemini CLI supports it, and/or an env var that forces non-interactive auth), and if gemini cannot authenticate non-interactively, the worker should FAIL FAST (exit non-zero so the sprint NO_GOs / re-routes) rather than hang. Preserve existing behavior when auth is healthy. Keep the change surgical in `src/providers/gemini.ts` (look at the existing `buildGeminiSpawnEnv` / buildArgs / spawn). Run `npx tsc --noEmit` and `npx vitest run tests/providers/gemini.test.ts` — both must pass.

**Kanıt:** `grep -n "login\|interactive\|GEMINI_\|non-interactive\|--no" src/providers/gemini.ts` → non-interactive guard eklendi; `npx vitest run tests/providers/gemini.test.ts` → pass. **Test:** mevcut gemini testleri yeşil (yeni suite yazma).

---

## Task 2: PLAN-SCOPE-1 — planner must NOT pull description-mentioned file paths into scope.filesWrite
- Provider: codex
- Model: gpt-5
- Backend: docker
- ModelEffort: high
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts
- Scope: src/orchestra/

### Description
During the Sprint 255 dogfood, a DOC task whose description merely MENTIONED source paths (`src/core/work-model.ts`) had those paths pulled into `scope.filesWrite` + `scope.directories` by the structured-planner's scope extraction, so the task was misclassified as `code-development` (and got `tsc clean` GO criteria for a doc). The scope must come from the explicit `- Files:` / `- Scope:` directives, NOT from file-path-looking tokens in the prose description. Find the scope-extraction logic in `src/orchestra/task-builder.ts` (e.g. `extractScopeFromDirective` / the structured-directive scope parse) and make it derive `filesWrite`/`directories` ONLY from the explicit `- Files:`/`- Scope:` lines, not from path tokens elsewhere in the description body. Preserve the explicit-directive behavior exactly (existing tests must pass). Run `npx tsc --noEmit` and `npx vitest run tests/orchestra/task-builder.test.ts tests/orchestra/directive-parsing.test.ts` — both must pass.

**Kanıt:** bir doc-task açıklamasında `src/...ts` anılması scope.filesWrite'a girmemeli (REPL/test ile); `npx vitest run tests/orchestra/task-builder.test.ts` → pass. **Test:** mevcut task-builder/directive testleri yeşil.

---

**Beklenen:** 2/2 DONE, 2 src dosyası düzenlendi, claude+codex gerçekten kod yazdı + tsc temiz + targeted testler yeşil. CC disk-verify + tsc + test koşar, doğrular. Multi-provider CODE dogfood — deckent kendi bulgularını kendi düzeltir.
