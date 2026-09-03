// src/orchestra/process-runtime.ts
// ═══ Process Mode Runtime — F3-008 (mode-transition 3/3) ════════════════════
// The execution kernel for `kind=process` backlog items — the third runtime that
// sits alongside `runTaskMode` (one worker) and `runSprint` (full lifecycle). A
// process is an ORDERED list of steps; each step is either a code task (runTask +
// waitForResult) or a capability invocation (the F8 broker). Steps run STRICTLY
// SEQUENTIALLY: a step starts only after the previous one finished, and the run
// short-circuits on the first failure (no silent continue-on-error, no parallelism).
//
// The outcome is reported in the SAME TaskResult envelope the task/sprint paths
// produce, so the execute-dispatcher writes the backlog `lastResult` identically
// for every kind. An absent / empty / unparseable process definition is an HONEST
// FAILURE (selfAssessment NO_GO with a concrete reason) — never a silent success.
//
// The process definition is read from the entry `spec`, in priority order:
//   1. spec.steps      → structured inline ProcessStep[] (programmatic / tests)
//   2. spec.processRef → a JSON file ({ steps:[...] } or a bare [...] array)
//   3. spec.description → inline JSON ({ steps:[...] } or a bare [...] array)
// (steps/processRef are read structurally — they are not in the closed
// BacklogEntry.spec type; validateBacklogEntry tolerates extra spec fields.)
//
// Policy/RBAC gating is unchanged and lives UPSTREAM of this runtime:
// computeEntryEffectClass + decidePolicy decide auto-vs-park BEFORE dispatch
// (process-controller submit + the autonomous trigger). runProcess only executes
// an entry that has already cleared the gate.

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { ResolvedConfig } from '../core/config-types.js';
import type { CapabilityRegistry } from '../core/capability-broker.js';
import type { CapabilityTarget } from '../core/work-model.js';
import type { TaskResult, SelfAssessment } from '../core/types.js';
import type { BacklogEntry } from './autonomous/backlog-types.js';
import type { FlowReporter } from './autonomous/flow-reporter.js';
import type { TaskResultSettlementRefV1 } from '../core/task-result-settlement.js';
import type { TaskResultAuthorityRead } from './task-result-authority.js';
import type { TaskModeResult } from './task-mode-runner.js';

/** One step of a process — a code task (default) or a capability invocation. */
export interface ProcessStep {
  /** Optional human label for reporting (defaults to `step N`). */
  name?: string;
  /** 'task' (default) → runTask+waitForResult; 'capability' → F8 broker. */
  kind?: 'task' | 'capability';
  /** task: the worker description (required for task steps). */
  description?: string;
  /** task: scope directory (defaults to the entry's, then '.'). */
  scopeDir?: string;
  /** task: per-step provider/model override (else the entry's). */
  provider?: string;
  model?: string;
  /** capability: the F8 target (required for capability steps). */
  capabilityTarget?: CapabilityTarget;
}

/** A process definition — an ordered, non-empty list of steps. */
export interface ProcessDefinition {
  steps: ProcessStep[];
}

/**
 * Launch projection shared by Autonomous and Process consumers.  The fields are
 * optional only for legacy injectors/tests; production `runTaskMode` returns the
 * complete {@link TaskModeResult}.  Exact Docker consumers must inspect
 * `executionMode` before consulting any public `.result` projection.
 */
export interface TaskExecutionLaunchResult {
  readonly taskId?: string;
  readonly settlementRef?: TaskResultSettlementRefV1;
  readonly executionMode?: TaskModeResult['executionMode'];
  readonly resultAuthority?: TaskResultAuthorityRead<TaskResult>;
  readonly invocation?: TaskModeResult['invocation'];
}

export type TaskLaunchResultAuthority =
  | { readonly state: 'exact-accepted'; readonly result: TaskResult }
  | { readonly state: 'exact-hold'; readonly holdReason: string }
  | { readonly state: 'legacy' };

/**
 * Preserve the execution-mode boundary at every production consumer.  An
 * exact Docker launch is eligible only when the host-private accepted-result
 * authority travelled with the launch result; absence or any other authority
 * state is a typed HOLD and can never fall back to worker-writable bytes.
 */
export function inspectTaskLaunchResultAuthority(
  launched: TaskExecutionLaunchResult,
): TaskLaunchResultAuthority {
  if (launched.executionMode !== 'normal-docker-exact') return { state: 'legacy' };

  const authority = launched.resultAuthority;
  const acceptedMetadata = authority?.exactAcceptedAuthority;
  const projectedMetadata = authority?.result
    ? (authority.result as TaskResult & {
        readonly exactAcceptedResultAuthority?: unknown;
      }).exactAcceptedResultAuthority
    : undefined;
  if (
    authority?.state === 'exact-accepted'
    && authority.result
    && acceptedMetadata
    && projectedMetadata === acceptedMetadata
    && authority.result.taskId === acceptedMetadata.identity.taskId
    && (launched.taskId === undefined || launched.taskId === acceptedMetadata.identity.taskId)
    && Array.isArray(authority.result.filesChanged)
    && authority.result.filesChanged.every(path => typeof path === 'string')
    && typeof authority.result.testsPassed === 'boolean'
    && Number.isSafeInteger(authority.result.linesAdded)
    && Number.isSafeInteger(authority.result.linesRemoved)
  ) {
    return { state: 'exact-accepted', result: authority.result };
  }

  const authorityState = authority?.state ?? 'missing';
  return {
    state: 'exact-hold',
    holdReason: authority?.state === 'exact-accepted'
      ? `EXACT_RESULT_AUTHORITY_HOLD:${authorityState}:projection-or-identity-mismatch`
      : authority?.holdReason
      ? `EXACT_RESULT_AUTHORITY_HOLD:${authorityState}:${authority.holdReason}`
      : `EXACT_RESULT_AUTHORITY_HOLD:${authorityState}`,
  };
}

/** Deps for {@link runProcess} — a subset of the execute-dispatcher's deps,
 *  defined locally so process-runtime never imports the dispatcher (no cycle). */
export interface RunProcessDeps {
  projectRoot: string;
  config: ResolvedConfig;
  /** Injected runTaskMode (same signature the dispatcher's task branch uses). */
  runTask: (
    ctx: { projectRoot: string; description: string; model?: string; provider?: string; scope?: { directories: string[] } },
    config: ResolvedConfig,
  ) => Promise<TaskExecutionLaunchResult | null | undefined>;
  /** Wait for a launched task's `.result` (null on timeout). */
  waitForResult: (
    projectRoot: string,
    taskId: string,
    timeoutMs: number,
    opts?: { settlementRef?: TaskResultSettlementRefV1 },
  ) => Promise<TaskResult | null>;
  /** Max ms to wait per task step (defaults to 600_000, matching the dispatcher). */
  resultTimeoutMs?: number;
  /** F8 capability broker — required only if the process contains capability steps. */
  capabilityRegistry?: CapabilityRegistry;
  /** Optional dual-channel flow emitter (reuses the 'spawned' step per process step). */
  flow?: FlowReporter;
}

/** Coerce a raw value into a non-empty `ProcessStep[]`, or null. Accepts either a
 *  `{ steps: [...] }` wrapper or a bare `[...]` array; each element must be a plain
 *  object. An empty array is rejected (a process with no steps is not a process). */
function coerceSteps(raw: unknown): ProcessStep[] | null {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { steps?: unknown }).steps)
      ? (raw as { steps: unknown[] }).steps
      : null;
  if (!arr || arr.length === 0) return null;
  for (const el of arr) {
    if (!el || typeof el !== 'object' || Array.isArray(el)) return null;
  }
  return arr as ProcessStep[];
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Read a {@link ProcessDefinition} from a backlog entry, or null when none is
 * present/valid (caller treats null as an honest failure). Sources are read in
 * priority order: structured `spec.steps` → `spec.processRef` file → inline JSON
 * in `spec.description`. A `processRef` that points at a missing/invalid file
 * returns null (referenced-but-broken is a definition error, not a fall-through).
 */
export function readProcessDefinition(entry: BacklogEntry, projectRoot: string): ProcessDefinition | null {
  // steps/processRef are not in the closed BacklogEntry.spec type — read defensively.
  const spec = entry.spec as unknown as { steps?: unknown; processRef?: unknown; description?: unknown };

  // 1. Structured inline steps (the ergonomic programmatic form).
  const structured = coerceSteps(spec.steps);
  if (structured) return { steps: structured };

  // 2. File reference — a process definition stored on disk (reusable / large).
  if (typeof spec.processRef === 'string' && spec.processRef.trim()) {
    const p = isAbsolute(spec.processRef) ? spec.processRef : resolve(projectRoot, spec.processRef);
    let parsed: unknown = null;
    try {
      parsed = tryParseJson(readFileSync(p, 'utf-8'));
    } catch {
      parsed = null; // unreadable file → honest-fail below
    }
    return coerceSteps(parsed) ? { steps: coerceSteps(parsed)! } : null;
  }

  // 3. Inline JSON in the description (covers a plain backlog.json with no schema change).
  if (typeof spec.description === 'string') {
    const fromDesc = coerceSteps(tryParseJson(spec.description));
    if (fromDesc) return { steps: fromDesc };
  }

  return null;
}

/** Build the aggregate TaskResult envelope a process reports. */
function makeProcessResult(
  entry: BacklogEntry,
  selfAssessment: SelfAssessment,
  notes: string,
  agg: { filesChanged?: string[] } = {},
): TaskResult {
  return {
    taskId: entry.id,
    workerId: `process-${entry.id}`,
    filesChanged: agg.filesChanged ?? [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: selfAssessment !== 'NO_GO',
    coverage: 0,
    selfAssessment,
    notes,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Execute a `kind=process` backlog entry — run its steps sequentially and report
 * the aggregate outcome in a standard TaskResult envelope.
 *
 * Sequencing contract: step N+1 begins only after step N has FULLY resolved. The
 * first failing step short-circuits the run (remaining steps are not started) and
 * yields a NO_GO. A missing/invalid definition is an honest NO_GO before any step.
 *
 * Aggregate verdict: all steps pass → DONE; any task step GO_WITH_TECH_DEBT (and
 * none NO_GO) → GO_WITH_TECH_DEBT; any failure → NO_GO.
 */
export async function runProcess(entry: BacklogEntry, deps: RunProcessDeps): Promise<TaskResult> {
  const timeoutMs = deps.resultTimeoutMs ?? 600_000;

  const def = readProcessDefinition(entry, deps.projectRoot);
  if (!def) {
    return makeProcessResult(
      entry,
      'NO_GO',
      'process definition missing or invalid — provide spec.steps, spec.processRef, ' +
        'or inline JSON in spec.description with a non-empty steps array',
    );
  }

  const filesChanged: string[] = [];
  let anyTechDebt = false;

  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i]!;
    const label = step.name ?? `step ${i + 1}`;
    const stepKind = step.kind ?? 'task';
    deps.flow?.step('spawned', entry.id, `process ${label} (${stepKind})`);

    if (stepKind === 'capability') {
      const target = step.capabilityTarget;
      if (!target) {
        return makeProcessResult(entry, 'NO_GO', `${label}: capability step has no capabilityTarget`, { filesChanged });
      }
      if (!deps.capabilityRegistry) {
        return makeProcessResult(entry, 'NO_GO', `${label}: no capability registry wired into the process runtime`, { filesChanged });
      }
      const r = await deps.capabilityRegistry.invoke(target, {
        projectRoot: deps.projectRoot,
        // Audit lineage mirrors the dispatcher's capability branch: prefer the
        // entry's real principal, else a tenant-scoped 'system' actor.
        actor: entry.actor ?? (entry.tenant ? { id: 'system', tenantId: entry.tenant } : { id: 'system' }),
      });
      if (!r.ok) {
        return makeProcessResult(entry, 'NO_GO', `${label} failed: ${r.code}: ${r.error}`, { filesChanged });
      }
      continue;
    }

    // task step
    const description = (step.description ?? '').trim();
    if (!description) {
      return makeProcessResult(entry, 'NO_GO', `${label}: task step has no description`, { filesChanged });
    }
    const launched = (await deps.runTask(
      {
        projectRoot: deps.projectRoot,
        description,
        model: step.model ?? entry.model,
        provider: step.provider ?? entry.provider,
        scope: { directories: [step.scopeDir ?? entry.spec.scopeDir ?? '.'] },
      },
      deps.config,
    ));

    const taskId = launched?.taskId;
    if (!taskId) {
      return makeProcessResult(entry, 'NO_GO', `${label}: runTask returned no taskId (completion not trackable)`, { filesChanged });
    }
    const launchAuthority = inspectTaskLaunchResultAuthority(launched);
    if (launchAuthority.state === 'exact-hold') {
      return makeProcessResult(
        entry,
        'NO_GO',
        `${label}: ${launchAuthority.holdReason}`,
        { filesChanged },
      );
    }
    const result = launchAuthority.state === 'exact-accepted'
      ? launchAuthority.result
      : launched.settlementRef
        ? await deps.waitForResult(
            deps.projectRoot,
            taskId,
            timeoutMs,
            { settlementRef: launched.settlementRef },
          )
        : await deps.waitForResult(deps.projectRoot, taskId, timeoutMs);
    if (!result) {
      return makeProcessResult(entry, 'NO_GO', `${label}: timeout — no result within limit`, { filesChanged });
    }
    if (Array.isArray(result.filesChanged)) filesChanged.push(...result.filesChanged);
    if (result.selfAssessment === 'NO_GO') {
      return makeProcessResult(entry, 'NO_GO', `${label} failed: ${result.notes || 'worker reported NO_GO'}`, { filesChanged });
    }
    if (result.selfAssessment === 'GO_WITH_TECH_DEBT') anyTechDebt = true;
  }

  const assessment: SelfAssessment = anyTechDebt ? 'GO_WITH_TECH_DEBT' : 'DONE';
  return makeProcessResult(
    entry,
    assessment,
    `process completed: ${def.steps.length} step(s) ran sequentially`,
    { filesChanged },
  );
}
