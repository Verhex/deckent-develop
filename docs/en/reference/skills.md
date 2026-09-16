# Skill catalog

## Product-user perspective

Skills are expertise/instruction packs selected independently of the agent persona. Project skills live under `.deckent/skills/<id>/SKILL.md`; the pool uses a project layer and a package-relative built-in fallback, validates activation rules, and keeps the Markdown file as the content authority. Inspect the effective pool with `deckent skill list|info`; installation, update, enable, disable, and delete are explicit CLI operations. [Evidence: `src/core/skill-pool.ts:14-39,141-183,319-400,512-527`; `src/cli/commands/skill.ts:239-654`]

The repository contains exactly 30 canonical project skill documents in the audited snapshot. [Evidence: read-only `.deckent/skills/*/SKILL.md` inventory, 2026-08-01]

| Skill ID | Applied expertise | Canonical evidence |
|---|---|---|
| `accessibility-expert` | Accessible UI semantics, keyboard behavior, contrast, and WCAG review. | `.deckent/skills/accessibility-expert/SKILL.md` |
| `anthropic-sdk` | Anthropic SDK clients, messages, streaming, tool use, and error handling. | `.deckent/skills/anthropic-sdk/SKILL.md` |
| `api-builder` | API handler implementation, validation, status semantics, and tests. | `.deckent/skills/api-builder/SKILL.md` |
| `api-design` | Contract-first resources, envelopes, versioning, idempotency, and pagination. | `.deckent/skills/api-design/SKILL.md` |
| `ci-testing` | Hermetic CI, test selection, failure diagnosis, and reproducible gates. | `.deckent/skills/ci-testing/SKILL.md` |
| `code-simplifier` | Behavior-preserving complexity reduction and readability work. | `.deckent/skills/code-simplifier/SKILL.md` |
| `database-migration` | Versioned schema change, backfill, rollback, and compatibility safety. | `.deckent/skills/database-migration/SKILL.md` |
| `devops-engineer` | CI/CD, deployment, infrastructure, and operational automation. | `.deckent/skills/devops-engineer/SKILL.md` |
| `docker-expert` | Image construction, container lifecycle, isolation, and debugging. | `.deckent/skills/docker-expert/SKILL.md` |
| `documentation-writer` | Audience-aware, source-backed technical documentation. | `.deckent/skills/documentation-writer/SKILL.md` |
| `file-watch-hygiene` | `fs.watch` reliability, polling fallback, cleanup, and cross-platform watcher behavior. | `.deckent/skills/file-watch-hygiene/SKILL.md` |
| `frontend-design` | Deliberate visual hierarchy, responsive layout, and production UI craft. | `.deckent/skills/frontend-design/SKILL.md` |
| `git-expert` | Safe history, branching, conflict handling, and repository diagnostics. | `.deckent/skills/git-expert/SKILL.md` |
| `graphql-expert` | GraphQL schema, resolver, validation, performance, and evolution. | `.deckent/skills/graphql-expert/SKILL.md` |
| `i18n-quality` | Locale-safe strings, fallback behavior, interpolation, and parity checks. | `.deckent/skills/i18n-quality/SKILL.md` |
| `ink-tui` | Ink/React terminal rendering, input focus, static history, and flicker control. | `.deckent/skills/ink-tui/SKILL.md` |
| `migration-expert` | Incremental software migration and breaking-change containment. | `.deckent/skills/migration-expert/SKILL.md` |
| `monorepo-expert` | Workspace topology, package boundaries, dependency graph, and shared tooling. | `.deckent/skills/monorepo-expert/SKILL.md` |
| `onboarding-ux` | Inspectable setup step machines, gather/decide separation, and honest readiness. | `.deckent/skills/onboarding-ux/SKILL.md` |
| `performance-optimizer` | Measurement, profiling, algorithmic cost, and statistically sound benchmarks. | `.deckent/skills/performance-optimizer/SKILL.md` |
| `provider-cli-matrix` | Provider-specific CLI argv/stdin/output/auth differences behind a neutral contract. | `.deckent/skills/provider-cli-matrix/SKILL.md` |
| `python-expert` | Typed Python, packaging, testing, async, and idiomatic implementation. | `.deckent/skills/python-expert/SKILL.md` |
| `react-specialist` | React components, hooks, state, performance, and testing patterns. | `.deckent/skills/react-specialist/SKILL.md` |
| `rpc-protocol` | Zod-first RPC envelopes, negotiation, dispatch, and typed errors. | `.deckent/skills/rpc-protocol/SKILL.md` |
| `secure-coding` | Defensive Node.js/TypeScript implementation at input, filesystem, process, and secret boundaries. | `.deckent/skills/secure-coding/SKILL.md` |
| `security-specialist` | Threat modeling, OWASP controls, crypto, auth, logging, and dependency risk. | `.deckent/skills/security-specialist/SKILL.md` |
| `sh-portability` | POSIX shell portability, exit-code preservation, traps, quoting, and wrapper safety. | `.deckent/skills/sh-portability/SKILL.md` |
| `system-architect` | Registries, module boundaries, invariants, scale, and architectural decisions. | `.deckent/skills/system-architect/SKILL.md` |
| `testing-expert` | Test pyramid, focused proofs, fixtures, determinism, and failure readability. | `.deckent/skills/testing-expert/SKILL.md` |
| `typescript-expert` | Strict TypeScript types, discriminated unions, ESM, and maintainable API design. | `.deckent/skills/typescript-expert/SKILL.md` |

## Selection and lifecycle

1. A task may name skills explicitly; routing may also score validated `activation.rules` and exclusions. [Evidence: `src/orchestra/task-builder.ts:512-551`; `src/core/skill-pool.ts:141-183`]
2. The pool loads the project catalog and falls back to package-built-in content; project definitions are the override layer. [Evidence: `src/core/skill-pool.ts:14-39,319-400`]
3. `deckent skill install <source>` accepts local or Git sources and validates the manifest; marketplace search/publish is a separate CLI-only surface. [Evidence: `src/cli/commands/skill.ts:328-496`; `src/cli/commands/skill-marketplace.ts:94-200`]
4. Promotion/evolution can convert temporary evidence into a permanent pool entry, but the current feature manifest labels that pipeline lightly used. [Evidence: `src/orchestra/promotion-pipeline.ts:89-267`; `.deckent/settings/features-manifest.json:300-310`]

## Dogfood / repository reality

- ✅ All 30 `SKILL.md` files exist in the audited project tree.
- ⚠️ File presence does not prove activation in a run. Effective routing, exclusions, task scope, and provider policy still decide selection. [Evidence: `src/core/skill-pool.ts:141-183`; `src/orchestra/task-builder.ts:512-551`]
- ⚠️ Marketplace operations are CLI-only and were help-verified, not network/publish executed. [Evidence: recursive real-binary help audit, 2026-08-01; `src/cli/commands/skill-marketplace.ts:94-200`]

See [Agent catalog](agents.md) for persona roles and [Configuration schema](configuration-schema.md) for routing settings.
