// ─── Sprint Docs Updater ─────────────────────────────────────────
// Extracted from sprint-reporter.ts — managed-docs, project identity, sprint log, debt, archive
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
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

  // Collect agent/skill info from tasks
  const agentSet = new Set<string>();
  const skillSet = new Set<string>();
  let totalFilesChanged = 0;
  for (const task of sprint.tasks) {
    if (task.assignedAgent && task.assignedAgent !== 'generic') agentSet.add(task.assignedAgent);
    for (const s of task.assignedSkills ?? []) skillSet.add(s);
    const result = results?.find(r => r.taskId === task.id);
    if (result?.filesChanged) totalFilesChanged += result.filesChanged.length;
  }

  const agentsStr = agentSet.size > 0 ? [...agentSet].join(', ') : '-';
  const skillsStr = skillSet.size > 0 ? [...skillSet].join(', ') : '-';

  const lines: string[] = [
    `# ${sprint.id}`, '',
    '## Metrics',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Tasks | ${metrics.totalTasks} |`,
    `| Completed | ${metrics.completedTasks} |`,
    `| Tech Debt | ${metrics.techDebtTasks} |`,
    `| No-Go | ${metrics.noGoTasks} |`,
    `| Coverage | ${metrics.coveragePercent.toFixed(1)}% |`,
    `| Duration | ${metrics.durationMs}ms |`,
    `| Files Changed | ${totalFilesChanged || '-'} |`, '',
    '## Agents',
    `Agents: ${agentsStr}`,
    `Skills: ${skillsStr}`, '',
    '## Tasks',
    '| Task | Agent | Skills | Status |',
    '|------|-------|--------|--------|',
  ];
  for (const task of sprint.tasks) {
    const evalResult = evaluations?.get(task.id);
    const statusStr = evalResult ?? task.status;
    const agentStr = task.assignedAgent ?? 'generic';
    const skillsStr = (task.assignedSkills ?? []).length > 0
      ? (task.assignedSkills ?? []).join(', ')
      : '-';
    lines.push(`| ${task.id}: ${task.title} | ${agentStr} | ${skillsStr} | ${statusStr} |`);
  }

  // Add ## Notes section for all tasks that have result notes
  const tasksWithNotes = sprint.tasks.filter(task => {
    const result = results?.find(r => r.taskId === task.id);
    return result?.notes;
  });
  if (tasksWithNotes.length > 0) {
    lines.push('', '## Notes');
    for (const task of tasksWithNotes) {
      const result = results?.find(r => r.taskId === task.id);
      const notes = (result?.notes ?? '').slice(0, 150);
      lines.push(`- ${task.id} (${task.title}): ${notes}`);
    }
  }

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

export interface ProjectIdentityInfo {
  projectName: string;
  description?: string;
  testCount?: number;
  fileCount?: number;
  lineCount?: number;
  sprintId: string;
  totalSprints?: number;
  mode?: string;
  brainModel?: string;
  defaultModel?: string;
  maxWorkers?: number;
  framework?: string;
  language?: string;
  testFramework?: string;
  buildTool?: string;
  moduleMap?: Record<string, string>;
}

/**
 * Generate the initial PROJECT-IDENTITY.md content.
 * Called during `deckent init` to create the permanent project memory file.
 * @param info - Project identity information
 * @returns Markdown content for PROJECT-IDENTITY.md
 */
export function generateProjectIdentity(info: ProjectIdentityInfo): string {
  const lines: string[] = [
    '# Project Identity',
    '',
    '## What Is This Project',
    `- Name: ${info.projectName}`,
  ];
  if (info.description) {
    lines.push(`- Description: ${info.description}`);
  }
  lines.push('');

  lines.push('## Architecture');
  if (info.language) lines.push(`- Language: ${info.language}`);
  if (info.framework) lines.push(`- Framework: ${info.framework}`);
  if (info.testFramework) lines.push(`- Test Framework: ${info.testFramework}`);
  if (info.buildTool) lines.push(`- Build Tool: ${info.buildTool}`);
  lines.push('');

  lines.push('## Current State');
  if (info.testCount !== undefined) lines.push(`- Test Count: ${info.testCount}`);
  if (info.fileCount !== undefined) lines.push(`- File Count: ${info.fileCount}`);
  if (info.lineCount !== undefined) lines.push(`- Line Count: ${info.lineCount}`);
  lines.push(`- Last Sprint: ${info.sprintId}`);
  if (info.totalSprints !== undefined) lines.push(`- Total Sprints: ${info.totalSprints}`);
  lines.push('');

  lines.push('## Active Configuration');
  if (info.mode) lines.push(`- Mode: ${info.mode}`);
  if (info.brainModel) lines.push(`- Brain Model: ${info.brainModel}`);
  if (info.defaultModel) lines.push(`- Default Model: ${info.defaultModel}`);
  if (info.maxWorkers !== undefined) lines.push(`- Max Workers: ${info.maxWorkers}`);
  lines.push('');

  lines.push('## Key Rules');
  lines.push('- See .brain/DECISIONS.md for architecture decision records');
  lines.push('');

  lines.push('## Module Map');
  if (info.moduleMap && Object.keys(info.moduleMap).length > 0) {
    for (const [dir, purpose] of Object.entries(info.moduleMap)) {
      lines.push(`- ${dir}: ${purpose}`);
    }
  } else {
    lines.push('- (auto-populated after first sprint)');
  }
  lines.push('');

  return lines.join('\n');
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
    // Find the project-level <metrics> element (first one after <project>)
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
    // Skip if no package.json — vitest won't work without a project
    if (!existsSync(join(projectRoot, 'package.json'))) return null;
    const result = spawnSync('npx', ['vitest', 'run', '--reporter=json'], {
      cwd: projectRoot,
      timeout: 30_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0 && result.status !== 1) return null;
    const output = result.stdout ?? '';
    // vitest JSON output may have non-JSON preamble; find the JSON object
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
    // Skip if no package.json — vitest won't work without a project
    if (!existsSync(join(projectRoot, 'package.json'))) return null;
    const result = spawnSync('npx', ['vitest', 'run', '--coverage', '--reporter=default'], {
      cwd: projectRoot,
      timeout: 60_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0 && result.status !== 1) return null;
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    // Look for "All files" line in coverage table: "All files  |  85.5 | ..."
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
 * Read the previous "Completed Tasks" value from PROJECT-IDENTITY.md.
 */
function readPreviousCompletedTasks(content: string): number {
  const match = content.match(/- Completed Tasks:\s*(\d+)/);
  if (!match) return 0;
  return parseInt(match[1] ?? '0', 10);
}

/**
 * Read the previous "Coverage" value from PROJECT-IDENTITY.md content.
 * Returns the percentage (0-100), or null if not found.
 */
function readPreviousCoverage(content: string): number | null {
  const match = content.match(/- Coverage:\s*([\d.]+)%/);
  if (!match) return null;
  const value = parseFloat(match[1] ?? '0');
  return isNaN(value) ? null : value;
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

  // Test count fallback chain:
  // 1. vitest --reporter=json (accurate runtime count)
  // 2. Previous PROJECT-IDENTITY.md value (preserve existing)
  // 3. Regex scan of test files (last resort)
  const vitestTestCount = getTestCountFromVitest(projectRoot);
  const previousTestCount = readPreviousTestCount(content);
  const realTestCount = vitestTestCount ?? previousTestCount ?? countProjectTestCases(projectRoot);

  // Coverage fallback chain:
  // 1. vitest --coverage text summary
  // 2. clover.xml (real coverage data)
  // 3. Previous PROJECT-IDENTITY.md value (preserve existing)
  // 4. Sprint metrics coveragePercent (worker self-assessment)
  // 5. Default to 0
  const vitestCoverage = getCoverageFromVitest(projectRoot);
  const realCoverage = vitestCoverage ?? parseCoverageFromClover(projectRoot);
  const previousCoverage = readPreviousCoverage(content);
  const coverageValue =
    (realCoverage !== null && realCoverage > 0) ? realCoverage :
    (previousCoverage !== null && previousCoverage > 0) ? previousCoverage :
    (metrics.coveragePercent > 0) ? metrics.coveragePercent :
    0;

  // Total sprints: prefer sprint ID number, fallback to parameter
  const sprintNumber = extractSprintNumber(sprintId);
  const resolvedTotalSprints = sprintNumber ?? totalSprints ?? 1;

  // Completed tasks: accumulate from previous value + current sprint
  const previousCompleted = readPreviousCompletedTasks(content);
  const cumulativeCompleted = previousCompleted + metrics.completedTasks;

  // If file doesn't exist, create a minimal one
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

  // Update the "Current State" section
  const lines = content.split('\n');
  const newLines: string[] = [];
  let inCurrentState = false;
  let replacedCurrentState = false;

  const stateLines = buildCurrentStateLines(
    realTestCount, coverageValue, sprintId, resolvedTotalSprints, cumulativeCompleted, metrics.noGoRate,
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line === '## Current State') {
      inCurrentState = true;
      replacedCurrentState = true;
      newLines.push('## Current State');
      newLines.push(...stateLines);
      continue;
    }

    if (inCurrentState) {
      // Skip old current state content until next section
      if (line.startsWith('## ')) {
        inCurrentState = false;
        newLines.push('');
        newLines.push(line);
      }
      continue;
    }

    newLines.push(line);
  }

  if (!replacedCurrentState) {
    // Section didn't exist, append it
    newLines.push('');
    newLines.push('## Current State');
    newLines.push(...stateLines);
    newLines.push('');
  }

  writeFileSync(filePath, newLines.join('\n'), 'utf-8');
}

/** Build the lines for the "Current State" section. */
function buildCurrentStateLines(
  testCount: number,
  coveragePercent: number,
  sprintId: string,
  totalSprints: number,
  completedTasks: number,
  noGoRate: number,
): string[] {
  const lines = [
    `- Test Count: ${testCount}`,
    `- Coverage: ${coveragePercent.toFixed(1)}%`,
  ];
  if (coveragePercent === 0) {
    lines.push('- Coverage Note: coverage not measured');
  }
  lines.push(
    `- Last Sprint: ${sprintId}`,
    `- Total Sprints: ${totalSprints}`,
    `- Completed Tasks: ${completedTasks}`,
    `- No-Go Rate: ${noGoRate.toFixed(1)}%`,
  );
  return lines;
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

  // Collect fix task IDs that resolved successfully
  const resolvedTaskIds = new Set<string>();
  for (const task of sprint.tasks) {
    if (!task.isPriorityFix || !task.fixForTaskId) continue;
    const ev = evaluations.get(task.id);
    if (ev === 'DONE' || ev === TaskEvaluation.DONE) {
      resolvedTaskIds.add(task.fixForTaskId);
    }
  }

  if (resolvedTaskIds.size === 0) return 0;

  // Process DEBT.md line by line
  const lines = content.split('\n');
  let resolvedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Match markdown table rows: | ... | taskId | ... | resolved | ...
    // Also match lines that contain a task ID reference
    for (const taskId of resolvedTaskIds) {
      if (line.includes(taskId) && !line.includes('resolved=true') && !line.includes('✅')) {
        // Mark as resolved by appending resolution info
        lines[i] = line.replace(/\|\s*$/, `| resolved=${sprint.id} |`)
          .replace(/resolved\s*=\s*false/, `resolved=true`)
          .replace(/\bfalse\b(?=[^|]*$)/, `true (${sprint.id})`);
        // If the line didn't have a resolved column pattern, append marker
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
  // Get list of added files from git
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

  // Parse added files under src/
  const addedFiles: string[] = [];
  for (const line of diffOutput.split('\n')) {
    const match = line.match(/^A\t(.+)$/);
    if (match && match[1]?.startsWith('src/')) {
      addedFiles.push(match[1]);
    }
  }

  if (addedFiles.length === 0) return 0;

  // Extract unique directories from added files
  const newDirs = new Set<string>();
  for (const filePath of addedFiles) {
    const parts = filePath.split('/');
    // We care about directories like src/foo/ — at least 2 segments before the file
    if (parts.length >= 3) {
      const dir = parts.slice(0, -1).join('/');
      newDirs.add(dir);
    }
  }

  if (newDirs.size === 0) return 0;

  // Filter out directories that already existed (have files other than the newly added ones)
  const trulyNewDirs: string[] = [];
  for (const dir of newDirs) {
    const fullDir = join(projectRoot, dir);
    if (!existsSync(fullDir)) continue;
    try {
      const entries = readdirSync(fullDir);
      // A directory is "new" if ALL its files are in our addedFiles list
      const dirPrefix = dir + '/';
      const allNew = entries.every(entry => {
        const entryPath = dirPrefix + entry;
        return addedFiles.includes(entryPath);
      });
      if (allNew && entries.length > 0) {
        trulyNewDirs.push(dir);
      }
    } catch (e) {
      debugLog('countNewModules:readdirSync', e);
      continue;
    }
  }

  if (trulyNewDirs.length === 0) return 0;

  // Read existing DECISIONS.md to determine next ADR number
  const decisionsPath = join(projectRoot, BRAIN_DIR, DECISIONS_FILE);
  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });

  let existingContent = '';
  if (existsSync(decisionsPath)) {
    existingContent = readFileSync(decisionsPath, 'utf-8');
  }

  // Count existing ADRs to determine next number
  const adrMatches = existingContent.match(/## ADR-(\d+)/g) ?? [];
  let maxAdr = 0;
  for (const m of adrMatches) {
    const numMatch = m.match(/ADR-(\d+)/);
    if (numMatch && numMatch[1]) {
      const num = parseInt(numMatch[1], 10);
      if (num > maxAdr) maxAdr = num;
    }
  }

  // Extract sprint number for display
  const sprintNum = extractSprintNumber(sprintId) ?? sprintId;

  // Draft new ADR entries
  const newEntries: string[] = [];
  let adrCount = 0;

  for (const dir of trulyNewDirs) {
    const dirName = dir.split('/').pop() ?? dir;
    const adrNumber = String(maxAdr + adrCount + 1).padStart(3, '0');
    newEntries.push('');
    newEntries.push(`## ADR-${adrNumber}: ${dirName} (Draft — Sprint #${sprintNum})`);
    newEntries.push(`**Status:** PROPOSED`);
    newEntries.push(`**Context:** New module added in Sprint #${sprintNum}`);
    newEntries.push(`**Decision:** [To be documented]`);
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
  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });

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

/** Extract sprint number from filename for numeric sorting */
function sprintFileNumber(filename: string): number {
  const m = filename.match(/sprint-(\d+)/);
  return m ? parseInt(m[1] ?? '0', 10) : 0;
}

/**
 * Collect sprint log files from both sprints/ and archive/ directories.
 * Returns entries sorted numerically by sprint number, deduped (sprints/ takes precedence).
 */
export function collectSprintFiles(root: string): Array<{ file: string; dir: string }> {
  const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);
  const archiveDir = join(root, BRAIN_DIR, ARCHIVE_DIR);

  const collected: Array<{ file: string; dir: string }> = [];
  const seen = new Set<string>();

  if (existsSync(sprintsDir)) {
    const files = readdirSync(sprintsDir).filter((f) => f.startsWith('sprint-') && f.endsWith('.md'));
    for (const f of files) {
      collected.push({ file: f, dir: sprintsDir });
      seen.add(f);
    }
  }

  if (existsSync(archiveDir)) {
    const files = readdirSync(archiveDir).filter((f) => f.startsWith('sprint-') && f.endsWith('.md'));
    for (const f of files) {
      if (!seen.has(f)) {
        collected.push({ file: f, dir: archiveDir });
      }
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
 *
 * @param projectRoot - Project root directory
 * @param sprintId - The completed sprint ID (e.g. 'sprint-133')
 */
export function archiveDirectives(projectRoot: string, sprintId: string): void {
  const directivesPath = join(projectRoot, DIRECTIVES_FILE);
  const archiveDir = join(projectRoot, BRAIN_DIR, ARCHIVE_DIR);

  // If DIRECTIVES.md doesn't exist, nothing to archive
  if (!existsSync(directivesPath)) {
    debugLog('archiveDirectives', `${DIRECTIVES_FILE} not found — skipping`);
    return;
  }

  // Ensure archive directory exists
  mkdirSync(archiveDir, { recursive: true });

  // Copy current DIRECTIVES to archive
  const archiveFileName = `DIRECTIVES-${sprintId}.md`;
  const archivePath = join(archiveDir, archiveFileName);
  copyFileSync(directivesPath, archivePath);

  // Compute next sprint number for placeholder
  const currentNum = extractSprintNumber(sprintId);
  const nextNum = currentNum !== null ? currentNum + 1 : '???';

  // Write placeholder DIRECTIVES.md
  const placeholder = [
    `# DIRECTIVES — (Sprint ${nextNum} için hazırlanıyor)`,
    '',
    `> Önceki sprint (${sprintId}) tamamlandı. Bu dosya yeni sprint hedefleri için hazırdır.`,
    '',
    `## Referanslar`,
    `- Arşiv: .brain/archive/${archiveFileName}`,
    `- Retro: .brain/RETRO.md`,
    `- Bellek: .brain/MEMORY.md`,
    '',
    `## Goal: (Sprint ${nextNum} hedefini buraya yazın)`,
    '',
    '---',
    '',
    '## Task 1: (Task başlığı)',
    '- Model: sonnet',
    '- Effort: normal',
    '- Skills: ',
    '- Files: ',
    '- Scope: ',
    '',
    '### Description',
    '(Task açıklamasını buraya yazın)',
    '',
  ].join('\n');

  writeFileSync(directivesPath, placeholder);
  debugLog('archiveDirectives', `Archived ${DIRECTIVES_FILE} → ${archivePath}`);
}
