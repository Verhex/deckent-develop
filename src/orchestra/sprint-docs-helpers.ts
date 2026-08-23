// ─── Sprint Docs Helpers ──────────────────────────────────────────
// Pure string/template builder functions extracted from sprint-docs-updater.ts.
// No file I/O — only transforms data to formatted strings/arrays.
import type { Sprint, SprintMetrics, TaskResult, TaskEvaluation } from '../core/types.js';
import { modelRegistry } from '../core/model-registry.js';

// 454-004: the DIRECTIVES.md placeholder must teach an exact provider API ID —
// never a retired alias (opus/sonnet/haiku) that resolveCanonicalModelIdentity()
// now rejects. Derived from the registry so the placeholder tracks the live
// catalog; absence is a loud configuration error.
const PLACEHOLDER_MODEL = modelRegistry.getByProviderAndTier('claude', 'standard');
if (!PLACEHOLDER_MODEL) throw new Error('E_SPRINT_DOCS_MODEL_UNAVAILABLE');
const PLACEHOLDER_MODEL_ID = PLACEHOLDER_MODEL.id;

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

// B6 (Memory V2): generateProjectIdentity + buildCurrentStateLines removed —
// the legacy .brain/PROJECT-IDENTITY.md document is no longer rendered.

// ═══ DIRECTIVES Placeholder Builder ════════════════════════════

/**
 * Build the placeholder DIRECTIVES.md content for the next sprint.
 * @param archivedSprintId - The sprint that was just completed
 * @param archiveReference - Project-relative path of the archived DIRECTIVES
 * @param nextNum - The next sprint number (or '???' if unknown)
 */
export function buildDirectivesPlaceholder(
  archivedSprintId: string,
  archiveReference: string,
  nextNum: number | string,
): string {
  return [
    `# DIRECTIVES — (Sprint ${nextNum} için hazırlanıyor)`,
    '',
    `> Önceki sprint (${archivedSprintId}) tamamlandı. Bu dosya yeni sprint hedefleri için hazırdır.`,
    '',
    `## Referanslar`,
    `- Arşiv: ${archiveReference}`,
    `- Retro: .brain/RETRO.md`,
    `- Bellek: .brain/MEMORY.md`,
    '',
    `## Goal: (Sprint ${nextNum} hedefini buraya yazın)`,
    '',
    '---',
    '',
    '## Task 1: (Task başlığı)',
    `- Model: ${PLACEHOLDER_MODEL_ID}`,
    '- Provider: claude',
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
