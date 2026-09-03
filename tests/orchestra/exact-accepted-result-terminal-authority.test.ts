import { describe, expect, it } from 'vitest';

import type { TaskAttemptCustodyIdentityV2 } from '../../src/core/task-attempt-custody-store.js';
import {
  isExactAcceptedResultTerminalAuthorityV2,
  type ExactAcceptedResultTerminalAuthorityV2,
} from '../../src/orchestra/exact-accepted-result-terminal-authority.js';
import type {
  ExactAcceptedTaskResultAuthorityMetadata,
  ExactTaskResultAuthorityMetadata,
} from '../../src/orchestra/task-result-authority.js';

const digest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

function identity(taskId = '900-001', attemptId = 'attempt-a'): TaskAttemptCustodyIdentityV2 {
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

function fixture(
  taskId = '900-001',
  attemptId = 'attempt-a',
  verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' = 'NO_GO',
): {
  accepted: ExactAcceptedTaskResultAuthorityMetadata;
  authority: ExactAcceptedResultTerminalAuthorityV2;
} {
  const exactIdentity = identity(taskId, attemptId);
  const accepted: ExactAcceptedTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity: exactIdentity,
    admissionReceiptDigest: digest('1'),
    acceptedResultRef: {
      schemaVersion: 2,
      kind: 'task-accepted-result-v2-ref',
      identity: exactIdentity,
      artifactKey: 'accepted-result',
      artifactReceiptDigest: digest('2'),
    },
    acceptedResultChainDigest: digest('3'),
    resultDigest: digest('4'),
  };
  const terminal: ExactTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity: exactIdentity,
    admissionReceiptDigest: accepted.admissionReceiptDigest,
    settlementRef: {
      schemaVersion: 2,
      kind: 'task-result-settlement-v2-ref',
      identity: exactIdentity,
      artifactKey: 'settlement',
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
      artifactSha256: digest('a'),
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
    accepted,
    authority: {
      schemaVersion: 2,
      kind: 'exact-accepted-result-terminal-authority-v2',
      acceptedAuthority: accepted,
      terminalResultAuthority: terminal,
      terminalDecisionAuthority: {
        schemaVersion: 2,
        kind: 'exact-task-terminal-decision-authority-v2',
        identity: exactIdentity,
        evaluationReceipt: {
          verdict,
          artifactReceiptDigest: terminal.evaluationArtifact.artifactReceiptDigest,
          artifactSha256: terminal.evaluationArtifact.artifactSha256,
          byteLength: terminal.evaluationArtifact.byteLength,
          chainDigest: terminal.evaluationChainDigest,
        },
        finalizerReceipt: {
          state: 'terminal-ready',
          artifactReceiptDigest: terminal.finalizerArtifact.artifactReceiptDigest,
          artifactSha256: terminal.finalizerArtifact.artifactSha256,
          byteLength: terminal.finalizerArtifact.byteLength,
          chainDigest: terminal.finalizerChainDigest,
        },
      },
    },
  };
}

describe('exact accepted-result terminal authority parser', () => {
  it('accepts the single fully bound accepted/evaluation/finalizer authority', () => {
    const { accepted, authority } = fixture();
    expect(isExactAcceptedResultTerminalAuthorityV2(authority, accepted)).toBe(true);
  });

  it('rejects a sibling attempt and a changed artifact digest', () => {
    const { accepted, authority } = fixture();
    const sibling = fixture(accepted.identity.taskId, 'attempt-b').authority;
    expect(isExactAcceptedResultTerminalAuthorityV2(sibling, accepted)).toBe(false);
    expect(isExactAcceptedResultTerminalAuthorityV2({
      ...authority,
      terminalDecisionAuthority: {
        ...authority.terminalDecisionAuthority,
        evaluationReceipt: {
          ...authority.terminalDecisionAuthority.evaluationReceipt,
          artifactSha256: digest('d'),
        },
      },
    }, accepted)).toBe(false);
  });

  it('rejects a foreign terminal-decision schema or kind even when receipts match', () => {
    const { accepted, authority } = fixture();
    expect(isExactAcceptedResultTerminalAuthorityV2({
      ...authority,
      terminalDecisionAuthority: {
        ...authority.terminalDecisionAuthority,
        schemaVersion: 3,
      },
    }, accepted)).toBe(false);
    expect(isExactAcceptedResultTerminalAuthorityV2({
      ...authority,
      terminalDecisionAuthority: {
        ...authority.terminalDecisionAuthority,
        kind: 'foreign-terminal-decision-authority',
      },
    }, accepted)).toBe(false);
    expect(() => isExactAcceptedResultTerminalAuthorityV2({
      ...authority,
      terminalDecisionAuthority: null,
    }, accepted)).not.toThrow();
    expect(isExactAcceptedResultTerminalAuthorityV2({
      ...authority,
      terminalDecisionAuthority: null,
    }, accepted)).toBe(false);
  });

  it('rejects getters, proxies and cyclic authority values without invoking them', () => {
    const { accepted, authority } = fixture();
    let getterCalled = false;
    const getterAuthority = { ...authority } as Record<string, unknown>;
    Object.defineProperty(getterAuthority, 'kind', {
      enumerable: true,
      get: () => {
        getterCalled = true;
        return authority.kind;
      },
    });
    expect(isExactAcceptedResultTerminalAuthorityV2(getterAuthority, accepted)).toBe(false);
    expect(getterCalled).toBe(false);
    expect(isExactAcceptedResultTerminalAuthorityV2(new Proxy(authority, {}), accepted)).toBe(false);

    const cyclic = { ...authority } as Record<string, unknown>;
    (cyclic.terminalDecisionAuthority as Record<string, unknown>).cycle = cyclic;
    expect(isExactAcceptedResultTerminalAuthorityV2(cyclic, accepted)).toBe(false);
  });

  it('rejects oversized strings before accepting a structurally similar envelope', () => {
    const { accepted, authority } = fixture();
    expect(isExactAcceptedResultTerminalAuthorityV2({
      ...authority,
      acceptedAuthority: {
        ...authority.acceptedAuthority,
        acceptedResultRef: {
          ...authority.acceptedAuthority.acceptedResultRef,
          artifactKey: 'x'.repeat(40 * 1024),
        },
      },
    }, accepted)).toBe(false);
  });
});
