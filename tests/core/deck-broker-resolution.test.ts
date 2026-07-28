// ─── DeckBroker typed resolution tests (task 457-001) ────────────────────────
// Covers `resolveForTaskWithReason` — the typed
// `{ state:'granted', env } | { state:'denied', reason }` outcome — and proves
// the legacy nullable `resolveForTask` is DERIVED from it (unchanged behavior,
// one audit entry per call, no duplicated resolve path).
//
// Hermetic: every test writes its own `.deck` under a tmpdir project root —
// never the real repo root, never gitignored local state (CI-sim safe).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeckBroker } from '../../src/core/deck-broker.js';
import type {
  DeckBrokerDenialReason,
  DeckBrokerResolution,
} from '../../src/core/deck-broker.js';

// applyDeckSecretsToEnv (which DeckBroker delegates to) mutates process.env
// for the keys it resolves — snapshot + restore so this suite leaves no
// global state behind (mirrors tests/core/deck-broker.test.ts).
const TOUCHED_ENV = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'ZHIPU_API_KEY',
] as const;

let projectRoot: string;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'deck-broker-resolution-'));
  saved = {};
  for (const k of TOUCHED_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  for (const k of TOUCHED_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function writeDeck(contents: string): void {
  writeFileSync(join(projectRoot, '.deck'), contents, 'utf-8');
}

/** Fixed-clock broker so TTL expiry is deterministic (no wall-clock reads). */
function brokerWithClock(ttlMs: number): { broker: DeckBroker; advance: (ms: number) => void } {
  let clockMs = Date.parse('2026-07-25T10:00:00.000Z');
  const broker = new DeckBroker(projectRoot, { ttlMs, now: () => new Date(clockMs) });
  return { broker, advance: (ms: number) => { clockMs += ms; } };
}

// ─── granted arm ─────────────────────────────────────────────────────────────

describe('DeckBroker.resolveForTaskWithReason — granted', () => {
  it('returns state "granted" carrying ONLY the requested provider\'s env', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\nDECKENT_OPENAI_API_KEY=sk-oai-yyy\n');
    const broker = new DeckBroker(projectRoot);

    const resolution = broker.resolveForTaskWithReason('task-A', 'claude');

    expect(resolution).toEqual({ state: 'granted', env: { ANTHROPIC_API_KEY: 'sk-ant-xxx' } });
    expect(resolution.state).toBe('granted');
    // A grant carries no denial reason — the shape does not lie in either direction.
    expect('reason' in resolution).toBe(false);
  });

  it('narrows to `env` on the granted arm (compile-time discrimination)', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    const resolution: DeckBrokerResolution = broker.resolveForTaskWithReason('task-A', 'claude');
    if (resolution.state !== 'granted') throw new Error('expected a grant');

    const env: Record<string, string> = resolution.env;
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-xxx');
  });

  it('returns a fresh env copy per grant — mutating one cannot corrupt a later grant', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    const first = broker.resolveForTaskWithReason('task-A', 'claude');
    if (first.state !== 'granted') throw new Error('expected a grant');
    first.env['ANTHROPIC_API_KEY'] = 'tampered';
    first.env['INJECTED'] = 'evil';

    expect(broker.resolveForTaskWithReason('task-B', 'claude')).toEqual({
      state: 'granted',
      env: { ANTHROPIC_API_KEY: 'sk-ant-xxx' },
    });
  });
});

// ─── denied arm — all three reasons, typed ───────────────────────────────────

describe('DeckBroker.resolveForTaskWithReason — denied', () => {
  it('no-secret: an unconfigured provider is denied with reason "no-secret"', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    expect(broker.resolveForTaskWithReason('task-A', 'codex')).toEqual({
      state: 'denied',
      reason: 'no-secret',
    });
    expect(broker.resolveForTaskWithReason('task-B', 'nonexistent-provider')).toEqual({
      state: 'denied',
      reason: 'no-secret',
    });
  });

  it('already-consumed: a second resolve for the same taskId is denied with reason "already-consumed"', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\nDECKENT_OPENAI_API_KEY=sk-oai-yyy\n');
    const broker = new DeckBroker(projectRoot);

    expect(broker.resolveForTaskWithReason('task-A', 'claude').state).toBe('granted');
    expect(broker.resolveForTaskWithReason('task-A', 'claude')).toEqual({
      state: 'denied',
      reason: 'already-consumed',
    });
    // taskId is the handoff unit — a different provider on the same taskId too.
    expect(broker.resolveForTaskWithReason('task-A', 'codex')).toEqual({
      state: 'denied',
      reason: 'already-consumed',
    });
  });

  it('expired: past the TTL window every resolve is denied with reason "expired"', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const { broker, advance } = brokerWithClock(60_000);

    advance(30_000);
    expect(broker.resolveForTaskWithReason('task-A', 'claude').state).toBe('granted');

    advance(30_001); // just past the TTL
    expect(broker.resolveForTaskWithReason('task-B', 'claude')).toEqual({
      state: 'denied',
      reason: 'expired',
    });
    // Expiry outranks every other check — even a taskId that never resolved.
    expect(broker.resolveForTaskWithReason('task-C', 'unconfigured')).toEqual({
      state: 'denied',
      reason: 'expired',
    });
  });

  it('exposes all THREE denial reasons as typed values a caller can exhaustively handle', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const { broker, advance } = brokerWithClock(1_000);

    const reasons: DeckBrokerDenialReason[] = [];
    for (const [taskId, provider, advanceMs] of [
      ['task-A', 'codex', 0],
      ['task-B', 'claude', 0], // granted — not collected
      ['task-B', 'claude', 0],
      ['task-C', 'claude', 2_000],
    ] as const) {
      advance(advanceMs);
      const resolution = broker.resolveForTaskWithReason(taskId, provider);
      if (resolution.state === 'denied') reasons.push(resolution.reason);
    }

    expect(reasons).toEqual(['no-secret', 'already-consumed', 'expired']);
    // `describeReason` is exhaustive over the closed union: if a fourth reason
    // is ever added without updating fail-closed callers, this stops compiling.
    expect(reasons.map(describeReason)).toEqual([
      'deny:no-secret',
      'deny:already-consumed',
      'deny:expired',
    ]);
  });

  it('a denial carries NO env, no secret value and no .deck path', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    const denied = broker.resolveForTaskWithReason('task-A', 'codex');
    expect(denied.state).toBe('denied');
    expect('env' in denied).toBe(false);
    expect(Object.keys(denied)).toEqual(['state', 'reason']);

    const serialized = JSON.stringify(denied);
    expect(serialized).not.toContain('sk-ant-xxx');
    expect(serialized).not.toContain(projectRoot);
    expect(serialized).not.toContain('.deck');
  });

  it('a denied resolve does NOT consume the taskId — a later valid resolve still grants', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    expect(broker.resolveForTaskWithReason('task-A', 'codex')).toEqual({
      state: 'denied',
      reason: 'no-secret',
    });
    expect(broker.resolveForTaskWithReason('task-A', 'claude')).toEqual({
      state: 'granted',
      env: { ANTHROPIC_API_KEY: 'sk-ant-xxx' },
    });
  });
});

// ─── legacy resolveForTask is derived, not duplicated ────────────────────────

describe('DeckBroker.resolveForTask — unchanged behavior, derived from the typed API', () => {
  it('still returns the env object on grant and null on every denial', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const { broker, advance } = brokerWithClock(1_000);

    expect(broker.resolveForTask('task-A', 'codex')).toBeNull(); // no-secret
    expect(broker.resolveForTask('task-A', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(broker.resolveForTask('task-A', 'claude')).toBeNull(); // already-consumed
    advance(2_000);
    expect(broker.resolveForTask('task-B', 'claude')).toBeNull(); // expired
  });

  it('agrees with the typed API on every outcome, and consumption crosses both methods', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    // typed grant consumes the taskId as far as the legacy method is concerned
    expect(broker.resolveForTaskWithReason('task-A', 'claude').state).toBe('granted');
    expect(broker.resolveForTask('task-A', 'claude')).toBeNull();

    // legacy grant consumes the taskId as far as the typed method is concerned
    expect(broker.resolveForTask('task-B', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(broker.resolveForTaskWithReason('task-B', 'claude')).toEqual({
      state: 'denied',
      reason: 'already-consumed',
    });
  });

  it('logs exactly ONE audit entry per legacy call — one resolve path, no double-audit', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    broker.resolveForTask('task-A', 'codex'); // denied: no-secret
    broker.resolveForTask('task-B', 'claude'); // granted

    const log = broker.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log.map((e) => e.outcome)).toEqual(['denied', 'granted']);
    expect(log.map((e) => e.reason)).toEqual(['no-secret', undefined]);
  });

  it('the typed API audits identically to the legacy one (same outcome + reason)', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const typedBroker = new DeckBroker(projectRoot);
    const legacyBroker = new DeckBroker(projectRoot);

    for (const broker of [typedBroker, legacyBroker]) {
      const typed = broker === typedBroker;
      if (typed) {
        broker.resolveForTaskWithReason('task-A', 'codex');
        broker.resolveForTaskWithReason('task-B', 'claude');
        broker.resolveForTaskWithReason('task-B', 'claude');
      } else {
        broker.resolveForTask('task-A', 'codex');
        broker.resolveForTask('task-B', 'claude');
        broker.resolveForTask('task-B', 'claude');
      }
    }

    const strip = (b: DeckBroker) => b.getAuditLog().map((e) => ({
      taskId: e.taskId, provider: e.provider, outcome: e.outcome, reason: e.reason,
    }));
    expect(strip(typedBroker)).toEqual(strip(legacyBroker));
    expect(JSON.stringify(strip(typedBroker))).not.toContain('sk-ant-xxx');
  });
});

/**
 * Exhaustive over the closed `DeckBrokerDenialReason` union — the `never`
 * assignment is the compile-time proof that all three reasons are typed and
 * that a future fourth reason cannot be silently absorbed by a fail-closed
 * caller.
 */
function describeReason(reason: DeckBrokerDenialReason): string {
  switch (reason) {
    case 'expired':
      return 'deny:expired';
    case 'already-consumed':
      return 'deny:already-consumed';
    case 'no-secret':
      return 'deny:no-secret';
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}
