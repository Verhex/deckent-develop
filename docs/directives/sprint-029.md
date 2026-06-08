# DIRECTIVES — Sprint 029 (Agent Pool Core + Brain Integration)

## Goal: Implement the dynamic agent pool system. Agents are specialized worker personas with custom prompts, tool constraints, and model preferences. Brain selects the best agent for each task. 30 tasks — all opus model, effort high.

---

## Task 1: AgentDefinition Type
- Model: opus
- Effort: high
- Files: src/core/agent-types.ts (new), tests/core/agent-types.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Define AgentDefinition interface: id, name, description, systemPrompt, expertise[], allowedTools[], deniedTools[], preferredModel, effortMultiplier, triggerKeywords[], triggerScopes[], triggerFilePatterns[], persistent (boolean), source ('builtin'|'user'|'learned'), stats ({totalUses, successRate, avgCoverage, lastUsedInSprint}). Also define AgentPool type as Map<string, AgentDefinition>. Export AgentSelectionResult type: {agent: AgentDefinition | null, score: number, reason: string}. 15+ tests for type validation.

### Tests
- AgentDefinition fields validated
- AgentPool map operations
- AgentSelectionResult structure
- 15+ tests

---

## Task 2: AgentPool Class — Load & Save
- Model: opus
- Effort: high
- Files: src/core/agent-pool.ts (new), tests/core/agent-pool.test.ts (new)
- Scope: src/core/, tests/core/

### Description
AgentPool class: loadAgents(projectRoot) reads .deckent/agents/*/agent.json, saveAgent(agent), removeAgent(id), getAgent(id), listAgents(), listEnabled(). Support persistent agents (.deckent/agents/) and temp agents (.tasks/agents/). Create/delete temp agents per sprint lifecycle. 15+ tests.

### Tests
- loadAgents reads agent.json files
- saveAgent writes correctly
- removeAgent deletes directory
- Persistent vs temp agent separation
- 15+ tests

---

## Task 3: Agent Selector Algorithm
- Model: opus
- Effort: high
- Files: src/core/agent-selector.ts (new), tests/core/agent-selector.test.ts (new)
- Scope: src/core/, tests/core/

### Description
selectAgent(task, pool) algorithm: 1) Extract keywords from task title+description, 2) Score each agent: +2 per keyword match, +3 per scope overlap, +1 per file pattern match, 3) Threshold score >= 3 to select, 4) Tie-break by successRate, 5) Return AgentSelectionResult with best agent or null (generic worker). Also extractKeywords(text): string[] utility. 20+ tests.

### Tests
- Keyword extraction from title+description
- Score calculation correct
- Threshold filtering
- Tie-break by success rate
- Returns null when no match
- 20+ tests

---

## Task 4: Built-in Agent — security-auditor
- Model: opus
- Effort: high
- Files: .deckent/agents/security-auditor/agent.json (new), .deckent/agents/security-auditor/PROMPT.md (new)
- Scope: .deckent/agents/

### Description
Security auditor agent definition. triggerKeywords: [security, auth, jwt, csrf, xss, injection, encryption, vulnerability, oauth, password, token, session]. triggerScopes: [src/auth/, src/middleware/, src/security/]. preferredModel: opus. allowedTools: [Read, Grep, Bash, Write]. PROMPT.md: security-focused system prompt with OWASP checklist, threat modeling, secure coding practices. 5+ tests.

### Tests
- agent.json valid
- PROMPT.md exists and has content
- Trigger keywords correct
- 5+ tests

---

## Task 5: Built-in Agent — test-writer
- Model: opus
- Effort: high
- Files: .deckent/agents/test-writer/agent.json (new), .deckent/agents/test-writer/PROMPT.md (new)
- Scope: .deckent/agents/

### Description
Test writer agent. triggerKeywords: [test, coverage, spec, vitest, jest, unit, integration, e2e, mock, assert, fixture]. triggerScopes: [tests/]. preferredModel: sonnet. PROMPT.md: testing expert prompt with coverage targets, mock patterns, assertion best practices. 5+ tests.

### Tests
- agent.json valid
- PROMPT.md content
- 5+ tests

---

## Task 6: Built-in Agent — doc-writer
- Model: opus
- Effort: high
- Files: .deckent/agents/doc-writer/agent.json (new), .deckent/agents/doc-writer/PROMPT.md (new)
- Scope: .deckent/agents/

### Description
Documentation writer agent. triggerKeywords: [docs, readme, changelog, guide, tutorial, jsdoc, tsdoc, documentation, api-docs]. triggerScopes: [docs/]. preferredModel: sonnet. allowedTools: [Read, Write]. PROMPT.md: documentation standards, Keep a Changelog format, JSDoc conventions. 5+ tests.

### Tests
- agent.json valid
- PROMPT.md content
- 5+ tests

---

## Task 7: Built-in Agent — code-reviewer
- Model: opus
- Effort: high
- Files: .deckent/agents/code-reviewer/agent.json (new), .deckent/agents/code-reviewer/PROMPT.md (new)
- Scope: .deckent/agents/

### Description
Code reviewer agent. triggerKeywords: [review, refactor, quality, lint, cleanup, code-review, pr-review]. triggerScopes: [src/]. preferredModel: opus. allowedTools: [Read, Grep]. deniedTools: [Write]. PROMPT.md: code review checklist, severity levels (CRITICAL/HIGH/MEDIUM/LOW), focus on correctness + security + quality. 5+ tests.

### Tests
- agent.json valid
- deniedTools set
- 5+ tests

---

## Task 8: Built-in Agent — refactorer
- Model: opus
- Effort: high
- Files: .deckent/agents/refactorer/agent.json (new), .deckent/agents/refactorer/PROMPT.md (new)
- Scope: .deckent/agents/

### Description
Refactoring specialist. triggerKeywords: [refactor, rename, extract, split, merge, reorganize, modularize, decouple, simplify]. preferredModel: sonnet. PROMPT.md: refactoring patterns (extract method/class, move function, inline), preserve behavior, test before+after. 5+ tests.

### Tests
- agent.json valid
- 5+ tests

---

## Task 9: Built-in Agent — bug-fixer
- Model: opus
- Effort: high
- Files: .deckent/agents/bug-fixer/agent.json (new), .deckent/agents/bug-fixer/PROMPT.md (new)
- Scope: .deckent/agents/

### Description
Bug fixer agent. triggerKeywords: [fix, bug, error, crash, regression, broken, issue, defect, patch, hotfix]. preferredModel: opus. effortMultiplier: 1.5. PROMPT.md: root cause analysis first, minimal fix, regression test, bisect methodology. 5+ tests.

### Tests
- agent.json valid
- effortMultiplier correct
- 5+ tests

---

## Task 10: Built-in Agent — api-builder
- Model: opus
- Effort: high
- Files: .deckent/agents/api-builder/agent.json (new), .deckent/agents/api-builder/PROMPT.md (new)
- Scope: .deckent/agents/

### Description
API builder agent. triggerKeywords: [api, endpoint, route, controller, rest, graphql, middleware, request, response, handler]. triggerScopes: [src/api/, src/routes/]. preferredModel: sonnet. PROMPT.md: REST conventions, error handling, validation, authentication middleware. 5+ tests.

### Tests
- agent.json valid
- 5+ tests

---

## Task 11: Built-in Agent — performance-analyzer
- Model: opus
- Effort: high
- Files: .deckent/agents/performance-analyzer/agent.json (new), .deckent/agents/performance-analyzer/PROMPT.md (new)
- Scope: .deckent/agents/

### Description
Performance analyzer agent. triggerKeywords: [performance, optimize, speed, memory, profiling, benchmark, latency, cache, bottleneck, slow]. preferredModel: opus. PROMPT.md: profiling methodology, Big-O analysis, memory leak detection, caching strategies. 5+ tests.

### Tests
- agent.json valid
- 5+ tests

---

## Task 12: Agent Validation — Manifest Checker
- Model: opus
- Effort: high
- Files: src/core/agent-pool.ts (extend), tests/core/agent-pool.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
validateAgentDefinition(agent): validates required fields, model enum, triggerKeywords non-empty, effortMultiplier range (0.1-3.0), source enum. Returns {valid: boolean, errors: string[]}. Integrate into loadAgents — skip invalid agents with warning. 10+ tests.

### Tests
- Valid agent passes
- Missing required field fails
- Invalid model fails
- effortMultiplier out of range fails
- 10+ tests

---

## Task 13: brain.ts — Agent Selection in planSprint
- Model: opus
- Effort: high
- Files: src/orchestra/brain.ts, tests/orchestra/brain-agent.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Integrate agent selection into planSprint. After tasks are created: 1) loadAgents from pool, 2) For each task: selectAgent(task, pool), 3) Set task.assignedAgent = agent.id or 'generic', 4) If agent.preferredModel && !task.forceModel: use agent model preference, 5) Apply agent effortMultiplier. Add assignedAgent field to Task type. 15+ tests.

### Tests
- Agent selected for matching task
- Generic worker for non-matching
- Agent model preference applied
- forceModel overrides agent preference
- 15+ tests

---

## Task 14: task-builder.ts — Agent Prompt Injection
- Model: opus
- Effort: high
- Files: src/orchestra/task-builder.ts, tests/orchestra/task-builder.test.ts (extend)
- Scope: src/orchestra/, tests/orchestra/

### Description
Extend buildWorkerPrompt to inject agent PROMPT.md before task content. New signature: buildWorkerPrompt(task, agentPrompt?). If agentPrompt provided, prepend "=== Agent: {name} ===" section. Agent prompt truncated at 2000 tokens to prevent context overflow. 10+ tests.

### Tests
- Agent prompt prepended
- No agent prompt = current behavior
- Truncation at limit
- 10+ tests

---

## Task 15: worker.ts — Agent Context Awareness
- Model: opus
- Effort: high
- Files: src/agents/worker.ts, tests/agents/worker.test.ts (extend)
- Scope: src/agents/, tests/agents/

### Description
Worker reads agent context from task.assignedAgent. If agent has allowedTools/deniedTools, enforce in scope check. Add agent ID to heartbeat for dashboard visibility. Worker result includes agentId field. 10+ tests.

### Tests
- Agent ID in heartbeat
- Agent ID in result
- Tool enforcement from agent definition
- 10+ tests

---

## Task 16: Agent Stats Tracking
- Model: opus
- Effort: high
- Files: src/core/agent-pool.ts (extend), tests/core/agent-pool.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
After sprint evaluation: updateAgentStats(agentId, evaluation). Track totalUses++, recalculate successRate (DONE count / total), update avgCoverage, set lastUsedInSprint. Save to agent.json. Brain reads stats during planning for tie-breaking. 10+ tests.

### Tests
- Stats updated after DONE
- Stats updated after NO_GO
- successRate calculation correct
- 10+ tests

---

## Task 17: Agent Pattern Learning
- Model: opus
- Effort: high
- Files: src/monitor/auditor.ts (extend), tests/monitor/auditor-agent.test.ts (new)
- Scope: src/monitor/, tests/monitor/

### Description
Extend detectPatterns to record agent performance patterns. New pattern fields: agentId, skillIds[], evaluation. After sprint: record which agent+task type combinations succeeded/failed. Brain reads these in planSprint for better selection. 10+ tests.

### Tests
- Agent pattern recorded
- Failed agent pattern recorded
- Pattern influences future selection
- 10+ tests

---

## Task 18: Temp Agent Creation
- Model: opus
- Effort: high
- Files: src/core/agent-pool.ts (extend), tests/core/agent-pool.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
createTempAgent(sprintId, definition): creates agent in .tasks/agents/{sprintId}-{id}/. Temp agents exist only for one sprint. cleanup() in brain.ts removes temp agent dirs. Brain can create temp agents when AI planner suggests specialized approach for unusual task. 10+ tests.

### Tests
- Temp agent created in .tasks/agents/
- Temp agent removed on cleanup
- Temp agent available during sprint
- 10+ tests

---

## Task 19: CLI — deckent agent list
- Model: opus
- Effort: high
- Files: src/cli/commands/agent.ts (new), tests/cli/commands/agent.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
New CLI command: deckent agent list. Shows all agents in pool with: name, type (builtin/user/learned), status (enabled/disabled), stats (uses, success rate), preferred model. Table format. --json flag. 10+ tests.

### Tests
- Lists all agents
- Shows stats
- --json output
- 10+ tests

---

## Task 20: CLI — deckent agent create
- Model: opus
- Effort: high
- Files: src/cli/commands/agent.ts (extend), tests/cli/commands/agent.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
deckent agent create <name>. Interactive wizard: name, description, trigger keywords, preferred model, allowed/denied tools. Creates .deckent/agents/{name}/agent.json + PROMPT.md template. Validates name uniqueness. 10+ tests.

### Tests
- Creates agent directory
- agent.json valid
- PROMPT.md template created
- Duplicate name rejected
- 10+ tests

---

## Task 21: CLI — deckent agent enable/disable
- Model: opus
- Effort: high
- Files: src/cli/commands/agent.ts (extend), tests/cli/commands/agent.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
deckent agent enable <name> and deckent agent disable <name>. Sets enabled field in agent.json. Disabled agents skipped in selectAgent. 5+ tests.

### Tests
- Enable sets enabled=true
- Disable sets enabled=false
- Disabled agent not selected
- 5+ tests

---

## Task 22: Dashboard Agent Visibility
- Model: opus
- Effort: high
- Files: src/cli/helpers/output.ts, tests/cli/helpers/output.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
Update formatDashboard to show agent assignment per worker. Agent column: "security-auditor" or "generic". Color-coded: specialized agents green, generic gray. 5+ tests.

### Tests
- Agent column in dashboard
- Color coding
- 5+ tests

---

## Task 23: Agent Inter-Communication — Shared Context
- Model: opus
- Effort: high
- Files: src/agents/shared-context.ts (new), tests/agents/shared-context.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
SharedContext class: agents share findings via .tasks/shared-context.json. write(agentId, key, value), read(key), readAll(). Used when code-reviewer finds issues that bug-fixer should address. Thread-safe (atomic read/write with temp file). 10+ tests.

### Tests
- Write and read back
- Multiple agents write
- Atomic operation (no corruption)
- readAll returns all entries
- 10+ tests

---

## Task 24: Multi-Agent Task — Sequential Pipeline
- Model: opus
- Effort: high
- Files: src/orchestra/multi-agent.ts (new), tests/orchestra/multi-agent.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
MultiAgentPipeline: run multiple agents on same task sequentially. Pipeline definition: [{agent: 'code-reviewer', phase: 'review'}, {agent: 'test-writer', phase: 'test'}]. Each agent's output becomes next agent's input via SharedContext. Brain decides when to use pipeline vs single agent. 15+ tests.

### Tests
- Pipeline runs agents sequentially
- Output passed between agents
- Pipeline aborts on NO_GO
- 15+ tests

---

## Task 25: types.ts — Agent Type Extensions
- Model: opus
- Effort: high
- Files: src/core/types.ts, tests/core/types.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
Add to types.ts: assignedAgent field on Task, agentId field on TaskResult, agentId field on Heartbeat. Add MultiAgentPipelineStep type. Update AgentRole union to include custom agent IDs. 5+ tests.

### Tests
- New fields compile
- Type assertions pass
- 5+ tests

---

## Task 26: sprint-reporter.ts — Agent Performance Report
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-reporter.ts (extend), tests/orchestra/sprint-reporter.test.ts (extend)
- Scope: src/orchestra/, tests/orchestra/

### Description
Extend writeRetrospective to include agent performance section. Per-agent: tasks assigned, done/debt/no-go counts, avg coverage. Write to RETRO.md. Compare agent performance across sprints. 10+ tests.

### Tests
- Agent section in RETRO.md
- Per-agent metrics correct
- Comparison data included
- 10+ tests

---

## Task 27: Agent Discovery — Auto-Suggest
- Model: opus
- Effort: high
- Files: src/core/agent-selector.ts (extend), tests/core/agent-selector.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
suggestNewAgent(tasks, pool): analyze task patterns that don't match any existing agent. If 3+ tasks in same domain have no agent match, suggest creating new agent. Returns suggestion with name, keywords, model. Brain can auto-create temp agent from suggestion. 10+ tests.

### Tests
- Suggestion generated for unmatched patterns
- No suggestion when agents cover all tasks
- Temp agent created from suggestion
- 10+ tests

---

## Task 28: Integration Test — Agent Selection E2E
- Model: opus
- Effort: high
- Files: tests/integration/agent-selection.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end test: 1) Load agent pool, 2) Create tasks with security/test/doc keywords, 3) Run selectAgent for each, 4) Verify correct agent selected, 5) Verify prompt injection, 6) Verify stats updated after evaluation. 15+ tests.

### Tests
- Security task → security-auditor
- Test task → test-writer
- Doc task → doc-writer
- Generic task → null (generic worker)
- 15+ tests

---

## Task 29: Integration Test — Multi-Agent Pipeline E2E
- Model: opus
- Effort: high
- Files: tests/integration/multi-agent-pipeline.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end multi-agent pipeline test: 1) Define pipeline [code-reviewer, test-writer], 2) Run pipeline on mock task, 3) Verify shared context passed between agents, 4) Verify final result combines both agents' work. 10+ tests.

### Tests
- Pipeline executes sequentially
- Shared context populated
- Final result correct
- 10+ tests

---

## Task 30: Agent Documentation
- Model: opus
- Effort: high
- Files: docs/AGENTS.md (new), tests/docs/agents.test.ts (new)
- Scope: docs/, tests/docs/

### Description
Comprehensive agent system documentation. Sections: 1) What are agents, 2) Built-in agents (8 descriptions), 3) Creating custom agents (deckent agent create), 4) Agent selection algorithm, 5) Multi-agent pipelines, 6) Agent stats and learning, 7) Temp agents, 8) Configuration. 5+ tests.

### Tests
- Doc exists
- All sections present
- English
- 5+ tests

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests 0 regression
- All tasks opus model, effort high
- Each task independent where possible
- All documentation English
