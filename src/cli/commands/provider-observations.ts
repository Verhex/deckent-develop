import { createHash, randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Command } from 'commander';
import { ApprovalBroker } from '../../core/approval-broker.js';
import { ApprovalStore } from '../../core/approval-store.js';
import { bootstrapApprovalAuthority } from '../../core/approval-authority-bootstrap.js';
import { loadConfig } from '../../core/config.js';
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
  ProviderExecutionObservationAdoptionReceiptStoreError,
  publishProviderExecutionObservationAdoptionReceipt,
  readProviderExecutionObservationAdoptionReceipt,
  type ProviderExecutionObservationAdoptionDurableReceipt,
} from '../../core/provider-execution-observation-adoption-receipt-store.js';
import { PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH } from '../../core/provider-execution-observation-store.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

const PLAN_TIME = new Date(0);
const HEX_256 = /^[a-f0-9]{64}$/u;

interface CommonOptions { readonly database?: string; readonly json?: boolean }
interface MigrationOptions extends CommonOptions {
  readonly apply?: boolean; readonly approvalId?: string; readonly planDigest?: string;
}
interface AdoptionOptions extends CommonOptions {
  readonly apply?: boolean; readonly planDigest?: string; readonly preimage?: string;
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
export interface ProviderObservationsCommandDeps {
  readonly resolveProjectRootFn?: () => string;
  readonly inspect?: (root: string, options: CommonOptions) => Promise<ProviderObservationMigrationProjection>;
  readonly migrate?: (root: string, options: MigrationOptions) => Promise<ProviderObservationMigrationProjection>;
  readonly adopt?: (root: string, options: AdoptionOptions) => Promise<ProviderObservationAdoptionProjection>;
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
  if (candidate.trim() === '' || isAbsolute(candidate)) throw new Error('INVALID_PATH');
  const root = resolve(projectRoot);
  const within = relative(root, resolve(root, candidate));
  if (within === '' || within === '..' || within.startsWith('..' + sep) || isAbsolute(within)) {
    throw new Error('PATH_ESCAPE');
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
  if (!supplied || !HEX_256.test(supplied) || supplied !== expected) throw new Error('PLAN_DIGEST_MISMATCH');
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
  if (authority?.enabled !== true || !lifecycle) throw new Error('APPROVAL_AUTHORITY_REQUIRED');
  const now = (): Date => new Date();
  const opened = bootstrapApprovalAuthority(projectRoot, config, {
    broker: new ApprovalBroker(projectRoot, { lifecycle, clock: now }),
    store: new ApprovalStore(projectRoot, { lifecycle, clock: now }), now,
  });
  if (opened.state !== 'ready') {
    const reason = opened.state === 'hold' ? opened.reasonCode : 'approval_authority_disabled';
    throw new Error('APPROVAL_AUTHORITY_HOLD:' + reason);
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
  if (!options.preimage) throw new Error('PREIMAGE_REQUIRED');
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

/** Canonical redacted output: project-relative paths, aggregates and digests only. */
export function providerObservationJson(
  value: ProviderObservationMigrationProjection | ProviderObservationAdoptionProjection,
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
  } else {
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
  }
  return canonical(base);
}

async function render(
  operation: 'inspect' | 'migration' | 'adoption', options: MigrationOptions & AdoptionOptions,
  deps: ProviderObservationsCommandDeps,
): Promise<void> {
  const projectRoot = resolve((deps.resolveProjectRootFn ?? resolveProjectRoot)());
  const language = getLanguage(undefined);
  try {
    const result = operation === 'inspect'
      ? await (deps.inspect ?? defaultInspect)(projectRoot, options)
      : operation === 'migration'
        ? await (deps.migrate ?? defaultMigration)(projectRoot, options)
        : await (deps.adopt ?? defaultAdoption)(projectRoot, options);
    if (options.json) { print(providerObservationJson(result, projectRoot)); return; }
    if (result.mode === 'pending-approval' && result.operation === 'migration' && result.approval) {
      print(getMessage('provider_observation.migration.pending_approval', language, {
        approvalId: result.approval.request.id,
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
    const code = error instanceof Error && 'code' in error
      ? String((error as Error & { code: unknown }).code) : detail.split(':', 1)[0]!;
    const adoptionHold = operation === 'adoption'
      && (error instanceof ProviderExecutionObservationAdoptionReceiptStoreError
        || error instanceof ProviderExecutionObservationAdoptionError);
    // Machine output is deliberately locale-independent and excludes exception
    // text: filesystem/database errors may contain an absolute path or identity.
    if (options.json) {
      print(adoptionHold
        ? canonical({ detail: code, mode: 'hold', operation, reasonCode: code })
        : canonical({ code, mode: 'error', operation }));
      process.exitCode = 1;
      return;
    }
    printError(new Error(adoptionHold
      ? getMessage('provider_observation.adoption.hold', language, { reasonCode: code, detail: code })
      : getMessage('provider_observation.migration.error', language, { errorCode: code, detail })));
    process.exitCode = 1;
  }
}

export function registerProviderObservations(
  program: Command, deps: ProviderObservationsCommandDeps = {},
): void {
  const language = getLanguage(undefined);
  const parent = program.command('provider-observations')
    .description(getMessage('provider_observation.migration.inspect', language, {
      sourcePath: PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH, schemaVersion: '1', action: 'migrate',
    }));
  const common = (command: Command): Command => command
    .option('--database <path>', getMessage('provider_observation.migration.inspect', language, {
      sourcePath: PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH, schemaVersion: '1', action: 'inspect',
    }))
    .option('--json', getMessage('provider_observation.migration.forensic_counts', language, {
      inspected: '-', eligible: '-', migrated: '-', adopted: '-', held: '-', rejected: '-',
    }));
  common(parent.command('inspect'))
    .action((options: CommonOptions) => render('inspect', options, deps));
  common(parent.command('migrate'))
    .option('--apply', getMessage('provider_observation.migration.pending_approval', language, { approvalId: '-' }))
    .option('--plan-digest <digest>', getMessage('provider_observation.migration.dry_run', language))
    .option('--approval-id <id>', getMessage('provider_observation.migration.pending_approval', language, { approvalId: '-' }))
    .action((options: MigrationOptions) => render('migration', options, deps));
  common(parent.command('adopt'))
    .requiredOption('--preimage <path>', getMessage('provider_observation.migration.inspect', language, {
      sourcePath: '-', schemaVersion: '1', action: 'adopt',
    }))
    .option('--apply', getMessage('provider_observation.migration.adopted', language, { path: '-' }))
    .option('--plan-digest <digest>', getMessage('provider_observation.migration.dry_run', language))
    .action((options: AdoptionOptions) => render('adoption', options, deps));
}
