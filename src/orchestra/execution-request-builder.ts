// ═══ ExecutionRequest Builder — WM-1 single-task unification ═════════════════
// One INPUT contract for the 3 single-task execution paths (CLI `deckent run`,
// MCP `deckent_run`, autonomous `runTaskMode`). Each path used to build a Task
// differently — ad-hoc `buildRunTask` (no `task.type`), a manual MCP object, or
// a forwarded autonomous context — with inconsistent provider resolution. They
// now all go through buildExecutionRequest() → resolveToTask(), so the canonical
// TaskKind is set everywhere (closes the WM-2b single-task gap) and provider
// resolution is uniform (never assumes 'claude'). See
// docs/superpowers/specs/2026-06-09-wm1-execution-request-design.md.
//
// Pure module (no I/O, no spawn). The caller generates the `run-*` task id and
// passes it to resolveToTask, preserving the id contract that single-task
// cleanup / result-reading depends on. Routing (agent/skill selection) is NOT
// done here — agentId/skillIds are optional forwarded hints (WM-1b follow-up).

import type {
  Task,
  TaskScope,
  ModelType,
  ProviderName,
  TaskEffort,
  TaskPriority,
  ResolvedConfig,
  GoNoGoCriteria,
} from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import type {
  ExecutionRequest,
  ExecutionContext,
  Capability,
  RequirementProfile,
  CapabilityTarget,
  ActorContext,
  RequestOrigin,
  InteractionMode,
  ExecutionBudget,
} from '../core/work-model.js';
import { rubricTypeToKind } from '../core/work-model.js';
import { detectTaskType } from './rubric-registry.js';

let _runTaskCounter = 0;

/** Canonical single-task id (`run-<ts>-<n>`). Re-homed from cli/commands/run.ts
 *  so orchestra/autonomous no longer import it from the CLI layer (ADR-008). */
export function createRunTaskId(): string {
  return `run-${Date.now()}-${_runTaskCounter++}`;
}

const DEFAULT_GONOGO: GoNoGoCriteria = {
  goCriteria: 'Task completed successfully',
  noGoCriteria: 'Task failed or errored',
  techDebtAcceptable: 'Minor issues acceptable',
};

export interface ExecutionRequestInput {
  description: string;
  scope?: { directories?: string[]; filesRead?: string[]; filesWrite?: string[] };
  capabilityTarget?: CapabilityTarget;
  model?: ModelType;
  modelEffort?: string;
  provider?: ProviderName;
  projectRoot: string;
  config?: ResolvedConfig;
  goNogo?: GoNoGoCriteria;
  effort?: TaskEffort;
  priority?: TaskPriority;
  authMode?: 'subscription' | 'api';
  agentId?: string;
  skillIds?: string[];
  autoApprove?: boolean;
  timeoutMs?: number;
  // Universal envelope (WM-1) — optional; forwarded verbatim, consumed by the
  // feature that owns each (TEAM-1/ENT-3/chat/cost-gate). Single-task code paths
  // typically set only `origin`.
  mode?: InteractionMode;
  actor?: ActorContext;
  origin?: RequestOrigin;
  correlationId?: string;
  causationId?: string;
  budget?: ExecutionBudget;
}

/** Infer the capability/resource profile from scope (minimal, extensible). */
function inferRequirements(scope: TaskScope): RequirementProfile {
  const capabilities: Capability[] = ['fs-read'];
  if ((scope.filesWrite?.length ?? 0) > 0 || (scope.directories?.length ?? 0) > 0) {
    capabilities.push('fs-write');
  }
  return { capabilities, resources: [] };
}

/**
 * Build the canonical {@link ExecutionRequest} from a path's minimal inputs.
 * Pure: infers kind (scope→detectTaskType→canonical), environment (from the
 * configured spawn backend), and requirements; resolves provider explicitly →
 * config → undefined (spawn resolves from model — never assumes 'claude').
 */
export function buildExecutionRequest(input: ExecutionRequestInput): ExecutionRequest {
  const scope: TaskScope = {
    directories: input.scope?.directories ?? ['./'],
    filesRead: input.scope?.filesRead ?? [],
    filesWrite: input.scope?.filesWrite ?? [],
  };

  const kind = rubricTypeToKind(detectTaskType({ scope } as Task));
  const context: ExecutionContext = input.config?.spawn_backend === 'docker' ? 'docker' : 'local-dev';
  const provider = (input.provider
    ?? input.config?.worker_provider
    ?? input.config?.brain_provider) as ProviderName | undefined;

  return {
    description: input.description,
    kind,
    environment: { domain: 'code-repo', context },
    requirements: inferRequirements(scope),
    scope,
    capabilityTarget: input.capabilityTarget,
    projectRoot: input.projectRoot,
    goNogo: input.goNogo,
    effort: input.effort ?? 'normal',
    priority: input.priority ?? 'NORMAL',
    provider,
    model: input.model,
    modelEffort: input.modelEffort,
    authMode: input.authMode,
    agentId: input.agentId,
    skillIds: input.skillIds,
    autoApprove: input.autoApprove ?? true,
    timeoutMs: input.timeoutMs,
    mode: input.mode,
    actor: input.actor,
    origin: input.origin,
    correlationId: input.correlationId,
    causationId: input.causationId,
    budget: input.budget,
  };
}

/**
 * Convert an {@link ExecutionRequest} into a single-task {@link Task} ready to
 * write + spawn. Preserves the `run-*` id contract (caller supplies it) and sets
 * the canonical `task.type` (WM-2b gap for single-task paths). Defaults model to
 * 'sonnet' only as a last resort; provider is left as resolved (may be undefined
 * → spawn resolves from model).
 */
export function resolveToTask(req: ExecutionRequest, taskId: string): Task {
  return {
    id: taskId,
    title: req.description.slice(0, 80),
    description: req.description,
    model: (req.model ?? 'sonnet') as ModelType,
    effort: req.effort ?? 'normal',
    priority: req.priority ?? 'NORMAL',
    reason: 'One-shot run (unified ExecutionRequest)',
    scope: req.scope,
    dependencies: [],
    goNogo: req.goNogo ?? DEFAULT_GONOGO,
    status: TaskStatus.PENDING,
    createdAt: new Date().toISOString(),
    type: req.kind,
    provider: req.provider,
    modelEffort: req.modelEffort,
    authMode: req.authMode,
    assignedAgent: req.agentId ?? 'generic',
    assignedSkills: req.skillIds ?? [],
  } as Task;
}
