// ═══ RoutingEngineV3 — Builtin Work-Type Vocabulary ══════════════════
// Slice-0 FOUNDATION (sprint-445). The closed-core builtin layer: the 8
// work-type definitions, the 9 deliverable types, type guards, and the
// subtype-grammar parser. NO domain entries live here — the domain registry
// builtin base is Task 2.
//
// Contracts + DoD signatures are faithful EN renderings of the spec table
// (.analysis/routing-v3-secenek-b-detay-2026-07-14.md §1a). The examples[]
// begin with the spec's canonical example, followed by additional
// unambiguously in-category phrasings that feed the LLM content-fit axis.

import type { WorkType, WorkTypeDef, DeliverableType, ParsedSubtype, DomainDef } from './types.js';
import { InvalidWorkTypeError, InvalidSubtypeError } from './types.js';

// ─── The 8 closed-core work-types (spec §1a) ─────────────────────────
export const BUILTIN_WORK_TYPES: readonly WorkTypeDef[] = [
  {
    type: 'build',
    contract: 'Builds behavior that does not yet exist.',
    dodSignature: 'new behavior plus its covering tests',
    examples: [
      'add a retry mechanism',
      'implement a new CLI subcommand',
      'build a rate-limit adapter',
    ],
  },
  {
    type: 'fix',
    contract: 'Repairs broken behavior from a diagnosis.',
    dodSignature: 'reproduce → fix → regression-pin',
    examples: [
      'fix the EISDIR crash',
      'resolve the race in the heartbeat writer',
      'patch the null-deref on empty scope',
    ],
  },
  {
    type: 'refactor',
    contract: 'Improves structure without changing behavior.',
    dodSignature: 'behavior-parity proof',
    examples: [
      'split config.ts',
      'extract the shared merge helper',
      'restructure the routing module for clarity',
    ],
  },
  {
    type: 'document',
    contract: 'Produces or updates human-readable information.',
    dodSignature: 'doc output plus accuracy check',
    examples: [
      'document the sync flags',
      'write the API surface reference',
      'update the migration guide',
    ],
  },
  {
    type: 'review',
    contract: 'Reviews existing work and produces a verdict; writes no code.',
    dodSignature: 'finding report / verdict',
    examples: [
      'review the PR through a security lens',
      'audit the diff for scope violations',
      'assess the test coverage of the change',
    ],
  },
  {
    type: 'configure',
    contract: 'Adjusts behavior by changing settings without writing code.',
    dodSignature: 'config diff plus effect proof',
    examples: [
      'tune the CI cache strategy',
      'adjust the vitest timeout thresholds',
      'set the provider fallback chain in config',
    ],
  },
  {
    type: 'migrate',
    contract: 'Migrates data, schema, or platform.',
    dodSignature: 'forward and backward path plus integrity proof',
    examples: [
      'migrate to SQLite schema v2',
      'move the stats sidecar to a new layout',
      'port the manifest from v2 to v3',
    ],
  },
  {
    type: 'analyze',
    contract: 'Answers a question with evidence; the deliverable is information.',
    dodSignature: 'evidence file / report',
    examples: [
      'extract the misroute corpus',
      'profile the slow plan phase',
      'map the routeTaskV2 call sites',
    ],
  },
];

// ─── The 9 closed deliverable types (spec §1c) ───────────────────────
export const DELIVERABLE_TYPES: readonly DeliverableType[] = [
  'code-src',
  'code-test',
  'doc',
  'config',
  'workflow',
  'manifest',
  'script',
  'migration',
  'asset',
];

// ─── Builtin domain registry — layer 1 of 3 (spec §1b) ───────────────
// OPEN-set registry, builtin-base layer. `deckent analyze` derives layer 2
// (project-derived) and `.deckent/routing/vocabulary.json` supplies layer 3
// (user/org-defined) on top of this at runtime — this module owns ONLY the
// product-shipped base. Every pathPatterns entry below is grounded in a real
// path that exists in THIS repo (verified by grep at authoring time; pinned
// by tests/core/routing/vocabulary-domains.test.ts against a fixture list),
// plus generic patterns so the same builtin base is useful in foreign
// projects that do not share deckent's own layout.
export const BUILTIN_DOMAINS: readonly DomainDef[] = [
  {
    id: 'api',
    aliases: ['rest', 'http-api', 'endpoint', 'endpoints', 'graphql', 'backend-api'],
    pathPatterns: [
      'src/api/**',
      '**/*-endpoint.*',
      'api/**',
      '**/routes/**',
      '**/controllers/**',
      '**/*.controller.*',
    ],
    stackMarkers: ['express', 'fastify', 'koa', '@hono/node-server', 'graphql'],
    description:
      'HTTP/RPC API surface: REST or GraphQL endpoints, route handlers, request/response ' +
      'middleware, and server entrypoints that expose functionality over the network.',
    surfaces: ['api'],
    exclusiveRoles: [],
  },
  {
    id: 'frontend',
    aliases: ['ui', 'web', 'client', 'dashboard', 'arayüz', 'ön-yüz'],
    pathPatterns: [
      'src/dashboard/**',
      '**/*.tsx',
      '**/*.vue',
      'src/components/**',
      'src/pages/**',
      'public/**',
    ],
    stackMarkers: ['react', 'vue', 'svelte', 'vite', 'tailwindcss'],
    description:
      'Browser-rendered user interface: components, pages, client-side state, and styling ' +
      'for a web dashboard or any other frontend surface.',
    surfaces: ['frontend', 'dashboard'],
    exclusiveRoles: [],
  },
  {
    id: 'cli/terminal',
    aliases: ['cli', 'terminal', 'tui', 'repl', 'command-line', 'komut-satırı'],
    pathPatterns: [
      'src/cli/**',
      '**/repl/**',
      'cli/**',
      'bin/**',
      '**/*.cli.*',
    ],
    stackMarkers: ['ink', 'commander', 'yargs', 'blessed', 'oclif'],
    description:
      'Command-line entrypoints, subcommands, REPL/TUI rendering, and terminal-facing ' +
      'helpers for interactive or scripted shell usage.',
    surfaces: ['cli'],
    exclusiveRoles: [],
  },
  {
    id: 'core/runtime',
    aliases: ['core', 'runtime', 'domain-logic', 'çekirdek'],
    pathPatterns: [
      'src/core/**',
      'lib/**',
      'src/domain/**',
      '**/core/**/*.ts',
    ],
    stackMarkers: [],
    description:
      'Reusable domain and runtime primitives: types, configuration, routing, memory, and ' +
      'agent/skill pool logic that stays independent of any specific delivery surface.',
    surfaces: [],
    exclusiveRoles: [],
  },
  {
    id: 'orchestration',
    aliases: ['orchestra', 'sprint-lifecycle', 'brain', 'workflow-engine', 'orkestrasyon'],
    pathPatterns: [
      'src/orchestra/**',
      'src/agents/**',
      'src/nervous/**',
      'src/monitor/**',
      'src/orchestrator/**',
      'src/pipeline/**',
    ],
    stackMarkers: [],
    description:
      'Sprint lifecycle, planning, evaluation, task routing, worker execution, and the ' +
      'proactive meta-orchestrator that drives multi-agent work end to end.',
    surfaces: [],
    exclusiveRoles: [],
  },
  {
    id: 'data',
    aliases: ['database', 'storage', 'persistence', 'veri', 'veritabanı'],
    pathPatterns: [
      'src/core/memory-store.ts',
      '**/*-store.ts',
      '**/migrations/**',
      '**/*.sql',
      'db/**',
      'prisma/**',
      'models/**',
    ],
    stackMarkers: ['better-sqlite3', 'sqlite3', 'pg', 'mysql2', 'prisma', 'typeorm'],
    description:
      'Data persistence layer: schema, migrations, storage adapters, and query/read-model ' +
      'logic responsible for durable state.',
    surfaces: [],
    exclusiveRoles: [],
  },
  {
    id: 'security',
    aliases: ['auth', 'rbac', 'authn', 'authz', 'güvenlik', 'yetkilendirme'],
    pathPatterns: [
      '**/auth*.ts',
      '**/rbac.ts',
      '**/approval-*.ts',
      'src/security/**',
      '**/*.security.*',
    ],
    stackMarkers: ['jsonwebtoken', 'jose', 'bcrypt', 'argon2', 'passport'],
    description:
      'Authentication, authorization, RBAC, approval gating, and secret/credential handling ' +
      'that guards access to protected functionality.',
    surfaces: [],
    exclusiveRoles: [],
  },
  {
    id: 'i18n',
    aliases: ['l10n', 'localization', 'translations', 'yerelleştirme', 'çeviri'],
    pathPatterns: [
      'src/cli/helpers/messages*',
      'src/dashboard/src/i18n/**',
      '**/locales/**',
      '**/i18n/**',
      '**/translations/**',
    ],
    stackMarkers: ['i18next', 'formatjs', 'react-intl'],
    description:
      'User-facing message catalogs, translation keys, and language-switching flows that ' +
      'localize output for different audiences.',
    // Dogfood-450 (450-004 canlı-misroute): i18n is LOCATION-NEUTRAL — the
    // surface comes from where the strings live (src/cli/** co-matches
    // cli/terminal → 'cli'; src/dashboard/** co-matches the frontend domain →
    // 'frontend'). Declaring surfaces here leaked 'frontend' into pure-CLI
    // message work and pushed frontend-designer past terminal-ux-engineer/
    // implementer on a CLI i18n flip task.
    surfaces: [],
    exclusiveRoles: [],
  },
  {
    id: 'a11y',
    aliases: ['accessibility', 'erişilebilirlik', 'wcag'],
    pathPatterns: [
      '**/accessibility-*/**',
      '**/*a11y*',
      '**/aria-*',
      'src/a11y/**',
    ],
    stackMarkers: ['axe-core', '@axe-core/react', 'eslint-plugin-jsx-a11y'],
    description:
      'Accessibility compliance: ARIA semantics, keyboard navigation, screen-reader support, ' +
      'and WCAG audits for user-facing surfaces.',
    surfaces: ['frontend'],
    exclusiveRoles: [],
  },
  {
    id: 'devops/ci',
    aliases: ['ci', 'cd', 'ci-cd', 'pipeline', 'workflows', 'devops'],
    pathPatterns: [
      '.github/workflows/**',
      '.gitlab-ci.yml',
      '.circleci/**',
      'Jenkinsfile',
      'Dockerfile',
    ],
    stackMarkers: ['github-actions', 'circleci', 'jenkins', 'gitlab-ci'],
    description:
      'CI/CD pipelines, workflow definitions, release automation, and build-gating scripts ' +
      'that run on every push or merge.',
    surfaces: [],
    exclusiveRoles: [],
  },
  {
    id: 'docs',
    aliases: ['documentation', 'dökümantasyon', 'belgeler'],
    pathPatterns: [
      'docs/**',
      'README.md',
      '**/*.mdx',
      'CHANGELOG.md',
    ],
    stackMarkers: ['docusaurus', 'mkdocs', 'vitepress'],
    description:
      'Human-readable documentation: guides, references, architecture decision records, and ' +
      'changelogs describing the system to people.',
    surfaces: [],
    exclusiveRoles: [],
  },
  {
    id: 'build/release',
    aliases: ['build', 'release', 'packaging', 'bundler', 'derleme', 'yayın'],
    pathPatterns: [
      'scripts/**',
      'package.json',
      'tsconfig*.json',
      'webpack.config.*',
      'vite.config.*',
      'rollup.config.*',
      'Makefile',
    ],
    stackMarkers: ['tsup', 'esbuild', 'rollup', 'webpack', 'turbo'],
    description:
      'Build tooling, bundling, packaging, and publish/release orchestration that turns ' +
      'source into a shippable artifact.',
    surfaces: [],
    exclusiveRoles: [],
  },
  {
    id: 'agents-catalog',
    aliases: ['agent-catalog', 'personas', 'skills-catalog', 'ajan-kataloğu'],
    pathPatterns: [
      '.deckent/agents/**',
      '.deckent/skills/**',
      '**/agent.json',
      '**/SKILL.md',
      '**/PROMPT.md',
      'agents/**',
      '.claude/agents/**',
    ],
    stackMarkers: [],
    description:
      'The agent and skill persona catalog: manifests, capability definitions, and prompt ' +
      'bodies that define what each specialized worker can do.',
    surfaces: [],
    exclusiveRoles: [],
  },
  {
    id: 'connectors/messaging',
    aliases: ['messaging', 'connectors', 'bots', 'telegram', 'discord', 'slack', 'whatsapp', 'mesajlaşma'],
    pathPatterns: [
      'src/connectors/**',
      '**/bot-*.ts',
      '**/*-connector.ts',
      'src/bots/**',
      'src/integrations/slack/**',
    ],
    stackMarkers: ['telegraf', 'discord.js', '@slack/bolt', 'whatsapp-web.js'],
    description:
      'Messaging platform adapters and the project-scoped gateway: chat-bot connectors and ' +
      'session/pairing logic that bridges the system to external messaging platforms.',
    surfaces: [],
    exclusiveRoles: [],
  },
];

// ─── Derived lookup surfaces ─────────────────────────────────────────
/** The 8 work-type identifiers, in spec order. */
export const WORK_TYPE_IDS: readonly WorkType[] = BUILTIN_WORK_TYPES.map((w) => w.type);
/** The 14 builtin-base domain identifiers, in spec order. */
export const DOMAIN_IDS: readonly string[] = BUILTIN_DOMAINS.map((d) => d.id);

const WORK_TYPE_SET: ReadonlySet<string> = new Set(WORK_TYPE_IDS);
const DELIVERABLE_TYPE_SET: ReadonlySet<string> = new Set(DELIVERABLE_TYPES);
const DOMAIN_ID_SET: ReadonlySet<string> = new Set(DOMAIN_IDS);

/** Type guard: is the given string a closed-core work-type? */
export function isWorkType(value: string): value is WorkType {
  return WORK_TYPE_SET.has(value);
}

/** Type guard: is the given string a closed deliverable type? */
export function isDeliverableType(value: string): value is DeliverableType {
  return DELIVERABLE_TYPE_SET.has(value);
}

/** Is the given string a registered builtin-base domain id? */
export function isDomainId(value: string): boolean {
  return DOMAIN_ID_SET.has(value);
}

/** Look up a work-type definition by id (undefined if not a work-type). */
export function getWorkTypeDef(type: string): WorkTypeDef | undefined {
  return BUILTIN_WORK_TYPES.find((w) => w.type === type);
}

/** Look up a builtin-base domain definition by id (undefined if not registered). */
export function getDomainDef(id: string): DomainDef | undefined {
  return BUILTIN_DOMAINS.find((d) => d.id === id);
}

// ─── Subtype grammar parser (spec §1a) ───────────────────────────────
/**
 * Parse a `parent:subtype` work-type string into its rollup parent and
 * free-text subtype. A bare parent (no colon) is the rollup form and yields
 * `subtype: null`. The parent MUST be a closed-core work-type; the subtype
 * (everything after the first colon) is free text and must be non-empty when
 * a colon is present.
 *
 * Examples:
 *   parseSubtype('review:compliance') → { parent: 'review', subtype: 'compliance' }
 *   parseSubtype('review')            → { parent: 'review', subtype: null }
 *
 * @throws {InvalidWorkTypeError} when the parent is empty or not a work-type.
 * @throws {InvalidSubtypeError}  when a colon is present but the subtype is empty.
 */
export function parseSubtype(input: string): ParsedSubtype {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (raw === '') {
    throw new InvalidWorkTypeError(String(input), 'empty work-type string');
  }

  const colonIdx = raw.indexOf(':');
  if (colonIdx === -1) {
    // Rollup form: a bare parent work-type.
    if (!isWorkType(raw)) {
      throw new InvalidWorkTypeError(raw);
    }
    return { parent: raw, subtype: null };
  }

  // `parent:subtype` — split on the FIRST colon; subtype is free text and may
  // itself contain colons (e.g. 'configure:iac:aws').
  const parentPart = raw.slice(0, colonIdx).trim();
  const subtypePart = raw.slice(colonIdx + 1).trim();

  if (!isWorkType(parentPart)) {
    throw new InvalidWorkTypeError(parentPart, `parsed from ${JSON.stringify(raw)}`);
  }
  if (subtypePart === '') {
    throw new InvalidSubtypeError(raw, 'subtype after ":" is empty');
  }
  return { parent: parentPart, subtype: subtypePart };
}

// ─── Deliverable evidence classifier (spec §1c) ──────────────────────
// filesWrite → DeliverableType, derived deterministically from the path
// string alone (extension + path-segment rules). NO fs access — the caller
// supplies paths (e.g. from a task's filesWrite list); this module never
// stats or reads the filesystem itself, so it stays usable in a dry-run
// planning context where the paths may not exist yet.

/** Path-segment / extension test paired with the DeliverableType it evidences. */
interface DeliverableRule {
  readonly type: DeliverableType;
  readonly test: (path: string, basename: string) => boolean;
}

const ASSET_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|otf|mp4|mov|webm|pdf)$/i;
const CONFIG_EXTENSIONS = /\.(json|jsonc|ya?ml|toml|ini)$/i;
const CONFIG_DOTFILE = /^\.[^/]*rc$|^\.env(\..+)?$/i;

// Order matters — first match wins. A path can satisfy more than one rule
// (e.g. "docs/**/*.md" is both a docs/-prefix and a .md extension), so the
// most specific / highest-evidence rule is checked first.
const DELIVERABLE_RULES: readonly DeliverableRule[] = [
  {
    type: 'code-test',
    test: (path) => /(^|\/)tests?\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path),
  },
  {
    type: 'workflow',
    test: (path) => /(^|\/)\.github\/workflows\//.test(path),
  },
  {
    type: 'manifest',
    test: (_path, basename) => basename === 'agent.json' || basename === 'manifest.json' || basename === 'skill.json',
  },
  {
    type: 'migration',
    test: (path) => /(^|\/)migrations\//.test(path) || /\.sql$/i.test(path),
  },
  {
    type: 'script',
    test: (path) => /(^|\/)scripts\//.test(path),
  },
  {
    type: 'doc',
    test: (path) => /(^|\/)docs\//.test(path) || /\.mdx?$/i.test(path),
  },
  {
    type: 'config',
    test: (path, basename) => CONFIG_EXTENSIONS.test(path) || CONFIG_DOTFILE.test(basename),
  },
  {
    type: 'asset',
    test: (path) => ASSET_EXTENSIONS.test(path),
  },
];

/**
 * Classify a file path into its closed-set DeliverableType (spec §1c), the
 * positional-evidence vocabulary that requirement/capability vectors derive
 * `deliverables` from. Pure string/regex logic — no filesystem access.
 *
 * Rule order (first match wins): code-test → workflow → manifest → migration
 * → script → doc → config → asset → code-src (fallback for everything else,
 * including any source-code extension not caught above).
 */
export function classifyDeliverable(filePath: string): DeliverableType {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);

  for (const rule of DELIVERABLE_RULES) {
    if (rule.test(normalized, basename)) {
      return rule.type;
    }
  }
  return 'code-src';
}
