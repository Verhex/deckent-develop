import { describe, expect, it } from 'vitest';

import {
  RECOVERY_ARTIFACT_CLASSES,
  RECOVERY_ARTIFACT_POLICY_VERSION,
  evaluateForceArchive,
  type ForceArchiveRequestV1,
  type RecoveryArtifactClass,
} from '../../src/core/recovery-artifact-policy.js';

const digest = (character: string): string => character.repeat(64);

function request(
  artifactClass: RecoveryArtifactClass,
  overrides: Partial<ForceArchiveRequestV1> = {},
): ForceArchiveRequestV1 {
  return {
    artifact: {
      policyVersion: RECOVERY_ARTIFACT_POLICY_VERSION,
      artifactClass,
      source: `.deckent/runtime/sprint-595/${artifactClass}`,
      digest: digest('a'),
      owner: { taskId: '595-014', attemptId: 'attempt-old', fence: 'fence-old' },
    },
    destination: `.deckent/archive/sprint-595/${artifactClass}`,
    requestedBy: 'recovery-controller',
    ...overrides,
  };
}

describe('recovery artifact ownership policy', () => {
  it('uses an exhaustive versioned semantic class vocabulary', () => {
    expect(RECOVERY_ARTIFACT_POLICY_VERSION).toBe(1);
    expect(RECOVERY_ARTIFACT_CLASSES).toEqual([
      'task-residue',
      'canonical-resume-checkpoint',
      'gate',
      'pid-lease',
      'terminal-receipt',
      'forensic',
    ]);
  });

  it('rejects the Sprint-595 checkpoint-drag class without explicit supersession', () => {
    expect(evaluateForceArchive(request('canonical-resume-checkpoint'))).toEqual({
      allowed: false,
      code: 'CHECKPOINT_SUPERSESSION_REQUIRED',
      explanation: 'A canonical resume checkpoint remains in place until an explicit successor supersedes it.',
    });
  });

  it('moves a checkpoint only when a distinct same-task successor explicitly supersedes its digest', () => {
    const result = evaluateForceArchive(request('canonical-resume-checkpoint', {
      supersession: {
        policyVersion: 1,
        supersededDigest: digest('a'),
        successor: {
          source: '.deckent/runtime/sprint-596/checkpoint.json',
          digest: digest('b'),
          owner: { taskId: '595-014', attemptId: 'attempt-new', fence: 'fence-new' },
        },
      },
    }));

    expect(result).toMatchObject({
      allowed: true,
      manifest: {
        manifestVersion: 1,
        policyVersion: 1,
        operation: 'force-archive',
        source: '.deckent/runtime/sprint-595/canonical-resume-checkpoint',
        destination: '.deckent/archive/sprint-595/canonical-resume-checkpoint',
        digest: digest('a'),
        owner: { taskId: '595-014', attemptId: 'attempt-old', fence: 'fence-old' },
        successor: {
          source: '.deckent/runtime/sprint-596/checkpoint.json',
          digest: digest('b'),
          owner: { taskId: '595-014', attemptId: 'attempt-new', fence: 'fence-new' },
        },
        restoreSemantics: 'restore-to-source-if-owner-current',
      },
    });
  });

  it.each([
    ['wrong superseded digest', { supersededDigest: digest('c') }],
    ['same checkpoint digest', { successorDigest: digest('a') }],
    ['same owner/fence', { sameOwner: true }],
    ['different task lineage', { taskId: 'other-task' }],
  ])('rejects invalid checkpoint supersession: %s', (_label, mutation) => {
    const owner = mutation.sameOwner
      ? { taskId: '595-014', attemptId: 'attempt-old', fence: 'fence-old' }
      : { taskId: mutation.taskId ?? '595-014', attemptId: 'attempt-new', fence: 'fence-new' };
    const result = evaluateForceArchive(request('canonical-resume-checkpoint', {
      supersession: {
        policyVersion: 1,
        supersededDigest: mutation.supersededDigest ?? digest('a'),
        successor: {
          source: '.deckent/runtime/sprint-596/checkpoint.json',
          digest: mutation.successorDigest ?? digest('b'),
          owner,
        },
      },
    }));
    expect(result).toMatchObject({ allowed: false, code: 'CHECKPOINT_SUPERSESSION_INVALID' });
  });

  it.each(['task-residue', 'gate', 'pid-lease'] as const)(
    'archives %s with owner-bound restore semantics and no invented successor',
    artifactClass => {
      expect(evaluateForceArchive(request(artifactClass))).toMatchObject({
        allowed: true,
        manifest: {
          artifactClass,
          successor: null,
          restoreSemantics: 'restore-to-source-if-owner-current',
        },
      });
    },
  );

  it.each(['terminal-receipt', 'forensic'] as const)(
    'keeps archived %s as evidence rather than a resumable artifact',
    artifactClass => {
      expect(evaluateForceArchive(request(artifactClass))).toMatchObject({
        allowed: true,
        manifest: { artifactClass, restoreSemantics: 'evidence-only-never-restore' },
      });
    },
  );

  it('fails closed when identity is incomplete or source equals destination', () => {
    const incomplete = request('task-residue');
    expect(evaluateForceArchive({
      ...incomplete,
      artifact: { ...incomplete.artifact, digest: 'not-a-digest' },
    })).toMatchObject({ allowed: false, code: 'INVALID_ARTIFACT_IDENTITY' });

    expect(evaluateForceArchive({
      ...incomplete,
      destination: incomplete.artifact.source,
    })).toMatchObject({ allowed: false, code: 'SOURCE_DESTINATION_COLLISION' });
  });
});
