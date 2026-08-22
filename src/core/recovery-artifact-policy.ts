/**
 * Semantic ownership policy for artifacts consulted during recovery.
 *
 * Filenames are deliberately absent from this contract.  An artifact producer
 * must declare its class and owner; cleanup code must not infer authority from
 * a suffix or glob.
 */

export const RECOVERY_ARTIFACT_POLICY_VERSION = 1 as const;
export const FORCE_ARCHIVE_MANIFEST_VERSION = 1 as const;

export type RecoveryArtifactClass =
  | 'task-residue'
  | 'canonical-resume-checkpoint'
  | 'gate'
  | 'pid-lease'
  | 'terminal-receipt'
  | 'forensic';

export interface RecoveryArtifactOwnerV1 {
  readonly taskId: string;
  readonly attemptId: string;
  readonly fence: string;
}

export interface RecoveryArtifactV1 {
  readonly policyVersion: typeof RECOVERY_ARTIFACT_POLICY_VERSION;
  readonly artifactClass: RecoveryArtifactClass;
  readonly source: string;
  readonly digest: string;
  readonly owner: RecoveryArtifactOwnerV1;
}

export interface RecoveryArtifactSuccessorV1 {
  readonly source: string;
  readonly digest: string;
  readonly owner: RecoveryArtifactOwnerV1;
}

export type RecoveryArtifactRestoreSemantics =
  | 'restore-to-source-if-owner-current'
  | 'evidence-only-never-restore';

export interface ExplicitCheckpointSupersessionV1 {
  readonly policyVersion: typeof RECOVERY_ARTIFACT_POLICY_VERSION;
  readonly supersededDigest: string;
  readonly successor: RecoveryArtifactSuccessorV1;
}

export interface ForceArchiveRequestV1 {
  readonly artifact: RecoveryArtifactV1;
  readonly destination: string;
  readonly requestedBy: string;
  readonly supersession?: ExplicitCheckpointSupersessionV1;
}

export interface ForceArchiveManifestV1 {
  readonly manifestVersion: typeof FORCE_ARCHIVE_MANIFEST_VERSION;
  readonly policyVersion: typeof RECOVERY_ARTIFACT_POLICY_VERSION;
  readonly operation: 'force-archive';
  readonly source: string;
  readonly destination: string;
  readonly digest: string;
  readonly artifactClass: RecoveryArtifactClass;
  readonly owner: RecoveryArtifactOwnerV1;
  readonly successor: RecoveryArtifactSuccessorV1 | null;
  readonly restoreSemantics: RecoveryArtifactRestoreSemantics;
  readonly requestedBy: string;
}

export type RecoveryArtifactPolicyDecision =
  | { readonly allowed: true; readonly manifest: ForceArchiveManifestV1 }
  | {
    readonly allowed: false;
    readonly code:
      | 'POLICY_VERSION_UNSUPPORTED'
      | 'INVALID_ARTIFACT_IDENTITY'
      | 'SOURCE_DESTINATION_COLLISION'
      | 'CHECKPOINT_SUPERSESSION_REQUIRED'
      | 'CHECKPOINT_SUPERSESSION_INVALID';
    readonly explanation: string;
  };

const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validOwner(owner: RecoveryArtifactOwnerV1): boolean {
  return nonEmpty(owner.taskId) && nonEmpty(owner.attemptId) && nonEmpty(owner.fence);
}

function sameOwner(left: RecoveryArtifactOwnerV1, right: RecoveryArtifactOwnerV1): boolean {
  return left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.fence === right.fence;
}

function denied(
  code: Extract<RecoveryArtifactPolicyDecision, { allowed: false }>['code'],
  explanation: string,
): RecoveryArtifactPolicyDecision {
  return { allowed: false, code, explanation };
}

/**
 * Authorizes a force archive and emits the complete, durable move record.
 * This function never deletes an artifact and never decides from its path.
 */
export function evaluateForceArchive(
  request: ForceArchiveRequestV1,
): RecoveryArtifactPolicyDecision {
  const { artifact } = request;
  if (artifact.policyVersion !== RECOVERY_ARTIFACT_POLICY_VERSION) {
    return denied('POLICY_VERSION_UNSUPPORTED', 'The artifact policy version is not supported.');
  }
  if (
    !nonEmpty(artifact.source)
    || !SHA256.test(artifact.digest)
    || !validOwner(artifact.owner)
    || !nonEmpty(request.destination)
    || !nonEmpty(request.requestedBy)
  ) {
    return denied('INVALID_ARTIFACT_IDENTITY', 'Archival requires source, digest, owner, destination, and requester identity.');
  }
  if (artifact.source === request.destination) {
    return denied('SOURCE_DESTINATION_COLLISION', 'Archive source and destination must differ.');
  }

  let successor: RecoveryArtifactSuccessorV1 | null = null;
  if (artifact.artifactClass === 'canonical-resume-checkpoint') {
    const supersession = request.supersession;
    if (!supersession) {
      return denied(
        'CHECKPOINT_SUPERSESSION_REQUIRED',
        'A canonical resume checkpoint remains in place until an explicit successor supersedes it.',
      );
    }
    successor = supersession.successor;
    if (
      supersession.policyVersion !== RECOVERY_ARTIFACT_POLICY_VERSION
      || supersession.supersededDigest !== artifact.digest
      || !nonEmpty(successor.source)
      || successor.source === artifact.source
      || !SHA256.test(successor.digest)
      || successor.digest === artifact.digest
      || !validOwner(successor.owner)
      || successor.owner.taskId !== artifact.owner.taskId
      || sameOwner(successor.owner, artifact.owner)
    ) {
      return denied(
        'CHECKPOINT_SUPERSESSION_INVALID',
        'Checkpoint supersession must name this digest and a distinct, valid successor in the same task lineage.',
      );
    }
  }

  return {
    allowed: true,
    manifest: {
      manifestVersion: FORCE_ARCHIVE_MANIFEST_VERSION,
      policyVersion: RECOVERY_ARTIFACT_POLICY_VERSION,
      operation: 'force-archive',
      source: artifact.source,
      destination: request.destination,
      digest: artifact.digest,
      artifactClass: artifact.artifactClass,
      owner: artifact.owner,
      successor,
      restoreSemantics: artifact.artifactClass === 'terminal-receipt'
        || artifact.artifactClass === 'forensic'
        ? 'evidence-only-never-restore'
        : 'restore-to-source-if-owner-current',
      requestedBy: request.requestedBy,
    },
  };
}

/** The six policy classes are exported for schema and UI exhaustiveness checks. */
export const RECOVERY_ARTIFACT_CLASSES: readonly RecoveryArtifactClass[] = Object.freeze([
  'task-residue',
  'canonical-resume-checkpoint',
  'gate',
  'pid-lease',
  'terminal-receipt',
  'forensic',
]);
