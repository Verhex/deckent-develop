// ═══ run-flow-plan-service — canonical proposal → exact plan authority ═══════
//
// Surfaces supply one of two explicit source adapters:
//   - intent: compile a domain RunProposal to DIRECTIVES exactly once;
//   - directives: consume an already adapter-compiled BrainContext.
//
// Both converge here before any durable flow transition. The service generates
// one real preview, canonicalizes dependency references before the final digest,
// persists the exact Sprint plus its source authority, appends the durable
// proposal/preview event chain, and optionally records owner approval through
// the shared decision service. No task-file projection or process spawn belongs
// in this layer.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import { canonicalJson } from '../core/audit-writer.js';
import {
  computeExecutionPlanDigestByVersion,
  computeExecutionPlanDigestV4,
  type ExecutionPlanDigestContext,
} from '../core/execution-plan-digest.js';
import type {
  PlanPreview,
  RunFlowContext,
  RunFlowGateResult,
  RunFlowPlanLineageRecord,
  RunFlowPolicyDecision,
  RunFlowProjectionAdoptionRecord,
  RunProposal,
} from '../core/run-flow-contract.js';
import {
  loadPlannedSprint,
  savePlannedSprint,
  type StoredPlannedSprint,
} from '../core/run-flow-store.js';
import {
  TaskStatus,
  type BrainContext,
  type ResolvedConfig,
  type Sprint,
  type SprintSizeRecommendation,
} from '../core/types.js';
import type {
  ActorContext,
} from '../core/work-model.js';
import {
  applyScopeResolutions,
  evaluateScopeGate,
} from '../core/scope-gate.js';
import { getRunFlowCoordinator } from './run-flow-coordinator-registry.js';
import {
  decideRunFlow,
  type DecideRunFlowInput,
} from './run-flow-decision-service.js';
import {
  generatePlanPreview,
  type PlanPreviewOptions,
} from './plan-preview-service.js';
import { normalizePlannerDependencies } from './planner.js';
import {
  compileRunProposal,
  type RunProposalPlanner,
} from './run-proposal-compiler.js';
import {
  inspectStructuredCriteriaProjectionAdoption,
  TaskArtifactProjectionError,
} from './task-artifact-projection.js';
import {
  evaluateExecutionWriteScopePolicy,
  normalizeExecutionWriteScopePolicy,
} from '../core/execution-write-scope-policy.js';

export const RUN_FLOW_PLAN_SOURCE_AUTHORITY_SCHEMA_VERSION = 1 as const;

export type RunFlowPlanServiceErrorCode =
  | 'FLOW_ID_CONFLICT'
  | 'UNRESOLVED_DEPENDENCY'
  | 'PERSISTED_PLAN_INVALID'
  | 'PROJECTION_ADOPTION_HOLD'
  | 'TOPOLOGY_HOLD'
  | 'PROMPT_GATE_HOLD'
  | 'SCOPE_GATE_HOLD'
  | 'CLOSED_WRITE_SCOPE_HOLD';

export class RunFlowPlanServiceError extends Error {
  constructor(
    readonly code: RunFlowPlanServiceErrorCode,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = 'RunFlowPlanServiceError';
  }
}

export interface RunFlowPlanSourceAuthority {
  readonly schemaVersion: typeof RUN_FLOW_PLAN_SOURCE_AUTHORITY_SCHEMA_VERSION;
  readonly sourceKind: 'intent' | 'directives';
  readonly contentSha256: string;
  readonly configSha256: string;
  readonly proposalSha256: string;
  /** Full plan-affecting input: context + config + recommendation + flags. */
  readonly planningInputSha256: string;
  /** Exact tracked-file evidence consumed by the plan-time scope gate. */
  readonly scopeInputSha256: string;
  readonly lineageSha256: string;
}

export type RunFlowPlanLineage = RunFlowPlanLineageRecord;

export interface IntentRunFlowPlanSource {
  readonly sourceKind: 'intent';
  /** Repository context to retain while replacing only its DIRECTIVES adapter. */
  readonly baseContext: BrainContext;
  /** Optional test/application seam; production uses the canonical planner. */
  readonly planner?: RunProposalPlanner;
}

export interface DirectivesRunFlowPlanSource {
  readonly sourceKind: 'directives';
  /** Canonical adapter output, normally readContext(root). */
  readonly brainContext: BrainContext;
}

export type RunFlowPlanSource =
  | IntentRunFlowPlanSource
  | DirectivesRunFlowPlanSource;

export interface RunFlowProjectionAdoptionInput {
  readonly kind: 'structured-criteria-projection';
  readonly sprintId: string;
  readonly expectedPlanDigest: string;
  readonly expectedLegacyProjectionDigest: string;
  readonly expectedCanonicalProjectionDigest: string;
  readonly authorizedBy: ActorContext;
  readonly authorizedAt: string;
  readonly justification: string;
}

export interface PlanRunFlowInput {
  readonly projectRoot: string;
  readonly config: ResolvedConfig;
  readonly recommendation: SprintSizeRecommendation;
  readonly proposal: RunProposal;
  readonly lineage: RunFlowPlanLineage;
  readonly source: RunFlowPlanSource;
  readonly previewOptions?: PlanPreviewOptions;
  readonly acknowledgeScopePaths?: boolean;
  /** Optional platform-adapter evidence. Production surfaces normally omit it
   * and use the bounded git adapter; hermetic hosts can inject an equivalent
   * authoritative snapshot without spawning a subprocess. */
  readonly scopeEvidence?: RunFlowScopeEvidence;
  /**
   * Explicit one-time recovery authority for a legacy task-file projection.
   * Omitting it keeps exact planning strictly no-clobber.
   */
  readonly projectionAdoption?: RunFlowProjectionAdoptionInput;
  /** Optional owner decision. Omit when a surface must render before asking. */
  readonly approval?: {
    readonly actor: ActorContext;
    /** Required when a blocking prompt gate was explicitly overridden. */
    readonly acknowledgePromptGate?: boolean;
    /** Required when suspect paths were explicitly accepted. */
    readonly acknowledgeScopePaths?: boolean;
  };
}

export interface PlanRunFlowResult {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly sprint: Sprint;
  readonly preview: PlanPreview;
  readonly context: RunFlowContext;
  readonly sourceAuthority: RunFlowPlanSourceAuthority;
  readonly lineage: RunFlowPlanLineage;
  readonly projectionAdoption?: RunFlowProjectionAdoptionRecord;
  readonly approval: 'awaiting' | 'approved';
  /** True when an idempotent retry reused the already-durable exact plan. */
  readonly reusedDurablePlan: boolean;
}

interface DurableRunFlowPlanRecord extends StoredPlannedSprint {
  readonly sprint: Sprint;
  readonly planDigest: string;
  readonly planDigestVersion: number;
  readonly planDigestContext: ExecutionPlanDigestContext;
  readonly proposal: RunProposal;
  readonly preview: PlanPreview;
  readonly sourceAuthority: RunFlowPlanSourceAuthority;
  readonly lineage: RunFlowPlanLineage;
  readonly projectionAdoption?: RunFlowProjectionAdoptionRecord;
}

export interface RunFlowScopeEvidence {
  readonly status: 'available' | 'unavailable';
  readonly trackedFiles: readonly string[];
}

type ScopeInput = RunFlowScopeEvidence;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isCanonicalIsoTimestamp(value: string): boolean {
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function stableProjectionAdoptionAuthority(
  input: RunFlowProjectionAdoptionInput | undefined,
): Omit<RunFlowProjectionAdoptionInput, 'authorizedAt'> | null {
  if (!input) return null;
  const { authorizedAt: _authorizedAt, ...stable } = input;
  return stable;
}

function buildSourceAuthority(
  proposal: RunProposal,
  source: RunFlowPlanSource,
  config: ResolvedConfig,
  recommendation: SprintSizeRecommendation,
  previewOptions: PlanPreviewOptions | undefined,
  acknowledgeScopePaths: boolean,
  scopeInput: ScopeInput,
  lineage: RunFlowPlanLineage,
  projectionAdoption: RunFlowProjectionAdoptionInput | undefined,
): RunFlowPlanSourceAuthority {
  const content = source.sourceKind === 'intent'
    ? proposal.intentSummary
    : source.brainContext.directives;
  const context = source.sourceKind === 'intent'
    ? source.baseContext
    : source.brainContext;
  return Object.freeze({
    schemaVersion: RUN_FLOW_PLAN_SOURCE_AUTHORITY_SCHEMA_VERSION,
    sourceKind: source.sourceKind,
    contentSha256: sha256(content),
    configSha256: sha256(canonicalJson(config)),
    proposalSha256: sha256(canonicalJson(proposal)),
    planningInputSha256: sha256(canonicalJson({
      sourceKind: source.sourceKind,
      proposal,
      context,
      config,
      recommendation,
      previewOptions: previewOptions ?? null,
      acknowledgeScopePaths,
      scopeInput,
      lineage,
      projectionAdoption: stableProjectionAdoptionAuthority(projectionAdoption),
    })),
    scopeInputSha256: sha256(canonicalJson(scopeInput)),
    lineageSha256: sha256(canonicalJson(lineage)),
  });
}

function sourceAuthorityMatches(
  actual: RunFlowPlanSourceAuthority | undefined,
  expected: RunFlowPlanSourceAuthority,
): boolean {
  return actual?.schemaVersion === expected.schemaVersion
    && actual.sourceKind === expected.sourceKind
    && actual.contentSha256 === expected.contentSha256
    && actual.configSha256 === expected.configSha256
    && actual.proposalSha256 === expected.proposalSha256
    && actual.planningInputSha256 === expected.planningInputSha256
    && actual.scopeInputSha256 === expected.scopeInputSha256
    && actual.lineageSha256 === expected.lineageSha256;
}

function computePolicyDecision(
  promptGateResult: RunFlowGateResult,
  topologyGateResult: RunFlowGateResult,
): RunFlowPolicyDecision {
  if (topologyGateResult === 'fail') return 'deny';
  return promptGateResult === 'fail' ? 'needs-approval' : 'allow';
}

function asDurableRecord(record: StoredPlannedSprint | undefined): DurableRunFlowPlanRecord | undefined {
  if (!record) return undefined;
  const candidate = record as Partial<DurableRunFlowPlanRecord>;
  if (
    candidate.sourceAuthority?.schemaVersion !== RUN_FLOW_PLAN_SOURCE_AUTHORITY_SCHEMA_VERSION
    || !candidate.proposal
    || !candidate.preview
    || !candidate.planDigest
    || candidate.planDigestVersion === undefined
    || !candidate.planDigestContext
    || !candidate.sprint
  ) {
    return undefined;
  }
  return candidate as DurableRunFlowPlanRecord;
}

function listTrackedFiles(projectRoot: string, timeoutMs = 10_000): Promise<ScopeInput> {
  return new Promise((resolve) => {
    let stdout = '';
    let settled = false;
    let child: ReturnType<typeof spawn>;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: ScopeInput): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    try {
      child = spawn('git', ['ls-files'], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      resolve({ status: 'unavailable', trackedFiles: [] });
      return;
    }
    timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // Process may already be terminal.
      }
      finish({ status: 'unavailable', trackedFiles: [] });
    }, timeoutMs);
    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 64 * 1024 * 1024) {
        try {
          child.kill('SIGTERM');
        } catch {
          // Process may already be terminal.
        }
        finish({ status: 'unavailable', trackedFiles: [] });
      }
    });
    child.on('error', () => finish({ status: 'unavailable', trackedFiles: [] }));
    child.on('close', (code) => {
      if (code !== 0) {
        finish({ status: 'unavailable', trackedFiles: [] });
        return;
      }
      finish({
        status: 'available',
        trackedFiles: stdout.split(/\r?\n/).filter(Boolean),
      });
    });
  });
}

function assertCanonicalDependencies(sprint: Sprint): void {
  const taskIds = new Set(sprint.tasks.map(task => task.id));
  for (const task of sprint.tasks) {
    const seen = new Set<string>();
    for (const dependency of task.dependencies) {
      if (!taskIds.has(dependency) || dependency === task.id || seen.has(dependency)) {
        throw new RunFlowPlanServiceError(
          'PERSISTED_PLAN_INVALID',
          { taskId: task.id, dependency, reason: 'dependency_not_canonical' },
        );
      }
      seen.add(dependency);
    }
  }
}

function normalizeExecutableStatuses(sprint: Sprint): void {
  for (const task of sprint.tasks) task.status = TaskStatus.PENDING;
}

function assertExecutableStatuses(sprint: Sprint): void {
  for (const task of sprint.tasks) {
    if (task.status !== TaskStatus.PENDING) {
      throw new RunFlowPlanServiceError('PERSISTED_PLAN_INVALID', {
        taskId: task.id,
        status: task.status,
        reason: 'task_status_not_executable',
      });
    }
  }
}

function buildResult(
  record: DurableRunFlowPlanRecord,
  context: RunFlowContext,
  reusedDurablePlan: boolean,
): PlanRunFlowResult {
  return {
    flowId: record.flowId,
    revision: record.revision,
    planDigest: record.planDigest,
    sprint: record.sprint,
    preview: record.preview,
    context,
    sourceAuthority: record.sourceAuthority,
    lineage: record.lineage,
    ...(record.projectionAdoption !== undefined
      ? { projectionAdoption: record.projectionAdoption }
      : {}),
    approval: context.state === 'APPROVED' ? 'approved' : 'awaiting',
    reusedDurablePlan,
  };
}

function verifyReusableRecord(
  record: DurableRunFlowPlanRecord,
  input: PlanRunFlowInput,
  authority: RunFlowPlanSourceAuthority,
): void {
  if (
    record.flowId !== input.proposal.flowId
    || record.revision !== input.proposal.revision
    || canonicalJson(record.proposal) !== canonicalJson(input.proposal)
    || canonicalJson(record.lineage) !== canonicalJson(input.lineage)
    || !sourceAuthorityMatches(record.sourceAuthority, authority)
    || record.preview.flowId !== record.flowId
    || record.preview.revision !== record.revision
    || record.preview.planDigest !== record.planDigest
    || record.preview.planDigestVersion !== record.planDigestVersion
    || (
      input.projectionAdoption === undefined
        ? record.projectionAdoption !== undefined
        : record.projectionAdoption === undefined
          || record.projectionAdoption.sprintId !== input.projectionAdoption.sprintId
          || record.projectionAdoption.expectedPlanDigest
            !== input.projectionAdoption.expectedPlanDigest
          || record.projectionAdoption.legacyProjectionDigest
            !== input.projectionAdoption.expectedLegacyProjectionDigest
          || record.projectionAdoption.canonicalProjectionDigest
            !== input.projectionAdoption.expectedCanonicalProjectionDigest
          || canonicalJson(record.projectionAdoption.authorizedBy)
            !== canonicalJson(input.projectionAdoption.authorizedBy)
          || record.projectionAdoption.justification
            !== input.projectionAdoption.justification.trim()
    )
  ) {
    throw new RunFlowPlanServiceError(
      'FLOW_ID_CONFLICT',
      { flowId: input.proposal.flowId, reason: 'authority_mismatch' },
    );
  }
  assertCanonicalDependencies(record.sprint);
  assertExecutableStatuses(record.sprint);
  const recomputed = computeExecutionPlanDigestByVersion(
    record.planDigestVersion,
    record.sprint,
    record.planDigestContext,
  );
  if (recomputed.digest !== record.planDigest) {
    throw new RunFlowPlanServiceError(
      'PERSISTED_PLAN_INVALID',
      {
        flowId: record.flowId,
        expectedPlanDigest: record.planDigest,
        actualPlanDigest: recomputed.digest,
      },
    );
  }
}

function assertApprovalAuthority(
  record: DurableRunFlowPlanRecord,
  approval: NonNullable<PlanRunFlowInput['approval']>,
): void {
  if (
    record.projectionAdoption
    && canonicalJson(record.projectionAdoption.authorizedBy)
      !== canonicalJson(approval.actor)
  ) {
    throw new RunFlowPlanServiceError('PROJECTION_ADOPTION_HOLD', {
      flowId: record.flowId,
      reason: 'approval_actor_mismatch',
    });
  }
  if (
    record.preview.scopeGateResult === 'fail'
    && record.preview.scopeGateOverridden !== true
  ) {
    throw new RunFlowPlanServiceError('SCOPE_GATE_HOLD', {
      flowId: record.flowId,
      revision: record.revision,
      planDigest: record.planDigest,
    });
  }
  if (
    record.preview.scopeGateOverridden === true
    && approval.acknowledgeScopePaths !== true
  ) {
    throw new RunFlowPlanServiceError('SCOPE_GATE_HOLD', {
      flowId: record.flowId,
      revision: record.revision,
      planDigest: record.planDigest,
      overrideApplied: true,
      approvalAcknowledged: false,
    });
  }
  if (
    record.preview.policyDecision === 'deny'
    || record.preview.topologyGateResult === 'fail'
    || record.preview.topology?.verdict === 'block'
  ) {
    throw new RunFlowPlanServiceError('TOPOLOGY_HOLD', {
      flowId: record.flowId,
      revision: record.revision,
      planDigest: record.planDigest,
    });
  }
  if (
    record.preview.gateResult === 'fail'
    && (
      approval.acknowledgePromptGate !== true
      || record.sprint.promptGate?.overrideApplied !== true
    )
  ) {
    throw new RunFlowPlanServiceError('PROMPT_GATE_HOLD', {
      flowId: record.flowId,
      revision: record.revision,
      planDigest: record.planDigest,
      overrideApplied: record.sprint.promptGate?.overrideApplied === true,
    });
  }
}

function ensureDurableEventChain(
  projectRoot: string,
  record: DurableRunFlowPlanRecord,
): RunFlowContext {
  const coordinator = getRunFlowCoordinator(projectRoot);
  coordinator.proposeFlow({
    proposal: record.proposal,
    commandId: `propose-${record.flowId}-r${record.revision}`,
  });
  return coordinator.recordPreview({
    preview: record.preview,
    commandId: `preview-${record.flowId}-r${record.revision}`,
  }).context;
}

/**
 * Generate and durably bind one exact plan. A retry with the same flow,
 * proposal, source bytes and config reuses the stored record without invoking
 * either compiler or planner again. Any mismatch is a typed conflict.
 */
export async function planRunFlow(input: PlanRunFlowInput): Promise<PlanRunFlowResult> {
  if (
    input.lineage.tenantId.trim().length === 0
    || input.lineage.correlationId.trim().length === 0
    || input.lineage.idempotencyKey.trim().length === 0
    || input.lineage.tenantId !== input.proposal.tenant
    || canonicalJson(input.lineage.actor) !== canonicalJson(input.proposal.actor)
    || input.lineage.origin !== input.proposal.origin
  ) {
    throw new RunFlowPlanServiceError('PERSISTED_PLAN_INVALID', {
      flowId: input.proposal.flowId,
      reason: 'lineage_identity_missing',
    });
  }
  let previewOptions = input.previewOptions;
  if (input.previewOptions?.writeScopePolicy) {
    try {
      previewOptions = {
        ...input.previewOptions,
        writeScopePolicy: normalizeExecutionWriteScopePolicy(
          input.previewOptions.writeScopePolicy,
        ),
      };
    } catch (error) {
      throw new RunFlowPlanServiceError('CLOSED_WRITE_SCOPE_HOLD', {
        flowId: input.proposal.flowId,
        reason: 'closed_write_scope_invalid',
        diagnostic: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const scopeInput = input.scopeEvidence ?? await listTrackedFiles(input.projectRoot);
  const authority = buildSourceAuthority(
    input.proposal,
    input.source,
    input.config,
    input.recommendation,
    previewOptions,
    input.acknowledgeScopePaths === true,
    scopeInput,
    input.lineage,
    input.projectionAdoption,
  );
  const latest = loadPlannedSprint(input.projectRoot, input.proposal.flowId);
  const reusable = asDurableRecord(latest);

  if (latest && !reusable) {
    throw new RunFlowPlanServiceError(
      'FLOW_ID_CONFLICT',
      { flowId: input.proposal.flowId, reason: 'legacy_or_incomplete_plan_record' },
    );
  }

  if (reusable) {
    verifyReusableRecord(reusable, input, authority);
    let context = ensureDurableEventChain(input.projectRoot, reusable);
    if (input.approval && context.state !== 'APPROVED') {
      assertApprovalAuthority(reusable, input.approval);
      context = decideRunFlow(input.projectRoot, reusable.flowId, {
        decision: 'approve',
        actor: input.approval.actor,
      });
    }
    return buildResult(reusable, context, true);
  }

  const brainContext = input.source.sourceKind === 'intent'
    ? {
        ...input.source.baseContext,
        directives: (
          await compileRunProposal(
            input.proposal,
            input.source.planner,
            input.config,
          )
        ).directivesMarkdown,
      }
    : input.source.brainContext;

  // Exactly one plan-generation call for a new source authority.
  const generated = await generatePlanPreview(
    input.projectRoot,
    input.config,
    brainContext,
    input.recommendation,
    previewOptions,
  );

  // The scheduler historically normalized these references at spawn time,
  // mutating the approved Sprint after digest. Exact plans normalize before
  // their final digest and reject any dependency that cannot bind to a sibling.
  const dependencyNormalization = normalizePlannerDependencies(generated.sprint.tasks);
  if (dependencyNormalization.dropped.length > 0) {
    const detail = dependencyNormalization.dropped
      .map(item => `${item.taskId}<-${item.ref}`)
      .join(', ');
    throw new RunFlowPlanServiceError(
      'UNRESOLVED_DEPENDENCY',
      {
        flowId: input.proposal.flowId,
        dependencies: dependencyNormalization.dropped,
        diagnostic: detail,
      },
    );
  }
  assertCanonicalDependencies(generated.sprint);
  normalizeExecutableStatuses(generated.sprint);
  assertExecutableStatuses(generated.sprint);

  const writeScopePolicy = previewOptions?.writeScopePolicy;
  if (writeScopePolicy) {
    if (scopeInput.status !== 'available') {
      throw new RunFlowPlanServiceError('CLOSED_WRITE_SCOPE_HOLD', {
        flowId: input.proposal.flowId,
        reason: 'tracked_scope_evidence_unavailable',
      });
    }
    const closedScope = evaluateExecutionWriteScopePolicy({
      policy: writeScopePolicy,
      tasks: generated.sprint.tasks,
      trackedFiles: scopeInput.trackedFiles,
    });
    if (!closedScope.ok) {
      throw new RunFlowPlanServiceError('CLOSED_WRITE_SCOPE_HOLD', {
        flowId: input.proposal.flowId,
        reason: 'closed_write_scope_violation',
        violations: closedScope.violations,
      });
    }
  }

  // Exact authority is fail-closed when repository scope evidence cannot be
  // acquired. `skipped` is reserved for legacy/non-exact projections.
  let scopeGateResult: RunFlowGateResult =
    scopeInput.status === 'available' ? 'skipped' : 'fail';
  let scopeGateMessage: string | undefined;
  let scopeGateOverridden = false;
  if (scopeInput.status === 'available') {
    const scopeGate = evaluateScopeGate({
      tasks: generated.sprint.tasks.map(task => ({
        id: task.id,
        scope: task.scope ?? {},
      })),
      trackedFiles: [...scopeInput.trackedFiles],
      acknowledgeScopePaths: input.acknowledgeScopePaths === true,
      resolveSuggestions: true,
    });
    if (!scopeGate.ok) {
      scopeGateResult = 'fail';
      scopeGateMessage = scopeGate.message;
    } else {
      scopeGateResult = 'pass';
      scopeGateOverridden = scopeGate.overrideApplied === true;
      if (scopeGate.resolutions && scopeGate.resolutions.length > 0) {
        for (const task of generated.sprint.tasks) {
          const resolved = applyScopeResolutions(
            task.id,
            task.scope.filesWrite,
            scopeGate.resolutions,
          );
          if (resolved.applied.length > 0) {
            task.scope = { ...task.scope, filesWrite: resolved.filesWrite };
          }
        }
        const revalidated = evaluateScopeGate({
          tasks: generated.sprint.tasks.map(task => ({
            id: task.id,
            scope: task.scope ?? {},
          })),
          trackedFiles: [...scopeInput.trackedFiles],
          acknowledgeScopePaths: input.acknowledgeScopePaths === true,
          resolveSuggestions: false,
        });
        if (!revalidated.ok || (revalidated.resolutions?.length ?? 0) > 0) {
          throw new RunFlowPlanServiceError('PERSISTED_PLAN_INVALID', {
            flowId: input.proposal.flowId,
            reason: 'scope_resolution_not_idempotent',
          });
        }
        scopeGateOverridden = revalidated.overrideApplied === true;
      }
    }
  }

  const digest = computeExecutionPlanDigestV4(
    generated.sprint,
    generated.planDigestContext,
  );
  let canonicalSprint = generated.sprint;
  let projectionAdoption: RunFlowProjectionAdoptionRecord | undefined;
  if (input.projectionAdoption) {
    const requested = input.projectionAdoption;
    const justification = requested.justification.trim();
    if (
      requested.kind !== 'structured-criteria-projection'
      || requested.sprintId !== generated.sprint.id
      || !/^[a-f0-9]{64}$/.test(requested.expectedPlanDigest)
      || !/^[a-f0-9]{64}$/.test(requested.expectedLegacyProjectionDigest)
      || !/^[a-f0-9]{64}$/.test(requested.expectedCanonicalProjectionDigest)
      || requested.expectedPlanDigest !== digest.digest
      || requested.authorizedBy.id.trim().length === 0
      || !isCanonicalIsoTimestamp(requested.authorizedAt)
      || justification.length < 8
      || justification.length > 2_000
    ) {
      throw new RunFlowPlanServiceError('PROJECTION_ADOPTION_HOLD', {
        flowId: input.proposal.flowId,
        reason: 'adoption_authority_invalid',
      });
    }
    let inspected;
    try {
      inspected = inspectStructuredCriteriaProjectionAdoption(
        input.projectRoot,
        requested.sprintId,
        generated.sprint.tasks,
      );
    } catch (cause) {
      if (cause instanceof TaskArtifactProjectionError) {
        throw new RunFlowPlanServiceError('PROJECTION_ADOPTION_HOLD', {
          flowId: input.proposal.flowId,
          reason: cause.code,
          ...cause.details,
        });
      }
      throw cause;
    }
    if (
      inspected.legacyProjectionDigest !== requested.expectedLegacyProjectionDigest
      || inspected.canonicalProjectionDigest !== requested.expectedCanonicalProjectionDigest
    ) {
      throw new RunFlowPlanServiceError('PROJECTION_ADOPTION_HOLD', {
        flowId: input.proposal.flowId,
        reason: 'projection_digest_mismatch',
        actualLegacyProjectionDigest: inspected.legacyProjectionDigest,
        actualCanonicalProjectionDigest: inspected.canonicalProjectionDigest,
      });
    }
    canonicalSprint = {
      ...generated.sprint,
      tasks: [...inspected.canonicalTasks],
    };
    const adoptedDigest = computeExecutionPlanDigestV4(
      canonicalSprint,
      generated.planDigestContext,
    );
    if (adoptedDigest.digest !== digest.digest) {
      throw new RunFlowPlanServiceError('PROJECTION_ADOPTION_HOLD', {
        flowId: input.proposal.flowId,
        reason: 'canonical_projection_execution_drift',
        expectedPlanDigest: digest.digest,
        actualPlanDigest: adoptedDigest.digest,
      });
    }
    projectionAdoption = {
      schemaVersion: 1,
      kind: requested.kind,
      sprintId: requested.sprintId,
      taskCount: canonicalSprint.tasks.length,
      expectedPlanDigest: requested.expectedPlanDigest,
      legacyProjectionDigest: requested.expectedLegacyProjectionDigest,
      canonicalProjectionDigest: requested.expectedCanonicalProjectionDigest,
      authorizedBy: requested.authorizedBy,
      authorizedAt: requested.authorizedAt,
      justification,
    };
  }
  const topologyGateResult: RunFlowGateResult =
    digest.topology.verdict === 'pass' ? 'pass' : 'fail';
  const promptGateResult: RunFlowGateResult = generated.sprint.promptGate
    ? (generated.sprint.promptGate.ok ? 'pass' : 'fail')
    : 'skipped';
  const gateResult: RunFlowGateResult =
    promptGateResult === 'fail'
      || topologyGateResult === 'fail'
      || scopeGateResult === 'fail'
      ? 'fail'
      : promptGateResult;

  const preview: PlanPreview = {
    flowId: input.proposal.flowId,
    revision: input.proposal.revision,
    planDigest: digest.digest,
    planDigestVersion: digest.version,
    planDigestContext: generated.planDigestContext,
    taskSummaries: generated.taskSummaries,
    policyDecision: scopeGateResult === 'fail'
      ? 'deny'
      : computePolicyDecision(promptGateResult, topologyGateResult),
    gateResult,
    ...(generated.gateFindings.length > 0
      ? { gateFindings: generated.gateFindings }
      : {}),
    topology: digest.topology,
    topologyGateResult,
    scopeGateResult,
    ...(scopeGateMessage !== undefined ? { scopeGateMessage } : {}),
    ...(scopeGateOverridden ? { scopeGateOverridden: true } : {}),
  };

  const record: DurableRunFlowPlanRecord = {
    flowId: input.proposal.flowId,
    revision: input.proposal.revision,
    sprint: canonicalSprint,
    planDigest: digest.digest,
    planDigestVersion: digest.version,
    planDigestContext: generated.planDigestContext,
    proposal: input.proposal,
    preview,
    sourceAuthority: authority,
    lineage: input.lineage,
    ...(projectionAdoption !== undefined ? { projectionAdoption } : {}),
  };

  // Persist the exact normalized plan before publishing PREVIEW_READY. A
  // restart can therefore reconstruct the event chain without re-planning.
  savePlannedSprint(input.projectRoot, record.flowId, record);
  let context = ensureDurableEventChain(input.projectRoot, record);
  if (input.approval) {
    assertApprovalAuthority(record, input.approval);
    context = decideRunFlow(input.projectRoot, record.flowId, {
      decision: 'approve',
      actor: input.approval.actor,
    });
  }
  return buildResult(record, context, false);
}

/** Apply a post-render owner decision without re-planning. */
export interface DecideRunFlowPlanInput extends DecideRunFlowInput {
  readonly acknowledgePromptGate?: boolean;
  readonly acknowledgeScopePaths?: boolean;
}

export function decideRunFlowPlan(
  projectRoot: string,
  flowId: string,
  input: DecideRunFlowPlanInput,
): RunFlowContext {
  if (input.decision === 'approve') {
    const record = asDurableRecord(loadPlannedSprint(projectRoot, flowId));
    if (!record) {
      throw new RunFlowPlanServiceError('PERSISTED_PLAN_INVALID', {
        flowId,
        reason: 'exact_plan_record_missing',
      });
    }
    assertApprovalAuthority(record, {
      actor: input.actor,
      ...(input.acknowledgePromptGate === true
        ? { acknowledgePromptGate: true }
        : {}),
      ...(input.acknowledgeScopePaths === true
        ? { acknowledgeScopePaths: true }
        : {}),
    });
  }
  return decideRunFlow(projectRoot, flowId, input);
}
