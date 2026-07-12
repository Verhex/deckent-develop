/**
 * Tool Allowlist — task-based worker tool-surface reduction (born-664 / 559).
 *
 * A PURE, deterministic evaluator: given a task's `(taskType, scope, agent)` it
 * computes the narrowed set of tools a worker should see, instead of dropping the
 * full ~42-tool surface into every worker prompt (32/42 idle + unused connectors →
 * prompt-bloat + attack-surface). A typical task lands ~10-15 tools.
 *
 * Design (mirrors {@link ./scope-gate} / {@link ./cost-gate}): the module owns only
 * the SELECTION POLICY and does NO I/O — the caller supplies the tool `universe`
 * (defaulting to the reference {@link DEFAULT_WORKER_TOOL_CATALOG}). The real, live
 * worker tool surface (native tools + connectors + MCP) is discovered and injected
 * by the wiring layer (Task 14 / ALLOW-WIRE); this module never reads config or a
 * registry, so its results are hermetic and stable across environments.
 *
 * Escape hatch: any tool NOT granted by default is `escalatable` — a worker may
 * request it with a justification (dynamic discovery). The typed contract for that
 * request lives here ({@link ToolEscalationRequest}, {@link evaluateEscalationRequest});
 * the actual grant/approval/RBAC wiring is Task 14. See the boundary note on
 * {@link evaluateEscalationRequest}.
 *
 * ADR-D-004 (Layer-1 Import Direction) C1: this is a `core/` module and imports only
 * from `core/` (`./work-model.js`, a type-only import of the canonical `TaskKind`).
 */

import type { TaskKind } from './work-model.js';

// ─── Tool model ───────────────────────────────────────────────────────────────

/**
 * Coarse capability grouping of the worker tool surface. The group is the ONLY
 * signal the policy reads — it deliberately carries no separate `mutating`/`risk`
 * field (that would be decorative here): `edit` already means file-mutating, and
 * default-deny of `web`/`connector`/`mcp`/`orchestration` already covers the
 * surface-risk reduction.
 */
export type WorkerToolGroup =
  | 'read' // read a file's contents (Read)
  | 'search' // locate code without reading whole files (Glob, Grep)
  | 'edit' // mutate files (Write, Edit, MultiEdit, NotebookEdit) — scope-gated
  | 'execute' // run commands / shells (Bash, BashOutput, KillShell)
  | 'web' // reach the network (WebFetch, WebSearch) — escalation-only by default
  | 'planning' // always-safe scratch/plan surface (TodoWrite)
  | 'orchestration' // spawn sub-agents (Task) — escalation-only by default
  | 'connector' // messaging / third-party MCP connectors — escalation-only by default
  | 'mcp'; // deckent orchestration MCP tools (deckent_*) — escalation-only by default

/** One entry in the worker tool universe: a tool name + its capability group. */
export interface WorkerToolDescriptor {
  name: string;
  group: WorkerToolGroup;
}

/**
 * Narrow-only agent refinement. The agent's OWN definition (`agent.json`) may
 * explicitly deny tools; that denial is honored as a subtraction.
 *
 * We intentionally do NOT consume `agent.allowedTools`: real builtin agent.json
 * lists are coarse and incomplete (e.g. omit `MultiEdit`/`Glob`), so a strict
 * intersection would drop legitimately-needed tools. `deniedTools` is an explicit
 * intent signal and is always safe to honor. `id` is diagnostics-only — it is
 * NEVER used to look up a hardcoded per-name policy (that is the dead-`allowedTools`
 * drift trap the trace audit flagged).
 */
export interface AgentToolConstraint {
  id?: string;
  deniedTools?: readonly string[];
}

/** Only `filesWrite` drives the mutating gate; kept structural to avoid coupling to the full `TaskScope`. */
export interface ToolAllowlistScope {
  filesWrite?: readonly string[];
}

export interface ToolAllowlistInput {
  taskType: TaskKind;
  scope: ToolAllowlistScope;
  agent?: AgentToolConstraint;
  /**
   * The full worker tool surface to select from. Defaults to
   * {@link DEFAULT_WORKER_TOOL_CATALOG}. The wiring layer (Task 14) supplies the
   * real, live universe (native tools + the project's actual connectors/MCP tools).
   */
  universe?: readonly WorkerToolDescriptor[];
}

export interface ToolAllowlistResult {
  /** Tool names granted by default, for THIS task. Sorted + deduped. */
  allowed: string[];
  /**
   * Tool names NOT granted by default — every universe tool the task did not get.
   * A worker may request any of these via the escape hatch (see
   * {@link evaluateEscalationRequest}). Sorted + deduped.
   */
  escalatable: string[];
  /** The capability groups that were granted (post scope-gate + agent-deny). Sorted. */
  allowedGroups: WorkerToolGroup[];
  /** Plain-English diagnostic (scope-gate precedent — not end-user UI copy). */
  rationale: string;
}

// ─── Policy ─────────────────────────────────────────────────────────────────

/** Groups every task always receives — read/search/plan are never surface-risk. */
const BASE_GROUPS: readonly WorkerToolGroup[] = ['read', 'search', 'planning'];

/**
 * Additional candidate groups per canonical {@link TaskKind}. `edit` here is a
 * CANDIDATE — it is kept only when the task actually declares writable paths (see
 * the scope gate in {@link computeToolAllowlist}). `web`/`connector`/`mcp`/
 * `orchestration` are absent from every row → default-denied (escalation-only),
 * which is where most of the 42→~12 reduction comes from.
 *
 * Exhaustive `Record<TaskKind, …>`: adding a new kind is a compile error until a
 * policy row is decided here — no silent default gap for the table test.
 */
const TASK_KIND_GROUPS: Record<TaskKind, readonly WorkerToolGroup[]> = {
  'code-development': ['edit', 'execute'],
  test: ['edit', 'execute'],
  refactor: ['edit', 'execute'],
  config: ['edit', 'execute'],
  devops: ['edit', 'execute'],
  data: ['edit', 'execute'],
  design: ['edit', 'execute'],
  documentation: ['edit'], // docs mutate files but do not run commands
  audit: ['edit'], // read-only review; `edit` only surfaces if a report path is declared
  security: ['edit', 'execute'], // scanners legitimately need a shell
  generic: ['edit', 'execute'], // conservative-but-capable superset (still no web/connector/mcp)
};

/**
 * Reference worker tool surface: the well-known native tools plus a few
 * connector/MCP examples so the reduction is demonstrable out of the box.
 *
 * This is a REFERENCE / TEST baseline, NOT runtime truth — it is neither
 * exhaustive nor authoritative. Task 14 discovers the real injection point and
 * supplies the live universe; do not import this as the source of truth (that is
 * the drift trap a hardcoded full-catalog invites).
 */
export const DEFAULT_WORKER_TOOL_CATALOG: readonly WorkerToolDescriptor[] = [
  // native — read / search
  { name: 'Read', group: 'read' },
  { name: 'Glob', group: 'search' },
  { name: 'Grep', group: 'search' },
  // native — edit
  { name: 'Write', group: 'edit' },
  { name: 'Edit', group: 'edit' },
  { name: 'MultiEdit', group: 'edit' },
  { name: 'NotebookEdit', group: 'edit' },
  // native — execute
  { name: 'Bash', group: 'execute' },
  { name: 'BashOutput', group: 'execute' },
  { name: 'KillShell', group: 'execute' },
  // native — web / planning / orchestration
  { name: 'WebFetch', group: 'web' },
  { name: 'WebSearch', group: 'web' },
  { name: 'TodoWrite', group: 'planning' },
  { name: 'Task', group: 'orchestration' },
  // connectors (default-denied — the "unused connectors" surface cut)
  { name: 'mcp__telegram__send', group: 'connector' },
  { name: 'mcp__discord__send', group: 'connector' },
  { name: 'mcp__whatsapp__send', group: 'connector' },
  // deckent orchestration MCP (a worker does not drive sprints by default)
  { name: 'deckent_status', group: 'mcp' },
  { name: 'deckent_plan', group: 'mcp' },
  { name: 'deckent_start', group: 'mcp' },
];

// ─── Compute ─────────────────────────────────────────────────────────────────

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * Compute the default tool allowlist for a task. Pure + deterministic: identical
 * input (including `universe` order) always yields identical, sorted output.
 */
export function computeToolAllowlist(input: ToolAllowlistInput): ToolAllowlistResult {
  const universe = input.universe ?? DEFAULT_WORKER_TOOL_CATALOG;
  const scopeAllowsEdit = (input.scope.filesWrite?.length ?? 0) > 0;

  // 1. taskType → candidate groups, then the scope gate removes `edit` when the
  //    task declares no writable paths (the audit-with-no-report → read-only case).
  const groups = new Set<WorkerToolGroup>([...BASE_GROUPS, ...TASK_KIND_GROUPS[input.taskType]]);
  if (!scopeAllowsEdit) groups.delete('edit');

  // 2. universe ∩ granted-groups, then the narrow-only agent-deny subtraction.
  const denySet = new Set(input.agent?.deniedTools ?? []);
  const allowedNames = new Set<string>();
  for (const tool of universe) {
    if (groups.has(tool.group) && !denySet.has(tool.name)) {
      allowedNames.add(tool.name);
    }
  }

  const allowed = sortedUnique(allowedNames);
  const escalatable = sortedUnique(
    universe.filter((t) => !allowedNames.has(t.name)).map((t) => t.name),
  );
  const allowedGroups = [...groups].sort((a, b) => a.localeCompare(b));

  const writeCount = input.scope.filesWrite?.length ?? 0;
  const rationale =
    `${input.taskType} task with ${writeCount} writable path(s): groups ` +
    `${allowedGroups.join(', ')} → ${allowed.length} of ${universe.length} tools granted, ` +
    `${escalatable.length} escalatable` +
    (denySet.size > 0 ? ` (agent ${input.agent?.id ?? '?'} denied ${denySet.size} tool(s))` : '');

  return { allowed, escalatable, allowedGroups, rationale };
}

// ─── Escape hatch (dynamic discovery) — typed contract; grant impl is Task 14 ──

/** A worker's request for a tool outside its default allowlist. */
export interface ToolEscalationRequest {
  taskId: string;
  workerId?: string;
  /** The tool the worker wants added to its surface. */
  tool: string;
  /** Why the task needs it — required; a blank justification is inadmissible. */
  justification: string;
}

/** Why an escalation request is not well-formed (never a grant/deny policy reason). */
export type EscalationRejectionReason =
  | 'already-allowed' // the tool is already in the allowlist — nothing to escalate
  | 'unknown-tool' // the tool is not part of the worker tool universe
  | 'missing-justification'; // justification is empty/whitespace

/**
 * Result of the WELL-FORMEDNESS check for an escalation request — a discriminated
 * union so callers must handle both arms.
 */
export type EscalationAdmissibility =
  | { admissible: true; tool: string }
  | { admissible: false; tool: string; reason: EscalationRejectionReason };

/**
 * Pure well-formedness check for a dynamic-discovery request. A request is
 * `admissible` iff it names a real tool (present in the universe), that tool is
 * currently denied (not already allowed), and it carries a non-blank justification.
 *
 * BOUNDARY (born-664 / 559): admissibility is NOT a grant. Whether an admissible
 * request is actually GRANTED — approval policy, tool budget, RBAC, human sign-off —
 * is the wiring layer's decision (Task 14 / ALLOW-WIRE). This module only proves the
 * request is well-formed and refers to a real, currently-denied tool; it never
 * mutates the allowlist and never performs I/O.
 */
export function evaluateEscalationRequest(
  request: ToolEscalationRequest,
  result: ToolAllowlistResult,
  universe: readonly WorkerToolDescriptor[] = DEFAULT_WORKER_TOOL_CATALOG,
): EscalationAdmissibility {
  const { tool } = request;
  if (request.justification.trim().length === 0) {
    return { admissible: false, tool, reason: 'missing-justification' };
  }
  if (!universe.some((t) => t.name === tool)) {
    return { admissible: false, tool, reason: 'unknown-tool' };
  }
  if (result.allowed.includes(tool)) {
    return { admissible: false, tool, reason: 'already-allowed' };
  }
  return { admissible: true, tool };
}
