// ─── Hermetic integration: expiry-sweep cross-process (task 437-005) ────────
// End-to-end proof of the ApprovalStore disk-TTL-sweep layer + its real
// production read-path wiring (createApprovalStoreWatch's default sweep,
// approval-store-watch.ts). Every fixture is written directly to a tmpdir via
// the REAL contract schemas (approvalRequestSchema/approvalDecisionSchema),
// never through a live broker — simulating request/decision files a PRIOR
// process already left on disk. A single fixed fake clock drives every
// assertion; nothing here depends on wall-clock timing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  approvalRequestSchema,
  approvalDecisionSchema,
  type ApprovalRequest,
  type ApprovalDecision,
} from '../../src/core/approval-contract.js';
import { ApprovalStore } from '../../src/core/approval-store.js';
import { createApprovalStoreWatch, type ApprovalStoreWatchFsWatcher } from '../../src/core/approval-store-watch.js';
import type { ApprovalRequestInput, ApprovalDecisionInput } from '../../src/core/approval-broker.js';

// ─── fixed fake clock (no wall-clock dependency anywhere in this file) ───────
const CREATED_AT = '2026-07-10T10:00:00.000Z';
const OVERDUE_EXPIRES_AT = '2026-07-10T10:10:00.000Z'; // 10 min TTL — well before FIXED_NOW
const VALID_EXPIRES_AT = '2026-07-10T11:00:00.000Z'; // 1h TTL — still open at FIXED_NOW
const FIXED_NOW = new Date('2026-07-10T10:30:00.000Z'); // 20 min past OVERDUE_EXPIRES_AT

// ─── fixture generator — REAL contract schema, direct disk write (no broker) ─

function requestFixture(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequest {
  return approvalRequestSchema.parse({
    id,
    requester: { role: 'worker', instanceId: 'w-437-005' },
    summary: `hermetic fixture ${id}`,
    details: { note: 'fixture' },
    scopeId: 'sprint-437',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: OVERDUE_EXPIRES_AT,
    ...overrides,
  });
}

function decisionFixture(requestId: string, overrides: Partial<ApprovalDecisionInput> = {}): ApprovalDecision {
  return approvalDecisionSchema.parse({
    requestId,
    decision: 'allow',
    decidedBy: 'alperen',
    channel: 'terminal',
    decidedAt: FIXED_NOW.toISOString(),
    ...overrides,
  });
}

function writeRequestFixture(dir: string, request: ApprovalRequest): void {
  writeFileSync(join(dir, `${request.id}.request.json`), JSON.stringify(request, null, 2) + '\n', 'utf-8');
}

function writeDecisionFixture(dir: string, decision: ApprovalDecision): void {
  writeFileSync(join(dir, `${decision.requestId}.decision.json`), JSON.stringify(decision, null, 2) + '\n', 'utf-8');
}

/** Never fires on its own — isolates the attach-time synchronous runScan()
 *  from real fs.watch/poll timing (the poll interval is unref'd and default
 *  1000ms, so it never fires within a synchronous test body anyway). */
const inertWatch: ApprovalStoreWatchFsWatcher = () => ({ close: () => {} });

let projectRoot: string;
let storeDir: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'expiry-sweep-xproc-'));
  storeDir = join(projectRoot, 'approvals');
  mkdirSync(storeDir, { recursive: true });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── read-path sweep via the REAL production wiring ──────────────────────────

describe('expiry-sweep-cross-process — read-path sweep via createApprovalStoreWatch', () => {
  it('closes an overdue fixture with an honest ttl-expire decision and never reports it pending', () => {
    writeRequestFixture(storeDir, requestFixture('apr-overdue-1'));
    writeRequestFixture(storeDir, requestFixture('apr-valid-1', { expiresAt: VALID_EXPIRES_AT }));

    const pendingSeen: string[] = [];
    const decidedSeen: Array<{ id: string; decision: ApprovalDecision }> = [];

    const handle = createApprovalStoreWatch(
      storeDir,
      {
        onPending: (request) => pendingSeen.push(request.id),
        onDecided: (id, decision) => decidedSeen.push({ id, decision }),
      },
      {
        clock: () => FIXED_NOW,
        watch: inertWatch,
      },
    );
    handle.dispose();

    expect(pendingSeen).toEqual(['apr-valid-1']);
    expect(decidedSeen).toHaveLength(1);
    expect(decidedSeen[0]!.id).toBe('apr-overdue-1');
    expect(decidedSeen[0]!.decision.channel).toBe('ttl-expire');
    expect(decidedSeen[0]!.decision.closureReason).toBe('expired');

    const onDisk = JSON.parse(readFileSync(join(storeDir, 'apr-overdue-1.decision.json'), 'utf-8')) as ApprovalDecision;
    expect(onDisk.channel).toBe('ttl-expire');

    const snapshot = ApprovalStore.load(storeDir, FIXED_NOW);
    expect(snapshot.pending.map((e) => e.request.id)).toEqual(['apr-valid-1']);
    expect(snapshot.expired.map((e) => e.request.id)).toEqual(['apr-overdue-1']);
  });
});

// ─── idempotent double-sweep ──────────────────────────────────────────────────

describe('ApprovalStore.sweepExpired — idempotent double sweep', () => {
  it('a second sweepExpired() call on the same instance closes nothing new and leaves the decision byte-identical', () => {
    writeRequestFixture(storeDir, requestFixture('apr-overdue-2'));
    const store = new ApprovalStore(projectRoot, { storeDir });

    const first = store.sweepExpired(FIXED_NOW);
    expect(first).toEqual(['apr-overdue-2']);
    const afterFirst = readFileSync(join(storeDir, 'apr-overdue-2.decision.json'), 'utf-8');

    const second = store.sweepExpired(FIXED_NOW);
    expect(second).toEqual([]);
    const afterSecond = readFileSync(join(storeDir, 'apr-overdue-2.decision.json'), 'utf-8');

    expect(afterSecond).toBe(afterFirst);
  });
});

// ─── concurrent two-instance race ─────────────────────────────────────────────

describe('ApprovalStore.sweepExpired — concurrent two-instance race', () => {
  it('two independent ApprovalStore instances sharing storeDir converge to exactly one decision file, no throw', () => {
    writeRequestFixture(storeDir, requestFixture('apr-overdue-race'));

    const storeA = new ApprovalStore(projectRoot, { storeDir });
    const storeB = new ApprovalStore(projectRoot, { storeDir });

    let sweptA: string[] = [];
    let sweptB: string[] = [];
    expect(() => {
      sweptA = storeA.sweepExpired(FIXED_NOW);
    }).not.toThrow();
    expect(() => {
      sweptB = storeB.sweepExpired(FIXED_NOW);
    }).not.toThrow();

    expect(sweptA).toEqual(['apr-overdue-race']);
    // storeB's own sweepExpired() re-indexes FIRST, so it observes storeA's
    // already-written decision and correctly no-ops — never a duplicate close.
    expect(sweptB).toEqual([]);

    const decisionFiles = readdirSync(storeDir).filter((f) => f.endsWith('.decision.json'));
    expect(decisionFiles).toEqual(['apr-overdue-race.decision.json']);
    const tmpFiles = readdirSync(storeDir).filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toEqual([]);

    expect(storeA.load().expired.map((e) => e.request.id)).toEqual(['apr-overdue-race']);
    expect(storeB.load().expired.map((e) => e.request.id)).toEqual(['apr-overdue-race']);
  });
});

// ─── regression controls ──────────────────────────────────────────────────────

describe('ApprovalStore.sweepExpired — regression controls', () => {
  it('leaves a still-valid pending fixture untouched', () => {
    writeRequestFixture(storeDir, requestFixture('apr-valid-2', { expiresAt: VALID_EXPIRES_AT }));
    const store = new ApprovalStore(projectRoot, { storeDir });

    const swept = store.sweepExpired(FIXED_NOW);
    expect(swept).toEqual([]);
    expect(store.load().pending.map((e) => e.request.id)).toEqual(['apr-valid-2']);
    expect(existsSync(join(storeDir, 'apr-valid-2.decision.json'))).toBe(false);
  });

  it('never re-decides an already-decided (non-ttl) fixture, even one whose request has since elapsed', () => {
    writeRequestFixture(storeDir, requestFixture('apr-decided-1', { expiresAt: OVERDUE_EXPIRES_AT }));
    const originalDecision = decisionFixture('apr-decided-1', { decision: 'allow', channel: 'cli', decidedBy: 'alperen' });
    writeDecisionFixture(storeDir, originalDecision);

    const store = new ApprovalStore(projectRoot, { storeDir });
    const swept = store.sweepExpired(FIXED_NOW);

    expect(swept).toEqual([]);
    const onDisk = JSON.parse(readFileSync(join(storeDir, 'apr-decided-1.decision.json'), 'utf-8'));
    expect(onDisk).toEqual(originalDecision);
    expect(store.load().approved.map((e) => e.request.id)).toEqual(['apr-decided-1']);
  });
});
