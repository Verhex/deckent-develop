// ═══ Rule Generator ══════════════════════════════════════════════
// Generates provider-specific rule files (.claude/rules/, .codex/rules/,
// .gemini/rules/) from templates + ADR entries in MemoryStore.
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
}

export interface RuleGeneratorResult {
  filesWritten: string[];
  filesSkipped: string[];
  errors: string[];
}

// ─── Provider Adapters ───────────────────────────────────────────

interface ProviderAdapter {
  /** Wraps the rule content with provider-specific format */
  format(role: RuleRole, content: string): string;
  /** Returns the output directory relative to projectRoot */
  rulesDir(): string;
}

function claudeAdapter(): ProviderAdapter {
  const pathsMap: Record<RuleRole, string[]> = {
    'brain': ['.tasks/*', '.brain/*', '.contracts/*'],
    'auditor': ['.dashboard', '.brain/PATTERNS.md'],
    'worker-default': ['src/**', 'tests/**'],
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
  };
}

function cursorAdapter(): ProviderAdapter {
  return {
    format(_role: RuleRole, content: string): string {
      // Cursor uses plain markdown without frontmatter (parallel to codex/gemini).
      // Sprint 168 C0a-2: parity with claude/codex/gemini for ADR governance.
      return content;
    },
    rulesDir(): string {
      return join('.cursor', 'rules');
    },
  };
}

const ADAPTERS: Record<RuleProvider, () => ProviderAdapter> = {
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
 */
export function formatAdrSection(adrs: MemoryEntryV2[]): string {
  if (adrs.length === 0) return '';

  const accepted = adrs.filter(a => a.status === 'accepted');
  if (accepted.length === 0) return '';

  const lines: string[] = [
    '',
    '## Active ADR Constraints',
    '',
  ];

  for (const adr of accepted) {
    const id = adr.id.toUpperCase();
    const title = adr.title || '(untitled)';
    // Extract first meaningful line of content as summary
    const summary = adr.summary
      ?? adr.content.split('\n').find(l => l.trim().length > 0 && !l.startsWith('#'))
      ?? '';
    lines.push(`- **${id}**: ${title}${summary ? ' — ' + summary.slice(0, 120) : ''}`);
  }

  return lines.join('\n');
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
  return `${before}${AUTO_START}\n${newInner}\n${AUTO_END}${after}`;
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
    const adapter = adapterFactory();
    const rulesDir = join(projectRoot, adapter.rulesDir());

    // Ensure directory exists
    if (!existsSync(rulesDir)) {
      mkdirSync(rulesDir, { recursive: true });
    }

    for (const role of roles) {
      const outPath = join(rulesDir, `${role}.md`);

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

        let finalContent: string;
        if (hasMarkers) {
          // Preserve custom section, replace auto section
          finalContent = mergeWithCustom(formatted, existing);
        } else if (existing !== null) {
          // First time: existing file without markers.
          // Treat entire existing content as custom, wrap new content as auto.
          const preservedCustom = '\n' + existing + '\n';
          finalContent = (
            AUTO_START + '\n' +
            formatted +
            AUTO_END + '\n\n' +
            CUSTOM_START + preservedCustom + CUSTOM_END + '\n'
          );
        } else {
          // Brand new file
          finalContent = mergeWithCustom(formatted, null);
        }

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

  return generateRules({ projectRoot, adrs });
}
