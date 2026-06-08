# DIRECTIVES — Sprint 031 (Brain Decision Engine + Learning Loop + Multi-Agent Collaboration)

## Goal: Build the extended Brain decision engine (6-step task-to-execution flow), implement a learning loop that records agent+skill+model combinations per evaluation for future sprint optimization, and add multi-agent collaboration primitives (parallel pipelines, shared memory, conflict resolution, adaptive agent self-improvement). 30 tasks — all opus model, effort high.

---

## Task 1: Task Analyzer — Core
- Model: opus
- Effort: high
- Files: src/orchestra/task-analyzer.ts (new), tests/orchestra/task-analyzer.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
TaskAnalyzer class: analyze(task) returns TaskAnalysis. TaskAnalysis: {type: 'code'|'test'|'doc'|'security'|'refactor'|'devops'|'config', complexity: number (0-10), keywords: string[], scopeWeight: number, estimatedDurationMs: number}. Type inference from title+description keywords (e.g., "test" in title -> type='test'). Complexity from scope size (directories count, filesWrite count) + keyword signals (e.g., "migration" adds +2). Keywords extracted via tokenization (lowercase, split on space/punctuation, deduplicate). This is Step 1 of the 6-step decision flow. 20+ tests.

### Tests
- Code task type detected from "Add login endpoint"
- Test task type detected from "Write unit tests"
- Complexity score reflects scope size
- Keywords extracted correctly
- 20+ tests

---

## Task 2: Decision Orchestrator — Framework
- Model: opus
- Effort: high
- Files: src/orchestra/decision-engine.ts (new), tests/orchestra/decision-engine.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
DecisionOrchestrator class: orchestrates the 6-step flow. decide(task, context): calls Step 1 (TaskAnalyzer), Step 2 (AgentSelector), Step 3 (SkillSelector), Step 4 (ModelSelector), Step 5 (EffortResolver), Step 6 (ScopeComputer). Returns DecisionResult: {analysis: TaskAnalysis, agent: AgentDefinition|null, skills: SkillDefinition[], model: ModelType, effort: TaskEffort, scope: TaskScope, decisionLog: DecisionLogEntry[]}. DecisionContext: {projectStack, agentPool, skillPool, patterns, usageMetrics, config}. Each step receives output of previous steps. 15+ tests.

### Tests
- 6-step flow executes in order
- Each step receives previous outputs
- DecisionResult complete
- Fallback to defaults when step fails
- 15+ tests

---

## Task 3: Decision Types
- Model: opus
- Effort: high
- Files: src/core/decision-types.ts (new), tests/core/decision-types.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Define all types for the decision engine. TaskAnalysis interface (type, complexity, keywords, scopeWeight, estimatedDurationMs). DecisionResult interface (analysis, agent, skills, model, effort, scope, decisionLog). DecisionLogEntry: {step: 1-6, name: string, input: Record<string, unknown>, output: Record<string, unknown>, durationMs: number, reasoning: string}. DecisionContext interface (projectStack, agentPool, skillPool, patterns, usageMetrics, config). TaskType union type. 15+ tests.

### Tests
- All interfaces compile correctly
- Type guards validate shapes
- DecisionLogEntry step range 1-6
- TaskType union complete
- 15+ tests

---

## Task 4: 6-Step Flow — Agent Selection Step
- Model: opus
- Effort: high
- Files: src/orchestra/decision-steps/agent-step.ts (new), tests/orchestra/decision-steps/agent-step.test.ts (new)
- Scope: src/orchestra/decision-steps/, tests/orchestra/decision-steps/

### Description
AgentSelectionStep: execute(analysis, context) returns {agent: AgentDefinition|null, score: number, reasoning: string}. Uses existing agent-selector.ts selectAgent() but enriched with TaskAnalysis. If analysis.type='security', boost security-auditor score +3. If analysis.type='test', boost test-writer +3. Logs reasoning to DecisionLogEntry. Returns null agent if no match above threshold (score >= 3). 15+ tests.

### Tests
- Security task selects security-auditor
- Test task selects test-writer
- Score below threshold returns null
- Reasoning logged correctly
- 15+ tests

---

## Task 5: 6-Step Flow — Scope Computation Step
- Model: opus
- Effort: high
- Files: src/orchestra/decision-steps/scope-step.ts (new), tests/orchestra/decision-steps/scope-step.test.ts (new)
- Scope: src/orchestra/decision-steps/, tests/orchestra/decision-steps/

### Description
ScopeComputationStep: execute(task, agent, skills) returns merged TaskScope. Merge strategy: union of task.scope.directories + agent.triggerScopes (if matching) + skill permissions (if applicable). filesRead: union of all. filesWrite: task.scope.filesWrite only (agent/skill cannot expand write scope — security boundary). Deduplication. Log reasoning. 15+ tests.

### Tests
- Task scope preserved
- Agent scope merged (directories only)
- Skills cannot expand filesWrite
- Deduplication works
- 15+ tests

---

## Task 6: Decision Logging System
- Model: opus
- Effort: high
- Files: src/orchestra/decision-logger.ts (new), tests/orchestra/decision-logger.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
DecisionLogger class: log(sprintId, taskId, entries: DecisionLogEntry[]). Writes to .tasks/decisions/task-{id}.decision.json. readDecisionLog(taskId): reads back. listDecisions(sprintId): all decisions for a sprint. Format: {sprintId, taskId, steps: DecisionLogEntry[], decidedAt: ISO8601, totalDurationMs}. Used for debugging and replay. 15+ tests.

### Tests
- Decision log written
- Decision log read back
- List by sprint works
- File format valid JSON
- 15+ tests

---

## Task 7: Decision Replay
- Model: opus
- Effort: high
- Files: src/orchestra/decision-replay.ts (new), tests/orchestra/decision-replay.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
replayDecision(taskId): reads decision log, re-runs the 6-step flow with same inputs, compares outputs. Returns ReplayResult: {original: DecisionResult, replayed: DecisionResult, diffs: string[]}. Used for testing decision determinism and debugging model selection issues. diffDecisions(a, b): compares two DecisionResults, returns list of differences (e.g., "model changed: opus -> sonnet"). 15+ tests.

### Tests
- Replay produces same result with same inputs
- Diff detects model change
- Diff detects agent change
- Replay with changed context produces different result
- 15+ tests

---

## Task 8: Pattern Recorder — Core
- Model: opus
- Effort: high
- Files: src/orchestra/pattern-recorder.ts (new), tests/orchestra/pattern-recorder.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
PatternRecorder class: record(entry: LearningEntry). LearningEntry: {taskType, agent: string|null, skills: string[], model: ModelType, effort: TaskEffort, evaluation: TaskEvaluation, coverage: number, durationMs: number, sprintId: string, recordedAt: ISO8601}. Writes to .brain/learning/{sprintId}.json (array of entries). Append-only within a sprint. 15+ tests.

### Tests
- Entry recorded correctly
- Appends to existing sprint file
- File format valid
- Empty file created for new sprint
- 15+ tests

---

## Task 9: Pattern Reader — Query
- Model: opus
- Effort: high
- Files: src/orchestra/pattern-reader.ts (new), tests/orchestra/pattern-reader.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
PatternReader class: queryPatterns(filter: PatternFilter). PatternFilter: {taskType?, agent?, model?, evaluation?, minCoverage?, sprintRange?: {from, to}}. Returns LearningEntry[]. Also: getSuccessfulCombinations(taskType): returns agent+skill+model combos that led to DONE with coverage > 80%, sorted by frequency. getFailedCombinations(taskType): combos that led to NO_GO, sorted by recency. 15+ tests.

### Tests
- Filter by taskType works
- Filter by evaluation works
- Successful combinations sorted by frequency
- Failed combinations sorted by recency
- 15+ tests

---

## Task 10: Combination Scorer
- Model: opus
- Effort: high
- Files: src/orchestra/combination-scorer.ts (new), tests/orchestra/combination-scorer.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
CombinationScorer class: score(taskType, agent, skills, model). Uses PatternReader to look up historical results. Score formula: successCount * 2 + avgCoverage * 0.1 - failCount * 3 - recencyPenalty (older results weighted less: sprintAge * 0.5). Returns {score: number, confidence: number (0-1 based on sample size), recommendation: 'use'|'avoid'|'neutral'}. Confidence = min(1, sampleSize / 5). 15+ tests.

### Tests
- High success count -> high score
- NO_GO history -> negative score
- Recent results weighted more
- Low sample size -> low confidence
- recommendation thresholds correct
- 15+ tests

---

## Task 11: Learning Decay
- Model: opus
- Effort: high
- Files: src/orchestra/learning-decay.ts (new), tests/orchestra/learning-decay.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
decayLearningData(maxSprintsToKeep: number): removes learning entries older than N sprints. Default: keep last 10 sprints. Also: compactPatterns(sprintId): after decay, merge remaining entries into summary stats per combination (agent+skills+model+taskType -> {uses, successes, failures, avgCoverage}). Summary stored in .brain/learning/summary.json. 10+ tests.

### Tests
- Old sprint files removed
- Summary stats computed correctly
- Compact merges duplicate combinations
- maxSprintsToKeep respected
- 10+ tests

---

## Task 12: Learning Migration
- Model: opus
- Effort: high
- Files: src/orchestra/learning-migration.ts (new), tests/orchestra/learning-migration.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
migratePatternsToLearning(): reads existing PATTERNS.md entries (PatternEntry format) and converts to LearningEntry format where possible. Maps pattern string to taskType via keyword detection. Preserves existing PATTERNS.md (read-only migration). One-time migration utility. Also exportLearningData(): exports all learning data as single JSON for backup/transfer. importLearningData(data): imports from backup. 10+ tests.

### Tests
- Existing patterns migrated
- Pattern string mapped to taskType
- Export produces valid JSON
- Import restores data correctly
- 10+ tests

---

## Task 13: Parallel Pipeline — Manager
- Model: opus
- Effort: high
- Files: src/orchestra/parallel-pipeline.ts (new), tests/orchestra/parallel-pipeline.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
ParallelPipelineManager class: manages concurrent task execution with dependency awareness. createPipeline(tasks): groups tasks into execution waves based on dependencies (topological sort). Wave 0: no dependencies. Wave 1: depends on wave 0. etc. executePipeline(waves, spawnFn): executes wave 0, waits for completion, then wave 1, etc. getExecutionPlan(): returns visualization of waves. Max workers respected per wave. 15+ tests.

### Tests
- Independent tasks in same wave
- Dependent tasks in later wave
- Circular dependency detected
- Max workers cap applied per wave
- 15+ tests

---

## Task 14: Shared Memory Protocol
- Model: opus
- Effort: high
- Files: src/orchestra/shared-memory.ts (new), tests/orchestra/shared-memory.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
SharedMemory class: file-based shared state for cross-worker communication. write(key, value, writerId): writes to .tasks/shared/{key}.json with writer metadata. read(key): reads current value. watch(key, callback): polls for changes (500ms interval). listKeys(): all shared keys. TTL support: entries expire after configurable duration. Lock-aware: uses existing lock system before write. 15+ tests.

### Tests
- Write and read works
- Watch detects changes
- TTL expiration works
- Lock prevents concurrent write
- 15+ tests

---

## Task 15: Conflict Resolver
- Model: opus
- Effort: high
- Files: src/orchestra/conflict-resolver.ts (new), tests/orchestra/conflict-resolver.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
ConflictResolver class: detectConflicts(results: TaskResult[]): checks for overlapping file changes across workers. ConflictType: 'same_file_write' | 'scope_overlap' | 'test_interference'. resolveConflict(conflict, strategy): strategies are 'last_writer_wins' | 'first_writer_wins' | 'manual'. generateConflictReport(conflicts): human-readable report for Brain evaluation. 15+ tests.

### Tests
- Same file write detected
- Scope overlap detected
- last_writer_wins strategy applied
- Conflict report format correct
- 15+ tests

---

## Task 16: Result Merger
- Model: opus
- Effort: high
- Files: src/orchestra/result-merger.ts (new), tests/orchestra/result-merger.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
ResultMerger class: mergeResults(results: TaskResult[]): combines multiple worker results into unified sprint output. Aggregates: totalFilesChanged (deduplicated), totalLinesAdded, totalLinesRemoved, combinedCoverage (weighted average by files touched). detectOverlaps(results): flags files changed by multiple workers. mergeTestResults(results): combines test pass/fail across workers. 10+ tests.

### Tests
- Files deduplicated across workers
- Coverage weighted average correct
- Overlapping files flagged
- Test results merged
- 10+ tests

---

## Task 17: Handoff Protocol
- Model: opus
- Effort: high
- Files: src/orchestra/handoff-protocol.ts (new), tests/orchestra/handoff-protocol.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
HandoffProtocol class: manages task-to-task handoffs when one worker's output is another's input. createHandoff(fromTaskId, toTaskId, artifacts: string[]): records handoff intent. Artifacts are file paths that fromTask produces and toTask needs. executeHandoff(handoffId): validates artifacts exist after fromTask completes, makes them available to toTask scope. failHandoff(handoffId, reason): marks handoff as failed, triggers dependency resolution. 10+ tests.

### Tests
- Handoff created correctly
- Artifacts validated on execution
- Missing artifacts fail handoff
- Failed handoff triggers re-plan
- 10+ tests

---

## Task 18: Adaptive Agent — Prompt Self-Improvement
- Model: opus
- Effort: high
- Files: src/agents/adaptive-agent.ts (new), tests/agents/adaptive-agent.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
AdaptiveAgent class: analyzePromptEffectiveness(agentId, recentResults: LearningEntry[]). Compares agent success rate across sprints. If successRate < 70% over last 3 sprints, generates prompt improvement suggestions. suggestPromptChange(agentId, weaknesses: string[]): returns PromptDiff: {original: string, suggested: string, reasoning: string, changedSections: string[]}. Does NOT auto-apply — Brain reviews and approves. 15+ tests.

### Tests
- Low success rate detected
- Prompt improvement suggested
- Reasoning explains weakness
- Does not auto-apply changes
- 15+ tests

---

## Task 19: Adaptive Agent — A/B Testing Prompts
- Model: opus
- Effort: high
- Files: src/agents/prompt-ab-test.ts (new), tests/agents/prompt-ab-test.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
PromptABTester class: createExperiment(agentId, variantA: string, variantB: string). Assigns variant randomly per sprint (50/50). recordExperimentResult(experimentId, variant, evaluation). analyzeExperiment(experimentId): returns {winner: 'A'|'B'|'inconclusive', confidencePercent, sampleSize, aStats, bStats}. Minimum 4 samples before declaring winner. Experiments stored in .deckent/experiments/{agentId}/. 15+ tests.

### Tests
- Experiment created with two variants
- Random assignment works
- Results recorded per variant
- Winner declared after sufficient samples
- Inconclusive with low samples
- 15+ tests

---

## Task 20: Adaptive Agent — Prompt Versioning
- Model: opus
- Effort: high
- Files: src/agents/prompt-version.ts (new), tests/agents/prompt-version.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
PromptVersionManager class: createVersion(agentId, content: string, reason: string). Stores versions in .deckent/agents/{agentId}/versions/v{N}.md. getVersion(agentId, version), getCurrentVersion(agentId), listVersions(agentId). Each version has metadata: {version: number, createdAt, reason, stats: {uses, successRate}}. activateVersion(agentId, version): sets current PROMPT.md to this version. Max 10 versions kept (oldest pruned). 15+ tests.

### Tests
- Version created and stored
- Current version retrieved
- Version list ordered
- Activate changes PROMPT.md
- Max 10 versions enforced
- 15+ tests

---

## Task 21: Adaptive Agent — Rollback Bad Prompts
- Model: opus
- Effort: high
- Files: src/agents/prompt-rollback.ts (new), tests/agents/prompt-rollback.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
PromptRollback class: monitor(agentId) checks if current prompt version has successRate < 50% after 3+ uses. If so, auto-rollback to previous version with higher successRate. rollbackPrompt(agentId): activates best historical version. canRollback(agentId): checks if rollback is available (needs at least 2 versions). Log rollback event in .deckent/agents/{agentId}/rollback-log.json. 10+ tests.

### Tests
- Low success rate triggers rollback check
- Rollback activates best version
- canRollback false with single version
- Rollback event logged
- 10+ tests

---

## Task 22: Adaptive Agent — Prompt Metrics Dashboard
- Model: opus
- Effort: high
- Files: src/agents/prompt-metrics.ts (new), tests/agents/prompt-metrics.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
PromptMetrics class: collectMetrics(agentId) aggregates all prompt version stats. Returns PromptMetricsReport: {agentId, currentVersion, totalVersions, currentSuccessRate, bestVersion: {version, successRate}, worstVersion: {version, successRate}, experimentStatus: 'none'|'active'|'completed', trend: 'improving'|'declining'|'stable'}. Trend calculated from last 3 version success rates. formatMetricsReport(report): human-readable string. 10+ tests.

### Tests
- Metrics collected across versions
- Best/worst version identified
- Trend calculated correctly
- Report format readable
- 10+ tests

---

## Task 23: Brain Context — Stack Context Enrichment
- Model: opus
- Effort: high
- Files: src/orchestra/brain-context.ts (new), tests/orchestra/brain-context.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
enrichContextWithStack(context: BrainContext, projectRoot: string): adds project stack info to Brain planning context. Reads cached ProjectStack from .deckent/project-stack.json. Injects: language, framework, testFramework, buildTool, dependencies list (top 10). Brain uses this in planSprint to make better model/scope decisions. formatStackContext(stack): returns concise string for prompt injection. 10+ tests.

### Tests
- Stack context added to BrainContext
- Cache read correctly
- Missing cache triggers detection
- Format string concise
- 10+ tests

---

## Task 24: Brain Context — Agent Stats Enrichment
- Model: opus
- Effort: high
- Files: src/orchestra/brain-context.ts (extend), tests/orchestra/brain-context.test.ts (extend)
- Scope: src/orchestra/, tests/orchestra/

### Description
enrichContextWithAgentStats(context, agentPool): adds agent performance summaries to Brain context. For each agent: name, totalUses, successRate, avgCoverage, lastUsedInSprint. Brain uses this to prefer high-performing agents during planning. formatAgentStats(agents): returns markdown table. Filter: only agents used in last 5 sprints. 10+ tests.

### Tests
- Agent stats included in context
- Sorted by success rate
- Only recent agents included
- Markdown table format correct
- 10+ tests

---

## Task 25: Brain Context — Skill Stats Enrichment
- Model: opus
- Effort: high
- Files: src/orchestra/brain-context.ts (extend), tests/orchestra/brain-context.test.ts (extend)
- Scope: src/orchestra/, tests/orchestra/

### Description
enrichContextWithSkillStats(context, skillPool): adds skill performance summaries to Brain context. For each skill: name, category, totalUses, successRate, avgCoverage. Brain uses this to suggest skills to AI planner. formatSkillStats(skills): returns markdown table. Include composition success rates (which skill pairs work well together). 10+ tests.

### Tests
- Skill stats included in context
- Category grouping correct
- Composition pairs reported
- Markdown format correct
- 10+ tests

---

## Task 26: Brain Context — History Context
- Model: opus
- Effort: high
- Files: src/orchestra/brain-context.ts (extend), tests/orchestra/brain-context.test.ts (extend)
- Scope: src/orchestra/, tests/orchestra/

### Description
enrichContextWithHistory(context, sprintRange: number): adds summary of recent sprint outcomes. Reads .brain/learning/summary.json + .brain/sprints/sprint-*.md. Extracts: taskType distribution, model distribution, overall success rate, recurring NO_GO patterns. formatHistoryContext(history): concise string (max 500 tokens). Brain uses this to avoid repeating past mistakes. 10+ tests.

### Tests
- History from recent sprints loaded
- Task type distribution calculated
- NO_GO patterns highlighted
- Token limit respected
- 10+ tests

---

## Task 27: Decision Engine Configuration
- Model: opus
- Effort: high
- Files: src/core/decision-config.ts (new), tests/core/decision-config.test.ts (new)
- Scope: src/core/, tests/core/

### Description
DecisionEngineConfig: {enabled: boolean (default true), agentSelectionThreshold: number (default 3), maxSkillsPerTask: number (default 3), learningEnabled: boolean (default true), learningMaxSprints: number (default 10), decisionLogging: boolean (default true), adaptiveAgentEnabled: boolean (default false — opt-in)}. Add to DeckentConfig as decision_engine field. Validate in validateConfig. Defaults applied when field missing. 10+ tests.

### Tests
- Config field parsed
- Defaults applied when missing
- Validation catches invalid threshold
- Disabled engine skips all steps
- 10+ tests

---

## Task 28: Learning Loop Configuration
- Model: opus
- Effort: high
- Files: src/core/decision-config.ts (extend), tests/core/decision-config.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
LearningConfig (part of DecisionEngineConfig): {enabled: boolean, maxSprintsToKeep: number, minConfidenceForRecommendation: number (0-1, default 0.6), decayInterval: number (sprints between compaction), patternMigrationDone: boolean}. Collaboration config: {parallelPipelines: boolean (default true), sharedMemoryEnabled: boolean (default false), conflictStrategy: 'last_writer_wins'|'first_writer_wins'|'manual' (default 'last_writer_wins')}. 10+ tests.

### Tests
- Learning config parsed
- Collaboration config parsed
- Defaults applied
- Min confidence validated (0-1 range)
- 10+ tests

---

## Task 29: Integration Test — Decision Engine E2E
- Model: opus
- Effort: high
- Files: tests/integration/decision-engine.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end decision engine test. Scenario: 1) Create mock task "Add JWT authentication", 2) Set up agent pool with security-auditor, 3) Set up skill pool with typescript-expert + security-specialist, 4) Run DecisionOrchestrator.decide(), 5) Verify: agent=security-auditor, skills=[typescript-expert, security-specialist], model=opus, 6) Verify decision log written, 7) Record learning entry, 8) Query successful patterns, 9) Re-run decide with same task, verify learning influences result. 20+ tests.

### Tests
- Full 6-step flow executes
- Agent selected correctly
- Skills matched correctly
- Decision log written
- Learning entry recorded
- Subsequent decision uses learning
- 20+ tests

---

## Task 30: Integration Test — Collaboration + Adaptive Agent
- Model: opus
- Effort: high
- Files: tests/integration/collaboration-adaptive.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end collaboration and adaptive agent test. Scenario A — Parallel Pipeline: 1) Create 5 tasks with dependencies (A->B, C->D, E independent), 2) createPipeline produces 3 waves, 3) Wave execution order correct. Scenario B — Conflict Resolution: 1) Two workers modify same file, 2) detectConflicts finds overlap, 3) resolveConflict applies strategy. Scenario C — Adaptive: 1) Agent has 40% success rate over 3 sprints, 2) suggestPromptChange returns improvement, 3) New version created, 4) Old version available for rollback. 15+ tests.

### Tests
- Pipeline waves correct
- Conflict detected and resolved
- Adaptive agent suggests improvement
- Prompt versioning works
- Rollback available
- 15+ tests

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests 0 regression
- All tasks opus model, effort high
- All documentation English
- Decision engine backward compatible — disabled engine = current behavior unchanged
