// tests/cli/native-agent-scratch-wire.test.ts
// NATIVE-AGENT-HORIZON-001 NT-03/NT-12/NT-13 (553-002) — scratch-session identity
// threading, permission-auto-decision durable audit sink, and trace config authority
// (config is the sole ON-switch; env can only force OFF, never ON).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildTurnRecorder, resolveTraceEnabled } from '../../src/cli/repl/trace-wire.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import type { ProviderAdapter } from '../../src/agent/provider-tooluse/types.js';
import type { AgentEvent } from '../../src/agent/events.js';

const { fakeSession, createAgentSession, writeAuditEvent } = vi.hoisted(() => ({
  fakeSession: {
    send: vi.fn(async function* (): AsyncIterable<AgentEvent> {}),
    respondPermission: vi.fn(),
    cancel: vi.fn(),
    setApprovalMode: vi.fn(),
    getApprovalMode: vi.fn(() => 'default'),
    transcript: vi.fn(() => []),
    latestCheckpoint: vi.fn(() => ({ status: 'empty' })),
    close: vi.fn(),
  },
  createAgentSession: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock('../../src/agent/session.js', () => ({ createAgentSession }));
vi.mock('../../src/core/audit-writer.js', () => ({ writeAuditEvent }));

// Imported AFTER the mocks above so the module under test picks up the mocked
// collaborators (same ordering precedent as process-runtime-provider-threading.test.ts).
const { createNativeEngine } = await import('../../src/cli/repl/native-agent-bridge.js');

function noopAdapter(): ProviderAdapter {
  return { name: 'mock', async *send() { yield { type: 'done' }; } };
}

describe('native-agent-bridge scratch/audit/close wiring (553-002)', () => {
  afterEach(() => {
    createAgentSession.mockReset();
    writeAuditEvent.mockReset();
    fakeSession.send.mockReset();
    fakeSession.close.mockReset();
    createAgentSession.mockReturnValue(fakeSession);
    fakeSession.send.mockImplementation(async function* (): AsyncIterable<AgentEvent> {});
  });

  it('threads scratch ids + a non-empty checkpointInstruction into createAgentSession', () => {
    createAgentSession.mockReturnValue(fakeSession);
    const dir = tmpdir();
    createNativeEngine({
      adapter: noopAdapter(),
      registry: buildNativeToolRegistry({ cwd: () => dir }),
      cwd: dir,
      model: 'm',
      lang: 'en',
      confirm: async () => 'y',
      toolSink: () => {},
      scratch: { tenantId: 'tenant-a', projectId: 'proj-a', sessionId: 'sess-a' },
    });
    expect(createAgentSession).toHaveBeenCalledTimes(1);
    const passedDeps = createAgentSession.mock.calls[0]![0] as { scratch?: { tenantId: string; projectId: string; sessionId: string; checkpointInstruction: string } };
    expect(passedDeps.scratch).toBeDefined();
    expect(passedDeps.scratch!.tenantId).toBe('tenant-a');
    expect(passedDeps.scratch!.projectId).toBe('proj-a');
    expect(passedDeps.scratch!.sessionId).toBe('sess-a');
    expect(typeof passedDeps.scratch!.checkpointInstruction).toBe('string');
    expect(passedDeps.scratch!.checkpointInstruction.length).toBeGreaterThan(0);
  });

  it('omits scratch entirely from createAgentSession deps when no scratch ids are supplied', () => {
    createAgentSession.mockReturnValue(fakeSession);
    const dir = tmpdir();
    createNativeEngine({
      adapter: noopAdapter(),
      registry: buildNativeToolRegistry({ cwd: () => dir }),
      cwd: dir,
      model: 'm',
      lang: 'en',
      confirm: async () => 'y',
      toolSink: () => {},
    });
    const passedDeps = createAgentSession.mock.calls[0]![0] as { scratch?: unknown };
    expect(passedDeps.scratch).toBeUndefined();
  });

  it('persists a permission-auto-decision event to the durable audit sink', async () => {
    createAgentSession.mockReturnValue(fakeSession);
    fakeSession.send.mockImplementation(async function* (): AsyncIterable<AgentEvent> {
      yield {
        type: 'permission-auto-decision',
        tool: 'deckent_bash',
        resource: 'echo hi',
        resourceClass: 'modify',
        decision: 'deny',
        matchedRule: 'rule-1',
        mode: 'default',
        tier: 'tier-1',
        grantLifetime: 'none',
        floor: false,
      };
    });
    const dir = tmpdir();
    const engine = createNativeEngine({
      adapter: noopAdapter(),
      registry: buildNativeToolRegistry({ cwd: () => dir }),
      cwd: dir,
      model: 'm',
      lang: 'en',
      confirm: async () => 'y',
      toolSink: () => {},
      scratch: { tenantId: 'tenant-a', projectId: 'proj-a', sessionId: 'sess-a' },
    });
    await engine('go', { output: () => {}, onTurnEnd: () => {} });
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    expect(writeAuditEvent).toHaveBeenCalledWith(dir, 'repl', {
      tenantId: 'tenant-a',
      actor: 'native-agent',
      action: 'permission.auto-decision.deny',
      target: 'deckent_bash',
      metadata: {
        resource: 'echo hi',
        resourceClass: 'modify',
        matchedRule: 'rule-1',
        mode: 'default',
        tier: 'tier-1',
        grantLifetime: 'none',
        floor: false,
      },
    });
  });

  it('falls back to tenantId "local" when no scratch ids were supplied', async () => {
    createAgentSession.mockReturnValue(fakeSession);
    fakeSession.send.mockImplementation(async function* (): AsyncIterable<AgentEvent> {
      yield {
        type: 'permission-auto-decision',
        tool: 'deckent_write_file',
        resource: 'a.txt',
        resourceClass: 'modify',
        decision: 'allow',
        matchedRule: null,
        mode: 'default',
        tier: 'tier-0',
        grantLifetime: 'session',
        floor: true,
      };
    });
    const dir = tmpdir();
    const engine = createNativeEngine({
      adapter: noopAdapter(),
      registry: buildNativeToolRegistry({ cwd: () => dir }),
      cwd: dir,
      model: 'm',
      lang: 'en',
      confirm: async () => 'y',
      toolSink: () => {},
    });
    await engine('go', { output: () => {}, onTurnEnd: () => {} });
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    expect((writeAuditEvent.mock.calls[0]![2] as { tenantId: string }).tenantId).toBe('local');
  });

  it('engine.close delegates to session.close with the given options', () => {
    createAgentSession.mockReturnValue(fakeSession);
    const dir = tmpdir();
    const engine = createNativeEngine({
      adapter: noopAdapter(),
      registry: buildNativeToolRegistry({ cwd: () => dir }),
      cwd: dir,
      model: 'm',
      lang: 'en',
      confirm: async () => 'y',
      toolSink: () => {},
    });
    engine.close?.({ keepForRecoveryMs: 600_000 });
    expect(fakeSession.close).toHaveBeenCalledTimes(1);
    expect(fakeSession.close).toHaveBeenCalledWith({ keepForRecoveryMs: 600_000 });
  });
});

describe('resolveTraceEnabled (NT-13, 553-002) — config is the sole ON-authority', () => {
  it('config absent -> false regardless of env', () => {
    expect(resolveTraceEnabled(undefined, {})).toBe(false);
    expect(resolveTraceEnabled({}, { DECKENT_TRACE: '1' })).toBe(false);
  });

  it('config-off -> false regardless of env', () => {
    expect(resolveTraceEnabled({ training_trace: { enabled: false } }, {})).toBe(false);
    expect(resolveTraceEnabled({ training_trace: { enabled: false } }, { DECKENT_TRACE: '1' })).toBe(false);
  });

  it('config-on + env unset -> true', () => {
    expect(resolveTraceEnabled({ training_trace: { enabled: true } }, {})).toBe(true);
  });

  it('config-on + DECKENT_TRACE=0 -> false (env may only force OFF)', () => {
    expect(resolveTraceEnabled({ training_trace: { enabled: true } }, { DECKENT_TRACE: '0' })).toBe(false);
  });

  it('config-off + DECKENT_TRACE=1 -> still false (env can never force ON)', () => {
    expect(resolveTraceEnabled({ training_trace: { enabled: false } }, { DECKENT_TRACE: '1' })).toBe(false);
  });
});

describe('buildTurnRecorder (NT-13, 553-002) — filesystem behavior', () => {
  it('enabled=false never touches the filesystem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trace-off-'));
    try {
      const record = buildTurnRecorder({
        enabled: false,
        dir,
        sessionId: 's1',
        system: 'sys',
        model: 'm',
        now: () => '2026-08-18T00:00:00.000Z',
      });
      expect(record).toBeUndefined();
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enabled=true writes the trace file mode 0600 (posix only)', () => {
    if (process.platform === 'win32') return;
    const dir = mkdtempSync(join(tmpdir(), 'trace-on-'));
    try {
      const record = buildTurnRecorder({
        enabled: true,
        dir,
        sessionId: 's2',
        system: 'sys',
        model: 'm',
        now: () => '2026-08-18T00:00:00.000Z',
      });
      expect(record).toBeDefined();
      record!([{ role: 'user', content: 'hi' }]);
      const file = join(dir, 's2.jsonl');
      expect(readFileSync(file, 'utf-8').length).toBeGreaterThan(0);
      expect(statSync(file).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
