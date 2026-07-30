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
import { sanitizeScope } from './scope-sanitizer.js';
import { lintScopeSatisfiability } from './scope-satisfiability.js';
import { isRealPathCandidate } from '../core/task-builder-scope.js';

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
  /**
   * G1c premise ground-truth probe (optional). A bounded, fail-soft repo search that
   * returns how many times a code-symbol occurs in the codebase. When supplied, the
   * gate spot-checks "X is missing/absent/unimplemented" claims in task descriptions:
   * a symbol claimed absent but found in the repo → WARN (stale premise, like the
   * sprint-387-012 "Ed25519 keygen missing" premise that was already implemented).
   * Absent → the premise lint is skipped (gate stays pure).
   */
  probeRepo?: (symbol: string) => number;
  /**
   * Repo tracked-file list (git ls-files), fail-soft optional — enables the two
   * sprint-399 scope-contract lints: 'scope-silent-drop' (SAN-1: a declared write
   * path that render-time sanitizeScope would silently remove → the 397-011/012
   * README/.secrets-baseline failure mode) and 'scope-satisfiability' (G1b: task
   * text ↔ write-authority consistency). Absent → both lints are skipped.
   */
  trackedFiles?: readonly string[];
  /** Pre-localized, adapter-backed findings produced by planner I/O preflight. */
  preflightFindings?: readonly PromptGateFinding[];
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
 * FALLBACK id-set for Write-denied (advisory/review-only) agents. G2 made the
 * capability lint prefer the real manifest signal (`agent.deniedTools.includes('Write')`)
 * over name-matching — this set is the fallback for when the agent def is absent or its
 * tools are not populated (e.g. a hermetic fixture built via createAgentDefinition, whose
 * deniedTools defaults to []), so the check never silently no-ops. NOTE: `architect` is
 * mapped `implementer` in BUILTIN_AGENT_ROLES yet denies Write and self-describes as
 * advisory-only (agent.json deniedTools:['Write'], PROMPT.md:10) — the role map misses it;
 * both the metadata signal AND this set catch it.
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

/**
 * G1a-capability (BLOCK): a Write-denied persona on a code-writing task. G2 prefers the
 * real manifest signal (`agent.deniedTools`) over the hardcoded id-set (name-matching) so
 * ANY Write-denied agent — including future ones — is caught; the id-set is the fallback
 * for an absent/tool-empty agent def.
 */
function lintCapability(task: Task, agentId: string, agent?: AgentDefinition): PromptGateFinding | null {
  const writeDenied = (agent?.deniedTools?.includes('Write') ?? false) || WRITE_DENIED_AGENTS.has(agentId);
  if (!writeDenied || !isConstructionTask(task)) return null;
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

/**
 * A CODE-symbol (camelCase or snake_case, so a real identifier — not a plain English
 * word) claimed absent. The `(?:[a-z][A-Z]|_)` requires a camelCase hump or underscore,
 * keeping this conservative: "executeComputerUseAction is unimplemented",
 * "resolveTokenUsage() eksik" match; "the api is missing" does not.
 */
// NOTE: intentionally NOT case-insensitive — the `[a-z][A-Z]` camelCase-hump test only
// works under case-sensitivity (a `/i` flag would make `[a-z][A-Z]` match any two letters
// and flag plain words like "page"). Absence words carry their own case alternation.
const ABSENCE_CLAIM_RE =
  /\b([A-Za-z_][A-Za-z0-9_]*(?:[a-z][A-Z]|_)[A-Za-z0-9_]*)(?:\(\))?\s+(?:is\s+|are\s+)?(?:currently\s+)?(?:[Mm]issing|[Aa]bsent|[Uu]nimplemented|not\s+implemented|eksik|yok|mevcut\s+değil)\b/g;

/** Max distinct symbols probed per task (bounds plan-time repo searches). */
const MAX_PREMISE_PROBES = 4;
/** A symbol must occur more than this many times to count as "really present" (not an incidental mention). */
const PREMISE_PRESENT_THRESHOLD = 2;

/**
 * G1c-premise (WARN): a task description claims a code-symbol is missing/absent, but the
 * repo probe finds it present. Catches the sprint-387-012 class of stale premise (nogo
 * "add Ed25519 keygen" when `@noble/ed25519` signing already shipped). WARN-only and
 * conservative (code-identifier shape + present-threshold) to keep false positives low.
 */
function lintPremise(task: Task, probeRepo: (symbol: string) => number): PromptGateFinding[] {
  const desc = task.description ?? '';
  if (!desc) return [];
  const seen = new Set<string>();
  const out: PromptGateFinding[] = [];
  ABSENCE_CLAIM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ABSENCE_CLAIM_RE.exec(desc)) !== null && seen.size < MAX_PREMISE_PROBES) {
    const symbol = m[1];
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    let count = 0;
    try {
      count = probeRepo(symbol);
    } catch {
      count = 0; // fail-soft: a probe failure never invents a finding
    }
    if (count > PREMISE_PRESENT_THRESHOLD) {
      out.push({
        taskId: task.id,
        lint: 'premise',
        level: 'warn',
        agentId: task.assignedAgent ?? 'generic',
        message: `Premise may be stale: the description claims '${symbol}' is missing/absent, but it occurs ${count}× in the repo — the fix may already exist.`,
        suggestion: `Verify '${symbol}' against the codebase before implementing; if it already exists, narrow the task to the true remaining gap (or close it).`,
      });
    }
  }
  return out;
}

// ─── Scope-contract lints (sprint-399 wiring: SAN-1 BLOCK + G1b) ─────────────

/**
 * Extract backtick-quoted runner commands from goCriteria/description as the
 * satisfiability lint's proofCommands. Conservative: only commands starting with a
 * known runner are treated as proof commands (a quoted identifier is not a command).
 */
const PROOF_RUNNER_RE = /^(?:npx|npm|node|grep|find|cat|ls|go|cargo|pytest|vitest|deckent)\s/;
function extractProofCommands(...texts: Array<string | undefined>): string[] {
  const out: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const cmd = (m[1] ?? '').trim();
      if (PROOF_RUNNER_RE.test(cmd)) out.push(cmd);
    }
  }
  return out;
}

/**
 * SAN-1 promotion (sprint-397 root cause, N1/N2): run the render-time scope sanitizer
 * AT PLAN-TIME with the tracked root-file set. Any write path the render would drop or
 * reject is surfaced as a BLOCK — a silently shrunken write authority produced the
 * 397-011 (README.md/README-TR.md) and 397-012 (.secrets-baseline) failures, and the
 * sanitizer's warnings previously had zero consumers.
 */
function lintScopeSilentDrop(task: Task, trackedRootFiles: ReadonlySet<string>): PromptGateFinding[] {
  const filesWrite = task.scope?.filesWrite ?? [];
  if (filesWrite.length === 0) return [];
  const sanitized = sanitizeScope(filesWrite, trackedRootFiles);
  const agentId = task.assignedAgent ?? 'generic';
  const out: PromptGateFinding[] = [];
  for (const w of sanitized.warnings) {
    out.push({
      taskId: task.id,
      lint: 'scope-silent-drop',
      level: 'block',
      agentId,
      message: `Write authority would silently shrink at render time: ${w}`,
      suggestion:
        'Qualify the path (directory prefix) or fix the entry in DIRECTIVES — the worker would never see this file in its WRITE list.',
    });
  }
  for (const r of sanitized.rejected) {
    out.push({
      taskId: task.id,
      lint: 'scope-silent-drop',
      level: 'block',
      agentId,
      message: `Write path rejected by the scope sanitizer (absolute/traversal): "${r}"`,
      suggestion: 'Use a repo-relative path without ".." segments.',
    });
  }
  return out;
}

/** G1b (sprint-399 wiring): task-text ↔ write-authority satisfiability lint. */
function lintSatisfiability(task: Task, trackedFiles: readonly string[]): PromptGateFinding[] {
  const goCriteria = task.goNogo?.goCriteria ?? '';
  const description = task.description ?? '';
  const findings = lintScopeSatisfiability({
    description,
    goCriteria,
    proofCommands: extractProofCommands(goCriteria, description),
    filesWrite: task.scope?.filesWrite ?? [],
    directories: task.scope?.directories ?? [],
    trackedFiles,
  })
    // born-650: the satisfiability path-extraction regex greedily matches code tokens
    // ("Date.now/process.env" → "now/process.env") and money/number tokens
    // ("$2.23/4.25dk" → "23/4.25dk") as slash-qualified paths, producing false BLOCKs.
    // Drop any finding whose `path` does not look like a real file path — a genuinely
    // missing path ("src/core/x.ts") still passes the predicate and still blocks.
    .filter(f => isRealPathCandidate(f.path));
  const agentId = task.assignedAgent ?? 'generic';
  return findings.map(f => ({
    taskId: task.id,
    lint: 'scope-satisfiability' as const,
    level: f.severity === 'BLOCK' ? 'block' as const : 'warn' as const,
    agentId,
    message: `[${f.code}] ${f.message}`,
    suggestion:
      f.code === 'PROOF_PATH_MISSING'
        ? `Fix the proof command's path or add '${f.path}' to scope.filesWrite (new-file proofs are legitimate only with write authority).`
        : f.code === 'MENTIONED_NOT_WRITABLE'
          ? `Add '${f.path}' to scope.filesWrite/directories, or reword the task so it does not require writing it.`
          : `'${f.path}' is declared unchanged but is in filesWrite — drop it from the write list or drop the declaration.`,
  }));
}

// ─── Evaluator ───────────────────────────────────────────────────────────────

/**
 * Evaluate the plan-time prompt gate for a set of finalized tasks. Pure: no I/O, never
 * throws, never prompts. `ok` is false iff there is ≥1 BLOCK finding that was not
 * acknowledged. Runs source-agnostically on each task's final `assignedAgent`.
 */
export function evaluatePromptGate(input: PromptGateInput): PromptGateResult {
  const findings: PromptGateFinding[] = [...(input.preflightFindings ?? [])];

  // Built once for the whole plan (hoisted — advisor hygiene note, sprint-399).
  const trackedRootFiles = input.trackedFiles
    ? new Set(input.trackedFiles.filter(f => !f.includes('/')))
    : undefined;

  for (const task of input.tasks) {
    const agentId = task.assignedAgent ?? 'generic';

    if (agentId !== 'generic') {
      const agent = input.agentPool.get(agentId);

      const cap = lintCapability(task, agentId, agent);
      if (cap) findings.push(cap);

      const man = lintMandate(task, agentId);
      if (man) findings.push(man);

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

    if (input.probeRepo) {
      findings.push(...lintPremise(task, input.probeRepo));
    }

    // sprint-399 scope-contract lints — only with a real tracked-file list (fail-soft:
    // no git signal → no findings, never a false block on e.g. a non-git workspace).
    if (input.trackedFiles && input.trackedFiles.length > 0 && trackedRootFiles) {
      findings.push(...lintScopeSilentDrop(task, trackedRootFiles));
      findings.push(...lintSatisfiability(task, input.trackedFiles));
    }
  }

  const blockers = findings.filter((f) => f.level === 'block');
  const overrideApplied = blockers.length > 0 && input.acknowledgePromptGate === true;
  const ok = blockers.length === 0 || overrideApplied;
  return { ok, findings, blockers, overrideApplied: overrideApplied || undefined };
}
