// ═══ Result Assembler — orchestrator-owned, git-authoritative ════════════════
// Worker Output Contract & Observability (spec §1.1 ownership, §1.2 schema, §1.5
// conflict). Plan PHASE 1 / Task 1.2.
//
// `assembleResult(input)` builds the canonical, Zod-validated `TaskResultV1` from
// AUTHORITATIVE sources — the worker never authors a measurable field:
//   • `filesChanged[]` / `totalLines*` / `diskVerified` / `boundaryViolations[]`
//     are derived from `git` (per-file `--numstat` + `--name-status` + untracked
//     `ls-files`), NOT from a worker claim.
//   • `durationMs` is derived from orchestrator timestamps.
//   • `tokenUsage` / `cost` are copied verbatim from the authoritative inputs
//     (Phase 2/3 wire the provider adapter + cost-calculator that produce them).
//   • only `selfAssessment` / `goCriteria` / `notes` / `tests` / `tsc` come from
//     the worker (the genuinely subjective block); `brainEvaluation*` is left null
//     for the EVALUATE phase.
//
// Conflict behavior (§1.5, authoritative wins, claim preserved): a worker that
// reports `tsc.clean===false` while still self-assessing `DONE` raises an honesty
// signal — `honestGate.flagged=true, violation='claimed-done-tsc-fail'` — rather
// than a silent overwrite.
//
// ADR-087: git is invoked via async `spawn` (never `spawnSync`) so the assembler
// never freezes the event loop. ADR-010: zero new runtime deps (Node builtins +
// the existing Zod schema). The git layer is injectable (`GitChangeProvider`) so
// tests stay hermetic; the default provider runs real git in `projectRoot`.
//
// NOTE: `result-evaluator.ts` is intentionally NOT touched — this module only
// assembles + validates; Brain evaluation is a separate, downstream concern.

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { debugLog } from '../core/utils.js';
import type {
  ProductionWiringResultEvidence,
  RunPolicyResultEvidence,
  Task,
  TaskScope,
} from '../core/task-types.js';
import type { TokenUsage } from '../core/token-usage.js';
import {
  validateTaskResult,
  AssemblerError,
  type TaskResultV1,
  type FileChange,
} from '../core/task-result-schema.js';
import { resolvePromptDeliveryAttribution } from '../core/prompt-delivery-receipt.js';
import { getDefaultProviderName } from './sprint-utils.js';

// Compat re-exports — canonical ingress moved to result-ingress.ts (SCC fix);
// shared shapes moved to core/task-result-schema.ts. Existing importers keep working.
export {
  assembleCanonicalIngressResult,
  assembleCanonicalIngressResultV2,
  type CanonicalIngressAuthority,
  type CanonicalIngressCustodyAuthority,
} from './result-ingress.js';
export { AssemblerError, type FileChange } from '../core/task-result-schema.js';

// ─── Input contract ──────────────────────────────────────────────────────────

/** Cross-provider cost (spec §1.4 shape); `currency`/`isLocal` default in-schema. */
export interface CostInput {
  usd: number;
  currency?: 'USD';
  referenceUsd?: number;
  billingMode?: 'api' | 'subscription' | 'free_tier' | 'local';
  pricingSource: string;
  isLocal?: boolean;
}

/** A single worker go-criterion verdict (matches the schema's `goCriterion`). */
export interface GoCriterionInput {
  id: string;
  description: string;
  met: boolean;
  evidence?: string | null;
}

/** Worker-run verification outcome — captured, not re-derived (Phase 1). */
export interface TestsInput {
  passed: number;
  failed: number;
  total: number;
  coverage?: number | null;
  command?: string | null;
}

/** TypeScript compile outcome the worker reports. */
export interface TscInput {
  clean: boolean;
  errors: number;
}

/** A structural note destined for SharedMemory (worker-comms, opt-in). */
export interface SharedNoteInput {
  key: string;
  value: string;
}

/**
 * The ONLY block the worker authors. Everything else on the result is derived
 * authoritatively by the orchestrator. Bounded + structured by construction.
 */
export interface WorkerSubjective {
  selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  notes: string;
  goCriteria: GoCriterionInput[];
  tests: TestsInput;
  tsc: TscInput;
  handoffNotes?: string | null;
  sharedNotes?: SharedNoteInput[];
  /** Optional ingress evidence retained independently from the host test projection. */
  criteriaEvidence?: Array<{
    criterionId: string;
    outcome: 'MET' | 'UNMET' | 'UNVERIFIED';
    evidence: string[];
  }>;
  /** Untrusted worker work claim, preserved only for mismatch diagnostics. */
  workClaim?: {
    filesChanged?: readonly string[];
    linesAdded?: number | null;
    linesRemoved?: number | null;
  };
  /** Worker observation only; host settlement decides production wiring. */
  productionWiringEvidence?: ProductionWiringResultEvidence;
  /** Worker digest echo only; host settlement decides policy parity. */
  runPolicyEvidence?: RunPolicyResultEvidence;
}

/**
 * Orchestrator-supplied runtime identity not carried on {@link Task} (resolved at
 * spawn). `provider`/`model` fall back to the task's own fields when omitted.
 */
export interface AssembleIdentity {
  workerId: string;
  provider?: string;
  model?: string;
  modelEffort?: string;
  agent?: string | null;
  skills?: string[];
  attempt?: number;
}

/** Spawn→result timestamps (ISO 8601) the orchestrator records for free. */
export interface AssembleTiming {
  spawnedAt: string;
  startedAt: string;
  completedAt: string;
}

/** Full input to {@link assembleResult}. */
export interface AssembleInput {
  projectRoot: string;
  task: Task;
  identity: AssembleIdentity;
  workerSubjective: WorkerSubjective;
  /** Authoritative, provider-agnostic token usage (Phase 2 adapter output). */
  tokenUsage: TokenUsage;
  /** Authoritative cross-provider cost (Phase 3 cost-calculator output). */
  cost: CostInput;
  timing: AssembleTiming;
  /** Override the git layer — tests inject a deterministic provider. */
  gitProvider?: GitChangeProvider;
}

// ─── Git change layer (authoritative, injectable) ────────────────────────────


/** Outcome of querying git for the working-tree changes. */
export interface GitChangeResult {
  /** Every changed file in the repo (path-normalized, forward-slash). */
  changes: FileChange[];
  /** `false` when git could not be queried → caller marks `diskVerified:false`. */
  ok: boolean;
}

/** Source of working-tree changes. Default = real git; tests inject a static one. */
export interface GitChangeProvider {
  collect(): Promise<GitChangeResult>;
}

// ─── Errors ──────────────────────────────────────────────────────────────────



// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the canonical, validated worker result from authoritative sources.
 *
 * Measurable fields (files/lines/duration/tokens/cost) are derived, never taken
 * from a worker claim; the worker contributes only the subjective block. The
 * result is validated via {@link validateTaskResult} before returning — on
 * failure an {@link AssemblerError} is thrown (the orchestrator must never
 * persist an invalid `.result`).
 *
 * @throws {AssemblerError} when the assembled object fails schema validation.
 */
export async function assembleResult(input: AssembleInput): Promise<TaskResultV1> {
  const { task, identity, workerSubjective: ws, timing } = input;

  // 1. Authoritative work output from git (fail-open → diskVerified:false).
  const provider = input.gitProvider ?? createDefaultGitChangeProvider(input.projectRoot);
  let gitResult: GitChangeResult;
  try {
    gitResult = await provider.collect();
  } catch (e) {
    debugLog('result-assembler:git', e);
    gitResult = { changes: [], ok: false };
  }

  const filesChanged = gitResult.changes;
  const totalLinesAdded = filesChanged.reduce((sum, f) => sum + f.linesAdded, 0);
  const totalLinesRemoved = filesChanged.reduce((sum, f) => sum + f.linesRemoved, 0);
  const boundaryViolations = computeBoundaryViolations(filesChanged, task.scope);
  const claimedFiles = [...(ws.workClaim?.filesChanged ?? [])];
  const measuredFiles = filesChanged.map(change => change.path);
  const workerWorkClaim = ws.workClaim ? {
    filesChanged: claimedFiles,
    linesAdded: ws.workClaim.linesAdded ?? null,
    linesRemoved: ws.workClaim.linesRemoved ?? null,
    mismatch: JSON.stringify([...claimedFiles].sort()) !== JSON.stringify([...measuredFiles].sort())
      || (ws.workClaim.linesAdded != null && ws.workClaim.linesAdded !== totalLinesAdded)
      || (ws.workClaim.linesRemoved != null && ws.workClaim.linesRemoved !== totalLinesRemoved),
  } : undefined;

  // 2. Timing → durationMs (completed − spawned). NaN-safe; clamp non-negative.
  const durationMs = diffMs(timing.spawnedAt, timing.completedAt);

  // 3. Conflict rule (§1.5): claimed DONE while tsc is dirty → honesty signal.
  const honestGate =
    ws.tsc.clean === false && ws.selfAssessment === 'DONE'
      ? { flagged: true, violation: 'claimed-done-tsc-fail' }
      : { flagged: false, violation: null };
  const promptDelivery = resolvePromptDeliveryAttribution({
    projectRoot: input.projectRoot,
    taskId: task.id,
    requireCurrentReceipt: typeof task.promptCompilePlanId === 'string',
    legacyAgentId: identity.agent ?? task.assignedAgent ?? null,
    legacySkillIds: identity.skills ?? task.assignedSkills,
  });

  // 4. Assemble the canonical shape (authoritative derived + worker subjective +
  //    null brain/auditor slots filled downstream). Defaults applied by the schema.
  const assembled = {
    schemaVersion: '1.0' as const,

    // identity / provenance
    taskId: task.id,
    sprintId: task.sprintId,
    workerId: identity.workerId,
    provider: identity.provider ?? task.provider ?? getDefaultProviderName(),
    model: identity.model ?? task.forceModel ?? task.model,
    modelEffort: identity.modelEffort ?? task.modelEffort,
    agent: promptDelivery.agentId,
    skills: [...promptDelivery.skillIds],
    attempt: identity.attempt ?? 1,
    isPriorityFix: task.isPriorityFix ?? false,
    fixForTaskId: task.fixForTaskId ?? null,

    // timing (orchestrator)
    spawnedAt: timing.spawnedAt,
    startedAt: timing.startedAt,
    completedAt: timing.completedAt,
    durationMs,

    // work output (orchestrator, git-authoritative)
    filesChanged,
    totalLinesAdded,
    totalLinesRemoved,
    diskVerified: gitResult.ok,
    boundaryViolations,
    ...(workerWorkClaim ? { workerWorkClaim } : {}),
    promptDeliveryAttribution: {
      state: promptDelivery.state,
      ...(promptDelivery.state === 'HOLD' ? { reason: promptDelivery.reason } : {}),
    },

    // resource accounting (orchestrator, provider-agnostic)
    tokenUsage: input.tokenUsage,
    cost: input.cost,

    // verification (worker-run, orchestrator-captured)
    tests: {
      passed: ws.tests.passed,
      failed: ws.tests.failed,
      total: ws.tests.total,
      coverage: ws.tests.coverage ?? null,
      command: ws.tests.command ?? null,
      orchestratorVerified: false,
    },
    tsc: { clean: ws.tsc.clean, errors: ws.tsc.errors },
    criteriaEvidence: ws.criteriaEvidence ?? [],

    // assessment (worker + brain)
    selfAssessment: ws.selfAssessment,
    goCriteria: ws.goCriteria.map(g => ({
      id: g.id,
      description: g.description,
      met: g.met,
      evidence: g.evidence ?? null,
    })),
    notes: ws.notes,
    brainEvaluation: null,
    brainEvaluationReason: null,
    rubricScores: null,
    totalScore: null,
    honestGate,

    // comms (optional)
    handoffNotes: ws.handoffNotes ?? null,
    sharedNotes: ws.sharedNotes ?? [],

    // auditor (2nd layer) — filled post-write
    auditorValidation: null,
    ...(ws.productionWiringEvidence
      ? { productionWiringEvidence: ws.productionWiringEvidence }
      : {}),
    ...(ws.runPolicyEvidence ? { runPolicyEvidence: ws.runPolicyEvidence } : {}),
  };

  // 5. Validate before returning — never emit an invalid result.
  const validated = validateTaskResult(assembled);
  if (!validated.ok) {
    throw new AssemblerError(
      `assembled result for task ${task.id} failed validation: ${validated.errors.join('; ')}`,
      validated.missingFields,
      validated.errors,
    );
  }
  return validated.value;
}

// ─── Boundary detection ──────────────────────────────────────────────────────

/**
 * Flag every changed file that falls OUTSIDE the task's declared write scope.
 * A file is in-scope when it equals a `scope.filesWrite` entry or lives under a
 * `scope.directories` entry; anything else is a boundary leak (ADR-037 advisory).
 */
export function computeBoundaryViolations(
  changes: readonly FileChange[],
  scope: TaskScope,
): Array<{ path: string; reason: string }> {
  const filesWrite = (scope?.filesWrite ?? []).map(normalizePath).filter(Boolean);
  const directories = (scope?.directories ?? [])
    .map(normalizePath)
    .filter(Boolean)
    .map(d => (d.endsWith('/') ? d : `${d}/`));

  const violations: Array<{ path: string; reason: string }> = [];
  for (const change of changes) {
    const p = normalizePath(change.path);
    const allowed =
      filesWrite.includes(p) || directories.some(dir => p.startsWith(dir));
    if (!allowed) {
      violations.push({ path: change.path, reason: 'outside-declared-scope' });
    }
  }
  return violations;
}

// ─── Default git provider (production) ───────────────────────────────────────

/**
 * Real-git provider — derives the working-tree changes in `projectRoot` with
 * three async `git` queries (ADR-087, no spawnSync):
 *   1. `git diff --numstat HEAD`     → added/removed lines for tracked changes
 *   2. `git diff --name-status HEAD` → status letter (A/M/D/R) for tracked changes
 *   3. `git ls-files --others --exclude-standard` → untracked NEW files (added)
 *
 * Untracked files have no HEAD diff, so their added-line count is read from the
 * file content directly. Repo-wide (no pathspec) so out-of-scope leakage stays
 * visible to {@link computeBoundaryViolations}. Fail-open: any git failure →
 * `{ changes: [], ok: false }` so the caller records `diskVerified:false` rather
 * than fabricating a zero.
 */
export function createDefaultGitChangeProvider(projectRoot: string): GitChangeProvider {
  return {
    async collect(): Promise<GitChangeResult> {
      const numstat = await runGit(projectRoot, ['diff', '--numstat', 'HEAD']);
      const nameStatus = await runGit(projectRoot, ['diff', '--name-status', 'HEAD']);
      const lsOthers = await runGit(projectRoot, [
        'ls-files',
        '--others',
        '--exclude-standard',
      ]);

      // ls-files alone works even on a repo with no commits; the two diffs need a
      // HEAD. Treat the run as verified when at least the untracked listing ran.
      if (!lsOthers.ok) {
        return { changes: [], ok: false };
      }

      const numbers = parseNumstat(numstat.ok ? numstat.stdout : '');
      const statuses = parseNameStatus(nameStatus.ok ? nameStatus.stdout : '');
      const changes: FileChange[] = [];
      const seen = new Set<string>();

      // Tracked changes (modified / deleted / staged-added).
      for (const [path, status] of statuses) {
        const n = numbers.get(path) ?? { added: 0, removed: 0 };
        changes.push({
          path,
          status,
          linesAdded: n.added,
          linesRemoved: n.removed,
        });
        seen.add(path);
      }

      // Untracked NEW files → added; count lines from disk (no HEAD to diff).
      for (const rel of parseLines(lsOthers.stdout)) {
        const path = normalizePath(rel);
        if (!path || seen.has(path)) continue;
        const added = await countFileLines(join(projectRoot, rel));
        changes.push({ path, status: 'added', linesAdded: added, linesRemoved: 0 });
        seen.add(path);
      }

      return { changes, ok: true };
    },
  };
}

// ─── Test seam helper ────────────────────────────────────────────────────────

/** Deterministic provider — tests pass a fixed change set (and ok flag). */
export function makeStaticGitChangeProvider(
  changes: readonly FileChange[],
  ok = true,
): GitChangeProvider {
  const snapshot = changes.map(c => ({ ...c }));
  return { collect: async () => ({ changes: snapshot.map(c => ({ ...c })), ok }) };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface GitRunResult {
  ok: boolean;
  stdout: string;
}

/** Run one `git` invocation asynchronously; fail-open → `{ ok:false, stdout:'' }`. */
function runGit(cwd: string, args: readonly string[]): Promise<GitRunResult> {
  return new Promise(resolve => {
    let stdout = '';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('git', [...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (e) {
      debugLog('result-assembler:runGit:spawn', e);
      resolve({ ok: false, stdout: '' });
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.on('error', e => {
      clearTimeout(timer);
      debugLog('result-assembler:runGit:error', e);
      resolve({ ok: false, stdout: '' });
    });
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout });
    });
  });
}

/** Parse `git diff --numstat` → `path → { added, removed }` (binary `-` → 0). */
function parseNumstat(out: string): Map<string, { added: number; removed: number }> {
  const map = new Map<string, { added: number; removed: number }>();
  for (const line of parseLines(out)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const added = parseGitCount(parts[0]);
    const removed = parseGitCount(parts[1]);
    // For renames numstat may emit a brace path; keep the raw final column.
    const path = normalizePath(parts.slice(2).join('\t'));
    if (path) map.set(path, { added, removed });
  }
  return map;
}

/** Parse `git diff --name-status` → `[path, status]` pairs (A/M/D/R/C → enum). */
function parseNameStatus(out: string): Array<[string, FileChange['status']]> {
  const rows: Array<[string, FileChange['status']]> = [];
  for (const line of parseLines(out)) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const code = (parts[0] ?? '').trim().charAt(0).toUpperCase();
    // Renames/copies report old + new path; the new path is the last column.
    const path = normalizePath(parts[parts.length - 1] ?? '');
    if (!path) continue;
    rows.push([path, mapStatus(code)]);
  }
  return rows;
}

/** Map a git status letter to the contract's status enum. */
function mapStatus(code: string): FileChange['status'] {
  if (code === 'A') return 'added';
  if (code === 'D') return 'deleted';
  // M (modified), R (renamed), C (copied), T (type-change) → modified content.
  return 'modified';
}

/** Count added lines for a new (untracked) file — git-numstat semantics. */
async function countFileLines(absPath: string): Promise<number> {
  try {
    const content = await readFile(absPath, 'utf-8');
    if (content.length === 0) return 0;
    const newlines = (content.match(/\n/g) ?? []).length;
    // A final line without a trailing newline still counts as one added line.
    return content.endsWith('\n') ? newlines : newlines + 1;
  } catch (e) {
    debugLog('result-assembler:countFileLines', e);
    return 0;
  }
}

/** Milliseconds between two ISO timestamps; NaN-safe, clamped non-negative. */
function diffMs(fromIso: string, toIso: string): number | undefined {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return undefined;
  return Math.max(0, to - from);
}

/** Split on newlines, trim, drop empty lines. */
function parseLines(out: string): string[] {
  return out
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

function parseGitCount(raw: string | undefined): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (trimmed === '-' || trimmed === '') return 0; // binary file
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').trim();
}
