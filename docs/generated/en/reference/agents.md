# Agents Reference

> **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.

Agents are domain specialists that Brain assigns per task. Built-in agents live under `.deckent/agents/`; `temp-*` agents are runtime-generated and auto-promoted/demoted by the Evolution Pipeline.

<!-- AUTOGEN:START id="agents-en" -->
> 23 agents (21 built-in, 2 custom). Generated from `.deckent/agents/*/agent.json`.

| Agent | Name | Expertise | Description |
|-------|------|-----------|-------------|
| `accessibility-auditor` | Accessibility Auditor | accessibility, wcag, aria, screen-reader, keyboard-navigation, color-contrast | WCAG 2.1 AA/AAA compliance auditor. ARIA patterns, keyboard navigation, screen reader compatibility, color contrast, focus management. |
| `api-builder` | API Builder | rest-api, http, validation, error-handling, openapi | REST API development specialist. Endpoint design, HTTP conventions, validation, error responses, OpenAPI. |
| `api-designer` | API Designer | contract-design, schema-design, idempotency, api-evolution, error-taxonomy | Contract-design specialist. Envelope/schema shape, idempotency guarantees, non-breaking evolution, and error taxonomy across HTTP API, MCP, and internal task/result contracts. |
| `architect` | Architect | system-design, module-architecture, dependency-analysis, adr, design-patterns, scalability | Software architect. System decomposition, dependency analysis, module boundary design, ADR writing, trade-off analysis. |
| `architecture-planner` | Architecture Planner | system-design, module-architecture, dependency-analysis, api-design, migration-planning, scalability, enterprise-patterns | System architecture and infrastructure design specialist. Analyzes codebases, designs module hierarchies, plans refactoring strategies, and creates enterprise-grade architectural blueprints. Excels at identifying coupling, redundancy, and scalability bottlenecks. |
| `bug-fixer` | Bug Fixer | debugging, root-cause-analysis, regression-testing, error-handling | Root cause analysis and minimal fix specialist. Regression testing, bisect methodology, no band-aid patches. |
| `ci-guardian` | CI Guardian | ci-cd, testing, regression-detection, build-verification, github-actions | CI/CD pipeline guardian — ensures tsc, vitest, and build pass before and after sprint tasks |
| `code-reviewer` | Code Reviewer | code-review, quality-analysis, best-practices, design-patterns | Systematic code review agent. Quality analysis, correctness checks, security review, and improvement suggestions. |
| `data-engineer` | Data Engineer | database, schema-design, query-optimization, etl, data-modeling, orm | Database schema design, query optimization, ORM best practices, ETL pipelines, data modeling. Prisma, Drizzle, TypeORM expertise. |
| `devops-engineer` | DevOps Engineer | ci-cd, docker, deployment, infrastructure, monitoring, github-actions | CI/CD pipelines, Docker containerization, deployment automation, infrastructure as code, monitoring setup. GitHub Actions expert. |
| `doc-writer` | Doc Writer | documentation, technical-writing, jsdoc, readme, changelog | Documentation specialist. README structure, changelogs, JSDoc/TSDoc, guides, and API documentation. |
| `frontend-designer` | Frontend Designer | ui-design, component-architecture, responsive-design, css, accessibility, design-systems | Production-grade UI/UX design agent. Component architecture, responsive layout, Tailwind CSS, design systems, micro-animations, visual hierarchy. |
| `i18n-specialist` | i18n Specialist | i18n, localization, message-catalogs, pluralization, translation-parity | Internationalization-quality specialist. getMessage as the single string-lookup path, interpolation/pluralization safety, locale fallback chain, translation-parity enforcement. |
| `implementer` | Implementer | feature-implementation, api-integration, component-construction, general-development | Neutral feature-builder specialist. Implements new functionality by following existing codebase patterns, shipping tests with the code, and reporting honest self-assessment. |
| `integration-engineer` | Integration Engineer | external-integrations, http-adapters, webhooks, secret-handling, retry-policies | External-service integration specialist. HTTP-API adapters, secret-handling patterns, fail-honest error propagation, single-retry policies for connectors and webhooks. |
| `migration-specialist` | Migration Specialist | framework-migration, version-upgrade, breaking-changes, backward-compatibility, codemods | Framework migration, version upgrades, breaking change management, codemod generation, backward compatibility shims. |
| `observability-engineer` | Observability Engineer | observability, heartbeat-contracts, structured-logging, correlation-id, alert-thresholds | Liveness and diagnosability specialist. Heartbeat contracts, structured/greppable logging, correlation-ID threading, dashboard-as-derived-state, alert-threshold governance. |
| `performance-analyzer` | Performance Analyzer | performance, profiling, optimization, memory-management, caching | Performance profiling and optimization specialist. Big-O analysis, memory leaks, caching strategies, benchmarking. |
| `refactorer` | Refactorer | refactoring, design-patterns, modularization, code-organization | Code refactoring specialist. Extract, rename, split, merge, and reorganize code while preserving behavior. |
| `security-auditor` | Security Auditor | security, authentication, encryption, vulnerability-assessment | Security-focused code analysis. OWASP compliance, vulnerability detection, threat modeling. |
| `temp-react-specialist` | React Specialist | react, hooks, vite, component-architecture, css-modules | Expert in React component architecture, hooks, and state management. |
| `temp-react-ts-specialist` | React TypeScript Specialist | react, typescript, hooks, vite, component-architecture | Expert in React + TypeScript component architecture, hooks, and testing with Vitest/RTL. |
| `terminal-ux-engineer` | Terminal UX Engineer | ink-tui, terminal-rendering, raw-mode-input, cli-ux, i18n-strings | Ink/React-CLI terminal UI specialist. Static/anchor/input-pinned layout, raw-mode + NO_COLOR guards, string-free i18n-clean rendering, render-without-mounting Ink tests. |
<!-- AUTOGEN:END id="agents-en" -->
