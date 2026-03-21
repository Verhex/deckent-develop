# DIRECTIVES — Sprint 030 (Skill System + Stack Detection + Prompt Injection)

## Goal: Implement dynamic skill system. Skills are composable knowledge modules that agents use. Stack detection auto-matches skills to project technology. Prompt injection enriches worker prompts with skill content. 30 tasks — all opus model, effort high.

---

## Task 1: SkillDefinition Type
- Model: opus
- Effort: high
- Files: src/core/skill-types.ts (new), tests/core/skill-types.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Define SkillDefinition interface extending PluginManifest: category ('language'|'framework'|'tool'|'domain'|'workflow'), stackDetection ({files[], dependencies[], commands[]}), composableWith[] (compatible skill IDs), priority (number), promptInjection ({position: 'prepend'|'append'|'section', maxTokens: number}). Also SkillSelectionResult type: {skills: SkillDefinition[], scores: Map<string, number>, truncated: boolean}. ProjectStack type: {language, framework, dependencies[], buildTool, testFramework}. 15+ tests.

### Tests
- SkillDefinition fields validated
- Category enum correct
- stackDetection structure
- 15+ tests

---

## Task 2: SkillPool Class
- Model: opus
- Effort: high
- Files: src/core/skill-pool.ts (new), tests/core/skill-pool.test.ts (new)
- Scope: src/core/, tests/core/

### Description
SkillPool class: loadSkills(projectRoot) from .deckent/skills/*/manifest.json, getSkill(id), listSkills(), listByCategory(category), enableSkill(id), disableSkill(id). Support .deckent/skills/ (persistent) + project-learned skills. validateSkillDefinition(skill) with error messages. 15+ tests.

### Tests
- Load skills from directory
- Filter by category
- Enable/disable
- Validation errors
- 15+ tests

---

## Task 3: Stack Detector
- Model: opus
- Effort: high
- Files: src/core/stack-detector.ts (new), tests/core/stack-detector.test.ts (new)
- Scope: src/core/, tests/core/

### Description
detectProjectStack(projectRoot): scans project for technology indicators. Returns ProjectStack. Detection rules: tsconfig.json → TypeScript, package.json dependencies → React/Vue/Angular/Express/Fastify, setup.py/pyproject.toml → Python, Cargo.toml → Rust, go.mod → Go, Dockerfile → Docker, .github/workflows → GitHub Actions, vitest.config → Vitest, jest.config → Jest. Cache result in .deckent/project-stack.json. 20+ tests.

### Tests
- TypeScript detected from tsconfig.json
- React detected from package.json deps
- Python detected from setup.py
- Multiple technologies detected
- Cache written and read
- 20+ tests

---

## Task 4: Skill Selector Algorithm
- Model: opus
- Effort: high
- Files: src/core/skill-selector.ts (new), tests/core/skill-selector.test.ts (new)
- Scope: src/core/, tests/core/

### Description
selectSkills(task, projectStack, pool, agent?): 1) Match project stack → language/framework skills, 2) Match task keywords → domain/workflow skills, 3) Filter by agent compatibility (if agent specified), 4) Check composableWith for conflicts, 5) Sort by priority, 6) Cap at 3 skills max. Returns SkillSelectionResult. 20+ tests.

### Tests
- Stack match selects language skill
- Keyword match selects domain skill
- Agent compatibility filter works
- ComposableWith conflict detected
- Max 3 skills enforced
- 20+ tests

---

## Task 5: Built-in Skill — typescript-expert
- Model: opus
- Effort: high
- Files: .deckent/skills/typescript-expert/manifest.json (new), .deckent/skills/typescript-expert/SKILL.md (new)
- Scope: .deckent/skills/

### Description
TypeScript expert skill. stackDetection: {files: ["tsconfig.json", "*.ts", "*.tsx"]}. triggers: [typescript, type, interface, generic, enum, decorator, module]. composableWith: all except python-expert. SKILL.md: strict typing practices, no any, prefer interfaces, utility types, discriminated unions, error handling patterns. 5+ tests.

### Tests
- manifest.json valid
- SKILL.md content
- 5+ tests

---

## Task 6: Built-in Skill — react-specialist
- Model: opus
- Effort: high
- Files: .deckent/skills/react-specialist/manifest.json (new), .deckent/skills/react-specialist/SKILL.md (new)
- Scope: .deckent/skills/

### Description
React specialist skill. stackDetection: {dependencies: ["react", "react-dom"]}. triggers: [react, component, hook, jsx, tsx, state, props, context, reducer]. composableWith: [typescript-expert, testing-expert]. SKILL.md: functional components, custom hooks, React 18+ patterns, performance (memo, useMemo, useCallback), testing with React Testing Library. 5+ tests.

### Tests
- manifest.json valid
- 5+ tests

---

## Task 7: Built-in Skill — python-expert
- Model: opus
- Effort: high
- Files: .deckent/skills/python-expert/manifest.json (new), .deckent/skills/python-expert/SKILL.md (new)
- Scope: .deckent/skills/

### Description
Python expert skill. stackDetection: {files: ["setup.py", "pyproject.toml", "requirements.txt", "*.py"]}. triggers: [python, pip, django, flask, fastapi, pytest]. SKILL.md: type hints, PEP 8, async/await, virtual environments, testing with pytest. 5+ tests.

### Tests
- manifest.json valid
- 5+ tests

---

## Task 8: Built-in Skill — api-builder
- Model: opus
- Effort: high
- Files: .deckent/skills/api-builder/manifest.json (new), .deckent/skills/api-builder/SKILL.md (new)
- Scope: .deckent/skills/

### Description
API builder skill. stackDetection: {dependencies: ["express", "fastify", "koa", "hono"]}. triggers: [api, endpoint, route, rest, graphql, middleware, cors, validation]. SKILL.md: RESTful conventions, status codes, error responses, input validation, rate limiting, OpenAPI spec. 5+ tests.

### Tests
- manifest.json valid
- 5+ tests

---

## Task 9: Built-in Skill — database-migration
- Model: opus
- Effort: high
- Files: .deckent/skills/database-migration/manifest.json (new), .deckent/skills/database-migration/SKILL.md (new)
- Scope: .deckent/skills/

### Description
Database migration skill. stackDetection: {dependencies: ["prisma", "typeorm", "knex", "drizzle", "sequelize"]}. triggers: [database, migration, schema, query, model, relation, index, seed]. SKILL.md: migration safety (reversible, idempotent), schema design, N+1 prevention, transaction handling. 5+ tests.

### Tests
- manifest.json valid
- 5+ tests

---

## Task 10: Built-in Skill — testing-expert
- Model: opus
- Effort: high
- Files: .deckent/skills/testing-expert/manifest.json (new), .deckent/skills/testing-expert/SKILL.md (new)
- Scope: .deckent/skills/

### Description
Testing expert skill. stackDetection: {dependencies: ["vitest", "jest", "mocha", "cypress"]}. triggers: [test, coverage, spec, mock, stub, fixture, assertion, e2e, integration]. composableWith: all. SKILL.md: test pyramid, isolation, mock boundaries, coverage targets, snapshot testing, CI integration. 5+ tests.

### Tests
- manifest.json valid
- 5+ tests

---

## Task 11: Built-in Skill — documentation-writer
- Model: opus
- Effort: high
- Files: .deckent/skills/documentation-writer/manifest.json (new), .deckent/skills/documentation-writer/SKILL.md (new)
- Scope: .deckent/skills/

### Description
Documentation writer skill. stackDetection: {files: ["docs/", "README.md"]}. triggers: [docs, readme, changelog, guide, tutorial, jsdoc, api-docs]. SKILL.md: Keep a Changelog, JSDoc/TSDoc conventions, README structure, diagram conventions. 5+ tests.

### Tests
- manifest.json valid
- 5+ tests

---

## Task 12: Built-in Skill — security-specialist
- Model: opus
- Effort: high
- Files: .deckent/skills/security-specialist/manifest.json (new), .deckent/skills/security-specialist/SKILL.md (new)
- Scope: .deckent/skills/

### Description
Security specialist skill. stackDetection: always available. triggers: [security, auth, jwt, encryption, vulnerability, owasp, csrf, xss, sql-injection]. SKILL.md: OWASP Top 10, input validation, output encoding, authentication/authorization patterns, secret management. 5+ tests.

### Tests
- manifest.json valid
- 5+ tests

---

## Task 13: Built-in Skill — performance-optimizer
- Model: opus
- Effort: high
- Files: .deckent/skills/performance-optimizer/manifest.json (new), .deckent/skills/performance-optimizer/SKILL.md (new)
- Scope: .deckent/skills/

### Description
Performance optimizer skill. stackDetection: always available. triggers: [performance, optimize, cache, memory, latency, bottleneck, profiling, lazy-load]. SKILL.md: profiling methodology, Big-O analysis, caching strategies, lazy loading, bundle optimization. 5+ tests.

### Tests
- manifest.json valid
- 5+ tests

---

## Task 14: Built-in Skill — devops-engineer
- Model: opus
- Effort: high
- Files: .deckent/skills/devops-engineer/manifest.json (new), .deckent/skills/devops-engineer/SKILL.md (new)
- Scope: .deckent/skills/

### Description
DevOps engineer skill. stackDetection: {files: ["Dockerfile", "docker-compose.yml", ".github/workflows/"]}. triggers: [docker, ci, deploy, pipeline, infrastructure, kubernetes, terraform, nginx]. SKILL.md: Dockerfile best practices, multi-stage builds, CI/CD patterns, environment variables. 5+ tests.

### Tests
- manifest.json valid
- 5+ tests

---

## Task 15: Skill Prompt Injection
- Model: opus
- Effort: high
- Files: src/orchestra/task-builder.ts (extend), tests/orchestra/task-builder.test.ts (extend)
- Scope: src/orchestra/, tests/orchestra/

### Description
Extend buildWorkerPrompt to inject selected skills. New signature: buildWorkerPrompt(task, agentPrompt?, skillPrompts?). Skills injected as "=== Skills ===" section after agent prompt. Each skill truncated at skill.promptInjection.maxTokens (default 1500). Total skill section capped at 4000 tokens. 10+ tests.

### Tests
- Skills injected in correct position
- Truncation at token limit
- Multiple skills concatenated
- No skills = current behavior
- 10+ tests

---

## Task 16: brain.ts — Skill Selection in planSprint
- Model: opus
- Effort: high
- Files: src/orchestra/brain.ts (extend), tests/orchestra/brain-skill.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Integrate skill selection into planSprint after agent selection. Steps: 1) detectProjectStack (cached), 2) For each task: selectSkills(task, stack, skillPool, selectedAgent), 3) Store selected skill IDs on task (new field: assignedSkills[]), 4) Read SKILL.md content for prompt injection in spawnWorkers. 15+ tests.

### Tests
- Skills selected during planning
- Stack detection cached
- assignedSkills field set
- SKILL.md content read and injected
- 15+ tests

---

## Task 17: model-selector.ts — Skill Model Preference
- Model: opus
- Effort: high
- Files: src/orchestra/model-selector.ts (extend), tests/orchestra/resolve-task-model.test.ts (extend)
- Scope: src/orchestra/, tests/orchestra/

### Description
Add Layer 4d in resolveTaskModel: if selected skills have model preferences and no forceModel, take highest model preference among skills. Example: typescript-expert prefers sonnet, security-specialist prefers opus → opus wins. 10+ tests.

### Tests
- Skill model preference applied
- Higher model wins among skills
- forceModel still overrides
- No skills = current behavior
- 10+ tests

---

## Task 18: CLI — deckent skill list
- Model: opus
- Effort: high
- Files: src/cli/commands/skill.ts (new), tests/cli/commands/skill.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
New CLI command: deckent skill list. Shows all skills with: name, category, status, triggers, compatible agents. Table format. --json flag. --category filter. 10+ tests.

### Tests
- Lists all skills
- --category filter works
- --json output
- 10+ tests

---

## Task 19: CLI — deckent skill create
- Model: opus
- Effort: high
- Files: src/cli/commands/skill.ts (extend), tests/cli/commands/skill.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
deckent skill create <name>. Interactive wizard: name, category, triggers, stack detection rules, compatible skills, model preference. Creates .deckent/skills/{name}/manifest.json + SKILL.md template. 10+ tests.

### Tests
- Creates skill directory
- manifest.json valid
- SKILL.md template
- Duplicate name rejected
- 10+ tests

---

## Task 20: CLI — deckent skill install
- Model: opus
- Effort: high
- Files: src/cli/commands/skill.ts (extend), tests/cli/commands/skill.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
deckent skill install <source>. Source: git URL or local path. Clone/copy to .deckent/skills/. Validate manifest. Check for conflicts with existing skills. --force flag to overwrite. Foundation for future marketplace. 10+ tests.

### Tests
- Install from local path
- Validate manifest on install
- Conflict detection
- --force overwrite
- 10+ tests

---

## Task 21: Skill Stats Tracking
- Model: opus
- Effort: high
- Files: src/core/skill-pool.ts (extend), tests/core/skill-pool.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
Track skill usage stats: totalUses, successRate, avgCoverage, lastUsedInSprint. Updated after sprint evaluation. Stats saved in manifest.json. Used by skill selector for tie-breaking. 10+ tests.

### Tests
- Stats updated after evaluation
- successRate calculated correctly
- Stats persisted to manifest.json
- 10+ tests

---

## Task 22: Skill Composition Resolver
- Model: opus
- Effort: high
- Files: src/core/skill-selector.ts (extend), tests/core/skill-selector.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
resolveComposition(selectedSkills): check composableWith fields. If skill A lists B in composableWith but B doesn't list A, warn but allow. If neither lists the other and categories conflict (two language skills), reject combination. Return {resolved: SkillDefinition[], conflicts: string[]}. 10+ tests.

### Tests
- Compatible skills pass
- Conflicting categories rejected
- One-way compatible warns
- Max 3 enforced after resolution
- 10+ tests

---

## Task 23: Project Stack Cache
- Model: opus
- Effort: high
- Files: src/core/stack-detector.ts (extend), tests/core/stack-detector.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
Cache project stack in .deckent/project-stack.json. refreshStack(projectRoot): force re-detection. isStackStale(projectRoot): check if package.json/tsconfig.json modified since last detection (mtime comparison). Brain calls isStackStale before planning. 10+ tests.

### Tests
- Cache written on first detection
- Cache read on subsequent calls
- Stale detection by mtime
- Force refresh works
- 10+ tests

---

## Task 24: Skill Learning from Sprint Results
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-reporter.ts (extend), tests/orchestra/sprint-reporter.test.ts (extend)
- Scope: src/orchestra/, tests/orchestra/

### Description
After sprint: record which skill combinations led to DONE vs NO_GO. Write to PATTERNS.md: {taskType, skills[], evaluation, coverage}. Brain reads patterns during skill selection — prefer proven combinations, avoid failed ones. 10+ tests.

### Tests
- Skill combinations recorded
- Successful patterns preferred
- Failed patterns avoided
- 10+ tests

---

## Task 25: types.ts — Skill Type Extensions
- Model: opus
- Effort: high
- Files: src/core/types.ts (extend), tests/core/types.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
Add to types.ts: assignedSkills: string[] on Task, skillIds: string[] on TaskResult. Add ProjectStack interface. Update PlannerTask to include skill suggestions. 5+ tests.

### Tests
- New fields compile
- Type assertions pass
- 5+ tests

---

## Task 26: Integration Test — Skill Selection E2E
- Model: opus
- Effort: high
- Files: tests/integration/skill-selection.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end: 1) Detect project stack (TypeScript), 2) Load skill pool, 3) Create task with "react component" keywords, 4) Select skills → typescript-expert + react-specialist, 5) Verify prompt injection, 6) Verify stats updated. 15+ tests.

### Tests
- Stack detected correctly
- Skills matched to task
- Prompt enriched
- Stats updated
- 15+ tests

---

## Task 27: Integration Test — Stack Detection E2E
- Model: opus
- Effort: high
- Files: tests/integration/stack-detection.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end stack detection: 1) Mock project with tsconfig.json + package.json (react, vitest deps), 2) Detect stack, 3) Verify: language=typescript, framework=react, testFramework=vitest, 4) Cache written, 5) Second call reads cache, 6) Force refresh re-detects. 10+ tests.

### Tests
- Full stack detected
- Cache works
- Force refresh works
- 10+ tests

---

## Task 28: Skill Marketplace Foundation — Registry
- Model: opus
- Effort: high
- Files: src/core/skill-registry.ts (new), tests/core/skill-registry.test.ts (new)
- Scope: src/core/, tests/core/

### Description
SkillRegistry: local index of available skills (foundation for remote marketplace). registerSkill(skill), searchSkills(query), getPopular(limit). Index stored in .deckent/skill-registry.json. Currently local-only — remote marketplace in future sprint. 10+ tests.

### Tests
- Register and search
- Popular by usage
- Index persisted
- 10+ tests

---

## Task 29: Skill Documentation
- Model: opus
- Effort: high
- Files: docs/SKILLS.md (new), tests/docs/skills.test.ts (new)
- Scope: docs/, tests/docs/

### Description
Comprehensive skill system documentation. Sections: 1) What are skills, 2) Built-in skills (10 descriptions), 3) Creating custom skills (deckent skill create), 4) Installing skills (deckent skill install), 5) Skill selection algorithm, 6) Skill composition, 7) Stack detection, 8) Marketplace (future). 5+ tests.

### Tests
- Doc exists
- All sections present
- English
- 5+ tests

---

## Task 30: Skill System Configuration
- Model: opus
- Effort: high
- Files: src/core/config.ts (extend), tests/core/config.test.ts (extend)
- Scope: src/core/, tests/core/

### Description
Add skill config to DeckentConfig: skills: {enabled: boolean, maxPerTask: number (default 3), autoDetectStack: boolean (default true), preferredSkills: string[]}. Validate in validateConfig. Brain reads config during skill selection. 10+ tests.

### Tests
- Config field parsed
- Defaults applied
- Validation catches invalid values
- Brain respects maxPerTask
- 10+ tests

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests 0 regression
- All tasks opus model, effort high
- All documentation English
