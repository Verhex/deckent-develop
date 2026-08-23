/**
 * Fail-closed policy for artifacts found below `recently-works` and `runtime`.
 *
 * The caller supplies a semantic family assigned by the artifact producer. No
 * decision is inferred from a filename and artifact bytes are deliberately not
 * accepted by this API (in particular, token values must never be inspected).
 */

export const RUNTIME_ARTIFACT_CLASSIFIER_VERSION = 1 as const;

export type RuntimeArtifactDisposition =
  | 'preserve'
  | 'archive-then-retire'
  | 'duplicate-retire'
  | 'ephemeral-retire'
  | 'HOLD';

export type RuntimeArtifactFamily =
  | 'database'
  | 'database-wal'
  | 'database-shm'
  | 'token'
  | 'current-status'
  | 'event-stream'
  | 'metrics'
  | 'evaluation'
  | 'decision-log'
  | 'job-record'
  | 'terminal-receipt'
  | 'forensic-record'
  | 'duplicate'
  | 'gate'
  | 'pid-lease'
  | 'heartbeat'
  | 'lock'
  | 'temporary';

export type RuntimeArtifactRoot = 'recently-works' | 'runtime';

export interface RuntimeArtifactBoundary {
  readonly tenantId: string;
  readonly projectId: string;
}

export interface RuntimeArtifactOwner extends RuntimeArtifactBoundary {
  readonly ownerId: string;
}

/** Metadata evidence only. Artifact content is intentionally absent. */
export interface RuntimeArtifactContentEvidence {
  readonly digest: string;
  readonly validated: boolean;
}

export interface RuntimeArtifactLivenessEvidence {
  readonly state: 'live' | 'inactive' | 'unknown';
  readonly observedAt: string;
}

export interface RuntimeArtifactClassificationInput {
  readonly classifierVersion: typeof RUNTIME_ARTIFACT_CLASSIFIER_VERSION;
  readonly root: RuntimeArtifactRoot;
  /** Open string keeps forward compatibility fail-closed for new families. */
  readonly family: RuntimeArtifactFamily | (string & {});
  readonly boundary: RuntimeArtifactBoundary;
  readonly owner: RuntimeArtifactOwner | null;
  readonly expectedOwnerId: string;
  readonly contentEvidence: RuntimeArtifactContentEvidence | null;
  readonly liveness: RuntimeArtifactLivenessEvidence | null;
  /** Required only for the semantic `duplicate` family. */
  readonly duplicateOfDigest?: string;
}

export type RuntimeArtifactClassificationReason =
  | 'durable-family'
  | 'archive-required'
  | 'verified-duplicate'
  | 'verified-ephemeral'
  | 'unknown-family'
  | 'invalid-boundary'
  | 'owner-boundary-mismatch'
  | 'owner-unverified'
  | 'content-unverified'
  | 'live-or-unknown';

export interface RuntimeArtifactClassification {
  readonly disposition: RuntimeArtifactDisposition;
  readonly reason: RuntimeArtifactClassificationReason;
}

const DURABLE_FAMILIES = new Set<string>([
  'database',
  'database-wal',
  'database-shm',
  'token',
  'current-status',
]);

const ARCHIVAL_FAMILIES = new Set<string>([
  'event-stream',
  'metrics',
  'evaluation',
  'decision-log',
  'job-record',
  'terminal-receipt',
  'forensic-record',
]);

const EPHEMERAL_FAMILIES = new Set<string>([
  'gate',
  'pid-lease',
  'heartbeat',
  'lock',
  'temporary',
]);

export const RUNTIME_ARTIFACT_FAMILIES: readonly RuntimeArtifactFamily[] = Object.freeze([
  'database', 'database-wal', 'database-shm', 'token', 'current-status',
  'event-stream', 'metrics', 'evaluation', 'decision-log', 'job-record',
  'terminal-receipt', 'forensic-record', 'duplicate', 'gate', 'pid-lease',
  'heartbeat', 'lock', 'temporary',
]);

const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;

function hold(reason: RuntimeArtifactClassificationReason): RuntimeArtifactClassification {
  return { disposition: 'HOLD', reason };
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Classifies an inventoried artifact using boundary, owner, content-metadata,
 * and liveness evidence. It performs no filesystem operation; retirement code
 * must separately implement the selected, explicit disposition.
 */
export function classifyRuntimeArtifact(
  input: RuntimeArtifactClassificationInput,
): RuntimeArtifactClassification {
  if (!nonEmpty(input.boundary.tenantId) || !nonEmpty(input.boundary.projectId)) {
    return hold('invalid-boundary');
  }

  // These families are never candidates for cleanup, even with missing or
  // contradictory evidence. This check also prevents secret-content probing.
  if (DURABLE_FAMILIES.has(input.family)) {
    return { disposition: 'preserve', reason: 'durable-family' };
  }

  if (!RUNTIME_ARTIFACT_FAMILIES.includes(input.family as RuntimeArtifactFamily)) {
    return hold('unknown-family');
  }

  const owner = input.owner;
  if (!owner) return hold('owner-unverified');
  if (
    owner.tenantId !== input.boundary.tenantId
    || owner.projectId !== input.boundary.projectId
  ) return hold('owner-boundary-mismatch');
  if (!nonEmpty(input.expectedOwnerId) || owner.ownerId !== input.expectedOwnerId) {
    return hold('owner-unverified');
  }

  const content = input.contentEvidence;
  if (!content || !content.validated || !SHA256.test(content.digest)) {
    return hold('content-unverified');
  }
  if (!input.liveness || input.liveness.state !== 'inactive') {
    return hold('live-or-unknown');
  }

  if (ARCHIVAL_FAMILIES.has(input.family)) {
    return { disposition: 'archive-then-retire', reason: 'archive-required' };
  }
  if (input.family === 'duplicate') {
    if (!input.duplicateOfDigest || input.duplicateOfDigest !== content.digest) {
      return hold('content-unverified');
    }
    return { disposition: 'duplicate-retire', reason: 'verified-duplicate' };
  }
  if (EPHEMERAL_FAMILIES.has(input.family)) {
    return { disposition: 'ephemeral-retire', reason: 'verified-ephemeral' };
  }

  return hold('unknown-family');
}
