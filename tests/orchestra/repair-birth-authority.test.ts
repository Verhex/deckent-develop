import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { canonicalJson } from '../../src/core/audit-writer.js';
import type { TaskAttemptCustodyIdentityV2 } from '../../src/core/task-attempt-custody-store.js';
import type { ExactAcceptedResultTerminalAuthorityV2 } from '../../src/orchestra/exact-accepted-result-terminal-authority.js';
import {
  isExactRepairBirthAuthorityV1,
  isExactRepairSupersessionAuthorityV1,
  resolveExactRepairBirthAuthority,
  resolveExactRepairSupersessionAuthority,
  type ExactRepairSemanticEvidenceV1,
  type ResolveExactRepairBirthAuthorityInput,
} from '../../src/orchestra/repair-birth-authority.js';
import type {
  ExactAcceptedTaskResultAuthorityMetadata,
  ExactTaskResultAuthorityMetadata,
} from '../../src/orchestra/task-result-authority.js';

const digest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

function repairReceiptDigest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update('deckent:exact-repair-birth:v1', 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function identity(taskId: string, attemptId: string): TaskAttemptCustodyIdentityV2 {
  return {
    schemaVersion: 2,
    backend: 'docker',
    projectRootSha256: 'a'.repeat(64),
    projectId: 'project-a',
    taskId,
    attemptId,
    generation: 1,
  };
}

function terminal(
  taskId: string,
  attemptId: string,
  verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
  evaluationArtifactSha256 = digest('a'),
): ExactAcceptedResultTerminalAuthorityV2 {
  const exactIdentity = identity(taskId, attemptId);
  const accepted: ExactAcceptedTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity: exactIdentity,
    admissionReceiptDigest: digest('1'),
    acceptedResultRef: {
      schemaVersion: 2,
      kind: 'task-accepted-result-v2-ref',
      identity: exactIdentity,
      artifactKey: `accepted-${attemptId}`,
      artifactReceiptDigest: digest('2'),
    },
    acceptedResultChainDigest: digest('3'),
    resultDigest: digest('4'),
  };
  const settled: ExactTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity: exactIdentity,
    admissionReceiptDigest: accepted.admissionReceiptDigest,
    settlementRef: {
      schemaVersion: 2,
      kind: 'task-result-settlement-v2-ref',
      identity: exactIdentity,
      artifactKey: `settlement-${attemptId}`,
      artifactReceiptDigest: digest('5'),
    },
    settlementDigest: digest('6'),
    resultDigest: accepted.resultDigest,
    acceptedResultChainDigest: accepted.acceptedResultChainDigest,
    evaluationChainDigest: digest('7'),
    finalizerChainDigest: digest('8'),
    evaluationArtifact: {
      artifactReceiptDigest: digest('9'),
      chainDigest: digest('7'),
      artifactSha256: evaluationArtifactSha256,
      byteLength: 128,
    },
    finalizerArtifact: {
      artifactReceiptDigest: digest('b'),
      chainDigest: digest('8'),
      artifactSha256: digest('c'),
      byteLength: 96,
    },
  };
  return {
    schemaVersion: 2,
    kind: 'exact-accepted-result-terminal-authority-v2',
    acceptedAuthority: accepted,
    terminalResultAuthority: settled,
    terminalDecisionAuthority: {
      schemaVersion: 2,
      kind: 'exact-task-terminal-decision-authority-v2',
      identity: exactIdentity,
      evaluationReceipt: {
        verdict,
        artifactReceiptDigest: settled.evaluationArtifact.artifactReceiptDigest,
        artifactSha256: settled.evaluationArtifact.artifactSha256,
        byteLength: settled.evaluationArtifact.byteLength,
        chainDigest: settled.evaluationChainDigest,
      },
      finalizerReceipt: {
        state: 'terminal-ready',
        artifactReceiptDigest: settled.finalizerArtifact.artifactReceiptDigest,
        artifactSha256: settled.finalizerArtifact.artifactSha256,
        byteLength: settled.finalizerArtifact.byteLength,
        chainDigest: settled.finalizerChainDigest,
      },
    },
  };
}

function evidence(
  evaluationArtifactSha256 = digest('a'),
  effectEvidenceDigest = digest('f'),
): ExactRepairSemanticEvidenceV1 {
  return {
    schemaVersion: 1,
    kind: 'exact-repair-semantic-evidence-v1',
    acceptanceContractDigest: digest('d'),
    sourceEvaluationArtifactSha256: evaluationArtifactSha256,
    failedCriteria: [
      { criterionId: 'criterion-b', outcome: 'FAILED', evidenceDigest: digest('e') },
      { criterionId: 'criterion-a', outcome: 'MISSING', evidenceDigest: digest('1') },
    ],
    verificationChecks: [
      { commandDigest: digest('2'), outcome: 'FAILED', evidenceDigest: digest('3') },
    ],
    effectEvidenceDigest,
  };
}

function input(overrides: Partial<ResolveExactRepairBirthAuthorityInput> = {}): ResolveExactRepairBirthAuthorityInput {
  return {
    repairKind: 'FIX',
    failureDomain: 'PRODUCT_DEFECT',
    sprintId: 'sprint-900',
    lineageRootTaskId: '900-001',
    failedTaskId: '900-001',
    targetTaskId: '900-001',
    failedTerminalAuthority: terminal('900-001', 'attempt-a', 'NO_GO'),
    targetTerminalAuthority: null,
    evidence: evidence(),
    ...overrides,
  };
}

describe('exact repair birth authority', () => {
  it('admits a deterministic, bounded FIX receipt from immutable semantic evidence', () => {
    const decision = resolveExactRepairBirthAuthority(input());
    expect(decision.state).toBe('admitted');
    if (decision.state !== 'admitted') return;
    expect(decision.authority.childTaskId).toMatch(/^900-001-fix-[a-f0-9]{24}$/u);
    expect(decision.authority.childTaskId.length).toBeLessThanOrEqual(100);
    expect(decision.authority.evidence.failedCriteria.map(item => item.criterionId))
      .toEqual(['criterion-a', 'criterion-b']);
    expect(isExactRepairBirthAuthorityV1(decision.authority)).toBe(true);
  });

  it('keeps the semantic fingerprint stable across accepted attempt identities', () => {
    const first = resolveExactRepairBirthAuthority(input());
    const second = resolveExactRepairBirthAuthority(input({
      failedTerminalAuthority: terminal('900-001', 'attempt-b', 'NO_GO'),
    }));
    expect(first.state).toBe('admitted');
    expect(second.state).toBe('admitted');
    if (first.state !== 'admitted' || second.state !== 'admitted') return;
    expect(second.authority.semanticFailureFingerprint)
      .toBe(first.authority.semanticFailureFingerprint);
    expect(second.authority.childTaskId).toBe(first.authority.childTaskId);
    expect(second.authority.receiptDigest).not.toBe(first.authority.receiptDigest);
  });

  it('returns terminal HOLD for unchanged evidence and admits changed evidence', () => {
    const first = resolveExactRepairBirthAuthority(input());
    expect(first.state).toBe('admitted');
    if (first.state !== 'admitted') return;
    expect(resolveExactRepairBirthAuthority(input({
      failedTaskId: first.authority.childTaskId,
      targetTaskId: first.authority.childTaskId,
      failedTerminalAuthority: terminal(first.authority.childTaskId, 'attempt-b', 'NO_GO'),
      predecessorRepairAuthority: first.authority,
    }))).toMatchObject({
      state: 'hold',
      reasonCode: 'UNCHANGED_EVIDENCE_HOLD',
      semanticFailureFingerprint: first.authority.semanticFailureFingerprint,
    });
    const changed = resolveExactRepairBirthAuthority(input({
      failedTaskId: first.authority.childTaskId,
      targetTaskId: first.authority.childTaskId,
      failedTerminalAuthority: terminal(first.authority.childTaskId, 'attempt-b', 'NO_GO'),
      evidence: evidence(digest('a'), digest('0')),
      predecessorRepairAuthority: first.authority,
    }));
    expect(changed.state).toBe('admitted');
    if (changed.state === 'admitted') {
      expect(changed.authority.predecessorRepairReceiptDigest).toBe(first.authority.receiptDigest);
    }
  });

  it('requires the predecessor to be the immediate same-sprint repair parent', () => {
    const first = resolveExactRepairBirthAuthority(input());
    expect(first.state).toBe('admitted');
    if (first.state !== 'admitted') return;

    expect(resolveExactRepairBirthAuthority(input({
      evidence: evidence(digest('a'), digest('0')),
      predecessorRepairAuthority: first.authority,
    }))).toEqual({ state: 'hold', reasonCode: 'INVALID_PREDECESSOR_AUTHORITY' });
    expect(resolveExactRepairBirthAuthority(input({
      failedTaskId: first.authority.childTaskId,
      targetTaskId: first.authority.childTaskId,
      failedTerminalAuthority: terminal(first.authority.childTaskId, 'attempt-b', 'NO_GO'),
      evidence: evidence(digest('a'), digest('0')),
      predecessorRepairAuthority: null,
    }))).toEqual({ state: 'hold', reasonCode: 'INVALID_PREDECESSOR_AUTHORITY' });
    expect(resolveExactRepairBirthAuthority(input({
      sprintId: 'sprint-foreign',
      failedTaskId: first.authority.childTaskId,
      targetTaskId: first.authority.childTaskId,
      failedTerminalAuthority: terminal(first.authority.childTaskId, 'attempt-b', 'NO_GO'),
      evidence: evidence(digest('a'), digest('0')),
      predecessorRepairAuthority: first.authority,
    }))).toEqual({ state: 'hold', reasonCode: 'INVALID_PREDECESSOR_AUTHORITY' });
  });

  it.each(['AUTHORITY', 'EXECUTION'] as const)(
    'does not spend product repair authority for the %s failure domain',
    failureDomain => {
      expect(resolveExactRepairBirthAuthority(input({ failureDomain }))).toMatchObject({
        state: 'hold',
        reasonCode: 'NON_PRODUCT_FAILURE_HOLD',
      });
    },
  );

  it('requires a NO_GO failed authority and an accepted exact XFIX target', () => {
    expect(resolveExactRepairBirthAuthority(input({
      failedTerminalAuthority: terminal('900-001', 'attempt-a', 'DONE'),
    }))).toEqual({ state: 'hold', reasonCode: 'FAILED_ATTEMPT_NOT_NO_GO' });

    const xfix = resolveExactRepairBirthAuthority(input({
      repairKind: 'XFIX',
      targetTaskId: '900-000',
      targetTerminalAuthority: terminal('900-000', 'attempt-target', 'DONE'),
    }));
    expect(xfix.state).toBe('admitted');
    if (xfix.state === 'admitted') {
      expect(xfix.authority.targetTerminal?.verdict).toBe('DONE');
      expect(xfix.authority.childTaskId).toMatch(/-xfix-/u);

      const differentTarget = resolveExactRepairBirthAuthority(input({
        repairKind: 'XFIX',
        targetTaskId: '900-002',
        targetTerminalAuthority: terminal('900-002', 'attempt-target-b', 'DONE'),
      }));
      expect(differentTarget.state).toBe('admitted');
      if (differentTarget.state === 'admitted') {
        expect(differentTarget.authority.childTaskId).not.toBe(xfix.authority.childTaskId);
      }
    }

    expect(resolveExactRepairBirthAuthority(input({
      repairKind: 'XFIX',
      targetTaskId: '900-000',
      targetTerminalAuthority: terminal('900-000', 'attempt-target', 'NO_GO'),
    }))).toEqual({ state: 'hold', reasonCode: 'TARGET_NOT_ACCEPTED' });
  });

  it('rejects a mismatched evaluation artifact and a tampered persisted receipt', () => {
    expect(resolveExactRepairBirthAuthority(input({
      evidence: evidence(digest('0')),
    }))).toEqual({ state: 'hold', reasonCode: 'INVALID_SEMANTIC_EVIDENCE' });
    const decision = resolveExactRepairBirthAuthority(input());
    expect(decision.state).toBe('admitted');
    if (decision.state !== 'admitted') return;
    expect(isExactRepairBirthAuthorityV1({
      ...decision.authority,
      targetTaskId: 'foreign-task',
    })).toBe(false);
  });

  it('derives a durable supersession receipt only for descendants of an exact accepted repair', () => {
    const first = resolveExactRepairBirthAuthority(input());
    expect(first.state).toBe('admitted');
    if (first.state !== 'admitted') return;
    const second = resolveExactRepairBirthAuthority(input({
      failedTaskId: first.authority.childTaskId,
      targetTaskId: first.authority.childTaskId,
      failedTerminalAuthority: terminal(first.authority.childTaskId, 'attempt-b', 'NO_GO'),
      evidence: evidence(digest('a'), digest('0')),
      predecessorRepairAuthority: first.authority,
    }));
    expect(second.state).toBe('admitted');
    if (second.state !== 'admitted') return;

    const decision = resolveExactRepairSupersessionAuthority({
      sprintId: 'sprint-900',
      lineageRootTaskId: '900-001',
      acceptedResolvingTaskId: first.authority.childTaskId,
      acceptedTerminalAuthority: terminal(first.authority.childTaskId, 'attempt-c', 'DONE'),
      repairBirthAuthorities: [second.authority, first.authority],
    });
    expect(decision.state).toBe('admitted');
    if (decision.state !== 'admitted') return;
    expect(decision.authority.supersededDescendants).toEqual([{
      childTaskId: second.authority.childTaskId,
      repairBirthReceiptDigest: second.authority.receiptDigest,
    }]);
    expect(isExactRepairSupersessionAuthorityV1(decision.authority)).toBe(true);

    const { receiptDigest: _receiptDigest, ...secondBody } = second.authority;
    const disconnectedBody = {
      ...secondBody,
      predecessorRepairReceiptDigest: null,
    };
    const disconnected = {
      ...disconnectedBody,
      receiptDigest: repairReceiptDigest(disconnectedBody),
    };
    expect(isExactRepairBirthAuthorityV1(disconnected)).toBe(false);
    expect(resolveExactRepairSupersessionAuthority({
      sprintId: 'sprint-900',
      lineageRootTaskId: '900-001',
      acceptedResolvingTaskId: first.authority.childTaskId,
      acceptedTerminalAuthority: terminal(first.authority.childTaskId, 'attempt-c', 'DONE'),
      repairBirthAuthorities: [first.authority, disconnected],
    })).toEqual({ state: 'hold', reasonCode: 'INVALID_REPAIR_LINEAGE' });

    expect(resolveExactRepairSupersessionAuthority({
      sprintId: 'sprint-900',
      lineageRootTaskId: '900-001',
      acceptedResolvingTaskId: first.authority.childTaskId,
      acceptedTerminalAuthority: terminal(first.authority.childTaskId, 'attempt-c', 'DONE'),
      repairBirthAuthorities: [second.authority],
    })).toEqual({ state: 'hold', reasonCode: 'INVALID_REPAIR_LINEAGE' });
  });
});
