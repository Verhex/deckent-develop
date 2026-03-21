# Skill System

## What Are Skills?

Skills are composable knowledge modules that enhance worker agents with domain-specific expertise. Unlike agents (which are execution personas), skills are **knowledge packs** that get injected into worker prompts based on the task context and detected project stack.

Each skill contains:
- A `manifest.json` describing its capabilities, triggers, and stack detection rules
- A `SKILL.md` file with the actual knowledge content injected into prompts
- Stats tracking for continuous improvement of skill selection

## Built-in Skills

### typescript-expert
Category: language | Priority: 10
Triggers: typescript, type, interface, generic, enum, decorator, module, tsconfig
Stack detection: tsconfig.json, typescript dependency
Expertise: Strict typing, utility types, error handling patterns, module resolution.

### react-specialist
Category: framework | Priority: 8
Triggers: react, component, jsx, hook, useState, useEffect, props
Stack detection: react, react-dom dependencies
Expertise: Functional components, hooks, state management, performance optimization.

### testing-expert
Category: tool | Priority: 7
Triggers: test, spec, coverage, vitest, jest, mock, assertion
Stack detection: vitest or jest dependency
Expertise: Unit testing, integration testing, mocking strategies, coverage optimization.

### security-specialist
Category: domain | Priority: 9
Triggers: security, auth, jwt, xss, csrf, vulnerability, encryption
Stack detection: N/A (domain-universal)
Expertise: Authentication, authorization, input validation, OWASP top 10.

### performance-optimizer
Category: domain | Priority: 6
Triggers: performance, optimize, cache, lazy, bundle, memory, profiling
Stack detection: N/A (domain-universal)
Expertise: Bundle optimization, caching strategies, lazy loading, memory management.

### api-builder
Category: domain | Priority: 7
Triggers: api, endpoint, rest, graphql, route, middleware, controller
Stack detection: express, @nestjs/core, fastify dependencies
Expertise: RESTful design, input validation, error handling, versioning.

### database-migration
Category: tool | Priority: 6
Triggers: database, migration, schema, orm, prisma, sequelize, query
Stack detection: prisma, sequelize, typeorm dependencies
Expertise: Schema design, migration strategies, query optimization.

### devops-engineer
Category: workflow | Priority: 5
Triggers: ci, cd, docker, deploy, pipeline, github-actions, workflow
Stack detection: .github/workflows, Dockerfile, docker-compose.yml
Expertise: CI/CD pipelines, containerization, deployment automation.

### documentation-writer
Category: workflow | Priority: 4
Triggers: docs, readme, changelog, api-docs, jsdoc, comment
Stack detection: N/A (workflow-universal)
Expertise: Technical writing, API documentation, code comments.

### accessibility-specialist
Category: domain | Priority: 5
Triggers: accessibility, a11y, aria, screen-reader, wcag, semantic
Stack detection: react, vue, angular dependencies
Expertise: WCAG compliance, ARIA attributes, semantic HTML, keyboard navigation.

## Creating Custom Skills

Create a new skill with the CLI:

```bash
deckent skill create my-skill
```

This creates `.deckent/skills/my-skill/` with:
- `manifest.json` — Skill configuration with defaults
- `SKILL.md` — Knowledge template to fill in

### manifest.json Structure

```json
{
  "id": "my-skill",
  "name": "My Skill",
  "version": "0.1.0",
  "description": "What this skill does",
  "entrypoint": "SKILL.md",
  "category": "tool",
  "triggers": ["keyword1", "keyword2"],
  "stackDetection": {
    "files": ["config-file.json"],
    "dependencies": ["npm-package"],
    "commands": []
  },
  "composableWith": ["typescript-expert"],
  "priority": 5,
  "promptInjection": {
    "position": "append",
    "maxTokens": 1500
  },
  "enabled": true,
  "stats": {
    "totalUses": 0,
    "successRate": 0,
    "avgCoverage": 0,
    "lastUsedInSprint": ""
  }
}
```

### Category Types

| Category   | Description                    | Example              |
|-----------|--------------------------------|----------------------|
| language  | Programming language expertise | typescript-expert    |
| framework | Framework-specific knowledge   | react-specialist     |
| tool      | Tool/library expertise         | testing-expert       |
| domain    | Domain knowledge               | security-specialist  |
| workflow  | Process/workflow knowledge     | devops-engineer      |

## Installing Skills

### From Local Path

```bash
deckent skill install /path/to/skill-directory
```

The directory must contain a valid `manifest.json`. The skill is copied to `.deckent/skills/<id>/`.

### From Git URL

```bash
deckent skill install https://github.com/user/my-skill.git
```

The repository is cloned and validated. Use `--force` to overwrite an existing skill:

```bash
deckent skill install https://github.com/user/my-skill.git --force
```

### Listing Skills

```bash
deckent skill list
deckent skill list --json
deckent skill list --category language
```

## Skill Selection Algorithm

When a task is created, the Brain selects skills using a multi-factor scoring system:

1. **Trigger matching** (2 points per match): Task title and description are scanned for skill trigger keywords.
2. **Stack dependency matching** (3 points per match): Project dependencies are matched against skill `stackDetection.dependencies`.
3. **Language/framework match** (5 points): Direct match between project stack and skill category.
4. **Priority boost** (0.1 * priority): Higher-priority skills get a small score boost.
5. **Proven skill boost** (1 point): Skills with `totalUses > 0` and `successRate > 0.7` get a reliability bonus.

The top 3 skills (configurable) are selected and their `SKILL.md` content is injected into the worker prompt.

### Score Example

For a task "Build React login component with TypeScript":
- `typescript-expert`: trigger("typescript") + stackDep("typescript") + langMatch = 2 + 3 + 5 + 1.0 + 1 = **12.0**
- `react-specialist`: trigger("react", "component") + stackDep("react", "react-dom") + fwMatch = 4 + 6 + 5 + 0.8 + 1 = **16.8**
- `security-specialist`: trigger(none) = **0.9** (priority only)

Selected: react-specialist, typescript-expert (top 2 by score).

## Skill Composition

Skills declare `composableWith` to indicate compatible combinations. When multiple skills are selected, their `SKILL.md` contents are concatenated in score order with section dividers.

Prompt injection positions:
- `prepend`: Skill content appears before the task description
- `append`: Skill content appears after the task description (default)
- `section`: Skill content appears in a dedicated section

Each skill has a `maxTokens` limit (default 1500) to prevent prompt bloat.

## Stack Detection

The stack detection system analyzes the project to determine:
- **Language**: TypeScript, JavaScript, Python, Rust (from config files)
- **Framework**: React, Next.js, Vue, Angular, Express, NestJS (from dependencies)
- **Test framework**: Vitest, Jest, Mocha (from dependencies)
- **Build tool**: tsc, Vite, Webpack, esbuild (from dependencies)

Detection results are cached in `.deckent/project-stack.json`. The cache is automatically invalidated when `package.json` or `tsconfig.json` changes (based on file modification time).

Force re-detection:
```bash
# Programmatic
getProjectStack(fs, projectRoot, true);
```

## Marketplace (Future)

A skill marketplace is planned for sharing and discovering community-created skills:
- `deckent skill search <query>` — Search the marketplace
- `deckent skill publish` — Publish a skill to the marketplace
- Skill versioning and updates
- Community ratings and usage stats

This feature is on the roadmap and not yet implemented.
