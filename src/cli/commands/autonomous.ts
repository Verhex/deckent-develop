// src/cli/commands/autonomous.ts
//
// `deckent autonomous` — Tier-1 user-surface CLI for the autonomous runtime
// loop (Sprint 226 — Task 226-007). Wraps `buildAutonomousRuntime` +
// `runAutonomousLoop` (226-006) with start / status / stop subcommands.
//
// Security invariants preserved (ADR-037, ADR-040):
//   - default-deny: unknown requestedBy denied by authority-adapter
//   - no-auto-approve: needs_approval triggers park in approval-adapter pending
//   - no auto-sprint-start: actionHandlers registry is empty by default
//
// ADR-012: registerAutonomous(program) pattern.

import { Command } from 'commander';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';
import { bindGovernanceArgumentDescriptions } from '../helpers/message-catalog/cli-governance.js';
import {
  buildEngineRuntime,
  runAutonomousLoop,
} from '../../orchestra/autonomous/runtime-loop.js';
import {
  ClosedApprovalRequestError,
  autonomousApprovalEffectClass,
  autonomousApprovalRisk,
  makeApprovalGate,
  type ApprovalGateAdapter,
} from '../../orchestra/autonomous/approval-adapter.js';
import { FlowRegistry } from '../../core/flow-registry.js';
import { writeConfigJsonAtomic } from '../../core/config-write-authority.js';
import { notifyAsync } from '../../core/notify.js';
import { autonomousPendingPath } from '../../core/constants.js';
import { resolveLocalOsPrincipal } from '../../core/principal.js';
import { bootstrapNotifyDispatcher, resolveWebhookBootstrapOption } from '../../core/notify-bootstrap.js';
import { buildConnectorAdapterWithKpiSummary, buildSprintKpiSummaryFn } from '../../connectors/kpi-summary-dispatch.js';
import { nextRun } from '../../core/scheduled-flow.js';
import type { ScheduledFlow } from '../../core/scheduled-flow.js';
import type { SelfDispatchPolicy } from '../../core/self-dispatch.js';
import type {
  AutonomousCycleResult,
  AutonomousRuntimeConfig,
} from '../../orchestra/autonomous-runtime.js';
import { makeFlowReporter, type FlowReporter, type FlowStepRecord } from '../../orchestra/autonomous/flow-reporter.js';
import { writeAuditEvent } from '../../core/audit-writer.js';
import { loadBacklog, validateBacklogEntry, cleanupAutonomousArtifacts } from '../../orchestra/autonomous/backlog.js';
import { planGoal, plannedItemToBacklogEntry, parsePlannedItems } from '../../orchestra/autonomous/goal-planner.js';
import { extractArtifactSeeds } from '../../orchestra/autonomous/artifact-ref.js';
import type { LlmComplete, PlannedItem } from '../../orchestra/autonomous/goal-planner-types.js';
import { resolveAdapter, buildPlannerSpawnArgs } from '../../orchestra/planner.js';
import { spawnSync } from 'node:child_process';
import { makeDebtWorkGenerator } from '../../orchestra/autonomous/work-generator-source.js';
import { recoverBacklog } from '../../orchestra/autonomous/execution-pool.js';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';
import type { BacklogEntry } from '../../orchestra/autonomous/backlog-types.js';
import { runTaskMode } from '../../orchestra/task-mode-runner.js';
import { runSprint as runSprintLifecycle } from '../../orchestra/sprint-controller.js';
import {
  createCanonicalExactSprintExecutor,
  type CanonicalExactSprintExecutionOutcome,
  type ExactStartAuthorizationVerifier,
} from '../../orchestra/exact-plan-start-service.js';
import { captureGitBase } from '../../orchestra/run-diff-service.js';
import { createRunFlowCoordinator } from '../../orchestra/run-flow-coordinator.js';
import { waitForRunResult, formatModelError } from './run.js';
import { resolveExecutionModelIdentity } from '../../orchestra/execution-request-builder.js';
import { registerOpenRouterModelFromCache } from '../../core/openrouter-models.js';
import { isV2Engine, runV2Engine } from '../../orchestra/autonomous/mission-store/mission-engine-wire.js';
import {
  buildGoalDeps,
  createGoalMission,
  GoalInvocationHeldError,
  type GoalAdvanceDeps,
} from '../../orchestra/autonomous/mission-store/goal-mission.js';
import {
  verifyGoalAcceptanceInvocationReceipt,
  workItemEvidenceRef,
  type GoalAcceptanceContractV1,
  type GoalAcceptanceEvaluation,
  type GoalAcceptanceOutcome,
  type GoalAcceptanceVerdict,
} from '../../orchestra/autonomous/mission-store/mission-acceptance.js';
import type { NewWorkItem, WorkItem, WorkItemKind } from '../../orchestra/autonomous/mission-store/mission-types.js';
import { createListMission } from '../../orchestra/autonomous/mission-store/mission-ingest.js';
import { projectMission } from '../../orchestra/autonomous/mission-store/mission-view.js';
import { auditMissionLifecycle } from '../../orchestra/autonomous/mission-store/mission-audit-bridge.js';
import { migrateBacklogJson } from '../../orchestra/autonomous/mission-store/mission-migrate.js';
import { SqliteMissionStore } from '../../orchestra/autonomous/mission-store/sqlite-mission-store.js';
import {
  MissionAdmissionError,
  PRODUCTION_V2_ADMISSION,
  assertWorkItemBatchAdmitted,
  listRuntimeAdmittedKinds,
} from '../../orchestra/autonomous/mission-store/mission-kind-admission.js';
import { loadConfig, resolveBrainModel, resolveDefaultModel } from '../../core/config.js';
import { DECKENT_DIR, PROJECT_CONFIG_PATH, RECENT_WORKS_DIR } from '../../core/constants.js';
import { bootstrapProviders, orderedRoleProviders } from '../../core/provider.js';
import type { ModelType, ResolvedConfig } from '../../core/types.js';
import { ALL_PROVIDER_NAMES, SprintStatus } from '../../core/types.js';
import { getEquivalentModel } from '../../core/model-equivalence.js';
import { defaultRoleInvocationPolicy } from '../../core/role-invocation-resolver.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import {
  openLocalProviderAuthorityRuntime,
  openLocalProviderAuthorityRuntimeIfConfigured,
} from '../../providers/provider-authority-runtime-bootstrap.js';
import { preflightProviderExecutionIngress } from '../../core/provider-execution-ingress-authority.js';
import { loadReactiveMap } from '../../orchestra/autonomous/reactive/reactive-map.js';
import { makeReactiveIngester } from '../../orchestra/autonomous/reactive/reactive-ingester.js';
import { makeNervousReactiveSource } from '../../orchestra/autonomous/reactive/nervous-reactive-source.js';
import { makeRepoWatchReactiveSource } from '../../orchestra/autonomous/reactive/repo-watch-reactive-source.js';
import { makeWebhookReactiveSource } from '../../orchestra/autonomous/reactive/webhook-reactive-source.js';
import { NervousObserver } from '../../nervous/observer.js';
import { createNervousSystemIfEnabled, type NervousSystemHandle } from '../../nervous/bootstrap.js';
import { getSprintStateSnapshot } from '../../orchestra/sprint-state-tracker.js';
import type { DeckentConfig } from '../../core/types.js';
import {
  DeckentError,
  ErrorRegistry,
  createExecutionAuthorityError,
} from '../../core/errors.js';
import type { InvocationPurpose, InvocationReceiptRef, InvocationRole } from '../../core/invocation-receipt.js';
import { InvocationReceiptStore } from '../../core/invocation-receipt-store.js';
import { MissionWorkerInvocationCoordinator } from '../../orchestra/autonomous/mission-store/mission-worker-invocation-coordinator.js';
import { MissionWorkerInvocationRecoveryReconciler } from '../../orchestra/autonomous/mission-store/mission-worker-invocation-recovery.js';
import { bootstrapApprovalAuthority } from '../../core/approval-authority-bootstrap.js';
import { ApprovalBroker } from '../../core/approval-broker.js';
import { ApprovalStore } from '../../core/approval-store.js';
import { MissionApprovalCoordinator } from '../../orchestra/autonomous/mission-store/mission-approval-coordinator.js';

function createLiveAutonomousExactSprintExecutor(input: {
  providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  approvalAuthority?: ReturnType<typeof bootstrapApprovalAuthority>;
  verifyStartAuthorization?: ExactStartAuthorizationVerifier;
}) {
  return createCanonicalExactSprintExecutor({
    executeInProcess: async (context) => {
      const gitBase = await captureGitBase(context.projectRoot);
      const sprint = await runSprintLifecycle(
        context.projectRoot,
        { ...context.config, deckent_style: 'sprint' },
        {
          preplannedSprint: context.sprint,
          exactPlanAuthority: {
            ...context.exactRef,
            ...(context.snapshot.sourceAuthority !== undefined
              ? { sourceAuthority: context.snapshot.sourceAuthority }
              : {}),
          },
          flowId: context.exactRef.flowId,
          onExactPlanMaterialize: (_sprint, materializationOptions) =>
            context.onExactPlanMaterialize(materializationOptions),
          onExecutionAdmitted: (admittedSprint) => {
            context.onExecutionAdmitted({
              flowId: context.exactRef.flowId,
              jobId: admittedSprint.id,
              logRef: admittedSprint.id,
            }, gitBase);
          },
          ...(input.providerAuthority ? { providerAuthority: input.providerAuthority } : {}),
          ...(input.approvalAuthority?.state === 'ready'
            ? {
                attendedExecutionApprovalAuthority:
                  input.approvalAuthority.runtime.attendedExecutionApprovalAuthority,
              }
            : {}),
        },
      );
      return sprint.status === SprintStatus.COMPLETE
        ? { terminalState: 'COMPLETED', reasonCode: 'SPRINT_COMPLETE' }
        : sprint.status === SprintStatus.ABORTED
          ? { terminalState: 'CANCELLED', reasonCode: 'SPRINT_ABORTED' }
          : { terminalState: 'BLOCKED', reasonCode: `SPRINT_${sprint.status}` };
    },
    spawnDetached: () => {
      throw new DeckentError('E_AUTONOMOUS_EXACT_SPRINT_DETACHED_EXECUTOR_UNWIRED', 'AUTONOMOUS_EXACT_SPRINT_DETACHED_EXECUTOR_UNWIRED');
    },
    ...(input.verifyStartAuthorization
      ? { verifyStartAuthorization: input.verifyStartAuthorization }
      : {}),
    lifecycle: {
      publishStartRequested: ({ projectRoot, exactRef, attempt }) => {
        createRunFlowCoordinator({ root: projectRoot }).requestStart({
          flowId: exactRef.flowId,
          revision: exactRef.revision,
          planDigest: exactRef.planDigest,
          commandId: `exact-start:${attempt.attemptId}:requested`,
        });
      },
      publishRunStarted: ({ projectRoot, attempt, handle }) => {
        createRunFlowCoordinator({ root: projectRoot }).recordRunStarted({
          handle,
          commandId: `exact-start:${attempt.attemptId}:admitted`,
        });
      },
    },
  });
}

function missionExactOutcomeResult(
  outcome: CanonicalExactSprintExecutionOutcome,
): import('../../orchestra/autonomous/mission-store/mission-types.js').ResultLike {
  if (outcome.status === 'settled') {
    return {
      ok: outcome.settlement.state === 'COMPLETED',
      ...(outcome.settlement.state === 'BLOCKED'
        ? { dispatchDisposition: 'parked' as const }
        : {}),
      reason: outcome.settlement.code,
      exactPlanRef: outcome.exactRef,
    };
  }
  if (outcome.status === 'duplicate') {
    const completed = outcome.attempt.settlement?.state === 'COMPLETED';
    return {
      ok: completed,
      ...(!completed ? { dispatchDisposition: 'reconciliation-required' as const } : {}),
      reason: completed
        ? 'EXACT_SPRINT_DUPLICATE_COMPLETED'
        : 'EXACT_SPRINT_DUPLICATE_RECONCILIATION_REQUIRED',
      exactPlanRef: outcome.exactRef,
    };
  }
  return {
    ok: false,
    dispatchDisposition: outcome.status === 'failed' || outcome.status === 'denied'
      ? 'reconciliation-required'
      : 'parked',
    reason: outcome.status === 'accepted'
      ? 'EXACT_SPRINT_DETACHED_ACCEPTED_RECONCILIATION_REQUIRED'
      : outcome.reasonCode,
    ...(outcome.exactRef ? { exactPlanRef: outcome.exactRef } : {}),
  };
}

// ─── Filesystem layout helpers ────────────────────────────────────────

function autonomousDir(root: string): string {
  return join(root, '.deckent', 'autonomous');
}


function stopMarkerPath(root: string): string {
  return join(autonomousDir(root), 'stop');
}

function eventsPath(root: string, sprintId = 'autonomous'): string {
  return join(root, RECENT_WORKS_DIR, `${sprintId}-events.jsonl`);
}

function ensureAutonomousDir(root: string): void {
  const dir = autonomousDir(root);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadFlows(root: string): ScheduledFlow[] {
  try {
    const registry = new FlowRegistry(join(root, '.deckent', 'flows'));
    return registry.listFlows();
  } catch {
    return [];
  }
}

function defaultPolicy(): SelfDispatchPolicy {
  // requiresApproval defaults to TRUE — preserves the human-in-the-loop rule.
  return {
    id: 'autonomous-default',
    trigger: 'scheduled',
    action: 'start',
    guard: { requiresApproval: true },
  };
}

// ─── Backlog helpers (Task 7) ─────────────────────────────────────────

function defaultBacklogPath(root: string): string {
  return join(autonomousDir(root), 'backlog.json');
}

export interface BacklogAddOptions {
  root: string;
  id: string;
  title: string;
  kind: 'task' | 'sprint' | 'capability';
  description: string;
  policy: BacklogEntry['policy'];
  lang: string;
  /** 5-field cron expression — when set, the entry recurs at this cadence. */
  cron?: string;
  /** kind=capability: dotted verb to invoke (e.g. 'fs.read', 'db.query'). */
  capability?: string;
  /** kind=capability: JSON-encoded args object for the handler. */
  capabilityArgs?: string;
  /** kind=capability: preferred backend/connector id (e.g. 'odoo', 'imap'). */
  connector?: string;
}

export function backlogAdd(o: BacklogAddOptions): void {
  const path = defaultBacklogPath(o.root);
  const bl = loadBacklog(path);
  if (bl.entries.some((e) => e.id === o.id)) {
    throw new DeckentError('DECKENT_E039', getMessage('autonomous.backlog.duplicate', o.lang, { id: o.id }));
  }
  // Reject a malformed cron at intake — a recurring entry whose cron only
  // fails later (at the reenqueue flip) would silently never fire again.
  if (o.cron !== undefined) {
    try {
      nextRun(o.cron, new Date());
    } catch (err) {
      throw new DeckentError('DECKENT_E004', getMessage('autonomous.backlog.invalid_cron', o.lang, {
        cron: o.cron,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }
  // kind=capability: require a verb at intake and parse args strictly — an
  // entry that only fails at dispatch time would be a silent dead entry.
  let capabilityTarget: BacklogEntry['spec']['capabilityTarget'];
  if (o.kind === 'capability') {
    if (!o.capability || !o.capability.trim()) {
      throw new DeckentError('DECKENT_E039', getMessage('autonomous.backlog.capability_required', o.lang));
    }
    let args: Record<string, unknown> | undefined;
    if (o.capabilityArgs !== undefined) {
      try {
        const parsed: unknown = JSON.parse(o.capabilityArgs);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new DeckentError('DECKENT_E004', 'args must be a JSON object');
        }
        args = parsed as Record<string, unknown>;
      } catch (err) {
        throw new DeckentError('DECKENT_E004', getMessage('autonomous.backlog.invalid_args', o.lang, {
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }
    capabilityTarget = {
      capability: o.capability,
      ...(args !== undefined ? { args } : {}),
      ...(o.connector !== undefined ? { connector: o.connector } : {}),
    };
  }
  const entry: BacklogEntry = {
    id: o.id,
    title: o.title,
    kind: o.kind,
    spec: { description: o.description, ...(capabilityTarget ? { capabilityTarget } : {}) },
    policy: o.policy,
    trigger: o.cron !== undefined ? { type: 'recurring', cron: o.cron } : { type: 'one-off' },
    status: 'pending',
    lastRun: null,
    lastResult: null,
  };
  const err = validateBacklogEntry(entry);
  if (err) throw new DeckentError('DECKENT_E004', err);
  bl.entries.push(entry);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}

export function backlogList(o: { root: string }): BacklogEntry[] {
  return loadBacklog(defaultBacklogPath(o.root)).entries;
}

export function backlogRemove(o: { root: string; id: string; lang: string }): void {
  const path = defaultBacklogPath(o.root);
  const bl = loadBacklog(path);
  const before = bl.entries.length;
  bl.entries = bl.entries.filter((e) => e.id !== o.id);
  if (bl.entries.length === before) {
    throw new DeckentError('DECKENT_E039', getMessage('autonomous.backlog.not_found', o.lang, { id: o.id }));
  }
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}

// ─── plan (Task 8 — goal planner Phase 1) ──────────────────────────────

export interface AutonomousPlanOptions {
  goal: string;
  root?: string;
  from?: string;
  policy?: string;
  maxItems?: number;
  dryRun?: boolean;
  /** Explicit persistence target resolved from the loaded autonomous config. */
  engine?: 'v1' | 'v2';
  lang?: string;
  complete: LlmComplete;
  print?: (line: string) => void;
}

/**
 * `deckent autonomous plan <goal>` core — decompose a high-level goal into a
 * lightweight, pending+`planned` backlog (Phase 1). Detail is generated JIT at
 * dispatch (Phase 2), not here. Testable: `complete` (LLM) and `print` (sink)
 * are injected; the subcommand wires the real provider spawn.
 */
export async function handlePlan(opts: AutonomousPlanOptions): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const out = opts.print ?? print;
  let seeds: string[] | undefined;
  if (opts.from) {
    const hashIdx = opts.from.indexOf('#');
    const filePart = hashIdx >= 0 ? opts.from.slice(0, hashIdx) : opts.from;
    const anchorPart = hashIdx >= 0 ? opts.from.slice(hashIdx) : '';
    const resolved = (isAbsolute(filePart) ? filePart : join(root, filePart)) + anchorPart;
    seeds = extractArtifactSeeds(resolved);
  }
  const summaryPath = join(root, '.brain', 'exports', 'summary.md');
  const context = existsSync(summaryPath) ? readFileSync(summaryPath, 'utf-8') : undefined;

  const items = await planGoal({
    goal: opts.goal,
    seeds,
    context,
    maxItems: opts.maxItems,
    defaultPolicy: opts.policy,
    complete: opts.complete,
    ...(opts.engine === 'v2' ? { allowedKinds: listRuntimeAdmittedKinds(PRODUCTION_V2_ADMISSION) } : {}),
  });
  if (items.length === 0) {
    out(getMessage('autonomous.plan_empty', lang));
    return;
  }

  if (opts.engine === 'v2') {
    try {
      assertWorkItemBatchAdmitted(plannedItemsToWorkItems(items), PRODUCTION_V2_ADMISSION);
    } catch (error) {
      if (error instanceof MissionAdmissionError) {
        throw new DeckentError('DECKENT_E039', getMessage('autonomous.plan_kind_rejected', lang, {
          id: error.itemId,
          kind: error.kind,
          reason: error.code,
          allowed: listRuntimeAdmittedKinds(PRODUCTION_V2_ADMISSION).join(', '),
        }));
      }
      throw error;
    }
  }

  out(getMessage('autonomous.plan_header', lang, { count: String(items.length) }));
  for (const it of items) {
    out(getMessage('autonomous.plan_row', lang, { kind: it.kind, policy: it.policy, id: it.id, summary: it.summary }));
  }

  if (opts.dryRun) {
    out(getMessage('autonomous.plan_dryrun', lang));
    return;
  }

  if (opts.engine === 'v2') {
    const missionProjection = JSON.stringify({ goal: opts.goal, items });
    const missionId = `plan-${createHash('sha256').update(missionProjection).digest('hex').slice(0, 24)}`;
    const store = new SqliteMissionStore(root);
    try {
      store.migrate();
      // Cutover must not strand an already-authored v1 backlog merely because an
      // unrelated v2 mission exists. The reserved legacy mission is the one-time
      // import boundary; normal v2 plan batches never write backlog.json.
      migrateBacklogJson(root, store, { admission: PRODUCTION_V2_ADMISSION });
      const existing = store.getMission(missionId);
      createListMission(store, {
        id: missionId,
        title: opts.goal,
        items: items.map((item) => {
          const snapshot = plannedItemToBacklogEntry(item);
          return {
            id: `${missionId}-${item.id}`,
            kind: item.kind,
            spec: {
              ...snapshot.spec,
              description: item.summary,
              title: item.title,
              summary: item.summary,
              planned: true,
              plannerItemId: item.id,
              ...(item.fanOut ? { fanOut: item.fanOut } : {}),
            },
            policy: item.policy,
            trigger: { ...snapshot.trigger },
          };
        }),
      }, { admission: PRODUCTION_V2_ADMISSION });
      if (existing) {
        out(getMessage('autonomous.plan_mission_replayed', lang, {
          count: String(items.length),
          missionId,
        }));
      } else {
        auditMissionLifecycle(root, {
          tenantId: 'local',
          actor: 'cli',
          action: 'missions:create',
          missionId,
          metadata: { kind: 'list', title: opts.goal, source: 'autonomous-plan' },
        });
        out(getMessage('autonomous.plan_mission_written', lang, {
          count: String(items.length),
          missionId,
        }));
      }
    } finally {
      store.close();
    }
    return;
  }

  const path = defaultBacklogPath(root);
  const bl = loadBacklog(path);
  // Dedup by id, but only an ACTIVE (pending/running/parked) entry blocks a re-plan —
  // don't disturb in-flight work. A TERMINAL (done/failed) entry with the same id is
  // REPLACED so a goal can be re-queued (the planner emits deterministic ids, so a plain
  // id-skip would silently drop every re-plan after the first run — the live dogfood bug).
  const ACTIVE_STATUSES = new Set(['pending', 'running', 'parked']);
  let added = 0;
  let skipped = 0;
  for (const it of items) {
    const idx = bl.entries.findIndex((e) => e.id === it.id);
    if (idx >= 0 && ACTIVE_STATUSES.has(bl.entries[idx]!.status)) {
      skipped++;
      continue;
    }
    const fresh = plannedItemToBacklogEntry(it);
    if (idx >= 0) bl.entries[idx] = fresh; // terminal dup → re-queue (replace)
    else bl.entries.push(fresh);
    added++;
  }
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
  if (added === 0) {
    out(getMessage('autonomous.plan_none_added', lang, { skipped: String(skipped) }));
  } else {
    out(getMessage('autonomous.plan_written', lang, { count: String(added) }));
  }
}

/**
 * Real provider completion for the planner — mirrors planner.ts's spawn path
 * (one-shot CLI call, so spawnSync is acceptable here, matching planner.ts).
 * Used by the `plan` subcommand (Phase 1) and threaded as `jitComplete` into the
 * autonomous loop (Phase 2 JIT detail).
 */
function realPlannerComplete(model: string): LlmComplete {
  return async (prompt: string): Promise<string> => {
    const adapter = resolveAdapter();
    const spawnArgs = buildPlannerSpawnArgs(adapter, prompt, model as ModelType);
    const r = spawnSync(spawnArgs.command, spawnArgs.args, { encoding: 'utf-8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    // Diagnostics (do not silently return empty → "no valid items" hides real failures):
    // surface spawn errors, timeouts, and non-zero exits so the operator sees the cause.
    if (r.error) throw ErrorRegistry.createError('DECKENT_E095', { message: `planner spawn failed (${adapter.name}): ${r.error.message}` });
    if (r.signal === 'SIGTERM') throw ErrorRegistry.createError('DECKENT_E095', { message: `planner timed out (${adapter.name}) — raise the timeout or narrow the goal` });
    const stdout = r.stdout ?? '';
    if (r.status !== 0 && !stdout) {
      throw ErrorRegistry.createError('DECKENT_E095', { message: `planner exited status=${r.status ?? 'null'} (${adapter.name}): ${(r.stderr ?? '').slice(0, 300)}` });
    }
    // Unwrap the provider-specific envelope (Claude `--output-format json` wraps the
    // model text in `.result`; Gemini/Codex differ) to the inner text — parsePlannedItems
    // then reads the {items:[…]} JSON. Without this the envelope's top level has no
    // `items` and every plan returned "no valid items" (live dogfood 2026-06-17).
    return adapter.parseAgentResponse ? adapter.parseAgentResponse(stdout) : stdout;
  };
}

/**
 * 454-003: resolve + validate the planner/JIT model through the canonical
 * registry — the SAME boundary CLI `deckent run` / MCP `deckent_run` enforce
 * (453-001) — before the autonomous loop starts or a plan is generated. An
 * omitted `override` resolves from the loaded config's canonical Brain-model
 * resolver (never a literal alias like 'sonnet', which the model registry does
 * not recognize as a key and would otherwise reach the provider CLI unresolved).
 * A legacy alias, an unknown ID without a provider, or a provider/model
 * mismatch throws a friendly, localized error before any spawn.
 */
export function resolvePlannerModelIdentity(
  config: ResolvedConfig,
  lang: string,
  override?: string,
  provider?: string,
): string {
  const requested = override ?? resolveBrainModel(config);
  // Row 477: pre-register a probe-verified OpenRouter id before the pure
  // identity boundary — same seam as CLI/MCP run (see run.ts).
  if (provider === 'openrouter') {
    registerOpenRouterModelFromCache(config.projectRoot, requested);
  }
  try {
    return resolveExecutionModelIdentity(requested, provider).model;
  } catch (err) {
    throw ErrorRegistry.createError('DECKENT_E095', { message: formatModelError(err, requested, provider, lang) });
  }
}

// ─── Type-2 goal-loop bindings (live planner + accepter) ───────────────

/**
 * Infinite-loop guard for the live goal-loop: the maximum cumulative work-items a
 * single goal mission may author before being force-exhausted. A finite bound is a
 * production safety net — the loop also terminates early when the planner returns an
 * empty batch (goal reached) — so a misbehaving planner cannot author forever.
 */
const GOAL_MAX_ROUNDS = 50;

/** One status line per work-item, shared by the planner + accepter prompts. */
function formatWorkItemLines(items: WorkItem[]): string {
  if (items.length === 0) return '(none)';
  return items
    .map((i) => {
      const desc = typeof i.spec?.['description'] === 'string' ? (i.spec['description'] as string) : i.id;
      const outcome = i.lastResult?.ok === false ? 'FAILED' : i.status;
      const result = i.lastResult === null
        ? 'result=missing'
        : `result=${JSON.stringify({
          ok: i.lastResult.ok,
          reason: i.lastResult.reason ?? null,
          settleDetail: i.lastResult.settleDetail ?? null,
        })}`;
      return `- [${outcome}] ${desc} | evidenceRef=${workItemEvidenceRef(i.id)} | ${result}`;
    })
    .join('\n');
}

function formatAcceptanceContract(contract?: GoalAcceptanceContractV1): string {
  if (!contract) return '(not specified)';
  return JSON.stringify({
    schemaVersion: contract.schemaVersion,
    digest: contract.digest,
    criteria: contract.criteria,
  });
}

/**
 * Planner prompt: given the goal + prior work, ask for the NEXT PlannedItem batch
 * (or an EMPTY list when the goal is already reached). Reuses the PlannedItem JSON
 * contract so {@link parsePlannedItems} validates the output, and feeds the prior
 * work so the model can go dry — the signal the goal-loop needs to evaluate
 * acceptance instead of authoring forever.
 */
function buildGoalNextPrompt(
  goal: string,
  priorItems: WorkItem[],
  allowedKinds: readonly string[],
  acceptanceContract?: GoalAcceptanceContractV1,
): string {
  return `You are the Deckent autonomous GOAL driver. Decide the NEXT batch of work-items that advances the GOAL, given what has ALREADY been done.

GOAL: ${goal}

IMMUTABLE ACCEPTANCE CONTRACT (exact text + digest; do not rewrite):
${formatAcceptanceContract(acceptanceContract)}

Already attempted/completed work-items:
${formatWorkItemLines(priorItems)}

If the GOAL is already fully achieved by the work above, output an EMPTY list: { "items": [] }.
Otherwise output the NEXT lightweight work-items (titles + kind + scope only, NO implementation detail — detail is generated just-in-time). Do NOT repeat work already done.
Runtime-admitted kinds: ${allowedKinds.join(', ')}. Emit ONLY these kinds; split larger work into admitted items instead of selecting an unavailable runner.

Output STRICT JSON: { "items": PlannedItem[] }. Each PlannedItem:
{ "id": kebab-slug, "title": short, "kind": "task"|"sprint"|"capability"|"process",
  "scopeDir": repo-relative dir (e.g. "src/api/"), "summary": one line WHAT,
  "policy": "auto"|"approval-required"|"risk-tagged",
  "trigger": "one-off" | {"recurring":"<cron>"} | {"reactive":"<detector>"} }

Output ONLY the JSON, no prose.`;
}

/** Legacy compatibility for missions authored before acceptance-contract v1. */
function buildGoalAcceptPromptLegacy(goal: string, items: WorkItem[]): string {
  return `You are the Deckent autonomous GOAL acceptance evaluator. Decide whether the GOAL has been REACHED, given the settled work-items below.

GOAL: ${goal}

Settled work-items:
${formatWorkItemLines(items)}

Answer STRICT JSON: { "reached": true } if the goal is fully achieved, else { "reached": false }. Output ONLY the JSON, no prose.`;
}

/** Acceptance prompt: given the exact contract + settled evidence, ask for a criterion verdict. */
function buildGoalAcceptPrompt(
  goal: string,
  items: WorkItem[],
  acceptanceContract: GoalAcceptanceContractV1,
): string {
  return `You are the Deckent autonomous GOAL acceptance evaluator. Judge ONLY the immutable acceptance criteria against the settled work-item evidence below.

GOAL: ${goal}

IMMUTABLE ACCEPTANCE CONTRACT (criterion id/text and digest must stay exact):
${formatAcceptanceContract(acceptanceContract)}

Settled work-items:
${formatWorkItemLines(items)}

Evidence rules:
- Cite ONLY evidenceRef values shown above. The host resolves each cited ref to the durable WorkItem result digest.
- Every critical criterion marked met requires at least one evidenceRef.
- Do not add, remove, merge, or rewrite criterion ids.

Answer STRICT JSON:
{ "outcome": "accepted"|"rejected"|"unknown", "criteria": [
  { "criterionId": "exact id", "verdict": "met"|"unmet"|"unknown",
    "evidenceRefs": ["work-item:<id>"], "rationale": "short evidence-grounded reason" }
] }
Output ONLY the JSON, no prose.`;
}

/** Map validated PlannedItems onto the goal-loop's NewWorkItem contract. `missionId`
 *  is a placeholder — advanceGoalMission stamps the real mission id at enqueue. */
function plannedItemsToWorkItems(items: PlannedItem[]): NewWorkItem[] {
  return items.map((p) => {
    const snapshot = plannedItemToBacklogEntry(p);
    return {
      id: p.id,
      missionId: '',
      kind: p.kind,
      spec: {
        description: p.summary,
        scopeDir: p.scopeDir,
        ...(p.capabilityTarget ? { capabilityTarget: p.capabilityTarget } : {}),
        ...(p.fanOut ? { fanOut: p.fanOut } : {}),
      },
      policy: p.policy,
      trigger: { ...snapshot.trigger },
    };
  });
}

/**
 * Parse the acceptance verdict (`{ "reached": boolean }`) from raw model text.
 * Fence/preamble + provider-envelope (`.result`) tolerant. Conservative default is
 * `false` — an ambiguous answer never declares the goal reached.
 */
function parseGoalAccepted(raw: string): boolean {
  const s = raw.trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try {
      const obj = JSON.parse(s.slice(i, j + 1)) as { reached?: unknown; result?: unknown };
      if (typeof obj.reached === 'boolean') return obj.reached;
      // Provider-envelope tolerance: the inner model text lives under `.result`.
      if (typeof obj.result === 'string') return parseGoalAccepted(obj.result);
    } catch {
      // fall through to the conservative token scan
    }
  }
  return /^(true|yes|reached|accepted)\b/i.test(s);
}

function parseAcceptanceObject(raw: string): Record<string, unknown> | null {
  const s = raw.trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try {
    const parsed = JSON.parse(s.slice(i, j + 1)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const object = parsed as Record<string, unknown>;
    return typeof object['result'] === 'string' ? parseAcceptanceObject(object['result']) : object;
  } catch {
    return null;
  }
}

function parseGoalAcceptanceEvaluation(
  raw: string,
  evaluatorRole: 'brain' | 'auditor',
  evaluatorInstanceId: string | null,
  invocationReceiptRef: InvocationReceiptRef | null,
  decidedAt: string,
): GoalAcceptanceEvaluation {
  const parsed = parseAcceptanceObject(raw);
  const outcome = parsed?.['outcome'];
  const rawCriteria = parsed?.['criteria'];
  const allowedOutcomes: readonly GoalAcceptanceOutcome[] = ['accepted', 'rejected', 'unknown'];
  const allowedVerdicts: readonly GoalAcceptanceVerdict[] = ['met', 'unmet', 'unknown'];
  const criteria = Array.isArray(rawCriteria)
    ? rawCriteria.flatMap((rawCriterion) => {
      if (!rawCriterion || typeof rawCriterion !== 'object' || Array.isArray(rawCriterion)) return [];
      const criterion = rawCriterion as Record<string, unknown>;
      const criterionId = criterion['criterionId'];
      const verdict = criterion['verdict'];
      const evidenceRefs = criterion['evidenceRefs'];
      const rationale = criterion['rationale'];
      if (typeof criterionId !== 'string'
        || typeof verdict !== 'string' || !allowedVerdicts.includes(verdict as GoalAcceptanceVerdict)
        || !Array.isArray(evidenceRefs) || !evidenceRefs.every((ref) => typeof ref === 'string')
        || typeof rationale !== 'string') return [];
      return [{
        criterionId,
        verdict: verdict as GoalAcceptanceVerdict,
        evidenceRefs: evidenceRefs as string[],
        rationale,
      }];
    })
    : [];
  return {
    outcome: typeof outcome === 'string' && allowedOutcomes.includes(outcome as GoalAcceptanceOutcome)
      ? outcome as GoalAcceptanceOutcome
      : 'unknown',
    criteria,
    evaluator: { role: evaluatorRole, instanceId: evaluatorInstanceId },
    invocationReceiptRef,
    decidedAt,
  };
}

export interface LiveGoalAcceptanceCompletion {
  output: string;
  evaluatorRole: 'brain' | 'auditor';
  evaluatorInstanceId: string;
  invocationReceiptRef: InvocationReceiptRef;
}

export interface LiveGoalDepsOptions {
  /** Row-603 seam: completion + host-owned invocation provenance for this exact evaluator call. */
  acceptanceComplete?: (prompt: string) => Promise<LiveGoalAcceptanceCompletion>;
  acceptanceReceiptVerifier?: GoalAdvanceDeps['verifyAcceptanceReceipt'];
  /** Host-owned pre-provider admission. Production injects this fail-closed;
   *  hermetic adapters may omit it and supply a fully controlled completion. */
  admitInvocation?: (input: {
    role: Extract<InvocationRole, 'brain' | 'auditor'>;
    purpose: Extract<InvocationPurpose, 'goal-authoring' | 'goal-acceptance'>;
  }) => void | Promise<void>;
  now?: () => Date;
}

function makeGoalRoleAdmissionGuard(
  config: ResolvedConfig,
  providerAuthority: ProviderAuthorityRuntimeServiceOpenResult,
): NonNullable<LiveGoalDepsOptions['admitInvocation']> {
  const configuredBrainModel = resolveBrainModel(config);
  return ({ role, purpose }): void => {
    if (providerAuthority.state === 'hold') {
      const roleEvidenceRef = `goal-role-admission:${createHash('sha256')
        .update(`${providerAuthority.authorityEvidenceRef}\0${role}\0${purpose}`)
        .digest('hex')}`;
      throw new GoalInvocationHeldError({
        schemaVersion: 1,
        reasonCode: 'authority_unavailable',
        providerAuthorityReasonCode: providerAuthority.reasonCode,
        evidenceRefs: [providerAuthority.authorityEvidenceRef, roleEvidenceRef],
        invocationReceiptRef: null,
        heldAt: new Date().toISOString(),
      });
    }
    const order = orderedRoleProviders(role, config);
    const roleModel = getEquivalentModel(configuredBrainModel, order.primary);
    const result = providerAuthority.service.roleAdmissionRuntime.admit({
      invocation: {
        role,
        purpose,
        primaryProvider: order.primary,
        model: roleModel,
        fallbackProviders: order.fallbacks,
        policy: defaultRoleInvocationPolicy(role, order.unattended),
      },
      candidates: {},
      buildReservation: () => {
        throw ErrorRegistry.createError('DECKENT_E095', { message: 'UNREACHABLE_GOAL_RESERVATION_WITHOUT_HOST_AUTHORITIES' });
      },
    });
    if (result.decision !== 'hold') {
      throw ErrorRegistry.createError('DECKENT_E095', { message: 'GOAL_INVOCATION_ADMISSION_INVARIANT' });
    }
    throw new GoalInvocationHeldError({
      schemaVersion: 1,
      reasonCode: result.reasonCode,
      providerAuthorityReasonCode: 'candidate_authority_unavailable',
      evidenceRefs: [...new Set([
        providerAuthority.authorityEvidenceRef,
        result.authorityEvidenceRef,
      ])],
      invocationReceiptRef: null,
      heldAt: new Date().toISOString(),
    });
  };
}

/**
 * Build the live Type-2 goal-loop bindings from an injected LLM completion. The
 * production wire passes `realPlannerComplete(resolvePlannerModelIdentity(...))`
 * (canonical configured Brain model); tests pass a fake. The
 * `planner` decomposes the goal (given prior work) into the next work-items — an
 * empty batch signals "goal reached" so the loop evaluates the `accepter`, which
 * asks the same LLM whether the goal is reached. {@link buildGoalDeps} adapts these
 * onto the loop's author/accept surface and carries the maxRounds guard.
 */
export function buildLiveGoalDeps(complete: LlmComplete, opts: LiveGoalDepsOptions = {}): GoalAdvanceDeps {
  const planner = async (
    goal: string,
    priorItems: WorkItem[],
    acceptanceContract?: GoalAcceptanceContractV1,
  ): Promise<NewWorkItem[]> => {
    await opts.admitInvocation?.({ role: 'brain', purpose: 'goal-authoring' });
    const raw = await complete(buildGoalNextPrompt(
      goal,
      priorItems,
      listRuntimeAdmittedKinds(PRODUCTION_V2_ADMISSION),
      acceptanceContract,
    ));
    return plannedItemsToWorkItems(parsePlannedItems(raw));
  };
  const accepter = async (
    goal: string,
    items: WorkItem[],
    acceptanceContract?: GoalAcceptanceContractV1,
  ): Promise<boolean | GoalAcceptanceEvaluation> => {
    await opts.admitInvocation?.({ role: 'auditor', purpose: 'goal-acceptance' });
    if (!acceptanceContract) {
      const raw = await complete(buildGoalAcceptPromptLegacy(goal, items));
      return parseGoalAccepted(raw);
    }
    const prompt = buildGoalAcceptPrompt(goal, items, acceptanceContract);
    const completed = opts.acceptanceComplete
      ? await opts.acceptanceComplete(prompt)
      : {
        output: await complete(prompt),
        evaluatorRole: 'auditor' as const,
        evaluatorInstanceId: null,
        invocationReceiptRef: null,
      };
    return parseGoalAcceptanceEvaluation(
      completed.output,
      completed.evaluatorRole,
      completed.evaluatorInstanceId,
      completed.invocationReceiptRef,
      (opts.now ?? (() => new Date()))().toISOString(),
    );
  };
  return buildGoalDeps({
    planner,
    accepter,
    maxRounds: GOAL_MAX_ROUNDS,
    admission: PRODUCTION_V2_ADMISSION,
    ...(opts.acceptanceReceiptVerifier
      ? { verifyAcceptanceReceipt: opts.acceptanceReceiptVerifier }
      : {}),
  });
}

// ─── start ────────────────────────────────────────────────────────────

export interface AutonomousStartOptions {
  intervalMs?: string;
  maxIterations?: string;
  root?: string;
  lang?: string;
}

export interface AutonomousEnableOptions {
  root?: string;
  lang?: string;
}

/** Read the project config JSON as a plain object ({} when absent/corrupt) —
 *  project-scoped only (hermetic; no global-config read). */
function readProjectConfigDoc(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {};
  try {
    const d: unknown = JSON.parse(readFileSync(configPath, 'utf-8'));
    return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * `deckent autonomous enable` — flip autonomous.enabled=true in the project
 * config with ONE command instead of a manual JSON edit (make-usable batch),
 * preserving every other key. The default stays OFF (safety invariant); this is
 * an explicit, deliberate opt-in that prints the human-approval safety contract.
 */
export function handleEnable(opts: AutonomousEnableOptions): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const configPath = join(root, PROJECT_CONFIG_PATH);
  const doc = readProjectConfigDoc(configPath);
  const autonomous = doc['autonomous'] && typeof doc['autonomous'] === 'object' && !Array.isArray(doc['autonomous'])
    ? (doc['autonomous'] as Record<string, unknown>)
    : {};
  if (autonomous['enabled'] === true) {
    print(getMessage('autonomous.already_enabled', lang, { path: PROJECT_CONFIG_PATH }));
    return;
  }
  autonomous['enabled'] = true;
  doc['autonomous'] = autonomous;
  mkdirSync(dirname(configPath), { recursive: true });
  writeConfigJsonAtomic(configPath, doc);
  print(getMessage('autonomous.enabled_banner', lang, { path: PROJECT_CONFIG_PATH }));
}

export async function handleStart(opts: AutonomousStartOptions): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  ensureAutonomousDir(root);

  // Flag-gate (safety invariant): the engine never runs unless explicitly enabled.
  const resolvedConfig = await loadConfig(root);
  if (!resolvedConfig.autonomous?.enabled) {
    print(getMessage('autonomous.disabled', lang));
    return;
  }

  // ── Autonomous-v2 cutover (flag-gated, DEFAULT-OFF) ──────────────────
  // Only `config.autonomous.engine === 'v2'` routes to the MissionStore +
  // MissionScheduler runtime; the entire v1 path below stays byte-for-byte
  // unchanged when the flag is absent/'v1' (existing autonomous tests stay green).
  if (isV2Engine(resolvedConfig)) {
    const stopFileV2 = stopMarkerPath(root);
    if (existsSync(stopFileV2)) rmSync(stopFileV2);
    const controllerV2 = new AbortController();
    const sigintV2 = (): void => controllerV2.abort();
    process.on('SIGINT', sigintV2);
    const maxIterationsV2 = opts.maxIterations !== undefined
      ? Math.max(0, parseInt(opts.maxIterations, 10) || 0)
      : undefined;
    const providerAuthority = openLocalProviderAuthorityRuntime(root, resolvedConfig);
    const approvalClock = (): Date => new Date();
    const lifecycle = resolvedConfig.approval!.lifecycle;
    const approvalAuthority = bootstrapApprovalAuthority(root, resolvedConfig, {
      broker: new ApprovalBroker(root, { lifecycle, clock: approvalClock }),
      store: new ApprovalStore(root, { lifecycle, clock: approvalClock }),
      now: approvalClock,
    });
    const missionStore = new SqliteMissionStore(root);
    const approvalCoordinator = approvalAuthority.state === 'ready'
      ? new MissionApprovalCoordinator({
          store: missionStore,
          publisher: approvalAuthority.runtime.broker,
          decisions: approvalAuthority.runtime.store,
          decisionAuthority: approvalAuthority.runtime.decisionAuthority,
          lifecycle,
          requestFactory: (item, mission, requestedAt) => {
            if (!mission.createdBy) {
              throw createExecutionAuthorityError('MISSION_APPROVAL_VERIFIED_OWNER_MISSING');
            }
            const effectClass = autonomousApprovalEffectClass({
              kind: item.kind,
              spec: item.spec,
              policy: item.policy,
            });
            const risk = autonomousApprovalRisk(effectClass, item.policy === 'risk-tagged');
            const profile = lifecycle.profiles['autonomous-trigger'];
            return {
              requester: {
                role: 'brain',
                instanceId: `goal-v2:${mission.id}`,
              },
              summary: getMessage('autonomous.approval_request_summary', lang, {
                id: item.id,
                title: String(item.spec?.['title'] ?? item.id),
              }),
              details: {
                missionId: mission.id,
                workItemId: item.id,
                kind: item.kind,
                policy: item.policy,
                revision: item.revision,
                effectClass,
              },
              scopeId: mission.id,
              scope: 'lifecycle',
              risk,
              policy: 'require-approval',
              defaultAction: 'deny',
              tenantId: mission.tenant,
              userId: mission.createdBy,
              createdAt: requestedAt.toISOString(),
              expiresAt: new Date(requestedAt.getTime() + profile.ttlMs).toISOString(),
              maskedArgs: {
                missionId: mission.id,
                workItemId: item.id,
                kind: item.kind,
              },
              rawArgsRef: null,
            };
          },
        })
      : undefined;
    const standaloneInvocationReceiptStore = providerAuthority.state === 'hold'
      ? new InvocationReceiptStore(root)
      : null;
    const invocationReceiptStore = providerAuthority.state === 'ready'
      ? providerAuthority.service.invocationReceiptLedger
      : standaloneInvocationReceiptStore!;
    const workerAuthorityHold = providerAuthority.state === 'hold'
      ? providerAuthority
      : {
          state: 'hold' as const,
          reasonCode: 'mission_worker_candidate_adapter_unavailable',
          authorityEvidenceRef: providerAuthority.authorityEvidenceRef,
        };
    try {
      const summary = await runV2Engine(root, resolvedConfig, {
        store: missionStore,
        ...(approvalCoordinator ? { approvalCoordinator } : {}),
        // The coordinator is the only gate to this exact executor. Provider
        // adapters are deliberately not bootstrapped before this authority
        // boundary; typed composition/candidate HOLDs park before Task JSON,
        // provider CLI discovery, or spawn.
        workerInvocationCoordinator: new MissionWorkerInvocationCoordinator(workerAuthorityHold),
        workerInvocationRecoveryReconciler:
          new MissionWorkerInvocationRecoveryReconciler(invocationReceiptStore),
        runTask: async () => ({
          ok: false,
          dispatchDisposition: 'parked',
          reason: 'MISSION_WORKER_INVOCATION_HOLD:exact_executor_unavailable',
        }),
        runAdmittedTask: async () => {
          throw ErrorRegistry.createError('DECKENT_E095', { message: 'MISSION_WORKER_EXACT_ROUTE_LOCK_UNAVAILABLE' });
        },
        executeSprint: async (context) => {
          const exactExecutor = createLiveAutonomousExactSprintExecutor({
            providerAuthority,
            approvalAuthority,
            verifyStartAuthorization: (authorization) => {
              const expectedAuthorityId = `mission-engine:${context.mission.id}`;
              if (
                authorization.authorityId !== expectedAuthorityId
                || authorization.decisionId !== context.claim.attemptId
                || !missionStore.isDispatchClaimActive(context.claim)
              ) {
                return { allowed: false, reasonCode: 'MISSION_EXACT_START_AUTHORITY_STALE' };
              }
              return {
                allowed: true,
                authorityRef: `${expectedAuthorityId}:${context.claim.attemptId}`,
              };
            },
          });
          return missionExactOutcomeResult(
            await exactExecutor.execute(context.execution),
          );
        },
        // Type-2 goal-driver: real planner + acceptance evaluator (same provider as
        // the JIT planner). Without this, idle `kind='goal'` missions never advance —
        // author/accept stays inert (the live wiring-gap this closes). buildGoalDeps
        // carries the maxRounds infinite-loop guard. 454-003: the model is the
        // canonical configured Brain model, resolved + validated before the loop starts
        // — never the 'sonnet' alias literal.
        goalDeps: buildLiveGoalDeps(
          realPlannerComplete(resolvePlannerModelIdentity(resolvedConfig, lang)),
          {
            admitInvocation: makeGoalRoleAdmissionGuard(
              resolvedConfig,
              providerAuthority,
            ),
            acceptanceReceiptVerifier: (mission, evaluation) =>
              verifyGoalAcceptanceInvocationReceipt(invocationReceiptStore, mission, evaluation),
          },
        ),
        signal: controllerV2.signal,
        ...(maxIterationsV2 !== undefined ? { maxIterations: maxIterationsV2 } : {}),
        lang,
      });
      print(getMessage('autonomous.start_done', lang, {
        iterations: String(summary.iterations),
        reason: summary.reason,
      }));
    } finally {
      missionStore.close();
      if (approvalAuthority.state === 'ready') approvalAuthority.runtime.close();
      standaloneInvocationReceiptStore?.close();
      providerAuthority.close();
      process.off('SIGINT', sigintV2);
    }
    return;
  }

  // Rollout-safe v1 adoption: an owner-authored provider-limit layer activates
  // the shared process authority. Once active, provider bootstrap cannot run
  // ahead of admission; without the layer, prior v1 behavior is unchanged.
  const providerAuthority = openLocalProviderAuthorityRuntimeIfConfigured(root, resolvedConfig);
  let approvalAuthority: ReturnType<typeof bootstrapApprovalAuthority> | undefined;
  try {
    // Gap A fix: register provider adapters (including OllamaAdapter) so that
    // getProviderAdapterForTask('ollama') resolves correctly for autonomous tasks.
    // bootstrapProviders is idempotent and safe-no-op when a provider is unreachable.
    if (!providerAuthority) await bootstrapProviders(resolvedConfig);
    const approvalClock = (): Date => new Date();
    const lifecycle = resolvedConfig.approval!.lifecycle;
    approvalAuthority = bootstrapApprovalAuthority(root, resolvedConfig, {
      broker: new ApprovalBroker(root, { lifecycle, clock: approvalClock }),
      store: new ApprovalStore(root, { lifecycle, clock: approvalClock }),
      now: approvalClock,
    });

  // Clear any stale stop marker before starting.
  const stopFile = stopMarkerPath(root);
  if (existsSync(stopFile)) rmSync(stopFile);

  const backlogPath = join(root, resolvedConfig.autonomous.backlog_path ?? '.deckent/autonomous/backlog.json');
  // Crash recovery: legacy running entries without exact attempt authority
  // become a typed parked HOLD; never blind-redrive ambiguous side effects.
  recoverBacklog(backlogPath);

  const flows = loadFlows(root);
  const policy = defaultPolicy();

  // runTaskMode requires task-style config. Exact Sprint execution receives
  // its style-scoped config inside the canonical executor.
  const taskConfig = { ...resolvedConfig, deckent_style: 'task' as const };
  const exactSprintExecutor = createLiveAutonomousExactSprintExecutor({
    ...(providerAuthority ? { providerAuthority } : {}),
    ...(approvalAuthority ? { approvalAuthority } : {}),
  });

  // Work-generator wire (flag-gated, default-off): active tech-debt records
  // become backlog candidates, throttled to work_generator.interval_ms.
  const workGenConfig = resolvedConfig.autonomous.work_generator;
  const generateWork = workGenConfig?.enabled
    ? makeDebtWorkGenerator({ projectRoot: root, intervalMs: workGenConfig.interval_ms })
    : undefined;

  const { deps } = buildEngineRuntime({
    projectRoot: root,
    config: resolvedConfig,
    backlogPath,
    flows,
    policy,
    generateWork,
    pendingPath: autonomousPendingPath(root),
    runTask: (ctx) => runTaskMode({
      description: ctx.description,
      model: ctx.model as ModelType | undefined,
      provider: ctx.provider,
      scope: ctx.scope,
      projectRoot: ctx.projectRoot ?? root,
      autoApprove: true,
      ...(providerAuthority ? { providerAuthority } : {}),
      ...(approvalAuthority?.state === 'ready'
        ? {
            attendedExecutionApprovalAuthority:
              approvalAuthority.runtime.attendedExecutionApprovalAuthority,
          }
        : {}),
    }, taskConfig),
    executeSprint: exactSprintExecutor.execute,
    // Gap F: real completion tracking — wire in the CLI's waitForRunResult primitive.
    // Gap B: resultTimeoutMs from config; fallback to 600s (enough for cold ollama load).
    waitForResult: waitForRunResult,
    resultTimeoutMs: (resolvedConfig.autonomous as Record<string, unknown> | undefined)?.result_timeout_ms as number | undefined,
    ...(providerAuthority
      ? {
          admitProviderExecution: (entry: BacklogEntry) => {
            const requestedModel = entry.model ?? resolveDefaultModel(resolvedConfig);
            if (entry.provider === 'openrouter') {
              registerOpenRouterModelFromCache(root, requestedModel);
            }
            const identity = resolveExecutionModelIdentity(requestedModel, entry.provider);
            const workerProviderOrder = orderedRoleProviders('worker', resolvedConfig);
            const decision = preflightProviderExecutionIngress(providerAuthority, {
              runId: entry.id,
              taskId: entry.id,
              provider: identity.provider,
              model: identity.model,
              configuredBackend: resolvedConfig.spawn_backend ?? 'auto',
              fallbackProviders: [
                workerProviderOrder.primary,
                ...workerProviderOrder.fallbacks,
              ].filter(candidate => candidate !== identity.provider),
              // ADR-G-037: autonomous/scheduled/reactive execution is always
              // unattended; provider fallback config cannot relax attendance.
              unattended: true,
            });
            if (decision.decision !== 'hold') {
              return { decision: 'allow' as const };
            }
            return {
              decision: 'hold' as const,
              hold: {
                schemaVersion: 1 as const,
                executionId: entry.id,
                tenantId: entry.tenant ?? entry.actor?.tenantId ?? 'local',
                projectId: providerAuthority.state === 'ready'
                  ? providerAuthority.projectId
                  : null,
                reasonCode: decision.reasonCode,
                authorityEvidenceRefs: decision.authorityEvidenceRefs,
                heldAt: new Date().toISOString(),
              },
            };
          },
        }
      : {}),
    // Task 8: goal-planner Phase 2 — dispatched `planned` entries get JIT detail
    // generated by the real provider before they run (title-only fallback on failure).
    // 454-003: canonical configured Brain model, resolved + validated before the loop
    // starts — never the 'sonnet' alias literal.
    jitComplete: realPlannerComplete(resolvePlannerModelIdentity(resolvedConfig, lang)),
    // CORE-UNIFORMITY (slice 1): live Brain+Auditor+CrossVerify flow on the autonomous
    // terminal (channel 1) + ENT-3 audit JSONL for AI operators (channel 2).
    flow: makeAutonomousFlowReporter(root, lang),
  });

  // Reactive ingestion (sub-project 2) — flag-gated, additional to autonomous.enabled.
  // N2: three sources share one ingester + reactive-map — nervous detections, repo
  // working-tree changes, and external webhook events all normalize to ReactiveEvent.
  const reactiveSources: Array<{ start(): void; stop(): void }> = [];
  let reactiveObserver: NervousObserver | null = null;
  if (resolvedConfig.autonomous.reactive?.enabled) {
    const reactive = resolvedConfig.autonomous.reactive;
    const mapPath = join(root, reactive.map_path ?? '.deckent/autonomous/reactive-map.json');
    const reactiveMap = loadReactiveMap(mapPath);
    let rxCounter = 0;
    const ingester = makeReactiveIngester({
      backlogPath,
      map: reactiveMap,
      idGen: () => `rx-${new Date().toISOString()}-${++rxCounter}`,
    });
    reactiveObserver = new NervousObserver(root);
    reactiveSources.push(makeNervousReactiveSource({ observer: reactiveObserver, ingester }));
    // N2: repo-watch — working-tree changes → backlog (ignores deckent-internal dirs).
    if (reactive.repo_watch?.enabled) {
      reactiveSources.push(makeRepoWatchReactiveSource({ projectRoot: root, ingester }));
    }
    // N2: webhook — drains the durable inbox the POST /api/reactive/webhook ingress writes.
    if (reactive.webhook?.enabled) {
      const inboxPath = join(root, '.deckent', 'autonomous', 'reactive-inbox.jsonl');
      reactiveSources.push(makeWebhookReactiveSource({ inboxPath, ingester }));
    }
    for (const source of reactiveSources) source.start();
  }

  // N1 (F3-009 attach-only fix): drive the built-in nervous detectors LIVE in
  // autonomous. createNervousSystemIfEnabled builds the self-driving observer
  // (FS-watch + periodic scan) + the full pipeline + executor (the 30 real action
  // handlers) so detections actually flow — notify / recommend / autonomous
  // maintenance — without needing a sprint to host the observer. Internally
  // gated by config.nervous_system.enabled (returns null when off → no-op). The
  // sprintStateProvider reads disk state (IDLE_SNAPSHOT when no sprint is live).
  const nervousHandle: NervousSystemHandle | null = createNervousSystemIfEnabled(
    resolvedConfig as unknown as DeckentConfig,
    root,
    () => getSprintStateSnapshot(root),
    undefined, // default actionHandler (createActionHandler with the 30 real handlers)
    // N1 fix: autonomous has no hosted sprint (phase permanently IDLE) — let the
    // built-in detectors fire in any phase so live detections actually flow.
    { observerActiveInAnyPhase: true },
  );

  const controller = new AbortController();
  const signalHandler = (): void => controller.abort();
  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

  const intervalMs = opts.intervalMs !== undefined
    ? Math.max(0, parseInt(opts.intervalMs, 10) || 0)
    : (resolvedConfig.autonomous.interval_ms ?? 5000);
  const maxIterations = opts.maxIterations !== undefined
    ? Math.max(0, parseInt(opts.maxIterations, 10) || 0)
    : undefined;

  // Wire DECKENT→USER:NOTIFY so parked approvals + cycle outcomes reach this
  // terminal AND the configured messaging connectors — W9-A: a standalone
  // `deckent autonomous` run now pushes parks to Telegram the same way a sprint
  // does (mirrors start.ts). Without the connector adapter, autonomous notify()
  // only reached the local TTY; with `deckent bot listen` up, the pushed park is
  // approvable straight from Telegram. Silent no-op otherwise (§4G).
  // KPI Faz-2: forward a sprint-end KPI summary fn (non-blocking, connector
  // broadcast on sprint-finalized). No-op when no connectors are configured.
  const connectorAdapter = await buildConnectorAdapterWithKpiSummary(
    resolvedConfig.notify_connectors,
    { kpiSummaryFn: buildSprintKpiSummaryFn(root, lang) },
  );
  // This command owns the dispatcher for exactly the lifetime of this loop.
  // Keep the returned handle so every exit path awaits the dispatcher's one
  // canonical, idempotent close (including connector sockets and timers).
  const notifyDispatcher = bootstrapNotifyDispatcher({
    projectRoot: root,
    extraAdapters: connectorAdapter ? [connectorAdapter] : [],
    webhook: resolveWebhookBootstrapOption(resolvedConfig),
  });
  try {
  const onTick = makeTickReporter(lang);

  // Surface the immediate work queue, not just scheduled flows: an empty/all-done backlog
  // would otherwise idle silently behind a "0 flow(s)"-only banner. pending = ready-now;
  // recurring/reactive entries are scheduled (they re-arm later) so they suppress the warning.
  const backlogEntries = (() => {
    try { return loadBacklog(backlogPath).entries; } catch { return []; }
  })();
  const pendingCount = backlogEntries.filter((e) => e.status === 'pending').length;
  const scheduledCount = backlogEntries.filter(
    (e) => e.trigger.type === 'recurring' || e.trigger.type === 'reactive',
  ).length;
  print(getMessage('autonomous.start_banner', lang, {
    flows: String(flows.length), pending: String(pendingCount),
  }));
  if (pendingCount === 0 && flows.length === 0 && scheduledCount === 0) {
    print(getMessage('autonomous.start_no_work', lang));
  }

  // Wrap sleep so the stop marker triggers abort.
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(() => {
      if (existsSync(stopFile)) controller.abort();
      resolve();
    }, ms));

  const loopConfig: AutonomousRuntimeConfig = {};
    const summary = await runAutonomousLoop(loopConfig, deps, {
      intervalMs,
      maxIterations,
      signal: controller.signal,
      sleep,
      onTick,
    });
    print(getMessage('autonomous.start_done', lang, {
      iterations: String(summary.iterations),
      reason: summary.reason,
    }));
  } finally {
    try {
      process.off('SIGINT', signalHandler);
      process.off('SIGTERM', signalHandler);
      for (const source of reactiveSources) source.stop();
      // Ensure the observer releases any timers/watchers it started so the
      // process (and tests) can exit cleanly.
      reactiveObserver?.stop?.();
      // N1: tear down the nervous system (observer watchers + executor timers +
      // heartbeat) so the process exits cleanly.
      nervousHandle?.dispose();
      // AUT-6: the loop has ended (no task is in-flight here), so sweep stray
      // per-run artifacts (task-run-*.{hb,result,json,prompt,worker,log}, _*.pid)
      // that the execute-dispatcher leaves behind — keeps .tasks/ from accumulating
      // run files across autonomous sessions. Best-effort; never throws.
      cleanupAutonomousArtifacts(root);
    } finally {
      await notifyDispatcher.close();
    }
  }
  } finally {
    if (approvalAuthority?.state === 'ready') approvalAuthority.runtime.close();
    providerAuthority?.close();
  }
}

// ─── status ───────────────────────────────────────────────────────────

export interface AutonomousStatusOptions {
  root?: string;
  lang?: string;
}

export function handleStatus(opts: AutonomousStatusOptions): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();

  let pendingCount = 0;
  const pf = autonomousPendingPath(root);
  if (existsSync(pf)) {
    try {
      const data = JSON.parse(readFileSync(pf, 'utf-8'));
      if (Array.isArray(data)) pendingCount = data.length;
    } catch {
      pendingCount = 0;
    }
  }

  const auditLines: string[] = [];
  const ef = eventsPath(root);
  if (existsSync(ef)) {
    try {
      auditLines.push(
        ...readFileSync(ef, 'utf-8').split('\n').filter((l) => l.trim().length > 0),
      );
    } catch {
      // tolerated — file disappeared between exists check and read
    }
  }
  const recent = auditLines.slice(-5);

  // Backlog summary
  try {
    const entries = backlogList({ root });
    const counts = { pending: 0, running: 0, parked: 0, done: 0, failed: 0 };
    for (const e of entries) {
      if (e.status in counts) counts[e.status as keyof typeof counts]++;
    }
    print(getMessage('autonomous.backlog.summary', lang, {
      total: String(entries.length),
      pending: String(counts.pending),
      running: String(counts.running),
      parked: String(counts.parked),
      done: String(counts.done),
      failed: String(counts.failed),
    }));
  } catch {
    // tolerated — no backlog file yet
  }

  print(getMessage('autonomous.status_header', lang));
  print(getMessage('autonomous.status_pending', lang, { count: String(pendingCount) }));
  if (recent.length === 0) {
    print(getMessage('autonomous.status_no_audit', lang));
    return;
  }
  print(getMessage('autonomous.status_recent_audit', lang, { count: String(recent.length) }));
  for (const line of recent) {
    try {
      const ev = JSON.parse(line) as { payload?: Record<string, unknown>; timestamp?: string };
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      const ts = (payload['timestamp'] as string | undefined) ?? ev.timestamp ?? '';
      const action = (payload['action'] as string | undefined) ?? '?';
      const outcome = (payload['outcome'] as string | undefined) ?? '?';
      const reason = (payload['reason'] as string | undefined) ?? '';
      print(getMessage('autonomous.audit_row', lang, { ts, action, outcome, reason }));
    } catch {
      // skip malformed audit line
    }
  }
}

// ─── stop ─────────────────────────────────────────────────────────────

export interface AutonomousStopOptions {
  root?: string;
  lang?: string;
}

export function handleStop(opts: AutonomousStopOptions): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  ensureAutonomousDir(root);
  writeFileSync(stopMarkerPath(root), new Date().toISOString(), 'utf-8');
  print(getMessage('autonomous.stop_marker_written', lang));
}

// ─── cleanup ──────────────────────────────────────────────────────────

export interface AutonomousCleanupOptions {
  root?: string;
  lang?: string;
}

/**
 * Manually sweep stray autonomous run-artifacts (task-run-*, _*.pid) from .tasks/.
 * The engine also does this on stop (handleStart finally), but a long-running or
 * crashed session can leave artifacts behind — this gives the operator an explicit
 * on-demand sweep. Reports the count removed. (AUT-6 / MASTER-PLAN §4A devam #3.)
 */
export function handleCleanup(opts: AutonomousCleanupOptions): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const removed = cleanupAutonomousArtifacts(root);
  print(getMessage('autonomous.cleanup_done', lang, { count: String(removed) }));
}

// ─── live feedback (onTick reporter) (APPROVE-002, §4G) ────────────────

export interface TickReporterDeps {
  /** Output sink — defaults to the CLI print helper. */
  print?: (line: string) => void;
  /** Notification sink — defaults to notifyAsync (DECKENT→USER:NOTIFY). */
  notify?: typeof notifyAsync;
}

/**
 * Per-cycle observer wired into runAutonomousLoop.onTick. Prints a feedback
 * line on outcome change (idle no_trigger suppressed) and fires ONE
 * notification the first time a trigger parks pending — re-arming if that
 * trigger later resolves, so a re-park notifies again but a still-pending
 * trigger does not spam every cycle.
 */
export function makeTickReporter(
  lang: string,
  deps: TickReporterDeps = {},
): (result: AutonomousCycleResult) => void {
  const out = deps.print ?? print;
  const notifyFn = deps.notify ?? notifyAsync;
  const notified = new Set<string>();
  let lastKey = '';
  return (result: AutonomousCycleResult): void => {
    if (result.outcome === 'no_trigger') return;
    const t = result.trigger;
    const id = t?.id ?? '?';
    const key = `${id}:${result.outcome}`;
    if (key !== lastKey) {
      out(
        getMessage('autonomous.tick', lang, {
          outcome: result.outcome,
          action: t?.action ?? '?',
          triggerId: id,
          reason: result.reason,
        }),
      );
      lastKey = key;
    }
    if (result.outcome === 'pending' && t && !notified.has(id)) {
      notified.add(id);
      notifyFn(
        'human-checkpoint-required',
        'autonomous',
        getMessage('autonomous.notify_pending_title', lang),
        getMessage('autonomous.notify_pending_summary', lang, {
          action: t.action,
          triggerId: id,
        }),
        undefined,
        {
          // Rich-approval bot: button-capable surfaces (Telegram) render these as
          // inline [✓ Approve] [✗ Reject] buttons whose press routes to the gate;
          // text surfaces keep the cliCommand. callbackData = `approve:<triggerId>`.
          actions: [
            {
              label: getMessage('autonomous.action_approve', lang),
              cliCommand: `deckent autonomous approve ${id}`,
              callbackData: `approve:${id}`,
            },
            {
              label: getMessage('autonomous.action_reject', lang),
              cliCommand: `deckent autonomous reject ${id}`,
              callbackData: `reject:${id}`,
            },
          ],
        },
      );
    }
    if (t && result.outcome !== 'pending') notified.delete(id);
  };
}

export interface AutonomousFlowDeps {
  print?: (line: string) => void;
  audit?: (record: FlowStepRecord) => void;
  now?: () => string;
}

/**
 * Build the live autonomous FlowReporter. Channel 1 = the CLI print helper (human
 * terminal debug flow). Channel 2 = the ENT-3 audit hash-chain (writeAuditEvent), so an
 * AI operator collects the full orchestration flow as durable JSONL. Sinks are injectable
 * for hermetic tests; defaults wire the real surfaces.
 */
export function makeAutonomousFlowReporter(
  root: string,
  lang: string,
  deps: AutonomousFlowDeps = {},
): FlowReporter {
  const auditSink = deps.audit ?? ((record: FlowStepRecord): void => {
    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local',
      actor: 'system',
      action: `flow.${record.step}`,
      target: record.entryId,
      metadata: { detail: record.detail, timestamp: record.timestamp },
    });
  });
  return makeFlowReporter({
    print: deps.print ?? print,
    audit: auditSink,
    lang,
    ...(deps.now ? { now: deps.now } : {}),
  });
}

// ─── approve / reject / pending (APPROVE-002, §4G) ─────────────────────

/** Build a gate bound to this project's pending queue (decisions.json sibling). */
async function approvalGateFor(root: string): Promise<ApprovalGateAdapter> {
  const config = await loadConfig(root);
  return makeApprovalGate({
    pendingPath: autonomousPendingPath(root),
    projectRoot: root,
    lifecycle: config.approval!.lifecycle,
    principal: resolveLocalOsPrincipal('cli'),
    strictTenantIsolation: config.strict_tenant_isolation ?? false,
  });
}

export interface AutonomousResolveOptions {
  triggerId: string;
  reason?: string;
  root?: string;
  lang?: string;
}

/**
 * Resolve a parked trigger. Runs in a process SEPARATE from `autonomous start`,
 * so it records the decision via the file-mediated channel (APPROVE-001); the
 * running loop applies it on its next cycle. ADR-040: only an explicit
 * approve/reject resolves — never auto-approve.
 */
export async function handleApprove(opts: AutonomousResolveOptions): Promise<void> {
  await resolveTrigger(opts, 'approve');
}

export async function handleReject(opts: AutonomousResolveOptions): Promise<void> {
  await resolveTrigger(opts, 'reject');
}

async function resolveTrigger(opts: AutonomousResolveOptions, kind: 'approve' | 'reject'): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  if (!opts.triggerId) {
    printError(new Error(getMessage('autonomous.id_required', lang)));
    process.exitCode = 1;
    return;
  }
  const gate = await approvalGateFor(root);
  try {
    if (kind === 'approve') {
      gate.accept(opts.triggerId, opts.reason);
      print(getMessage('autonomous.approve_done', lang, { triggerId: opts.triggerId }));
    } else {
      gate.reject(opts.triggerId, opts.reason);
      print(getMessage('autonomous.reject_done', lang, { triggerId: opts.triggerId }));
    }
  } catch (error) {
    const message = error instanceof ClosedApprovalRequestError && error.reasonCode === 'expired'
      ? getMessage('approval.channel.expired', lang, { id: opts.triggerId })
      : getMessage('autonomous.resolve_not_found', lang, { triggerId: opts.triggerId });
    printError(new Error(message));
    process.exitCode = 1;
  }
}

export interface AutonomousPendingOptions {
  root?: string;
  lang?: string;
}

/** List parked approvals awaiting a human accept/reject. */
export async function handlePending(opts: AutonomousPendingOptions): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const items = (await approvalGateFor(root)).pending();
  if (items.length === 0) {
    print(getMessage('autonomous.pending_none', lang));
    return;
  }
  print(getMessage('autonomous.pending_header', lang, { count: String(items.length) }));
  for (const p of items) {
    print(getMessage('autonomous.pending_row', lang, {
      triggerId: p.triggerId,
      action: p.action,
      requestedBy: p.requestedBy,
      enqueuedAt: p.enqueuedAt,
    }));
  }
}

// ─── register ─────────────────────────────────────────────────────────

function isAutonomousEngineEnabled(root: string): boolean {
  try { return (JSON.parse(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')) as { autonomous?: { enabled?: boolean } }).autonomous?.enabled === true; } catch { return false; }
}
function warnIfAutonomousEngineDisabled(root: string, lang: string): void {
  if (!isAutonomousEngineEnabled(root)) print(getMessage('autonomous_mission.engine_disabled_warning', lang));
}

function autonomousDbPath(root: string): string {
  return join(root, DECKENT_DIR, 'autonomous', 'autonomous.db');
}

function openStore(root: string): SqliteMissionStore {
  const store = new SqliteMissionStore(root);
  store.migrate();
  return store;
}

// ─── Item parsing ───────────────────────────────────────────────────────

export interface ParsedItem {
  kind: WorkItemKind;
  spec?: Record<string, unknown>;
  id?: string;
}

/** Parse `--item kind:spec` flags into work-item specs. */
export function parseItemFlags(flags: string[]): ParsedItem[] {
  return flags.map((raw) => {
    const colonIdx = raw.indexOf(':');
    if (colonIdx === -1) {
      return { kind: raw as WorkItemKind };
    }
    const kind = raw.slice(0, colonIdx) as WorkItemKind;
    const specStr = raw.slice(colonIdx + 1);
    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(specStr) as Record<string, unknown>;
    } catch {
      spec = { description: specStr };
    }
    return { kind, spec };
  });
}

/** Load items from a JSON file (array of {kind, spec?, id?, policy?}). */
export function loadItemsFromFile(filePath: string): ParsedItem[] {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  if (!Array.isArray(raw)) throw new Error('Expected JSON array');
  return (raw as Array<Record<string, unknown>>).map((e) => ({
    kind: e['kind'] as WorkItemKind,
    spec: e['spec'] as Record<string, unknown> | undefined,
    id: typeof e['id'] === 'string' ? e['id'] : undefined,
  }));
}

// ─── Handler functions (exported for testability) ───────────────────────

export interface CreateListOpts {
  root: string;
  lang: string;
  title: string;
  items: ParsedItem[];
  id?: string;
  tenant?: string;
  deliverTo?: string;
}

export function handleCreateList(opts: CreateListOpts): void {
  const store = openStore(opts.root);
  try {
    const missionId = opts.id ?? `list-${Date.now()}`;
    let mission: ReturnType<typeof createListMission>;
    try {
      mission = createListMission(store, {
        id: missionId,
        title: opts.title,
        tenant: opts.tenant,
        deliverTo: opts.deliverTo,
        items: opts.items,
      }, { admission: PRODUCTION_V2_ADMISSION });
    } catch (error) {
      if (error instanceof MissionAdmissionError) {
        throw new DeckentError('DECKENT_E039', getMessage('autonomous.plan_kind_rejected', opts.lang, {
          id: error.itemId,
          kind: error.kind,
          reason: error.code,
          allowed: listRuntimeAdmittedKinds(PRODUCTION_V2_ADMISSION).join(', '),
        }));
      }
      throw error;
    }
    auditMissionLifecycle(opts.root, {
      tenantId: opts.tenant ?? 'local',
      actor: 'cli',
      action: 'missions:create',
      missionId: mission.id,
      metadata: { kind: mission.kind, title: mission.title },
    });
    print(
      getMessage('autonomous_mission.create_list.created', opts.lang, {
        id: mission.id,
        title: mission.title,
        count: String(opts.items.length),
      }),
    );
    warnIfAutonomousEngineDisabled(opts.root, opts.lang);
  } finally {
    store.close();
  }
}

export interface CreateGoalOpts {
  root: string;
  lang: string;
  goal: string;
  title?: string;
  acceptance?: string;
  id?: string;
  tenant?: string;
  deliverTo?: string;
}

export function handleCreateGoal(opts: CreateGoalOpts): void {
  const store = openStore(opts.root);
  try {
    const missionId = opts.id ?? `goal-${Date.now()}`;
    const mission = createGoalMission(store, {
      id: missionId,
      title: opts.title ?? opts.goal,
      goal: opts.goal,
      acceptance: opts.acceptance,
      acceptanceAuthoredBy: { surface: 'cli', actorId: null },
      tenant: opts.tenant,
      deliverTo: opts.deliverTo,
    });
    auditMissionLifecycle(opts.root, {
      tenantId: opts.tenant ?? 'local',
      actor: 'cli',
      action: 'missions:create',
      missionId: mission.id,
      metadata: { kind: mission.kind, title: mission.title },
    });
    print(
      getMessage('autonomous_mission.create_goal.created', opts.lang, {
        id: mission.id,
        goal: opts.goal,
      }),
    );
    warnIfAutonomousEngineDisabled(opts.root, opts.lang);
  } finally {
    store.close();
  }
}

export interface ListMissionsOpts {
  root: string;
  lang: string;
  tenant?: string;
  json?: boolean;
}

export function handleListMissions(opts: ListMissionsOpts): void {
  const dbPath = autonomousDbPath(opts.root);
  if (!existsSync(dbPath)) {
    print(getMessage('autonomous_mission.list.empty', opts.lang));
    return;
  }

  const store = openStore(opts.root);
  try {
    const missions = store.listMissions(opts.tenant ? { tenant: opts.tenant } : undefined);

    if (opts.json) {
      const views = missions.map((m) => projectMission(store, m.id)).filter(Boolean);
      print(JSON.stringify(views, null, 2));
      return;
    }

    if (missions.length === 0) {
      print(getMessage('autonomous_mission.list.empty', opts.lang));
      return;
    }

    print(
      getMessage('autonomous_mission.list.header', opts.lang, {
        count: String(missions.length),
      }),
    );
    for (const m of missions) {
      const view = projectMission(store, m.id);
      if (!view) continue;
      const progress = `${view.progress.done}/${view.progress.total}`;
      print(`  ${m.id}  [${m.renderAs}]  ${m.status}  ${progress}  ${m.title}`);
    }
  } finally {
    store.close();
  }
}

// ─── Commander registration ─────────────────────────────────────────────

function registerAutonomousMissionSubcommand(cmd: Command): void {
  const grp = cmd.command('mission')
    .description(getMessage('cli.autonomous_mission.desc', getLanguage(undefined)));

  // create-list <title>
  bindGovernanceArgumentDescriptions(
    grp.command('create-list <title>'),
    getLanguage(undefined),
    { title: 'cli.governance.mission.arg.title' },
  )
    .description(getMessage('cli.autonomous_mission.create_list.desc', getLanguage(undefined)))
    .option(
      '--item <kind:spec>',
      getMessage('cli.governance.mission.opt.item', getLanguage(undefined)),
      (val: string, acc: string[]) => [...acc, val],
      [] as string[],
    )
    .option('--items-file <path>', getMessage('cli.governance.mission.opt.items_file', getLanguage(undefined)))
    .option('--id <id>', getMessage('cli.governance.mission.opt.id', getLanguage(undefined)))
    .option('--tenant <tenant>', getMessage('cli.governance.opt.tenant', getLanguage(undefined)))
    .option('--deliver-to <channel>', getMessage('cli.governance.mission.opt.deliver_to', getLanguage(undefined)))
    .action((title: string, opts: {
      item: string[];
      itemsFile?: string;
      id?: string;
      tenant?: string;
      deliverTo?: string;
    }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);

      let items: ParsedItem[] = [];
      if (opts.itemsFile) {
        try {
          items = loadItemsFromFile(opts.itemsFile);
        } catch (err) {
          printError(
            getMessage('autonomous_mission.items_file_error', lang, { error: String(err) }),
          );
          return;
        }
      }
      items = [...items, ...parseItemFlags(opts.item)];

      handleCreateList({ root, lang, title, items, id: opts.id, tenant: opts.tenant, deliverTo: opts.deliverTo });
    });

  // create-goal <goal>
  bindGovernanceArgumentDescriptions(
    grp.command('create-goal <goal>'),
    getLanguage(undefined),
    { goal: 'cli.governance.mission.arg.goal' },
  )
    .description(getMessage('cli.autonomous_mission.create_goal.desc', getLanguage(undefined)))
    .option('--accept <criteria>', getMessage('cli.governance.mission.opt.accept', getLanguage(undefined)))
    .option('--title <title>', getMessage('cli.governance.mission.opt.title', getLanguage(undefined)))
    .option('--id <id>', getMessage('cli.governance.mission.opt.id', getLanguage(undefined)))
    .option('--tenant <tenant>', getMessage('cli.governance.opt.tenant', getLanguage(undefined)))
    .option('--deliver-to <channel>', getMessage('cli.governance.mission.opt.deliver_to', getLanguage(undefined)))
    .action((goal: string, opts: {
      accept?: string;
      title?: string;
      id?: string;
      tenant?: string;
      deliverTo?: string;
    }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      handleCreateGoal({
        root,
        lang,
        goal,
        title: opts.title,
        acceptance: opts.accept,
        id: opts.id,
        tenant: opts.tenant,
        deliverTo: opts.deliverTo,
      });
    });

  // list
  grp
    .command('list')
    .description(getMessage('cli.autonomous_mission.list.desc', getLanguage(undefined)))
    .option('--json', getMessage('cli.governance.opt.json', getLanguage(undefined)))
    .option('--tenant <tenant>', getMessage('cli.governance.opt.tenant_filter', getLanguage(undefined)))
    .action((opts: { json?: boolean; tenant?: string }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      handleListMissions({ root, lang, json: opts.json, tenant: opts.tenant });
    });
}


export function registerAutonomous(program: Command): void {
  const cmd = program
    .command('autonomous')
    .description(getMessage('cli.autonomous.desc', getLanguage(undefined)));

  cmd
    .command('enable')
    .description(getMessage('cli.autonomous.enable.desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action((opts: AutonomousEnableOptions) => {
      try {
        handleEnable(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('start')
    .description(getMessage('cli.autonomous.start.desc', getLanguage(undefined)))
    .option('--interval-ms <ms>', getMessage('cli.governance.autonomous.opt.interval_ms', getLanguage(undefined)), '1000')
    .option('--max-iterations <n>', getMessage('cli.governance.autonomous.opt.max_iterations', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action(async (opts: AutonomousStartOptions) => {
      try {
        await handleStart(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  bindGovernanceArgumentDescriptions(
    cmd.command('plan <goal>'),
    getLanguage(undefined),
    { goal: 'cli.governance.autonomous.arg.goal' },
  )
    .description(getMessage('cli.autonomous.plan.desc', getLanguage(undefined)))
    .option('--from <ref>', getMessage('cli.governance.autonomous.opt.from', getLanguage(undefined)))
    .option('--policy <policy>', getMessage('cli.governance.autonomous.opt.policy', getLanguage(undefined)), 'auto')
    .option('--max-items <n>', getMessage('cli.governance.autonomous.opt.max_items', getLanguage(undefined)))
    .option('--model <model>', getMessage('run.opt_model', getLanguage(undefined)))
    .option('--provider <name>', getMessage('run.opt_provider', getLanguage(undefined), { providers: ALL_PROVIDER_NAMES.join('|') }))
    .option('--dry-run', getMessage('cli.governance.autonomous.opt.dry_run', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action(async (goal: string, o: { from?: string; policy?: string; maxItems?: string; model?: string; provider?: string; dryRun?: boolean; root?: string; lang?: string }) => {
      try {
        const root = o.root ?? resolveProjectRoot();
        const config = await loadConfig(root);
        await bootstrapProviders(config);
        // 454-003: resolve + validate through the canonical registry — a bare
        // --model alias (e.g. 'sonnet') is rejected with a localized error
        // rather than silently reaching the planner CLI unresolved.
        const model = resolvePlannerModelIdentity(config, getLanguage(o.lang), o.model, o.provider);
        await handlePlan({
          goal, root, from: o.from, policy: o.policy,
          maxItems: o.maxItems ? parseInt(o.maxItems, 10) : undefined,
          dryRun: o.dryRun, lang: o.lang, complete: realPlannerComplete(model),
          engine: isV2Engine(config) ? 'v2' : 'v1',
        });
      } catch (err) { printError(err); process.exitCode = 1; }
    });

  cmd
    .command('status')
    .description(getMessage('cli.autonomous.status.desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action((opts: AutonomousStatusOptions) => {
      try {
        handleStatus(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('stop')
    .description(getMessage('cli.autonomous.stop.desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action((opts: AutonomousStopOptions) => {
      try {
        handleStop(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('cleanup')
    .description(getMessage('cli.autonomous.cleanup.desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action((opts: AutonomousCleanupOptions) => {
      try {
        handleCleanup(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('pending')
    .description(getMessage('cli.autonomous.pending.desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action(async (opts: AutonomousPendingOptions) => {
      try {
        await handlePending(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  bindGovernanceArgumentDescriptions(
    cmd.command('approve <triggerId>'),
    getLanguage(undefined),
    { triggerId: 'cli.governance.autonomous.arg.trigger_id' },
  )
    .description(getMessage('cli.autonomous.approve.desc', getLanguage(undefined)))
    .option('--reason <text>', getMessage('cli.governance.autonomous.opt.decision_reason', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action(async (triggerId: string, opts: Omit<AutonomousResolveOptions, 'triggerId'>) => {
      try {
        await handleApprove({ triggerId, ...opts });
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  bindGovernanceArgumentDescriptions(
    cmd.command('reject <triggerId>'),
    getLanguage(undefined),
    { triggerId: 'cli.governance.autonomous.arg.trigger_id' },
  )
    .description(getMessage('cli.autonomous.reject.desc', getLanguage(undefined)))
    .option('--reason <text>', getMessage('cli.governance.autonomous.opt.decision_reason', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action(async (triggerId: string, opts: Omit<AutonomousResolveOptions, 'triggerId'>) => {
      try {
        await handleReject({ triggerId, ...opts });
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  // ─── backlog ──────────────────────────────────────────────────────────
  const backlog = cmd
    .command('backlog')
    .description(getMessage('cli.autonomous.backlog.desc', getLanguage(undefined)));

  backlog
    .command('add')
    .description(getMessage('cli.autonomous.add.desc', getLanguage(undefined)))
    .requiredOption('--id <id>', getMessage('cli.governance.autonomous.opt.entry_id', getLanguage(undefined)))
    .requiredOption('--title <title>', getMessage('cli.governance.autonomous.opt.entry_title', getLanguage(undefined)))
    .option('--kind <kind>', getMessage('cli.governance.autonomous.opt.entry_kind', getLanguage(undefined)), 'task')
    .option('--description <text>', getMessage('cli.governance.autonomous.opt.entry_description', getLanguage(undefined)), '')
    .option('--policy <policy>', getMessage('cli.governance.autonomous.opt.entry_policy', getLanguage(undefined)), 'auto')
    .option('--cron <expr>', getMessage('cli.governance.autonomous.opt.cron', getLanguage(undefined)))
    .option('--capability <verb>', getMessage('cli.governance.autonomous.opt.capability', getLanguage(undefined)))
    .option('--args <json>', getMessage('cli.governance.autonomous.opt.args', getLanguage(undefined)))
    .option('--connector <id>', getMessage('cli.governance.autonomous.opt.connector', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action((opts: {
      id: string; title: string; kind: string; description: string;
      policy: string; cron?: string; capability?: string; args?: string;
      connector?: string; root?: string; lang?: string;
    }) => {
      try {
        const lang = getLanguage(opts.lang);
        const root = opts.root ?? resolveProjectRoot();
        backlogAdd({
          root, id: opts.id, title: opts.title,
          kind: (opts.kind === 'sprint' || opts.kind === 'capability') ? opts.kind : 'task',
          description: opts.description,
          policy: (opts.policy as BacklogEntry['policy']),
          lang,
          cron: opts.cron,
          capability: opts.capability,
          capabilityArgs: opts.args,
          connector: opts.connector,
        });
        print(getMessage('autonomous.backlog.added', lang, { id: opts.id }));
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  backlog
    .command('list')
    .description(getMessage('cli.autonomous.list.desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action((opts: { root?: string; lang?: string }) => {
      try {
        const lang = getLanguage(opts.lang);
        const root = opts.root ?? resolveProjectRoot();
        const entries = backlogList({ root });
        if (entries.length === 0) {
          print(getMessage('autonomous.backlog.empty', lang));
          return;
        }
        print(getMessage('autonomous.backlog.list_header', lang, { count: String(entries.length) }));
        for (const e of entries) {
          print(getMessage('autonomous.backlog.list_row', lang, {
            status: e.status, id: e.id, title: e.title, kind: e.kind, policy: e.policy,
          }));
        }
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  bindGovernanceArgumentDescriptions(
    backlog.command('remove [id]'),
    getLanguage(undefined),
    { id: 'cli.governance.autonomous.arg.backlog_id' },
  )
    .description(getMessage('cli.autonomous.remove.desc', getLanguage(undefined)))
    .option('--id <id>', getMessage('cli.governance.autonomous.opt.remove_id', getLanguage(undefined)))
    .option('--root <path>', getMessage('cli.governance.opt.root', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.governance.opt.lang', getLanguage(undefined)))
    .action((positionalId: string | undefined, opts: { id?: string; root?: string; lang?: string }) => {
      try {
        const lang = getLanguage(opts.lang);
        const id = opts.id ?? positionalId;
        if (!id) {
          throw new DeckentError('DECKENT_E039', getMessage('autonomous.backlog.id_required', lang));
        }
        const root = opts.root ?? resolveProjectRoot();
        backlogRemove({ root, id, lang });
        print(getMessage('autonomous.backlog.removed', lang, { id }));
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  registerAutonomousMissionSubcommand(cmd);
}
