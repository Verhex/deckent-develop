import { describe, expect, it, vi } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { localizeNativeAgentSignal } from '../../src/cli/repl/native-agent-bridge.js';
import { createResolvedNativeEngine } from '../../src/cli/repl/run.js';
import type { NativeEngineDeps, ReplEngine } from '../../src/cli/repl/native-agent-bridge.js';
import type { ResolvedConfig } from '../../src/core/types.js';

const AUTHORED_BUDGET = {
  maxModelRounds: 73,
  maxToolCalls: 211,
  maxWallTimeMs: 420_000,
  maxCumulativeTokens: 654_321,
  maxNoProgressRounds: 6,
  checkpointEveryRounds: 11,
  checkpointEveryToolCalls: 37,
  outputReserveTokens: 2_048,
  contextSafetyReserveTokens: 4_096,
} as const;

describe('native-agent terminal budget wiring', () => {
  it('passes the config-resolved profile to engine construction', () => {
    const engine: ReplEngine = vi.fn(async () => undefined);
    const factory = vi.fn(() => engine);
    const config = {
      execution_budget: { native_agent: AUTHORED_BUDGET },
    } as unknown as ResolvedConfig;
    const deps = {
      adapter: {},
      registry: {},
      cwd: '/fixture/project',
      model: 'fixture-model',
      lang: 'en',
      confirm: vi.fn(async () => 'n' as const),
      toolSink: vi.fn(),
    } as unknown as NativeEngineDeps;

    expect(createResolvedNativeEngine(config, deps, factory)).toBe(engine);
    expect(factory).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({
      nativeBudget: AUTHORED_BUDGET,
      maxIterations: AUTHORED_BUDGET.maxModelRounds,
    }));
  });
});

const SIGNAL_CODES = [
  'native-budget.rounds-exhausted',
  'native-budget.toolcalls-exhausted',
  'native-budget.walltime-exhausted',
  'native-budget.tokens-exhausted',
  'native-budget.noprogress-terminated',
  'native.checkpoint.saved',
  'native.checkpoint.epoch-advanced',
  'native.checkpoint.degraded',
] as const;

describe('native-agent typed code localization', () => {
  it.each(SIGNAL_CODES)('%s renders non-empty, distinct en/tr messages', (code) => {
    const vars = { n: '3', rounds: '7', toolCalls: '19' };
    const en = localizeNativeAgentSignal((key) => getMessage(key, 'en', vars), code, 'raw fallback');
    const tr = localizeNativeAgentSignal((key) => getMessage(key, 'tr', vars), code, 'raw fallback');

    expect(en).not.toBe(code);
    expect(tr).not.toBe(code);
    expect(en.length).toBeGreaterThan(0);
    expect(tr.length).toBeGreaterThan(0);
    expect(en).not.toBe(tr);
  });

  it('renders the remaining-budget hint in both languages', () => {
    const vars = { rounds: '7', toolCalls: '19' };
    const en = getMessage('native-budget.remaining', 'en', vars);
    const tr = getMessage('native-budget.remaining', 'tr', vars);
    expect(en).toContain('7');
    expect(en).toContain('19');
    expect(tr).toContain('7');
    expect(tr).toContain('19');
    expect(en).not.toBe(tr);
  });

  it('falls back to the raw mechanism message for an unknown code', () => {
    expect(localizeNativeAgentSignal((key) => key, 'future-code', 'raw mechanism message'))
      .toBe('raw mechanism message');
  });
});
