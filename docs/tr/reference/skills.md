# Skill kataloğu

## Product-user perspektifi

Skill'ler agent persona'dan bağımsız seçilen expertise/instruction pack'leridir. Project skill'leri `.deckent/skills/<id>/SKILL.md` altında yaşar; pool project layer ile package-relative built-in fallback kullanır, activation rule'larını validate eder ve Markdown dosyasını content authority olarak tutar. Effective pool'u `deckent skill list|info` ile incele; install, update, enable, disable ve delete explicit CLI operation'lardır. [Kanıt: `src/core/skill-pool.ts:14-39,141-183,319-400,512-527`; `src/cli/commands/skill.ts:239-654`]

Audited snapshot'ta tam 30 canonical project skill dokümanı vardır. [Kanıt: read-only `.deckent/skills/*/SKILL.md` envanteri, 2026-08-01]

| Skill ID | Uygulanan expertise | Canonical kanıt |
|---|---|---|
| `accessibility-expert` | Accessible UI semantics, keyboard behavior, contrast ve WCAG review. | `.deckent/skills/accessibility-expert/SKILL.md` |
| `anthropic-sdk` | Anthropic SDK client, messages, streaming, tool use ve error handling. | `.deckent/skills/anthropic-sdk/SKILL.md` |
| `api-builder` | API handler implementation, validation, status semantics ve tests. | `.deckent/skills/api-builder/SKILL.md` |
| `api-design` | Contract-first resource, envelope, versioning, idempotency ve pagination. | `.deckent/skills/api-design/SKILL.md` |
| `ci-testing` | Hermetic CI, test selection, failure diagnosis ve reproducible gate. | `.deckent/skills/ci-testing/SKILL.md` |
| `code-simplifier` | Behavior-preserving complexity reduction ve readability. | `.deckent/skills/code-simplifier/SKILL.md` |
| `database-migration` | Versioned schema change, backfill, rollback ve compatibility safety. | `.deckent/skills/database-migration/SKILL.md` |
| `devops-engineer` | CI/CD, deployment, infrastructure ve operational automation. | `.deckent/skills/devops-engineer/SKILL.md` |
| `docker-expert` | Image construction, container lifecycle, isolation ve debugging. | `.deckent/skills/docker-expert/SKILL.md` |
| `documentation-writer` | Audience-aware, source-backed technical documentation. | `.deckent/skills/documentation-writer/SKILL.md` |
| `file-watch-hygiene` | `fs.watch` reliability, polling fallback, cleanup ve cross-platform watcher behavior. | `.deckent/skills/file-watch-hygiene/SKILL.md` |
| `frontend-design` | Deliberate visual hierarchy, responsive layout ve production UI craft. | `.deckent/skills/frontend-design/SKILL.md` |
| `git-expert` | Safe history, branching, conflict handling ve repository diagnostics. | `.deckent/skills/git-expert/SKILL.md` |
| `graphql-expert` | GraphQL schema, resolver, validation, performance ve evolution. | `.deckent/skills/graphql-expert/SKILL.md` |
| `i18n-quality` | Locale-safe string, fallback behavior, interpolation ve parity checks. | `.deckent/skills/i18n-quality/SKILL.md` |
| `ink-tui` | Ink/React terminal rendering, input focus, static history ve flicker control. | `.deckent/skills/ink-tui/SKILL.md` |
| `migration-expert` | Incremental software migration ve breaking-change containment. | `.deckent/skills/migration-expert/SKILL.md` |
| `monorepo-expert` | Workspace topology, package boundary, dependency graph ve shared tooling. | `.deckent/skills/monorepo-expert/SKILL.md` |
| `onboarding-ux` | Inspectable setup step machine, gather/decide separation ve honest readiness. | `.deckent/skills/onboarding-ux/SKILL.md` |
| `performance-optimizer` | Measurement, profiling, algorithmic cost ve statistically sound benchmark. | `.deckent/skills/performance-optimizer/SKILL.md` |
| `provider-cli-matrix` | Neutral contract arkasında provider-specific CLI argv/stdin/output/auth farkları. | `.deckent/skills/provider-cli-matrix/SKILL.md` |
| `python-expert` | Typed Python, packaging, testing, async ve idiomatic implementation. | `.deckent/skills/python-expert/SKILL.md` |
| `react-specialist` | React component, hook, state, performance ve testing pattern'leri. | `.deckent/skills/react-specialist/SKILL.md` |
| `rpc-protocol` | Zod-first RPC envelope, negotiation, dispatch ve typed errors. | `.deckent/skills/rpc-protocol/SKILL.md` |
| `secure-coding` | Input, filesystem, process ve secret boundary'lerinde defensive Node.js/TypeScript implementation. | `.deckent/skills/secure-coding/SKILL.md` |
| `security-specialist` | Threat modeling, OWASP controls, crypto, auth, logging ve dependency risk. | `.deckent/skills/security-specialist/SKILL.md` |
| `sh-portability` | POSIX shell portability, exit-code preservation, trap, quoting ve wrapper safety. | `.deckent/skills/sh-portability/SKILL.md` |
| `system-architect` | Registry, module boundary, invariant, scale ve architectural decision. | `.deckent/skills/system-architect/SKILL.md` |
| `testing-expert` | Test pyramid, focused proof, fixture, determinism ve failure readability. | `.deckent/skills/testing-expert/SKILL.md` |
| `typescript-expert` | Strict TypeScript type, discriminated union, ESM ve maintainable API design. | `.deckent/skills/typescript-expert/SKILL.md` |

## Selection ve lifecycle

1. Task skill'i explicit adlandırabilir; routing ayrıca validated `activation.rules` ve exclusion'ları score edebilir. [Kanıt: `src/orchestra/task-builder.ts:512-551`; `src/core/skill-pool.ts:141-183`]
2. Pool project catalog'u yükler ve package built-in content'e fallback yapar; project definition override layer'dır. [Kanıt: `src/core/skill-pool.ts:14-39,319-400`]
3. `deckent skill install <source>` local veya Git source kabul eder ve manifest validate eder; marketplace search/publish ayrı CLI-only yüzeydir. [Kanıt: `src/cli/commands/skill.ts:328-496`; `src/cli/commands/skill-marketplace.ts:94-200`]
4. Promotion/evolution temporary evidence'ı permanent pool entry'ye çevirebilir; güncel feature manifest pipeline'ı lightly used olarak etiketler. [Kanıt: `src/orchestra/promotion-pipeline.ts:89-267`; `.deckent/settings/features-manifest.json:300-310`]

## Dogfood / repository gerçeği

- ✅ 30 `SKILL.md` dosyasının tamamı audited project tree'de vardır.
- ⚠️ File presence bir run'da activation kanıtı değildir. Effective routing, exclusion, task scope ve provider policy seçimi belirlemeye devam eder. [Kanıt: `src/core/skill-pool.ts:141-183`; `src/orchestra/task-builder.ts:512-551`]
- ⚠️ Marketplace operation'ları CLI-only'dir; help-verified, network/publish execution yapılmamıştır. [Kanıt: recursive gerçek-binary help audit'i, 2026-08-01; `src/cli/commands/skill-marketplace.ts:94-200`]

Persona role'leri için [Agent kataloğu](agents.md), routing setting'leri için [Configuration schema](configuration-schema.md) belgesine bak.
