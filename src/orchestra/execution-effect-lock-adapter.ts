import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import {
  PROJECT_MAINTENANCE_LOCK_TASK_ID,
  adoptExecutionLockActiveGeneration,
  acquireProjectMaintenanceLock,
  assertExecutionLockAuthority,
  beginExecutionLockIrreversibleBoundary,
  checkProjectMaintenanceLock,
  completeExecutionLockNoChangeBoundary,
  completeExecutionLockIrreversibleBoundary,
  quarantineExecutionLock,
  readExecutionLockActiveAdoption,
  readExecutionLockBoundaryResume,
  readCompletedExecutionLockBoundary,
  renewExecutionLock,
  resumeExecutionLockIrreversibleBoundary,
  type ExecutionLockBoundaryCompletion,
  type ExecutionLockActiveAdoptionAudit,
  type ExecutionLockInfo,
  type ExecutionLockOptions,
  type ExecutionLockQuarantineAuditEvent,
  type ExecutionLockQuarantineInfo,
} from '../core/file-lock.js';
import {
  createExecutionEffectLandingLeaseCapabilityV1,
  createExecutionEffectLandingLeaseResumeResultV1,
  parseExecutionEffectLandingLeaseResumeContextV1,
  type ExecutionEffectLandingBoundaryV1,
  type ExecutionEffectLandingLeaseAdapterV1,
  type ExecutionEffectLandingLeaseResumeContextV1,
  type ExecutionEffectLandingLeaseResumeResultV1,
  type ExecutionEffectLandingLeaseTerminalV1,
  type ExecutionEffectLandingLeaseV1,
} from '../core/execution-effect-persistence-contract.js';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ADAPTER_ID = 'deckent.execution-effect-lock.v1';

function compareCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCodePoint(left, right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(domain: string, value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function requireDigest(value: unknown, name: string): asserts value is `sha256:${string}` {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`Invalid ${name}`);
  }
}

function exactFencingDigest(lock: ExecutionLockInfo): `sha256:${string}` {
  return digest('execution-effect-lock-fencing-v1', {
    taskId: lock.taskId,
    ownerId: lock.ownerId,
    fencingToken: lock.fencingToken,
  });
}

function leaseSnapshot(
  transactionDigest: string,
  lock: ExecutionLockInfo,
): ExecutionEffectLandingLeaseV1 {
  const fencingTokenDigest = exactFencingDigest(lock);
  return Object.freeze({
    transactionDigest,
    fencingTokenDigest,
    leaseReceiptDigest: digest('execution-effect-lock-lease-receipt-v1', {
      transactionDigest,
      fencingTokenDigest,
      taskId: lock.taskId,
      ownerId: lock.ownerId,
      acquiredAt: lock.acquiredAt,
      renewedAt: lock.renewedAt,
      leaseDurationMs: lock.leaseDurationMs,
    }),
  });
}

function deterministicBoundaryId(transactionDigest: string): string {
  const bytes = createHash('sha256')
    .update('execution-effect-lock-boundary-id-v1', 'utf8')
    .update('\0', 'utf8')
    .update(transactionDigest, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function sortedEvidenceRefs(refs: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(refs)].sort(compareCodePoint));
}

function transactionEvidence(transactionDigest: string): string {
  return `effect-transaction:${transactionDigest}`;
}

function journalEvidence(
  kind: 'prepared' | 'applying' | 'committed',
  journalDigest: string,
): string {
  return `${kind}-journal:${journalDigest}`;
}

function terminalEvidence(terminal: ExecutionEffectLandingLeaseTerminalV1['terminal']): string {
  return `effect-terminal:${terminal}`;
}

function boundaryReceipt(
  transactionDigest: string,
  preparedJournalDigest: string,
  quarantine: ExecutionLockQuarantineInfo,
): ExecutionEffectLandingBoundaryV1 {
  const fencingTokenDigest = exactFencingDigest(quarantine.lock);
  return Object.freeze({
    transactionDigest,
    fencingTokenDigest,
    boundaryId: quarantine.quarantineId,
    boundaryReceiptDigest: digest('execution-effect-lock-boundary-receipt-v1', {
      transactionDigest,
      preparedJournalDigest,
      fencingTokenDigest,
      quarantineId: quarantine.quarantineId,
      enteredAt: quarantine.enteredAt,
      evidenceRefs: quarantine.evidenceRefs,
    }),
  });
}

function completionPayload(
  value: unknown,
): value is ExecutionLockBoundaryCompletion {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Partial<ExecutionLockBoundaryCompletion>;
  return record.schemaVersion === 1
    && typeof record.quarantineId === 'string'
    && record.fencingToken !== undefined
    && Array.isArray(record.evidenceRefs)
    && typeof record.completedAt === 'string';
}

function terminalFromCompletion(
  transactionDigest: string,
  committedJournalDigest: string,
  terminal: ExecutionEffectLandingLeaseTerminalV1['terminal'],
  completionEvent: NonNullable<ReturnType<typeof readCompletedExecutionLockBoundary>>,
): ExecutionEffectLandingLeaseTerminalV1 | null {
  if (completionEvent.taskId !== PROJECT_MAINTENANCE_LOCK_TASK_ID
    || !completionPayload(completionEvent.payload)
    || completionEvent.payload.quarantineId !== deterministicBoundaryId(transactionDigest)) {
    return null;
  }
  const requiredEvidence = [
    journalEvidence('committed', committedJournalDigest),
    terminalEvidence(terminal),
    transactionEvidence(transactionDigest),
  ];
  if (terminal === 'COMPLETED') {
    const boundaryRefs = completionEvent.payload.evidenceRefs.filter(reference => (
      /^effect-boundary:sha256:[0-9a-f]{64}$/u.test(reference)
    ));
    if (boundaryRefs.length !== 1) return null;
    requiredEvidence.push(boundaryRefs[0]!);
  }
  const exactEvidence = sortedEvidenceRefs(requiredEvidence);
  if (JSON.stringify(exactEvidence)
    !== JSON.stringify(completionEvent.payload.evidenceRefs)) {
    return null;
  }
  const terminalReceiptDigest = digest('execution-effect-lock-terminal-receipt-v1', {
    transactionDigest,
    terminal,
    committedJournalDigest,
    eventId: completionEvent.eventId,
    quarantineId: completionEvent.quarantineId,
    fencingToken: completionEvent.fencingToken,
    occurredAt: completionEvent.occurredAt,
    evidenceRefs: completionEvent.payload.evidenceRefs,
  });
  return Object.freeze({
    transactionDigest,
    terminal,
    committedJournalDigest,
    terminalReceiptDigest,
  });
}

function sameLease(
  left: ExecutionEffectLandingLeaseV1,
  right: ExecutionEffectLandingLeaseV1,
): boolean {
  return left.transactionDigest === right.transactionDigest
    && left.fencingTokenDigest === right.fencingTokenDigest
    && left.leaseReceiptDigest === right.leaseReceiptDigest;
}

function sameBoundary(
  left: ExecutionEffectLandingBoundaryV1,
  right: ExecutionEffectLandingBoundaryV1,
): boolean {
  return left.transactionDigest === right.transactionDigest
    && left.fencingTokenDigest === right.fencingTokenDigest
    && left.boundaryId === right.boundaryId
    && left.boundaryReceiptDigest === right.boundaryReceiptDigest;
}

function resumeEvidenceRefs(
  context: ExecutionEffectLandingLeaseResumeContextV1,
): readonly string[] {
  return sortedEvidenceRefs([
    `effect-prior-lease:${context.priorLease.leaseReceiptDigest}`,
    journalEvidence('prepared', context.prepared.recordDigest),
    transactionEvidence(context.transaction.transactionDigest),
  ]);
}

function durableResumeEvidence(
  context: ExecutionEffectLandingLeaseResumeContextV1,
  auditDomain: string,
  audit: unknown,
): readonly `sha256:${string}`[] {
  return Object.freeze([
    context.contextDigest,
    digest(auditDomain, audit),
  ]);
}

function activeAdoptionPriorEvent(
  context: ExecutionEffectLandingLeaseResumeContextV1,
  lineage: readonly ExecutionLockActiveAdoptionAudit[],
): ExecutionLockActiveAdoptionAudit | null {
  const matches = lineage.filter(event => sameLease(
    context.priorLease,
    leaseSnapshot(context.transaction.transactionDigest, event.previousLock),
  ));
  return matches.length === 1 ? matches[0]! : null;
}

function boundaryResumePriorEvent(
  context: ExecutionEffectLandingLeaseResumeContextV1,
  lineage: readonly ExecutionLockQuarantineAuditEvent[],
): ExecutionLockQuarantineAuditEvent | null {
  const matches = lineage.filter(event => (
    event.action === 'resumed'
    && 'previousLock' in event.payload
    && sameLease(
      context.priorLease,
      leaseSnapshot(context.transaction.transactionDigest, event.payload.previousLock),
    )
  ));
  return matches.length === 1 ? matches[0]! : null;
}

export interface ExecutionEffectLockAdapterOptionsV1 {
  readonly projectRootIdentityDigest: string;
  readonly lockOptions?: ExecutionLockOptions;
}

/**
 * Bridges the effect landing coordinator to Deckent's one canonical,
 * project-wide execution-lock authority. It deliberately has no fallback
 * mutex, lock file, or process-local terminal decision.
 */
export function createExecutionEffectLockAdapterV1(
  projectRoot: string,
  options: ExecutionEffectLockAdapterOptionsV1,
): ExecutionEffectLandingLeaseAdapterV1 {
  requireDigest(options.projectRootIdentityDigest, 'project root identity digest');
  const canonicalProjectRoot = resolve(projectRoot);
  const lockOptions = options.lockOptions ?? {};
  const lockByTransaction = new Map<string, ExecutionLockInfo>();

  const requireCurrentLease = (
    lease: ExecutionEffectLandingLeaseV1,
  ): ExecutionLockInfo => {
    requireDigest(lease.transactionDigest, 'transaction digest');
    const lock = lockByTransaction.get(lease.transactionDigest);
    if (!lock || !sameLease(lease, leaseSnapshot(lease.transactionDigest, lock))) {
      throw new Error('Execution effect lease authority is unavailable');
    }
    assertExecutionLockAuthority(canonicalProjectRoot, lock, lockOptions);
    return lock;
  };

  const readTerminal = (
    transactionDigest: string,
    committedJournalDigest: string,
  ): ExecutionEffectLandingLeaseTerminalV1 | null => {
    requireDigest(transactionDigest, 'transaction digest');
    requireDigest(committedJournalDigest, 'committed journal digest');
    const event = readCompletedExecutionLockBoundary(
      canonicalProjectRoot,
      deterministicBoundaryId(transactionDigest),
    );
    if (!event) return null;
    const terminalMarkers = event.payload.evidenceRefs.filter(reference => (
      reference === terminalEvidence('COMPLETED')
      || reference === terminalEvidence('RELEASED_NO_CHANGE')
    ));
    if (terminalMarkers.length !== 1) return null;
    return terminalFromCompletion(
      transactionDigest,
      committedJournalDigest,
      terminalMarkers[0] === terminalEvidence('RELEASED_NO_CHANGE')
        ? 'RELEASED_NO_CHANGE'
        : 'COMPLETED',
      event,
    );
  };

  return Object.freeze({
    capability: createExecutionEffectLandingLeaseCapabilityV1({
      adapterId: ADAPTER_ID,
      projectRootIdentityDigest: options.projectRootIdentityDigest,
    }),
    acquire(transactionDigest: string): ExecutionEffectLandingLeaseV1 {
      requireDigest(transactionDigest, 'transaction digest');
      if (lockByTransaction.has(transactionDigest)) {
        throw new Error('Execution effect transaction lease already exists');
      }
      const lock = acquireProjectMaintenanceLock(canonicalProjectRoot, lockOptions);
      lockByTransaction.set(transactionDigest, lock);
      return leaseSnapshot(transactionDigest, lock);
    },
    resume(
      suppliedContext: ExecutionEffectLandingLeaseResumeContextV1,
    ): ExecutionEffectLandingLeaseResumeResultV1 {
      const context = parseExecutionEffectLandingLeaseResumeContextV1(suppliedContext);
      if (!context) throw new TypeError('Invalid execution effect lease resume context');
      const transactionDigest = context.transaction.transactionDigest;
      const inspected = checkProjectMaintenanceLock(canonicalProjectRoot);
      const evidenceRefs = resumeEvidenceRefs(context);
      if (context.applying === null) {
        if (inspected.state !== 'held') {
          throw new Error('Execution effect active lease cannot be resumed safely');
        }
        let priorLineage: readonly ExecutionLockActiveAdoptionAudit[] = [];
        if (sameLease(
          context.priorLease,
          leaseSnapshot(transactionDigest, inspected.lock),
        )) {
          // The exact PREPARED lease is still canonical; adoption below must
          // positively prove this owner dead before advancing the fence.
        } else {
          const resolved = readExecutionLockActiveAdoption(
            canonicalProjectRoot,
            inspected.lock,
            { evidenceRefs },
          );
          if (!resolved || !activeAdoptionPriorEvent(context, resolved.lineage)) {
            throw new Error('Execution effect active adoption lineage is unavailable');
          }
          priorLineage = resolved.lineage;
        }
        const adopted = adoptExecutionLockActiveGeneration(
          canonicalProjectRoot,
          inspected.lock,
          { evidenceRefs },
          lockOptions,
        );
        if (adopted.projectionPublication !== 'completed') {
          throw new Error('Execution effect active lease projection is uncertain');
        }
        const lineage = Object.freeze([...priorLineage, adopted.audit]);
        const adoptedLock = adopted.adopted;
        const lease = leaseSnapshot(transactionDigest, adoptedLock);
        lockByTransaction.set(transactionDigest, adoptedLock);
        return createExecutionEffectLandingLeaseResumeResultV1({
          context,
          lease,
          currentBoundary: null,
          durableEvidenceDigests: durableResumeEvidence(
            context,
            'execution-effect-lock-active-adoption-lineage-v1',
            lineage,
          ),
          resumedAt: adopted.audit.adoptedAt,
        });
      }
      if (inspected.state !== 'quarantined'
        || inspected.quarantine.state !== 'in-flight'
        || inspected.quarantine.quarantineId !== deterministicBoundaryId(transactionDigest)) {
        throw new Error('Execution effect boundary lease cannot be resumed safely');
      }
      let priorLineage: readonly ExecutionLockQuarantineAuditEvent[] = [];
      if (sameLease(
        context.priorLease,
        leaseSnapshot(transactionDigest, inspected.lock),
      )) {
        if (!sameBoundary(
          context.applying.previousBoundary,
          boundaryReceipt(
            transactionDigest,
            context.prepared.recordDigest,
            inspected.quarantine,
          ),
        )) {
          throw new Error('Execution effect original boundary receipt mismatch');
        }
      } else {
        const resolved = readExecutionLockBoundaryResume(
          canonicalProjectRoot,
          inspected.quarantine,
          { evidenceRefs },
        );
        const priorEvent = resolved
          ? boundaryResumePriorEvent(context, resolved.lineage) : null;
        if (!resolved || !priorEvent || !('previousLock' in priorEvent.payload)) {
          throw new Error('Execution effect boundary resume lineage is unavailable');
        }
        const originalQuarantine = Object.freeze({
          ...resolved.resumed,
          lock: priorEvent.payload.previousLock,
        });
        if (!sameBoundary(
          context.applying.previousBoundary,
          boundaryReceipt(
            transactionDigest,
            context.prepared.recordDigest,
            originalQuarantine,
          ),
        )) {
          throw new Error('Execution effect durable boundary lineage mismatch');
        }
        priorLineage = resolved.lineage;
      }
      const resumed = resumeExecutionLockIrreversibleBoundary(
        canonicalProjectRoot,
        inspected.quarantine,
        { evidenceRefs },
        lockOptions,
      );
      if (resumed.projectionPublication !== 'completed') {
        throw new Error('Execution effect boundary projection is uncertain');
      }
      const resumedQuarantine = resumed.resumed;
      const lineage = Object.freeze([...priorLineage, resumed.audit]);
      const lease = leaseSnapshot(transactionDigest, resumedQuarantine.lock);
      const currentBoundary = boundaryReceipt(
        transactionDigest,
        context.prepared.recordDigest,
        resumedQuarantine,
      );
      lockByTransaction.set(transactionDigest, resumedQuarantine.lock);
      return createExecutionEffectLandingLeaseResumeResultV1({
        context,
        lease,
        currentBoundary,
        durableEvidenceDigests: durableResumeEvidence(
          context,
          'execution-effect-lock-boundary-resume-lineage-v1',
          lineage,
        ),
        resumedAt: resumed.audit.occurredAt,
      });
    },
    assert(lease: ExecutionEffectLandingLeaseV1): void {
      requireCurrentLease(lease);
    },
    renew(lease: ExecutionEffectLandingLeaseV1): ExecutionEffectLandingLeaseV1 {
      const lock = requireCurrentLease(lease);
      const renewed = renewExecutionLock(
        canonicalProjectRoot,
        lock.taskId,
        lock.ownerId,
        lockOptions,
      );
      lockByTransaction.set(lease.transactionDigest, renewed);
      return leaseSnapshot(lease.transactionDigest, renewed);
    },
    beginBoundary(
      lease: ExecutionEffectLandingLeaseV1,
      preparedJournalDigest: string,
    ): ExecutionEffectLandingBoundaryV1 {
      requireDigest(preparedJournalDigest, 'prepared journal digest');
      const lock = requireCurrentLease(lease);
      const quarantine = beginExecutionLockIrreversibleBoundary(
        canonicalProjectRoot,
        lock,
        {
          quarantineId: deterministicBoundaryId(lease.transactionDigest),
          evidenceRefs: sortedEvidenceRefs([
            journalEvidence('prepared', preparedJournalDigest),
            transactionEvidence(lease.transactionDigest),
          ]),
        },
        lockOptions,
      );
      return boundaryReceipt(lease.transactionDigest, preparedJournalDigest, quarantine);
    },
    quarantine(
      lease: ExecutionEffectLandingLeaseV1,
      boundary: ExecutionEffectLandingBoundaryV1 | null,
      evidenceDigests: readonly string[],
    ): string {
      const lock = requireCurrentLease(lease);
      for (const evidenceDigest of evidenceDigests) {
        requireDigest(evidenceDigest, 'landing evidence digest');
      }
      const inspected = checkProjectMaintenanceLock(canonicalProjectRoot);
      if (boundary !== null) {
        if (inspected.state !== 'quarantined'
          || inspected.quarantine.state !== 'in-flight') {
          throw new Error('Execution effect boundary authority is unavailable');
        }
        const preparedReference = inspected.quarantine.evidenceRefs.find(reference => (
          reference.startsWith('prepared-journal:')
        ));
        const preparedDigest = preparedReference?.slice('prepared-journal:'.length);
        if (!preparedDigest || !DIGEST_PATTERN.test(preparedDigest)
          || !sameBoundary(
            boundary,
            boundaryReceipt(lease.transactionDigest, preparedDigest, inspected.quarantine),
          )) {
          throw new Error('Execution effect boundary receipt mismatch');
        }
      }
      const evidenceSetDigest = digest(
        'execution-effect-lock-quarantine-evidence-set-v1',
        [...evidenceDigests].sort(compareCodePoint),
      );
      const quarantined = quarantineExecutionLock(
        canonicalProjectRoot,
        lock,
        {
          reason: boundary === null ? 'authority-uncertain' : 'partial-mutation',
          evidenceRefs: sortedEvidenceRefs([
            ...(boundary ? [`effect-boundary:${boundary.boundaryReceiptDigest}`] : []),
            `effect-evidence-set:${evidenceSetDigest}`,
            transactionEvidence(lease.transactionDigest),
          ]),
        },
        lockOptions,
      );
      return digest('execution-effect-lock-quarantine-receipt-v1', quarantined);
    },
    completeBoundary(
      lease: ExecutionEffectLandingLeaseV1,
      boundary: ExecutionEffectLandingBoundaryV1,
      committedJournalDigest: string,
    ): ExecutionEffectLandingLeaseTerminalV1 {
      requireDigest(committedJournalDigest, 'committed journal digest');
      const lock = requireCurrentLease(lease);
      const inspected = checkProjectMaintenanceLock(canonicalProjectRoot);
      if (inspected.state !== 'quarantined'
        || inspected.quarantine.state !== 'in-flight') {
        throw new Error('Execution effect boundary authority is unavailable');
      }
      const preparedReference = inspected.quarantine.evidenceRefs.find(reference => (
        reference.startsWith('prepared-journal:')
      ));
      const preparedDigest = preparedReference?.slice('prepared-journal:'.length);
      if (!preparedDigest || !DIGEST_PATTERN.test(preparedDigest)
        || !sameBoundary(
          boundary,
          boundaryReceipt(lease.transactionDigest, preparedDigest, inspected.quarantine),
        )) {
        throw new Error('Execution effect boundary receipt mismatch');
      }
      const completed = completeExecutionLockIrreversibleBoundary(
        canonicalProjectRoot,
        lock,
        {
          quarantineId: boundary.boundaryId,
          evidenceRefs: sortedEvidenceRefs([
            `effect-boundary:${boundary.boundaryReceiptDigest}`,
            journalEvidence('committed', committedJournalDigest),
            terminalEvidence('COMPLETED'),
            transactionEvidence(lease.transactionDigest),
          ]),
        },
        lockOptions,
      );
      lockByTransaction.delete(lease.transactionDigest);
      if (completed.projectionCleanup !== 'completed') {
        throw new Error('Execution effect terminal projection cleanup is uncertain');
      }
      const terminal = readTerminal(lease.transactionDigest, committedJournalDigest);
      if (!terminal || terminal.terminal !== 'COMPLETED') {
        throw new Error('Execution effect terminal audit could not be reread');
      }
      return terminal;
    },
    releaseNoChange(
      lease: ExecutionEffectLandingLeaseV1,
      committedJournalDigest: string,
    ): ExecutionEffectLandingLeaseTerminalV1 {
      requireDigest(committedJournalDigest, 'committed journal digest');
      const lock = requireCurrentLease(lease);
      const boundaryId = deterministicBoundaryId(lease.transactionDigest);
      const completed = completeExecutionLockNoChangeBoundary(
        canonicalProjectRoot,
        lock,
        {
          quarantineId: boundaryId,
          boundaryEvidenceRefs: sortedEvidenceRefs([
            journalEvidence('committed', committedJournalDigest),
            transactionEvidence(lease.transactionDigest),
          ]),
          completionEvidenceRefs: sortedEvidenceRefs([
            journalEvidence('committed', committedJournalDigest),
            terminalEvidence('RELEASED_NO_CHANGE'),
            transactionEvidence(lease.transactionDigest),
          ]),
        },
        lockOptions,
      );
      lockByTransaction.delete(lease.transactionDigest);
      if (completed.projectionCleanup !== 'completed') {
        throw new Error('Execution effect no-change projection cleanup is uncertain');
      }
      const terminal = readTerminal(lease.transactionDigest, committedJournalDigest);
      if (!terminal || terminal.terminal !== 'RELEASED_NO_CHANGE') {
        throw new Error('Execution effect no-change terminal audit could not be reread');
      }
      return terminal;
    },
    readTerminal,
  });
}
