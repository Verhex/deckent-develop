// ─── Hermetic integration: honest expired-decide response (task 437-005) ────
// End-to-end proof that an approve/reject attempt on an overdue ApprovalRequest
// gets an HONEST typed 'expired' outcome — never a silent decision, never a
// thrown surprise — across all three touched layers: ApprovalBroker.decideChecked
// (core), connectors/callback-router's renderExpiredDecideReply (connector), and
// cli/helpers/messages' en/tr i18n resolution. A single fixed fake clock drives
// every "now" argument; nothing here depends on wall-clock timing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApprovalBroker,
  ApprovalBrokerError,
  isExpiredDecideResult,
  type ApprovalRequestInput,
} from '../../src/core/approval-broker.js';
import { renderExpiredDecideReply, parseApprovalCallback, approvalCallbackData } from '../../src/connectors/callback-router.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

// ─── fixed fake clock ─────────────────────────────────────────────────────────
const CREATED_AT = '2026-07-10T10:00:00.000Z';
const EXPIRES_AT = '2026-07-10T10:15:00.000Z';
const AFTER_EXPIRY = new Date('2026-07-10T10:30:00.000Z');
const BEFORE_EXPIRY = new Date('2026-07-10T10:05:00.000Z');

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'connector', instanceId: 'telegram-437-005' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-437',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

let projectRoot: string;
let storeDir: string;
let broker: ApprovalBroker;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'expired-decide-'));
  storeDir = join(projectRoot, 'approvals');
  broker = new ApprovalBroker(projectRoot, { storeDir, clock: () => BEFORE_EXPIRY });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── decideChecked — honest typed expired outcome ────────────────────────────

describe('expired-decide-response — decideChecked honest expired outcome', () => {
  it('an approve attempt on an overdue request returns typed expired and persists the TTL denial', () => {
    const req = broker.submit(buildRequest('apr-exp-approve'));
    const result = broker.decideChecked(
      req.id,
      { decision: 'allow', decidedBy: 'alperen', channel: 'telegram', decidedAt: AFTER_EXPIRY.toISOString() },
      AFTER_EXPIRY,
    );

    expect(isExpiredDecideResult(result)).toBe(true);
    if (!isExpiredDecideResult(result)) throw new Error('expected expired result');
    expect(result.requestId).toBe(req.id);
    expect(result.expiresAt).toBe(EXPIRES_AT);
    expect(existsSync(join(storeDir, `${req.id}.decision.json`))).toBe(true);
  });

  it('a reject attempt on the same overdue request also returns typed expired and persists the TTL denial', () => {
    const req = broker.submit(buildRequest('apr-exp-reject'));
    const result = broker.decideChecked(
      req.id,
      { decision: 'deny', decidedBy: 'alperen', channel: 'telegram', decidedAt: AFTER_EXPIRY.toISOString() },
      AFTER_EXPIRY,
    );

    expect(isExpiredDecideResult(result)).toBe(true);
    if (!isExpiredDecideResult(result)) throw new Error('expected expired result');
    expect(result.requestId).toBe(req.id);
    expect(existsSync(join(storeDir, `${req.id}.decision.json`))).toBe(true);
  });

  it('a late decide attempt AFTER the TTL sweep already closed it also returns typed expired (never throws, never double-decides)', () => {
    const req = broker.submit(buildRequest('apr-exp-already-swept'));
    broker.expire(AFTER_EXPIRY);
    expect(existsSync(join(storeDir, `${req.id}.decision.json`))).toBe(true);

    const result = broker.decideChecked(
      req.id,
      { decision: 'allow', decidedBy: 'alperen', channel: 'telegram', decidedAt: AFTER_EXPIRY.toISOString() },
      AFTER_EXPIRY,
    );

    expect(isExpiredDecideResult(result)).toBe(true);
    if (!isExpiredDecideResult(result)) throw new Error('expected expired result');
    expect(result.requestId).toBe(req.id);
  });
});

// ─── renderExpiredDecideReply + en/tr message resolution ─────────────────────

describe('expired-decide-response — renderExpiredDecideReply + en/tr message resolution', () => {
  it('resolves the English expired message with expiresAt interpolated', () => {
    const req = broker.submit(buildRequest('apr-exp-en'));
    const result = broker.decideChecked(
      req.id,
      { decision: 'allow', decidedBy: 'a', channel: 'telegram', decidedAt: AFTER_EXPIRY.toISOString() },
      AFTER_EXPIRY,
    );

    const reply = renderExpiredDecideReply(result, 'en');
    expect(reply).toBe(getMessage('approval.decide.expired', 'en', { expiresAt: EXPIRES_AT }));
    expect(reply).toContain(EXPIRES_AT);
    expect(reply?.toLowerCase()).toContain('expired');
  });

  it('resolves the Turkish expired message with expiresAt interpolated', () => {
    const req = broker.submit(buildRequest('apr-exp-tr'));
    const result = broker.decideChecked(
      req.id,
      { decision: 'deny', decidedBy: 'a', channel: 'telegram', decidedAt: AFTER_EXPIRY.toISOString() },
      AFTER_EXPIRY,
    );

    const reply = renderExpiredDecideReply(result, 'tr');
    expect(reply).toBe(getMessage('approval.decide.expired', 'tr', { expiresAt: EXPIRES_AT }));
    expect(reply).toContain(EXPIRES_AT);
    expect(reply).toContain('süresi');
  });

  it('returns null for a normal (non-expired) ApprovalDecision', () => {
    const req = broker.submit(buildRequest('apr-not-expired', { expiresAt: '2099-01-01T00:00:00.000Z' }));
    const result = broker.decideChecked(
      req.id,
      { decision: 'allow', decidedBy: 'a', channel: 'telegram', decidedAt: BEFORE_EXPIRY.toISOString() },
      BEFORE_EXPIRY,
    );

    expect(isExpiredDecideResult(result)).toBe(false);
    expect(renderExpiredDecideReply(result, 'en')).toBeNull();
  });
});

// ─── regression: decideChecked parity with decide() for live requests ───────

describe('expired-decide-response — regression: decideChecked parity with decide() for live requests', () => {
  it('a still-valid request decides identically via decideChecked, and resolves awaitDecision', async () => {
    const req = broker.submit(buildRequest('apr-live-1', { expiresAt: '2099-01-01T00:00:00.000Z' }));
    const waiting = broker.awaitDecision(req.id);

    const result = broker.decideChecked(
      req.id,
      { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: BEFORE_EXPIRY.toISOString() },
      BEFORE_EXPIRY,
    );

    expect(isExpiredDecideResult(result)).toBe(false);
    if (isExpiredDecideResult(result)) throw new Error('unexpected expired result');
    expect(result.decision).toBe('allow');
    expect(result.requestId).toBe(req.id);
    await expect(waiting).resolves.toEqual(result);
  });

  it('decideChecked on an already-decided-by-a-real-channel request still throws APR_ALREADY_DECIDED (not swallowed as expired)', () => {
    const req = broker.submit(buildRequest('apr-already-real', { expiresAt: '2099-01-01T00:00:00.000Z' }));
    broker.decide(req.id, { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: BEFORE_EXPIRY.toISOString() });

    try {
      broker.decideChecked(
        req.id,
        { decision: 'deny', decidedBy: 'b', channel: 'cli', decidedAt: BEFORE_EXPIRY.toISOString() },
        BEFORE_EXPIRY,
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalBrokerError);
      expect((err as ApprovalBrokerError).code).toBe('APR_ALREADY_DECIDED');
    }
  });
});

// ─── end-to-end button-press round trip (connector + broker + i18n) ─────────

describe('expired-decide-response — end-to-end button-press round trip', () => {
  it('approvalCallbackData -> parseApprovalCallback -> decideChecked -> renderExpiredDecideReply round trip for an expired card', () => {
    const req = broker.submit(buildRequest('apr-e2e-expired'));
    const callbackData = approvalCallbackData('approve', req.id);

    const parsed = parseApprovalCallback(callbackData);
    expect(parsed).toMatchObject({ state: 'legacy', action: 'approve', triggerId: req.id });
    if (!parsed) throw new Error('expected parsed callback');

    const result = broker.decideChecked(
      parsed.triggerId,
      { decision: 'allow', decidedBy: 'telegram-user', channel: 'telegram', decidedAt: AFTER_EXPIRY.toISOString() },
      AFTER_EXPIRY,
    );

    const reply = renderExpiredDecideReply(result, 'en');
    expect(reply).toBe(getMessage('approval.decide.expired', 'en', { expiresAt: EXPIRES_AT }));
  });

  it('a still-open card round-trips to a normal ack (renderExpiredDecideReply returns null)', () => {
    const req = broker.submit(buildRequest('apr-e2e-live', { expiresAt: '2099-01-01T00:00:00.000Z' }));
    const callbackData = approvalCallbackData('reject', req.id);
    const parsed = parseApprovalCallback(callbackData);
    if (!parsed) throw new Error('expected parsed callback');

    const result = broker.decideChecked(
      parsed.triggerId,
      { decision: 'deny', decidedBy: 'telegram-user', channel: 'telegram', decidedAt: BEFORE_EXPIRY.toISOString() },
      BEFORE_EXPIRY,
    );

    expect(renderExpiredDecideReply(result, 'en')).toBeNull();
  });
});
