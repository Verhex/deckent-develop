# Agents Reference

> **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.

Agents are domain specialists that Brain assigns per task. Built-in agents live under `.deckent/agents/`; `temp-*` agents are runtime-generated and auto-promoted/demoted by the Evolution Pipeline.

<!-- AUTOGEN:START id="agents" -->
> 17 agents (15 built-in, 2 custom). Generated from `.deckent/agents/*/agent.json`.

| Agent | Name | Expertise | Description |
|-------|------|-----------|-------------|
| `accessibility-auditor` | Accessibility Auditor | accessibility, wcag, aria, screen-reader, keyboard-navigation, color-contrast | WCAG 2.1 AA/AAA compliance auditor. ARIA patterns, keyboard navigation, screen reader compatibility, color contrast, focus management. |
| `api-builder` | API Builder | rest-api, http, validation, error-handling, openapi | REST API development specialist. Endpoint design, HTTP conventions, validation, error responses, OpenAPI. |
| `architect` | Architect | system-design, module-architecture, dependency-analysis, adr, design-patterns, scalability | Software architect. System decomposition, dependency analysis, module boundary design, ADR writing, trade-off analysis. |
| `architecture-planner` | Architecture Planner | system-design, module-architecture, dependency-analysis, api-design, migration-planning, scalability, enterprise-patterns | System architecture and infrastructure design specialist. Analyzes codebases, designs module hierarchies, plans refactoring strategies, and creates enterprise-grade architectural blueprints. Excels at identifying coupling, redundancy, and scalability bottlenecks. |
| `bug-fixer` | Bug Fixer | debugging, root-cause-analysis, regression-testing, error-handling | Root cause analysis and minimal fix specialist. Regression testing, bisect methodology, no band-aid patches. |
| `ci-guardian` | CI Guardian | ci-cd, testing, regression-detection, build-verification, github-actions | CI/CD pipeline guardian — ensures tsc, vitest, and build pass before and after sprint tasks |
| `code-reviewer` | Code Reviewer | code-review, quality-analysis, best-practices, design-patterns | Systematic code review agent. Quality analysis, correctness checks, security review, and improvement suggestions. |
| `data-engineer` | Data Engineer | database, schema-design, query-optimization, etl, data-modeling, orm | Database schema design, query optimization, ORM best practices, ETL pipelines, data modeling. Prisma, Drizzle, TypeORM expertise. |
| `devops-engineer` | DevOps Engineer | ci-cd, docker, deployment, infrastructure, monitoring, github-actions | CI/CD pipelines, Docker containerization, deployment automation, infrastructure as code, monitoring setup. GitHub Actions expert. |
| `doc-writer` | Doc Writer | documentation, technical-writing, jsdoc, readme, changelog | Documentation specialist. README structure, changelogs, JSDoc/TSDoc, guides, and API documentation. |
| `frontend-designer` | Frontend Designer | ui-design, component-architecture, responsive-design, css, accessibility, design-systems | Production-grade UI/UX design agent. Component architecture, responsive layout, Tailwind CSS, design systems, micro-animations, visual hierarchy. |
| `migration-specialist` | Migration Specialist | framework-migration, version-upgrade, breaking-changes, backward-compatibility, codemods | Framework migration, version upgrades, breaking change management, codemod generation, backward compatibility shims. |
| `performance-analyzer` | Performance Analyzer | performance, profiling, optimization, memory-management, caching | Performance profiling and optimization specialist. Big-O analysis, memory leaks, caching strategies, benchmarking. |
| `refactorer` | Refactorer | refactoring, design-patterns, modularization, code-organization | Code refactoring specialist. Extract, rename, split, merge, and reorganize code while preserving behavior. |
| `security-auditor` | Security Auditor | security, authentication, encryption, vulnerability-assessment | Security-focused code analysis. OWASP compliance, vulnerability detection, threat modeling. |
| `temp-react-specialist` | React Specialist | react, hooks, vite, component-architecture, css-modules | Expert in React component architecture, hooks, and state management. |
| `temp-react-ts-specialist` | React TypeScript Specialist | react, typescript, hooks, vite, component-architecture | Expert in React + TypeScript component architecture, hooks, and testing with Vitest/RTL. |
<!-- AUTOGEN:END id="agents" -->
