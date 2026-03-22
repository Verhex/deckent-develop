// ─── Task Creation & Directive Parsing ─────────────────────────────
// Extracted from brain.ts — task construction, scope extraction, directive parsing
import { z } from 'zod';
import type {
  Task, TaskScope, GoNoGoCriteria, ModelType, TaskEffort, TaskPriority,
  PlannerTask,
} from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import { calculateModelScore } from './model-selector.js';

// ═══ Zod Schemas ═══════════════════════════════════════════════════

/** Zod schema for a single directive task section */
export const DirectiveTaskSchema = z.object({
  title: z.string().min(1, 'Task title must not be empty'),
  model: z.enum(['opus', 'sonnet', 'haiku']).optional(),
  effort: z.enum(['low', 'normal', 'high']).optional(),
  files: z.array(z.string()),
  scope: z.array(z.string()),
  description: z.string(),
  tests: z.array(z.string()).optional(),
});

/** Zod schema for a complete parsed DIRECTIVES.md document */
export const DirectiveSchema = z.object({
  goal: z.string().min(1, 'Directive goal must not be empty'),
  tasks: z.array(DirectiveTaskSchema).min(1, 'At least one task is required'),
});

export type DirectiveTask = z.infer<typeof DirectiveTaskSchema>;
export type Directive = z.infer<typeof DirectiveSchema>;

/**
 * Validate a parsed directive object against DirectiveSchema.
 * Returns { success: true, data } on success, or { success: false, error } with a
 * human-readable message on failure. Never throws.
 */
export function validateDirective(
  input: unknown,
): { success: true; data: Directive } | { success: false; error: string } {
  const result = DirectiveSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const formatted = result.error.format();
  const lines: string[] = ['DIRECTIVES validation failed:'];
  // Top-level field errors
  for (const [field, val] of Object.entries(formatted)) {
    if (field === '_errors') {
      for (const msg of val as string[]) lines.push(`  • ${msg}`);
      continue;
    }
    const fieldErrors = (val as { _errors?: string[] })._errors ?? [];
    for (const msg of fieldErrors) lines.push(`  • ${field}: ${msg}`);
  }
  // Per-task errors
  const tasksField = formatted.tasks as Record<string, { _errors?: string[]; title?: { _errors?: string[] }; model?: { _errors?: string[] }; effort?: { _errors?: string[] } }> | undefined;
  if (tasksField) {
    for (const [idx, taskErr] of Object.entries(tasksField)) {
      if (idx === '_errors') continue;
      const taskFieldErrors = taskErr as Record<string, { _errors?: string[] } | undefined>;
      for (const [subField, subVal] of Object.entries(taskFieldErrors)) {
        if (subField === '_errors') continue;
        for (const msg of (subVal?._errors ?? [])) {
          lines.push(`  • tasks[${idx}].${subField}: ${msg}`);
        }
      }
    }
  }
  return { success: false, error: lines.join('\n') };
}

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

/**
 * Create a new Task object from the given parameters and sequence number.
 * Generates a unique task ID from the sprint ID and sequence (e.g., "037-001").
 * @param params - Task creation parameters including title, scope, model, etc.
 * @param sequence - Sequence number within the sprint, used for ID generation
 * @returns A fully constructed Task object with status and timestamps
 */
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

/**
 * Extract a TaskScope from a directive line by matching directory and file path patterns.
 * Matches directories like src/..., tests/... and files ending in .ts or .js.
 * @param line - A single line from a directive document
 * @returns Extracted scope with directories and filesWrite populated
 */
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

/**
 * Parse a DIRECTIVES.md document into structured task definitions.
 * Splits on "## Task N:" or "## Gorev N:" headings and extracts title, scope,
 * test targets, and optional Model/Effort overrides from each section.
 * @param content - Raw DIRECTIVES.md content
 * @returns Array of parsed directive tasks; empty if no structured sections found
 */
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
      ? modelLine.trim().replace(/^-\s+/, '').replace(/^Model:\s*/i, '').trim().toLowerCase()
      : undefined;
    const validModels: string[] = ['opus', 'sonnet', 'haiku'];
    // safe: validModels.includes() confirms the string is a valid ModelType before assignment
    const parsedForceModel = (forceModel && validModels.includes(forceModel) ? forceModel : undefined) as ModelType | undefined;

    // Extract optional Effort: override (e.g., "Effort: max")
    const effortLine = lines.find(l => /^[\s-]*Effort:\s*/i.test(l.trim()));
    const forceEffort = effortLine
      ? effortLine.trim().replace(/^-\s+/, '').replace(/^Effort:\s*/i, '').trim().toLowerCase()
      : undefined;
    const validEfforts: string[] = ['low', 'normal', 'high'];
    // safe: validEfforts.includes() confirms the string is a valid TaskEffort before assignment
    const parsedForceEffort = (forceEffort && validEfforts.includes(forceEffort) ? forceEffort : undefined) as TaskEffort | undefined;

    tasks.push({ title, description: block.trim(), scope, testTarget, forceModel: parsedForceModel, forceEffort: parsedForceEffort });
  }
  return tasks;
}

/**
 * Convert a PlannerTask (from the AI planner) into CreateTaskParams for task creation.
 * Applies a model override and optional initial status.
 * @param pt - Planner task output from the AI planning step
 * @param sprintId - Current sprint identifier
 * @param modelOverride - Default model to use when planner task has no model
 * @param initialStatus - Optional initial task status (e.g., DRAFT)
 * @returns Parameters suitable for passing to createTask
 */
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

/**
 * Determine the worker effort level for a task based on its complexity score.
 * If the task has a forceEffort override, returns that directly.
 * Otherwise maps score ranges: >=6 -> max, >=1 -> high, >=-1 -> medium, else low.
 * @param task - The task to evaluate
 * @returns Effort level string for the worker prompt
 */
export function resolveWorkerEffort(task: Task): 'max' | 'high' | 'medium' | 'low' {
  // safe: forceEffort is TaskEffort ('low'|'normal'|'high') — subset of the return union type
  if (task.forceEffort) return task.forceEffort as 'max' | 'high' | 'medium' | 'low';
  const score = calculateModelScore(task.title, task.description, task.scope);
  if (score >= 6) return 'max';
  if (score >= 1) return 'high';
  if (score >= -1) return 'medium';
  return 'low';
}

/**
 * Build the full prompt string that will be sent to a worker agent.
 * Includes agent context block (if assigned), skill context block (if skills assigned),
 * task details, scope instructions, heartbeat format, and result file format.
 * @param task - The task the worker will execute
 * @param agentPrompt - Optional specialized agent prompt to prepend
 * @param skillPrompts - Optional skill context blocks to include
 * @returns Complete worker prompt string
 */
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
    const header = '=== Skills ===';
    const parts: string[] = [header];
    let totalLen = header.length;
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
