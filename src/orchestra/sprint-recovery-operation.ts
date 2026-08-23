import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { loadConfig } from '../core/config.js';
import { DEFAULT_LIFECYCLE_RECOVERY_CONFIG } from '../core/config-types.js';
import { decideExecutionRecovery } from '../core/execution-recovery.js';
import { previewFinalizeCleanup } from '../core/orphan-cleaner.js';
import { readCanonicalRunStatus } from '../core/run-status-authority.js';
import {
  resolveTaskArtifactArchiveDir,
  TASK_ARTIFACT_PRESERVED_SUBDIR,
  writeTaskArtifactPreservationMarker,
} from '../core/sprint-archive.js';
import {
  RECOVERY_ARTIFACT_POLICY_VERSION,
  evaluateForceArchive,
  type ForceArchiveManifestV1,
} from '../core/recovery-artifact-policy.js';
import {
  applyFencedEffect,
  deriveFencedEffects,
  type ExecutionRecoveryPlatform,
} from './execution-recovery-adapter.js';
import { createSprintRecoveryAdapter } from './recovery-adapters/sprint-recovery-adapter.js';
import { readCheckpoint } from './sprint-checkpoint.js';
import { runSelfAuditGate } from './sprint-finalizer.js';
import {
  clearPid,
  isProcessAlive,
  readPidRecord,
  terminateOwnedSprintProcessAndWait,
  type CoordinatorTerminationPolicy,
  type VerifiedCoordinatorTermination,
  type VerifiedTerminateDeps,
} from './sprint-pid-manager.js';
import { clearSprintState, readSprintState } from './sprint-utils.js';
import { createPreArchiveSnapshot, verifySnapshot } from './task-restoration.js';

export type SprintRecoveryOperationErrorCode =
  | 'INVALID_SPRINT_ID'
  | 'ACTIVE_AUTHORITY'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_MISMATCH'
  | 'SNAPSHOT_REQUIRED'
  | 'ARCHIVE_INCOMPLETE'
  | 'SETTLEMENT_AUTHORITY_MISSING'
  | 'SETTLEMENT_FAILED';

export class SprintRecoveryOperationError extends Error {
  constructor(
    public readonly code: SprintRecoveryOperationErrorCode,
    public readonly details: Readonly<Record<string, string>>,
  ) {
    super(code);
    this.name = 'SprintRecoveryOperationError';
  }
}

export interface SprintRecoveryReport {
  identity: SprintRecoverySettlementIdentity;
  audit: { overallGate: 'PASS' | 'GATE_FAILURE' | 'SKIPPED' };
  orphanIpcDirs: string[];
  staleLocksCleaned: number;
  staleSpawnLocksCleaned: number;
  taskFilesArchived: number;
  taskFilesPreserved: number;
  artifactPolicy: {
    readonly policyVersion: typeof RECOVERY_ARTIFACT_POLICY_VERSION;
    readonly archiveManifests: readonly ForceArchiveManifestV1[];
    readonly checkpoint: {
      readonly disposition: 'absent' | 'preserved';
      readonly digest: string | null;
      readonly reason: 'not-present' | 'CHECKPOINT_SUPERSESSION_REQUIRED';
    };
  };
  remediation: {
    readonly lifecycle: 'PAUSED';
    readonly resumeCommand: string;
    readonly finalizeCommand: string;
  } | null;
}

export interface SprintRecoveryOperationOptions {
  readonly dryRun?: boolean;
  readonly skipAudit?: boolean;
  /**
   * `RECOVER_SETTLEMENT` owns snapshot/archive/housekeeping settlement.
   * `FINALIZE_CONTAINMENT` proves coordinator death only; finalizeSprint
   * remains the sole terminal artifact/state authority.
   */
  readonly intent?: 'RECOVER_SETTLEMENT' | 'FINALIZE_CONTAINMENT';
  readonly platform?: ExecutionRecoveryPlatform;
  readonly approval?: SprintRecoverySettlementApproval;
  readonly terminationPolicy?: CoordinatorTerminationPolicy;
  readonly terminationDeps?: VerifiedTerminateDeps;
}

export interface SprintCoordinatorContainmentOptions {
  /**
   * Exact recovery identity captured before the containment attempt. Callers
   * may omit it only when containment is their first operation.
   */
  readonly expectedIdentity?: SprintRecoverySettlementIdentity;
  /**
   * Effective-config policy injection. Production callers normally omit this
   * and the operation resolves `lifecycle_recovery` from the project config;
   * tests may inject a bounded policy without consulting host config.
   */
  readonly terminationPolicy?: CoordinatorTerminationPolicy;
  readonly terminationDeps?: VerifiedTerminateDeps;
  /**
   * A coordinator finalizing itself cannot signal itself before publishing
   * its own terminal artifacts. This exception is valid only for the normal
   * in-process finalizer; recovery/force settlement remains fail-closed.
   */
  readonly allowSelf?: boolean;
}

export interface SprintRecoverySettlementIdentity {
  readonly executionId: string;
  readonly generation: number;
  readonly taskId: string;
  readonly attemptId: string;
  readonly fenceToken: string;
}

export interface SprintRecoverySettlementApproval {
  readonly approvalRef: string;
  readonly idempotencyKey: string;
  readonly identity: SprintRecoverySettlementIdentity;
}

function platformDefault(): ExecutionRecoveryPlatform {
  return process.platform === 'win32' ? 'windows-native' : 'posix';
}

function assertSprintId(sprintId: string): void {
  if (!/^sprint-\d+$/u.test(sprintId)) {
    throw new SprintRecoveryOperationError('INVALID_SPRINT_ID', { sprintId });
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fileDigest(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function checkpointPolicyDisposition(
  root: string,
  sprintId: string,
  identity: SprintRecoverySettlementIdentity,
): SprintRecoveryReport['artifactPolicy']['checkpoint'] {
  const source = join(root, '.deckent', `${sprintId}-checkpoint.json`);
  if (!existsSync(source)) return { disposition: 'absent', digest: null, reason: 'not-present' };
  const checkpointDigest = fileDigest(source);
  const decision = evaluateForceArchive({
    artifact: {
      policyVersion: RECOVERY_ARTIFACT_POLICY_VERSION,
      artifactClass: 'canonical-resume-checkpoint', source, digest: checkpointDigest,
      owner: { taskId: identity.taskId, attemptId: identity.attemptId, fence: identity.fenceToken },
    },
    destination: join(root, '.deckent', 'archive', sprintId, `${sprintId}-checkpoint.json`),
    requestedBy: 'sprint-recovery-operation',
  });
  if (decision.allowed || decision.code !== 'CHECKPOINT_SUPERSESSION_REQUIRED') {
    throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
      sprintId, disposition: 'HOLD',
      reason: decision.allowed ? 'checkpoint-policy-unexpected-allow' : decision.code,
    });
  }
  return { disposition: 'preserved', digest: checkpointDigest, reason: decision.code };
}

function taskArchiveManifests(
  root: string,
  sprintId: string,
  classification: { readonly archivedFiles: readonly string[]; readonly preservedFiles: readonly string[] },
  identity: SprintRecoverySettlementIdentity,
): ForceArchiveManifestV1[] {
  const preserved = new Set(classification.preservedFiles);
  const files = [...classification.archivedFiles, ...classification.preservedFiles];
  return files.map(file => {
    const source = join(root, '.tasks', file);
    const taskArchive = resolveTaskArtifactArchiveDir(root, sprintId);
    const decision = evaluateForceArchive({
      artifact: {
        policyVersion: RECOVERY_ARTIFACT_POLICY_VERSION,
        artifactClass: 'task-residue', source, digest: fileDigest(source),
        owner: { taskId: identity.taskId, attemptId: identity.attemptId, fence: identity.fenceToken },
      },
      destination: preserved.has(file)
        ? join(taskArchive, TASK_ARTIFACT_PRESERVED_SUBDIR, file)
        : join(taskArchive, file),
      requestedBy: 'sprint-recovery-operation',
    });
    if (!decision.allowed) {
      throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
        sprintId, disposition: 'HOLD', reason: decision.code,
      });
    }
    return decision.manifest;
  });
}

/**
 * Apply only manifests already authorized by the semantic recovery policy.
 *
 * Destination publication is first-writer-wins: a same-directory temporary
 * file is fsync'd and then linked into the absent destination. A restart may
 * observe an already-published destination, but only byte-identical content is
 * accepted. Sources are retired only after every destination has been
 * independently verified, so a partial crash never turns archive presence into
 * false settlement authority.
 */
export function applyForceArchiveManifests(
  manifests: readonly ForceArchiveManifestV1[],
): number {
  const prepared = manifests.map((manifest, index) => {
    if (
      manifest.manifestVersion !== 1
      || manifest.policyVersion !== RECOVERY_ARTIFACT_POLICY_VERSION
      || manifest.operation !== 'force-archive'
      || manifest.artifactClass !== 'task-residue'
      || manifest.successor !== null
      || manifest.source === manifest.destination
    ) {
      throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
        disposition: 'HOLD', reason: 'archive-manifest-invalid', index: String(index),
      });
    }
    if (!existsSync(manifest.source)) {
      if (existsSync(manifest.destination) && fileDigest(manifest.destination) === manifest.digest) {
        return { manifest, bytes: null };
      }
      throw new SprintRecoveryOperationError('ARCHIVE_INCOMPLETE', {
        disposition: 'HOLD', reason: 'archive-source-missing', source: manifest.source,
      });
    }
    const bytes = readFileSync(manifest.source);
    const observedDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (observedDigest !== manifest.digest) {
      throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
        disposition: 'HOLD', reason: 'archive-source-digest-mismatch', source: manifest.source,
      });
    }
    if (existsSync(manifest.destination) && fileDigest(manifest.destination) !== manifest.digest) {
      throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
        disposition: 'HOLD', reason: 'archive-destination-conflict', destination: manifest.destination,
      });
    }
    return { manifest, bytes };
  });

  for (const [index, entry] of prepared.entries()) {
    if (entry.bytes === null || existsSync(entry.manifest.destination)) continue;
    const directory = dirname(entry.manifest.destination);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.recovery-archive-${process.pid}-${index}.tmp`);
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporary, 'wx', 0o600);
      writeFileSync(descriptor, entry.bytes);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      try {
        linkSync(temporary, entry.manifest.destination);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'EEXIST'
          || fileDigest(entry.manifest.destination) !== entry.manifest.digest
        ) {
          throw error;
        }
      }
      if (fileDigest(entry.manifest.destination) !== entry.manifest.digest) {
        throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
          disposition: 'HOLD', reason: 'archive-publication-digest-mismatch',
          destination: entry.manifest.destination,
        });
      }
      const directoryDescriptor = openSync(directory, 'r');
      try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    } catch (error) {
      if (error instanceof SprintRecoveryOperationError) throw error;
      throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
        disposition: 'HOLD', reason: 'archive-publication-failed',
        destination: entry.manifest.destination,
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      try { unlinkSync(temporary); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          // The destination is already durable; a visible temp is safer than
          // hiding cleanup uncertainty behind a successful settlement.
          throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
            disposition: 'HOLD', reason: 'archive-temporary-cleanup-failed', temporary,
          });
        }
      }
    }
  }

  for (const entry of prepared) {
    if (!existsSync(entry.manifest.source)) continue;
    if (
      fileDigest(entry.manifest.source) !== entry.manifest.digest
      || !existsSync(entry.manifest.destination)
      || fileDigest(entry.manifest.destination) !== entry.manifest.digest
    ) {
      throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
        disposition: 'HOLD', reason: 'archive-retirement-precondition-failed',
        source: entry.manifest.source,
      });
    }
  }
  for (const entry of prepared) {
    if (existsSync(entry.manifest.source)) unlinkSync(entry.manifest.source);
  }
  if (prepared.length > 0) {
    const sourceDirectoryDescriptor = openSync(dirname(prepared[0]!.manifest.source), 'r');
    try { fsyncSync(sourceDirectoryDescriptor); } finally { closeSync(sourceDirectoryDescriptor); }
  }
  return prepared.length;
}

export function readSprintRecoverySettlementIdentity(
  root: string,
  sprintId: string,
): SprintRecoverySettlementIdentity {
  assertSprintId(sprintId);
  const checkpoint = readCheckpoint(root, sprintId);
  const pid = readPidRecord(root, sprintId);
  const generation = checkpoint?.checkpointNumber ?? 0;
  const attemptId = `${sprintId}:recovery:${generation}`;
  return {
    executionId: sprintId,
    generation,
    taskId: sprintId,
    attemptId,
    fenceToken: digest({
      sprintId,
      generation,
      checkpointTimestamp: checkpoint?.timestamp ?? null,
      pid: pid?.pid ?? null,
      pidStartToken: pid?.startToken ?? null,
    }),
  };
}

function sameIdentity(
  left: SprintRecoverySettlementIdentity,
  right: SprintRecoverySettlementIdentity,
): boolean {
  return left.executionId === right.executionId
    && left.generation === right.generation
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.fenceToken === right.fenceToken;
}

async function resolveTerminationPolicy(
  root: string,
  override?: CoordinatorTerminationPolicy,
): Promise<CoordinatorTerminationPolicy> {
  if (override) return override;
  const config = await loadConfig(root);
  return config.lifecycle_recovery ?? DEFAULT_LIFECYCLE_RECOVERY_CONFIG;
}

/**
 * One ownership- and generation-fenced coordinator containment authority for
 * recovery and finalize surfaces. It never clears lifecycle metadata itself:
 * the caller may retire that authority only after this function proves death
 * (or proves that the recorded process was already absent).
 */
export async function containSprintRecoveryCoordinator(
  root: string,
  sprintId: string,
  opts: SprintCoordinatorContainmentOptions = {},
): Promise<VerifiedCoordinatorTermination> {
  assertSprintId(sprintId);
  const identity =
    opts.expectedIdentity ?? readSprintRecoverySettlementIdentity(root, sprintId);
  const recordedCoordinator = readPidRecord(root, sprintId);
  if (recordedCoordinator === null || !(opts.terminationDeps?.isAlive ?? isProcessAlive)(
    recordedCoordinator.pid,
  )) {
    return {
      action: 'already-stopped',
      pid: recordedCoordinator?.pid ?? null,
      escalation: 'none',
    };
  }
  if (recordedCoordinator.pid === process.pid) {
    if (opts.allowSelf) {
      return { action: 'self', pid: recordedCoordinator.pid, escalation: 'none' };
    }
    throw new SprintRecoveryOperationError('ACTIVE_AUTHORITY', {
      sprintId,
      pid: String(recordedCoordinator.pid),
    });
  }

  const policy = await resolveTerminationPolicy(root, opts.terminationPolicy);
  const termination = await terminateOwnedSprintProcessAndWait(
    root,
    sprintId,
    policy,
    {
      ...opts.terminationDeps,
      verifyGeneration: () => (
        sameIdentity(identity, readSprintRecoverySettlementIdentity(root, sprintId))
        && (opts.terminationDeps?.verifyGeneration?.() ?? true)
      ),
    },
  );
  if (termination.action !== 'terminated' && termination.action !== 'already-stopped') {
    throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
      sprintId,
      disposition: 'HOLD',
      reason: termination.action,
      pid: String(termination.pid ?? ''),
    });
  }
  const identityAfterTermination = readSprintRecoverySettlementIdentity(root, sprintId);
  if (!sameIdentity(identity, identityAfterTermination)) {
    throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
      sprintId,
      disposition: 'HOLD',
      reason: 'settlement-identity-changed',
    });
  }
  if ((opts.terminationDeps?.isAlive ?? isProcessAlive)(recordedCoordinator.pid)) {
    throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
      sprintId,
      disposition: 'HOLD',
      reason: 'death-verification-failed',
      pid: String(recordedCoordinator.pid),
    });
  }
  return termination;
}

/**
 * Canonical Sprint recovery settlement operation shared by CLI and MCP.
 * It is sprint-scoped, refuses live authority, snapshots before mutation,
 * and derives its fenced housekeeping effect from the recovery kernel.
 */
export async function runSprintRecoveryOperation(
  root: string,
  sprintId: string,
  opts: SprintRecoveryOperationOptions,
): Promise<SprintRecoveryReport> {
  assertSprintId(sprintId);
  const identity = readSprintRecoverySettlementIdentity(root, sprintId);
  const authorityBeforeMutation = readCanonicalRunStatus(root, { sprintIdHint: sprintId });
  const checkpointDisposition = checkpointPolicyDisposition(root, sprintId, identity);
  const preview = previewFinalizeCleanup(root, sprintId);
  const archiveManifests = taskArchiveManifests(root, sprintId, preview, identity);
  const report: SprintRecoveryReport = {
    identity,
    audit: { overallGate: 'SKIPPED' },
    orphanIpcDirs: [],
    staleLocksCleaned: 0,
    staleSpawnLocksCleaned: 0,
    taskFilesArchived: 0,
    taskFilesPreserved: 0,
    artifactPolicy: {
      policyVersion: RECOVERY_ARTIFACT_POLICY_VERSION,
      archiveManifests,
      checkpoint: checkpointDisposition,
    },
    remediation: authorityBeforeMutation.sprintId === sprintId
      && authorityBeforeMutation.lifecycle === 'PAUSED'
      && authorityBeforeMutation.resumable
      && authorityBeforeMutation.recoveryCommand
      && authorityBeforeMutation.finalizeCommand
      ? {
          lifecycle: 'PAUSED',
          resumeCommand: authorityBeforeMutation.recoveryCommand,
          finalizeCommand: authorityBeforeMutation.finalizeCommand,
        }
      : null,
  };
  if (opts.dryRun) {
    report.taskFilesArchived = preview.archivedFiles.length;
    report.taskFilesPreserved = preview.preservedFiles.length;
    return report;
  }
  if (!opts.approval) {
    throw new SprintRecoveryOperationError('APPROVAL_REQUIRED', { sprintId });
  }
  if (
    opts.approval.approvalRef.length === 0
    || opts.approval.idempotencyKey.length === 0
    || !sameIdentity(opts.approval.identity, identity)
  ) {
    throw new SprintRecoveryOperationError('APPROVAL_MISMATCH', { sprintId });
  }

  await containSprintRecoveryCoordinator(root, sprintId, {
    expectedIdentity: identity,
    terminationPolicy: opts.terminationPolicy,
    terminationDeps: opts.terminationDeps,
  });
  if (opts.intent === 'FINALIZE_CONTAINMENT') {
    return report;
  }

  const authority = readCanonicalRunStatus(root);
  if (
    authority.sprintId === sprintId
    && (authority.active || authority.coordinator === 'alive')
  ) {
    throw new SprintRecoveryOperationError('ACTIVE_AUTHORITY', { sprintId });
  }

  const targetFileCount = preview.archivedFiles.length + preview.preservedFiles.length;
  let snapshotOk = targetFileCount === 0;
  if (targetFileCount > 0) {
    const snapshot = createPreArchiveSnapshot(root, sprintId);
    snapshotOk = snapshot !== null
      && existsSync(snapshot.hashPath)
      && verifySnapshot(snapshot.snapshotPath, snapshot.hash);
    if (!snapshotOk) {
      throw new SprintRecoveryOperationError('SNAPSHOT_REQUIRED', { sprintId });
    }
  }

  if (!opts.skipAudit) {
    try {
      const auditResult = await runSelfAuditGate(sprintId, root);
      report.audit = { overallGate: auditResult.overallGate };
    } catch {
      report.audit = { overallGate: 'SKIPPED' };
    }
  }

  const settledTaskFiles = applyForceArchiveManifests(archiveManifests);
  report.taskFilesArchived = preview.archivedFiles.length;
  report.taskFilesPreserved = preview.preservedFiles.length;
  if (settledTaskFiles !== preview.archivedFiles.length + preview.preservedFiles.length) {
    throw new SprintRecoveryOperationError('ARCHIVE_INCOMPLETE', {
      sprintId,
      expected: String(preview.archivedFiles.length + preview.preservedFiles.length),
      actual: String(settledTaskFiles),
    });
  }
  writeTaskArtifactPreservationMarker(root, sprintId, preview.preservedFiles);

  if (snapshotOk || report.taskFilesArchived === 0) {
    const adapter = createSprintRecoveryAdapter(opts.platform ?? platformDefault(), {
      // Task-14 policy preserves exact checkpoint bytes until an explicit
      // distinct successor or terminal receipt owns retirement.
      clearCheckpoint: () => undefined,
      clearPid: id => clearPid(root, id),
      clearMatchingSprintState: id => {
        const state = readSprintState(root);
        if (state?.sprintId === id) clearSprintState(root);
      },
    });
    const outcome = decideExecutionRecovery({
      expectedIdentity: identity,
      evidence: {
        identity,
        evidenceRefs: [
          `recovery-preview:${sprintId}:${targetFileCount}`,
          `recovery-archive:${sprintId}:${report.taskFilesArchived}`,
        ],
        dispatch: 'DISPATCHED',
        control: 'RUNNING',
        process: 'ABSENT',
        fence: 'INACTIVE',
        previousProgressSequence: report.taskFilesArchived,
        observedProgressSequence: report.taskFilesArchived,
        wallClockProjection: 'UNKNOWN',
        completion: 'DURABLE',
        finalizePermitRef: `recovery-approval:${sprintId}`,
      },
    });
    const effect = deriveFencedEffects(identity, outcome)
      .find(candidate => candidate.capability === 'settle');
    if (!effect) {
      throw new SprintRecoveryOperationError('SETTLEMENT_AUTHORITY_MISSING', { sprintId });
    }
    const applied = await applyFencedEffect(adapter, identity, effect);
    if (!applied.ok) {
      throw new SprintRecoveryOperationError('SETTLEMENT_FAILED', {
        sprintId,
        code: applied.code,
      });
    }
  }

  return report;
}
