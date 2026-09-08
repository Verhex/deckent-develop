import { SpawnBackendRecoveryHoldError } from './spawn-backend.js';

const MAX_HOLDS = 8;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9_]{0,95}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const AUTHORITY_STATES = [
  'ADMISSION_DISCOVERY_REJECTED', 'RESERVED_PENDING_ADMISSION', 'DISPATCH_ABSENT',
  'DISPATCH_TRANSITION_PENDING', 'DISPATCH_AMBIGUOUS', 'DISPATCH_TERMINAL', 'RECOVERY_ENTRY_FAILED',
];
const REASON_CODES = [
  'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'ADMISSION_RECONCILIATION_REQUIRED',
  'PRE_PROVIDER_RECONCILIATION_REQUIRED', 'TERMINAL_RECONCILIATION_REQUIRED', 'ENTRY_RECONCILIATION_FAILED',
];

/** Never invoke a diagnostic field getter or serialize unapproved properties. */
function field(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

/** Bounded, path-free diagnostic text for the existing failure detail fields.
 * This is evidence only, never lifecycle or recovery authority. Non-recovery
 * errors return null so callers preserve their existing error behavior. */
export function formatSpawnBackendRecoveryDiagnostic(error: unknown): string | null {
  if (!(error instanceof SpawnBackendRecoveryHoldError)) return null;
  try {
    const holds = field(error, 'holds');
    if (!Array.isArray(holds)) return 'SPAWN_BACKEND_RECOVERY_DIAGNOSTIC_INVALID';
    const output: Readonly<Record<string, string | null>>[] = [];
    const inspectedCount = Math.min(holds.length, MAX_HOLDS);
    let invalidCount = 0;
    for (let index = 0; index < inspectedCount; index += 1) {
      const hold: unknown = field(holds, String(index));
      if (!hold || typeof hold !== 'object') { invalidCount += 1; continue; }
      const dispatchRequestId = field(hold, 'dispatchRequestId');
      const taskId = field(hold, 'taskId');
      const admissionRefDigest = field(hold, 'admissionRefDigest');
      const authorityState = field(hold, 'authorityState');
      const reasonCode = field(hold, 'reasonCode');
      const custodyHoldCode = field(hold, 'custodyHoldCode');
      if (field(hold, 'kind') !== 'spawn-backend-recovery-hold' || field(hold, 'backend') !== 'docker'
        || typeof dispatchRequestId !== 'string' || !ID.test(dispatchRequestId)
        || typeof taskId !== 'string' || !ID.test(taskId)
        || !(admissionRefDigest === null || (typeof admissionRefDigest === 'string' && DIGEST.test(admissionRefDigest)))
        || typeof authorityState !== 'string' || !AUTHORITY_STATES.includes(authorityState)
        || typeof reasonCode !== 'string' || !REASON_CODES.includes(reasonCode)
        || !(custodyHoldCode === undefined || (typeof custodyHoldCode === 'string' && CODE.test(custodyHoldCode)))) {
        invalidCount += 1;
        continue;
      }
      output.push(Object.freeze({ kind: 'spawn-backend-recovery-hold', backend: 'docker',
        dispatchRequestId, taskId, admissionRefDigest, authorityState, reasonCode,
        ...(custodyHoldCode === undefined ? {} : { custodyHoldCode }),
      }));
    }
    return JSON.stringify({ code: 'DECKENT_E091:spawn-backend-recovery-hold',
      holds: Object.freeze(output), totalCount: holds.length, invalidCount,
      omittedCount: holds.length - inspectedCount,
    });
  } catch {
    return 'SPAWN_BACKEND_RECOVERY_DIAGNOSTIC_INVALID';
  }
}
