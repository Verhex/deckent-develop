import { describe, expect, it } from 'vitest';
import { SpawnBackendRecoveryHoldError, type SpawnBackendRecoveryHold } from '../../src/orchestra/spawn-backend.js';
import { formatSpawnBackendRecoveryDiagnostic } from '../../src/orchestra/spawn-backend-recovery-diagnostic.js';

function hold(): SpawnBackendRecoveryHold {
  return { kind: 'spawn-backend-recovery-hold', backend: 'docker', dispatchRequestId: 'dispatch-720',
    taskId: '720-001', admissionRefDigest: `sha256:${'a'.repeat(64)}`,
    authorityState: 'ADMISSION_DISCOVERY_REJECTED', reasonCode: 'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE',
    custodyHoldCode: 'IDENTITY_MISMATCH' };
}

describe('spawn backend recovery diagnostic', () => {
  it('preserves typed evidence without changing Error.message or serializing extra properties', () => {
    const entry = { ...hold(), prompt: '/private/secret', exception: new Error('credential') };
    const error = new SpawnBackendRecoveryHoldError([entry]);
    const text = formatSpawnBackendRecoveryDiagnostic(error)!;
    expect(JSON.parse(text)).toMatchObject({ holds: [hold()], totalCount: 1, invalidCount: 0, omittedCount: 0 });
    expect(text).not.toMatch(/private|secret|credential|exception|prompt/);
    expect(error.message).toBe('DECKENT_E091:spawn-backend-recovery-hold');
    entry.taskId = 'changed';
    expect(JSON.parse(text).holds[0].taskId).toBe('720-001');
    expect(formatSpawnBackendRecoveryDiagnostic(new Error('ordinary'))).toBeNull();
  });

  it.each(['taskId', 'dispatchRequestId', 'admissionRefDigest', 'authorityState', 'reasonCode', 'custodyHoldCode'])(
    'rejects unsafe %s without echoing it', key => {
      const error = new SpawnBackendRecoveryHoldError([{ ...hold(), [key]: '/private/secret\nraw' }]);
      const text = formatSpawnBackendRecoveryDiagnostic(error)!;
      expect(JSON.parse(text)).toMatchObject({ holds: [], invalidCount: 1 });
      expect(text).not.toContain('secret');
    },
  );

  it('reports truncation explicitly and never evaluates field getters', () => {
    const bad = hold();
    Object.defineProperty(bad, 'taskId', { get: () => { throw new Error('must not read'); } });
    const text = formatSpawnBackendRecoveryDiagnostic(new SpawnBackendRecoveryHoldError([
      bad, ...Array.from({ length: 11 }, hold),
    ]))!;
    expect(JSON.parse(text)).toMatchObject({ totalCount: 12, invalidCount: 1, omittedCount: 4 });
    expect(JSON.parse(text).holds).toHaveLength(7);
    expect(text.length).toBeLessThan(6000);
  });
});
