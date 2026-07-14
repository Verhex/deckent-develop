// tests/nervous/approval-loop-death.test.ts
//
// APPROVAL-LOOP death-proof suite (sprint-443; Alperen: "reddetsem de kabul
// etsem de aynı onay sürekli geliyor — 25. kez"). Live evidence that drove
// these pins: nervous-history.jsonl showed SCOPE_COLLISION_REORDER executed
// every ~5 minutes, each with a NEW notificationId, on the SAME persisting
// (and dependency-sequenced → legal) condition. If any of these fail, the
// loop class has been reborn — do not weaken them.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Proposer } from '../../src/nervous/proposer.js';
import {
  recordDecision,
  getDecision,
  evaluateSuppression,
  DEFAULT_REJECT_SUPPRESS_MS,
  DEFAULT_ACCEPT_COOLDOWN_MS,
} from '../../src/nervous/decision-memory.js';
import { Executor } from '../../src/nervous/executor.js';
import type { NervousHistory, ActionHandler } from '../../src/nervous/executor.js';
import { runPipeline } from '../../src/nervous/bootstrap.js';
import { DecisionEngine } from '../../src/nervous/decision-engine.js';
import { NervousDispatcher } from '../../src/nervous/dispatcher.js';
import { ScopeCollisionMonitor } from '../../src/nervous/detectors/scope-collision.js';
import type {
  DetectorResult,
  DecisionOutput,
  ActionDefinition,
  NervousSystemConfigV1,
  ObserverEvent,
  ExecutionRecord,
  NervousNotification,
} from '../../src/core/nervous-types.js';

// ─── Helpers (proposer.test.ts idiom) ───────────────────────────────────────

function makeConfig(overrides: Partial<NervousSystemConfigV1> & Record<string, unknown> = {}): NervousSystemConfigV1 {
  return { mode: 'balanced', enabled: true, throttleWindowMs: 300_000, ...overrides };
}

function makeAction(id: string): ActionDefinition {
  return {
    id, displayName: `Action ${id}`, description: 'x', category: 'medium-risk',
    defaultRisk: 'medium', requiredSafetyFloor: [], reversible: true,
  };
}

function makeDecision(actionId: string, policy: DecisionOutput['policy'] = 'suggest-30m'): DecisionOutput {
  return { action: makeAction(actionId), policy, risk: 'medium', isSafetyFloor: false, reason: 'r' };
}

function makeDetectorResult(overrides: Partial<DetectorResult> = {}): DetectorResult {
  return {
    risk: 'medium', shouldNotify: true, severity: 'warning',
    title: 'Scope collision on 1 file(s)',
    message: 'src/orchestra/prompt-god-template.ts → 443-003, 443-004',
    groupKey: 'scope-collision:src/orchestra/prompt-god-template.ts',
    suggestedActions: [{ id: 'SCOPE_COLLISION_REORDER', label: 'Reorder', risk: 'medium', payload: {} }],
    metadata: { type: 'scope-collision' },
    ...overrides,
  };
}

function makeContext(now?: Date) {
  return { detectorId: 'scope-collision', title: 'Scope collision on 1 file(s)', message: 'm', ...(now ? { now } : {}) };
}

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'nervous-loop-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

// ─── 1 · Finding identity is stable across re-emissions ─────────────────────

describe('fingerprint + shortCode — the finding keeps ONE identity forever', () => {
  it('same finding re-proposed → same fingerprint and SAME shortCode, new id', () => {
    // Fresh Proposer per emission = separate scan cycles (in-memory throttle empty).
    const n1 = new Proposer(makeConfig()).propose(makeDetectorResult(), [makeDecision('SCOPE_COLLISION_REORDER')], makeContext());
    const n2 = new Proposer(makeConfig()).propose(makeDetectorResult(), [makeDecision('SCOPE_COLLISION_REORDER')], makeContext());
    expect(n1!.fingerprint).toBeTruthy();
    expect(n1!.fingerprint).toBe(n2!.fingerprint);
    expect(n1!.shortCode).toBe(n2!.shortCode); // the operator always sees ONE code
    expect(n1!.id).not.toBe(n2!.id);
  });

  it('a materially different finding gets a different fingerprint', () => {
    const other = makeDetectorResult({ groupKey: 'scope-collision:src/core/config.ts' });
    const n1 = new Proposer(makeConfig()).propose(makeDetectorResult(), [makeDecision('SCOPE_COLLISION_REORDER')], makeContext());
    const n2 = new Proposer(makeConfig()).propose(other, [makeDecision('SCOPE_COLLISION_REORDER')], makeContext());
    expect(n1!.fingerprint).not.toBe(n2!.fingerprint);
  });

  it('the fingerprint is SPRINT-scoped — a new sprint is a new question (no stale-reject swallow)', () => {
    const ctxA = { ...makeContext(), sprintId: 'sprint-443' };
    const ctxB = { ...makeContext(), sprintId: 'sprint-444' };
    const n1 = new Proposer(makeConfig()).propose(makeDetectorResult(), [makeDecision('SCOPE_COLLISION_REORDER')], ctxA);
    const n2 = new Proposer(makeConfig()).propose(makeDetectorResult(), [makeDecision('SCOPE_COLLISION_REORDER')], ctxB);
    expect(n1!.fingerprint).not.toBe(n2!.fingerprint);
  });
});

// ─── 2 · Decision memory — reject suppresses, accept cools down ─────────────

describe('decision-memory — a decision binds to the FINDING, not the instance', () => {
  const FP = 'f'.repeat(64);

  it('rejected → suppressed within the window, free after it', () => {
    const t0 = new Date('2026-07-14T12:00:00Z');
    recordDecision(root, FP, 'rejected', t0);
    const inside = evaluateSuppression(root, FP, undefined, new Date(t0.getTime() + 1000));
    expect(inside.suppress).toBe(true);
    const after = evaluateSuppression(root, FP, undefined, new Date(t0.getTime() + DEFAULT_REJECT_SUPPRESS_MS + 1));
    expect(after.suppress).toBe(false);
  });

  it('executed → cool-down, then ESCALATE (repeatAfterAction) instead of re-ask', () => {
    const t0 = new Date('2026-07-14T12:00:00Z');
    recordDecision(root, FP, 'executed', t0);
    const inside = evaluateSuppression(root, FP, undefined, new Date(t0.getTime() + 1000));
    expect(inside.suppress).toBe(true);
    const after = evaluateSuppression(root, FP, undefined, new Date(t0.getTime() + DEFAULT_ACCEPT_COOLDOWN_MS + 1));
    expect(after.suppress).toBe(false);
    expect(after.repeatAfterAction).toBe(true);
  });

  it('config windows override the defaults', () => {
    const t0 = new Date('2026-07-14T12:00:00Z');
    recordDecision(root, FP, 'rejected', t0);
    const v = evaluateSuppression(root, FP, { reject_suppress_ms: 5_000 }, new Date(t0.getTime() + 6_000));
    expect(v.suppress).toBe(false);
  });

  it('corrupt memory file fails soft (no throw, no suppression)', () => {
    recordDecision(root, FP, 'rejected');
    const p = join(root, '.deckent', 'nervous', 'nervous-decisions.json');
    expect(readFileSync(p, 'utf-8')).toContain('rejected');
    require('node:fs').writeFileSync(p, '{broken', 'utf-8');
    const v = evaluateSuppression(root, FP);
    expect(v.suppress).toBe(false);
  });
});

// ─── 3 · Executor — pending-dedup surface + decision write-back ─────────────

function mockHistory(): NervousHistory { return { append: async () => {} }; }
function mockHandler(): ActionHandler { return async () => ({ outcome: 'success' as const }); }

function approvableNotification(fp: string): NervousNotification {
  return {
    id: `id-${Math.abs(fp.length)}-${fp.slice(0, 6)}`,
    fingerprint: fp,
    shortCode: 'zzz11',
    type: 'scope-collision',
    title: 't', message: 'm', severity: 'warning',
    createdAt: new Date().toISOString(),
    detectorId: 'scope-collision',
    actions: [{ id: 'SCOPE_COLLISION_REORDER', label: 'Reorder', policy: 'approve', risk: 'medium', isSafetyFloor: false }],
    timeoutMs: null,
  };
}

describe('executor — parked finding is queryable; the decision lands in memory', () => {
  it('hasPendingFingerprint true while parked; reject writes decision-memory and unparks', async () => {
    // approveTimeoutMs=0 → never auto-proceed (stays parked until explicit decision).
    const ex = new Executor(mockHistory(), mockHandler(), undefined, root, 0);
    const n = approvableNotification('a'.repeat(64));
    const handled = ex.handle(n); // parks
    await new Promise(r => setTimeout(r, 10));
    expect(ex.hasPendingFingerprint(n.fingerprint!)).toBe(true);

    const consumed = ex.resolveApproval(n.id, 'rejected');
    expect(consumed).toBe(true);
    await handled;
    expect(ex.hasPendingFingerprint(n.fingerprint!)).toBe(false);
    expect(getDecision(root, n.fingerprint!)?.decision).toBe('rejected');
  });

  it('a successful execution stamps the fingerprint "executed"', async () => {
    const ex = new Executor(mockHistory(), mockHandler(), undefined, root, 0);
    const n: NervousNotification = {
      ...approvableNotification('b'.repeat(64)),
      actions: [{ id: 'X', label: 'x', policy: 'autonomous', risk: 'low', isSafetyFloor: false }],
    };
    await ex.handle(n);
    expect(getDecision(root, n.fingerprint!)?.decision).toBe('executed');
  });
});

// ─── 4 · Pipeline gates — the Telegram loop dies here ───────────────────────

function pipelineParts(projectRoot: string) {
  const cfg = makeConfig();
  const engine = new DecisionEngine(cfg);
  const dispatched: NervousNotification[] = [];
  const dispatcher = {
    dispatch: async (n: NervousNotification) => { dispatched.push(n); },
  } as unknown as NervousDispatcher;
  const executor = new Executor(mockHistory(), mockHandler(), undefined, projectRoot, 0);
  const event = { id: 'e1', source: 'cron', timestamp: new Date().toISOString() } as unknown as ObserverEvent;
  return { engine, dispatcher, executor, event, dispatched };
}

describe('runPipeline — decided or parked findings are never re-asked', () => {
  it('a rejected fingerprint is dropped before dispatch', async () => {
    const { engine, dispatcher, executor, event, dispatched } = pipelineParts(root);
    const result = makeDetectorResult();
    const proposer = new Proposer(makeConfig());
    const probe = new Proposer(makeConfig()).propose(result, [makeDecision('SCOPE_COLLISION_REORDER')], makeContext());
    recordDecision(root, probe!.fingerprint!, 'rejected');

    await runPipeline(result, event, engine, proposer, dispatcher, executor, { projectRoot: root });
    expect(dispatched).toHaveLength(0);
  });

  // NOTE: production fires runPipeline fire-and-forget (`void runPipeline(...)`) —
  // `executor.handle` on an approve/suggest action PARKS until a decision, so these
  // tests launch the pipeline unawaited and poll the dispatch log instead.
  async function until(cond: () => boolean, ms = 2000): Promise<void> {
    const start = Date.now();
    while (!cond() && Date.now() - start < ms) await new Promise(r => setTimeout(r, 10));
  }

  it('an already-parked fingerprint is not dispatched twice (pending-dedup)', async () => {
    const { engine, dispatcher, executor, event, dispatched } = pipelineParts(root);
    const result = makeDetectorResult();

    void runPipeline(result, event, engine, new Proposer(makeConfig()), dispatcher, executor, { projectRoot: root });
    await until(() => dispatched.length >= 1);
    const firstCount = dispatched.length;
    expect(firstCount).toBeGreaterThan(0);
    // Second scan cycle: fresh proposer (no in-memory throttle) — the OLD loop
    // re-dispatched here with a new UUID; pending-dedup must drop it BEFORE dispatch,
    // so this call returns (the gate exits before the parking handle()).
    await runPipeline(result, event, engine, new Proposer(makeConfig()), dispatcher, executor, { projectRoot: root });
    expect(dispatched.length).toBe(firstCount);
    executor.shutdown();
  });

  it('a post-cool-down re-fire is dispatched as an ESCALATION, not a verbatim re-ask', async () => {
    const { engine, dispatcher, executor, event, dispatched } = pipelineParts(root);
    const result = makeDetectorResult();
    const probe = new Proposer(makeConfig()).propose(result, [makeDecision('SCOPE_COLLISION_REORDER')], makeContext());
    recordDecision(root, probe!.fingerprint!, 'executed', new Date(Date.now() - DEFAULT_ACCEPT_COOLDOWN_MS - 60_000));

    void runPipeline(result, event, engine, new Proposer(makeConfig()), dispatcher, executor, { projectRoot: root });
    await until(() => dispatched.length >= 1);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.title).toContain('repeat — prior action did not clear this');
    executor.shutdown();
  });
});

// ─── 5 · Detector — dependency-sequenced tasks are NOT collisions ────────────

describe('scope-collision detector — dependency-chain awareness', () => {
  function detectWith(tasks: Array<{ id: string; dependencies?: string[]; filesWrite: string[] }>) {
    const fs = require('node:fs');
    const tasksDir = join(root, '.tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    for (const t of tasks) {
      fs.writeFileSync(join(tasksDir, `task-${t.id}.json`), JSON.stringify({
        id: t.id, status: 'PENDING', dependencies: t.dependencies ?? [],
        scope: { filesWrite: t.filesWrite },
      }));
    }
    const monitor = new ScopeCollisionMonitor();
    return monitor.detect({
      event: { id: 'e', source: 'cron', timestamp: new Date().toISOString() },
      sprintState: { currentPhase: 'EXECUTE' },
      projectRoot: root,
    } as never);
  }

  it('the real 443-003→443-004 shape (sequenced same-file writers) is NOT a collision', () => {
    const r = detectWith([
      { id: '443-003', filesWrite: ['src/orchestra/prompt-god-template.ts'] },
      { id: '443-004', dependencies: ['443-003'], filesWrite: ['src/orchestra/prompt-god-template.ts'] },
    ]);
    expect(r).toBeNull();
  });

  it('independent same-file writers ARE still a collision (guard not weakened)', () => {
    const r = detectWith([
      { id: 't-1', filesWrite: ['src/a.ts'] },
      { id: 't-2', filesWrite: ['src/a.ts'] },
    ]);
    expect(r).not.toBeNull();
    expect(r!.title).toContain('Scope collision');
  });

  it('a partially-sequenced group (one independent member) stays a collision', () => {
    const r = detectWith([
      { id: 't-1', filesWrite: ['src/a.ts'] },
      { id: 't-2', dependencies: ['t-1'], filesWrite: ['src/a.ts'] },
      { id: 't-3', filesWrite: ['src/a.ts'] }, // independent third writer
    ]);
    expect(r).not.toBeNull();
  });

  it('a transitive chain (a→b→c) counts as fully sequenced', () => {
    const r = detectWith([
      { id: 'a', filesWrite: ['src/x.ts'] },
      { id: 'b', dependencies: ['a'], filesWrite: ['src/x.ts'] },
      { id: 'c', dependencies: ['b'], filesWrite: ['src/x.ts'] },
    ]);
    expect(r).toBeNull();
  });
});

// ─── ExecutionRecord import kept live (type-only usage guard) ────────────────
void (undefined as unknown as ExecutionRecord | undefined);
