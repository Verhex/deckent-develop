// ─── Sprint Docs Updater ─────────────────────────────────────────
// Extracted from sprint-reporter.ts — managed-docs, project identity, sprint log, debt, archive
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { TaskEvaluation } from '../core/types.js';
import type {
  TaskResult, Sprint, SprintMetrics, ResolvedConfig, SprintResult,
} from '../core/types.js';
import {
  BRAIN_DIR, SPRINTS_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR, ARCHIVE_DIRECTIVES_SUBDIR, SPRINT_LOG_MAX_LINES,
  DECISIONS_FILE, DIRECTIVES_FILE,
} from '../core/constants.js';
import { runAllUpdaters } from './doc-updaters/registry.js';
import type { DocUpdateResult } from './doc-updaters/types.js';
// Side-effect import: registers all updaters
import './doc-updaters/index.js';
import { runManagedDocUpdates } from './managed-docs/managed-doc-runner.js';
import { resolveDebt } from './debt-manager.js';
import { getDebtItems } from '../core/debt-store.js';
import { debugLog } from '../core/utils.js';
import { modelRegistry } from '../core/model-registry.js';
import type { RegistryProviderName } from '../core/model-registry.js';
import { getDefaultProviderName } from './sprint-utils.js';
import { extractSprintNumber } from './sprint-metrics.js';
import {
  buildSprintLogLines,
  buildDirectivesPlaceholder,
  buildAdrEntry,
  parseAddedSrcFiles,
  findMaxAdrNumber,
  sprintFileNumber,
} from './sprint-docs-helpers.js';

// ═══ Sprint Log ═════════════════════════════════════════════════

/**
 * Write a sprint log markdown file to .brain/sprints/{sprintId}.md.
 * Contains a metrics table and per-task status listing.
 * @param projectRoot - Project root directory
 * @param sprint - The completed sprint
 * @param metrics - Calculated sprint metrics
 * @param evaluations - Optional map of task ID to evaluation result
 */
export function writeSprintLog(projectRoot: string, sprint: Sprint, metrics: SprintMetrics, evaluations?: Map<string, TaskEvaluation>, results?: TaskResult[]): void {
  const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  mkdirSync(sprintsPath, { recursive: true });

  const lines = buildSprintLogLines(sprint, metrics, evaluations, results);

  writeFileSync(
    join(sprintsPath, `${sprint.id}.md`),
    lines.slice(0, SPRINT_LOG_MAX_LINES).join('\n'),
    'utf-8',
  );
}

// ═══ Update Project Docs ═════════════════════════════════════════

/**
 * Run all registered document updaters after sprint completion.
 * Uses the doc-updaters registry to automatically update project documentation
 * based on sprint results and configuration.
 * @param projectRoot - Project root directory
 * @param sprintResult - Sprint result containing sprint, evaluations, and metrics
 * @param config - Optional resolved config; defaults are created if not provided
 * @param results - Optional task results captured during the sprint (used by
 *                  the changelog updater to parse worker-authored category hints)
 * @returns Array of document update results from each updater
 */
export function updateProjectDocs(projectRoot: string, sprintResult: SprintResult, config?: ResolvedConfig, results?: TaskResult[]): DocUpdateResult[] {
  const isInternalProject = existsSync(join(projectRoot, 'DECKENT-MASTER-BLUEPRINT.md'));
  // Sprint 202 Task 202-003: resolve the registry default provider before
  // falling through to the hard-coded ('claude', 'premium') pair so that
  // pure-Ollama / pure-Codex configs don't silently materialize an `'opus'`
  // model their adapter can't run.
  const defaultProviderName = getDefaultProviderName() as RegistryProviderName;
  const defaultPremiumModel =
    modelRegistry.getByProviderAndTier(defaultProviderName, 'premium')?.id
    ?? modelRegistry.getByProviderAndTier(defaultProviderName, 'standard')?.id;
  if (!defaultPremiumModel) throw new Error(`E_DOCS_MODEL_UNAVAILABLE: provider=${defaultProviderName}`);
  const defaultPremiumModelId = defaultPremiumModel;
  const resolvedConfig: ResolvedConfig = config ?? {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 8,
      brain_model: defaultPremiumModelId as ResolvedConfig['activeModeConfig']['brain_model'],
      default_model: defaultPremiumModelId as ResolvedConfig['activeModeConfig']['default_model'],
      haiku_allowed: true,
      brain_planning: 'auto',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: isInternalProject ? 'deckent' : 'deckent-project',
    projectRoot,
    version: '0.0.0',
    auto_docs: { tier1: true, tier2: true, tier3: false },
    coverage_threshold: 90,
    max_reroutes: 3,
    reroute_on_tech_debt: false,
    adaptive_thresholds: false,
    agent_min_score: 5,
    adaptive_config: { min_samples: 3, no_go_threshold: 0.3, coverage_lookback: 3 },
    sprint_timeout_minutes: 0,
    deckent_style: 'sprint' as const,
    terminal: {
      enabled: true,
      bind: '127.0.0.1',
      maxSessions: 10,
      idleTimeoutMs: 1_800_000,
      scrollbackBytes: 262_144,
      allowShellKind: true,
    },
  };
  const ctx = { projectRoot, sprintResult, config: resolvedConfig, isInternalProject, results };
  const builtinResults = runAllUpdaters(ctx);
  // Run user-defined managed doc updates (non-fatal)
  try {
    const managedResults = runManagedDocUpdates(ctx);
    return [...builtinResults, ...managedResults];
  } catch (e) {
    debugLog('updateProjectDocs:managedDocs', e);
    return builtinResults;
  }
}

// ═══ Project Identity — removed (B6, Memory V2 DB-first) ═════════
// `updateProjectIdentity` + its PROJECT-IDENTITY.md render helpers
// (generateProjectIdentity, countProjectTestCases, parseCoverageFromClover,
// getTestCountFromVitest, getCoverageFromVitest, readPreviousTestCount) were
// removed: the legacy `.brain/PROJECT-IDENTITY.md` file is superseded by the
// memory.db `identity` entry + the managed .deckent/workspace/IDENTITY.md doc.

// ═══ DEBT.md Auto-Resolve ════════════════════════════════════════

/**
 * Auto-resolve tech-debt entries for tasks that were fixed during the FIX phase.
 * A task is "fixed" if its priority-fix task evaluated DONE.
 * Task #4c: DB-first — resolves Memory V2 debt entries via resolveDebt()
 * instead of string-mangling rows in the (now removed) .brain/DEBT.md.
 * @param projectRoot - Project root directory
 * @param sprint - Current sprint object
 * @param evaluations - Map of task ID to final evaluation result
 * @returns Number of debt entries resolved
 */
export function autoResolveDebt(
  projectRoot: string,
  sprint: { id: string; tasks: Array<{ id: string; isPriorityFix?: boolean; fixForTaskId?: string }> },
  evaluations: Map<string, string>,
): number {
  const resolvedTaskIds = new Set<string>();
  for (const task of sprint.tasks) {
    if (!task.isPriorityFix || !task.fixForTaskId) continue;
    const ev = evaluations.get(task.id);
    if (ev === 'DONE' || ev === TaskEvaluation.DONE) {
      resolvedTaskIds.add(task.fixForTaskId);
    }
  }
  if (resolvedTaskIds.size === 0) return 0;

  let resolvedCount = 0;
  for (const debt of getDebtItems(projectRoot, { activeOnly: true })) {
    const taskKey = debt.originTaskId || debt.id.replace(/^debt-/, '');
    if (resolvedTaskIds.has(taskKey) && resolveDebt(projectRoot, debt.id, sprint.id)) {
      resolvedCount++;
    }
  }
  return resolvedCount;
}

// ═══ DECISIONS.md Auto-Draft ADR ═════════════════════════════════

/**
 * Auto-draft ADR entries for new modules detected in the sprint.
 * Scans git diff for new directories under src/ and drafts a PROPOSED ADR for each.
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint ID (e.g., "sprint-044")
 */
export function autoDraftDecisions(
  projectRoot: string,
  sprintId: string,
): number {
  let diffOutput: string;
  try {
    diffOutput = execSync('git diff --name-status HEAD~1', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10000,
    });
  } catch (e) {
    debugLog('countNewModules:gitDiff', e);
    return 0;
  }

  if (!diffOutput.trim()) return 0;

  const addedFiles = parseAddedSrcFiles(diffOutput);
  if (addedFiles.length === 0) return 0;

  const newDirs = new Set<string>();
  for (const filePath of addedFiles) {
    const parts = filePath.split('/');
    if (parts.length >= 3) newDirs.add(parts.slice(0, -1).join('/'));
  }
  if (newDirs.size === 0) return 0;

  const trulyNewDirs: string[] = [];
  for (const dir of newDirs) {
    const fullDir = join(projectRoot, dir);
    if (!existsSync(fullDir)) continue;
    try {
      const entries = readdirSync(fullDir);
      const dirPrefix = dir + '/';
      const allNew = entries.every(entry => addedFiles.includes(dirPrefix + entry));
      if (allNew && entries.length > 0) trulyNewDirs.push(dir);
    } catch (e) {
      debugLog('countNewModules:readdirSync', e);
    }
  }
  if (trulyNewDirs.length === 0) return 0;

  const decisionsPath = join(projectRoot, BRAIN_DIR, DECISIONS_FILE);
  mkdirSync(join(projectRoot, BRAIN_DIR), { recursive: true });

  let existingContent = '';
  if (existsSync(decisionsPath)) {
    existingContent = readFileSync(decisionsPath, 'utf-8');
  }

  const maxAdr = findMaxAdrNumber(existingContent);
  const sprintNum = extractSprintNumber(sprintId) ?? sprintId;
  const newEntries: string[] = [];
  let adrCount = 0;

  for (const dir of trulyNewDirs) {
    const dirName = dir.split('/').pop() ?? dir;
    const adrNumber = String(maxAdr + adrCount + 1).padStart(3, '0');
    newEntries.push(...buildAdrEntry(adrNumber, dirName, sprintNum));
    adrCount++;
  }

  if (adrCount > 0) {
    const finalContent = existingContent.trimEnd() + '\n' + newEntries.join('\n') + '\n';
    writeFileSync(decisionsPath, finalContent, 'utf-8');
  }

  return adrCount;
}

// ═══ CI Baseline — Honest Write Guard ════════════════════════════

/**
 * Write a CI baseline to `.deckent/ci-baseline.json` only when the result
 * is trustworthy. A baseline with `testPassed === 0 && testFailed > 0` is
 * treated as "suspicious" (vitest ran in a broken env — e.g. API-key leak
 * causing auth failures) and the existing baseline is preserved unchanged.
 *
 * Rules:
 *   - suspicious (testPassed === 0 && testFailed > 0) AND old baseline exists
 *     → preserve old, emit warning, return false
 *   - suspicious AND no old baseline exists
 *     → write anyway (nothing to fall back to), return true
 *   - not suspicious (testPassed > 0 OR testFailed === 0)
 *     → write new baseline, return true
 *
 * Returns true when the baseline was written, false when preserved.
 */
export function writeHonestCiBaseline(
  projectRoot: string,
  data: {
    sprintId: string;
    baseline: {
      tscPassed: boolean;
      testCount: number;
      testPassed: number;
      testFailed: number;
      coverage: number;
      timestamp: string;
    };
  },
): boolean {
  const dir = join(projectRoot, '.deckent');
  const baselinePath = join(dir, 'ci-baseline.json');

  // Detect suspicious 0-pass pattern
  const isSuspicious = data.baseline.testPassed === 0 && data.baseline.testFailed > 0;

  if (isSuspicious && existsSync(baselinePath)) {
    process.stderr.write(
      `[ci-baseline] suspicious 0-pass (testFailed=${data.baseline.testFailed}) — preserve.*baseline preserved\n`,
    );
    return false;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(baselinePath, JSON.stringify(data, null, 2), 'utf-8');
  return true;
}

// ═══ Patterns — removed (B7, Memory V2 DB-first) ═════════════════
// addRecurringPatternsToFile (legacy .brain/PATTERNS.md JSON writer) had no
// production caller and was removed; violation patterns are recorded to the
// memory.db `pattern` entries by the auditor (detectPatterns).

// ═══ Sprint File Collection ══════════════════════════════════════

/**
 * Collect sprint log files from both sprints/ and archive/ directories.
 * Returns entries sorted numerically by sprint number, deduped (sprints/ takes precedence).
 */
export function collectSprintFiles(root: string): Array<{ file: string; dir: string }> {
  const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);
  const archiveDir = join(root, BRAIN_DIR, ARCHIVE_DIR);
  const collected: Array<{ file: string; dir: string }> = [];
  const seen = new Set<string>();
  const isSprintMd = (f: string) => f.startsWith('sprint-') && f.endsWith('.md');

  if (existsSync(sprintsDir)) {
    for (const f of readdirSync(sprintsDir).filter(isSprintMd)) {
      collected.push({ file: f, dir: sprintsDir });
      seen.add(f);
    }
  }
  if (existsSync(archiveDir)) {
    for (const f of readdirSync(archiveDir).filter(isSprintMd)) {
      if (!seen.has(f)) collected.push({ file: f, dir: archiveDir });
    }
  }

  collected.sort((a, b) => sprintFileNumber(a.file) - sprintFileNumber(b.file));
  return collected;
}

// ═══ DIRECTIVES Auto-Archive ══════════════════════════════════════

/**
 * Options for archiveDirectives() (Sprint 168 C0a-4 BUG-CC fix).
 *
 * @property autoArchive - When `true`, after copying DIRECTIVES.md to archive,
 *   overwrites the working DIRECTIVES.md with a next-sprint placeholder
 *   (legacy behavior). When `false` (default), DIRECTIVES.md is PRESERVED
 *   on disk and only an archive copy is written.
 *
 *   Default flipped to `false` per Alperen Pre-Flight Step 16 Option B
 *   decision following Sprint 167 BUG-CC live evidence: mid-sprint
 *   placeholder overwrite = catastrophic sprint context loss. The
 *   conservative "preserve" default is safer; opt-in remains available
 *   for orchestrators that genuinely want the auto-reset workflow.
 *
 *   See ADR-046 Amendment (Sprint 168 C0a-4).
 */
export interface ArchiveDirectivesOptions {
  autoArchive?: boolean;
}

/**
 * Archive the current DIRECTIVES.md to .brain/archive/.
 *
 * Always copies DIRECTIVES.md → .brain/archive/DIRECTIVES-sprint-NNN.md (audit trail).
 * The working DIRECTIVES.md is PRESERVED by default; opt-in placeholder
 * overwrite via `{ autoArchive: true }` (legacy behavior).
 *
 * Called by finalizeSprint() Step 12 after RETRO is written.
 *
 * - Always: copies DIRECTIVES.md → .brain/archive/DIRECTIVES-sprint-NNN.md
 * - Default (Sprint 168 C0a-4 Option B): PRESERVES the working DIRECTIVES.md
 * - Opt-in via `{ autoArchive: true }`: writes next-sprint placeholder (legacy)
 * - Creates .brain/archive/ if it doesn't exist
 * - No-ops gracefully if DIRECTIVES.md doesn't exist
 * - Phase guard: only executes during CLEANUP or COMPLETE phase (Sprint 146 bug fix)
 *
 * @param projectRoot - Project root directory
 * @param sprintId - The completed sprint ID (e.g. 'sprint-133')
 * @param phase - Current sprint phase. If provided, only CLEANUP/COMPLETE phases are allowed.
 * @param options - Archive options. See {@link ArchiveDirectivesOptions}.
 */
export function archiveDirectives(
  projectRoot: string,
  sprintId: string,
  phase?: string,
  options: ArchiveDirectivesOptions = {},
): void {
  // Phase guard: reject calls outside CLEANUP/COMPLETE (Sprint 146 T-008 bug fix)
  if (phase !== undefined && phase !== 'CLEANUP' && phase !== 'COMPLETE') {
    debugLog('archiveDirectives', `REJECTED: called in phase ${phase}, only CLEANUP allowed`);
    return;
  }
  const directivesPath = join(projectRoot, DIRECTIVES_FILE);
  const archiveDir = join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_DIRECTIVES_SUBDIR);

  if (!existsSync(directivesPath)) {
    debugLog('archiveDirectives', `${DIRECTIVES_FILE} not found — skipping`);
    return;
  }

  mkdirSync(archiveDir, { recursive: true });

  const archiveFileName = `DIRECTIVES-${sprintId}.md`;
  const archivePath = join(archiveDir, archiveFileName);
  // Always archive copy (audit trail)
  copyFileSync(directivesPath, archivePath);

  // Sprint 168 C0a-4 BUG-CC fix: default PRESERVE working DIRECTIVES.md.
  // Opt-in legacy placeholder-overwrite behavior via { autoArchive: true }.
  if (options.autoArchive === true) {
    const currentNum = extractSprintNumber(sprintId);
    const nextNum = currentNum !== null ? currentNum + 1 : '???';
    writeFileSync(directivesPath, buildDirectivesPlaceholder(sprintId, archiveFileName, nextNum));
    debugLog(
      'archiveDirectives',
      `Archived ${DIRECTIVES_FILE} → ${archivePath} (autoArchive=true → placeholder written)`,
    );
  } else {
    debugLog(
      'archiveDirectives',
      `Archived ${DIRECTIVES_FILE} → ${archivePath} (preserved; autoArchive=false default per ADR-046 amendment Sprint 168 C0a-4)`,
    );
  }
}

/**
 * Emergency restore: reconstruct DIRECTIVES.md from task JSON files when
 * it was accidentally overwritten mid-sprint with a placeholder template.
 *
 * Reads all task-NNN-*.json files from .tasks/, extracts title + description,
 * and rebuilds a minimal DIRECTIVES.md so the sprint can continue.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint ID (e.g. 'sprint-146')
 * @returns true if DIRECTIVES.md was restored, false otherwise
 */
export function emergencyRestoreDirectives(projectRoot: string, sprintId: string): boolean {
  const directivesPath = join(projectRoot, DIRECTIVES_FILE);

  // Only restore if current DIRECTIVES.md looks like a placeholder (small file, has "Sprint NNN" template header)
  if (existsSync(directivesPath)) {
    const content = readFileSync(directivesPath, 'utf-8');
    // A real DIRECTIVES has task descriptions — placeholders are short templates
    if (content.length > 500 && !content.includes('## Task 1: [Task title]')) {
      debugLog('emergencyRestoreDirectives', 'DIRECTIVES.md appears intact — skipping restore');
      return false;
    }
  }

  const tasksDir = join(projectRoot, '.tasks');
  if (!existsSync(tasksDir)) {
    debugLog('emergencyRestoreDirectives', '.tasks/ not found — cannot restore');
    return false;
  }

  const sprintNum = extractSprintNumber(sprintId);
  if (sprintNum === null) return false;

  const prefix = `task-${sprintNum}-`;
  const allFiles = readdirSync(tasksDir);
  const taskFiles = allFiles.filter(f => f.startsWith(prefix) && f.endsWith('.json'));

  if (taskFiles.length === 0) {
    debugLog('emergencyRestoreDirectives', `No task JSON files found for ${sprintId}`);
    return false;
  }

  interface TaskJson {
    id?: string;
    title?: string;
    description?: string;
    model?: string;
    effort?: string;
    scope?: { directories?: string[]; filesWrite?: string[] };
  }

  const tasks: TaskJson[] = [];
  for (const file of taskFiles) {
    try {
      const raw = readFileSync(join(tasksDir, file), 'utf-8');
      const task = JSON.parse(raw) as TaskJson;
      if (task.title) tasks.push(task);
    } catch { /* skip unparseable files */ }
  }

  if (tasks.length === 0) return false;

  // Reconstruct minimal DIRECTIVES.md
  const lines: string[] = [
    `# DIRECTIVES — ${sprintId} (Emergency Restore)`,
    '',
    `> Restored from ${tasks.length} task JSON files after mid-sprint template overwrite.`,
    '',
    '---',
    '',
  ];

  for (const task of tasks) {
    lines.push(`## Task ${task.id ?? '?'}: ${task.title}`);
    if (task.model) lines.push(`- Model: ${task.model}`);
    if (task.effort) lines.push(`- Effort: ${task.effort}`);
    if (task.scope?.directories) lines.push(`- Scope: ${task.scope.directories.join(', ')}`);
    if (task.scope?.filesWrite) lines.push(`- Files: ${task.scope.filesWrite.join(', ')}`);
    lines.push('');
    lines.push('### Description');
    lines.push(task.description ?? '(no description)');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  writeFileSync(directivesPath, lines.join('\n'), 'utf-8');
  debugLog('emergencyRestoreDirectives', `Restored DIRECTIVES.md from ${tasks.length} task files`);
  return true;
}

// ═══ Orphan Task Archive ═══════════════════════════════════════════

/**
 * Supported orphan file extensions — includes runtime artifacts that accumulate
 * across sprints: task data (.json, .plan, .hb, .result), execution logs (.log),
 * timeout markers (.timeout), honesty verify deltas (.verify-delta.json).
 */
const ORPHAN_TASK_EXTENSIONS = /\.(json|plan|hb|result|paused|log|timeout|verify-delta\.json)$/;

/**
 * Archive orphan task files from `.tasks/` to `.brain/archive/sprint-NNN-tasks/`.
 * Collects all task-NNN-* files (*.json, *.hb, *.result, *.plan, *.log, *.timeout,
 * *.verify-delta.json) belonging to the given sprint and moves them to the archive
 * directory. Also archives `.tasks/.prompt-*` files for the sprint.
 * This prevents stale task files from accumulating across sprints.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - The completed sprint ID (e.g. 'sprint-138')
 * @returns Number of files archived
 */
export function archiveOrphanTasks(projectRoot: string, sprintId: string): number {
  const tasksDir = join(projectRoot, '.tasks');
  if (!existsSync(tasksDir)) {
    debugLog('archiveOrphanTasks', `.tasks/ not found — skipping`);
    return 0;
  }

  const sprintNum = extractSprintNumber(sprintId);
  if (sprintNum === null) {
    debugLog('archiveOrphanTasks', `Cannot extract sprint number from ${sprintId} — skipping`);
    return 0;
  }

  // Match files belonging to this sprint: task-NNN-*.* where NNN = sprintNum
  // Extended to include .log, .timeout and .verify-delta.json artifacts
  const prefix = `task-${sprintNum}-`;
  const allFiles = readdirSync(tasksDir);
  const taskFiles = allFiles.filter(f =>
    f.startsWith(prefix)
      && ORPHAN_TASK_EXTENSIONS.test(f)
      // Landing proposals are coordinator evidence, not canonical task
      // records. Preserve them at the live evidence boundary; treating the
      // `.json` suffix as a task artifact destroys exact landing diagnostics.
      && !f.endsWith('.landing-proposal.json'),
  );
  // Also archive .prompt-* files for this sprint
  const promptFiles = allFiles.filter(f => f.startsWith('.prompt-'));
  const filesToArchive = [...taskFiles, ...promptFiles];

  if (filesToArchive.length === 0) {
    debugLog('archiveOrphanTasks', `No orphan task files for ${sprintId}`);
    return 0;
  }

  const archiveDir = join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR, `${sprintId}-tasks`);
  mkdirSync(archiveDir, { recursive: true });

  let count = 0;
  for (const file of filesToArchive) {
    try {
      const src = join(tasksDir, file);
      const dest = join(archiveDir, file);
      copyFileSync(src, dest);
      // Remove original after successful copy
      unlinkSync(src);
      count++;
    } catch (e) {
      debugLog('archiveOrphanTasks', `Failed to archive ${file}: ${e}`);
    }
  }

  debugLog('archiveOrphanTasks', `Archived ${count} task files to ${archiveDir}`);
  return count;
}

/**
 * Clean old sprint archives from `.tasks/archive/` based on a retention policy.
 * Archives older than `retentionCount` sprints are deleted to prevent unbounded growth.
 *
 * @param projectRoot - Project root directory
 * @param retentionCount - Number of most-recent sprint archives to keep (default: 5)
 * @returns Number of archive directories removed
 */
export function cleanTasksArchive(projectRoot: string, retentionCount = 5): number {
  const archiveDir = join(projectRoot, '.tasks', 'archive');
  if (!existsSync(archiveDir)) return 0;

  const entries = readdirSync(archiveDir);
  // Only consider sprint-NNN-style directories
  const sprintDirs = entries
    .filter(e => /^sprint-\d+/.test(e))
    .map(e => ({ name: e, num: extractSprintNumber(e) ?? -1 }))
    .filter(e => e.num >= 0)
    .sort((a, b) => b.num - a.num); // newest first

  if (sprintDirs.length <= retentionCount) return 0;

  const toRemove = sprintDirs.slice(retentionCount);
  let removed = 0;
  for (const dir of toRemove) {
    try {
      const dirPath = join(archiveDir, dir.name);
      // Remove all files inside before removing the directory
      const files = readdirSync(dirPath);
      for (const file of files) {
        try { unlinkSync(join(dirPath, file)); } catch { /* skip */ }
      }
      // Use rmdirSync (no recursive needed — files already removed above)
      // If there are nested dirs, fall through silently
      try {
        rmdirSync(dirPath);
      } catch {
        // Best-effort: non-empty dirs (nested) are left as-is
      }
      removed++;
    } catch (e) {
      debugLog('cleanTasksArchive', `Failed to remove ${dir.name}: ${e}`);
    }
  }

  debugLog('cleanTasksArchive', `Removed ${removed} old archive dirs (retention: ${retentionCount})`);
  return removed;
}
