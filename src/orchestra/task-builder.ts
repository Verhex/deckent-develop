// ─── Task Creation & Directive Parsing ─────────────────────────────
// Extracted from brain.ts — task construction, scope extraction, directive parsing
import { z } from 'zod';
import type {
  Task, TaskScope, GoNoGoCriteria, ModelType, TaskEffort, TaskPriority,
  PlannerTask, ProviderName,
} from '../core/types.js';
import { TaskStatus, ALL_MODELS, PROVIDER_MODEL_MAP } from '../core/types.js';
import type { TaskDNA } from '../core/routing-types.js';
import { calculateModelScore } from './model-selector.js';
import { debugLog } from '../core/utils.js';
import { filterSkillPromptsByDNA } from './prompt-token-optimizer.js';

// ─── Model enum values for Zod schemas ───────────────────────────────────
// ALL_MODELS is readonly ModelType[] — extract as tuple for z.enum()
const MODEL_ENUM_VALUES = ALL_MODELS as unknown as [string, ...string[]];

// ─── Provider enum values for Zod schemas ────────────────────────────────
const PROVIDER_NAMES = Object.keys(PROVIDER_MODEL_MAP) as [string, ...string[]];

// ═══ Zod Schemas ═══════════════════════════════════════════════════

/** Zod schema for a single directive task section */
export const DirectiveTaskSchema = z.object({
  title: z.string().min(1, 'Task title must not be empty'),
  model: z.enum(MODEL_ENUM_VALUES).optional(),
  effort: z.enum(['low', 'normal', 'high']).optional(),
  provider: z.enum(PROVIDER_NAMES).optional(),
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
  provider?: ProviderName;
  forceModel?: ModelType;
  forceEffort?: TaskEffort;
  forceAgent?: string;
  forceSkills?: string[];
  excludeAgent?: string[];
  excludeSkills?: string[];
}

export interface ParsedDirectiveTask {
  title: string;
  description: string;
  scope: TaskScope;
  testTarget?: string;
  provider?: ProviderName;
  forceModel?: ModelType;
  forceEffort?: TaskEffort;
  forceAgent?: string;
  forceSkills?: string[];
  excludeAgent?: string[];
  excludeSkills?: string[];
}

// ═══ Functions ════════════════════════════════════════════════════

/**
 * Parse a Skills: directive line into force/exclude lists.
 * Supports: "Skills: typescript-expert, -ci-testing, testing-expert"
 * - prefix means exclude, no prefix means include (force).
 * "Skills: none" → forceSkills=[], excludeSkills=[] (explicitly no skills)
 * "Skills: auto" → undefined (let auto-selection run)
 */
export function parseSkillsDirective(line: string | undefined): {
  forceSkills: string[] | undefined;
  excludeSkills: string[] | undefined;
} {
  if (!line) return { forceSkills: undefined, excludeSkills: undefined };

  const value = line.replace(/.*Skills:\s*/i, '').trim();
  if (!value) return { forceSkills: undefined, excludeSkills: undefined };

  const lower = value.toLowerCase();
  if (lower === 'none') return { forceSkills: [], excludeSkills: undefined };
  if (lower === 'auto') return { forceSkills: undefined, excludeSkills: undefined };

  const parts = value.split(',').map(s => s.trim()).filter(Boolean);
  const include: string[] = [];
  const exclude: string[] = [];

  for (const part of parts) {
    if (part.startsWith('-')) {
      exclude.push(part.slice(1).trim());
    } else if (part.toLowerCase() !== 'auto') {
      include.push(part);
    }
  }

  return {
    forceSkills: include.length > 0 ? include : undefined,
    excludeSkills: exclude.length > 0 ? exclude : undefined,
  };
}

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

  // Validate model-provider compatibility when both are specified
  let provider = params.provider;
  if (provider && params.model) {
    const allowedModels = PROVIDER_MODEL_MAP[provider];
    if (!allowedModels || !(allowedModels as readonly string[]).includes(params.model)) {
      // Log warning but keep provider as-is — task 6's model equivalence will handle later
      debugLog(
        'createTask:model-provider-mismatch',
        new Error(
          `Model "${params.model}" is not compatible with provider "${provider}". ` +
          `Allowed models for ${provider}: ${(allowedModels ?? []).join(', ')}`,
        ),
      );
    }
  }

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
    provider,
    forceModel: params.forceModel,
    forceEffort: params.forceEffort,
    forceAgent: params.forceAgent,
    forceSkills: params.forceSkills,
    excludeAgent: params.excludeAgent,
    excludeSkills: params.excludeSkills,
    assignedAgent: params.forceAgent ?? 'generic',
    assignedSkills: params.forceSkills ?? [],
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

  // Match directory-like paths: src/, tests/, docs/, .deckent/, .brain/, .contracts/, .claude/, scripts/
  const dirMatches = line.match(/\b(src\/[\w/.-]*|tests\/[\w/.-]*|docs\/[\w/.-]*|\.deckent\/[\w/.-]*|\.brain\/[\w/.-]*|\.contracts\/[\w/.-]*|\.claude\/[\w/.-]*|scripts\/[\w/.-]*)\//g);
  if (dirMatches) {
    for (const d of dirMatches) {
      if (!directories.includes(d)) directories.push(d);
    }
  }

  // Match standalone doc/config references: any root-level .md, .json, .gitignore, etc.
  const docFileMatches = line.match(/\b(docs\/[\w/.-]+\.(?:md|ts|js)|(?:[\w-]+)\.md)\b/g);
  if (docFileMatches) {
    for (const f of docFileMatches) {
      if (!f.startsWith('docs/') && !directories.some(d => d.startsWith('docs/'))) {
        directories.push('docs/');
      }
      if (!filesWrite.includes(f)) filesWrite.push(f);
    }
  }

  // Match dotfile paths: .deckent/..., .brain/..., .contracts/...
  const dotFileMatches = line.match(/\b(\.deckent\/[\w/.-]+\.(?:json|md|ts|js)|\.brain\/[\w/.-]+\.(?:json|md)|\.contracts\/[\w/.-]+\.(?:md|json)|\.claude\/[\w/.-]+\.(?:json|md))\b/g);
  if (dotFileMatches) {
    for (const f of dotFileMatches) {
      if (!filesWrite.includes(f)) filesWrite.push(f);
    }
  }

  // Match root-level config files: .gitignore, .npmignore, tsconfig.json, package.json, etc.
  const rootConfigMatches = line.match(/\b(\.gitignore|\.npmignore|tsconfig\.json|package\.json|vitest\.config\.ts)\b/g);
  if (rootConfigMatches) {
    for (const f of rootConfigMatches) {
      if (!filesWrite.includes(f)) filesWrite.push(f);
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
 * Enrich a task scope by adding test file patterns to filesWrite
 * when tests/ is present in directories but no test files are in filesWrite.
 * Also ensures docs/ directory is included when doc files are in filesWrite.
 */
export function enrichScopeWithTestFiles(scope: TaskScope, filesWriteSource: string[]): TaskScope {
  const directories = [...scope.directories];
  const filesWrite = [...scope.filesWrite];

  // A) If tests/ is in directories but no test files in filesWrite, add test patterns
  const hasTestDir = directories.some(d => d.startsWith('tests/'));
  const hasTestFiles = filesWrite.some(f => f.startsWith('tests/') || f.includes('.test.'));
  if (hasTestDir && !hasTestFiles) {
    // Derive test file patterns from source filesWrite entries
    for (const f of filesWriteSource) {
      if (f.startsWith('src/') && f.endsWith('.ts')) {
        const testPath = f.replace(/^src\//, 'tests/').replace(/\.ts$/, '.test.ts');
        if (!filesWrite.includes(testPath)) filesWrite.push(testPath);
      }
    }
  }

  return { directories, filesRead: scope.filesRead, filesWrite };
}

/**
 * Parse a DIRECTIVES.md document into structured task definitions.
 * Splits on "## Task N:" or "## Gorev N:" headings and extracts title, scope,
 * test targets, and optional Model/Effort overrides from each section.
 * Falls back to bullet/numbered list parsing if no heading-based sections found.
 * @param content - Raw DIRECTIVES.md content
 * @returns Array of parsed directive tasks; empty if no structured sections found
 */
export function parseStructuredDirectives(content: string): ParsedDirectiveTask[] {
  // Split on "## Görev N:" / "## Gorev N:" / "## Task N:" pattern
  const blockSplit = content.split(/^##\s+(?:G[öo]rev|Task)\s+\d+[^:]*:/m);
  const blocks = blockSplit.slice(1); // skip content before first heading

  if (blocks.length === 0) {
    // Fallback: try bullet list or numbered list format
    return parseBulletOrNumberedTasks(content);
  }

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
    // safe: ALL_MODELS.includes() confirms the string is a valid ModelType before assignment
    const parsedForceModel = (forceModel && (ALL_MODELS as readonly string[]).includes(forceModel) ? forceModel : undefined) as ModelType | undefined;

    // Extract optional Effort: override (e.g., "Effort: max")
    const effortLine = lines.find(l => /^[\s-]*Effort:\s*/i.test(l.trim()));
    const forceEffort = effortLine
      ? effortLine.trim().replace(/^-\s+/, '').replace(/^Effort:\s*/i, '').trim().toLowerCase()
      : undefined;
    const validEfforts: string[] = ['low', 'normal', 'high'];
    // safe: validEfforts.includes() confirms the string is a valid TaskEffort before assignment
    const parsedForceEffort = (forceEffort && validEfforts.includes(forceEffort) ? forceEffort : undefined) as TaskEffort | undefined;

    // Extract optional Provider: override (e.g., "Provider: codex")
    const providerLine = lines.find(l => /^[\s-]*Provider:\s*/i.test(l.trim()));
    const rawProvider = providerLine
      ? providerLine.trim().replace(/^-\s+/, '').replace(/^Provider:\s*/i, '').trim().toLowerCase()
      : undefined;
    const validProviders = Object.keys(PROVIDER_MODEL_MAP);
    // safe: validProviders.includes() confirms the string is a valid ProviderName before assignment
    const parsedProvider = (rawProvider && validProviders.includes(rawProvider) ? rawProvider : undefined) as ProviderName | undefined;

    // Extract optional Agent: override (e.g., "Agent: security-auditor" or "Agent: none")
    const agentLine = lines.find(l => /^[\s-]*Agent:\s*/i.test(l.trim()));
    const rawAgent = agentLine
      ? agentLine.trim().replace(/^-\s+/, '').replace(/^Agent:\s*/i, '').trim()
      : undefined;
    const forceAgent = rawAgent
      ? (rawAgent.toLowerCase() === 'none' ? 'generic' : rawAgent.toLowerCase() === 'auto' ? undefined : rawAgent)
      : undefined;

    // Extract optional Skills: override (e.g., "Skills: typescript-expert, -ci-testing")
    const skillsLine = lines.find(l => /^[\s-]*Skills:\s*/i.test(l.trim()));
    const { forceSkills, excludeSkills } = parseSkillsDirective(skillsLine);

    const enrichedScope = enrichScopeWithTestFiles(scope, scope.filesWrite);
    tasks.push({ title, description: block.trim(), scope: enrichedScope, testTarget, provider: parsedProvider, forceModel: parsedForceModel, forceEffort: parsedForceEffort, forceAgent, forceSkills, excludeSkills });
  }
  return tasks;
}

/**
 * Parse bullet list or numbered list task format as fallback.
 * Supports formats:
 *   - "- Task: My task title"
 *   - "* Task: My task title"
 *   - "1. My task title"
 *   - "1) My task title"
 * Extracts Model/Effort/Provider overrides from indented sub-lines.
 * @param content - Raw directive content
 * @returns Array of parsed directive tasks
 */
export function parseBulletOrNumberedTasks(content: string): ParsedDirectiveTask[] {
  const tasks: ParsedDirectiveTask[] = [];
  const lines = content.split('\n');

  // Match "- Task: <title>", "* Task: <title>", "1. <title>", or "1) <title>"
  const taskLineRegex = /^(?:[-*]\s+Task:\s*|[-*]\s+\d+[.)]\s*|\d+[.)]\s+)(.+)/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const match = taskLineRegex.exec(line);
    if (match) {
      const title = match[1]!.trim();
      if (title.length >= 3) {
        // Collect indented sub-lines for model/effort/scope hints
        const subLines: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const subLine = lines[j]!;
          // Continue collecting if indented or starts with special chars
          if (/^\s+/.test(subLine) || /^[\s]*[-*]\s+(?:Model|Effort|Provider|Scope|Files|Test):/.test(subLine)) {
            subLines.push(subLine);
            j++;
          } else {
            break;
          }
        }

        const allLines = [line, ...subLines];

        // Extract scope from all lines
        const scopeLines = allLines.filter(l =>
          l.includes('Dosya:') || l.includes('Kapsam:') || l.includes('Scope:') || l.includes('Files:') ||
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

        // Extract Model override
        const modelLine = allLines.find(l => /Model:\s*/i.test(l));
        const rawModel = modelLine ? modelLine.replace(/.*Model:\s*/i, '').trim().toLowerCase() : undefined;
        const parsedForceModel = (rawModel && (ALL_MODELS as readonly string[]).includes(rawModel) ? rawModel : undefined) as ModelType | undefined;

        // Extract Effort override
        const effortLine = allLines.find(l => /Effort:\s*/i.test(l));
        const rawEffort = effortLine ? effortLine.replace(/.*Effort:\s*/i, '').trim().toLowerCase() : undefined;
        const validEfforts = ['low', 'normal', 'high'];
        const parsedForceEffort = (rawEffort && validEfforts.includes(rawEffort) ? rawEffort : undefined) as TaskEffort | undefined;

        // Extract Provider override
        const providerLine = allLines.find(l => /Provider:\s*/i.test(l));
        const rawProvider = providerLine ? providerLine.replace(/.*Provider:\s*/i, '').trim().toLowerCase() : undefined;
        const validProviders = Object.keys(PROVIDER_MODEL_MAP);
        const parsedProvider = (rawProvider && validProviders.includes(rawProvider) ? rawProvider : undefined) as ProviderName | undefined;

        // Extract test target
        const testLine = allLines.find(l => /Test:\s*/i.test(l));
        const testTarget = testLine ? testLine.replace(/.*Test:\s*/i, '').trim() : undefined;

        // Extract Agent override
        const agentLineBullet = allLines.find(l => /Agent:\s*/i.test(l));
        const rawAgentBullet = agentLineBullet ? agentLineBullet.replace(/.*Agent:\s*/i, '').trim() : undefined;
        const forceAgentBullet = rawAgentBullet
          ? (rawAgentBullet.toLowerCase() === 'none' ? 'generic' : rawAgentBullet.toLowerCase() === 'auto' ? undefined : rawAgentBullet)
          : undefined;

        // Extract Skills override
        const skillsLineBullet = allLines.find(l => /Skills:\s*/i.test(l));
        const { forceSkills: forceSkillsBullet, excludeSkills: excludeSkillsBullet } = parseSkillsDirective(skillsLineBullet);

        const enrichedScope = enrichScopeWithTestFiles(scope, scope.filesWrite);
        tasks.push({
          title,
          description: allLines.join('\n').trim(),
          scope: enrichedScope,
          testTarget,
          provider: parsedProvider,
          forceModel: parsedForceModel,
          forceEffort: parsedForceEffort,
          forceAgent: forceAgentBullet,
          forceSkills: forceSkillsBullet,
          excludeSkills: excludeSkillsBullet,
        });

        i = j;
        continue;
      }
    }
    i++;
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
    scope: enrichScopeWithTestFiles(pt.scope, pt.scope.filesWrite),
    dependencies: pt.dependencies,
    goNogo: pt.goNogo,
    sprintId,
    initialStatus,
    forceAgent: pt.forceAgent,
    forceSkills: pt.forceSkills,
    excludeAgent: pt.excludeAgent,
    excludeSkills: pt.excludeSkills,
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
 * Truncate content at a paragraph or section boundary instead of mid-sentence.
 * Looks for the last double-newline, heading, or sentence-ending punctuation before maxLen.
 */
export function truncateAtParagraph(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;

  const slice = content.slice(0, maxLen);

  // Try to find last paragraph break (double newline)
  const lastParagraph = slice.lastIndexOf('\n\n');
  if (lastParagraph > maxLen * 0.5) return slice.slice(0, lastParagraph).trimEnd();

  // Try last heading boundary (markdown heading)
  const lastHeading = slice.lastIndexOf('\n#');
  if (lastHeading > maxLen * 0.5) return slice.slice(0, lastHeading).trimEnd();

  // Try last single newline (line boundary)
  const lastNewline = slice.lastIndexOf('\n');
  if (lastNewline > maxLen * 0.7) return slice.slice(0, lastNewline).trimEnd();

  // Fallback: cut at last sentence-ending punctuation
  const lastSentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('.\n'),
  );
  if (lastSentence > maxLen * 0.5) return slice.slice(0, lastSentence + 1).trimEnd();

  return slice;
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
  const effort = resolveWorkerEffort(task);

  // Agent context block: prepended when a specialized agent is assigned
  const agentBlock = agentPrompt
    ? `=== Agent: ${task.assignedAgent ?? 'generic'} ===\n${agentPrompt.slice(0, 2000)}\n\n=== Task ===\n`
    : '';

  // Skill context block: appended after agent block when skills are assigned
  // Dynamic budget based on task effort: high→2000, normal→1500, low→1000 per skill
  const effortBudgetMap: Record<string, number> = { high: 2000, max: 2000, medium: 1500, normal: 1500, low: 1000 };
  const SKILL_PER_ITEM_MAX = effortBudgetMap[effort] ?? 1500;
  const SKILL_SECTION_MAX = Math.round(SKILL_PER_ITEM_MAX * 2.67);

  // V2 routing: filter skill prompts to only those relevant to task intent
  const isV2 = task.routingMeta?.routingVersion === 'v2';
  const rawDNA = task.routingMeta?.taskDNA;
  let effectiveSkillPrompts = skillPrompts;
  if (isV2 && rawDNA && skillPrompts && skillPrompts.length > 1) {
    effectiveSkillPrompts = filterSkillPromptsByDNA(skillPrompts, rawDNA as TaskDNA);
  }

  let skillBlock = '';
  if (effectiveSkillPrompts && effectiveSkillPrompts.length > 0) {
    const header = '=== Skills ===';
    const parts: string[] = [header];
    let totalLen = header.length;
    for (const sp of effectiveSkillPrompts) {
      const truncated = truncateAtParagraph(sp.content, SKILL_PER_ITEM_MAX);
      const entry = `--- ${sp.name} ---\n${truncated}`;
      if (totalLen + entry.length + 1 > SKILL_SECTION_MAX) break;
      parts.push(entry);
      totalLen += entry.length + 1;
    }
    if (parts.length > 1) {
      skillBlock = parts.join('\n') + '\n\n';
    }
  }

  // ─── Scope Rules ───────────────────────────────────────────────────
  const scopeDirs = task.scope.directories.length > 0
    ? task.scope.directories.map(d => `  - ${d}`).join('\n')
    : '  - (no directory restriction)';
  const scopeFiles = task.scope.filesWrite.length > 0
    ? task.scope.filesWrite.map(f => `  - ${f}`).join('\n')
    : '  - (determined by your task scope)';

  return `${agentBlock}${skillBlock}You are a Deckent worker agent.
See .deckent/workspace/WORKER-GUIDE.md for heartbeat format, result format, and error handling rules.

## Your Task
${task.id}: ${task.title} — ${task.description}
- Model: ${task.model}
- Effort: ${effort}

## What To Do
1. Read the task scope carefully — understand what files you may touch
2. Write the code changes described above
3. Verify: run \`tsc --noEmit\` — fix any errors (max 3 attempts)
4. Test: run \`npx vitest run\` — fix any failures (max 3 attempts)
5. Document: update relevant docs if your changes affect them
6. Report: write your result file to .tasks/task-${task.id}.result

## Scope Rules
You may ONLY modify files in these directories:
${scopeDirs}

You may ONLY write to these files:
${scopeFiles}

DO NOT touch files outside your scope — the auditor will flag violations.

## Heartbeat
Create .tasks/task-${task.id}.hb BEFORE starting work with workerId "w-${task.id}", status "EXECUTING".
Update periodically: increment sequence, refresh timestamp via new Date().toISOString() (UTC ISO 8601).

## Result File
Write to: .tasks/task-${task.id}.result with taskId, filesChanged, testsPassed, selfAssessment ("DONE"|"GO_WITH_TECH_DEBT"|"NO_GO"), notes.
The result file is REQUIRED — without it your work cannot be evaluated.`;
}
