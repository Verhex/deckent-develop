/**
 * Prompt Gate — Plan-time authoring/routing quality gate (G-series: G1a + G1d).
 *
 * A PURE evaluator that classifies every planned task's (persona × intent) fit and
 * goCriteria decision-shape into WARN / BLOCK findings AT PLAN-TIME — mirroring the
 * pre-spawn cost-gate / scope-gate UX, but wired inside `planSprint()` so it is
 * visible to `deckent plan` (which the scope-gate, wired deep inside runSprint, is
 * structurally not).
 *
 * Motivation (sprint-387 empirical): the remaining prompt-quality leaks are no longer
 * in the render template — they moved to the AUTHORING and ROUTING layers, which had
 * no machine gate:
 *   - 387-012: a hand-authored `- Agent: security-auditor` (a REVIEW persona) on an
 *     Ed25519-signing CONSTRUCTION task → GO_WITH_TECH_DEBT. The router was never
 *     consulted (forceAgent bypasses it) so `getRoleMismatchPenalty` never fired.
 *     This gate runs on the FINAL `assignedAgent`, source-agnostic, so it catches
 *     BOTH an authored forceAgent and a router pick with one lint.
 *   - 387-026: a corrective task routed to `refactorer`, whose persona mandate is
 *     "zero functional changes" — a textbook persona↔operation-class mismatch.
 *
 * The evaluator does no I/O and never prompts; the caller (planSprint) attaches the
 * result to `sprint.promptGate` and the surface (`deckent plan`) renders it and blocks
 * on BLOCK unless overridden (`--force-prompt-gate`), exactly like the cost/scope gates.
 * It COMPOSES the existing domain check ({@link validatePersonaTaskMatch}) and role map
 * ({@link getAgentRole}) rather than re-deriving a parallel taxonomy.
 */
import type { Task } from '../core/task-types.js';
import type { AgentDefinition } from '../core/agent-types.js';
import type {
  PromptGateFinding,
  PromptGateResult,
} from '../core/prompt-gate-types.js';
import { getAgentRole } from '../core/agent-pool.js';
import { validatePersonaTaskMatch } from './task-builder.js';

export type {
  PromptGateFinding,
  PromptGateResult,
  PromptGateLint,
  PromptGateLevel,
} from '../core/prompt-gate-types.js';

export interface PromptGateInput {
  tasks: Task[];
  agentPool: Map<string, AgentDefinition>;
  /** If true, BLOCK findings do NOT set ok=false (CLI `--force-prompt-gate`). */
  acknowledgePromptGate?: boolean;
}

/**
 * Agents whose persona carries an explicit "zero functional change / preserve
 * behavior" mandate (refactorer/PROMPT.md:10,15). Assigning behavior-changing work
 * to them pits the persona against the task. Orthogonal to role: refactorer's
 * *role* is 'implementer', but its *mandate* is preserve-behavior — so this is a
 * separate bit, not a 4th role value (see agent-pool.ts:187 AgentRole).
 */
export const PRESERVE_BEHAVIOR_AGENTS: ReadonlySet<string> = new Set(['refactorer']);

/**
 * Agents that are tool-level Write-denied (advisory/review-only per their agent.json
 * `deniedTools` + PROMPT.md). Assigning a code-WRITING task to them is a HARD
 * mismatch — they are structurally incapable of producing the diff. NOTE: `architect`
 * is mapped `implementer` in BUILTIN_AGENT_ROLES yet denies Write and self-describes
 * as advisory-only (agent.json deniedTools:['Write'], PROMPT.md:10) — the role map
 * misses it, so this capability set is what actually catches that mismatch.
 */
export const WRITE_DENIED_AGENTS: ReadonlySet<string> = new Set([
  'architect',
  'accessibility-auditor',
  'code-reviewer',
]);

/** intent.primary values that describe planning/advisory work (NOT source construction). */
const NON_CONSTRUCTION_INTENTS: ReadonlySet<string> = new Set(['documentation', 'architecture']);

/** taskDNA operation types that mutate the tree (as opposed to test/document). */
const CONSTRUCTION_OPS: ReadonlySet<string> = new Set(['create', 'modify', 'delete', 'rename']);

const DOC_EXT = /\.(md|mdx|txt|rst)$/i;

/**
 * goCriteria "false choice" marker: an UPPERCASE `VEYA`/`OR` is a deliberate
 * authoring signal of two alternative outcomes (lowercase "or" is ordinary prose and
 * is intentionally NOT matched, to avoid flooding English goCriteria with warnings).
 */
const FALSE_CHOICE_RE = /\bVEYA\b|\bOR\b/;

/** Minimal read-shape of the `unknown`-typed `routingMeta.taskDNA`. */
interface DnaLite {
  intent?: { primary?: string };
  operations?: Array<{ type?: string; weight?: number }>;
}

function intentOf(task: Task): string | undefined {
  const dna = task.routingMeta?.taskDNA as DnaLite | undefined;
  return dna?.intent?.primary;
}

/**
 * Does this task predominantly WRITE source code? Prefers taskDNA operation weights
 * (construction-weight ≥ 0.5) when present; falls back to fs-truth (≥1 non-doc file in
 * scope.filesWrite). Doc/planning intents are never construction.
 */
export function isConstructionTask(task: Task): boolean {
  const intent = intentOf(task);
  if (intent && NON_CONSTRUCTION_INTENTS.has(intent)) return false;

  const dna = task.routingMeta?.taskDNA as DnaLite | undefined;
  const ops = dna?.operations;
  if (Array.isArray(ops) && ops.length > 0) {
    const w = ops.reduce(
      (s, o) => s + (CONSTRUCTION_OPS.has(o.type ?? '') ? o.weight ?? 0 : 0),
      0,
    );
    // Trust the operation signal in both directions when it's populated.
    return w >= 0.5;
  }

  // Fallback: any non-doc write target implies source construction.
  const writes = task.scope?.filesWrite ?? [];
  return writes.some((f) => !DOC_EXT.test(f));
}

// ─── Lints ─────────────────────────────────────────────────────────────────────

/** G1a-capability (BLOCK): a Write-denied persona on a code-writing task. */
function lintCapability(task: Task, agentId: string): PromptGateFinding | null {
  if (!WRITE_DENIED_AGENTS.has(agentId) || !isConstructionTask(task)) return null;
  return {
    taskId: task.id,
    lint: 'persona-capability',
    level: 'block',
    agentId,
    message: `Agent '${agentId}' is a review/advisory persona that is denied the Write tool, but this task writes source code — it cannot produce the diff.`,
    suggestion: `Route to an implementer persona (bug-fixer / api-builder / the domain's implementer).`,
  };
}

/** G1a-mandate (WARN): refactorer's zero-functional-change mandate on a behavior-changing task. */
function lintMandate(task: Task, agentId: string): PromptGateFinding | null {
  if (!PRESERVE_BEHAVIOR_AGENTS.has(agentId)) return null;
  const intent = intentOf(task);
  // refactorer is appropriate ONLY for refactor-labeled work; anything else is a
  // behavior-changing task colliding with its "zero functional changes" mandate.
  if (!intent || intent === 'refactor' || intent === 'unknown') return null;
  if (!isConstructionTask(task)) return null;
  return {
    taskId: task.id,
    lint: 'persona-mandate',
    level: 'warn',
    agentId,
    message: `Agent 'refactorer' carries a "zero functional changes" mandate, but this task's intent is '${intent}' (behavior-changing) — the persona fights the task.`,
    suggestion: `Route to bug-fixer (corrective) or the domain implementer; keep refactorer for intent='refactor' only.`,
  };
}

/** G1a-role (WARN): a reviewer/analyst persona (Write-allowed hybrid) on construction work. */
function lintRole(task: Task, agent: AgentDefinition): PromptGateFinding | null {
  const agentId = agent.id;
  if (WRITE_DENIED_AGENTS.has(agentId)) return null; // handled as a BLOCK by lintCapability
  const role = getAgentRole(agent);
  if (role !== 'reviewer' && role !== 'analyst') return null;
  if (!isConstructionTask(task)) return null;
  const isSec = agentId === 'security-auditor';
  return {
    taskId: task.id,
    lint: 'persona-role',
    level: 'warn',
    agentId,
    message: `Agent '${agentId}' is a ${role} persona, but this task is construction work (writes source) — a review stance ≠ building the feature and risks a mismatched approach.`,
    suggestion: isSec
      ? `Route to an implementer (bug-fixer / api-builder) + the 'secure-coding' skill — the auditor persona reviews security, it does not build it.`
      : `Route to an implementer persona for the task's domain.`,
  };
}

/** G1a-domain (WARN): compose the existing HIGH domain-mismatch check into the plan-time surface. */
function lintDomain(task: Task, agent: AgentDefinition): PromptGateFinding | null {
  const r = validatePersonaTaskMatch(agent, task);
  if (r.valid || r.severity !== 'HIGH') return null;
  return {
    taskId: task.id,
    lint: 'persona-domain',
    level: 'warn',
    agentId: agent.id,
    message: `Agent '${agent.id}' domain mismatch: ${r.mismatch?.join('; ') ?? 'agent domain ≠ task domain'}.`,
    suggestion: r.suggestedAgent ? `Consider '${r.suggestedAgent}'.` : undefined,
  };
}

/** G1d-decision-space (WARN): goCriteria presents a false choice (X VEYA/OR Y). */
function lintDecisionSpace(task: Task): PromptGateFinding | null {
  const g = task.goNogo?.goCriteria ?? '';
  if (!FALSE_CHOICE_RE.test(g)) return null;
  return {
    taskId: task.id,
    lint: 'decision-space',
    level: 'warn',
    agentId: task.assignedAgent ?? 'generic',
    message: `goCriteria offers a choice ("…VEYA/OR…"); when scope enables only one branch this hands the worker a false decision and invites hesitation.`,
    suggestion: `State a preferred order ("prefer X; if infeasible, Y") or split into two goCriteria items.`,
  };
}

// ─── Evaluator ───────────────────────────────────────────────────────────────

/**
 * Evaluate the plan-time prompt gate for a set of finalized tasks. Pure: no I/O, never
 * throws, never prompts. `ok` is false iff there is ≥1 BLOCK finding that was not
 * acknowledged. Runs source-agnostically on each task's final `assignedAgent`.
 */
export function evaluatePromptGate(input: PromptGateInput): PromptGateResult {
  const findings: PromptGateFinding[] = [];

  for (const task of input.tasks) {
    const agentId = task.assignedAgent ?? 'generic';

    if (agentId !== 'generic') {
      const cap = lintCapability(task, agentId);
      if (cap) findings.push(cap);

      const man = lintMandate(task, agentId);
      if (man) findings.push(man);

      const agent = input.agentPool.get(agentId);
      if (agent) {
        // Role lint is redundant once capability already blocked the same task.
        if (!cap) {
          const role = lintRole(task, agent);
          if (role) findings.push(role);
        }
        const dom = lintDomain(task, agent);
        if (dom) findings.push(dom);
      }
    }

    const dec = lintDecisionSpace(task);
    if (dec) findings.push(dec);
  }

  const blockers = findings.filter((f) => f.level === 'block');
  const overrideApplied = blockers.length > 0 && input.acknowledgePromptGate === true;
  const ok = blockers.length === 0 || overrideApplied;
  return { ok, findings, blockers, overrideApplied: overrideApplied || undefined };
}
