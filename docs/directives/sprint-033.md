# DIRECTIVES — Sprint 033 (Integration Testing + Skill Marketplace + Adaptive Agent Advanced + Analytics + Performance)

## Goal: Build comprehensive integration tests across the full agent+skill pipeline, establish the skill marketplace foundation (remote registry, search, publish), advance the adaptive agent with cross-sprint learning and specialization drift detection, create an analytics dashboard for agent/skill usage, and optimize performance across agent selection caching and prompt token counting. 30 tasks — all opus model, effort high.

---

## Task 1: Integration Test — Full Agent+Skill Sprint E2E
- Model: opus
- Effort: high
- Files: tests/integration/full-sprint-e2e.test.ts (new)
- Scope: tests/integration/

### Description
Complete end-to-end sprint test with agents and skills active. Scenario: 1) Initialize project with TypeScript stack, 2) Load agent pool (security-auditor, test-writer, generic), 3) Load skill pool (typescript-expert, testing-expert, security-specialist), 4) Create 6-task directive (2 security, 2 test, 1 doc, 1 refactor), 5) DecisionOrchestrator assigns agents+skills+models, 6) Mock workers execute with heartbeats, 7) Results evaluated, 8) Learning entries recorded, 9) Sprint summary with agent performance, 10) Verify all file artifacts created (.decision.json, .result, learning/). 20+ tests.

### Tests
- Agents assigned correctly per task type
- Skills matched to project stack
- Decision logs written for each task
- Learning entries recorded
- Sprint summary includes agent performance
- All artifacts created
- 20+ tests

---

## Task 2: Integration Test — TypeScript/React Project
- Model: opus
- Effort: high
- Files: tests/integration/project-types/typescript-react.test.ts (new)
- Scope: tests/integration/

### Description
Sprint simulation on mock TypeScript/React project. Setup: tsconfig.json, package.json with react+vitest deps, src/components/, src/hooks/, tests/. Directive: "Add user profile component with avatar upload". Verify: stack detects TypeScript+React, typescript-expert+react-specialist skills selected, test-writer agent assigned to test tasks, worker prompts contain React-specific guidance from SKILL.md. 15+ tests.

### Tests
- Stack: language=typescript, framework=react
- Skills: typescript-expert + react-specialist selected
- Agent: test-writer for test tasks
- Prompt contains React patterns
- 15+ tests

---

## Task 3: Integration Test — Python/FastAPI Project
- Model: opus
- Effort: high
- Files: tests/integration/project-types/python-fastapi.test.ts (new)
- Scope: tests/integration/

### Description
Sprint simulation on mock Python/FastAPI project. Setup: pyproject.toml, requirements.txt with fastapi+pytest, app/, tests/. Directive: "Add user CRUD API with SQLAlchemy". Verify: stack detects Python+FastAPI, python-expert+api-builder skills selected, api-builder agent for API tasks, prompt contains Python-specific guidance. No TypeScript skills selected. 15+ tests.

### Tests
- Stack: language=python, framework=fastapi
- Skills: python-expert + api-builder
- TypeScript skills NOT selected
- Prompt contains Python patterns
- 15+ tests

---

## Task 4: Integration Test — Monorepo Project
- Model: opus
- Effort: high
- Files: tests/integration/project-types/monorepo.test.ts (new)
- Scope: tests/integration/

### Description
Sprint simulation on mock Turborepo monorepo. Setup: turbo.json, packages/ui/, packages/api/, apps/web/. Directive: "Add shared Button component to UI package". Verify: stack detects multi-package structure, scope restricted to packages/ui/, skills detect TypeScript from root tsconfig. Worker scope does not bleed into other packages. 15+ tests.

### Tests
- Monorepo structure detected
- Scope restricted to correct package
- Skills from root config
- No cross-package scope bleed
- 15+ tests

---

## Task 5: Integration Test — Error Scenarios + Recovery
- Model: opus
- Effort: high
- Files: tests/integration/error-recovery.test.ts (new)
- Scope: tests/integration/

### Description
Test error scenarios and graceful recovery. Scenarios: 1) Agent pool empty — falls back to generic worker, 2) Skill pool empty — runs without skills (current behavior), 3) Stack detection fails — defaults to unknown, 4) Decision engine disabled in config — bypasses 6-step flow, 5) Worker heartbeat stale during progress — marks worker as unresponsive, 6) Notification webhook fails — logs error, continues sprint, 7) Learning file corrupted — resets with warning. 15+ tests.

### Tests
- Empty agent pool -> generic fallback
- Empty skill pool -> no skills
- Failed stack detection -> unknown
- Disabled engine -> bypass
- Corrupted learning -> reset
- 15+ tests

---

## Task 6: Marketplace — Remote Registry Client
- Model: opus
- Effort: high
- Files: src/core/marketplace/registry-client.ts (new), tests/core/marketplace/registry-client.test.ts (new)
- Scope: src/core/marketplace/, tests/core/marketplace/

### Description
RegistryClient class: connects to remote skill registry (HTTPS API). searchSkills(query: string, options: {category?, page?, limit?}): returns RegistrySearchResult: {skills: RegistrySkillEntry[], total, page, pages}. RegistrySkillEntry: {name, description, version, author, category, downloads, rating, tags[]}. getSkillDetail(name): returns full manifest + README. Registry URL configurable in config (default: https://registry.deckent.dev — currently returns mock/empty). Handles: network errors, timeouts (5s), rate limiting (429 status). 15+ tests.

### Tests
- Search returns paginated results
- Detail returns full manifest
- Network error handled gracefully
- Timeout respected
- Rate limit handled with retry-after
- 15+ tests

---

## Task 7: Marketplace — deckent skill search Command
- Model: opus
- Effort: high
- Files: src/cli/commands/skill-marketplace.ts (new), tests/cli/commands/skill-marketplace.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
deckent skill search <query>: searches remote registry. Table output: name, description (truncated), version, category, downloads, rating (stars). --category filter. --json output. --limit <N> (default 20). Handles offline mode: "Registry unavailable. Showing local skills only." Falls back to local skill pool search when registry unreachable. 10+ tests.

### Tests
- Search results displayed in table
- --category filter works
- --json output correct
- Offline fallback to local
- 10+ tests

---

## Task 8: Marketplace — deckent skill publish Command
- Model: opus
- Effort: high
- Files: src/cli/commands/skill-marketplace.ts (extend), tests/cli/commands/skill-marketplace.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
deckent skill publish <skill-name>: publishes local skill to registry. Pre-publish validation: manifest.json valid, SKILL.md exists, version follows semver, author field set. Packages skill directory as tarball. POST to registry API with auth token (from credentials). --dry-run: validate only. Displays publish URL on success. Auth token read from deckent credentials (Task 23 of Sprint 027). 10+ tests.

### Tests
- Pre-publish validation catches errors
- Tarball created correctly
- Auth token required
- --dry-run validates only
- 10+ tests

---

## Task 9: Marketplace — Rating System Foundation
- Model: opus
- Effort: high
- Files: src/core/marketplace/rating-system.ts (new), tests/core/marketplace/rating-system.test.ts (new)
- Scope: src/core/marketplace/, tests/core/marketplace/

### Description
RatingSystem class: calculateLocalRating(skillId) based on local usage data. Rating = weighted combination: successRate * 0.6 + avgCoverage * 0.3 + frequency * 0.1. Scale: 0-5 stars. submitRating(skillId, stars, review?): POST to registry (when available). getRatings(skillId): GET from registry. Offline: return local rating only. formatRating(rating): "4.2 (12 uses)" or "4.2 (registry: 156 ratings)". 10+ tests.

### Tests
- Local rating calculated from stats
- Rating scale 0-5
- Submit formats correctly
- Offline returns local only
- 10+ tests

---

## Task 10: Marketplace — Dependency Resolution
- Model: opus
- Effort: high
- Files: src/core/marketplace/dependency-resolver.ts (new), tests/core/marketplace/dependency-resolver.test.ts (new)
- Scope: src/core/marketplace/, tests/core/marketplace/

### Description
DependencyResolver class: resolve(skillName): reads skill manifest.dependencies[], resolves full dependency tree. Returns ordered install list (dependencies first). detectCircular(tree): detects circular dependencies. resolveConflicts(tree): if two skills require different versions of same dependency, pick highest compatible. installWithDependencies(skillName): installs skill + all dependencies. 10+ tests.

### Tests
- Dependency tree resolved
- Circular dependency detected
- Version conflict resolved
- Install order correct (deps first)
- 10+ tests

---

## Task 11: Adaptive Agent Advanced — Cross-Sprint Analysis
- Model: opus
- Effort: high
- Files: src/agents/cross-sprint-analyzer.ts (new), tests/agents/cross-sprint-analyzer.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
CrossSprintAnalyzer class: analyze(agentId, sprintRange: number). Reads learning data across multiple sprints. Returns CrossSprintReport: {agentId, sprintsAnalyzed, successTrend: number[] (per-sprint success rate), coverageTrend: number[], taskTypeDistribution: Map<string, number>, bestTaskType: string, worstTaskType: string, improvementSuggestions: string[]}. Suggestions: "Agent excels at security tasks (95% success) but struggles with refactor tasks (40% success)". 15+ tests.

### Tests
- Trends calculated across sprints
- Best/worst task type identified
- Suggestions generated from data
- Empty sprint range handled
- 15+ tests

---

## Task 12: Adaptive Agent — Specialization Drift Detection
- Model: opus
- Effort: high
- Files: src/agents/specialization-drift.ts (new), tests/agents/specialization-drift.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
SpecializationDriftDetector class: detect(agentId, recentResults: LearningEntry[]). Drift occurs when an agent originally designed for task type X is consistently assigned to task type Y. Compares agent.triggerKeywords (original purpose) against actual task type distribution. Returns DriftReport: {agentId, originalSpecialization, currentSpecialization, driftScore: number (0-1, 1=complete drift), recommendation: 'keep'|'respecialize'|'create_new_agent'}. Threshold: driftScore > 0.6 triggers recommendation. 10+ tests.

### Tests
- No drift for aligned agent
- Drift detected for misaligned usage
- driftScore reflects magnitude
- Recommendation based on score
- 10+ tests

---

## Task 13: Adaptive Agent — Auto-Retire Underperformers
- Model: opus
- Effort: high
- Files: src/agents/agent-retirement.ts (new), tests/agents/agent-retirement.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
AgentRetirement class: evaluateForRetirement(agentId, stats, config). Retirement criteria: successRate < 30% over 5+ sprints AND totalUses >= 10 (sufficient sample). retire(agentId): moves agent to .deckent/agents/.retired/{agentId}/ (not deleted). reinstate(agentId): moves back to active pool. listRetired(): returns retired agents. Built-in agents (source='builtin') cannot be retired, only disabled. 10+ tests.

### Tests
- Low success rate triggers retirement
- Insufficient sample prevents premature retirement
- Retired agent moved to .retired/
- Reinstate moves back
- Built-in agents only disabled
- 10+ tests

---

## Task 14: Adaptive Agent — Prompt Evolution Log
- Model: opus
- Effort: high
- Files: src/agents/prompt-evolution.ts (new), tests/agents/prompt-evolution.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
PromptEvolutionLog class: records the complete history of an agent's prompt changes. recordEvolution(agentId, event: EvolutionEvent). EvolutionEvent: {type: 'created'|'improved'|'ab_tested'|'rolled_back'|'retired'|'reinstated', version: number, timestamp, triggerReason: string, statsAtTime: {successRate, coverage}}. getEvolutionTimeline(agentId): returns chronological list. formatTimeline(events): human-readable timeline with version markers. 10+ tests.

### Tests
- Events recorded chronologically
- All event types supported
- Timeline formatted readably
- Stats at time preserved
- 10+ tests

---

## Task 15: Adaptive Agent — Agent Genealogy
- Model: opus
- Effort: high
- Files: src/agents/agent-genealogy.ts (new), tests/agents/agent-genealogy.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
AgentGenealogy class: tracks agent lineage (parent-child relationships). When Brain creates a new agent based on an existing one (e.g., "react-security-auditor" derived from "security-auditor"), record parentId. buildFamilyTree(agentId): returns tree of parent -> children. findCommonAncestor(agentA, agentB). getDescendants(agentId). Genealogy stored in .deckent/agents/genealogy.json. Used for understanding which base agents produce successful derivatives. 10+ tests.

### Tests
- Parent-child relationship recorded
- Family tree built correctly
- Common ancestor found
- Descendants listed
- 10+ tests

---

## Task 16: Analytics Dashboard — Web Page Foundation
- Model: opus
- Effort: high
- Files: src/dashboard/pages/analytics.tsx (new), tests/dashboard/pages/analytics.test.ts (new)
- Scope: src/dashboard/, tests/dashboard/

### Description
Analytics page for the existing React web dashboard. Main layout: header with date range selector (last 5/10/all sprints), three tab sections (Agents, Skills, Overview). Overview tab: total sprints, total tasks, overall success rate, coverage trend. Uses existing dashboard infrastructure (React + Vite). Data loaded from API endpoint (mock for now). Responsive layout. 15+ tests.

### Tests
- Page renders without errors
- Date range selector works
- Three tabs navigable
- Overview metrics displayed
- Responsive layout
- 15+ tests

---

## Task 17: Analytics Dashboard — Usage Graphs Component
- Model: opus
- Effort: high
- Files: src/dashboard/components/usage-graph.tsx (new), tests/dashboard/components/usage-graph.test.ts (new)
- Scope: src/dashboard/, tests/dashboard/

### Description
UsageGraph component: renders usage data as simple ASCII-art or SVG bar charts (no heavy chart library dependency). Props: {data: {label, value}[], title, maxValue?}. Horizontal bar chart format. Color coding: green (success), red (failure), yellow (tech debt). Supports percentage and absolute values. Accessible: aria-labels on bars. 10+ tests.

### Tests
- Bars render with correct width
- Color coding correct
- Title displayed
- Accessibility labels present
- 10+ tests

---

## Task 18: Analytics Dashboard — Success Rate Charts
- Model: opus
- Effort: high
- Files: src/dashboard/components/success-chart.tsx (new), tests/dashboard/components/success-chart.test.ts (new)
- Scope: src/dashboard/, tests/dashboard/

### Description
SuccessChart component: renders success rate over time. Props: {sprints: {id, successRate, coverageRate, taskCount}[]}. Line chart representation (SVG polyline). Dual lines: success rate (green) and coverage (blue). X-axis: sprint IDs. Y-axis: 0-100%. Hover tooltip: "Sprint 031: 85% success, 92% coverage, 8 tasks". Grid lines at 25%, 50%, 75%. 10+ tests.

### Tests
- Lines render for both metrics
- Axis labels correct
- Tooltip data correct
- Grid lines present
- 10+ tests

---

## Task 19: Analytics Dashboard — Agent Comparison
- Model: opus
- Effort: high
- Files: src/dashboard/components/agent-comparison.tsx (new), tests/dashboard/components/agent-comparison.test.ts (new)
- Scope: src/dashboard/, tests/dashboard/

### Description
AgentComparison component: side-by-side comparison of agent performance. Props: {agents: AgentComparisonEntry[]}. AgentComparisonEntry: {name, totalTasks, successRate, avgCoverage, bestTaskType, topSkills: string[]}. Table layout with sortable columns (click header to sort). Highlight row for best performer. Badge for agents with 100% success rate. 10+ tests.

### Tests
- Table renders all agents
- Sorting by column works
- Best performer highlighted
- 100% badge shown
- 10+ tests

---

## Task 20: Analytics Dashboard — Skill Usage Heatmap
- Model: opus
- Effort: high
- Files: src/dashboard/components/skill-heatmap.tsx (new), tests/dashboard/components/skill-heatmap.test.ts (new)
- Scope: src/dashboard/, tests/dashboard/

### Description
SkillHeatmap component: shows which skills are used together most frequently. Grid layout: skills on both axes, cell color intensity = co-usage count. Props: {skills: string[], coUsage: Map<string, Map<string, number>>}. Cell tooltip: "typescript-expert + react-specialist: 12 times, 91% success". Diagonal: self-usage count. Intensity scale: white (0) to dark green (max). 10+ tests.

### Tests
- Grid renders correctly
- Color intensity reflects count
- Tooltip shows co-usage data
- Diagonal shows self-usage
- 10+ tests

---

## Task 21: Performance — Agent Selection Cache
- Model: opus
- Effort: high
- Files: src/core/agent-cache.ts (new), tests/core/agent-cache.test.ts (new)
- Scope: src/core/, tests/core/

### Description
AgentSelectionCache class: caches agent selection results for identical task signatures. taskSignature(task): generates hash from task type + top 5 keywords + scope directories. cache(signature, result: AgentDefinition|null, ttl: number). get(signature): returns cached result if not expired. invalidate(agentId): clears all cache entries involving this agent (used when agent stats change). Memory-based cache with max 100 entries (LRU eviction). 15+ tests.

### Tests
- Cache hit returns result
- Cache miss returns null
- TTL expiration works
- LRU eviction at capacity
- Invalidate by agentId works
- 15+ tests

---

## Task 22: Performance — Skill Loading Cache
- Model: opus
- Effort: high
- Files: src/core/skill-cache.ts (new), tests/core/skill-cache.test.ts (new)
- Scope: src/core/, tests/core/

### Description
SkillLoadingCache class: caches loaded SKILL.md content to avoid repeated file reads during a sprint. loadAndCache(skillId): reads .deckent/skills/{id}/SKILL.md, stores in memory. getCached(skillId): returns cached content. preloadAll(skillIds: string[]): batch load before sprint starts. isStale(skillId): checks if file modified since cache (mtime comparison). clearCache(). Memory budget: total cached content <= 500KB (truncate oldest if exceeded). 10+ tests.

### Tests
- Content cached after first load
- Subsequent reads use cache
- Stale detection by mtime
- Memory budget enforced
- Preload batch works
- 10+ tests

---

## Task 23: Performance — Prompt Token Counter
- Model: opus
- Effort: high
- Files: src/core/token-counter.ts (new), tests/core/token-counter.test.ts (new)
- Scope: src/core/, tests/core/

### Description
TokenCounter class: estimates token count for prompts before sending to model. countTokens(text: string): uses simple heuristic (words / 0.75 for English, chars / 4 as fallback). estimatePromptSize(agentPrompt, skillPrompts: string[], taskPrompt): total tokens with section breakdown. isWithinBudget(tokens, model): checks against model context limits (opus: 200K, sonnet: 200K, haiku: 200K — conservative working limits of 50K for worker prompts). warnIfExceeding(tokens, threshold): logs warning. 15+ tests.

### Tests
- Token count reasonable for English text
- Section breakdown correct
- Budget check against model limits
- Warning logged when exceeding
- 15+ tests

---

## Task 24: Performance — Lazy Loading Optimization
- Model: opus
- Effort: high
- Files: src/core/lazy-loader.ts (new), tests/core/lazy-loader.test.ts (new)
- Scope: src/core/, tests/core/

### Description
LazyLoader class: defers loading of agent pool and skill pool until first use. lazyLoad<T>(loader: () => Promise<T>): returns proxy that triggers load on first access. AgentPool and SkillPool wrapped with lazy loading in Brain initialization. Preload hint: preloadIfNeeded(config): if decision_engine.enabled, preload pools during readContext (parallel with other context reads). Lazy load reduces startup time when decision engine is disabled. 10+ tests.

### Tests
- Lazy load defers until first access
- Preload triggers immediate load
- Multiple accesses don't re-load
- Error in loader propagated
- 10+ tests

---

## Task 25: Performance — Batch Stats Update
- Model: opus
- Effort: high
- Files: src/orchestra/batch-stats.ts (new), tests/orchestra/batch-stats.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
BatchStatsUpdater class: collects all stat updates during sprint evaluation and writes them in a single batch (instead of per-task file writes). queue(update: StatsUpdate): adds to batch queue. StatsUpdate: {type: 'agent'|'skill'|'learning', id: string, data: Record<string, unknown>}. flush(): writes all queued updates to disk. Reduces file I/O from O(tasks * agents * skills) to O(agents + skills + 1). Called once at end of EVALUATE phase. 10+ tests.

### Tests
- Updates queued correctly
- Flush writes all at once
- Agent stats updated
- Skill stats updated
- Learning entries batched
- 10+ tests

---

## Task 26: Config — Marketplace Authentication
- Model: opus
- Effort: high
- Files: src/core/marketplace/marketplace-auth.ts (new), tests/core/marketplace/marketplace-auth.test.ts (new)
- Scope: src/core/marketplace/, tests/core/marketplace/

### Description
MarketplaceAuth class: manages authentication for skill marketplace. login(token: string): stores auth token in ~/.deckent/credentials/marketplace.json (file permission 0600). logout(): removes stored token. getToken(): reads stored token. isAuthenticated(): checks if valid token exists. validateToken(token): verifies against registry API (GET /auth/verify). Token format: opaque string (API key). 10+ tests.

### Tests
- Token stored with correct permissions
- Token read back correctly
- Logout removes token
- isAuthenticated checks file existence
- 10+ tests

---

## Task 27: Config — Skill Sandboxing
- Model: opus
- Effort: high
- Files: src/core/marketplace/skill-sandbox.ts (new), tests/core/marketplace/skill-sandbox.test.ts (new)
- Scope: src/core/marketplace/, tests/core/marketplace/

### Description
SkillSandbox class: validates that installed skills cannot execute arbitrary code. validateSkillSafety(skillPath): checks SKILL.md for suspicious patterns (shell commands, file:// URLs, base64 encoded content). validateManifest(manifest): checks permissions field is reasonable (no "all" permissions). quarantine(skillId): moves to .deckent/skills/.quarantine/ for review. trustSkill(skillId): marks as verified (adds trusted: true to manifest). Built-in skills auto-trusted. 10+ tests.

### Tests
- Suspicious SKILL.md content detected
- Excessive permissions flagged
- Quarantine moves skill
- Trust marks manifest
- Built-in skills auto-trusted
- 10+ tests

---

## Task 28: Config — Agent Permission Escalation Prevention
- Model: opus
- Effort: high
- Files: src/agents/permission-guard.ts (new), tests/agents/permission-guard.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
PermissionGuard class: prevents agents from escalating their own permissions. validateAgentModification(agentId, changes: Partial<AgentDefinition>, modifier: string). Rules: 1) Agents cannot add tools to their own allowedTools, 2) Agents cannot expand their own triggerScopes, 3) Only Brain (modifier='brain') can modify agent definitions, 4) Workers cannot create new agents. Log all modification attempts. Block and alert on escalation attempt. 10+ tests.

### Tests
- Self-modification blocked
- Brain modification allowed
- Tool escalation prevented
- Scope expansion prevented
- Escalation logged
- 10+ tests

---

## Task 29: Documentation — Agent/Skill/Marketplace Guide
- Model: opus
- Effort: high
- Files: docs/AGENT-GUIDE.md (new), docs/MARKETPLACE-GUIDE.md (new)
- Scope: docs/

### Description
Two documentation files. AGENT-GUIDE.md: 1) What are agents, 2) Built-in agents (8 descriptions), 3) Agent selection algorithm, 4) Creating custom agents, 5) Adaptive agent (self-improvement, A/B testing, versioning), 6) Agent retirement/reinstatement, 7) Performance tracking. MARKETPLACE-GUIDE.md: 1) What is the skill marketplace, 2) Searching for skills, 3) Installing skills, 4) Publishing skills, 5) Rating system, 6) Dependency resolution, 7) Security/sandboxing. Both English, concise. 10+ tests.

### Tests
- AGENT-GUIDE.md exists with all sections
- MARKETPLACE-GUIDE.md exists with all sections
- All content English
- Code examples included
- 10+ tests

---

## Task 30: Release Preparation — Changelog + Version Bump
- Model: opus
- Effort: high
- Files: docs/CHANGELOG.md (extend), package.json (extend)
- Scope: docs/, package.json

### Description
Update CHANGELOG.md with Sprint 031-033 entries. Group by feature area: Decision Engine (Sprint 031), UX Improvements (Sprint 032), Marketplace + Analytics (Sprint 033). Each entry: feature name, brief description, key files. Version bump in package.json: minor version increment for new feature set. Add "agents", "skills", "marketplace", "analytics" to package.json keywords. Verify all new exports are listed in package.json files/exports field. 10+ tests.

### Tests
- CHANGELOG.md has Sprint 031-033 entries
- Version bumped correctly
- Keywords added
- Exports field complete
- 10+ tests

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests 0 regression
- All tasks opus model, effort high
- All documentation English
- Marketplace features gracefully degrade when offline
- Security: no skill can execute code outside its declared scope
