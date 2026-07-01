// ─── ApprovalBroker tests (APR-1, task 351-005) ──────────────────────────────
// Faithful behavior tests for the runtime-wide, EVENT-driven approval broker:
// atomic file-backed persistence, promise-resume on decide(), TTL sweep, and
// the multi-process poll seam (checkForExternalDecisions).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// node:fs is mocked only to give the "atomic write" test control over a single
// renameSync call; every other export passes through to the real implementation
// (see tests/core/host-detector.test.ts comment — vi.spyOn(fs, ...) throws under
// Node's native ESM loader, vi.mock is this project's supported pattern).
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: vi.fn(actual.renameSync),
  };
});

import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApprovalBroker,
  ApprovalBrokerError,
  type ApprovalRequestInput,
} from '../../src/core/approval-broker.js';
import {
  approvalRequestSchema,
  approvalDecisionSchema,
  type ApprovalDecision,
} from '../../src/core/approval-contract.js';

const mockedRenameSync = vi.mocked(renameSync);

const CREATED_AT = '2026-07-01T21:00:00.000Z';
const FIXED_NOW = new Date('2026-07-01T21:05:00.000Z');

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-351-005' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-351',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: '2026-07-01T21:15:00.000Z',
    ...overrides,
  };
}

let projectRoot: string;
let storeDir: string;
let broker: ApprovalBroker;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-broker-'));
  storeDir = join(projectRoot, 'approvals');
  broker = new ApprovalBroker(projectRoot, { storeDir });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── submit ─────────────────────────────────────────────────────────────────

describe('ApprovalBroker.submit', () => {
  it('persists a valid request atomically and emits pending', () => {
    const listener = vi.fn();
    broker.on('pending', listener);

    const req = broker.submit(buildRequest('apr-1'));

    expect(req.id).toBe('apr-1');
    expect(req.version).toBe('1.0');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(req);

    const onDisk = JSON.parse(readFileSync(join(storeDir, 'apr-1.request.json'), 'utf-8'));
    expect(onDisk).toEqual(req);

    // No leftover tmp artifacts after a clean write.
    const leftoverTmp = readdirSync(storeDir).filter((f) => f.endsWith('.tmp'));
    expect(leftoverTmp).toEqual([]);
  });

  it('rejects an invalid request without writing a file or emitting pending', () => {
    const listener = vi.fn();
    broker.on('pending', listener);

    expect(() => broker.submit({} as ApprovalRequestInput)).toThrow(ApprovalBrokerError);
    try {
      broker.submit({} as ApprovalRequestInput);
    } catch (err) {
      expect((err as ApprovalBrokerError).code).toBe('APR_INVALID_REQUEST');
    }

    expect(listener).not.toHaveBeenCalled();
    expect(readdirSync(storeDir)).toEqual([]);
  });

  it('rejects a duplicate id', () => {
    broker.submit(buildRequest('apr-dup'));
    expect(() => broker.submit(buildRequest('apr-dup'))).toThrow(ApprovalBrokerError);
    try {
      broker.submit(buildRequest('apr-dup'));
    } catch (err) {
      expect((err as ApprovalBrokerError).code).toBe('APR_DUPLICATE_ID');
    }
  });
});

// ─── atomic write ─────────────────────────────────────────────────────────────

describe('ApprovalBroker — atomic write', () => {
  it('cleans up the tmp file and leaves no partial request file when rename fails', () => {
    mockedRenameSync.mockImplementationOnce(() => {
      throw new Error('simulated rename failure');
    });

    expect(() => broker.submit(buildRequest('apr-atomic'))).toThrow('simulated rename failure');

    const files = readdirSync(storeDir);
    expect(files.some((f) => f.startsWith('apr-atomic.request.json'))).toBe(false);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);

    // The mock's base implementation still delegates to the real renameSync,
    // so a subsequent submit succeeds normally.
    const req = broker.submit(buildRequest('apr-atomic'));
    expect(req.id).toBe('apr-atomic');
  });
});

// ─── decide + awaitDecision ───────────────────────────────────────────────────

describe('ApprovalBroker.decide / awaitDecision', () => {
  it('resolves the awaiting promise and emits decided', async () => {
    const req = broker.submit(buildRequest('apr-decide-1'));
    const waiting = broker.awaitDecision(req.id);

    const listener = vi.fn();
    broker.on('decided', listener);

    const decision = broker.decide(req.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: FIXED_NOW.toISOString(),
    });

    expect(decision.requestId).toBe(req.id);
    expect(decision.reason).toBe(''); // contract default applied
    expect(listener).toHaveBeenCalledWith(decision, req);
    await expect(waiting).resolves.toEqual(decision);

    const onDisk = JSON.parse(readFileSync(join(storeDir, `${req.id}.decision.json`), 'utf-8'));
    expect(onDisk).toEqual(decision);
  });

  it('awaitDecision resolves immediately when already decided', async () => {
    const req = broker.submit(buildRequest('apr-decide-2'));
    const decision = broker.decide(req.id, {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'cli',
      decidedAt: FIXED_NOW.toISOString(),
    });

    await expect(broker.awaitDecision(req.id)).resolves.toEqual(decision);
  });

  it('rejects deciding an already-decided id', () => {
    const req = broker.submit(buildRequest('apr-decide-3'));
    broker.decide(req.id, {
      decision: 'allow',
      decidedBy: 'a',
      channel: 'cli',
      decidedAt: FIXED_NOW.toISOString(),
    });

    expect(() =>
      broker.decide(req.id, { decision: 'deny', decidedBy: 'b', channel: 'cli', decidedAt: FIXED_NOW.toISOString() }),
    ).toThrow(ApprovalBrokerError);
    try {
      broker.decide(req.id, { decision: 'deny', decidedBy: 'b', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
    } catch (err) {
      expect((err as ApprovalBrokerError).code).toBe('APR_ALREADY_DECIDED');
    }
  });

  it('rejects an invalid decision (unknown decision value)', () => {
    const req = broker.submit(buildRequest('apr-decide-4'));
    expect(() =>
      broker.decide(req.id, {
        decision: 'maybe-later' as never,
        decidedBy: 'a',
        channel: 'cli',
        decidedAt: FIXED_NOW.toISOString(),
      }),
    ).toThrow(ApprovalBrokerError);
  });
});

// ─── expire (TTL sweep) ───────────────────────────────────────────────────────

describe('ApprovalBroker.expire', () => {
  it('auto-decides an expired pending request using its defaultAction', () => {
    const req = broker.submit(buildRequest('apr-expire-1', { defaultAction: 'deny' }));

    const produced = broker.expire(new Date('2026-07-01T21:20:00.000Z'));

    expect(produced).toHaveLength(1);
    expect(produced[0]!.requestId).toBe(req.id);
    expect(produced[0]!.decision).toBe('deny');
    expect(produced[0]!.channel).toBe('ttl-expire');
    expect(produced[0]!.decidedBy).toBe('system');

    expect(broker.list('pending')).toEqual([]);
    expect(broker.list('decided')).toEqual([req]);

    const onDisk = JSON.parse(readFileSync(join(storeDir, `${req.id}.decision.json`), 'utf-8'));
    expect(onDisk.requestId).toBe(req.id);
  });

  it('leaves a not-yet-expired request untouched', () => {
    broker.submit(buildRequest('apr-expire-2', { expiresAt: '2026-07-01T22:00:00.000Z' }));

    const produced = broker.expire(new Date('2026-07-01T21:20:00.000Z'));

    expect(produced).toEqual([]);
    expect(broker.list('pending')).toHaveLength(1);
  });

  it('skips an already-decided request', () => {
    const req = broker.submit(buildRequest('apr-expire-3'));
    broker.decide(req.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });

    const produced = broker.expire(new Date('2026-07-01T21:20:00.000Z'));
    expect(produced).toEqual([]);
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe('ApprovalBroker.list', () => {
  it('filters by pending/decided/all, defaults to pending', () => {
    const r1 = broker.submit(buildRequest('apr-list-1'));
    const r2 = broker.submit(buildRequest('apr-list-2'));
    broker.decide(r2.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });

    expect(broker.list('pending')).toEqual([r1]);
    expect(broker.list('decided')).toEqual([r2]);
    expect(broker.list('all').map((r) => r.id).sort()).toEqual(['apr-list-1', 'apr-list-2']);
    expect(broker.list()).toEqual([r1]);
  });
});

// ─── multi-process poll seam ──────────────────────────────────────────────────

describe('ApprovalBroker.checkForExternalDecisions — second-process-decide simulation', () => {
  it('discovers a decision written directly to the store by another process', async () => {
    const req = broker.submit(buildRequest('apr-ext-1'));
    const waiting = broker.awaitDecision(req.id);
    const listener = vi.fn();
    broker.on('decided', listener);

    // Simulate a foreign process writing the decision file directly — bypassing
    // this broker's decide() entirely.
    const foreignDecision: ApprovalDecision = {
      requestId: req.id,
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'dashboard',
      decidedAt: '2026-07-01T21:10:00.000Z',
      reason: 'approved from dashboard',
    };
    writeFileSync(join(storeDir, `${req.id}.decision.json`), JSON.stringify(foreignDecision), 'utf-8');

    const discovered = broker.checkForExternalDecisions();
    expect(discovered).toEqual([foreignDecision]);
    expect(listener).toHaveBeenCalledWith(foreignDecision, req);
    await expect(waiting).resolves.toEqual(foreignDecision);

    // A second poll must not re-discover / re-emit the same file.
    listener.mockClear();
    expect(broker.checkForExternalDecisions()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('a decision made by a second broker instance (simulated second process) is picked up by the first', async () => {
    const brokerB = new ApprovalBroker(projectRoot, { storeDir });

    const req = broker.submit(buildRequest('apr-ext-2'));
    const waiting = broker.awaitDecision(req.id);

    // brokerB never saw submit() — it represents a second process reading/
    // writing the same shared file store.
    const decision = brokerB.decide(req.id, {
      decision: 'deny',
      decidedBy: 'auditor',
      channel: 'api',
      decidedAt: '2026-07-01T21:11:00.000Z',
    });

    expect(broker.checkForExternalDecisions()).toEqual([decision]);
    await expect(waiting).resolves.toEqual(decision);
  });

  it('marks a malformed foreign decision file as seen so it never retry-loops', () => {
    writeFileSync(join(storeDir, 'garbage-id.decision.json'), JSON.stringify({ not: 'a decision' }), 'utf-8');

    expect(broker.checkForExternalDecisions()).toEqual([]);
    expect(broker.checkForExternalDecisions()).toEqual([]);
  });

  it('does not mark a torn (invalid JSON) decision file as seen — retries once the write completes', () => {
    const path = join(storeDir, 'apr-torn.decision.json');
    writeFileSync(path, '{"requestId": "apr-torn", "decision":', 'utf-8'); // torn mid-write JSON

    expect(broker.checkForExternalDecisions()).toEqual([]);

    const full: ApprovalDecision = {
      requestId: 'apr-torn',
      decision: 'allow',
      decidedBy: 'x',
      channel: 'cli',
      decidedAt: '2026-07-01T21:12:00.000Z',
      reason: '',
    };
    writeFileSync(path, JSON.stringify(full), 'utf-8');

    expect(broker.checkForExternalDecisions()).toEqual([full]);
  });
});

// ─── contract reuse (no re-definition) ────────────────────────────────────────

describe('ApprovalBroker — contract reuse', () => {
  it('submit()/decide() output validates directly against the approval-contract schemas', () => {
    const req = broker.submit(buildRequest('apr-contract'));
    expect(approvalRequestSchema.safeParse(req).success).toBe(true);

    const decision = broker.decide(req.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: FIXED_NOW.toISOString(),
    });
    expect(approvalDecisionSchema.safeParse(decision).success).toBe(true);
  });
});
