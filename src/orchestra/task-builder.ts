// ─── Task Creation & Directive Parsing ─────────────────────────────
// Extracted from brain.ts — task construction, scope extraction, directive parsing
import type {
  Task, TaskScope, GoNoGoCriteria, ModelType, TaskEffort, TaskPriority,
  PlannerTask,
} from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import { calculateModelScore } from './model-selector.js';

// ═══ Types ═════════════════════════════════════════════════════════

export interface CreateTaskParams {
  title: string;
  description: string;
  model: ModelType;
  effort: TaskEffort;
  priority: TaskPriority;
  reason: string;
  scope: TaskScope;
  dependencies: string[];
  goNogo: GoNoGoCriteria;
  sprintId: string;
  isPriorityFix?: boolean;
  fixForTaskId?: string;
  initialStatus?: TaskStatus;
  forceModel?: ModelType;
  forceEffort?: TaskEffort;
}

export interface ParsedDirectiveTask {
  title: string;
  description: string;
  scope: TaskScope;
  testTarget?: string;
  forceModel?: ModelType;
  forceEffort?: TaskEffort;
}

// ═══ Functions ════════════════════════════════════════════════════

function now(): string {
  return new Date().toISOString();
}

// 4. createTask (pure)
export function createTask(params: CreateTaskParams, sequence: number): Task {
  const sprintNumber = params.sprintId.replace('sprint-', '');
  const id = `${sprintNumber}-${String(sequence).padStart(3, '0')}`;
  return {
    id,
    title: params.title,
    description: params.description,
    model: params.model,
    effort: params.effort,
    priority: params.priority,
    reason: params.reason,
    scope: params.scope,
    dependencies: params.dependencies,
    goNogo: params.goNogo,
    status: params.initialStatus ?? TaskStatus.PENDING,
    sprintId: params.sprintId,
    isPriorityFix: params.isPriorityFix,
    fixForTaskId: params.fixForTaskId,
    forceModel: params.forceModel,
    forceEffort: params.forceEffort,
    createdAt: now(),
  };
}

// 4b. extractScopeFromDirective (pure)
export function extractScopeFromDirective(line: string): TaskScope {
  const directories: string[] = [];
  const filesWrite: string[] = [];

  // Match directory-like paths: src/..., tests/...
  const dirMatches = line.match(/\b(src\/[\w/.-]*|tests\/[\w/.-]*)\//g);
  if (dirMatches) {
    for (const d of dirMatches) {
      if (!directories.includes(d)) directories.push(d);
    }
  }

  // Match file paths: anything ending in .ts or .js
  const fileMatches = line.match(/\b[\w/.-]+\.(?:ts|js)\b/g);
  if (fileMatches) {
    for (const f of fileMatches) {
      if (!filesWrite.includes(f)) filesWrite.push(f);
    }
  }

  return { directories, filesRead: [], filesWrite };
}

// 4d. parseStructuredDirectives (pure)
export function parseStructuredDirectives(content: string): ParsedDirectiveTask[] {
  // Split on "## Görev N:" / "## Gorev N:" / "## Task N:" pattern
  const blockSplit = content.split(/^##\s+(?:G[öo]rev|Task)\s+\d+[^:]*:/m);
  const blocks = blockSplit.slice(1); // skip content before first heading

  if (blocks.length === 0) return []; // no structured sections → fallback

  const tasks: ParsedDirectiveTask[] = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    // First non-empty line after heading becomes the title (strip leading "- " prefix)
    const titleLine = lines.find(l => l.trim()) ?? '';
    const title = titleLine.trim().replace(/^-\s+/, '');
    if (!title) continue;

    // Collect all scope-related lines (Dosya:, Kapsam:, file paths)
    const scopeLines = lines.filter(l =>
      l.includes('Dosya:') || l.includes('Kapsam:') || l.includes('- Kapsam') ||
      /\bsrc\/|tests\//.test(l),
    );
    const scope = scopeLines.reduce<TaskScope>((acc, scopeLine) => {
      const extracted = extractScopeFromDirective(scopeLine);
      return {
        directories: [...acc.directories, ...extracted.directories.filter(d => !acc.directories.includes(d))],
        filesRead: [],
        filesWrite: [...acc.filesWrite, ...extracted.filesWrite.filter(f => !acc.filesWrite.includes(f))],
      };
    }, { directories: [], filesRead: [], filesWrite: [] });

    // Extract test target from "- Test: ..." lines
    const testLine = lines.find(l => /^[\s-]*Test:/i.test(l.trim()));
    const testTarget = testLine
      ? testLine.trim().replace(/^-\s+/, '').replace(/^Test:\s*/i, '').trim()
      : undefined;

    // Extract optional Model: override (e.g., "Model: opus")
    const modelLine = lines.find(l => /^[\s-]*Model:\s*/i.test(l.trim()));
    const forceModel = modelLine
      ? modelLine.trim().replace(/^-\s+/, '').replace(/^Model:\s*/i, '').trim().toLowerCase() as ModelType
      : undefined;
    const validModels: string[] = ['opus', 'sonnet', 'haiku'];
    const parsedForceModel = forceModel && validModels.includes(forceModel) ? forceModel : undefined;

    // Extract optional Effort: override (e.g., "Effort: max")
    const effortLine = lines.find(l => /^[\s-]*Effort:\s*/i.test(l.trim()));
    const forceEffort = effortLine
      ? effortLine.trim().replace(/^-\s+/, '').replace(/^Effort:\s*/i, '').trim().toLowerCase() as TaskEffort
      : undefined;
    const validEfforts: string[] = ['low', 'normal', 'high'];
    const parsedForceEffort = forceEffort && validEfforts.includes(forceEffort) ? forceEffort : undefined;

    tasks.push({ title, description: block.trim(), scope, testTarget, forceModel: parsedForceModel, forceEffort: parsedForceEffort });
  }
  return tasks;
}

// 4e. plannerTaskToParams (pure)
export function plannerTaskToParams(
  pt: PlannerTask,
  sprintId: string,
  modelOverride: ModelType,
  initialStatus?: TaskStatus,
): CreateTaskParams {
  return {
    title: pt.title,
    description: pt.description,
    model: pt.model ?? modelOverride,
    effort: pt.effort,
    priority: pt.priority,
    reason: pt.reason,
    scope: pt.scope,
    dependencies: pt.dependencies,
    goNogo: pt.goNogo,
    sprintId,
    initialStatus,
  };
}

// 5a. resolveWorkerEffort — determine worker effort level based on task complexity
export function resolveWorkerEffort(task: Task): 'max' | 'high' | 'medium' | 'low' {
  if (task.forceEffort) return task.forceEffort as 'max' | 'high' | 'medium' | 'low';
  const score = calculateModelScore(task.title, task.description, task.scope);
  if (score >= 6) return 'max';
  if (score >= 1) return 'high';
  if (score >= -1) return 'medium';
  return 'low';
}

// 5b. buildWorkerPrompt (pure)
export function buildWorkerPrompt(
  task: Task,
  agentPrompt?: string,
  skillPrompts?: Array<{ name: string; content: string }>,
): string {
  const scopeStr = task.scope.directories.length > 0
    ? task.scope.directories.join(', ')
    : 'any';
  const effort = resolveWorkerEffort(task);

  // Agent context block: prepended when a specialized agent is assigned
  const agentBlock = agentPrompt
    ? `=== Agent: ${task.assignedAgent ?? 'generic'} ===\n${agentPrompt.slice(0, 2000)}\n\n=== Task ===\n`
    : '';

  // Skill context block: appended after agent block when skills are assigned
  const SKILL_SECTION_MAX = 4000;
  const SKILL_DEFAULT_MAX = 1500;
  let skillBlock = '';
  if (skillPrompts && skillPrompts.length > 0) {
    const parts: string[] = ['=== Skills ==='];
    let totalLen = parts[0]!.length;
    for (const sp of skillPrompts) {
      const maxChars = SKILL_DEFAULT_MAX;
      const truncated = sp.content.slice(0, maxChars);
      const entry = `--- ${sp.name} ---\n${truncated}`;
      if (totalLen + entry.length + 1 > SKILL_SECTION_MAX) break;
      parts.push(entry);
      totalLen += entry.length + 1;
    }
    if (parts.length > 1) {
      skillBlock = parts.join('\n') + '\n\n';
    }
  }

  return `${agentBlock}${skillBlock}You are a Deckent worker agent. Your task:

Task ${task.id}: ${task.title}
Description: ${task.description}
Model: ${task.model}
Scope: ${scopeStr}

Worker effort: --effort ${effort}

Instructions:
1. Complete the task described above
2. Stay within the assigned scope
3. Write tests for every function you write (*.test.ts)
4. Place test files in the same directory as the source file, with the same name and .test.ts extension
5. Run: npx vitest run — then write the test results to the .result file
6. Coverage goal: minimum 80%
7. Create a heartbeat file at .tasks/task-${task.id}.hb BEFORE starting work (JSON format):

{
  "workerId": "w-${task.id}",
  "taskId": "${task.id}",
  "status": "EXECUTING",
  "currentAction": "Starting task",
  "timestamp": "<use new Date().toISOString() — UTC ISO 8601, e.g. 2026-01-01T00:00:00.000Z>",
  "filesChangedCount": 0,
  "sequence": 0
}

IMPORTANT: The timestamp field MUST be a valid UTC ISO 8601 string produced by new Date().toISOString(). Never use locale date strings, relative times, or placeholder text.

Update this file periodically as you work:
- Change status to CODING, TESTING, DOCUMENTING as appropriate
- Update currentAction with what you're doing
- Increment sequence on each update
- Update filesChangedCount as you modify files
- Always refresh the timestamp using new Date().toISOString() on each update

8. When finished, create the result file at .tasks/task-${task.id}.result — this file is REQUIRED (JSON format):

{
  "taskId": "${task.id}",
  "filesChanged": ["list/of/files/you/created/or/modified"],
  "linesAdded": 0,
  "linesRemoved": 0,
  "testsPassed": true,
  "coverage": 0,
  "selfAssessment": "DONE",
  "notes": "Brief summary of what was done"
}

selfAssessment must be one of: "DONE", "GO_WITH_TECH_DEBT", "NO_GO"
The result file at .tasks/task-${task.id}.result is REQUIRED — without it your work cannot be evaluated.`;
}
