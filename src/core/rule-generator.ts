// ═══ Rule Generator ══════════════════════════════════════════════
// Generates provider-specific rule files (.claude/rules/*.md, .codex/rules/*.md,
// .gemini/rules/*.md, .cursor/rules/*.mdc) from templates + ADR entries in MemoryStore.
// Preserves user custom sections via <!-- CUSTOM-START/END --> markers.
// Called by sprint-finalizer post-finalize hook chain (onRuleRegen).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MemoryEntryV2 } from './memory-types.js';
import { ErrorRegistry } from './errors.js';

// ─── Constants ───────────────────────────────────────────────────

const AUTO_START = '<!-- AUTO-START -->';
const AUTO_END = '<!-- AUTO-END -->';
const CUSTOM_START = '<!-- CUSTOM-START -->';
const CUSTOM_END = '<!-- CUSTOM-END -->';

// Bug O fix (Sprint 166-T2): empty CUSTOM template. CUSTOM block is NOT a copy
// of AUTO content — it is a sprint-specific empty placeholder where users (or
// future hooks) inject custom rules. A single newline keeps the markers on
// separate lines while keeping the slot semantically empty.
export const CUSTOM_TEMPLATE = '\n';

const ADR_PLACEHOLDER = '{{ADR_SECTION}}';

const ROLES = ['brain', 'auditor', 'worker-default'] as const;
export type RuleRole = typeof ROLES[number];

// Sprint 168 C0a-2: cursor adapter added for 4-rules-dir parity
// (`.claude/`, `.codex/`, `.gemini/`, `.cursor/`). ADR-046 references
// `.cursor/rules/` as a required target — previously the generator skipped
// it, leaving cursor rules permanently stale.
const PROVIDERS = ['claude', 'codex', 'gemini', 'cursor'] as const;
export type RuleProvider = typeof PROVIDERS[number];

// ─── Types ───────────────────────────────────────────────────────

export interface RuleGeneratorOptions {
  projectRoot: string;
  /** ADR entries — if not provided, no ADR section is generated */
  adrs?: MemoryEntryV2[];
  /** Override template directory (for testing) */
  templateDir?: string;
  /** Specific providers to generate (default: all 3) */
  providers?: RuleProvider[];
  /** Specific roles to generate (default: all 3) */
  roles?: RuleRole[];
  /** Worker-role frontmatter source/test globs (stack-aware). Default ['src/**','tests/**']. */
  workerPaths?: string[];
}

export interface RuleGeneratorResult {
  filesWritten: string[];
  filesSkipped: string[];
  errors: string[];
}

// ─── Provider Adapters ───────────────────────────────────────────

// ─── Worker Paths (stack-aware, product-safe) ────────────────────

/**
 * Worker-role frontmatter source/test globs per detected stack. The worker
 * rule activates when the spawned worker edits matching files, so the globs
 * must fit the PROJECT's real layout — a Go/Python/C# project has no
 * `src/**,tests/**`. PRODUCT-SAFE: the generator runs in every user project,
 * so resolve from the detected stack (stack-detector) with a safe
 * `src/**,tests/**` default for TS/JS/unknown.
 */
const WORKER_PATHS_BY_STACK: Record<string, string[]> = {
  typescript: ['src/**', 'tests/**'],
  javascript: ['src/**', 'tests/**'],
  rust: ['src/**', 'tests/**'],
  php: ['src/**', 'tests/**'],
  java_maven: ['src/**'],
  java_gradle: ['src/**'],
  kotlin_maven: ['src/**'],
  kotlin_gradle: ['src/**'],
  go: ['**/*.go'],
  python: ['**/*.py'],
  csharp: ['**/*.cs'],
  swift: ['Sources/**', 'Tests/**'],
  ruby: ['lib/**', 'spec/**'],
  dart: ['lib/**', 'test/**'],
  flutter: ['lib/**', 'test/**'],
  c_cmake: ['**/*.c', '**/*.h', '**/*.cpp', '**/*.hpp', '**/*.cc'],
  c_make: ['**/*.c', '**/*.h', '**/*.cpp', '**/*.hpp', '**/*.cc'],
};

/**
 * Resolve worker-role frontmatter globs from a detected stack `language`.
 * Falls back to `['src/**', 'tests/**']` for TS/JS/unknown.
 */
export function resolveWorkerPaths(language?: string | null): string[] {
  return WORKER_PATHS_BY_STACK[language ?? ''] ?? ['src/**', 'tests/**'];
}

// ─── Provider Adapters ───────────────────────────────────────

interface ProviderAdapter {
  /** Wraps the rule content with provider-specific format (placed inside the AUTO block) */
  format(role: RuleRole, content: string): string;
  /** Returns the output directory relative to projectRoot */
  rulesDir(): string;
  /** File extension for generated rule files, without leading dot (e.g. 'md', 'mdc') */
  fileExt(): string;
  /** Content emitted before the AUTO block — e.g. Cursor .mdc frontmatter (line 1 required) */
  preamble(role: RuleRole): string;
}

function claudeAdapter(workerPaths?: string[]): ProviderAdapter {
  const pathsMap: Record<RuleRole, string[]> = {
    // Activate on the sprint spec the Brain reads first (`DIRECTIVES.md`) plus
    // the task/memory state. PRODUCT-SAFE: only deckent-universal paths — the
    // generator runs in EVERY `deckent init`ed project, so it must not bake in
    // deckent-dev's own layout (`src/orchestra/**` would be a dogfood leak; a
    // user's project has no such dir).
    'brain': ['DIRECTIVES.md', '.tasks/*', '.brain/*'],
    // PRODUCT-SAFE: the Auditor is a pure monitoring role with no user-source
    // domain — its only universal artifacts are `.dashboard` (its output) and
    // `.locks/*` (stale-lock scan). `src/monitor/**` would help deckent-dev but
    // is a dogfood leak in a user's project (they have no such dir).
    'auditor': ['.dashboard', '.locks/*'],
    'worker-default': workerPaths ?? ['src/**', 'tests/**'],
  };

  return {
    format(role: RuleRole, content: string): string {
      const paths = pathsMap[role] ?? [];
      const frontmatter = `---\npaths: ${JSON.stringify(paths)}\n---\n`;
      return frontmatter + content;
    },
    rulesDir(): string {
      return join('.claude', 'rules');
    },
    fileExt(): string {
      return 'md';
    },
    preamble(): string {
      return '';
    },
  };
}

function codexAdapter(): ProviderAdapter {
  return {
    format(_role: RuleRole, content: string): string {
      // Codex uses plain markdown without frontmatter
      return content;
    },
    rulesDir(): string {
      return join('.codex', 'rules');
    },
    fileExt(): string {
      return 'md';
    },
    preamble(): string {
      return '';
    },
  };
}

function geminiAdapter(): ProviderAdapter {
  return {
    format(_role: RuleRole, content: string): string {
      // Gemini uses plain markdown without frontmatter
      return content;
    },
    rulesDir(): string {
      return join('.gemini', 'rules');
    },
    fileExt(): string {
      return 'md';
    },
    preamble(): string {
      return '';
    },
  };
}

function cursorAdapter(workerPaths?: string[]): ProviderAdapter {
  // Cursor Project Rules load only `.cursor/rules/*.mdc` (MDC format). The MDC
  // frontmatter (description / globs / alwaysApply) MUST be line 1 → emitted via
  // preamble(), before the AUTO block. Plain `.md` files are silently ignored
  // by Cursor — hence fileExt() === 'mdc'.
  const globsMap: Record<RuleRole, string> = {
    'brain': 'DIRECTIVES.md,.tasks/**,.brain/**',
    'auditor': '.dashboard,.locks/*',
    'worker-default': (workerPaths ?? ['src/**', 'tests/**']).join(','),
  };
  const descMap: Record<RuleRole, string> = {
    'brain': 'Deckent Brain (orchestrator) role rules',
    'auditor': 'Deckent Auditor (verifier) role rules',
    'worker-default': 'Deckent Worker (executor) role rules',
  };

  return {
    format(_role: RuleRole, content: string): string {
      return content;
    },
    rulesDir(): string {
      return join('.cursor', 'rules');
    },
    fileExt(): string {
      return 'mdc';
    },
    preamble(role: RuleRole): string {
      const desc = descMap[role] ?? 'Deckent role rules';
      const globs = globsMap[role] ?? '**/*';
      return `---\ndescription: ${desc}\nglobs: ${globs}\nalwaysApply: false\n---\n`;
    },
  };
}

const ADAPTERS: Record<RuleProvider, (workerPaths?: string[]) => ProviderAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
  cursor: cursorAdapter,
};

// ─── Template Engine ─────────────────────────────────────────────

/**
 * Returns the default template directory path.
 */
function defaultTemplateDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), 'rule-templates');
}

/**
 * Read a role template from disk.
 */
export function loadTemplate(role: RuleRole, templateDir?: string): string {
  const dir = templateDir ?? defaultTemplateDir();
  const filePath = join(dir, `${role}.template.md`);
  if (!existsSync(filePath)) {
    throw ErrorRegistry.createError('DECKENT_E067', {
      message: `Rule template not found: ${filePath}`,
    });
  }
  return readFileSync(filePath, 'utf-8');
}

/**
 * Format ADR entries into a markdown section for embedding in rules.
 *
 * Index-only contract (2026-06-19): the full ADR text + rationale live in
 * `.brain/memory.db` (the SSOT). Embedding each ADR's title + summary inline
 * duplicated ~80 lines of *stale copy* into every rule file (3 roles × 4
 * providers = 12 files) and contradicted these files' own rule ("query
 * `store.getByType('adr')`, not a static .md copy"). We therefore emit a
 * compact bold **ADR-NNN** id index + a `deckent recall` pointer to the SSOT.
 *
 * Anti-regression preserved: every accepted ADR still appears as `**ADR-NNN**`
 * (the Sprint-167 "44/50 ADRs, 11 missing" data-loss guard, pinned by
 * `rule-regen-db-query.test.ts` + the ADR-046 step-ordering invariant). Only
 * the verbose title/summary is dropped — look any id up via `deckent recall`.
 */
export function formatAdrSection(adrs: MemoryEntryV2[]): string {
  if (adrs.length === 0) return '';

  const accepted = adrs.filter(a => a.status === 'accepted');
  if (accepted.length === 0) return '';

  const ids = accepted.map(a => `**${a.id.toUpperCase()}**`).join(', ');

  return [
    '',
    '## Active ADR Constraints',
    '',
    'Full ADR text + rationale live in `.brain/memory.db` (SSOT). Query with '
      + '`deckent recall "<topic>"` or `store.getByType(\'adr\')` — do NOT rely on '
      + 'a static copy. The list below is an id-only index; look any id up for '
      + 'its current constraint.',
    '',
    `Accepted: ${ids}`,
  ].join('\n');
}

/**
 * Render a template by replacing the ADR placeholder.
 */
export function renderTemplate(template: string, adrs: MemoryEntryV2[]): string {
  const adrSection = formatAdrSection(adrs);
  return template.replace(ADR_PLACEHOLDER, adrSection).trimEnd() + '\n';
}

// ─── Sentinel Replace (Sprint 168 C0a-2) ──────────────────────────

/**
 * Idempotent replace between `<!-- AUTO-START -->` and `<!-- AUTO-END -->`
 * markers. The sentinel block bounds are fixed — content between them is
 * replaced atomically with `<!-- AUTO-START -->\n${newInner}\n<!-- AUTO-END -->`.
 *
 * Properties:
 *   - **No append.** A single AUTO-START / AUTO-END pair survives every call.
 *   - **Idempotent.** `replaceSentinel(replaceSentinel(s, x), x) === replaceSentinel(s, x)`.
 *   - **Pass-through.** If markers are absent, returns `content` unchanged.
 *
 * Sprint 167 T3 HIGH: previous regen path could append a second ADR block
 * because the sentinel logic was implicit (re-write whole file). This helper
 * pins the contract so future hook authors cannot accidentally accumulate
 * duplicate blocks.
 *
 * See: docs/superpowers/plans/2026-05-14-sprint-168-plan.md lines 1371-1379.
 */
export function replaceSentinel(content: string, newInner: string): string {
  const startIdx = content.indexOf(AUTO_START);
  const endIdx = content.indexOf(AUTO_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    // No sentinel pair — pass through unchanged.
    return content;
  }
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + AUTO_END.length);
  // Memory-reform 2026-07-14 (Alperen b-karari): her uretimde AUTO-blok basina
  // tek-satir AUTOGEN damgasi — kaynak .claude/rules/*, elle duzenleme ezilir.
  const AUTOGEN_STAMP = '<!-- AUTOGEN: kaynak .claude/rules/* — elle duzenleme bir sonraki uretimde ezilir -->';
  return `${before}${AUTO_START}\n${AUTOGEN_STAMP}\n${newInner}\n${AUTO_END}${after}`;
}

// ─── Pure Render From Store (Sprint 168 C0a-2) ────────────────────

/** Output of `renderRulesFromStore` — markdown strings keyed by role. */
export interface RenderedRules {
  /** brain.md markdown (with ADR section embedded). */
  brainMd: string;
  /** auditor.md markdown (with ADR section embedded). */
  auditorMd: string;
  /** worker-default.md markdown (with ADR section embedded). */
  workerMd: string;
}

export interface RenderRulesFromStoreOptions {
  /** Override the template directory (for tests). */
  templateDir?: string;
}

/**
 * Pure-function rendering of the three rule role templates from a
 * MemoryStore. Reads `store.getByType('adr')` at invocation time — this is
 * the freshness guarantee referenced by ADR-046 Step Ordering Contract.
 *
 * Step 3 (adrInsert) MUST run before Step 4 (ruleRegen) so that any ADR
 * inserted via `store.insert({ type: 'adr', ... })` is visible to this
 * function when called immediately afterwards. The invariant test in
 * `tests/core/adr-046-step-ordering-invariant.test.ts` guards this contract.
 *
 * @param store MemoryStore — queried via `getByType('adr')`.
 * @returns rendered markdown strings for brain / auditor / worker roles.
 */
export function renderRulesFromStore(
  store: { getByType(type: string): MemoryEntryV2[] },
  opts: RenderRulesFromStoreOptions = {},
): RenderedRules {
  // Freshness invariant: read ADRs from the store at call time.
  const adrs = store.getByType('adr');

  const brainTpl = loadTemplate('brain', opts.templateDir);
  const auditorTpl = loadTemplate('auditor', opts.templateDir);
  const workerTpl = loadTemplate('worker-default', opts.templateDir);

  return {
    brainMd: renderTemplate(brainTpl, adrs),
    auditorMd: renderTemplate(auditorTpl, adrs),
    workerMd: renderTemplate(workerTpl, adrs),
  };
}

// ─── Custom Section Preservation ─────────────────────────────────

/**
 * Extract custom section from an existing rule file.
 * Returns the content between <!-- CUSTOM-START --> and <!-- CUSTOM-END -->,
 * or null if no custom section exists.
 */
export function extractCustomSection(fileContent: string): string | null {
  const startIdx = fileContent.indexOf(CUSTOM_START);
  const endIdx = fileContent.indexOf(CUSTOM_END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }

  return fileContent.slice(startIdx + CUSTOM_START.length, endIdx);
}

/**
 * Merge auto-generated content with preserved custom section.
 * If the existing file has a custom section, it is preserved.
 */
export function mergeWithCustom(autoContent: string, existingContent: string | null): string {
  const customSection = existingContent ? extractCustomSection(existingContent) : null;

  if (customSection !== null) {
    return (
      AUTO_START + '\n' +
      autoContent +
      AUTO_END + '\n\n' +
      CUSTOM_START + customSection + CUSTOM_END + '\n'
    );
  }

  // No custom section: wrap auto content and add empty CUSTOM_TEMPLATE block
  return (
    AUTO_START + '\n' +
    autoContent +
    AUTO_END + '\n\n' +
    CUSTOM_START + CUSTOM_TEMPLATE + CUSTOM_END + '\n'
  );
}

// ─── Main Generator ─────────────────────────────────────────────

/**
 * Generate rule files for all configured providers and roles.
 * This is the main entry point called by sprint-finalizer.
 */
export function generateRules(opts: RuleGeneratorOptions): RuleGeneratorResult {
  const { projectRoot, adrs = [], templateDir } = opts;
  const providers = opts.providers ?? [...PROVIDERS];
  const roles = opts.roles ?? [...ROLES];

  const result: RuleGeneratorResult = {
    filesWritten: [],
    filesSkipped: [],
    errors: [],
  };

  for (const provider of providers) {
    const adapterFactory = ADAPTERS[provider];
    if (!adapterFactory) {
      result.errors.push(`Unknown provider: ${provider}`);
      continue;
    }
    const adapter = adapterFactory(opts.workerPaths);
    const rulesDir = join(projectRoot, adapter.rulesDir());

    // Ensure directory exists
    if (!existsSync(rulesDir)) {
      mkdirSync(rulesDir, { recursive: true });
    }

    for (const role of roles) {
      const outPath = join(rulesDir, `${role}.${adapter.fileExt()}`);

      try {
        // Load and render template
        const template = loadTemplate(role, templateDir);
        const rendered = renderTemplate(template, adrs);

        // Format for provider
        const formatted = adapter.format(role, rendered);

        // Read existing file for custom section preservation
        const existing = existsSync(outPath)
          ? readFileSync(outPath, 'utf-8')
          : null;

        // Check if existing file has AUTO/CUSTOM markers
        const hasMarkers = existing !== null &&
          existing.includes(AUTO_START) &&
          existing.includes(AUTO_END);

        // Body = AUTO/CUSTOM-wrapped content. Provider preamble (e.g. Cursor
        // .mdc frontmatter) is prepended afterwards so it stays on line 1.
        let body: string;
        if (hasMarkers) {
          // Preserve custom section, replace auto section
          body = mergeWithCustom(formatted, existing);
        } else if (existing !== null) {
          // First time: existing file without markers.
          // Treat entire existing content as custom, wrap new content as auto.
          const preservedCustom = '\n' + existing + '\n';
          body = (
            AUTO_START + '\n' +
            formatted +
            AUTO_END + '\n\n' +
            CUSTOM_START + preservedCustom + CUSTOM_END + '\n'
          );
        } else {
          // Brand new file
          body = mergeWithCustom(formatted, null);
        }

        const finalContent = adapter.preamble(role) + body;
        writeFileSync(outPath, finalContent, 'utf-8');
        result.filesWritten.push(outPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${provider}/${role}: ${msg}`);
      }
    }
  }

  return result;
}

/**
 * Convenience function for sprint-finalizer hook.
 * Loads ADRs from MemoryStore if a DB exists, then generates rules.
 */
export async function regenerateRules(projectRoot: string): Promise<RuleGeneratorResult> {
  let adrs: MemoryEntryV2[] = [];

  // Try to load ADRs from memory DB
  const dbPath = join(projectRoot, '.brain', 'memory.db');
  if (existsSync(dbPath)) {
    // DB exists → ADR load MUST succeed. Silent catch here previously caused
    // regression: better-sqlite3 native binding failure (host↔container glibc
    // mismatch) returned adrs=[], which regenerated rules files stripped of
    // ADR content (.claude/rules/{brain,auditor,worker-default}.md went from
    // ~120 lines → ~15 lines). Loud failure preserves existing rules files.
    const { MemoryStore } = await import('./memory-store.js');
    const store = new MemoryStore(dbPath);
    adrs = store.getByType('adr');
    store.close();
  }

  // Stack-aware worker frontmatter (product-safe): a Go/Python/Rust/… project
  // must not get a TS-shaped `src/**,tests/**` glob. Fail-safe → default on any
  // detection error (resolveWorkerPaths(undefined) → ['src/**','tests/**']).
  let workerPaths: string[] | undefined;
  try {
    const { detectProjectStack } = await import('./stack-detector.js');
    const stack = detectProjectStack(projectRoot);
    workerPaths = resolveWorkerPaths(stack?.language);
  } catch {
    workerPaths = undefined;
  }

  return generateRules({ projectRoot, adrs, workerPaths });
}
