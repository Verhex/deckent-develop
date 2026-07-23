// ─── APR-CONTRACT — ApprovalRequest / ApprovalDecision contract tests ────────
// Faithful behavior tests for the foundation type module (task 350-004): schema
// shape, per-enum rejection, missing-field detection, expiry ordering, JSON
// round-trip losslessness, and the rawArgs-exclusion guarantee (APR-4).
import { describe, it, expect } from 'vitest';
import {
  approvalLookupIdSchema,
  approvalTombstoneSchema,
  approvalRequestSchema,
  approvalDecisionSchema,
  validateApprovalRequest,
  validateApprovalDecision,
  validateStoredApprovalRequest,
  validateStoredApprovalDecision,
  isApprovalRequest,
  isApprovalDecision,
  APPROVAL_CONTRACT_VERSION,
  ALL_REQUESTER_ROLES,
  ALL_APPROVAL_SCOPES,
  ALL_APPROVAL_RISKS,
  ALL_APPROVAL_POLICIES,
  ALL_APPROVAL_ACTIONS,
  type ApprovalRequest,
  type ApprovalDecision,
} from '../../src/core/approval-contract.js';

const CREATED_AT = '2026-07-01T21:00:00.000Z';
const EXPIRES_AT = '2026-07-01T21:15:00.000Z';

/** A minimal ApprovalRequest carrying every REQUIRED field (defaulted fields omitted). */
function validRequest(): Record<string, unknown> {
  return {
    id: 'apr-350-004-001',
    requester: { role: 'worker', instanceId: 'w-350-004' },
    summary: 'worker-7 wants to run: docker compose down -v',
    details: { command: 'docker compose down -v', cwd: '/workspace' },
    scopeId: 'sprint-350',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
  };
}

function validDecision(): Record<string, unknown> {
  return {
    requestId: 'apr-350-004-001',
    decision: 'allow',
    decidedBy: 'alperen',
    channel: 'terminal',
    decidedAt: EXPIRES_AT,
  };
}

function validAuthorization(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: 'live-session',
    requestDigest: '1'.repeat(64),
    commandDigest: '2'.repeat(64),
    idempotencyKeyHash: '3'.repeat(64),
    actorId: 'alperen',
    tenantId: 'local',
    role: 'owner',
    sessionRefHash: '4'.repeat(64),
    authorityRef: 'terminal-session:v1',
    authenticatedAt: CREATED_AT,
    authExpiresAt: EXPIRES_AT,
    integrityKeyId: 'approval-key-v1',
    integrityMac: '5'.repeat(64),
  };
}

describe('approval-contract — enum shape (spec counts)', () => {
  it('requester role is the 5-value enum', () => {
    expect([...ALL_REQUESTER_ROLES].sort()).toEqual(
      ['auditor', 'brain', 'connector', 'nervous', 'worker'].sort(),
    );
  });

  it('scope is the 7-value enum', () => {
    expect([...ALL_APPROVAL_SCOPES].sort()).toEqual(
      ['credential', 'file-read', 'file-write', 'git-mutation', 'lifecycle', 'network', 'shell-exec'].sort(),
    );
  });

  it('risk is the 5-value enum', () => {
    expect([...ALL_APPROVAL_RISKS].sort()).toEqual(
      ['critical', 'high', 'low', 'medium', 'none'].sort(),
    );
  });

  it('policy is the 4-value enum', () => {
    expect([...ALL_APPROVAL_POLICIES].sort()).toEqual(
      ['auto-approve', 'deny', 'notify', 'require-approval'].sort(),
    );
  });

  it('defaultAction/decision is the 4-value enum', () => {
    expect([...ALL_APPROVAL_ACTIONS].sort()).toEqual(
      ['allow', 'defer', 'deny', 'escalate'].sort(),
    );
  });
});

describe('approval-contract — ApprovalRequest', () => {
  it('accepts only bounded lowercase-ASCII opaque ids', () => {
    for (const id of ['a', 'apr-350-004-001', `a${'b'.repeat(127)}`]) {
      expect(validateApprovalRequest({ ...validRequest(), id }).ok).toBe(true);
    }

    for (const id of [
      '../escape',
      'path/escape',
      'path\\escape',
      '.hidden',
      'trailing.',
      'Uppercase',
      'unicodé',
      'con',
      'con.json',
      'com1.log',
      `a${'b'.repeat(128)}`,
    ]) {
      expect(validateApprovalRequest({ ...validRequest(), id }).ok, id).toBe(false);
    }
  });

  it('reads path-safe legacy v1 ids without authorizing them for new writes', () => {
    for (const id of ['APR-LEGACY-1', 'önceki-kayıt']) {
      expect(validateApprovalRequest({ ...validRequest(), id }).ok, id).toBe(false);
      expect(validateStoredApprovalRequest({ ...validRequest(), id }).ok, id).toBe(true);
      expect(approvalLookupIdSchema.safeParse(id).success, id).toBe(true);
    }
    for (const id of ['../escape', 'path/escape', 'path\\escape', 'con', 'trail.']) {
      expect(validateStoredApprovalRequest({ ...validRequest(), id }).ok, id).toBe(false);
    }
  });

  it('rejects an empty object and lists every required field as missing', () => {
    const res = validateApprovalRequest({});
    expect(res.ok).toBe(false);
    if (res.ok) return; // narrow for TS
    for (const field of [
      'id',
      'requester',
      'summary',
      'details',
      'scopeId',
      'scope',
      'risk',
      'policy',
      'defaultAction',
      'tenantId',
      'userId',
      'createdAt',
      'expiresAt',
    ]) {
      expect(res.missingFields).toContain(field);
    }
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('accepts a full valid request and stamps the contract version', () => {
    const res = validateApprovalRequest(validRequest());
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.errors.join('; '));
    const value: ApprovalRequest = res.value;
    expect(value.version).toBe('1.0');
    expect(APPROVAL_CONTRACT_VERSION).toBe('1.0');
    expect(value.maskedArgs).toBeNull();
    expect(value.rawArgsRef).toBeNull();
  });

  it('rejects an unknown requester.role (enum-guarded, nested path)', () => {
    const bad = validRequest();
    (bad.requester as Record<string, unknown>).role = 'user';
    const res = validateApprovalRequest(bad);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.missingFields).not.toContain('requester.role');
    expect(res.errors.some((e) => e.startsWith('requester.role:'))).toBe(true);
  });

  it('rejects an unknown scope value', () => {
    const res = validateApprovalRequest({ ...validRequest(), scope: 'delete-everything' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.startsWith('scope:'))).toBe(true);
  });

  it('rejects an unknown risk value', () => {
    const res = validateApprovalRequest({ ...validRequest(), risk: 'catastrophic' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.startsWith('risk:'))).toBe(true);
  });

  it('rejects an unknown policy value', () => {
    const res = validateApprovalRequest({ ...validRequest(), policy: 'maybe' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.startsWith('policy:'))).toBe(true);
  });

  it('rejects an unknown defaultAction value', () => {
    const res = validateApprovalRequest({ ...validRequest(), defaultAction: 'ask-again' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.startsWith('defaultAction:'))).toBe(true);
  });

  it('rejects expiresAt equal to createdAt', () => {
    const res = validateApprovalRequest({ ...validRequest(), expiresAt: CREATED_AT });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.startsWith('expiresAt:'))).toBe(true);
  });

  it('rejects expiresAt before createdAt', () => {
    const res = validateApprovalRequest({
      ...validRequest(),
      createdAt: EXPIRES_AT,
      expiresAt: CREATED_AT,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.startsWith('expiresAt:'))).toBe(true);
  });

  it('rejects a non-ISO createdAt/expiresAt', () => {
    const res = validateApprovalRequest({ ...validRequest(), createdAt: 'not-a-date' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.startsWith('createdAt:'))).toBe(true);
  });

  it('flags a missing required sub-field with its dotted path', () => {
    const bad = validRequest();
    delete (bad.requester as Record<string, unknown>).instanceId;
    const res = validateApprovalRequest(bad);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.missingFields).toContain('requester.instanceId');
  });

  it('accepts maskedArgs + rawArgsRef when args are present', () => {
    const res = validateApprovalRequest({
      ...validRequest(),
      maskedArgs: { command: 'docker compose down ****' },
      rawArgsRef: 'redacted-store://sprint-350/apr-350-004-001',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.errors.join('; '));
    expect(res.value.maskedArgs).toEqual({ command: 'docker compose down ****' });
    expect(res.value.rawArgsRef).toBe('redacted-store://sprint-350/apr-350-004-001');
  });

  it('never lets a rawArgs (raw value) key survive validation — strict() rejects it', () => {
    const withRawArgs = {
      ...validRequest(),
      rawArgs: { command: 'docker compose down -v --remove-orphans --secret=hunter2' },
    };
    const res = validateApprovalRequest(withRawArgs);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => /unrecognized/i.test(e) || e.includes('rawArgs'))).toBe(true);
  });

  it('has no rawArgs property on the inferred type (structural proof via keys of a valid parse)', () => {
    const res = validateApprovalRequest(validRequest());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.prototype.hasOwnProperty.call(res.value, 'rawArgs')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(res.value, 'rawArgsRef')).toBe(true);
  });

  it('round-trips losslessly through JSON', () => {
    const res = validateApprovalRequest({
      ...validRequest(),
      maskedArgs: { command: 'docker compose down ****' },
      rawArgsRef: 'redacted-store://sprint-350/apr-350-004-001',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const roundTripped = JSON.parse(JSON.stringify(res.value));
    expect(roundTripped).toEqual(res.value);
  });

  it('isApprovalRequest type guard: true for valid, false for garbage', () => {
    expect(isApprovalRequest(validRequest())).toBe(true);
    expect(isApprovalRequest({})).toBe(false);
    expect(isApprovalRequest(null)).toBe(false);
    expect(isApprovalRequest('not-an-object')).toBe(false);
    expect(isApprovalRequest(42)).toBe(false);
  });

  it('validateApprovalRequest never throws on non-object input', () => {
    expect(() => validateApprovalRequest(null)).not.toThrow();
    expect(() => validateApprovalRequest(undefined)).not.toThrow();
    expect(() => validateApprovalRequest('garbage')).not.toThrow();
    expect(() => validateApprovalRequest(123)).not.toThrow();
    expect(validateApprovalRequest(null).ok).toBe(false);
  });
});

describe('approval-contract — ApprovalDecision', () => {
  it('applies the same cross-platform opaque-id contract to requestId', () => {
    for (const requestId of ['../escape', 'path/escape', 'path\\escape', 'APR-UPPER', 'nul', 'lpt9.txt', 'x.']) {
      expect(validateApprovalDecision({ ...validDecision(), requestId }).ok, requestId).toBe(false);
    }
  });

  it('reads a legacy decision id only through the persisted compatibility validator', () => {
    const legacy = { ...validDecision(), requestId: 'APR-LEGACY-1' };
    expect(validateApprovalDecision(legacy).ok).toBe(false);
    expect(validateStoredApprovalDecision(legacy).ok).toBe(true);
  });

  it('requires tombstone id and embedded winner requestId to match', () => {
    const valid = approvalTombstoneSchema.safeParse({
      version: 1,
      id: 'apr-retired',
      retiredAt: EXPIRES_AT,
      decision: { ...validDecision(), requestId: 'apr-retired' },
    });
    expect(valid.success).toBe(true);

    const mismatched = approvalTombstoneSchema.safeParse({
      version: 1,
      id: 'apr-retired',
      retiredAt: EXPIRES_AT,
      decision: { ...validDecision(), requestId: 'apr-other' },
    });
    expect(mismatched.success).toBe(false);
  });

  it('rejects an empty object and lists every required field as missing', () => {
    const res = validateApprovalDecision({});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    for (const field of ['requestId', 'decision', 'decidedBy', 'channel', 'decidedAt']) {
      expect(res.missingFields).toContain(field);
    }
  });

  it('accepts a full valid decision and defaults reason to empty string', () => {
    const res = validateApprovalDecision(validDecision());
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.errors.join('; '));
    const value: ApprovalDecision = res.value;
    expect(value.reason).toBe('');
  });

  it('accepts an explicit reason', () => {
    const res = validateApprovalDecision({ ...validDecision(), reason: 'looks safe, pre-approved for this sprint' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.reason).toBe('looks safe, pre-approved for this sprint');
  });

  it('round-trips the strict live-session authorization envelope without requiring it on legacy decisions', () => {
    const legacy = validateApprovalDecision(validDecision());
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.value.authorization).toBeUndefined();

    const authorized = validateApprovalDecision({
      ...validDecision(),
      authorization: validAuthorization(),
    });
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) return;
    expect(authorized.value.authorization).toEqual(validAuthorization());
  });

  it('rejects malformed digests, raw session fields, and non-forward auth expiry', () => {
    expect(validateApprovalDecision({
      ...validDecision(),
      authorization: { ...validAuthorization(), requestDigest: 'not-a-digest' },
    }).ok).toBe(false);
    expect(validateApprovalDecision({
      ...validDecision(),
      authorization: { ...validAuthorization(), rawSessionToken: 'secret' },
    }).ok).toBe(false);
    expect(validateApprovalDecision({
      ...validDecision(),
      authorization: { ...validAuthorization(), authExpiresAt: CREATED_AT },
    }).ok).toBe(false);
  });

  it('rejects an unknown decision value', () => {
    const res = validateApprovalDecision({ ...validDecision(), decision: 'maybe-later' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.startsWith('decision:'))).toBe(true);
  });

  it('accepts free-form channel values (not a fixed enum)', () => {
    for (const channel of ['terminal', 'dashboard', 'api', 'slack', 'teams']) {
      const res = validateApprovalDecision({ ...validDecision(), channel });
      expect(res.ok).toBe(true);
    }
  });

  it('rejects a non-ISO decidedAt', () => {
    const res = validateApprovalDecision({ ...validDecision(), decidedAt: 'yesterday' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.startsWith('decidedAt:'))).toBe(true);
  });

  it('round-trips losslessly through JSON', () => {
    const res = validateApprovalDecision({ ...validDecision(), reason: 'approved once' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const roundTripped = JSON.parse(JSON.stringify(res.value));
    expect(roundTripped).toEqual(res.value);
  });

  it('isApprovalDecision type guard: true for valid, false for garbage', () => {
    expect(isApprovalDecision(validDecision())).toBe(true);
    expect(isApprovalDecision({})).toBe(false);
    expect(isApprovalDecision(null)).toBe(false);
    expect(isApprovalDecision([])).toBe(false);
  });
});

describe('approval-contract — raw schema exports (safeParse reachability)', () => {
  it('approvalRequestSchema.safeParse matches validateApprovalRequest', () => {
    expect(approvalRequestSchema.safeParse(validRequest()).success).toBe(true);
  });

  it('approvalDecisionSchema.safeParse matches validateApprovalDecision', () => {
    expect(approvalDecisionSchema.safeParse(validDecision()).success).toBe(true);
  });
});
