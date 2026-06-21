# agents#1 — agents subsystem (adaptive-agent, genealogy, retirement, agentic-worker entry/runner/tools)

Code-only audit (read-only). Every finding carries `file:line` + proving snippet. Zero-caller /
dormancy claims verified by repo grep across `src/` (test + definition sites excluded from the
"caller" count). Scope: 6 files —
`adaptive-agent.ts`, `agent-genealogy.ts`, `agent-retirement.ts`,
`agentic-worker-entry.ts`, `agentic-worker-runner.ts`, `agentic-worker-tools.ts`.

## Findings

### src/agents/adaptive-agent.ts

- [unwired|low] `adaptAgent()` export has zero production callers — `src/agents/adaptive-agent.ts:230` — `export function adaptAgent(agentId, currentPrompt, recentResults): AdaptResult` — grep of `src/` for `\badaptAgent\(` returns only this def site (`:230`) and its internal helper calls (`:235-236`); the only *wired* entrypoint is the sibling `adaptAgentRuntime`, imported by `orchestra/outcome-tracker.ts:12` (call `:230`) and `orchestra/promotion-pipeline.ts:16` (call `:295`). `adaptAgent` itself is referenced only in `tests/agents/adaptive-agent.test.ts`. The header comment "import adaptAgent() from this module to wire outcome-based adaptation" (`:4`) is stale — `adaptAgentRuntime` is the live wire, `adaptAgent` is dead surface.

- [dormant|low] `MIN_SPRINTS_FOR_ANALYSIS` gate is inert (always-true term) — `src/agents/adaptive-agent.ts:31` + `:135-137` — `const MIN_SPRINTS_FOR_ANALYSIS = 1;` then `needsImprovement = recentSprintIds.length >= MIN_SPRINTS_FOR_ANALYSIS && successRate < IMPROVEMENT_THRESHOLD`. The function already early-returns when `recent.length === 0` (`:117-119`), so by `:136` `recentSprintIds` has length ≥ 1 unconditionally; `>= 1` can never be false. The threshold filters nothing — a no-op gate that reads as a tunable but isn't.

- [inconsistent|medium] `suggestPromptChange` dispatches on English label substrings, not the stable `id` — `src/agents/adaptive-agent.ts:165-198` — `if (weakness.includes('NO_GO')) … if (weakness.includes('coverage')) … if (weakness.includes('Declining')) … if (weakness.includes('Tech debt')) … if (weakness.includes('Inconsistent'))` match against `WEAKNESS_PATTERNS[].label` (the human-facing strings at `:45,53,63,76,84`). The sibling `adaptAgentRuntime` resolves the SAME taxonomy via the stable `pattern.id` through `WEAKNESS_SKILL_MAP` (`:258-263`, `:276`). Two divergent dispatch strategies for one weakness set; the label path is i18n-fragile (labels are hardcoded EN) and double-fires: the `inconsistent-coverage` label `'Inconsistent coverage — high variance between tasks'` satisfies BOTH `.includes('coverage')` (→ "Test Coverage" section) and `.includes('Inconsistent')` (→ "Consistency" section), so one weakness injects two prompt sections.

### src/agents/agent-genealogy.ts

- [unwired|low] Five public `AgentGenealogy` methods have zero production callers — `src/agents/agent-genealogy.ts:83` (`findCommonAncestor`), `:101` (`getDescendants`), `:123` (`getChildren`), `:134` (`getParent`), `:142` (`hasAgent`) — grep of `src/` for these call sites returns only the production-wired trio `registerAgent`/`removeAgent`/`buildFamilyTree` (`orchestra/promotion-pipeline.ts:175,208,244,344` and `api/evolution-endpoint.ts:27`). The five above are exercised only in `tests/agents/agent-genealogy.test.ts` / `tests/orchestra/agent-genealogy-wire.test.ts`. Public surface is wider than the wired need (dead read-side API).

### src/agents/agent-retirement.ts

- [root-cause|medium] `retire()` persists a hardcoded-0 metric `sprintsParticipated: 0` — `src/agents/agent-retirement.ts:124` — within the `RetiredAgentRecord` builder, `successRate` and `totalUses` are read from `agentData.stats` (`:118-123`) but `sprintsParticipated: 0,` is a constant. Every retired record therefore reports zero sprints participated regardless of the agent's real history; `listRetired()` (`:181-205`) then surfaces that fabricated 0 to `api/evolution-endpoint.ts:35`. The same field is a real retirement criterion in `evaluateForRetirement` (`:72,79`), so the persisted record contradicts the evaluation input.

- [unwired|low] `reinstate()` has zero production callers — `src/agents/agent-retirement.ts:151` — `reinstate(agentId): boolean` — grep of `src/` shows only `evaluateForRetirement`/`retire`/`listRetired` are called in production (`orchestra/promotion-pipeline.ts:257,260`, `api/evolution-endpoint.ts:35`); `reinstate` appears only here + `tests/agents/agent-retirement.test.ts`. The retire direction is wired; the inverse (un-retire) is dormant — retired agents have no live path back to the active pool.

### src/agents/agentic-worker-entry.ts

- [inconsistent|high] NO_GO/error path emits fabricated `testsPassed:false, coverage:0` while the success path emits honest `null` — `src/agents/agentic-worker-entry.ts:176-177` vs `:308-309` — `buildNoGoResult` writes `testsPassed: false, coverage: 0`, but the file's own doc comment (`:78-84`) declares "The previous hardcoded `false`/`0` was a fabricated measurement that suppressed Brain's anti-regression signal" and `buildResultFromRunner` honors that with `testsPassed: runResult.testsPassed ?? null` + `coverage: null`. `EntryResultFile` already types both fields as nullable (`:91-92`), so `null` is available on the NO_GO path too. `buildNoGoResult` is used on missing-argv (`:349`), unreadable task.json (`:363`), and runner-throw (`:393`) — all genuine "no tests measured" cases — yet each writes the exact fabricated values the comment says were removed. Same two fields, two opposite conventions inside one module.

### src/agents/agentic-worker-runner.ts

- [root-cause|medium] `testsPassed` is inferred from a string-suffix sniff of bash output, not a structured exit code — `src/agents/agentic-worker-runner.ts:220-223` + `:480-485` — `bashOutputSuggestsFailure(output)` is `/\[exit\s+\d+\]\s*$/.test(output.trim())`, and `testsPassed = !bashOutputSuggestsFailure(result)` (`:483`). The green/red signal Brain ingests depends entirely on `chat-tool-exec.defaultBashRun` appending a trailing `[exit N]` marker for non-zero exits. A test runner that exits 0 while tests fail, or any output where the `[exit N]` token is not the final token, is silently recorded as `testsPassed: true`. trust-without-verify: a cross-module formatting convention substitutes for the real exit status.

- [inconsistent|low] `run_bash` sniffer reads an unadvertised `command` arg alias — `src/agents/agentic-worker-runner.ts:481` (`String(args['cmd'] ?? args['command'] ?? '')`) — but the advertised schema only defines `cmd` (`src/agents/agentic-worker-tools.ts:91-98`, `required: ['cmd']`). The model is never told about `command`, so the `?? args['command']` fallback is unreachable defensive code that diverges from the published tool contract.

### src/agents/agentic-worker-tools.ts

- No unwired/dormant/inconsistent findings internal to this file: it is a pure schema module and all five schemas are consumed via `OLLAMA_TOOLS` (`:123-129`) by the runner (`agentic-worker-runner.ts:316`). The schema/runtime `cmd` vs `command` mismatch is filed under the runner (above).

### Tests (dead-test scan)

- No `*.skip` / `*.todo` / `xit` / `xdescribe` found in the target test files (`adaptive-agent*.test.ts`, `agent-genealogy.test.ts`, `agent-retirement.test.ts`, `agentic-worker-entry.test.ts`, `agentic-worker-runner.test.ts`). The agentic-worker tests are fetch-mock based (injected `fetchImpl`/`runner` deps), which is the intended hermetic seam (`agentic-worker-entry.ts:99-104`, `agentic-worker-runner.ts:73-83`), not a dead-test smell.

## Summary

- 9 findings: 1 high (`agentic-worker-entry` NO_GO-path fabricated `false`/`0` contradicting the module's own documented `null` standard), 4 medium (label-substring dispatch divergence; retirement `sprintsParticipated:0` hardcoded-0-metric; `testsPassed` string-sniff trust-without-verify), 4 low (`adaptAgent`/`reinstate`/5 genealogy methods unwired; inert `MIN_SPRINTS_FOR_ANALYSIS` gate; unadvertised `command` arg alias).
- Category tally — unwired: 3 · dormant: 1 · inconsistent: 3 · dead-test: 0 · root-cause: 2.
- Highest-leverage fix: align `buildNoGoResult` (`agentic-worker-entry.ts:176-177`) and the retirement record (`agent-retirement.ts:124`) with the project's "null = not measured / no fabricated metric" standard — both currently feed Brain measurements that were never taken.
- Secondary: collapse the two weakness-dispatch strategies in `adaptive-agent.ts` onto the stable `pattern.id` (drop English-substring matching) and replace the runner's `testsPassed` string-sniff with a structured exit code from the dispatcher.
- All findings are read-only observations; no source was modified by this task.
