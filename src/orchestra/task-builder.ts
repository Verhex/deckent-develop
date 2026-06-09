// ─── Task Creation & Directive Parsing ─────────────────────────────
// Extracted from brain.ts — task construction, scope extraction, directive parsing
import { z } from 'zod';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Task, TaskScope, GoNoGoCriteria, ModelType, TaskEffort, TaskPriority,
  PlannerTask, ProviderName, TaskResult,
} from '../core/types.js';
import { TaskStatus, ALL_MODELS, PROVIDER_MODEL_MAP } from '../core/types.js';
import { VALID_PROVIDERS_ALL } from '../core/config.js';
import { isAdapterProvider } from './sprint-utils.js';
import { detectTaskType } from './rubric-registry.js';
import { rubricTypeToKind } from '../core/work-model.js';
import { modelRegistry, ensureOllamaModelRegistered } from '../core/model-registry.js';
import type { TaskDNA } from '../core/routing-types.js';
import { calculateModelScore } from './model-selector.js';
import { debugLog } from '../core/utils.js';
import { filterSkillPromptsByDNA } from './prompt-token-optimizer.js';
import { MemoryStore } from '../core/memory-store.js';
import type { MemoryEntryV2 } from '../core/memory-types.js';
import { searchMemory } from '../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';
import { selectRelevantAdrs, buildAdrPromptSection } from './adr-selector.js';
import { buildTaskPrompt } from './prompt-god-template.js';
import type { SprintContext } from './prompt-god-template.js';
import { deriveTestScope } from './scope-deriver.js';
import type { AgentDefinition } from '../core/agent-types.js';
import { type AgentDomain, getAgentDomain } from '../core/agent-pool.js';

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
  authMode?: 'subscription' | 'api';
  /** Per-task spawn backend override (`- Backend: docker|host`), Sprint 252 PSL-1. */
  backend?: 'docker' | 'tmux' | 'subprocess';
  /** Per-task MODEL reasoning-effort (`- ModelEffort: <level>`), Sprint 252 F1-RE — distinct from work-size effort. */
  modelEffort?: string;
  fixMode?: 'verify-only' | 'amend' | 're-implement';
  /** Tier-1 Proof-of-Function smoke directive propagated from ParsedDirectiveTask (216-004). */
  smoke?: { command: string; expect: string };
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
  /** Task dependency IDs parsed from "- Dependencies: 134-005, 134-007" */
  dependencies?: string[];
  /** Task priority parsed from "- Priority: CRITICAL" (default: undefined → NORMAL) */
  priority?: TaskPriority;
  /** Per-task auth mode parsed from "- Auth: subscription|api" */
  authMode?: 'subscription' | 'api';
  /** Per-task spawn backend parsed from "- Backend: docker|host" (Sprint 252 PSL-1). */
  backend?: 'docker' | 'tmux' | 'subprocess';
  /** Per-task MODEL reasoning-effort (`- ModelEffort: <level>`), Sprint 252 F1-RE — distinct from work-size effort. */
  modelEffort?: string;
  /** Tier-1 Proof-of-Function smoke (216-004): real-binary command + expected output, split on `→`. */
  smoke?: { command: string; expect: string };
}

/**
 * Extract a Tier-1 `Smoke:` directive from a task block: `**Smoke:** <cmd> → <expect>`
 * or `- Smoke: <cmd> → <expect>`. Returns undefined when absent or missing the
 * `→` separator. Sprint 216-004; reconstructed Sprint 218 after a git reset.
 */
export function extractSmoke(text: string): { command: string; expect: string } | undefined {
  const m = text.match(/(?:[-*]\s*)?\*{0,2}Smoke:?\*{0,2}\s*(.+)/i);
  if (!m) return undefined;
  const rest = m[1]!.trim();
  const arrowIdx = rest.indexOf('→');
  if (arrowIdx === -1) return undefined;
  const command = rest.slice(0, arrowIdx).trim();
  const expect = rest.slice(arrowIdx + 1).trim();
  if (!command || !expect) return undefined;
  return { command, expect };
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

/**
 * Normalise a raw dependency value (the part after "Dependencies:") into an
 * array of task-ID strings.  Accepts three formats:
 *   - bare string:           "169-003"              → ["169-003"]
 *   - comma-separated list:  "169-003, 169-007"     → ["169-003", "169-007"]
 *   - JSON array literal:    '["169-003"]'          → ["169-003"]
 * Returns an empty array for empty / whitespace-only / "none" input.
 * Malformed JSON falls back to comma-split (never throws).
 */
export function parseDependencyField(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return (parsed as unknown[]).map(v => String(v).trim()).filter(Boolean);
      }
    } catch {
      // malformed JSON — fall through to comma-split
    }
  }

  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Parse a Dependencies: directive line into an array of dependency refs.
 *
 * Supports two ref styles in the array elements (Sprint 182 W2-2):
 *   - Plan-slot ID (back-compat):   "169-003", "134-005"
 *   - Title-prefix label (new):     "W1-1", "GATE-2", "PQ-3"
 *
 * Plan-slot IDs shift when Brain auto-prepends critical-debt fix tasks at
 * the head of the sprint (Sprint 176/178 drift bug) — title-prefix refs
 * survive that shift because they bind by the directive task's title, not
 * its allocation slot. Caller resolves each raw ref via `resolveDependencyRef`
 * after the full task list is built.
 *
 * Accepted line shapes (all delegated to `parseDependencyField`):
 *   - bare:           "Dependencies: 134-005"
 *   - comma list:     "- Dependencies: 134-005, 134-007"
 *   - JSON array:     '- Dependencies: ["W1-1", "W1-2"]'
 *
 * Returns undefined if there is no dependencies line or the value is empty.
 */
export function parseDependenciesDirective(line: string | undefined): string[] | undefined {
  if (!line) return undefined;

  const value = line.replace(/.*Dependencies:\s*/i, '').trim();
  if (!value) return undefined;

  const parts = parseDependencyField(value);
  return parts.length > 0 ? parts : undefined;
}

// Reserved prefixes / keywords that always resolve to themselves rather than
// being interpreted as title-prefix lookups (so `Dependencies: none` etc. are
// never accidentally treated as title fragments). Plan-slot IDs are detected
// by regex.
const DEPENDENCY_REF_RESERVED = new Set(['NONE', 'AUTO']);

const PLAN_SLOT_ID_RE = /^\d{1,4}-\d{1,4}$/;

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Test whether `title` contains `ref` as a standalone token.
 *
 * Standalone means: the ref appears at the start of `title`, at the end, or
 * surrounded by non-(word|dash) characters. This avoids the classic
 * substring trap where `"W1-1"` would otherwise match the title `"W1-10 …"`.
 * Comparison is case-insensitive so `Dependencies: ["w1-1"]` resolves the
 * same as `["W1-1"]`.
 */
function titleHasRefToken(title: string, ref: string): boolean {
  if (!title || !ref) return false;
  const re = new RegExp(`(?:^|[^\\w-])${escapeRegExp(ref)}(?=[^\\w-]|$)`, 'i');
  return re.test(title);
}

/**
 * Sprint 182 W2-2 — Resolve a single DIRECTIVES dependency ref to a concrete
 * `task.id`, surviving the auto-debt prepend offset drift (Sprint 176/178).
 *
 * Resolution order:
 *   1. Plan-slot ID (`NNN-NNN`) → exact `task.id` lookup. Returns the id
 *      when a task with that exact id exists, otherwise undefined. (Back-
 *      compat: legacy DIRECTIVES that hard-code slot IDs still work — but
 *      only when the slot is actually present after planning.)
 *   2. Title-prefix label (anything else) → case-insensitive token match
 *      against `task.title`. Returns the first matching task's id, or
 *      undefined when no title contains the ref as a standalone token.
 *
 * Why title-prefix is preferred: Brain prepends critical-debt fix tasks at
 * the head of the sprint, which shifts every subsequent plan-slot ID by N.
 * Hard-coded refs like `"178-002"` then silently point at the wrong disk
 * task. Title-prefix labels (`"W1-1"`) bind to the directive task itself,
 * so they remain correct even after debt-prepend.
 *
 * @param ref Raw dependency reference parsed from DIRECTIVES.
 * @param tasks All tasks already created for the sprint (debt + directive)
 *   — typically passed in after the planner finishes constructing the task
 *   list. Only `id` and `title` are read.
 */
export function resolveDependencyRef(
  ref: string,
  tasks: ReadonlyArray<{ id: string; title: string }>,
): string | undefined {
  if (typeof ref !== 'string') return undefined;
  const trimmed = ref.trim();
  if (!trimmed) return undefined;
  if (DEPENDENCY_REF_RESERVED.has(trimmed.toUpperCase())) return undefined;

  if (PLAN_SLOT_ID_RE.test(trimmed)) {
    const exact = tasks.find(t => t.id === trimmed);
    return exact?.id;
  }

  const titleMatch = tasks.find(t => titleHasRefToken(t.title, trimmed));
  return titleMatch?.id;
}

/**
 * Sprint 182 W2-2 — Batch-resolve dependency refs into concrete task IDs.
 *
 * Convenience wrapper around `resolveDependencyRef`:
 *   - preserves the input order
 *   - drops refs that fail to resolve (caller can compare lengths to detect
 *     missing references and emit a warning if needed)
 *   - de-duplicates the output (a dependency listed twice resolves to one id)
 */
export function resolveTaskDependencies(
  refs: ReadonlyArray<string>,
  tasks: ReadonlyArray<{ id: string; title: string }>,
): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const ref of refs) {
    const id = resolveDependencyRef(ref, tasks);
    if (id && !seen.has(id)) {
      seen.add(id);
      resolved.push(id);
    }
  }
  return resolved;
}

const VALID_PRIORITIES: readonly string[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

/**
 * Parse a Priority: directive line into a TaskPriority value.
 * Supports: "- Priority: CRITICAL", "Priority: HIGH", etc.
 * Returns undefined if no priority line or invalid value (caller defaults to "NORMAL").
 */
export function parsePriorityDirective(line: string | undefined): TaskPriority | undefined {
  if (!line) return undefined;

  const value = line.replace(/.*Priority:\s*/i, '').trim().toUpperCase();
  if (!value) return undefined;

  return VALID_PRIORITIES.includes(value) ? value as TaskPriority : undefined;
}

/**
 * Parse the "- Auth: subscription|api" directive line.
 * Returns undefined for unrecognized values (caller falls back to config `auth_mode`).
 * Per-task `api` opts the worker container out of `~/.claude` session mount and
 * REQUIRES `ANTHROPIC_API_KEY` in the env (enforced in spawn-backend-docker).
 */
export function parseAuthModeDirective(line: string | undefined): 'subscription' | 'api' | undefined {
  if (!line) return undefined;
  const value = line.replace(/.*Auth:\s*/i, '').trim().toLowerCase();
  if (value === 'api') return 'api';
  if (value === 'subscription') return 'subscription';
  return undefined;
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
export function createTask(params: CreateTaskParams, sequence: number): Task & { smoke?: { command: string; expect: string } } {
  const sprintNumber = params.sprintId.replace('sprint-', '');
  const id = `${sprintNumber}-${String(sequence).padStart(3, '0')}`;

  // Sprint 236: register locally-pulled Ollama tags on-demand BEFORE any
  // registry lookup (tier/provider/apiId during routing) so a `- Model: <tag>`
  // not in the static catalog doesn't throw "Unknown model". Adapter-providers
  // only — cloud models keep throwing on genuinely-unknown ids.
  if (params.provider && isAdapterProvider(params.provider)) {
    for (const m of [params.forceModel, params.model]) {
      if (m && !modelRegistry.has(m)) ensureOllamaModelRegistered(m);
    }
  }

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

  // Sprint 196 WP-3: Derive test scope for audit trail (scopeDerivation).
  // Actual scope.filesWrite enrichment happens in enrichScopeWithTestFiles at parse-time.
  const scopeDerived = deriveTestScope(params.scope.filesWrite ?? []);
  const scopeDerivation = scopeDerived.extraFiles.length > 0
    ? { extraFiles: scopeDerived.extraFiles, extraDirs: scopeDerived.extraDirs, reason: 'test-mirror' as const }
    : undefined;

  // WM-2b: derive canonical TaskKind from scope-shape so new tasks carry task.type
  // (canonical SSOT). detectTaskType uses scope only — a minimal scope-only object suffices.
  const canonicalKind = rubricTypeToKind(detectTaskType({ scope: params.scope } as Task));

  // Sprint 260 BOUNDARY-TEST-PATTERN: auto-add mirrored tests/ dirs for code-development tasks
  // so workers adding a test alongside their fix stay in-scope without a BOUNDARY_VIOLATION.
  const normalizedScope = mirrorTestScope(params.scope, canonicalKind);

  return {
    id,
    title: params.title,
    description: params.description,
    model: params.model,
    effort: params.effort,
    priority: params.priority,
    reason: params.reason,
    scope: normalizedScope,
    dependencies: params.dependencies,
    goNogo: params.goNogo,
    status: params.initialStatus ?? TaskStatus.PENDING,
    type: canonicalKind,
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
    authMode: params.authMode,
    backend: params.backend,
    modelEffort: params.modelEffort,
    fixMode: params.fixMode,
    assignedAgent: params.forceAgent ?? 'generic',
    assignedSkills: params.forceSkills ?? [],
    createdAt: now(),
    routingMeta: scopeDerivation !== undefined ? { scopeDerivation } : undefined,
    smoke: params.smoke,
  };
}

// ─── Bug Y2: Plan-time Ground-Truth Claim Validation (Sprint 166) ─────
//
// Catches stale numeric claims in directive task descriptions (e.g. "16 agents")
// before they ever reach the worker prompt. Mirrors the runtime check in
// auditor.ts:verifyDocSyncGroundTruth — same regex, same override file.

export interface GroundTruthClaimIssue {
  metric: string;
  claimed: number;
  measured: number;
  raw: string;
}

interface GroundTruthOverrideEntry {
  metric: string;
  expected: number;
  approvedBy: string;
  until_sprint: number;
  reason: string;
}

const AGENTS_CLAIM_RE = /\b(\d{1,3})\s+(?:built-?in\s+)?agents?\b/gi;

function measureAgentsCountFs(projectRoot: string): number {
  const agentsDir = join(projectRoot, 'src/core/builtins/agents');
  if (!existsSync(agentsDir)) return -1;
  try {
    return readdirSync(agentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .length;
  } catch {
    return -1;
  }
}

function loadGroundTruthOverridesFs(projectRoot: string): GroundTruthOverrideEntry[] {
  const path = join(projectRoot, '.deckent', 'ground-truth-overrides.json');
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as { overrides?: GroundTruthOverrideEntry[] };
    if (!parsed?.overrides || !Array.isArray(parsed.overrides)) return [];
    return parsed.overrides;
  } catch {
    return [];
  }
}

function sprintNumberOf(sprintId: string | undefined | null): number {
  if (!sprintId) return Number.NaN;
  const m = /sprint-(\d+)/i.exec(sprintId);
  if (!m || !m[1]) return Number.NaN;
  return Number.parseInt(m[1], 10);
}

/**
 * Validate doc-sync ground-truth claims in a directive task description at plan-time.
 * Returns the list of mismatches (empty when all claims agree with filesystem
 * reality or are covered by an active whitelist override).
 */
export function validateGroundTruthClaims(
  projectRoot: string,
  description: string,
  currentSprintId: string,
): GroundTruthClaimIssue[] {
  if (!description) return [];
  const agentsMeasured = measureAgentsCountFs(projectRoot);
  if (agentsMeasured < 0) return [];
  const overrides = loadGroundTruthOverridesFs(projectRoot);
  const currentSprint = sprintNumberOf(currentSprintId);

  const issues: GroundTruthClaimIssue[] = [];
  let m: RegExpExecArray | null;
  AGENTS_CLAIM_RE.lastIndex = 0;
  while ((m = AGENTS_CLAIM_RE.exec(description)) !== null) {
    const numStr = m[1];
    if (!numStr) continue;
    const claimed = Number.parseInt(numStr, 10);
    if (!Number.isFinite(claimed)) continue;
    if (claimed === agentsMeasured) continue;
    const overrideActive = overrides.some((o) => {
      if (o.metric !== 'agents_count') return false;
      if (o.expected !== claimed) return false;
      if (Number.isNaN(currentSprint)) return true;
      return currentSprint < o.until_sprint;
    });
    if (overrideActive) continue;
    issues.push({
      metric: 'agents_count',
      claimed,
      measured: agentsMeasured,
      raw: m[0],
    });
  }
  return issues;
}

// ─── Sprint 168 C0c RC1 — Scope filesWrite Validation ──────────────
//
// Sprint 167 cascade root layer (Bug Z2): DIRECTIVES "Files:" parser accepted
// bare extension tokens like ".ts", ".md" as scope.filesWrite entries — these
// match no real path and poison downstream spawn-time lock acquisition, scope
// enforcement, and worker auditing.
//
// Plan-time validator: reject bare tokens + basename-only paths. Callers may
// either throw on invalid OR consume sanitized[] to drop poisoned entries.

const BARE_TOKEN_BLOCKLIST = ['.ts', '.md', '.test', 'test.ts', '.json', '.txt'] as const;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized: string[];
}

/**
 * Sprint 168 C0c RC1 — validate scope.filesWrite entries for bare tokens.
 *
 * Rules:
 *   1. Reject entries in BARE_TOKEN_BLOCKLIST exactly (".ts", ".md", etc.)
 *   2. Reject entries without a path separator ('/' or '\\')
 *      — basename-only paths (e.g. "foo.ts", "README.md") are ambiguous and
 *        bypass scope enforcement.
 *   3. Valid entries pass through into `sanitized`.
 *
 * @param filesWrite Array of file path strings from parsed DIRECTIVES.md
 * @returns ValidationResult — { valid, errors, sanitized }
 */
export function validateScopeFilesWrite(filesWrite: string[]): ValidationResult {
  const errors: string[] = [];
  const sanitized: string[] = [];
  for (const fp of filesWrite) {
    if ((BARE_TOKEN_BLOCKLIST as readonly string[]).includes(fp)) {
      errors.push(`Bare token detected: ${fp}`);
      continue;
    }
    if (!fp.includes('/') && !fp.includes('\\')) {
      errors.push(`Basename without path: ${fp}`);
      continue;
    }
    sanitized.push(fp);
  }
  return { valid: errors.length === 0, errors, sanitized };
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

  // BUG-25: Explicit Files:/Dosya: and Scope:/Kapsam: label parsing (highest priority)
  const filesLabelMatch = line.match(/(?:^|\n)\s*-?\s*(?:Files?|Dosya)\s*:\s*(.+)/im);
  if (filesLabelMatch?.[1]) {
    const files = filesLabelMatch[1].split(',').map(f => f.trim()).filter(Boolean);
    for (const f of files) {
      if (f.endsWith('/')) {
        if (!directories.includes(f)) directories.push(f);
      } else {
        if (!filesWrite.includes(f)) filesWrite.push(f);
      }
    }
  }

  const scopeLabelMatch = line.match(/(?:^|\n)\s*-?\s*(?:Scope|Kapsam)\s*:\s*(.+)/im);
  if (scopeLabelMatch?.[1]) {
    const scopes = scopeLabelMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const s of scopes) {
      const dir = s.endsWith('/') ? s : s + '/';
      // './' means project root — valid scope
      if (!directories.includes(dir)) directories.push(dir);
    }
  }

  // Match directory-like paths: src/, tests/, docs/, .deckent/, .brain/, .contracts/, .claude/, scripts/
  const dirMatches = line.match(/\b(src\/[\w/.-]*|tests\/[\w/.-]*|docs\/[\w/.-]*|\.deckent\/[\w/.-]*|\.brain\/[\w/.-]*|\.contracts\/[\w/.-]*|\.claude\/[\w/.-]*|scripts\/[\w/.-]*)\//g);
  if (dirMatches) {
    for (const d of dirMatches) {
      if (!directories.includes(d)) directories.push(d);
    }
  }

  // Match docs/ files (.md, .ts, .js) and standalone root-level .md files (README.md, DECKENT.md)
  const docFileMatches = line.match(/\b(docs\/[\w/.-]+\.(?:md|ts|js)|(?:[\w-]+)\.md)\b/g);
  if (docFileMatches) {
    for (const f of docFileMatches) {
      // Only add docs/ directory when the file is actually inside docs/
      // Standalone .md files (DECKENT.md, CONTRIBUTING.md) should NOT trigger docs/ directory
      if (f.startsWith('docs/') && !directories.some(d => d.startsWith('docs/'))) {
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

  // Match root-level config files: tsconfig.json, package.json, vitest.config.ts, etc.
  const rootConfigMatches = line.match(/\b(tsconfig\.json|package\.json|vitest\.config\.ts)\b/g);
  if (rootConfigMatches) {
    for (const f of rootConfigMatches) {
      if (!filesWrite.includes(f)) filesWrite.push(f);
    }
  }

  // Match standalone dotfiles at root: .gitignore, .npmignore, .env, .npmrc, etc.
  // \b cannot precede a leading dot, so use negative lookbehind instead.
  // Negative lookahead includes / to avoid matching directory prefixes (.deckent/, .brain/).
  const rootDotfileMatches = line.match(/(?<![/\w])(\.[\w-]+)(?![/\w])/g);
  if (rootDotfileMatches) {
    for (const f of rootDotfileMatches) {
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

  // Match standalone root-level files (no directory prefix): DECKENT.md, docker-compose.yml, tsconfig.yaml, etc.
  // Covers yaml/yml and other file types not matched by the blocks above.
  const standaloneMatches = line.match(/\b([\w.-]+\.(?:md|json|ts|js|yaml|yml))\b/g);
  if (standaloneMatches) {
    for (const f of standaloneMatches) {
      // Skip if already present or if a directory-prefixed version exists in filesWrite
      const alreadyCovered = filesWrite.some(existing => existing === f || existing.endsWith('/' + f));
      if (!alreadyCovered) filesWrite.push(f);
    }
  }

  // Sprint 168 C0c RC1 — drop bare extension tokens (".ts", ".md", etc.) that
  // slipped through the catch-all regex above. Basename-only entries are NOT
  // dropped here (back-compat: DECKENT.md / README.md still extracted).
  const sanitizedFilesWrite = filesWrite.filter(
    f => !(BARE_TOKEN_BLOCKLIST as readonly string[]).includes(f),
  );

  return { directories, filesRead: [], filesWrite: sanitizedFilesWrite };
}

/**
 * Auto-add mirrored tests/ directories for code-development tasks.
 * Prevents false BOUNDARY_VIOLATION when workers naturally add a test alongside their fix.
 * Only widens scope.directories — backward-safe for audit/doc tasks.
 */
export function mirrorTestScope(scope: TaskScope, kind: string): TaskScope {
  if (kind !== 'code-development') return scope;
  const extraDirs: string[] = [];
  for (const dir of scope.directories) {
    if (dir.startsWith('src/')) {
      const mirrored = 'tests/' + dir.slice('src/'.length);
      if (!scope.directories.includes(mirrored) && !extraDirs.includes(mirrored)) {
        extraDirs.push(mirrored);
      }
    }
  }
  if (extraDirs.length === 0) return scope;
  return { ...scope, directories: [...scope.directories, ...extraDirs] };
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
 * Mask fenced code blocks (```...```) in markdown content to prevent
 * code examples from being parsed as real file paths.
 * Replaces code block content with empty lines to preserve line structure.
 */
export function maskCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, (match) => {
    // Replace content with same number of newlines to preserve line count
    const newlineCount = (match.match(/\n/g) ?? []).length;
    return '\n'.repeat(newlineCount);
  });
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
  // Mask code blocks to prevent code examples from polluting scope extraction
  const maskedContent = maskCodeBlocks(content);

  // Split on "## Görev N:" / "## Gorev N:" / "## Task N:" pattern
  const blockSplit = content.split(/^##\s+(?:G[öo]rev|Task)\s+\d+[^:]*:/m);
  const maskedBlockSplit = maskedContent.split(/^##\s+(?:G[öo]rev|Task)\s+\d+[^:]*:/m);
  const blocks = blockSplit.slice(1); // skip content before first heading
  const maskedBlocks = maskedBlockSplit.slice(1);

  if (blocks.length === 0) {
    // Fallback: try bullet list or numbered list format
    return parseBulletOrNumberedTasks(content);
  }

  const tasks: ParsedDirectiveTask[] = [];
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx]!;
    const maskedBlock = maskedBlocks[blockIdx] ?? block;
    const lines = block.trim().split('\n');
    const maskedLines = maskedBlock.trim().split('\n');
    // First non-empty line after heading becomes the title (strip leading "- " prefix)
    const titleLine = lines.find(l => l.trim()) ?? '';
    const title = titleLine.trim().replace(/^-\s+/, '');
    if (!title) continue;

    // Collect only explicit scope directive lines. Prose may mention paths for
    // context, but write scope must come from Files:/Scope: directives.
    // Use maskedLines for filtering to avoid code block false positives
    // but use original lines for actual scope extraction (labels are outside code blocks)
    const scopeLines: string[] = [];
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li]!;
      const ml = maskedLines[li] ?? l;
      // Skip the title line — it may contain code snippets that look like paths
      if (l === titleLine) continue;
      // Use masked line for directive detection to skip code block content.
      if (/^\s*-?\s*(?:Dosya|Files?|Kapsam|Scope)\s*:/i.test(ml)) { scopeLines.push(l); continue; }
    }
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

    // Extract optional Provider: override (e.g., "Provider: codex", "Provider: ollama")
    // NOTE: Provider parse runs BEFORE Model parse — adapter-providers (e.g. ollama)
    // accept raw model tags (pass-through) that are not in the static ALL_MODELS list.
    const providerLine = lines.find(l => /^[\s-]*Provider:\s*/i.test(l.trim()));
    const rawProvider = providerLine
      ? providerLine.trim().replace(/^-\s+/, '').replace(/^Provider:\s*/i, '').trim().toLowerCase()
      : undefined;
    // VALID_PROVIDERS_ALL is the canonical extended source (includes 'ollama' alongside claude/codex/gemini).
    const parsedProvider = (rawProvider && VALID_PROVIDERS_ALL.includes(rawProvider) ? rawProvider : undefined) as ProviderName | undefined;

    // Extract optional Model: override (e.g., "Model: opus", "Model: qwen3.6:27b")
    const modelLine = lines.find(l => /^[\s-]*Model:\s*/i.test(l.trim()));
    const forceModel = modelLine
      ? modelLine.trim().replace(/^-\s+/, '').replace(/^Model:\s*/i, '').trim().toLowerCase()
      : undefined;
    // For adapter-providers (ollama → host-HTTP), accept raw model tag as pass-through;
    // OllamaAdapter validates dynamically via /api/tags at spawn (Sprint 234).
    // For typed providers (claude/codex/gemini), keep ALL_MODELS validation.
    const parsedForceModel = (forceModel
      ? (parsedProvider && isAdapterProvider(parsedProvider)
          ? forceModel
          : ((ALL_MODELS as readonly string[]).includes(forceModel) ? forceModel : undefined))
      : undefined) as ModelType | undefined;

    // Extract optional Effort: override (e.g., "Effort: max")
    const effortLine = lines.find(l => /^[\s-]*Effort:\s*/i.test(l.trim()));
    const forceEffort = effortLine
      ? effortLine.trim().replace(/^-\s+/, '').replace(/^Effort:\s*/i, '').trim().toLowerCase()
      : undefined;
    const validEfforts: string[] = ['low', 'normal', 'high'];
    // safe: validEfforts.includes() confirms the string is a valid TaskEffort before assignment
    const parsedForceEffort = (forceEffort && validEfforts.includes(forceEffort) ? forceEffort : undefined) as TaskEffort | undefined;

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

    // Extract optional Dependencies: line (e.g., "- Dependencies: 134-005, 134-007")
    const depsLine = lines.find(l => /^[\s-]*Dependencies:\s*/i.test(l.trim()));
    const dependencies = parseDependenciesDirective(depsLine);

    // Extract optional Priority: line (e.g., "- Priority: CRITICAL")
    const priorityLine = lines.find(l => /^[\s-]*Priority:\s*/i.test(l.trim()));
    const parsedPriority = parsePriorityDirective(priorityLine);

    // Extract optional Auth: line (e.g., "- Auth: api")
    const authLine = lines.find(l => /^[\s-]*Auth:\s*/i.test(l.trim()));
    const parsedAuthMode = parseAuthModeDirective(authLine);

    // Sprint 252 (PSL-1 verify): optional Backend: line (e.g., "- Backend: docker")
    const backendLine = lines.find(l => /^[\s-]*Backend:\s*/i.test(l.trim()));
    const backendVal = backendLine
      ?.trim().replace(/^-\s+/, '').replace(/^Backend:\s*/i, '').trim().toLowerCase();
    const parsedBackend: 'docker' | 'tmux' | 'subprocess' | undefined =
      backendVal === 'docker' || backendVal === 'tmux' || backendVal === 'subprocess'
        ? backendVal
        : undefined;

    // Sprint 252 (F1-RE): optional ModelEffort: line (e.g., "- ModelEffort: high").
    // Validated per-provider later (resolveReasoningEffort); parsed verbatim here.
    const modelEffortLine = lines.find(l => /^[\s-]*ModelEffort:\s*/i.test(l.trim()));
    const parsedModelEffort = modelEffortLine
      ? modelEffortLine.trim().replace(/^-\s+/, '').replace(/^ModelEffort:\s*/i, '').trim().toLowerCase() || undefined
      : undefined;

    // Sprint 182 PQ-4 (F6): description = content after `### Description` heading
    // when present. Falls back to the full block when no heading is found, so
    // legacy DIRECTIVES.md files keep their old description=block behavior.
    const descHeadingIdx = lines.findIndex(l => /^\s*###\s+Description\b/i.test(l));
    const description = descHeadingIdx >= 0
      ? lines.slice(descHeadingIdx + 1).join('\n').trim()
      : block.trim();

    const enrichedScope = enrichScopeWithTestFiles(scope, scope.filesWrite);
    tasks.push({ title, description, scope: enrichedScope, testTarget, provider: parsedProvider, forceModel: parsedForceModel, forceEffort: parsedForceEffort, forceAgent, forceSkills, excludeSkills, dependencies, priority: parsedPriority, authMode: parsedAuthMode, backend: parsedBackend, modelEffort: parsedModelEffort, smoke: extractSmoke(block) });
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
  const maskedContent = maskCodeBlocks(content);
  const lines = content.split('\n');
  const maskedLines = maskedContent.split('\n');

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
        // Collect masked versions of sub-lines for code block filtering
        const allMaskedLines = [maskedLines[i]!, ...subLines.map((_sl, si) => maskedLines[i + 1 + si] ?? _sl)];

        // Extract scope only from explicit directive lines. Prose may mention paths
        // for context, but write scope must come from Files:/Scope: directives.
        // Use masked lines for detection to skip code block content.
        const scopeLines: string[] = [];
        for (let ali = 0; ali < allLines.length; ali++) {
          const al = allLines[ali]!;
          const aml = allMaskedLines[ali] ?? al;
          if (/^\s*-?\s*(?:Dosya|Files?|Kapsam|Scope)\s*:/i.test(aml)) { scopeLines.push(al); continue; }
        }
        const scope = scopeLines.reduce<TaskScope>((acc, scopeLine) => {
          const extracted = extractScopeFromDirective(scopeLine);
          return {
            directories: [...acc.directories, ...extracted.directories.filter(d => !acc.directories.includes(d))],
            filesRead: [],
            filesWrite: [...acc.filesWrite, ...extracted.filesWrite.filter(f => !acc.filesWrite.includes(f))],
          };
        }, { directories: [], filesRead: [], filesWrite: [] });

        // Extract Provider override — Provider parse BEFORE Model parse so adapter-providers
        // (e.g. ollama) can pass-through raw model tags that are not in static ALL_MODELS.
        const providerLine = allLines.find(l => /Provider:\s*/i.test(l));
        const rawProvider = providerLine ? providerLine.replace(/.*Provider:\s*/i, '').trim().toLowerCase() : undefined;
        // VALID_PROVIDERS_ALL is the canonical extended source (includes 'ollama').
        const parsedProvider = (rawProvider && VALID_PROVIDERS_ALL.includes(rawProvider) ? rawProvider : undefined) as ProviderName | undefined;

        // Extract Model override — adapter-providers accept raw tag pass-through.
        const modelLine = allLines.find(l => /Model:\s*/i.test(l));
        const rawModel = modelLine ? modelLine.replace(/.*Model:\s*/i, '').trim().toLowerCase() : undefined;
        const parsedForceModel = (rawModel
          ? (parsedProvider && isAdapterProvider(parsedProvider)
              ? rawModel
              : ((ALL_MODELS as readonly string[]).includes(rawModel) ? rawModel : undefined))
          : undefined) as ModelType | undefined;

        // Extract Effort override
        const effortLine = allLines.find(l => /Effort:\s*/i.test(l));
        const rawEffort = effortLine ? effortLine.replace(/.*Effort:\s*/i, '').trim().toLowerCase() : undefined;
        const validEfforts = ['low', 'normal', 'high'];
        const parsedForceEffort = (rawEffort && validEfforts.includes(rawEffort) ? rawEffort : undefined) as TaskEffort | undefined;

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

        // Extract Dependencies override
        const depsLineBullet = allLines.find(l => /Dependencies:\s*/i.test(l));
        const dependenciesBullet = parseDependenciesDirective(depsLineBullet);

        // Extract Priority override
        const priorityLineBullet = allLines.find(l => /Priority:\s*/i.test(l));
        const parsedPriorityBullet = parsePriorityDirective(priorityLineBullet);

        // Extract Auth override
        const authLineBullet = allLines.find(l => /Auth:\s*/i.test(l));
        const parsedAuthModeBullet = parseAuthModeDirective(authLineBullet);

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
          dependencies: dependenciesBullet,
          priority: parsedPriorityBullet,
          authMode: parsedAuthModeBullet,
          smoke: extractSmoke(allLines.join('\n')),
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
  pt: PlannerTask & { smoke?: { command: string; expect: string } },
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
    smoke: pt.smoke,
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
  // Map work-size effort (TaskEffort 'low'|'normal'|'high') → the 4-level
  // worker-prompt scale. Sprint 252 (F1-RE audit): `'normal'` has NO 1:1 member
  // in {max,high,medium,low} — the old `as` cast leaked an invalid `'normal'`.
  // Map it to `'medium'`. (This is the work-size→prompt scale, NOT the model
  // reasoning-effort axis — see resolveReasoningEffort.)
  if (task.forceEffort) {
    return task.forceEffort === 'high' ? 'high' : task.forceEffort === 'low' ? 'low' : 'medium';
  }
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
 * Query relevant ADRs from Memory V2 DB for worker prompt injection.
 * Returns only accepted ADRs matching the task's scope and keywords.
 * Returns empty string if no DB available.
 */
export function queryRelevantADRs(taskDescription: string, taskScope: string[], projectRoot?: string, task?: Pick<Task, 'scope' | 'title' | 'description'>): string {
  const root = projectRoot ?? process.cwd();
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

  try {
    if (!existsSync(dbPath)) {
      return '';
    }

    const store = new MemoryStore(dbPath);
    try {
      // Load all accepted ADRs
      const allAdrs = store.getByType('adr').filter(a => a.status === 'accepted');

      if (allAdrs.length === 0) {
        return '';
      }

      // If a full Task-like object is provided, use the new scoring engine
      if (task) {
        const ranked = selectRelevantAdrs(task, allAdrs, 3);
        if (ranked.length === 0) return '';
        return buildAdrPromptSection(ranked, 'full', allAdrs);
      }

      // Fallback: construct a minimal task-like object from description + scope
      const pseudoTask = {
        title: taskDescription,
        description: taskDescription,
        scope: { directories: taskScope, filesRead: [] as string[], filesWrite: [] as string[] },
      };
      const ranked = selectRelevantAdrs(pseudoTask, allAdrs, 3);
      if (ranked.length === 0) {
        // Final fallback: FTS5 search (original behavior)
        const keywords = taskDescription.split(/\s+/).filter(w => w.length > 3).slice(0, 10);
        const scopeKeywords = taskScope.map(s => s.replace(/\//g, ' ')).join(' ');
        const queryText = [...keywords, ...scopeKeywords.split(/\s+/)].filter(w => w.length > 2).join(' ');

        const results = searchMemory(store, {
          text: queryText || undefined,
          type: ['adr'],
          status: ['accepted'],
          limit: 3,
        });

        if (results.length === 0) return '';
        return results.map(r => `## ${r.entry.id}: ${r.entry.title}\n\n${r.entry.content}`).join('\n\n---\n\n');
      }
      return buildAdrPromptSection(ranked, 'full', allAdrs);
    } finally {
      store.close();
    }
  } catch {
    return '';
  }
}

/**
 * Build the full prompt string sent to a worker agent.
 *
 * Provider-agnostic single source: the returned string is written verbatim to
 * the `.prompt` file and consumed identically by the tmux / subprocess / docker
 * backends across Claude, Codex and Gemini. Token estimation comes from the
 * rendered artifact's own accurate count (covers agent + skills + ADRs +
 * Karpathy + scope + deps + template), which downstream routing context-fit,
 * throttle and cost tracking read via `task.estimatedTokens`.
 *
 * @param task The task the worker will execute.
 * @param agentPrompt Optional agent PROMPT.md content.
 * @param skillPrompts Optional skill prompt blocks.
 * @returns The assembled worker prompt (also sets `task.estimatedTokens`).
 */
export function buildWorkerPrompt(
  task: Task,
  agentPrompt?: string,
  skillPrompts?: Array<{ name: string; content: string }>,
): string {
  const effort = resolveWorkerEffort(task);

  // V2 routing: filter skill prompts to only those relevant to task intent.
  const isV2 = task.routingMeta?.routingVersion === 'v2';
  const rawDNA = task.routingMeta?.taskDNA;
  let effectiveSkillPrompts = skillPrompts;
  if (isV2 && rawDNA && skillPrompts && skillPrompts.length > 1) {
    effectiveSkillPrompts = filterSkillPromptsByDNA(skillPrompts, rawDNA as TaskDNA);
  }

  // Load accepted ADRs from Memory V2 if available (best-effort) for the ADR block.
  let allAdrs: MemoryEntryV2[] | undefined;
  try {
    const root = process.cwd();
    const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
    if (existsSync(dbPath)) {
      const store = new MemoryStore(dbPath);
      try {
        allAdrs = store.getByType('adr').filter(a => a.status === 'accepted');
      } finally {
        store.close();
      }
    }
  } catch {
    // ADR loading is best-effort
  }

  const ctx: SprintContext = {
    agentPrompt,
    agentId: task.assignedAgent ?? 'generic',
    skillPrompts: effectiveSkillPrompts,
    allAdrs,
    effort,
    dependencies: task.dependencies,
  };
  const artifact = buildTaskPrompt(task, ctx);

  // Single accurate token estimate from the actual assembled prompt.
  task.estimatedTokens = artifact.metadata.estimatedTokens;

  return artifact.prompt;
}

// ─── Persona-Task Domain Matcher (WP-1) ────────────────────────────────────

/** Path-to-domain mapping rules, evaluated in order (first match wins per path). */
const DOMAIN_PATH_RULES: ReadonlyArray<{ prefix: string; domain: AgentDomain }> = [
  { prefix: 'src/cli/', domain: 'cli' },
  { prefix: 'src/api/', domain: 'react' },
  { prefix: 'src/dashboard/', domain: 'react' },
  { prefix: 'src/core/', domain: 'system' },
  { prefix: 'src/orchestra/', domain: 'system' },
  { prefix: 'src/providers/', domain: 'system' },
  { prefix: 'src/agents/', domain: 'system' },
  { prefix: 'src/mcp/', domain: 'system' },
  { prefix: 'src/nervous/', domain: 'system' },
  { prefix: 'src/monitor/', domain: 'system' },
  { prefix: 'src/connectors/', domain: 'system' },
  { prefix: 'tests/', domain: 'test' },
  { prefix: 'docs/', domain: 'doc' },
  { prefix: '.deckent/', domain: 'devops' },
  { prefix: 'scripts/', domain: 'devops' },
];

/**
 * Infer the set of task domains from scope paths.
 * Returns unique domains found; empty array means ambiguous/unknown.
 */
export function inferTaskDomains(filesWrite: string[], directories: string[]): AgentDomain[] {
  const domains = new Set<AgentDomain>();
  const paths = [...filesWrite, ...directories];
  for (const p of paths) {
    const normalized = p.replace(/^\/workspace\//, '').replace(/^\.\//, '');
    for (const rule of DOMAIN_PATH_RULES) {
      if (normalized.startsWith(rule.prefix) || normalized === rule.prefix.replace(/\/$/, '')) {
        domains.add(rule.domain);
        break;
      }
    }
    // md files → doc
    if (normalized.endsWith('.md') || normalized.endsWith('.mdx')) {
      domains.add('doc');
    }
  }
  return Array.from(domains);
}

export interface PersonaMatchResult {
  valid: boolean;
  severity?: 'HIGH' | 'LOW';
  mismatch?: string[];
  suggestedAgent?: string;
}

/**
 * Validate that an agent's domain matches the task's inferred domain.
 * - Generic agents (no domain) always pass (backward compat).
 * - Multi-domain tasks are ambiguous → no override, valid=true.
 * - Single-domain task + domain-specific agent: check alignment.
 */
export function validatePersonaTaskMatch(
  agent: AgentDefinition,
  task: Pick<Task, 'scope'>,
): PersonaMatchResult {
  const agentDomain = getAgentDomain(agent);

  // Generic agent → no mismatch (legacy behavior)
  if (agentDomain === 'generic') {
    return { valid: true };
  }

  const taskDomains = inferTaskDomains(
    task.scope.filesWrite ?? [],
    task.scope.directories ?? [],
  );

  // No recognizable domain in task → treat as ambiguous, no override
  if (taskDomains.length === 0) {
    return { valid: true };
  }

  // Multi-domain task → ambiguous, no override
  if (taskDomains.length > 1) {
    return { valid: true };
  }

  const taskDomain = taskDomains[0]!;

  // Domain match
  if (agentDomain === taskDomain) {
    return { valid: true };
  }

  // Domain mismatch — determine severity
  // HIGH: clearly wrong domain (e.g. react agent on cli/system task)
  // LOW: plausible overlap (e.g. system agent on test task)
  const highMismatch: Array<{ agent: AgentDomain; task: AgentDomain }> = [
    { agent: 'react', task: 'cli' },
    { agent: 'react', task: 'system' },
    { agent: 'cli', task: 'react' },
    { agent: 'doc', task: 'system' },
    { agent: 'doc', task: 'cli' },
    { agent: 'data', task: 'react' },
    { agent: 'security', task: 'doc' },
  ];

  const isHigh = highMismatch.some(
    (rule) => rule.agent === agentDomain && rule.task === taskDomain,
  );
  const severity: 'HIGH' | 'LOW' = isHigh ? 'HIGH' : 'LOW';

  // Suggest a better agent based on task domain
  const DOMAIN_TO_SUGGESTED_AGENT: Partial<Record<AgentDomain, string>> = {
    'system': 'architect',
    'cli': 'architect',
    'react': 'frontend-designer',
    'test': 'ci-guardian',
    'doc': 'doc-writer',
    'devops': 'devops-engineer',
    'security': 'security-auditor',
    'data': 'data-engineer',
  };

  const suggestedAgent = DOMAIN_TO_SUGGESTED_AGENT[taskDomain];

  if (severity === 'HIGH') {
    debugLog(
      'persona-match',
      `HIGH mismatch: agent '${agent.id}' (domain='${agentDomain}') on task domain='${taskDomain}' — suggested='${suggestedAgent ?? 'none'}'`,
    );
  }

  return {
    valid: severity !== 'HIGH',
    severity,
    mismatch: [`agent domain '${agentDomain}' vs task domain '${taskDomain}'`],
    suggestedAgent,
  };
}

/**
 * Post-selection persona-domain check.
 * Call this after selectAgent() / routeTaskV2() to rotate agents with HIGH domain mismatches.
 *
 * Returns the same agentId if valid, or the suggestedAgent if HIGH mismatch detected.
 * Wire point for sprint-planner.ts (see Sprint 197 task 197-005).
 */
export function applyPersonaDomainCheck(
  selectedAgentId: string,
  task: Pick<Task, 'scope'>,
  pool: Map<string, AgentDefinition>,
): { agentId: string; rotated: boolean; reason?: string } {
  if (selectedAgentId === 'generic') {
    return { agentId: 'generic', rotated: false };
  }

  const agent = pool.get(selectedAgentId);
  if (!agent) {
    return { agentId: selectedAgentId, rotated: false };
  }

  const result = validatePersonaTaskMatch(agent, task);
  debugLog(
    'persona-match',
    `Agent '${selectedAgentId}': valid=${result.valid}, severity=${result.severity ?? 'none'}, suggested=${result.suggestedAgent ?? 'none'}`,
  );

  if (!result.valid && result.severity === 'HIGH' && result.suggestedAgent) {
    debugLog(
      'persona-match',
      `Rotating '${selectedAgentId}' → '${result.suggestedAgent}' (HIGH domain mismatch)`,
    );
    return {
      agentId: result.suggestedAgent,
      rotated: true,
      reason: result.mismatch?.[0] ?? 'domain mismatch',
    };
  }

  return { agentId: selectedAgentId, rotated: false };
}

// ─── Sprint 196 WP-2: FIX Worker Idempotency Mode Inference ────────────────

/**
 * Infer the fix mode for a FIX worker based on the previous task result.
 *
 * - verify-only: previous worker output appears correct (DONE + high rubrics, no boundary violation)
 * - amend: partial work or boundary violation — add missing tests/files (safest default)
 * - re-implement: code defect detected (NO_GO + tests failed)
 *
 * This makes FIX task intent deterministic rather than relying on the FIX worker
 * to guess whether the previous attempt was close or fundamentally broken.
 */
export function inferFixMode(result: TaskResult): 'verify-only' | 'amend' | 're-implement' {
  const notes = result.notes ?? '';
  const rs = result.rubricScores;

  const hasBoundaryViolation = /boundary.?violation|scope.?violation|BOUNDARY_VIOLATION/i.test(notes);

  if (result.selfAssessment === 'DONE' && !hasBoundaryViolation) {
    const allRubricHigh =
      rs !== undefined &&
      (rs.correctness ?? 0) >= 90 &&
      (rs.test_coverage ?? 0) >= 90 &&
      (rs.scope_compliance ?? 0) >= 90;
    if (allRubricHigh) return 'verify-only';
  }

  if (result.selfAssessment === 'NO_GO' && !result.testsPassed) {
    return 're-implement';
  }

  return 'amend';
}
