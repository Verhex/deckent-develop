// ─── DeckBroker durable audit-sink wiring tests (task 458-001) ──────────────
// Proves `DeckBroker` forwards every granted/denied decision to an injected
// `DeckBrokerAuditSink`, while the existing in-memory `getAuditLog()` stays
// byte-for-byte unchanged, and a missing/throwing sink never alters resolve
// behavior. Hermetic: every test writes its own `.deck` under a tmpdir
// project root, and the injected sink is an in-memory fake — no real
// CredentialDecisionAuditSink / filesystem write involved (CI-sim safe).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeckBroker } from '../../src/core/deck-broker.js';
import type { DeckBrokerAuditSink } from '../../src/core/deck-broker.js';
import type {
  CredentialDecisionAuditRecord,
  CredentialDecisionInput,
} from '../../src/core/credential-decision-audit.js';

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
  projectRoot = mkdtempSync(join(tmpdir(), 'deck-broker-audit-wire-'));
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

/** In-memory fake sink — records every input it is called with, no disk I/O. */
function fakeSink(): { sink: DeckBrokerAuditSink; records: CredentialDecisionInput[] } {
  const records: CredentialDecisionInput[] = [];
  const sink: DeckBrokerAuditSink = {
    record(input: CredentialDecisionInput): CredentialDecisionAuditRecord {
      records.push(input);
      return {
        schemaVersion: 1,
        taskId: input.taskId,
        provider: input.provider,
        decision: input.decision,
        reason: input.reason,
        occurredAt: input.occurredAt,
        recordedAt: input.occurredAt,
        redactedRef: null,
        prevHash: 'fake-prev',
        hash: 'fake-hash',
      };
    },
  };
  return { sink, records };
}

/** A sink whose `record()` always throws — proves failure isolation. */
function throwingSink(): DeckBrokerAuditSink {
  return {
    record(): CredentialDecisionAuditRecord {
      throw new Error('durable sink unavailable');
    },
  };
}

describe('DeckBroker — durable audit sink wiring', () => {
  it('a granted decision produces exactly one durable record with decision:granted, reason:resolved, and the redacted secret source', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const { sink, records } = fakeSink();
    const broker = new DeckBroker(projectRoot, { auditSink: sink });

    broker.resolveForTask('task-A', 'claude');

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      taskId: 'task-A',
      provider: 'claude',
      decision: 'granted',
      reason: 'resolved',
      secret: { envVarName: 'ANTHROPIC_API_KEY', secretValue: 'sk-ant-xxx' },
    });
    expect(typeof records[0].occurredAt).toBe('string');
  });

  it('each denial reason (no-secret, already-consumed, expired) produces exactly one durable record with decision:denied and the matching reason', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const { sink, records } = fakeSink();
    let clockMs = Date.parse('2026-07-25T10:00:00.000Z');
    const broker = new DeckBroker(projectRoot, { ttlMs: 1_000, now: () => new Date(clockMs), auditSink: sink });

    broker.resolveForTask('task-A', 'codex'); // no-secret
    broker.resolveForTask('task-B', 'claude'); // granted
    broker.resolveForTask('task-B', 'claude'); // already-consumed
    clockMs += 2_000;
    broker.resolveForTask('task-C', 'claude'); // expired

    expect(records).toHaveLength(4);
    expect(records.map((r) => ({ decision: r.decision, reason: r.reason }))).toEqual([
      { decision: 'denied', reason: 'no-secret' },
      { decision: 'granted', reason: 'resolved' },
      { decision: 'denied', reason: 'already-consumed' },
      { decision: 'denied', reason: 'expired' },
    ]);
    // A denial never carries a secret reference.
    expect(records[0].secret).toBeUndefined();
    expect(records[2].secret).toBeUndefined();
    expect(records[3].secret).toBeUndefined();
  });

  it('resolveForTaskWithReason wires the same durable record set as the legacy resolveForTask path', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const { sink, records } = fakeSink();
    const broker = new DeckBroker(projectRoot, { auditSink: sink });

    broker.resolveForTaskWithReason('task-A', 'codex');
    broker.resolveForTaskWithReason('task-B', 'claude');

    expect(records).toHaveLength(2);
    expect(records.map((r) => r.decision)).toEqual(['denied', 'granted']);
  });

  it('no sink configured: resolve behavior and in-memory audit log are identical to the pre-existing (unwired) contract', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot);

    expect(broker.resolveForTask('task-A', 'codex')).toBeNull();
    expect(broker.resolveForTask('task-A', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(broker.resolveForTask('task-A', 'claude')).toBeNull(); // already-consumed

    const log = broker.getAuditLog();
    expect(log.map((e) => e.outcome)).toEqual(['denied', 'granted', 'denied']);
    expect(log.map((e) => e.reason)).toEqual(['no-secret', undefined, 'already-consumed']);
  });

  it('a throwing sink does not change resolveForTaskWithReason\'s return value or consumption semantics', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot, { auditSink: throwingSink() });

    expect(broker.resolveForTaskWithReason('task-A', 'codex')).toEqual({ state: 'denied', reason: 'no-secret' });
    expect(broker.resolveForTaskWithReason('task-B', 'claude')).toEqual({
      state: 'granted',
      env: { ANTHROPIC_API_KEY: 'sk-ant-xxx' },
    });
    // Consumption still applies even though the sink threw on the first call.
    expect(broker.resolveForTaskWithReason('task-B', 'claude')).toEqual({
      state: 'denied',
      reason: 'already-consumed',
    });
  });

  it('a throwing sink does not suppress or corrupt the in-memory getAuditLog() trail', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const broker = new DeckBroker(projectRoot, { auditSink: throwingSink() });

    broker.resolveForTask('task-A', 'codex');
    broker.resolveForTask('task-B', 'claude');

    const log = broker.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log.map((e) => e.outcome)).toEqual(['denied', 'granted']);
    expect(JSON.stringify(log)).not.toContain('sk-ant-xxx');
  });

  it('never leaks the .deck project root path into a durable record', () => {
    writeDeck('DECKENT_CLAUDE_API_KEY=sk-ant-xxx\n');
    const { sink, records } = fakeSink();
    const broker = new DeckBroker(projectRoot, { auditSink: sink });

    broker.resolveForTask('task-A', 'claude');
    broker.resolveForTask('task-B', 'unknown-provider');

    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain(projectRoot);
    expect(serialized).not.toContain('.deck');
  });
});
