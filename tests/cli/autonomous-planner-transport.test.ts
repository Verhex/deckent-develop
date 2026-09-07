import { describe, expect, it, vi } from 'vitest';
import { PlannerSpawnOutputLimitError } from '../../src/orchestra/planner.js';
import type { PlannerSpawnFn, PlannerSpawnOutcome } from '../../src/orchestra/planner.js';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';

const adapter = {
  name: 'test-provider',
  parseAgentResponse: (raw: string) => (JSON.parse(raw) as { result: string }).result,
};

vi.mock('../../src/orchestra/planner.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/orchestra/planner.js')>(),
  resolveAdapter: () => adapter,
  buildPlannerSpawnArgs: (_adapter: unknown, prompt: string) => {
    const [mode, payload = ''] = prompt.split(':', 2);
    return {
      command: `test-${mode}`,
      args: mode === 'argv' ? [payload] : [],
      ...(mode === 'stdin' ? { stdin: payload } : {}),
      calledProvider: 'test-provider',
      calledModel: 'test-model',
      transport: 'cli',
      executionBackend: 'host',
    };
  },
}));

import { realPlannerComplete } from '../../src/cli/commands/autonomous.js';

const success = (result: string): PlannerSpawnOutcome => ({
  status: 0, signal: null, stdout: JSON.stringify({ result }), stderr: '',
});

describe('autonomous planner subprocess transport', () => {
  it('delivers adapter-owned stdin larger than 128 KiB without putting it in argv', async () => {
    const payload = 'p'.repeat(160 * 1024);
    const plannerSpawn = vi.fn<PlannerSpawnFn>(async (_command, args, opts) => {
      expect(args).toEqual([]);
      return success(opts.stdin ?? '');
    });
    await expect(realPlannerComplete('test-model', { plannerSpawn })(`stdin:${payload}`)).resolves.toBe(payload);
    expect(plannerSpawn).toHaveBeenCalledWith('test-stdin', [], {
      timeoutMs: 120_000,
      maxOutputBytes: 10 * 1024 * 1024,
      stdin: payload,
    });
  });

  it('preserves argv-fed adapters without synthesizing stdin', async () => {
    const plannerSpawn = vi.fn<PlannerSpawnFn>(async (_command, args, opts) => {
      expect(opts).not.toHaveProperty('stdin');
      return success(args[0] ?? '');
    });
    await expect(realPlannerComplete('test-model', { plannerSpawn })('argv:argv-prompt')).resolves.toBe('argv-prompt');
  });

  it('surfaces spawn errors through the canonical planner error', async () => {
    const plannerSpawn: PlannerSpawnFn = async () => ({ status: null, signal: null, stdout: '', stderr: '', error: new Error('ENOENT') });
    await expect(realPlannerComplete('test-model', { plannerSpawn })('spawn-error:')).rejects.toThrow(/Planner could not start \(test-provider\).*ENOENT/u);
  });

  it('classifies the deadline as timeout and forwards its configured bound', async () => {
    const plannerSpawn = vi.fn<PlannerSpawnFn>(async () => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' }));
    await expect(realPlannerComplete('test-model', { timeoutMs: 20, plannerSpawn })('timeout:')).rejects.toThrow(/Planner timed out \(test-provider\)/u);
    expect(plannerSpawn).toHaveBeenCalledWith('test-timeout', [], {
      timeoutMs: 20,
      maxOutputBytes: 10 * 1024 * 1024,
    });
  });

  it('rejects non-zero status even when the provider wrote partial stdout', async () => {
    const plannerSpawn: PlannerSpawnFn = async () => ({ status: 7, signal: null, stdout: JSON.stringify({ result: 'must-not-pass' }), stderr: 'provider failed' });
    await expect(realPlannerComplete('test-model', { plannerSpawn })('partial:')).rejects.toThrow(/Planner exited with status 7.*provider failed/u);
  });

  it('unwraps the provider response envelope only after successful transport', async () => {
    const plannerSpawn: PlannerSpawnFn = async () => success('inner-result');
    await expect(realPlannerComplete('test-model', { plannerSpawn })('envelope:')).resolves.toBe('inner-result');
  });

  it('retains the existing bounded response limit', async () => {
    const plannerSpawn: PlannerSpawnFn = async () => success('x'.repeat(512));
    await expect(realPlannerComplete('test-model', { maxBufferBytes: 128, plannerSpawn })('overflow:')).rejects.toThrow(/Planner response exceeded 128 bytes/u);
  });

  it('does not block the event loop while the planner transport is pending', async () => {
    let release!: (outcome: PlannerSpawnOutcome) => void;
    const plannerSpawn: PlannerSpawnFn = () => new Promise(resolve => { release = resolve; });
    const completion = realPlannerComplete('test-model', { plannerSpawn })('delay:');
    let turnObserved = false;
    await new Promise<void>(resolve => setImmediate(() => { turnObserved = true; resolve(); }));
    expect(turnObserved).toBe(true);
    release(success('delayed'));
    await expect(completion).resolves.toBe('delayed');
  });

  it('registers every planner transport failure in both supported languages', () => {
    const keys = [
      'autonomous.planner.spawn_failed',
      'autonomous.planner.timeout',
      'autonomous.planner.response_limit',
      'autonomous.planner.exit_failed',
    ];
    for (const key of keys) {
      expect(getMessageLanguages(key)).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en')).not.toBe(key);
      expect(getMessage(key, 'tr')).not.toBe(key);
    }
  });

  it('renders the typed transport failure in Turkish at the CLI boundary', async () => {
    const plannerSpawn: PlannerSpawnFn = async () => ({
      status: null, signal: null, stdout: '', stderr: '', error: new Error('ENOENT'),
    });
    await expect(realPlannerComplete('test-model', { plannerSpawn, lang: 'tr' })('spawn-error:'))
      .rejects.toThrow(/Planner başlatılamadı.*ENOENT/u);
  });

  it('localizes the canonical typed output-limit failure without leaking its core message', async () => {
    const plannerSpawn: PlannerSpawnFn = async () => ({
      status: null,
      signal: 'SIGKILL',
      stdout: '',
      stderr: '',
      error: new PlannerSpawnOutputLimitError(256),
    });
    await expect(realPlannerComplete('test-model', { plannerSpawn, lang: 'tr' })('overflow:'))
      .rejects.toThrow(/Planner yanıtı 256 bayt sınırını aştı/u);
  });
});
