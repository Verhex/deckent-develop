import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

import { registerOutput } from '../../src/cli/commands/output.js';
import { registerWatch } from '../../src/cli/commands/watch.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import type { TaskOutputReadResult, TaskOutputReadService } from '../../src/core/task-output-read-service.js';

class MemorySink extends EventEmitter {
  readonly chunks: string[] = [];
  write(chunk: string, callback: (error?: Error | null) => void): boolean {
    this.chunks.push(chunk);
    queueMicrotask(() => callback());
    return true;
  }
}

const identity = {
  projectId: 'project-fixture', taskId: '719-001', sprintId: 'sprint-719',
  attemptId: 'attempt-1', generation: 1, dispatchRequestId: `dreq-${'a'.repeat(64)}`,
  tenantId: 'tenant-a', provider: 'codex', model: 'gpt-5.6-terra',
};
const policy = {
  strictTenantIsolation: true,
  limits: {
    maxPendingBytes: 1024 * 1024, maxTailLines: 10_000, maxTailBytes: 4 * 1024 * 1024,
    termGraceMs: 100, reapObservationMs: 100, streamCloseMs: 100,
  },
};

function setup(
  read: TaskOutputReadResult,
  observe: TaskOutputReadService['observe'] = vi.fn(),
  useActualPrincipal = false,
) {
  const stdout = new MemorySink();
  const signals = new EventEmitter();
  const warningSink = vi.fn();
  const setExitCode = vi.fn();
  const service: TaskOutputReadService = { read: vi.fn(() => read), observe };
  const deps = {
    resolveProjectRootFn: () => '/project', readPolicy: () => policy,
    createService: () => service,
    ...(!useActualPrincipal ? { resolvePrincipal: () => ({
      id: 'operator', tenantId: 'tenant-a', identityClass: 'local' as const,
      assurance: 'os-user' as const, provenance: 'cli' as const, verifiedBy: 'test',
    }) } : {}),
    stdout, signalHost: signals, warningSink, setExitCode,
  };
  const program = new Command().exitOverride();
  registerWatch(program, deps);
  registerOutput(program, deps);
  return { program, stdout, signals, warningSink, setExitCode, service };
}

async function parse(program: Command, args: readonly string[]): Promise<void> {
  await program.parseAsync(['node', 'deckent', ...args], { from: 'node' });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('watch output canonical and legacy surfaces', () => {
  it('registers the real child and preserves exact selectors without dashboard checks', async () => {
    const h = setup({ state: 'unavailable', reasonCode: 'admission-not-found' });
    await parse(h.program, ['watch', 'output', '719-001', '--tail', '7', '--follow',
      '--sprint-id', 'sprint-719', '--attempt-id', 'attempt-1',
      '--dispatch-request-id', `dreq-${'a'.repeat(64)}`]);
    expect(h.service.read).toHaveBeenCalledWith(expect.objectContaining({
      taskId: '719-001', sprintId: 'sprint-719', attemptId: 'attempt-1',
      dispatchRequestId: `dreq-${'a'.repeat(64)}`, strictTenantIsolation: true,
      caller: { id: 'operator', tenantId: 'tenant-a' },
    }));
    expect(h.stdout.chunks.join('')).toContain('admission-not-found');
    expect(h.setExitCode).toHaveBeenCalledWith(1);
  });

  it('renders ambiguous identity distinctly and never starts an observer', async () => {
    const observe = vi.fn();
    const h = setup({ state: 'ambiguous', reasonCode: 'multiple-exact-attempts', candidateCount: 2 }, observe);
    await parse(h.program, ['watch', 'output', '719-001']);
    expect(h.stdout.chunks.join('')).toContain('--attempt-id');
    expect(observe).not.toHaveBeenCalled();
  });

  it('honors command-local Turkish under opposite ambient language', async () => {
    vi.stubEnv('DECKENT_LANGUAGE', 'en');
    const h = setup({ state: 'not-dispatched', identity, receiptDigest: `sha256:${'b'.repeat(64)}`,
      reasonCode: 'DAEMON_ABSENT' });
    await parse(h.program, ['watch', 'output', '719-001', '--lang', 'tr']);
    expect(h.stdout.chunks.join('')).toContain('dispatch edilmedi');
  });

  it('projects the actual OS principal to the reader exact caller shape', async () => {
    const h = setup({ state: 'unavailable', reasonCode: 'admission-not-found' }, vi.fn(), true);
    await parse(h.program, ['watch', 'output', '719-001']);
    const caller = vi.mocked(h.service.read).mock.calls[0]![0].caller;
    expect(Reflect.ownKeys(caller)).toEqual(['id']);
    expect(caller.id).toMatch(/@/u);
  });

  it('sanitizes sealed content before tailing and never serializes raw content or capability', async () => {
    const h = setup({
      state: 'sealed', identity, capability: Object.freeze({}) as never,
      source: 'pristine-provider-stream', encoding: 'utf8',
      content: 'first\nsecret sk-test-abcdefghijklmnopqrstuvwxyz\nlast\n',
      receiptDigest: `sha256:${'c'.repeat(64)}`, contentSha256: `sha256:${'d'.repeat(64)}`,
      byteLength: 52, capturedAt: '2026-09-09T00:00:00.000Z',
      providerExitReceiptDigest: `sha256:${'e'.repeat(64)}`,
    });
    await parse(h.program, ['watch', 'output', '719-001', '--json', '--tail', '2']);
    const events = h.stdout.chunks.map(chunk => JSON.parse(chunk) as Record<string, unknown>);
    expect(JSON.stringify(events)).not.toContain('sk-test-abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(events)).not.toContain('capability');
    expect(events.some(event => event.type === 'lines')).toBe(true);
    expect(events.at(-1)?.type).toBe('end');
  });

  it('keeps legacy --follow stdout as NDJSON and sends its sole deprecation warning to stderr sink', async () => {
    const capability = Object.freeze({}) as never;
    const observe = vi.fn(async (_capability, input) => {
      await input.onChunk(Buffer.from('live\n'), 'stdout');
      return { state: 'closed' as const, terminalMeaning: 'observer-only' as const };
    });
    const h = setup({ state: 'pending', identity, phase: 'provider-exit', capability }, observe);
    await parse(h.program, ['output', '719-001', '--json', '--follow', '--lang', 'en']);
    expect(h.warningSink).toHaveBeenCalledWith(getMessage('cli.batch.deprecated.output', 'en'));
    expect(h.stdout.chunks.every(chunk => {
      try { JSON.parse(chunk); return true; } catch { return false; }
    })).toBe(true);
    expect(observe).toHaveBeenCalledWith(capability, expect.objectContaining({ follow: true, tail: 50 }));
  });

  it.each(['0x10', '', '-1', '1.5'])('rejects non-decimal tail %j before the reader', async tail => {
    const h = setup({ state: 'unavailable', reasonCode: 'admission-not-found' });
    await parse(h.program, ['watch', 'output', '719-001', '--tail', tail]);
    expect(h.service.read).not.toHaveBeenCalled();
    expect(h.setExitCode).toHaveBeenCalledWith(1);
  });

  it('keeps invalid local language machine output valid NDJSON', async () => {
    const h = setup({ state: 'unavailable', reasonCode: 'admission-not-found' });
    await parse(h.program, ['watch', 'output', '719-001', '--json', '--lang', 'de']);
    expect(h.stdout.chunks).toHaveLength(1);
    expect(JSON.parse(h.stdout.chunks[0]!)).toEqual({
      type: 'end', result: { state: 'held', reason: 'invalid-view' },
    });
  });

  it('sets failure for an unavailable live observer without inferring task failure', async () => {
    const capability = Object.freeze({}) as never;
    const h = setup({ state: 'pending', identity, phase: 'provider-exit', capability },
      vi.fn(async () => ({ state: 'unavailable' as const, reasonCode: 'daemon-unavailable' as const })));
    await parse(h.program, ['watch', 'output', '719-001', '--follow']);
    expect(h.stdout.chunks.join('')).toContain('worker outcome is unknown');
    expect(h.setExitCode).toHaveBeenCalledWith(1);
  });

  it('aborts only the observer client on SIGINT and reports no worker cancellation', async () => {
    const capability = Object.freeze({}) as never;
    const observe = vi.fn(async (_capability, input) => new Promise(resolve => {
      input.signal.addEventListener('abort', () => resolve({ state: 'aborted' as const }), { once: true });
      queueMicrotask(() => h.signals.emit('SIGINT'));
    }));
    const h = setup({ state: 'pending', identity, phase: 'provider-exit', capability }, observe);
    await parse(h.program, ['watch', 'output', '719-001', '--follow']);
    expect(h.stdout.chunks.join('')).toContain('worker was not cancelled');
    expect(h.signals.listenerCount('SIGINT')).toBe(0);
  });
});
