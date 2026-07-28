import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CREDENTIAL_DECISION_AUDIT_GENESIS_HASH,
  CredentialDecisionAuditError,
  CredentialDecisionAuditSink,
  readCredentialDecisionAuditRecords,
  resolveCredentialDecisionAuditPath,
  verifyCredentialDecisionAuditChain,
} from '../../src/core/credential-decision-audit.js';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function fixture(): { base: string; sinkPath: string; projectRoot: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-credential-decision-audit-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const stateRoot = join(base, 'host-state');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(stateRoot, { recursive: true });
  return { base, projectRoot, sinkPath: join(stateRoot, 'credential-decision-audit.jsonl') };
}

const T0 = '2026-07-25T00:00:00.000Z';
const T1 = '2026-07-25T00:01:00.000Z';
const T2 = '2026-07-25T00:02:00.000Z';

describe('resolveCredentialDecisionAuditPath', () => {
  it('resolves outside an injected project root using a DECKENT_HOME-style override', () => {
    const { projectRoot } = fixture();
    const hostState = join(projectRoot, '..', 'host-state');
    const path = resolveCredentialDecisionAuditPath('linux', { HOME: '/home/tester', DECKENT_HOME: hostState });
    expect(path.startsWith(hostState)).toBe(true);
    expect(path.startsWith(projectRoot)).toBe(false);
    expect(path.endsWith('credential-decision-audit.jsonl')).toBe(true);
  });

  it('resolves under the platform global state dir (no project root involved at all)', () => {
    const path = resolveCredentialDecisionAuditPath('linux', {
      HOME: '/home/tester',
      XDG_STATE_HOME: '/home/tester/.local/state',
    });
    expect(path).toBe('/home/tester/.local/state/deckent/credential-decision-audit.jsonl');
  });
});

describe('CredentialDecisionAuditSink.record — granted', () => {
  it('persists a redacted reference (env var name + sha256 prefix) and never the raw secret value', () => {
    const { sinkPath } = fixture();
    const sink = new CredentialDecisionAuditSink(sinkPath, { now: () => new Date(T0) });
    const secretValue = 'sk-ant-super-secret-value-0123456789';
    const record = sink.record({
      taskId: 'task-457-002',
      provider: 'claude',
      decision: 'granted',
      reason: 'resolved',
      occurredAt: T0,
      secret: { envVarName: 'ANTHROPIC_API_KEY', secretValue },
    });

    expect(record.redactedRef).not.toBeNull();
    expect(record.redactedRef?.envVarName).toBe('ANTHROPIC_API_KEY');
    const fullHash = createHash('sha256').update(secretValue).digest('hex');
    expect(record.redactedRef?.secretSha256Prefix).toBe(fullHash.slice(0, 12));
    expect(record.redactedRef?.secretSha256Prefix.length).toBe(12);

    const raw = readFileSync(sinkPath, 'utf-8');
    expect(raw).not.toContain(secretValue);
    expect(raw).not.toMatch(/\.deck\b/);
    expect(raw).toContain('ANTHROPIC_API_KEY');
  });

  it('rejects a granted decision with no secret reference', () => {
    const { sinkPath } = fixture();
    const sink = new CredentialDecisionAuditSink(sinkPath);
    expect(() =>
      sink.record({
        taskId: 'task-1',
        provider: 'claude',
        decision: 'granted',
        reason: 'resolved',
        occurredAt: T0,
      }),
    ).toThrow(CredentialDecisionAuditError);
  });
});

describe('CredentialDecisionAuditSink.record — denied', () => {
  it.each(['expired', 'already-consumed', 'no-secret'] as const)(
    'persists no redactedRef for denial reason "%s"',
    (reason) => {
      const { sinkPath } = fixture();
      const sink = new CredentialDecisionAuditSink(sinkPath, { now: () => new Date(T0) });
      const record = sink.record({
        taskId: 'task-1',
        provider: 'codex',
        decision: 'denied',
        reason,
        occurredAt: T0,
      });
      expect(record.redactedRef).toBeNull();
    },
  );

  it('rejects a denied decision that carries a secret reference', () => {
    const { sinkPath } = fixture();
    const sink = new CredentialDecisionAuditSink(sinkPath);
    expect(() =>
      sink.record({
        taskId: 'task-1',
        provider: 'claude',
        decision: 'denied',
        reason: 'no-secret',
        occurredAt: T0,
        secret: { envVarName: 'ANTHROPIC_API_KEY', secretValue: 'sk-ant-whatever' },
      }),
    ).toThrow(CredentialDecisionAuditError);
  });
});

describe('CredentialDecisionAuditSink.record — input validation', () => {
  it('rejects a taskId that references a .deck path', () => {
    const { sinkPath } = fixture();
    const sink = new CredentialDecisionAuditSink(sinkPath);
    expect(() =>
      sink.record({
        taskId: '/project/.deck',
        provider: 'claude',
        decision: 'denied',
        reason: 'no-secret',
        occurredAt: T0,
      }),
    ).toThrow(CredentialDecisionAuditError);
  });

  it('rejects a non-canonical occurredAt timestamp', () => {
    const { sinkPath } = fixture();
    const sink = new CredentialDecisionAuditSink(sinkPath);
    expect(() =>
      sink.record({
        taskId: 'task-1',
        provider: 'claude',
        decision: 'denied',
        reason: 'no-secret',
        occurredAt: 'not-a-timestamp',
      }),
    ).toThrow(CredentialDecisionAuditError);
  });

  it('rejects an unrecognized reason', () => {
    const { sinkPath } = fixture();
    const sink = new CredentialDecisionAuditSink(sinkPath);
    expect(() =>
      sink.record({
        taskId: 'task-1',
        provider: 'claude',
        decision: 'denied',
        // @ts-expect-error — intentionally invalid for the runtime-validation test
        reason: 'bogus-reason',
        occurredAt: T0,
      }),
    ).toThrow(CredentialDecisionAuditError);
  });

  it('requires a non-empty filePath at construction', () => {
    expect(() => new CredentialDecisionAuditSink('')).toThrow(CredentialDecisionAuditError);
  });
});

describe('hash chain', () => {
  it('chains multiple appends and verifies intact across sink restarts (durable across processes)', () => {
    const { sinkPath } = fixture();
    const sinkA = new CredentialDecisionAuditSink(sinkPath, { now: () => new Date(T0) });
    sinkA.record({
      taskId: 'task-1', provider: 'claude', decision: 'denied', reason: 'no-secret', occurredAt: T0,
    });

    // A fresh sink instance over the SAME file continues the SAME chain — proves
    // durability + no reliance on an in-memory chain-head cache.
    const sinkB = new CredentialDecisionAuditSink(sinkPath, { now: () => new Date(T1) });
    sinkB.record({
      taskId: 'task-2',
      provider: 'claude',
      decision: 'granted',
      reason: 'resolved',
      occurredAt: T1,
      secret: { envVarName: 'ANTHROPIC_API_KEY', secretValue: 'sk-ant-second-secret' },
    });

    const sinkC = new CredentialDecisionAuditSink(sinkPath, { now: () => new Date(T2) });
    sinkC.record({
      taskId: 'task-3', provider: 'codex', decision: 'denied', reason: 'expired', occurredAt: T2,
    });

    const records = readCredentialDecisionAuditRecords(sinkPath);
    expect(records).toHaveLength(3);
    expect(records[0]?.prevHash).toBe(CREDENTIAL_DECISION_AUDIT_GENESIS_HASH);
    expect(records[1]?.prevHash).toBe(records[0]?.hash);
    expect(records[2]?.prevHash).toBe(records[1]?.hash);

    expect(verifyCredentialDecisionAuditChain(records)).toEqual({ intact: true });
  });

  it('detects a corrupted record and reports the exact broken index', () => {
    const { sinkPath } = fixture();
    const sink = new CredentialDecisionAuditSink(sinkPath, { now: () => new Date(T0) });
    sink.record({ taskId: 'task-1', provider: 'claude', decision: 'denied', reason: 'no-secret', occurredAt: T0 });
    sink.record({ taskId: 'task-2', provider: 'claude', decision: 'denied', reason: 'expired', occurredAt: T1 });

    const records = readCredentialDecisionAuditRecords(sinkPath);
    expect(records).toHaveLength(2);

    // Tamper with the on-disk second record's provider field directly, bypassing the sink API.
    const lines = readFileSync(sinkPath, 'utf-8').trim().split('\n');
    const tampered = JSON.parse(lines[1]!) as Record<string, unknown>;
    tampered.provider = 'tampered-provider';
    lines[1] = JSON.stringify(tampered);
    writeFileSync(sinkPath, `${lines.join('\n')}\n`, 'utf-8');

    const reloaded = readCredentialDecisionAuditRecords(sinkPath);
    const verdict = verifyCredentialDecisionAuditChain(reloaded);
    expect(verdict.intact).toBe(false);
    expect(verdict.brokenAt).toBe(1);
  });

  it('returns an empty array when the file has not been created yet', () => {
    const { sinkPath } = fixture();
    expect(readCredentialDecisionAuditRecords(sinkPath)).toEqual([]);
  });
});
