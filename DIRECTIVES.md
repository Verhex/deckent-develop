# DIRECTIVES — Sprint: WM-1b single-task routing (claude)

## Goal: WM-1b — wire real agent/skill routing into the single-task CLI path so `deckent run "fix the Go auth bug"` is routed to the right specialist (bug-fixer + the stack-prime / correct skills via WM-7), instead of the current hardcoded `generic` agent + empty skills. This completes WM-1 (the ExecutionRequest unification already sets task.type + provider; routing is the missing piece) and lets single-task runs benefit from WM-7 stack-aware routing + the language-mismatch penalty. Fleet: **claude only**. **Code task, Tier-0 (internal src/).**

## Ortak kurallar
- CODE task → `npx tsc --noEmit` clean. Run ONLY the TARGETED test file(s) for the touched module (e.g. `tests/cli/commands/run.test.ts`), NOT the full suite (it has unrelated pre-existing failures). Additive / surgical / minimum-diff (Karpathy). Stay in `scope.filesWrite`.
- "Bir süre test yok": do NOT author NEW test suites; keep existing targeted tests green. Mark deferred tests as TECH DEBT in `.result` notes.
- `.tasks/task-XXX.result` honest selfAssessment (tsc + TARGETED tests).

---

## Task 1: WM-1b — route agent + skills for the CLI `deckent run` single-task path
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/cli/commands/run.ts
- Scope: src/cli/commands/

### Description
Today the CLI `deckent run` path (`src/cli/commands/run.ts`) builds the task via `buildExecutionRequest` → `resolveToTask`, which sets `assignedAgent: 'generic'` + `assignedSkills: []` (no routing). Wire real routing so the task gets the right agent + skills. After `resolveToTask(...)` and BEFORE `resolveAgentPrompt`/`buildWorkerPrompt`, run the same V2 routing the planner uses: load the agent pool + skills, detect the project stack, classify the task, call `routeTaskV2(...)` (see how `src/orchestra/sprint-planner.ts` does its `routingVersion === 'v2'` block: `AgentPoolManager`, `SkillPoolManager`, `detectProjectStack`, `classifyIntent`, `routeTaskV2`), and set `task.assignedAgent` + `task.assignedSkills` from the routing decision. Respect explicit overrides: if the user passed an explicit agent/skill (or the task already carries forceAgent/forceSkills), DO NOT override them. Best-effort + fail-safe: if routing throws, fall back to the current `generic` behavior (never break `deckent run`). Keep the change inside `run.ts`. Because run.ts is a user-surface CLI file, include a `Smoke:` proof.

**Smoke:** `node dist/cli/entry.js run "fix the auth bug" --scope src/ --help` is not meaningful; instead REPL-verify routing: a task whose description/scope implies bug-fixing routes to a non-generic agent (e.g. bug-fixer) — show via a small node snippet calling the routing path, OR assert in `tests/cli/commands/run.test.ts` that assignedAgent is no longer hardcoded 'generic' when routing succeeds.

**Kanıt:** `grep -n "routeTaskV2\|AgentPoolManager\|assignedAgent" src/cli/commands/run.ts` → routing wired; `npx tsc --noEmit` PASS; `npx vitest run tests/cli/commands/run.test.ts` PASS (TARGETED only). **Test:** targeted, mevcut yeşil + (varsa) routing assertion.

---

**Beklenen:** 1/1 DONE, claude `deckent run`'a routing wire etti (generic-hardcode kalktı, override'lar korundu, fail-safe), tsc temiz + TARGETED run testleri yeşil. CC sprint-sonu disk-verify + tsc + targeted-test + diff-review + REPL (run → doğru agent) yapar. Döngü: bu bitince sonraki MASTER-PLAN item.
