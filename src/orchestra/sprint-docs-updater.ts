// ─── Sprint Docs Updater ─────────────────────────────────────────
// Extracted from sprint-reporter.ts — managed-docs, project identity, sprint log, debt, archive
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { TaskEvaluation } from '../core/types.js';
import type {
  TaskResult, Sprint, SprintMetrics, ResolvedConfig, SprintResult, PatternEntry,
} from '../core/types.js';
import {
  BRAIN_DIR, SPRINTS_DIR, ARCHIVE_DIR, SPRINT_LOG_MAX_LINES,
  PATTERNS_FILE, DEBT_FILE, DECISIONS_FILE, DIRECTIVES_FILE,
  PROJECT_IDENTITY_FILE,
} from '../core/constants.js';
import { runAllUpdaters } from './doc-updaters/registry.js';
import type { DocUpdateResult } from './doc-updaters/types.js';
// Side-effect import: registers all updaters
import './doc-updaters/index.js';
import { runManagedDocUpdates } from './managed-docs/managed-doc-runner.js';
import { debugLog } from '../core/utils.js';
import { modelRegistry } from '../core/model-registry.js';
import { extractSprintNumber } from './sprint-metrics.js';
import {
  buildSprintLogLines,
  generateProjectIdentity as generateProjectIdentityHelper,
  buildCurrentStateLines,
  buildDirectivesPlaceholder,
  buildAdrEntry,
  parseAddedSrcFiles,
  findMaxAdrNumber,
  readPreviousCompletedTasks,
  readPreviousCoverage,
  replaceCurrentStateSection,
  sprintFileNumber,
} from './sprint-docs-helpers.js';
import type { ProjectIdentityInfo as ProjectIdentityInfoType } from './sprint-docs-helpers.js';
export type { ProjectIdentityInfo } from './sprint-docs-helpers.js';
type ProjectIdentityInfo = ProjectIdentityInfoType;

// ═══ Internal Helpers ══════════════════════════════════════════════

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (e) {
    debugLog('readFileSafe:readFile', e);
    return '';
  }
}

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
 * @returns Array of document update results from each updater
 */
export function updateProjectDocs(projectRoot: string, sprintResult: SprintResult, config?: ResolvedConfig): DocUpdateResult[] {
  const isInternalProject = existsSync(join(projectRoot, 'DECKENT-MASTER-BLUEPRINT.md'));
  const resolvedConfig: ResolvedConfig = config ?? {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 8,
      brain_model: (modelRegistry.getByProviderAndTier('claude', 'premium')?.id ?? 'opus') as ResolvedConfig['activeModeConfig']['brain_model'],
      default_model: (modelRegistry.getByProviderAndTier('claude', 'premium')?.id ?? 'opus') as ResolvedConfig['activeModeConfig']['default_model'],
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
  };
  const ctx = { projectRoot, sprintResult, config: resolvedConfig, isInternalProject };
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

// ═══ Project Identity ═════════════════════════════════════════════

/**
 * Generate the initial PROJECT-IDENTITY.md content.
 * Called during `deckent init` to create the permanent project memory file.
 * @param info - Project identity information
 * @returns Markdown content for PROJECT-IDENTITY.md
 */
export function generateProjectIdentity(info: ProjectIdentityInfo): string {
  return generateProjectIdentityHelper(info);
}

/**
 * Count real test cases by scanning test files for it()/test() calls.
 * Returns the total number of test cases found in tests/ directory.
 */
export function countProjectTestCases(projectRoot: string): number {
  const testsDir = join(projectRoot, 'tests');
  if (!existsSync(testsDir)) return 0;

  let totalTests = 0;
  const testPattern = /\b(?:it|test)\s*\(/g;

  function scanDir(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const matches = content.match(testPattern);
            if (matches) totalTests += matches.length;
          } catch (e) { debugLog('countTestsInProject:readFile', e); }
        }
      }
    } catch (e) { debugLog('countTestsInProject:readdirSync', e); }
  }

  scanDir(testsDir);
  return totalTests;
}

/**
 * Parse statement coverage percentage from coverage/clover.xml if it exists.
 * Returns the coverage percentage (0-100), or null if unavailable.
 */
export function parseCoverageFromClover(projectRoot: string): number | null {
  const cloverPath = join(projectRoot, 'coverage', 'clover.xml');
  if (!existsSync(cloverPath)) return null;

  try {
    const xml = readFileSync(cloverPath, 'utf-8');
    const projectMetrics = xml.match(/<project[^>]*>[\s\S]*?<metrics\s([^/]*?)\/>/);
    if (!projectMetrics) return null;

    const attrs = projectMetrics[1] ?? '';
    const statementsMatch = attrs.match(/statements="(\d+)"/);
    const coveredMatch = attrs.match(/coveredstatements="(\d+)"/);
    if (!statementsMatch || !coveredMatch) return null;

    const total = parseInt(statementsMatch[1] ?? '0', 10);
    const covered = parseInt(coveredMatch[1] ?? '0', 10);
    if (total === 0) return 0;

    return (covered / total) * 100;
  } catch (e) {
    debugLog('parseCoverageFromClover:parse', e);
    return null;
  }
}

/**
 * Get test count from vitest --reporter=json output.
 * Returns numTotalTests or null if vitest fails/times out.
 */
export function getTestCountFromVitest(projectRoot: string): number | null {
  try {
    if (!existsSync(join(projectRoot, 'package.json'))) return null;
    const result = spawnSync('npx', ['vitest', 'run', '--reporter=json'], {
      cwd: projectRoot,
      timeout: 30_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0 && result.status !== 1) return null;
    const output = result.stdout ?? '';
    const jsonStart = output.indexOf('{');
    if (jsonStart === -1) return null;
    const parsed = JSON.parse(output.slice(jsonStart)) as { numTotalTests?: number };
    if (typeof parsed.numTotalTests === 'number' && parsed.numTotalTests > 0) {
      return parsed.numTotalTests;
    }
    return null;
  } catch (e) {
    debugLog('getTestCountFromVitest:parseJSON', e);
    return null;
  }
}

/**
 * Get coverage percentage from vitest --coverage text output.
 * Parses "All files" line from the text summary. Returns percentage or null.
 */
export function getCoverageFromVitest(projectRoot: string): number | null {
  try {
    if (!existsSync(join(projectRoot, 'package.json'))) return null;
    const result = spawnSync('npx', ['vitest', 'run', '--coverage', '--reporter=default'], {
      cwd: projectRoot,
      timeout: 60_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0 && result.status !== 1) return null;
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    const allFilesMatch = output.match(/All files[^|]*\|\s*([\d.]+)/);
    if (!allFilesMatch) return null;
    const value = parseFloat(allFilesMatch[1] ?? '0');
    return isNaN(value) ? null : value;
  } catch (e) {
    debugLog('getCoverageFromVitest:parse', e);
    return null;
  }
}

/**
 * Read the previous "Test Count" value from PROJECT-IDENTITY.md content.
 */
export function readPreviousTestCount(content: string): number | null {
  const match = content.match(/- Test Count:\s*(\d+)/);
  if (!match) return null;
  const value = parseInt(match[1] ?? '0', 10);
  return value > 0 ? value : null;
}

/**
 * Update the "Current State" section of PROJECT-IDENTITY.md after each sprint.
 * Preserves all other sections. Creates the file with defaults if missing.
 *
 * Test count fallback chain: vitest JSON → previous value → regex scan
 * Coverage fallback chain: vitest --coverage → clover.xml → previous value → metrics → 0
 * Total sprints: sprint ID number → parameter → 1
 * Completed tasks: cumulative (previous + current)
 */
export function updateProjectIdentity(
  projectRoot: string,
  sprintId: string,
  metrics: SprintMetrics,
  totalSprints?: number,
): void {
  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });
  const filePath = join(brainPath, PROJECT_IDENTITY_FILE);

  let content = readFileSafe(filePath);

  const vitestTestCount = getTestCountFromVitest(projectRoot);
  const previousTestCount = readPreviousTestCount(content);
  const realTestCount = vitestTestCount ?? previousTestCount ?? countProjectTestCases(projectRoot);

  const vitestCoverage = getCoverageFromVitest(projectRoot);
  const realCoverage = vitestCoverage ?? parseCoverageFromClover(projectRoot);
  const previousCoverage = readPreviousCoverage(content);
  const coverageValue =
    (realCoverage !== null && realCoverage > 0) ? realCoverage :
    (previousCoverage !== null && previousCoverage > 0) ? previousCoverage :
    (metrics.coveragePercent > 0) ? metrics.coveragePercent :
    0;

  const sprintNumber = extractSprintNumber(sprintId);
  const resolvedTotalSprints = sprintNumber ?? totalSprints ?? 1;
  const previousCompleted = readPreviousCompletedTasks(content);
  const cumulativeCompleted = previousCompleted + metrics.completedTasks;

  if (!content) {
    const dirName = projectRoot.split(/[\\/]/).pop() ?? 'unknown';
    content = generateProjectIdentity({
      projectName: dirName,
      sprintId,
      totalSprints: resolvedTotalSprints,
      testCount: realTestCount,
    });
    writeFileSync(filePath, content, 'utf-8');
    return;
  }

  const stateLines = buildCurrentStateLines(
    realTestCount, coverageValue, sprintId, resolvedTotalSprints, cumulativeCompleted, metrics.noGoRate,
  );
  writeFileSync(filePath, replaceCurrentStateSection(content, stateLines), 'utf-8');
}

// ═══ DEBT.md Auto-Resolve ════════════════════════════════════════

/**
 * Auto-resolve DEBT.md entries for tasks that were fixed during the FIX phase.
 * A task is "fixed" if it was NO_GO in initial evaluation but became DONE/GO_WITH_TECH_DEBT after FIX.
 * @param projectRoot - Project root directory
 * @param sprint - Current sprint object
 * @param evaluations - Map of task ID to final evaluation result
 */
export function autoResolveDebt(
  projectRoot: string,
  sprint: { id: string; tasks: Array<{ id: string; isPriorityFix?: boolean; fixForTaskId?: string }> },
  evaluations: Map<string, string>,
): number {
  const debtPath = join(projectRoot, BRAIN_DIR, DEBT_FILE);
  if (!existsSync(debtPath)) return 0;

  const content = readFileSync(debtPath, 'utf-8');
  if (!content.trim()) return 0;

  const resolvedTaskIds = new Set<string>();
  for (const task of sprint.tasks) {
    if (!task.isPriorityFix || !task.fixForTaskId) continue;
    const ev = evaluations.get(task.id);
    if (ev === 'DONE' || ev === TaskEvaluation.DONE) {
      resolvedTaskIds.add(task.fixForTaskId);
    }
  }

  if (resolvedTaskIds.size === 0) return 0;

  const lines = content.split('\n');
  let resolvedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const taskId of resolvedTaskIds) {
      if (line.includes(taskId) && !line.includes('resolved=true') && !line.includes('✅')) {
        lines[i] = line.replace(/\|\s*$/, `| resolved=${sprint.id} |`)
          .replace(/resolved\s*=\s*false/, `resolved=true`)
          .replace(/\bfalse\b(?=[^|]*$)/, `true (${sprint.id})`);
        if (!lines[i]!.includes(sprint.id)) {
          lines[i] = `${line} <!-- resolved in ${sprint.id} -->`;
        }
        resolvedCount++;
      }
    }
  }

  if (resolvedCount > 0) {
    writeFileSync(debtPath, lines.join('\n'), 'utf-8');
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

// ═══ Patterns ═══════════════════════════════════════════════════

/**
 * Add recurring error files as patterns to .brain/PATTERNS.md.
 * Returns the number of new patterns added.
 */
export function addRecurringPatternsToFile(projectRoot: string, recurringFiles: string[]): number {
  if (recurringFiles.length === 0) return 0;

  const patternsPath = join(projectRoot, BRAIN_DIR, PATTERNS_FILE);
  mkdirSync(join(projectRoot, BRAIN_DIR), { recursive: true });

  let data: { active: PatternEntry[]; resolved: PatternEntry[] } = { active: [], resolved: [] };
  if (existsSync(patternsPath)) {
    try {
      data = JSON.parse(readFileSync(patternsPath, 'utf-8'));
    } catch (e) {
      debugLog('appendPatterns:parsePatterns', e);
    }
  }
  if (!Array.isArray(data.active)) data.active = [];
  if (!Array.isArray(data.resolved)) data.resolved = [];

  const existingPatterns = new Set([
    ...data.active.map(p => p.pattern),
    ...data.resolved.map(p => p.pattern),
  ]);

  let added = 0;
  for (const filePath of recurringFiles) {
    const patternName = `recurring_error_${filePath.replace(/[/.]/g, '_')}`;
    if (existingPatterns.has(patternName)) continue;

    data.active.push({
      pattern: patternName,
      occurrences: 3,
      firstDetectedInSprint: 'auto-detected',
      lastDetectedInSprint: 'auto-detected',
      resolved: false,
    });
    added++;
  }

  if (added > 0) {
    writeFileSync(patternsPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  return added;
}

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
 * Archive the current DIRECTIVES.md and replace it with a placeholder
 * for the next sprint. Called by finalizeSprint() after RETRO is written.
 *
 * - Copies DIRECTIVES.md → .brain/archive/DIRECTIVES-sprint-NNN.md
 * - Writes a placeholder DIRECTIVES.md with next-sprint header
 * - Creates .brain/archive/ if it doesn't exist
 * - No-ops gracefully if DIRECTIVES.md doesn't exist
 * - Phase guard: only executes during CLEANUP or COMPLETE phase (Sprint 146 bug fix)
 *
 * @param projectRoot - Project root directory
 * @param sprintId - The completed sprint ID (e.g. 'sprint-133')
 * @param phase - Current sprint phase. If provided, only CLEANUP/COMPLETE phases are allowed.
 */
export function archiveDirectives(projectRoot: string, sprintId: string, phase?: string): void {
  // Phase guard: reject calls outside CLEANUP/COMPLETE (Sprint 146 T-008 bug fix)
  if (phase !== undefined && phase !== 'CLEANUP' && phase !== 'COMPLETE') {
    debugLog('archiveDirectives', `REJECTED: called in phase ${phase}, only CLEANUP allowed`);
    return;
  }
  const directivesPath = join(projectRoot, DIRECTIVES_FILE);
  const archiveDir = join(projectRoot, BRAIN_DIR, ARCHIVE_DIR);

  if (!existsSync(directivesPath)) {
    debugLog('archiveDirectives', `${DIRECTIVES_FILE} not found — skipping`);
    return;
  }

  mkdirSync(archiveDir, { recursive: true });

  const archiveFileName = `DIRECTIVES-${sprintId}.md`;
  const archivePath = join(archiveDir, archiveFileName);
  copyFileSync(directivesPath, archivePath);

  const currentNum = extractSprintNumber(sprintId);
  const nextNum = currentNum !== null ? currentNum + 1 : '???';

  writeFileSync(directivesPath, buildDirectivesPlaceholder(sprintId, archiveFileName, nextNum));
  debugLog('archiveDirectives', `Archived ${DIRECTIVES_FILE} → ${archivePath}`);
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
    f.startsWith(prefix) && ORPHAN_TASK_EXTENSIONS.test(f),
  );
  // Also archive .prompt-* files for this sprint
  const promptFiles = allFiles.filter(f => f.startsWith('.prompt-'));
  const filesToArchive = [...taskFiles, ...promptFiles];

  if (filesToArchive.length === 0) {
    debugLog('archiveOrphanTasks', `No orphan task files for ${sprintId}`);
    return 0;
  }

  const archiveDir = join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, `${sprintId}-tasks`);
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
