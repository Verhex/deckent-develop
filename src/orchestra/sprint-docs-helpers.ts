// ─── Sprint Docs Helpers ──────────────────────────────────────────
// Pure string/template builder functions extracted from sprint-docs-updater.ts.
// No file I/O — only transforms data to formatted strings/arrays.
import type { Sprint, SprintMetrics, TaskResult, TaskEvaluation } from '../core/types.js';

// ═══ Shared Types ═══════════════════════════════════════════════

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

// ═══ Sprint Log Builders ════════════════════════════════════════

/**
 * Build the lines array for a sprint log markdown file.
 * Pure builder — no file I/O.
 */
export function buildSprintLogLines(
  sprint: Sprint,
  metrics: SprintMetrics,
  evaluations?: Map<string, TaskEvaluation>,
  results?: TaskResult[],
): string[] {
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
    const taskSkillsStr = (task.assignedSkills ?? []).length > 0
      ? (task.assignedSkills ?? []).join(', ')
      : '-';
    lines.push(`| ${task.id}: ${task.title} | ${agentStr} | ${taskSkillsStr} | ${statusStr} |`);
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

  return lines;
}

// ═══ Project Identity Builders ══════════════════════════════════

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
  // Memory V2 (Sprint 179 W3-6): decisions live in DB + auto-generated export.
  // Legacy .brain/DECISIONS.md path is kept in the reference for backward compat
  // with V1 installs that have not yet migrated to memory.db.
  lines.push('- See .brain/exports/decisions.md (Memory V2 export of .brain/memory.db, replaces legacy .brain/DECISIONS.md) for architecture decision records');
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

/** Build the lines for the "Current State" section of PROJECT-IDENTITY.md. */
export function buildCurrentStateLines(
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

// ═══ DIRECTIVES Placeholder Builder ════════════════════════════

/**
 * Build the placeholder DIRECTIVES.md content for the next sprint.
 * @param archivedSprintId - The sprint that was just completed
 * @param archiveFileName - The filename of the archived DIRECTIVES
 * @param nextNum - The next sprint number (or '???' if unknown)
 */
export function buildDirectivesPlaceholder(
  archivedSprintId: string,
  archiveFileName: string,
  nextNum: number | string,
): string {
  return [
    `# DIRECTIVES — (Sprint ${nextNum} için hazırlanıyor)`,
    '',
    `> Önceki sprint (${archivedSprintId}) tamamlandı. Bu dosya yeni sprint hedefleri için hazırdır.`,
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
}

// ═══ Project Identity Section Helpers ══════════════════════════

/**
 * Read the previous "Completed Tasks" cumulative value from PROJECT-IDENTITY.md content.
 */
export function readPreviousCompletedTasks(content: string): number {
  const match = content.match(/- Completed Tasks:\s*(\d+)/);
  if (!match) return 0;
  return parseInt(match[1] ?? '0', 10);
}

/**
 * Read the previous "Coverage" value from PROJECT-IDENTITY.md content.
 * Returns the percentage (0-100), or null if not found.
 */
export function readPreviousCoverage(content: string): number | null {
  const match = content.match(/- Coverage:\s*([\d.]+)%/);
  if (!match) return null;
  const value = parseFloat(match[1] ?? '0');
  return isNaN(value) ? null : value;
}

/**
 * Replace (or append) the "## Current State" section in PROJECT-IDENTITY.md content.
 * Returns the updated content string.
 */
export function replaceCurrentStateSection(content: string, stateLines: string[]): string {
  const lines = content.split('\n');
  const newLines: string[] = [];
  let inCurrentState = false;
  let replacedCurrentState = false;

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
    newLines.push('');
    newLines.push('## Current State');
    newLines.push(...stateLines);
    newLines.push('');
  }

  return newLines.join('\n');
}

// ═══ Sprint File Helpers ════════════════════════════════════════

/** Extract sprint number from filename for numeric sorting. */
export function sprintFileNumber(filename: string): number {
  const m = filename.match(/sprint-(\d+)/);
  return m ? parseInt(m[1] ?? '0', 10) : 0;
}

// ═══ ADR Helpers ════════════════════════════════════════════════

/**
 * Parse added files starting with 'src/' from git diff --name-status output.
 */
export function parseAddedSrcFiles(diffOutput: string): string[] {
  const addedFiles: string[] = [];
  for (const line of diffOutput.split('\n')) {
    const match = line.match(/^A\t(.+)$/);
    if (match && match[1]?.startsWith('src/')) {
      addedFiles.push(match[1]);
    }
  }
  return addedFiles;
}

/**
 * Find the maximum ADR number in DECISIONS.md content.
 */
export function findMaxAdrNumber(content: string): number {
  const adrMatches = content.match(/## ADR-(\d+)/g) ?? [];
  let maxAdr = 0;
  for (const m of adrMatches) {
    const numMatch = m.match(/ADR-(\d+)/);
    if (numMatch && numMatch[1]) {
      const num = parseInt(numMatch[1], 10);
      if (num > maxAdr) maxAdr = num;
    }
  }
  return maxAdr;
}

/**
 * Build ADR markdown entry lines for a newly detected module directory.
 * @param adrNumber - Zero-padded ADR number string (e.g. "034")
 * @param dirName - Directory name (last segment of path)
 * @param sprintNum - Sprint number or raw sprint ID string
 */
export function buildAdrEntry(
  adrNumber: string,
  dirName: string,
  sprintNum: number | string,
): string[] {
  return [
    '',
    `## ADR-${adrNumber}: ${dirName} (Draft — Sprint #${sprintNum})`,
    `**Status:** PROPOSED`,
    `**Context:** New module added in Sprint #${sprintNum}`,
    `**Decision:** [To be documented]`,
  ];
}
