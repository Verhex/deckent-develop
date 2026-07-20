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
import { TaskStatus, ALL_PROVIDER_NAMES } from '../core/types.js';
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
import { resolveCanonicalModelIdentity } from '../core/model-registry.js';
import type { RegistryProviderName } from '../core/model-registry.js';
import { DeckentError } from '../core/errors.js';
import { detectTaskType } from './rubric-registry.js';

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

/** Infer the capability/resource profile from scope (minimal, extensible).
 *  Exported (born-560) as the canonical scope→capability mapping so the SPAWN
 *  mainline RBAC gate derives a task's required capabilities identically to
 *  buildExecutionRequest — no second, drifting derivation. */
export function inferRequirements(scope: TaskScope): RequirementProfile {
  const capabilities: Capability[] = ['fs-read'];
  if ((scope.filesWrite?.length ?? 0) > 0 || (scope.directories?.length ?? 0) > 0) {
    capabilities.push('fs-write');
  }
  return { capabilities, resources: [] };
}

// ─── Canonical model-identity boundary (453-001) ────────────────────────────
// Shared by the CLI `deckent run` and MCP `deckent_run` one-shot entry points so
// both resolve + validate the authored model IDENTICALLY, before any Task JSON
// write or worker spawn. This replaces the frozen `ALL_MODELS` enum check that
// used to live in each surface.

/** Provider ownership values the canonical registry recognizes. An explicit
 *  provider outside this set is rejected loudly rather than silently trusted
 *  (guards the "unknown provider is guessed" NO-GO for unseen parametric IDs).
 *
 *  OPENROUTER-PROVIDER (row 477): DERIVED from `ALL_PROVIDER_NAMES` (core/types.ts)
 *  instead of repeating the provider literals a fifth time. The duplicate list is
 *  what silently rejected `--provider openrouter` at this boundary even after the
 *  ProviderName/RegistryProviderName unions were widened — a hand-maintained copy
 *  of a set that already exists at runtime is the zero-hardcode failure this
 *  project bans. Adding a provider now updates one place. */
const KNOWN_PROVIDERS: readonly RegistryProviderName[] =
  ALL_PROVIDER_NAMES as readonly RegistryProviderName[];

export interface ResolvedModelIdentity {
  /** Exact provider API model ID, byte-for-byte as authored (never alias-mapped). */
  model: string;
  /** Canonical provider that owns the model. */
  provider: RegistryProviderName;
}

/**
 * Resolve + validate a one-shot model selection through the canonical registry
 * BEFORE any Task JSON write or worker spawn — the single boundary the CLI and
 * MCP entry points share, so both fail identically:
 *   - a known ID infers its owning provider from the registry;
 *   - an unseen versioned ID is accepted only with an explicit, known provider and
 *     is registered parametrically (first-class for downstream route/spawn/cost);
 *   - a legacy alias, an unknown ID without a provider, and a provider/model
 *     mismatch each throw a {@link DeckentError} (fail-before-disk).
 * The returned {@link ResolvedModelIdentity.model} equals the authored ID exactly.
 */
export function resolveExecutionModelIdentity(
  model: string,
  provider?: string,
): ResolvedModelIdentity {
  if (provider !== undefined && !KNOWN_PROVIDERS.includes(provider as RegistryProviderName)) {
    throw new DeckentError('E_PROVIDER_UNKNOWN', `Unknown provider: ${provider}`);
  }
  const def = resolveCanonicalModelIdentity(model, {
    provider: provider as RegistryProviderName | undefined,
    registerParametric: true,
  });
  return { model: def.id, provider: def.provider };
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
 * the canonical `task.type` (WM-2b gap for single-task paths). The model MUST be
 * resolved upstream (via {@link resolveExecutionModelIdentity} / the config
 * default resolver) — a missing model throws rather than silently defaulting to
 * an alias, so no alias can ever reach Task JSON. Provider is left as resolved
 * (may be undefined → spawn resolves from model).
 */
export function resolveToTask(req: ExecutionRequest, taskId: string): Task {
  if (!req.model) {
    throw new DeckentError(
      'E_MODEL_ID_INVALID',
      'ExecutionRequest.model must be resolved before resolveToTask (no silent alias default)',
    );
  }
  return {
    id: taskId,
    title: req.description.slice(0, 80),
    description: req.description,
    model: req.model as ModelType,
    effort: req.effort ?? 'normal',
    priority: req.priority ?? 'NORMAL',
    reason: 'One-shot run command',
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
    actor: req.actor,
    budget: req.budget,
  } as Task;
}
