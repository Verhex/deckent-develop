# DIRECTIVES — Sprint: CODE Dogfood (loop-critical fixes, claude-weighted)

## Goal: Two claude-authored code fixes that make the dogfood LOOP clean: (1) CODE-FULLSUITE-NOGO — code-task workers should self-verify with TARGETED tests for the module they touched, not the full suite (whose ~67 pre-existing failures cause false self-NO_GO); (2) GEMINI-LOGIN-HANG (real) — the gemini worker must fail FAST when it drops into an interactive login / 429, not waste the full worker timeout. Fleet: **claude only** (Anthropic models carry code work; codex/gemini secondary this round). **Code tasks, Tier-0 (internal src/).**

## Ortak kurallar
- CODE tasks → `npx tsc --noEmit` must stay clean. Run ONLY the TARGETED test file(s) for the module you change (NOT the full suite — it has unrelated pre-existing failures). Additive / surgical / minimum-diff (Karpathy). Stay in `scope.filesWrite`.
- "Bir süre test yok": do NOT author NEW test suites; keep existing targeted tests green. Mark deferred tests as TECH DEBT in `.result` notes.
- Her worker `.tasks/task-XXX.result` yazmalı (honest selfAssessment based on TARGETED tests + tsc).

---

## Task 1: CODE-FULLSUITE-NOGO — worker self-verify must be TARGETED, not full-suite
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/prompt-god-template.ts
- Scope: src/orchestra/

### Description
Code-task workers currently self-verify by running the FULL vitest suite (`npx vitest run`), so the project's pre-existing/unrelated failures (~67, e.g. stale model-id test expectations, env-dependent provider/ollama tests) trip a FALSE self-NO_GO even when the worker's own change is correct + its targeted tests pass. Update the worker VERIFY section in `src/orchestra/prompt-god-template.ts` (the non-doc / code verify-steps block) so the worker is instructed to run the TARGETED test file(s) for the module(s) it changed (e.g. the matching `tests/**/<module>.test.ts`), NOT the whole suite — and to base its self-assessment on (a) `tsc --noEmit` clean + (b) those targeted tests passing. Explicitly note that the full suite may contain unrelated pre-existing failures that must NOT cause a NO_GO. Keep the doc-only verify gate (MF-1) untouched. Surgical edit to the verify-section string only.

**Kanıt:** `grep -n "targeted\|full suite\|pre-existing\|vitest run" src/orchestra/prompt-god-template.ts` → targeted-verify guidance eklendi; `npx tsc --noEmit` PASS; `npx vitest run tests/orchestra/prompt-god-template.test.ts` (varsa) PASS. **Test:** targeted, mevcut yeşil.

---

## Task 2: GEMINI-LOGIN-HANG (real) — fail fast on interactive login / 429, don't hang
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/providers/gemini.ts
- Scope: src/providers/

### Description
The prior fix (`GEMINI_NONINTERACTIVE=1` env) is a no-op — the gemini CLI's non-interactive mode is `-p/--prompt` (already used), and on a 429 RESOURCE_EXHAUSTED the CLI can still drop into an interactive `gemini login` flow and hang until the worker timeout (~1200s). Implement a REAL fast-fail in `src/providers/gemini.ts`: in the gemini spawn path, watch the child process stdout/stderr; if it emits a login/auth prompt or repeated `429`/`RESOURCE_EXHAUSTED`/`No capacity` lines (indicating it cannot proceed non-interactively), kill the child and exit non-zero promptly (seconds, not 20 minutes) so the sprint NO_GOs / re-routes fast. Keep the harmless GEMINI_NONINTERACTIVE env (documents intent) but make the fast-fail the real guard. Preserve healthy-auth behavior. Run `npx tsc --noEmit` + `npx vitest run tests/providers/gemini.test.ts` — both pass.

**Kanıt:** `grep -n "429\|RESOURCE_EXHAUSTED\|login\|kill\|fast" src/providers/gemini.ts` → fast-fail guard eklendi; `npx vitest run tests/providers/gemini.test.ts` PASS. **Test:** targeted, mevcut yeşil.

---

**Beklenen:** 2/2 DONE, claude gerçek kod yazdı, tsc temiz + TARGETED testler yeşil (full-suite KOŞULMAZ → false-NO_GO yok). CC sprint-sonu disk-verify + tsc + targeted-test + diff-review yapar, gerekirse fix/genişletir. Döngü: bu bitince sonraki MASTER-PLAN item'ı.
