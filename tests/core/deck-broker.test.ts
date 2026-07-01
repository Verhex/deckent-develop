// ─── DeckBroker tests (DECK-SUBPROC-BROKER, task 353-014) ────────────────────
// Hermetic: every test writes its own `.deck` under a tmpdir project root —
// never the real repo root, never gitignored local state (CI-sim safe).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeckBroker } from '../../src/core/deck-broker.js';

// applyDeckSecretsToEnv (which DeckBroker delegates to) mutates process.env
// for the keys it resolves — snapshot + restore so this suite leaves no
// global state behind (mirrors tests/core/auth-matrix.test.ts).
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
  projectRoot = mkdtempSync(join(tmpdir(), 'deck-broker-'));
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

// ─── task-scoped resolve / cross-provider isolation ──────────────────────────

describe('DeckBroker — task-scoped resolve', () => {
  it('resolves ONLY the requested provider\'s credential, no cross-provider leak', () => {
    writeDeck(
      'DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n' +
      'DECKENT_OPENAI_API_KEY=sk-oai-yyy\n' +
      'DECKENT_GOOGLE_API_KEY=goog-zzz\n',
    );
    const broker = new DeckBroker(projectRoot);

    const claudeEnv = broker.resolveForTask('task-A', 'claude');
    expect(claudeEnv).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(claudeEnv).not.toHaveProperty('OPENAI_API_KEY');
    expect(claudeEnv).not.toHaveProperty('GOOGLE_API_KEY');

    const codexEnv = broker.resolveForTask('task-B', 'codex');
    expect(codexEnv).toEqual({ OPENAI_API_KEY: 'sk-oai-yyy' });
    expect(codexEnv).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(codexEnv).not.toHaveProperty('GOOGLE_API_KEY');
  });

  it('two different tasks resolving the same provider each get their own independent grant', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-shared\n');
    const broker = new DeckBroker(projectRoot);

    expect(broker.resolveForTask('task-A', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-shared' });
    expect(broker.resolveForTask('task-B', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-shared' });
  });

  it('an unknown / unconfigured provider resolves to null (no secret)', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    expect(broker.resolveForTask('task-A', 'codex')).toBeNull();
    expect(broker.resolveForTask('task-B', 'nonexistent-provider')).toBeNull();
  });

  it('empty .deck (subscription mode) → every resolve denied, no ambient credential leaks in', () => {
    const broker = new DeckBroker(projectRoot);
    expect(broker.resolveForTask('task-A', 'claude')).toBeNull();
  });

  it('returns a fresh copy — mutating the returned env cannot corrupt a later resolve for a different task', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    const first = broker.resolveForTask('task-A', 'claude')!;
    first['ANTHROPIC_API_KEY'] = 'tampered';
    first['INJECTED'] = 'evil';

    const second = broker.resolveForTask('task-B', 'claude');
    expect(second).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
  });
});

// ─── single-use handoff ───────────────────────────────────────────────────────

describe('DeckBroker — single-use handoff', () => {
  it('a second resolve for the SAME taskId is denied, even for the same provider', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    expect(broker.resolveForTask('task-A', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(broker.resolveForTask('task-A', 'claude')).toBeNull();
  });

  it('a second resolve for the SAME taskId with a DIFFERENT provider is still denied (taskId is the handoff unit)', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\nDECKENT_OPENAI_API_KEY=sk-oai-yyy\n');
    const broker = new DeckBroker(projectRoot);

    expect(broker.resolveForTask('task-A', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(broker.resolveForTask('task-A', 'codex')).toBeNull();
  });

  it('a denied resolve (no-secret) does NOT consume the taskId — a later valid resolve for it still succeeds', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    expect(broker.resolveForTask('task-A', 'codex')).toBeNull(); // no OPENAI key configured
    expect(broker.resolveForTask('task-A', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
  });
});

// ─── TTL ──────────────────────────────────────────────────────────────────────

describe('DeckBroker — TTL expiry', () => {
  it('resolves normally within the TTL window', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    let clockMs = Date.parse('2026-07-01T22:00:00.000Z');
    const broker = new DeckBroker(projectRoot, { ttlMs: 60_000, now: () => new Date(clockMs) });

    clockMs += 30_000; // 30s in — still within 60s TTL
    expect(broker.resolveForTask('task-A', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
  });

  it('denies every resolve once the TTL window has elapsed since construction', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    let clockMs = Date.parse('2026-07-01T22:00:00.000Z');
    const broker = new DeckBroker(projectRoot, { ttlMs: 60_000, now: () => new Date(clockMs) });

    clockMs += 60_001; // just past the TTL
    expect(broker.resolveForTask('task-A', 'claude')).toBeNull();
  });

  it('defaults to a 5-minute TTL when unset', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    let clockMs = Date.parse('2026-07-01T22:00:00.000Z');
    const broker = new DeckBroker(projectRoot, { now: () => new Date(clockMs) });

    clockMs += 4 * 60_000 + 59_000; // 4:59 — still within default 5min
    expect(broker.resolveForTask('task-A', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });

    clockMs += 2_000; // now past 5:00 total for a fresh taskId
    expect(broker.resolveForTask('task-B', 'claude')).toBeNull();
  });
});

// ─── audit log ────────────────────────────────────────────────────────────────

describe('DeckBroker — audit log', () => {
  it('records a granted entry with taskId/provider/outcome, and no secret value', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    broker.resolveForTask('task-A', 'claude');
    const log = broker.getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ taskId: 'task-A', provider: 'claude', outcome: 'granted' });
    expect(JSON.stringify(log)).not.toContain('sk-ant-xxx');
  });

  it('records denial reasons for no-secret, already-consumed, and expired', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    let clockMs = Date.parse('2026-07-01T22:00:00.000Z');
    const broker = new DeckBroker(projectRoot, { ttlMs: 1_000, now: () => new Date(clockMs) });

    broker.resolveForTask('task-A', 'codex'); // no-secret
    broker.resolveForTask('task-B', 'claude'); // granted
    broker.resolveForTask('task-B', 'claude'); // already-consumed
    clockMs += 2_000;
    broker.resolveForTask('task-C', 'claude'); // expired

    const log = broker.getAuditLog();
    expect(log.map((e) => e.reason)).toEqual([
      'no-secret',
      undefined,
      'already-consumed',
      'expired',
    ]);
    expect(log.map((e) => e.outcome)).toEqual(['denied', 'granted', 'denied', 'denied']);
  });

  it('getAuditLog returns a copy — mutating it does not affect the broker\'s internal trail', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);
    broker.resolveForTask('task-A', 'claude');

    const log = broker.getAuditLog() as DeckBrokerAuditEntryMutable[];
    log.push({ taskId: 'injected', provider: 'x', timestamp: 'x', outcome: 'granted' });

    expect(broker.getAuditLog()).toHaveLength(1);
  });
});

// ─── no path leak ─────────────────────────────────────────────────────────────

describe('DeckBroker — .deck path never leaks via the public API', () => {
  it('neither a successful nor a denied resolve, nor the audit log, ever mentions the project root path', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    const granted = broker.resolveForTask('task-A', 'claude');
    const denied = broker.resolveForTask('task-B', 'unknown-provider');
    const log = broker.getAuditLog();

    const serialized = JSON.stringify({ granted, denied, log });
    expect(serialized).not.toContain(projectRoot);
    expect(serialized).not.toContain('.deck');
  });

  it('exposes no method that returns the project root or a filesystem path', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(broker));
    expect(methodNames).toEqual(expect.arrayContaining(['resolveForTask', 'getAuditLog']));
    expect(methodNames.some((n) => /path|root|deck$/i.test(n))).toBe(false);
  });
});

// Local type mirror (test-only) so the "returns a copy" test can push onto
// the array without depending on DeckBroker's internal (non-exported) type.
interface DeckBrokerAuditEntryMutable {
  taskId: string;
  provider: string;
  timestamp: string;
  outcome: 'granted' | 'denied';
  reason?: string;
}
