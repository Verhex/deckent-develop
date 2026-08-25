import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Command } from 'commander';
import { ApprovalBroker } from '../../core/approval-broker.js';
import { ApprovalStore } from '../../core/approval-store.js';
import { bootstrapApprovalAuthority } from '../../core/approval-authority-bootstrap.js';
import { openApprovalAuthorityRuntime } from '../../core/approval-authority-runtime.js';
import { loadConfig } from '../../core/config.js';
import { DeckentError } from '../../core/errors.js';
import type { ResolvedConfig } from '../../core/config-types.js';
import {
  inspectProviderExecutionObservationMigration, planProviderExecutionObservationMigration,
  safeProviderExecutionObservationProjectPath,
  type ProviderExecutionObservationMigrationApplyResult,
  type ProviderExecutionObservationMigrationInspection,
  type ProviderExecutionObservationMigrationPlan,
} from '../../core/provider-execution-observation-migration.js';
import {
  ProviderExecutionObservationMigrationApprovalBridge,
  type ProviderExecutionObservationMigrationApprovalSubmitResult,
} from '../../core/provider-execution-observation-migration-approval.js';
import {
  inspectProviderExecutionObservationAdoption, planProviderExecutionObservationAdoption,
  ProviderExecutionObservationAdoptionError,
  type ProviderExecutionObservationAdoptionInspection,
  type ProviderExecutionObservationAdoptionPlan,
} from '../../core/provider-execution-observation-adoption.js';
import {
  deriveProviderExecutionObservationAdoptionReceiptScope,
  providerExecutionObservationAdoptionDurableReceiptId,
  ProviderExecutionObservationAdoptionReceiptStoreError,
  publishProviderExecutionObservationAdoptionReceipt,
  readProviderExecutionObservationAdoptionReceipt,
  serializeProviderExecutionObservationAdoptionReceipt,
  type ProviderExecutionObservationAdoptionDurableReceipt,
} from '../../core/provider-execution-observation-adoption-receipt-store.js';
import {
  inventoryProviderExecutionObservationReconciliation,
  planProviderExecutionObservationReconciliation,
  type ProviderExecutionObservationReconciliationApplyResult,
  type ProviderExecutionObservationReconciliationInventory,
  type ProviderExecutionObservationReconciliationPlan,
} from '../../core/provider-execution-observation-reconciliation.js';
import {
  ProviderExecutionObservationReconciliationApprovalAuthority,
  ProviderExecutionObservationReconciliationApprovalError,
  assertProviderExecutionObservationReconciliationReplayApproval,
} from '../../core/provider-execution-observation-reconciliation-approval.js';
import {
  ProviderExecutionObservationReconciliationReceiptStoreError,
  discoverProviderExecutionObservationReconciliationReceipts,
  publishProviderExecutionObservationReconciliationReceipt,
  readProviderExecutionObservationReconciliationReceipt,
  type ProviderExecutionObservationReconciliationDurableReceipt,
} from '../../core/provider-execution-observation-reconciliation-receipt-store.js';
import { PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH } from '../../core/provider-execution-observation-store.js';
import {
  createRuntimeAdoptionPlan,
  RuntimeAdoptionHoldError,
  type RuntimeAdoptionPlan,
} from '../../core/runtime-adoption.js';
import {
  publishRuntimeAdoptionReceipt,
  readRuntimeAdoptionReceipt,
  type RuntimeAdoptionReceipt,
} from '../../core/runtime-adoption-receipt-store.js';
import { processStartToken } from '../../core/pid-ownership.js';
import { publishCanonicalRunStatusReadModel } from '../../core/run-status-read-model.js';
import { inspectBotPid, type BotPidInspection } from '../../connectors/bot-daemon.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import {
  readRuntimeBuildIdentity,
  type RuntimeBuildIdentityReadResult,
} from '../worktree-binary-authority.js';

const PLAN_TIME = new Date(0);
const HEX_256 = /^[a-f0-9]{64}$/u;

interface CommonOptions { readonly database?: string; readonly json?: boolean }
interface MigrationOptions extends CommonOptions {
  readonly apply?: boolean; readonly approvalId?: string; readonly planDigest?: string;
}
interface AdoptionOptions extends CommonOptions {
  readonly apply?: boolean; readonly planDigest?: string; readonly preimage?: string;
}
interface RuntimeAdoptionOptions extends AdoptionOptions {}
interface ReconciliationOptions extends CommonOptions {
  readonly apply?: boolean; readonly approvalId?: string; readonly planDigest?: string;
  readonly runId?: readonly string[];
}

export interface ProviderObservationMigrationProjection {
  readonly operation: 'migration';
  readonly mode: 'inspect' | 'dry-run' | 'pending-approval' | 'applied' | 'replay';
  readonly inspection: ProviderExecutionObservationMigrationInspection;
  readonly plan?: ProviderExecutionObservationMigrationPlan;
  readonly approval?: ProviderExecutionObservationMigrationApprovalSubmitResult;
  readonly result?: ProviderExecutionObservationMigrationApplyResult;
}
export interface ProviderObservationAdoptionProjection {
  readonly operation: 'adoption';
  readonly mode: 'inspect' | 'dry-run' | 'persisted' | 'replay';
  readonly inspection: ProviderExecutionObservationAdoptionInspection;
  readonly plan?: ProviderExecutionObservationAdoptionPlan;
  readonly receipt?: ProviderExecutionObservationAdoptionDurableReceipt;
  readonly projectRelativeReceiptPath?: string;
}
export interface ProviderObservationRuntimeAdoptionProjection {
  readonly operation: 'runtime-adoption';
  readonly mode: 'dry-run' | 'persisted' | 'replay';
  readonly providerAdoption: ProviderObservationAdoptionProjection;
  readonly plan: RuntimeAdoptionPlan;
  readonly receipt?: RuntimeAdoptionReceipt;
  readonly providerReceiptId: string;
  readonly runtimeReceiptId?: string;
}
export interface ProviderObservationReconciliationProjection {
  readonly operation: 'reconcile';
  readonly mode: 'inspect' | 'dry-run' | 'pending-approval' | 'applied' | 'replay';
  readonly inspection: ProviderExecutionObservationReconciliationInventory;
  readonly plan?: ProviderExecutionObservationReconciliationPlan;
  readonly approval?: { readonly approvalId: string };
  readonly result?: ProviderExecutionObservationReconciliationApplyResult;
  readonly receipt?: ProviderExecutionObservationReconciliationDurableReceipt;
}
export interface ProviderObservationsCommandDeps {
  readonly resolveProjectRootFn?: () => string;
  readonly inspect?: (root: string, options: CommonOptions) => Promise<ProviderObservationMigrationProjection>;
  readonly migrate?: (root: string, options: MigrationOptions) => Promise<ProviderObservationMigrationProjection>;
  readonly adopt?: (root: string, options: AdoptionOptions) => Promise<ProviderObservationAdoptionProjection>;
  readonly adoptRuntime?: (root: string, options: RuntimeAdoptionOptions) => Promise<ProviderObservationRuntimeAdoptionProjection>;
  readonly reconcile?: (root: string, options: ReconciliationOptions) => Promise<ProviderObservationReconciliationProjection>;
  readonly inspectBotPidFn?: (root: string) => BotPidInspection;
  readonly processStartTokenFn?: (pid: number) => string | null;
  readonly readRuntimeBuildIdentityFn?: (options: {
    readonly projectRoot: string; readonly runtimeModuleUrl: string;
  }) => RuntimeBuildIdentityReadResult;
}
type JsonValue = null | boolean | number | string | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function canonical(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const record = value as { readonly [key: string]: JsonValue };
  return '{' + Object.keys(record).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(record[key]!)).join(',') + '}';
}
function stableId(prefix: string, values: readonly string[]): string {
  return prefix + '-' + createHash('sha256').update(values.join('\0')).digest('hex').slice(0, 32);
}
function projectRelativePath(projectRoot: string, candidate: string): string {
  if (candidate.trim() === '' || isAbsolute(candidate)) throw new DeckentError('INVALID_PATH', 'INVALID_PATH');
  const root = resolve(projectRoot);
  const within = relative(root, resolve(root, candidate));
  if (within === '' || within === '..' || within.startsWith('..' + sep) || isAbsolute(within)) {
    throw new DeckentError('PATH_ESCAPE', 'PATH_ESCAPE');
  }
  return within;
}
function providerObservationProjectPath(projectRoot: string, database?: string) {
  return safeProviderExecutionObservationProjectPath(
    projectRoot,
    projectRelativePath(projectRoot, database ?? PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH),
  );
}
function migrationPlan(projectRoot: string, relativeDatabasePath: string): {
  inspection: ProviderExecutionObservationMigrationInspection;
  plan: ProviderExecutionObservationMigrationPlan;
} {
  const projectPath = safeProviderExecutionObservationProjectPath(projectRoot, relativeDatabasePath);
  const inspection = inspectProviderExecutionObservationMigration(projectPath);
  const plan = planProviderExecutionObservationMigration({
    projectPath, inspection, clock: { now: () => PLAN_TIME },
    ids: { nextId: () => stableId('migration', [
      projectPath.relativeDatabasePath, inspection.schemaDigest, inspection.rowLineageDigest,
    ]) },
  });
  return { inspection, plan };
}
function exactDigest(expected: string, supplied: string | undefined): void {
  if (!supplied || !HEX_256.test(supplied) || supplied !== expected) {
    throw new DeckentError('PLAN_DIGEST_MISMATCH', 'PLAN_DIGEST_MISMATCH');
  }
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function providerReceiptPreview(
  projectRoot: string,
  context: { readonly environmentId: string; readonly tenantId: string },
  adoption: ProviderObservationAdoptionProjection,
): { readonly receipt: ProviderExecutionObservationAdoptionDurableReceipt; readonly projectRelativeReceiptPath: string } {
  if (!adoption.plan) throw new RuntimeAdoptionHoldError('INVALID_PLAN');
  const { inspection, plan } = adoption;
  const sourcePath = relative(projectRoot, plan.paths.v1PreimagePath).split(sep).join('/');
  const targetPath = relative(projectRoot, plan.paths.currentDatabasePath).split(sep).join('/');
  const body = {
    schema: 'deckent.provider-observation-adoption-receipt' as const,
    version: 1 as const,
    scope: deriveProviderExecutionObservationAdoptionReceiptScope(context),
    source: {
      projectRelativePath: sourcePath, schemaVersion: 1 as const,
      byteLength: readFileSync(plan.paths.v1PreimagePath).length,
      contentDigest: `sha256:${inspection.sourceDatabaseDigest}`,
      lineageDigest: `sha256:${inspection.sourceRowLineageDigest}`,
      rowCount: inspection.adoptedLegacyRowCount,
    },
    target: {
      projectRelativePath: targetPath, schemaVersion: 2 as const,
      byteLength: readFileSync(plan.paths.currentDatabasePath).length,
      contentDigest: `sha256:${inspection.targetDatabaseDigest}`,
      legacyLineageDigest: `sha256:${inspection.adoptedLegacyRowLineageDigest}`,
      legacyRowCount: inspection.adoptedLegacyRowCount,
      runOwnedRowCount: inspection.extraRunOwnedRows.length,
      totalRowCount: inspection.adoptedLegacyRowCount + inspection.extraRunOwnedRows.length,
    },
    planDigest: `sha256:${plan.planDigest}`,
    verifiedAt: PLAN_TIME.toISOString(), databaseMutation: 'none' as const,
  };
  const receipt = Object.freeze({
    ...body, receiptId: providerExecutionObservationAdoptionDurableReceiptId(body),
  });
  // Run the core serializer now so dry-run and apply share the exact durable
  // provider-receipt validation boundary rather than a CLI-only approximation.
  serializeProviderExecutionObservationAdoptionReceipt(receipt);
  return {
    receipt,
    projectRelativeReceiptPath: `.deckent/provider-observation-adoption/receipts/v1/${receipt.scope.environmentKey}/${receipt.scope.tenantKey}/${receipt.receiptId.slice(7)}.json`,
  };
}

async function defaultInspect(
  projectRoot: string, options: CommonOptions,
): Promise<ProviderObservationMigrationProjection> {
  const projectPath = providerObservationProjectPath(projectRoot, options.database);
  return {
    operation: 'migration',
    mode: 'inspect',
    inspection: inspectProviderExecutionObservationMigration(projectPath),
  };
}

async function defaultMigration(
  projectRoot: string, options: MigrationOptions,
): Promise<ProviderObservationMigrationProjection> {
  const projectPath = providerObservationProjectPath(projectRoot, options.database);
  const { inspection, plan } = migrationPlan(projectRoot, projectPath.relativeDatabasePath);
  if (!options.apply) return { operation: 'migration', mode: 'dry-run', inspection, plan };
  exactDigest(plan.planDigest, options.planDigest);
  const config = await loadConfig(projectRoot);
  const authority = config.approval?.authority;
  const lifecycle = config.approval?.lifecycle;
  if (authority?.enabled !== true || !lifecycle) {
    throw new DeckentError('APPROVAL_AUTHORITY_REQUIRED', 'APPROVAL_AUTHORITY_REQUIRED');
  }
  const now = (): Date => new Date();
  const opened = bootstrapApprovalAuthority(projectRoot, config, {
    broker: new ApprovalBroker(projectRoot, { lifecycle, clock: now }),
    store: new ApprovalStore(projectRoot, { lifecycle, clock: now }), now,
  });
  if (opened.state !== 'ready') {
    const reason = opened.state === 'hold' ? opened.reasonCode : 'approval_authority_disabled';
    throw new DeckentError('APPROVAL_AUTHORITY_HOLD', 'APPROVAL_AUTHORITY_HOLD:' + reason);
  }
  try {
    const existing = options.approvalId ? opened.runtime.broker.getRequest(options.approvalId) : null;
    const binding = existing?.details.binding;
    const generation = binding && typeof binding === 'object'
      && typeof (binding as Record<string, unknown>).generation === 'string'
      ? String((binding as Record<string, unknown>).generation) : 'migration:' + plan.planDigest;
    const bridge = new ProviderExecutionObservationMigrationApprovalBridge({
      broker: opened.runtime.broker,
      decisionAuthority: opened.runtime.decisionAuthority,
      projectRoot, tenantId: authority.tenant_id, userId: userInfo().username,
      requester: { role: 'brain', instanceId: 'cli-provider-observations:' + process.pid },
      generation, expiresAt: existing?.expiresAt ?? new Date(now().getTime() + 600_000).toISOString(),
      timeout: 'deny', now,
    });
    if (!options.approvalId) {
      const approval = bridge.submit(plan);
      return { operation: 'migration', mode: 'pending-approval', inspection, plan, approval };
    }
    const applied = bridge.apply({
      requestId: options.approvalId, plan, clock: { now },
      ids: { nextId: () => 'receipt-' + randomUUID() },
    });
    return { operation: 'migration', mode: applied.kind, inspection, plan, result: applied.result };
  } finally {
    opened.runtime.close();
  }
}

async function defaultAdoption(
  projectRoot: string, options: AdoptionOptions,
): Promise<ProviderObservationAdoptionProjection> {
  if (!options.preimage) throw new DeckentError('PREIMAGE_REQUIRED', 'PREIMAGE_REQUIRED');
  const paths = {
    v1PreimagePath: resolve(projectRoot, projectRelativePath(projectRoot, options.preimage)),
    currentDatabasePath: providerObservationProjectPath(projectRoot, options.database).databasePath,
  };
  const inspection = inspectProviderExecutionObservationAdoption(paths);
  const plan = planProviderExecutionObservationAdoption({
    paths, inspection, clock: { now: () => PLAN_TIME },
    ids: { nextId: () => stableId('adoption', [
      relative(projectRoot, paths.v1PreimagePath), relative(projectRoot, paths.currentDatabasePath),
      inspection.sourceDatabaseDigest, inspection.targetDatabaseDigest,
    ]) },
  });
  if (!options.apply) return { operation: 'adoption', mode: 'dry-run', inspection, plan };
  exactDigest(plan.planDigest, options.planDigest);
  const config = await loadConfig(projectRoot);
  const context = {
    projectRoot,
    environmentId: 'local-cli',
    tenantId: config.approval?.authority?.tenant_id ?? 'local',
  };
  const published = publishProviderExecutionObservationAdoptionReceipt({
    ...context, plan, clock: { now: () => PLAN_TIME },
    ids: { nextId: () => stableId('receipt', [plan.planDigest]) },
  });
  // Publication alone is not success: resolve the exact content-addressed ID
  // through a new file read and re-prove both database bindings first.
  const receipt = readProviderExecutionObservationAdoptionReceipt({
    ...context, receiptId: published.receipt.receiptId,
    expectedPlanDigest: plan.planDigest, fresh: true,
  });
  return {
    operation: 'adoption',
    mode: published.state === 'created' ? 'persisted' : 'replay',
    inspection, plan, receipt,
    projectRelativeReceiptPath: published.projectRelativeReceiptPath,
  };
}

function runtimeObservation(
  projectRoot: string,
  context: { readonly environmentId: string; readonly tenantId: string },
  deps: ProviderObservationsCommandDeps,
) {
  const inspect = deps.inspectBotPidFn ?? inspectBotPid;
  const tokenOf = deps.processStartTokenFn ?? processStartToken;
  const readBuild = deps.readRuntimeBuildIdentityFn ?? readRuntimeBuildIdentity;
  const bot = inspect(projectRoot);
  if (bot.status !== 'running') {
    throw new RuntimeAdoptionHoldError('RUNTIME_OWNERSHIP_MISMATCH');
  }
  const startToken = tokenOf(bot.pid);
  if (!startToken) throw new RuntimeAdoptionHoldError('RUNTIME_OWNERSHIP_MISMATCH');
  const entrypoint = readBuild({
    projectRoot,
    runtimeModuleUrl: new URL('../entry.js', import.meta.url).href,
  });
  const identityModule = readBuild({
    projectRoot,
    runtimeModuleUrl: new URL('../../connectors/bot-daemon.js', import.meta.url).href,
  });
  if (entrypoint.status !== 'adopt') {
    throw new RuntimeAdoptionHoldError('BUILD_IDENTITY_MISMATCH');
  }
  if (identityModule.status !== 'adopt') {
    throw new RuntimeAdoptionHoldError('BUILD_IDENTITY_MISMATCH');
  }
  if (bot.runtimeIdentity.entrypointDigest !== entrypoint.binding.entrypointSha256
    || bot.runtimeIdentity.buildIdentityDigest !== identityModule.binding.entrypointSha256
    || entrypoint.binding.buildIdentitySha256 !== identityModule.binding.buildIdentitySha256) {
    throw new RuntimeAdoptionHoldError('BUILD_IDENTITY_MISMATCH');
  }
  const ownerIdentityDigest = sha256([
    'deckent:runtime-adoption-owner:v1', context.environmentId, context.tenantId,
    sha256(projectRoot), String(bot.pid), startToken,
  ].join('\0'));
  return Object.freeze({
    build: entrypoint.binding,
    liveRuntime: Object.freeze({
      runtimeId: stableId('runtime', [sha256(projectRoot), String(bot.pid), startToken]),
      processId: bot.pid,
      processStartIdentity: startToken,
      ownerIdentityDigest,
    }),
  });
}

async function defaultRuntimeAdoption(
  projectRoot: string,
  options: RuntimeAdoptionOptions,
  deps: ProviderObservationsCommandDeps,
): Promise<ProviderObservationRuntimeAdoptionProjection> {
  if (!options.preimage) throw new RuntimeAdoptionHoldError('INVALID_PATH');
  const config = await loadConfig(projectRoot);
  const context = {
    projectRoot, environmentId: 'local-cli',
    tenantId: config.approval?.authority?.tenant_id ?? 'local',
  };
  // Verification always runs against the immutable preimage first. This dry
  // projection performs no receipt or database write.
  const providerDry = await defaultAdoption(projectRoot, { ...options, apply: false });
  const providerPreview = providerReceiptPreview(projectRoot, context, providerDry);
  const observed = runtimeObservation(projectRoot, context, deps);
  const build = observed.build;
  const plan = createRuntimeAdoptionPlan({
    adoptionId: stableId('runtime-adoption', [
      providerPreview.receipt.receiptId, providerPreview.receipt.target.contentDigest,
      build.buildIdentitySha256, build.entrypointSha256,
      observed.liveRuntime.runtimeId,
    ]),
    providerObservationReceipt: {
      projectRelativePath: providerPreview.projectRelativeReceiptPath,
      receiptId: providerPreview.receipt.receiptId,
      receiptDigest: sha256(serializeProviderExecutionObservationAdoptionReceipt(providerPreview.receipt)),
    },
    targetDatabase: {
      projectRelativePath: providerPreview.receipt.target.projectRelativePath,
      databaseDigest: providerPreview.receipt.target.contentDigest,
      lineageDigest: providerPreview.receipt.target.legacyLineageDigest,
    },
    deckentBuild: {
      buildIdentityDigest: `sha256:${build.buildIdentitySha256}`,
      sourceTreeIdentityDigest: `sha256:${build.currentSourceTreeIdentity.sourceTreeSha256}`,
    },
    entrypoint: {
      projectRelativePath: relative(projectRoot, build.entrypointPath).split(sep).join('/'),
      artifactDigest: `sha256:${build.entrypointSha256}`,
    },
    liveRuntime: observed.liveRuntime,
    plannedAt: PLAN_TIME.toISOString(),
  });
  if (!options.apply) return {
    operation: 'runtime-adoption', mode: 'dry-run', providerAdoption: providerDry,
    plan, providerReceiptId: providerPreview.receipt.receiptId,
  };
  exactDigest(plan.planDigest.slice('sha256:'.length), options.planDigest);
  const providerAdoption = await defaultAdoption(projectRoot, {
    ...options, apply: true, planDigest: providerDry.plan?.planDigest,
  });
  if (!providerAdoption.receipt
    || providerAdoption.receipt.receiptId !== providerPreview.receipt.receiptId
    || providerAdoption.projectRelativeReceiptPath !== providerPreview.projectRelativeReceiptPath) {
    throw new RuntimeAdoptionHoldError('PROVIDER_RECEIPT_MISMATCH');
  }
  // Re-observe ownership at the publication boundary. If the process changed,
  // the core store rejects it; the already-created provider receipt is safe to
  // replay on the next invocation.
  const publicationObservation = runtimeObservation(projectRoot, context, deps);
  const published = publishRuntimeAdoptionReceipt({
    ...context, plan, publishedAt: PLAN_TIME.toISOString(),
    observedRuntime: publicationObservation.liveRuntime,
  });
  const receipt = readRuntimeAdoptionReceipt({
    ...context, receiptId: published.receipt.receiptId,
    expectedPlanDigest: plan.planDigest, fresh: true,
    observedRuntime: publicationObservation.liveRuntime,
  });
  return {
    operation: 'runtime-adoption',
    mode: published.state === 'created' ? 'persisted' : 'replay',
    providerAdoption, plan, receipt,
    providerReceiptId: providerAdoption.receipt.receiptId,
    runtimeReceiptId: receipt.receiptId,
  };
}

function reconciliationPlan(projectRoot: string, database: string | undefined, runIds?: readonly string[]): {
  inspection: ProviderExecutionObservationReconciliationInventory;
  plan: ProviderExecutionObservationReconciliationPlan;
} {
  const path = providerObservationProjectPath(projectRoot, database);
  const inspection = inventoryProviderExecutionObservationReconciliation({
    projectRoot, relativeDatabasePath: path.relativeDatabasePath,
  });
  return { inspection, plan: planProviderExecutionObservationReconciliation({
    inventory: inspection, runIds,
  }) };
}

function reconciliationApprovalExpiry(existing: unknown, now: () => Date): string {
  const subject = existing && typeof existing === 'object'
    ? (existing as { details?: { subject?: { expiresAt?: unknown } } }).details?.subject : undefined;
  return typeof subject?.expiresAt === 'string' && Number.isFinite(Date.parse(subject.expiresAt))
    ? subject.expiresAt : new Date(now().getTime() + 600_000).toISOString();
}

/**
 * Reconciliation's approval request is owned by the runtime broker and the
 * interactive terminal ingress. API OIDC composition is deliberately absent:
 * it is required only by OIDC-authenticated adapter paths, never by this local
 * terminal request/decision chain.
 */
export function openReconciliationApprovalRuntime(
  projectRoot: string,
  config: ResolvedConfig,
) {
  const authority = config.approval?.authority;
  if (authority?.enabled !== true) {
    throw new DeckentError('APPROVAL_AUTHORITY_REQUIRED', 'APPROVAL_AUTHORITY_REQUIRED');
  }
  return openApprovalAuthorityRuntime({
    projectRoot,
    tenantId: authority.tenant_id,
  });
}

async function defaultReconciliation(
  projectRoot: string, options: ReconciliationOptions,
): Promise<ProviderObservationReconciliationProjection> {
  const path = providerObservationProjectPath(projectRoot, options.database);
  const inspection = inventoryProviderExecutionObservationReconciliation({
    projectRoot, relativeDatabasePath: path.relativeDatabasePath,
  });
  if (!options.apply) {
    const { plan } = reconciliationPlan(projectRoot, options.database, options.runId);
    return { operation: 'reconcile', mode: 'dry-run', inspection, plan };
  }
  if (!options.planDigest || !HEX_256.test(options.planDigest)) {
    throw new DeckentError('PLAN_DIGEST_MISMATCH', 'PLAN_DIGEST_MISMATCH');
  }
  const config = await loadConfig(projectRoot);
  const authorityConfig = config.approval?.authority;
  if (authorityConfig?.enabled !== true) {
    throw new DeckentError('APPROVAL_AUTHORITY_REQUIRED', 'APPROVAL_AUTHORITY_REQUIRED');
  }
  const receiptContext = { projectRoot, tenantId: authorityConfig.tenant_id, environmentId: 'local-cli' };
  let existingReceipt: ProviderExecutionObservationReconciliationDurableReceipt | undefined;
  try {
    existingReceipt = discoverProviderExecutionObservationReconciliationReceipts(receiptContext)
      .find(receipt => receipt.planDigest === `sha256:${options.planDigest}`);
  } catch (error) {
    if (!(error instanceof ProviderExecutionObservationReconciliationReceiptStoreError)
      || error.code !== 'RECEIPT_NOT_FOUND') throw error;
  }
  // Reconciliation is submitted and later decided through the local-terminal
  // live-auth channel. OIDC is an API/enterprise authenticator, not an
  // admission prerequisite for this CLI-only request path; requiring the API
  // bootstrap here made a correctly configured terminal authority unreachable.
  const opened = openReconciliationApprovalRuntime(projectRoot, config);
  if (opened.state !== 'ready') {
    throw new DeckentError(
      'APPROVAL_AUTHORITY_HOLD',
      'APPROVAL_AUTHORITY_HOLD:' + opened.reasonCode,
    );
  }
  try {
    const existing = options.approvalId ? opened.service.broker.getRequest(options.approvalId) : null;
    if (existingReceipt) {
      if (!options.approvalId) throw new ProviderExecutionObservationReconciliationApprovalError('REQUEST_NOT_FOUND', 'Replay requires its approval ID');
      const decision = opened.service.broker.getDecision(options.approvalId);
      assertProviderExecutionObservationReconciliationReplayApproval({
        request: existing, decision, approvalId: options.approvalId,
        planDigest: options.planDigest, claim: existingReceipt.approvalClaim,
      });
      const receipt = readProviderExecutionObservationReconciliationReceipt({
        ...receiptContext, receiptId: existingReceipt.receiptId, expectedPlanDigest: options.planDigest, fresh: true,
      });
      // Reconciliation mutates the observation authority outside the sprint
      // lifecycle publisher. Replay is also a repair ingress: always republish
      // so a prior post-mutation publication failure cannot leave CLI/API/MCP
      // consumers pinned to the pre-reconciliation read model.
      publishCanonicalRunStatusReadModel(projectRoot);
      return { operation: 'reconcile', mode: 'replay', inspection, receipt };
    }
    const { plan } = reconciliationPlan(projectRoot, options.database, options.runId);
    exactDigest(plan.planDigest, options.planDigest);
    const now = (): Date => new Date();
    const reconciliation = new ProviderExecutionObservationReconciliationApprovalAuthority(
      projectRoot, opened.service.broker, opened.service.decisionAuthority, { now },
    );
    const requestedBy = 'cli-provider-observations';
    const expiresAt = reconciliationApprovalExpiry(existing, now);
    if (!options.approvalId) {
      const request = reconciliation.submit({
        plan, tenantId: authorityConfig.tenant_id, requestedBy, approverUserId: userInfo().username,
        generation: plan.planDigest, expiresAt,
        requester: { role: 'brain', instanceId: 'cli-provider-observations:' + process.pid },
      });
      return {
        operation: 'reconcile', mode: 'pending-approval', inspection, plan,
        approval: { approvalId: request.id },
      };
    }
    const result = reconciliation.apply({
      requestId: options.approvalId, plan, tenantId: authorityConfig.tenant_id, requestedBy,
      generation: plan.planDigest, expiresAt,
    });
    if (result.state === 'hold') {
      throw new ProviderExecutionObservationReconciliationApprovalError(
        'DECISION_UNTRUSTED', `Reconciliation approval is unavailable: ${result.reasonCode}`,
      );
    }
    const published = publishProviderExecutionObservationReconciliationReceipt({
      ...receiptContext, plan, result, verifiedAt: now().toISOString(),
    });
    const receipt = readProviderExecutionObservationReconciliationReceipt({
      ...receiptContext, receiptId: published.receipt.receiptId, expectedPlanDigest: plan.planDigest, fresh: true,
    });
    publishCanonicalRunStatusReadModel(projectRoot);
    return { operation: 'reconcile', mode: result.state === 'replayed' ? 'replay' : 'applied', inspection, plan, result, receipt };
  } finally {
    opened.service.close();
  }
}

/** Canonical redacted output: project-relative paths, aggregates and digests only. */
export function providerObservationJson(
  value: ProviderObservationMigrationProjection | ProviderObservationAdoptionProjection
    | ProviderObservationRuntimeAdoptionProjection | ProviderObservationReconciliationProjection,
  projectRoot: string,
): string {
  const base: Record<string, JsonValue> = { mode: value.mode, operation: value.operation };
  if (value.operation === 'migration') {
    base.inspection = {
      databaseBytes: value.inspection.databaseBytes, rowCount: value.inspection.rowCount,
      rowLineageDigest: value.inspection.rowLineageDigest, schemaDigest: value.inspection.schemaDigest,
      sourceSchemaVersion: value.inspection.sourceSchemaVersion, state: value.inspection.state,
      targetSchemaVersion: value.inspection.targetSchemaVersion,
    };
    if (value.plan) base.plan = {
      migrationId: value.plan.migrationId, planDigest: value.plan.planDigest,
      plannedAt: value.plan.plannedAt, relativeDatabasePath: value.plan.projectPath.relativeDatabasePath,
    };
    if (value.approval) base.approval = {
      kind: value.approval.kind, requestDigest: value.approval.requestDigest,
      requestId: value.approval.request.id,
    };
    if (value.result) base.result = value.result.state === 'already-current'
      ? { state: value.result.state }
      : {
          backupPath: relative(projectRoot, value.result.backupPath),
          receiptPath: relative(projectRoot, value.result.receiptPath),
          rowCount: value.result.receipt.rowCount, state: value.result.state,
        };
  } else if (value.operation === 'adoption') {
    base.inspection = {
      adoptedLegacyRowCount: value.inspection.adoptedLegacyRowCount,
      extraRunOwnedRowCount: value.inspection.extraRunOwnedRows.length,
      sourceDatabaseDigest: value.inspection.sourceDatabaseDigest,
      sourceRowCount: value.inspection.sourceRowCount,
      sourceRowLineageDigest: value.inspection.sourceRowLineageDigest,
      sourceSchemaVersion: value.inspection.sourceSchemaVersion,
      targetDatabaseDigest: value.inspection.targetDatabaseDigest,
      targetSchemaVersion: value.inspection.targetSchemaVersion,
    };
    if (value.plan) base.plan = {
      adoptionId: value.plan.adoptionId,
      currentDatabasePath: relative(projectRoot, value.plan.paths.currentDatabasePath),
      planDigest: value.plan.planDigest, plannedAt: value.plan.plannedAt,
      v1PreimagePath: relative(projectRoot, value.plan.paths.v1PreimagePath),
    };
    if (value.receipt) base.receipt = {
      adoptedLegacyRowCount: value.receipt.target.legacyRowCount,
      databaseMutation: value.receipt.databaseMutation,
      planDigest: value.receipt.planDigest,
      projectRelativeReceiptPath: value.projectRelativeReceiptPath ?? '',
      receiptId: value.receipt.receiptId,
      runOwnedRowCount: value.receipt.target.runOwnedRowCount,
      sourceProjectRelativePath: value.receipt.source.projectRelativePath,
      targetProjectRelativePath: value.receipt.target.projectRelativePath,
      totalRowCount: value.receipt.target.totalRowCount,
    };
  } else if (value.operation === 'runtime-adoption') {
    base.plan = {
      databaseMutation: value.plan.databaseMutation,
      planDigest: value.plan.planDigest.slice('sha256:'.length),
    };
    base.receipts = {
      providerReceiptId: value.providerReceiptId,
      runtimeReceiptId: value.runtimeReceiptId ?? null,
    };
  } else {
    base.inspection = {
      activeOpenCount: value.inspection.activeOpenCount,
      databaseLineageDigest: value.inspection.databaseLineage.rowLineageDigest,
      databaseSchemaDigest: value.inspection.databaseLineage.schemaDigest,
    };
    if (value.plan) base.plan = {
      candidateCount: value.plan.candidates.length,
      holdCount: value.plan.activeOpenCount - value.plan.candidates.length,
      planDigest: value.plan.planDigest,
      runCount: value.plan.runIds.length,
    };
    if (value.approval) base.approval = value.approval;
    if (value.result) base.result = {
      afterActiveOpenCount: value.result.afterActiveOpenCount,
      beforeActiveOpenCount: value.result.beforeActiveOpenCount,
      retiredCount: value.result.retiredCount,
    };
    if (value.receipt) base.receipt = {
      afterActiveOpenCount: value.receipt.after.activeOpenCount,
      beforeActiveOpenCount: value.receipt.before.activeOpenCount,
      planDigest: value.receipt.planDigest,
      receiptId: value.receipt.receiptId,
      retiredCount: value.receipt.retiredCount,
    };
  }
  return canonical(base);
}

async function render(
  operation: 'inspect' | 'migration' | 'adoption' | 'runtime-adoption' | 'reconcile', options: MigrationOptions & AdoptionOptions & ReconciliationOptions,
  deps: ProviderObservationsCommandDeps,
): Promise<void> {
  const projectRoot = resolve((deps.resolveProjectRootFn ?? resolveProjectRoot)());
  const language = getLanguage(undefined);
  try {
    const result = operation === 'inspect'
      ? await (deps.inspect ?? defaultInspect)(projectRoot, options)
      : operation === 'migration'
        ? await (deps.migrate ?? defaultMigration)(projectRoot, options)
        : operation === 'adoption'
          ? await (deps.adopt ?? defaultAdoption)(projectRoot, options)
          : operation === 'runtime-adoption'
            ? await (deps.adoptRuntime ?? ((root, runtimeOptions) => defaultRuntimeAdoption(root, runtimeOptions, deps)))(projectRoot, options)
            : await (deps.reconcile ?? defaultReconciliation)(projectRoot, options);
    if (options.json) { print(providerObservationJson(result, projectRoot)); return; }
    if (result.mode === 'pending-approval' && result.operation === 'migration' && result.approval) {
      print(getMessage('provider_observation.migration.pending_approval', language, {
        approvalId: result.approval.request.id,
      }));
    } else if (result.operation === 'runtime-adoption' && result.mode === 'dry-run') {
      print(getMessage('provider_observation.runtime_adoption.dry_run', language, {
        planDigest: result.plan.planDigest.slice('sha256:'.length),
      }));
    } else if (result.operation === 'runtime-adoption' && result.mode === 'persisted' && result.runtimeReceiptId) {
      print(getMessage('provider_observation.runtime_adoption.receipt_persisted', language, {
        providerReceiptId: result.providerReceiptId, runtimeReceiptId: result.runtimeReceiptId,
      }));
    } else if (result.operation === 'runtime-adoption' && result.mode === 'replay' && result.runtimeReceiptId) {
      print(getMessage('provider_observation.runtime_adoption.replay_verified', language, {
        providerReceiptId: result.providerReceiptId, runtimeReceiptId: result.runtimeReceiptId,
      }));
    } else if (result.operation === 'reconcile' && result.mode === 'inspect') {
      print(getMessage('provider_observation.reconciliation.inspect', language, {
        activeOpenCount: String(result.inspection.activeOpenCount),
      }));
    } else if (result.operation === 'reconcile' && result.mode === 'dry-run' && result.plan) {
      print(getMessage('provider_observation.reconciliation.dry_run', language, {
        candidateCount: String(result.plan.candidates.length),
        holdCount: String(result.plan.activeOpenCount - result.plan.candidates.length),
        runCount: String(result.plan.runIds.length),
      }));
      print(JSON.stringify({ planDigest: result.plan.planDigest }));
    } else if (result.operation === 'reconcile' && result.mode === 'pending-approval' && result.approval) {
      print(getMessage('provider_observation.reconciliation.pending_approval', language, {
        approvalId: result.approval.approvalId,
      }));
    } else if (result.operation === 'reconcile' && result.mode === 'applied' && result.receipt) {
      print(getMessage('provider_observation.reconciliation.applied', language, {
        receiptId: result.receipt.receiptId,
      }));
    } else if (result.operation === 'reconcile' && result.mode === 'replay' && result.receipt) {
      print(getMessage('provider_observation.reconciliation.replay_verified', language, {
        receiptId: result.receipt.receiptId,
      }));
    } else if (result.mode === 'dry-run') {
      print(getMessage('provider_observation.migration.dry_run', language));
      if (result.plan) print(JSON.stringify({ planDigest: result.plan.planDigest }));
    } else if ((result.mode === 'persisted' || result.mode === 'replay')
      && result.operation === 'adoption' && result.receipt) {
      print(getMessage(result.mode === 'persisted'
        ? 'provider_observation.adoption.receipt_persisted'
        : 'provider_observation.adoption.replay_verified', language, {
        receiptId: result.receipt.receiptId,
      }));
    } else if (result.operation === 'migration' && result.result?.state === 'applied') {
      print(getMessage('provider_observation.migration.backup', language, {
        backupPath: relative(projectRoot, result.result.backupPath),
      }));
      print(getMessage('provider_observation.migration.migrated', language, {
        count: String(result.result.receipt.rowCount),
      }));
    } else print(getMessage('provider_observation.migration.already_v2', language));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof Error && 'code' in error
      ? String((error as Error & { code: unknown }).code) : detail.split(':', 1)[0]!;
    const code = operation === 'reconcile' && !(error instanceof Error && 'code' in error)
      ? (['PLAN_DIGEST_MISMATCH', 'APPROVAL_AUTHORITY_REQUIRED']
        .includes(errorCode) || errorCode.startsWith('APPROVAL_AUTHORITY_HOLD')
        ? errorCode : 'RECONCILIATION_FAILED')
      : errorCode;
    const adoptionHold = operation === 'adoption'
      && (error instanceof ProviderExecutionObservationAdoptionReceiptStoreError
        || error instanceof ProviderExecutionObservationAdoptionError);
    const runtimeAdoptionHold = operation === 'runtime-adoption';
    const reconciliationHold = operation === 'reconcile';
    // Machine output is deliberately locale-independent and excludes exception
    // text: filesystem/database errors may contain an absolute path or identity.
    if (options.json) {
      print(runtimeAdoptionHold
        ? canonical({ mode: 'hold', operation, reasonCode: code })
        : adoptionHold
        ? canonical({ detail: code, mode: 'hold', operation, reasonCode: code })
        : reconciliationHold
          ? canonical({ mode: 'hold', operation, reasonCode: code })
          : canonical({ code, mode: 'error', operation }));
      process.exitCode = 1;
      return;
    }
    printError(new Error(runtimeAdoptionHold
      ? getMessage('provider_observation.runtime_adoption.hold', language, { reasonCode: code })
      : adoptionHold
      ? getMessage('provider_observation.adoption.hold', language, { reasonCode: code, detail: code })
      : reconciliationHold
        ? getMessage('provider_observation.reconciliation.hold', language, { reasonCode: code })
        : getMessage('provider_observation.migration.error', language, { errorCode: code, detail })));
    process.exitCode = 1;
  }
}

export function registerProviderObservations(
  program: Command, deps: ProviderObservationsCommandDeps = {},
): void {
  const language = getLanguage(undefined);
  const parent = program.command('provider-observations')
    .description(getMessage('cli.provider-observations.desc', language));
  const common = (command: Command): Command => command
    .option('--database <path>', getMessage('provider_observation.migration.inspect', language, {
      sourcePath: PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH, schemaVersion: '1', action: 'inspect',
    }))
    .option('--json', getMessage('provider_observation.migration.forensic_counts', language, {
      inspected: '-', eligible: '-', migrated: '-', adopted: '-', held: '-', rejected: '-',
    }));
  common(parent.command('inspect'))
    .description(getMessage('cli.provider-observations.inspect.desc', language))
    .action((options: CommonOptions) => render('inspect', options, deps));
  common(parent.command('migrate'))
    .description(getMessage('cli.provider-observations.migrate.desc', language))
    .option('--apply', getMessage('provider_observation.migration.pending_approval', language, { approvalId: '-' }))
    .option('--plan-digest <digest>', getMessage('provider_observation.migration.dry_run', language))
    .option('--approval-id <id>', getMessage('provider_observation.migration.pending_approval', language, { approvalId: '-' }))
    .action((options: MigrationOptions) => render('migration', options, deps));
  common(parent.command('adopt'))
    .description(getMessage('cli.provider-observations.adopt.desc', language))
    .requiredOption('--preimage <path>', getMessage('provider_observation.migration.inspect', language, {
      sourcePath: '-', schemaVersion: '1', action: 'adopt',
    }))
    .option('--apply', getMessage('provider_observation.migration.adopted', language, { path: '-' }))
    .option('--plan-digest <digest>', getMessage('provider_observation.migration.dry_run', language))
    .action((options: AdoptionOptions) => render('adoption', options, deps));
  common(parent.command('adopt-runtime'))
    .description(getMessage('cli.provider-observations.adopt-runtime.desc', language))
    .requiredOption('--preimage <path>', getMessage('provider_observation.runtime_adoption.preimage', language))
    .option('--apply', getMessage('provider_observation.runtime_adoption.apply', language))
    .option('--plan-digest <digest>', getMessage('provider_observation.runtime_adoption.plan_digest', language))
    .action((options: RuntimeAdoptionOptions) => render('runtime-adoption', options, deps));
  common(parent.command('reconcile'))
    .description(getMessage('cli.provider-observations.reconcile.desc', language))
    .option('--run-id <id>', getMessage('provider_observation.reconciliation.run_id', language),
      (value: string, previous: string[] = []) => [...previous, value])
    .option('--apply', getMessage('provider_observation.reconciliation.apply', language))
    .option('--plan-digest <digest>', getMessage('provider_observation.reconciliation.plan_digest', language))
    .option('--approval-id <id>', getMessage('provider_observation.reconciliation.approval_id', language))
    .action((options: ReconciliationOptions) => render('reconcile', options, deps));
}
