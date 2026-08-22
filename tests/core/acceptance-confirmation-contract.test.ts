import { describe, expect, it } from 'vitest';
import {
  acceptanceConfirmationDigest,
  acceptanceConfirmationExactBytesDigest,
  applyAcceptanceConfirmationReceipt,
  canonicalAcceptanceConfirmationJson,
  createAcceptanceConfirmationTerminalEvent,
  deriveAcceptanceConfirmationId,
  parseAcceptanceConfirmationLineage,
  prepareAcceptanceConfirmationReceipt,
  readAcceptanceConfirmationLineage,
  validateAcceptanceConfirmationReceipt,
  verifyAcceptanceConfirmationTerminalEvent,
} from '../../src/core/acceptance-confirmation-contract.js';

const sha = (character: string) => character.repeat(64);
const lineage = {
  tenantId: 'tenant-a', projectId: 'project-a', sprintId: 'sprint-616', taskId: 'task-001',
  attemptId: 'attempt-2', generation: 3, evaluationDigest: sha('d'),
  resultDigest: sha('a'), policyDigest: sha('b'), sourceDigest: sha('c'),
};
const terminalAt = '2026-08-21T12:00:00.000Z';
const preparedAt = '2026-08-21T12:00:01.000Z';
const appliedAt = '2026-08-21T12:00:02.000Z';

function terminal() {
  const result = createAcceptanceConfirmationTerminalEvent({ lineage, decision: 'ACCEPTED', terminalAt });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
function prepared() {
  const result = prepareAcceptanceConfirmationReceipt({
    terminalEvent: terminal(), preparedAt, expectedLineage: lineage,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('canonical acceptance confirmation contract v2', () => {
  it('pins canonical JSON and deterministic confirmation identity to every lineage byte', () => {
    expect(canonicalAcceptanceConfirmationJson({ z: [1, true], a: { y: 'x', b: null } }))
      .toBe('{"a":{"b":null,"y":"x"},"z":[1,true]}');
    expect(acceptanceConfirmationDigest({ z: 1, a: 2 }))
      .toBe(acceptanceConfirmationDigest({ a: 2, z: 1 }));
    expect(deriveAcceptanceConfirmationId(lineage)).toMatch(/^[a-f0-9]{64}$/u);
    for (const change of [
      { tenantId: 'tenant-b' }, { projectId: 'project-b' }, { sprintId: 'sprint-617' }, { taskId: 'task-002' },
      { attemptId: 'attempt-3' }, { generation: 4 }, { evaluationDigest: sha('e') },
      { resultDigest: sha('e') }, { policyDigest: sha('e') }, { sourceDigest: sha('e') },
    ]) {
      expect(deriveAcceptanceConfirmationId({ ...lineage, ...change }))
        .not.toBe(deriveAcceptanceConfirmationId(lineage));
    }
  });

  it('creates and independently verifies a digest-bound terminal event', () => {
    const event = terminal();
    expect(event).toMatchObject({
      schemaVersion: 2,
      type: 'ACCEPTANCE_CONFIRMATION_TERMINAL',
      confirmationId: deriveAcceptanceConfirmationId(lineage),
    });
    expect(verifyAcceptanceConfirmationTerminalEvent(event, lineage)).toEqual({ ok: true, value: event });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.lineage)).toBe(true);
    expect(verifyAcceptanceConfirmationTerminalEvent({ ...event, decision: 'REJECTED' }))
      .toMatchObject({ ok: false, error: { reasonCode: 'EVENT_DIGEST_MISMATCH' } });
  });

  it('defines the only receipt lifecycle as immutable PREPARED then APPLIED evidence', () => {
    const first = prepared();
    expect(first.state).toBe('PREPARED');
    const result = applyAcceptanceConfirmationReceipt({
      preparedReceipt: first, appliedAt, expectedLineage: lineage,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ state: 'APPLIED', preparedReceiptDigest: first.receiptDigest });
    expect(Object.isFrozen(result.value.terminalEvent.lineage)).toBe(true);
    expect(validateAcceptanceConfirmationReceipt(result.value, lineage)).toEqual(result);
    expect(applyAcceptanceConfirmationReceipt({ preparedReceipt: result.value, appliedAt }))
      .toMatchObject({ ok: false, error: { reasonCode: 'STATE_TRANSITION_INVALID' } });
  });

  it('strictly rejects unknown fields, lossy identifiers, non-UTC time, and uppercase digests', () => {
    expect(parseAcceptanceConfirmationLineage({ ...lineage, localAlias: 'x' }))
      .toMatchObject({ ok: false, error: { reasonCode: 'LINEAGE_INVALID', issues: ['<root>'] } });
    expect(parseAcceptanceConfirmationLineage({ ...lineage, tenantId: `t${'x'.repeat(200)}` }).ok).toBe(false);
    expect(parseAcceptanceConfirmationLineage({ ...lineage, tenantId: ' tenant-a ' }).ok).toBe(false);
    expect(parseAcceptanceConfirmationLineage({ ...lineage, resultDigest: sha('A') }).ok).toBe(false);
    expect(createAcceptanceConfirmationTerminalEvent({
      lineage, decision: 'ACCEPTED', terminalAt: '2026-08-21T14:00:00+02:00',
    }).ok).toBe(false);
  });

  it.each([
    ['tenantId', { tenantId: 'tenant-b' }, 'IDENTITY_MISMATCH'],
    ['projectId', { projectId: 'project-b' }, 'IDENTITY_MISMATCH'],
    ['sprintId', { sprintId: 'sprint-617' }, 'IDENTITY_MISMATCH'],
    ['taskId', { taskId: 'task-002' }, 'IDENTITY_MISMATCH'],
    ['attemptId', { attemptId: 'attempt-3' }, 'IDENTITY_MISMATCH'],
    ['generation', { generation: 4 }, 'IDENTITY_MISMATCH'],
    ['evaluationDigest', { evaluationDigest: sha('e') }, 'EVALUATION_DIGEST_MISMATCH'],
    ['resultDigest', { resultDigest: sha('d') }, 'RESULT_DIGEST_MISMATCH'],
    ['policyDigest', { policyDigest: sha('d') }, 'POLICY_DIGEST_MISMATCH'],
    ['sourceDigest', { sourceDigest: sha('d') }, 'SOURCE_DIGEST_MISMATCH'],
  ] as const)('fails closed for expected-lineage %s mismatch', (_field, change, reasonCode) => {
    expect(validateAcceptanceConfirmationReceipt(prepared(), { ...lineage, ...change }))
      .toMatchObject({ ok: false, error: { reasonCode } });
  });

  it('rejects receipt tampering and timestamp regression', () => {
    const receipt = prepared();
    expect(validateAcceptanceConfirmationReceipt({ ...receipt, preparedAt: appliedAt }))
      .toMatchObject({ ok: false, error: { reasonCode: 'RECEIPT_DIGEST_MISMATCH' } });
    expect(applyAcceptanceConfirmationReceipt({ preparedReceipt: receipt, appliedAt: terminalAt }))
      .toMatchObject({ ok: false, error: { reasonCode: 'STATE_TRANSITION_INVALID' } });
  });

  it('rejects host-dependent or non-JSON canonicalization hooks', () => {
    expect(() => canonicalAcceptanceConfirmationJson({ value: undefined })).toThrow(TypeError);
    expect(() => canonicalAcceptanceConfirmationJson({ toJSON: () => ({ forged: true }) })).toThrow(TypeError);
    expect(() => canonicalAcceptanceConfirmationJson(new Date(0))).toThrow(TypeError);
  });

  it('round-trips only the full v2 lineage and fails closed on omission or downgrade', () => {
    expect(readAcceptanceConfirmationLineage({ schemaVersion: 2, lineage }))
      .toEqual({ ok: true, value: lineage });
    const { taskId: _taskId, ...missingTask } = lineage;
    expect(parseAcceptanceConfirmationLineage(missingTask).ok).toBe(false);
    expect(readAcceptanceConfirmationLineage({ schemaVersion: 1, lineage: {
      tenantId: lineage.tenantId, projectId: lineage.projectId, attemptId: lineage.attemptId,
      generation: lineage.generation, resultDigest: lineage.resultDigest,
      policyDigest: lineage.policyDigest, sourceDigest: lineage.sourceDigest,
    } })).toMatchObject({ ok: false, error: { reasonCode: 'LINEAGE_INVALID' } });
    expect(readAcceptanceConfirmationLineage({ schemaVersion: 1, lineage: {
      tenantId: lineage.tenantId, projectId: lineage.projectId, attemptId: lineage.attemptId,
      generation: lineage.generation, resultDigest: lineage.resultDigest,
      policyDigest: lineage.policyDigest, sourceDigest: lineage.sourceDigest,
    } }, { sprintId: lineage.sprintId, taskId: lineage.taskId, evaluationDigest: lineage.evaluationDigest }))
      .toEqual({ ok: true, value: lineage });
    expect(readAcceptanceConfirmationLineage({ schemaVersion: 0, lineage }).ok).toBe(false);
  });

  it('digests exact source bytes without whitespace or encoding normalization', () => {
    const compact = new TextEncoder().encode('{"verdict":"GO"}');
    const spaced = new TextEncoder().encode('{ "verdict": "GO" }');
    expect(acceptanceConfirmationExactBytesDigest(compact)).not.toBe(acceptanceConfirmationExactBytesDigest(spaced));
    expect(acceptanceConfirmationExactBytesDigest(compact)).toBe(acceptanceConfirmationExactBytesDigest(compact));
  });
});
