import { createHash } from 'node:crypto';
import { ReferenceDigestError, type ReferenceScope, type ReferenceDigestPhase } from './reference-digest-types.js';

/** A defines the resume identity. B owns durable writes and state transitions; C binds scratch custody. */
export interface ReferenceJournalIdentity extends ReferenceScope {
  readonly schemaVersion: 1;
  readonly sourceDigest: string;
  readonly partitionVersion: 1;
  readonly descriptorDigest: string;
  /** C: separates user-intent/context programs over an identical immutable source. */
  readonly programDigest?: string;
}
export interface ReferenceDigestJournal {
  readonly identity: ReferenceJournalIdentity;
  readonly phase: ReferenceDigestPhase;
  readonly completedNodeRefs: Readonly<Record<string, string>>;
  readonly settledRequestIds: readonly string[];
}
export function referenceJournalKey(identity: ReferenceJournalIdentity): string {
  const fields = [identity.tenantId, identity.projectId, identity.sessionId, identity.policyDigest,
    identity.sourceDigest, identity.descriptorDigest];
  if (identity.schemaVersion !== 1 || identity.partitionVersion !== 1 || fields.some(v => typeof v !== 'string' || !v.length)
    || (identity.programDigest !== undefined && !/^[a-f0-9]{64}$/.test(identity.programDigest))
    || [identity.policyDigest, identity.sourceDigest, identity.descriptorDigest].some(v => !/^[a-f0-9]{64}$/.test(v))) {
    throw new ReferenceDigestError('REFERENCE_JOURNAL_MISMATCH');
  }
  return createHash('sha256').update(JSON.stringify([1, 1, ...fields, ...(identity.programDigest ? [identity.programDigest] : [])])).digest('hex');
}
/** Matching data alone is not authorization: the caller must reacquire the same scoped store capability. */
export function assertReferenceJournalIdentity(actual: ReferenceJournalIdentity, expected: ReferenceJournalIdentity): void {
  if (referenceJournalKey(actual) !== referenceJournalKey(expected)) throw new ReferenceDigestError('REFERENCE_JOURNAL_MISMATCH');
}
