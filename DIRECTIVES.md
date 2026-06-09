# DIRECTIVES — Sprint: WM-1b routing — MCP + autonomous paths (claude)

## Goal: Complete WM-1b — extend the single-task agent/skill routing (already wired into CLI `deckent run`) to the other two single-task paths: MCP `deckent_run` and autonomous `runTaskMode`. So ALL three paths route to the right specialist (not hardcoded `generic`), benefiting from WM-7 stack-aware routing. Mirror the CLI implementation exactly: V2 routing after resolveToTask, override-preserving, fail-safe. Fleet: **claude only**. **Code tasks, Tier-0 (internal src/).**

## Ortak kurallar
- CODE task → `npx tsc --noEmit` clean. Run ONLY the TARGETED test file(s) for the touched module (NOT the full suite — unrelated pre-existing failures). Additive / surgical / minimum-diff. Stay in `scope.filesWrite`.
- Pattern to mirror: `src/cli/commands/run.ts` already does this (search for "WM-1b: V2 routing" — AgentPoolManager.loadAgents + SkillPoolManager + detectProjectStack + routeTaskV2 → set task.assignedAgent/assignedSkills; override-preserving via UserOverride; fail-safe try/catch → 'generic' fallback). Reuse the SAME approach.
- "Bir süre test yok": no NEW suites; keep targeted tests green. `.tasks/task-XXX.result` honest.

---

## Task 1: WM-1b/MCP — route agent+skills in MCP `deckent_run`
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/mcp/tools/run.ts
- Scope: src/mcp/tools/
- Dependencies:

### Description
The MCP `deckent_run` path (`src/mcp/tools/run.ts`) builds the task via `buildExecutionRequest`→`resolveToTask` (WM-1) but still uses `generic` agent + empty skills. Mirror the CLI `run.ts` WM-1b routing: after `resolveToTask(...)` and before `resolveAgentPrompt`/`buildWorkerPrompt`, run V2 routing (AgentPoolManager.loadAgents + SkillPoolManager.loadSkills + detectProjectStack + routeTaskV2) and set `task.assignedAgent`/`task.assignedSkills` from the decision. Override-preserving + fail-safe (try/catch → 'generic'). Keep it surgical in `src/mcp/tools/run.ts`. `npx tsc --noEmit` + `npx vitest run tests/mcp/tools/run.test.ts` pass.

**Kanıt:** `grep -n "routeTaskV2\|assignedAgent" src/mcp/tools/run.ts` → routing wired; tsc PASS; `npx vitest run tests/mcp/tools/run.test.ts` PASS. **Test:** targeted.

---

## Task 2: WM-1b/autonomous — route agent+skills in `runTaskMode`
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/task-mode-runner.ts
- Scope: src/orchestra/
- Dependencies:

### Description
The autonomous `runTaskMode` path (`src/orchestra/task-mode-runner.ts`) builds the task via `buildExecutionRequest`→`resolveToTask` (WM-1) but uses `generic` agent + empty skills. Mirror the CLI `run.ts` WM-1b routing: after `resolveToTask(...)` and before `resolveAgentPrompt`/`buildWorkerPrompt`, run V2 routing (AgentPoolManager + SkillPoolManager + detectProjectStack + routeTaskV2) and set `task.assignedAgent`/`task.assignedSkills`. Override-preserving + fail-safe (try/catch → keep 'generic'; autonomous must never break). Surgical in `src/orchestra/task-mode-runner.ts`. `npx tsc --noEmit` + `npx vitest run tests/orchestra/task-mode-runner.test.ts tests/orchestra/task-mode-agent-inject.test.ts` pass.

**Kanıt:** `grep -n "routeTaskV2\|assignedAgent" src/orchestra/task-mode-runner.ts` → routing wired; tsc PASS; targeted tests PASS. **Test:** targeted.

---

**Beklenen:** 2/2 DONE, claude MCP+autonomous'a CLI'daki routing'i aynaladı → 3 path de routing'li (single-task routing TAM). tsc temiz + TARGETED testler yeşil. CC sprint-sonu verify. Döngü: bu bitince sonraki MASTER-PLAN item (WM-5 provider-free hard-enforce veya autonomous-ollama-gap).
