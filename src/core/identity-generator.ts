// ═══ Identity Generator ═══════════════════════════════════════════
// Generates PROJECT-IDENTITY.md from live metrics + DB data.
// Called by sprint-finalizer post-finalize hook chain.
// Reuses helpers from sprint-docs-helpers.ts for format consistency.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BRAIN_DIR, PROJECT_IDENTITY_FILE, SPRINTS_DIR, MEMORY_DB_FILE,
} from './constants.js';
import { debugLog } from './utils.js';

// ─── Types ────────────────────────────────────────────────────────

export interface IdentityMetrics {
  sprintId: string;
  totalTasks: number;
  completedTasks: number;
  techDebtTasks: number;
  noGoTasks: number;
  coveragePercent: number;
  durationMs: number;
}

export interface IdentityContext {
  projectRoot: string;
  metrics: IdentityMetrics;
  /** Override total sprint count (otherwise counted from .brain/sprints/) */
  totalSprints?: number;
  /** Override ADR count (otherwise counted from DB) */
  adrCount?: number;
  /** Override CLI command count */
  cliCommandCount?: number;
  /** Override MCP tool count */
  mcpToolCount?: number;
}

export interface IdentityRegenResult {
  success: boolean;
  filePath: string;
  adrCount: number;
  totalSprints: number;
  reason?: string;
}

// ─── Core Logic ───────────────────────────────────────────────────

/**
 * Count ADRs from the memory DB if available.
 */
function countAdrsFromDb(projectRoot: string): number {
  try {
    const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
    if (!existsSync(dbPath)) return 0;
    // Dynamic import avoided — use synchronous SQLite read via raw require
    // We use a lightweight approach: count files or parse exports
    const exportsDir = join(projectRoot, BRAIN_DIR, 'exports');
    const summaryPath = join(exportsDir, 'summary.md');
    if (!existsSync(summaryPath)) return 0;
    const content = readFileSync(summaryPath, 'utf-8');
    // Count ADR rows in the summary table (lines matching "| adr-NNN |")
    const adrLines = content.split('\n').filter(l => /^\|\s*adr-\d+/.test(l));
    return adrLines.length;
  } catch (e) {
    debugLog('countAdrsFromDb', e);
    return 0;
  }
}

/**
 * Count total sprints from .brain/sprints/ directory.
 */
function countTotalSprints(projectRoot: string): number {
  try {
    const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
    if (!existsSync(sprintsPath)) return 1;
    return readdirSync(sprintsPath).filter(f => f.endsWith('.md')).length || 1;
  } catch {
    return 1;
  }
}

/**
 * Extract sprint number from sprint ID (e.g., "sprint-143" → 143).
 */
function extractSprintNum(sprintId: string): number | null {
  const match = sprintId.match(/sprint-(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

/**
 * @deprecated Sprint 166 (ADR-046) — identityRegen step delegated to managed-docs chain.
 * `.brain/PROJECT-IDENTITY.md` is superseded by `.deckent/workspace/IDENTITY.md`
 * (managed via docs.json "identity-md" entry). Sprint 168 C0a-1 (BUG-GG) flipped
 * the runtime default in `runPostFinalizeHooks` so this function is NO LONGER invoked
 * unless the caller explicitly opts in via `skipIdentityRegen: false`.
 *
 * Regenerate PROJECT-IDENTITY.md with live metrics from the completed sprint.
 */
export function regenerateProjectIdentity(ctx: IdentityContext): IdentityRegenResult {
  const { projectRoot, metrics } = ctx;
  const brainPath = join(projectRoot, BRAIN_DIR);
  const filePath = join(brainPath, PROJECT_IDENTITY_FILE);

  const totalSprints = ctx.totalSprints
    ?? extractSprintNum(metrics.sprintId)
    ?? countTotalSprints(projectRoot);

  const adrCount = ctx.adrCount ?? countAdrsFromDb(projectRoot);
  const cliCommandCount = ctx.cliCommandCount ?? 41;
  const mcpToolCount = ctx.mcpToolCount ?? 22;

  try {
    mkdirSync(brainPath, { recursive: true });

    if (!existsSync(filePath)) {
      // Create minimal identity file
      const content = buildMinimalIdentity(metrics, totalSprints, adrCount, cliCommandCount, mcpToolCount);
      writeFileSync(filePath, content, 'utf-8');
      return { success: true, filePath, adrCount, totalSprints, reason: 'created' };
    }

    // Read existing content and update Current State section
    const existing = readFileSync(filePath, 'utf-8');
    const updated = updateCurrentStateSection(existing, metrics, totalSprints, adrCount, cliCommandCount, mcpToolCount);

    if (updated === existing) {
      return { success: true, filePath, adrCount, totalSprints, reason: 'unchanged' };
    }

    writeFileSync(filePath, updated, 'utf-8');
    return { success: true, filePath, adrCount, totalSprints, reason: 'updated' };
  } catch (e) {
    debugLog('regenerateProjectIdentity', e);
    return { success: false, filePath, adrCount, totalSprints, reason: `error: ${e}` };
  }
}

// ─── Content Builders ─────────────────────────────────────────────

function buildMinimalIdentity(
  metrics: IdentityMetrics,
  totalSprints: number,
  adrCount: number,
  cliCommandCount: number,
  mcpToolCount: number,
): string {
  return [
    '# Project Identity',
    '',
    '## Current State',
    `- Last Sprint: ${metrics.sprintId}`,
    `- Total Sprints: ${totalSprints}`,
    `- Completed Tasks: ${metrics.completedTasks}`,
    `- Coverage: ${metrics.coveragePercent.toFixed(1)}%`,
    `- No-Go Rate: ${metrics.noGoTasks > 0 && metrics.totalTasks > 0 ? ((metrics.noGoTasks / metrics.totalTasks) * 100).toFixed(1) : '0.0'}%`,
    `- ADR Count: ${adrCount}`,
    `- CLI Commands: ${cliCommandCount}+`,
    `- MCP Tools: ${mcpToolCount}`,
    '',
  ].join('\n');
}

function updateCurrentStateSection(
  content: string,
  metrics: IdentityMetrics,
  totalSprints: number,
  adrCount: number,
  cliCommandCount: number,
  mcpToolCount: number,
): string {
  const lines = content.split('\n');
  const newLines: string[] = [];
  let inCurrentState = false;
  let replacedCurrentState = false;

  const stateLines = [
    `- Last Sprint: ${metrics.sprintId}`,
    `- Total Sprints: ${totalSprints}`,
    `- Completed Tasks: ${metrics.completedTasks}`,
    `- Coverage: ${metrics.coveragePercent.toFixed(1)}%`,
    `- No-Go Rate: ${metrics.noGoTasks > 0 && metrics.totalTasks > 0 ? ((metrics.noGoTasks / metrics.totalTasks) * 100).toFixed(1) : '0.0'}%`,
    `- ADR Count: ${adrCount}`,
    `- CLI Commands: ${cliCommandCount}+`,
    `- MCP Tools: ${mcpToolCount}`,
  ];

  for (const line of lines) {
    if (line === '## Current State') {
      inCurrentState = true;
      replacedCurrentState = true;
      newLines.push('## Current State');
      newLines.push(...stateLines);
      continue;
    }

    if (inCurrentState) {
      if (line.startsWith('## ')) {
        inCurrentState = false;
        newLines.push('');
        newLines.push(line);
      }
      // Skip old state lines
      continue;
    }

    newLines.push(line);
  }

  // If no Current State section existed, append one
  if (!replacedCurrentState) {
    newLines.push('');
    newLines.push('## Current State');
    newLines.push(...stateLines);
    newLines.push('');
  }

  return newLines.join('\n');
}

// ─── Memory Export Hook ───────────────────────────────────────────

export interface MemoryExportResult {
  success: boolean;
  filesWritten: string[];
  errors: string[];
}

/**
 * Run memory export: read from DB, write to .brain/exports/*.md.
 * This regenerates all 4 export files from the SQLite DB.
 */
export async function runMemoryExport(projectRoot: string): Promise<MemoryExportResult> {
  const result: MemoryExportResult = { success: true, filesWritten: [], errors: [] };

  try {
    const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
    if (!existsSync(dbPath)) {
      result.success = false;
      result.errors.push('memory.db not found');
      return result;
    }

    const { MemoryStore } = await import('./memory-store.js');
    const { exportSummaryMd, exportDecisionsMd, exportMemoryMd, exportDebtMd } = await import('./memory-export.js');

    const store = new MemoryStore(dbPath);
    const exportsDir = join(projectRoot, BRAIN_DIR, 'exports');
    mkdirSync(exportsDir, { recursive: true });

    const exports: Array<{ name: string; fn: (s: typeof store) => string }> = [
      { name: 'summary.md', fn: exportSummaryMd },
      { name: 'decisions.md', fn: exportDecisionsMd },
      { name: 'memory.md', fn: exportMemoryMd },
      { name: 'debt.md', fn: exportDebtMd },
    ];

    for (const exp of exports) {
      try {
        const content = exp.fn(store);
        const filePath = join(exportsDir, exp.name);
        writeFileSync(filePath, content, 'utf-8');
        result.filesWritten.push(exp.name);
      } catch (e) {
        result.errors.push(`${exp.name}: ${e}`);
        result.success = false;
      }
    }

    store.close();
  } catch (e) {
    result.success = false;
    result.errors.push(`memory export failed: ${e}`);
  }

  return result;
}

// ─── Post-Finalize Hook Chain ─────────────────────────────────────

export interface PostFinalizeHookOptions {
  projectRoot: string;
  sprintId: string;
  metrics: IdentityMetrics;
  /** Optional callback for rule regeneration (renumbered to Step 4) */
  onRuleRegen?: (projectRoot: string) => void | Promise<void>;
  /** Skip memory export step */
  skipMemoryExport?: boolean;
  /**
   * Skip identity regeneration step.
   *
   * **Default: `true` — Sprint 168 C0a-1 BUG-GG fix (Sprint 166 T5 deprecated enforcement).**
   *
   * When this field is omitted or `undefined`, Step 2 (`regenerateProjectIdentity`)
   * is bypassed. The `@deprecated` annotation added in Sprint 166 T5 had no runtime
   * effect on its own (TypeScript annotations are compile-time/IDE hints), so the
   * Step was still firing each finalize cycle and mutating `.brain/PROJECT-IDENTITY.md`.
   * Sprint 168 flips the runtime default to `true` so callers must explicitly opt in
   * by passing `skipIdentityRegen: false` to invoke the deprecated step.
   *
   * @deprecated Sprint 166 — Step 2 (identityRegen) is deprecated. Managed-docs chain
   * handles `.deckent/workspace/IDENTITY.md` via docs.json "identity-md" entry.
   * Will be removed in a future sprint once all call-sites are migrated to the
   * managed-docs chain. Prefer omitting the field (default skips).
   */
  skipIdentityRegen?: boolean;
  /** Skip ADR file sync step (Step 3 — Bug M Sprint 166 T1) */
  skipAdrInsert?: boolean;
  /** Override directory containing `NNN-*.md` ADR files (default: `<projectRoot>/docs/adr`) */
  adrDir?: string;
}

/** Bug M Sprint 166 T1 — result of Step 3 ADR file sync run. */
export interface AdrInsertResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  ids: string[];
}

export interface PostFinalizeHookResult {
  memoryExport: MemoryExportResult | null;
  /**
   * @deprecated Sprint 166 — identityRegen step delegated to managed-docs chain.
   * Sprint 168 C0a-1 (BUG-GG) made the default runtime behavior to skip Step 2;
   * this field is therefore `null` on the common path. It becomes non-null only when
   * the caller explicitly opts in with `skipIdentityRegen: false`.
   */
  identityRegen: IdentityRegenResult | null;
  /** Bug M Sprint 166 T1 — populated when adrInsert step ran (Step 3). */
  adrInsert: AdrInsertResult | null;
  ruleRegenCalled: boolean;
  errors: string[];
}

/**
 * Run the post-finalize hook chain.
 *
 * Step Ordering Contract (Sprint 166 T1 — Step Ordering Contract Section 5.1):
 *   Step 1 — memory export   → exports/* regenerate
 *   Step 2 — identity regen  → PROJECT-IDENTITY.md update
 *   Step 3 — adr insert      → docs/adr/*.md → memory.db upsert (Bug M fix)
 *   Step 4 — rule regen      → .claude/rules/*.md (renumbered from Step 3)
 *
 * Step 3 must run BEFORE Step 4 so that newly accepted ADRs (e.g. ADR-046)
 * are present in the DB when rules are regenerated. ADR-046 documents this
 * contract; do not reorder without updating the ADR.
 *
 * Changelog and sprint-log are already handled by doc-updaters registry
 * via updateProjectDocs() in finalizeSprint steps 9.
 *
 * Each step is fail-safe: errors are logged but don't block subsequent steps.
 */
export async function runPostFinalizeHooks(opts: PostFinalizeHookOptions): Promise<PostFinalizeHookResult> {
  const result: PostFinalizeHookResult = {
    memoryExport: null,
    identityRegen: null,
    adrInsert: null,
    ruleRegenCalled: false,
    errors: [],
  };

  // Step 1: Memory export → exports/* regenerate
  if (!opts.skipMemoryExport) {
    try {
      result.memoryExport = await runMemoryExport(opts.projectRoot);
      debugLog('postFinalizeHooks:memoryExport',
        `${result.memoryExport.filesWritten.length} files written, ${result.memoryExport.errors.length} errors`);
    } catch (e) {
      result.errors.push(`memoryExport: ${e}`);
      debugLog('postFinalizeHooks:memoryExport', e);
    }
  }

  // Step 2: PROJECT-IDENTITY.md auto-regen (DEPRECATED — Sprint 166 ADR-046)
  // Managed-docs chain (docs.json "identity-md") handles .deckent/workspace/IDENTITY.md.
  //
  // Sprint 168 C0a-1 (BUG-GG): runtime default flipped to skip. The Sprint 166 T5
  // `@deprecated` JSDoc annotation alone had no effect on dispatch (annotations are
  // compile-time only). Step 2 must now be explicitly opted in via
  // `skipIdentityRegen: false`. Omitting the field — the common path — skips Step 2
  // and leaves `result.identityRegen === null`.
  if (opts.skipIdentityRegen === false) {
    try {
      result.identityRegen = regenerateProjectIdentity({
        projectRoot: opts.projectRoot,
        metrics: opts.metrics,
      });
      debugLog('postFinalizeHooks:identityRegen',
        `${result.identityRegen.reason} adrCount=${result.identityRegen.adrCount}`);
    } catch (e) {
      result.errors.push(`identityRegen: ${e}`);
      debugLog('postFinalizeHooks:identityRegen', e);
    }
  }

  // Step 3: ADR file sync — docs/adr/*.md → memory.db (Bug M Sprint 166 T1)
  // Unconditional invocation pattern: runs whenever the DB exists. Failure
  // (missing dir, malformed file) is captured in result.adrInsert.errors
  // but does not block Step 4.
  if (!opts.skipAdrInsert) {
    try {
      const dbPath = join(opts.projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
      if (existsSync(dbPath)) {
        const { MemoryStore } = await import('./memory-store.js');
        const { syncAdrFilesToDb } = await import('./adr-file-sync.js');
        const adrDir = opts.adrDir ?? join(opts.projectRoot, 'docs', 'adr');
        const store = new MemoryStore(dbPath);
        try {
          const syncResult = syncAdrFilesToDb(store, adrDir, { changedBy: 'post-finalize' });
          result.adrInsert = {
            inserted: syncResult.inserted,
            updated: syncResult.updated,
            skipped: syncResult.skipped,
            errors: syncResult.errors,
            ids: syncResult.ids,
          };
          debugLog('postFinalizeHooks:adrInsert',
            `inserted=${syncResult.inserted} updated=${syncResult.updated} skipped=${syncResult.skipped}`);
        } finally {
          store.close();
        }
      } else {
        result.adrInsert = { inserted: 0, updated: 0, skipped: 0, errors: ['memory.db not found'], ids: [] };
      }
    } catch (e) {
      result.errors.push(`adrInsert: ${e}`);
      debugLog('postFinalizeHooks:adrInsert', e);
    }
  }

  // Step 4: Rule regen hook point (renumbered from Step 3 per ADR-046)
  if (opts.onRuleRegen) {
    try {
      await opts.onRuleRegen(opts.projectRoot);
      result.ruleRegenCalled = true;
      debugLog('postFinalizeHooks:ruleRegen', 'Rule regeneration hook called');
    } catch (e) {
      result.errors.push(`ruleRegen: ${e}`);
      debugLog('postFinalizeHooks:ruleRegen', e);
    }
  }

  return result;
}
