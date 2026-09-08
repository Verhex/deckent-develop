import type { ModelType } from '../../core/model-registry.js';
import type { TokenUsage } from '../../core/token-usage.js';
import type { ProviderAdapter } from '../../core/provider.js';
import { buildPlannerSpawnArgs, createPlannerSpawn, resolveAdapter, type PlannerSpawnFn } from '../planner.js';

export interface GoalInvocationTransportResult {
  readonly output: string;
  readonly usage: TokenUsage;
  readonly provider: string;
  readonly model: string;
  readonly durationMs: number;
}

export class GoalInvocationTransportError extends Error {
  constructor(
    readonly outcome: 'failed' | 'timeout' | 'unknown',
    readonly reasonCode: 'command_build_failed' | 'spawn_error' | 'nonzero_exit' | 'timeout' | 'empty_output' | 'validation_failed',
    readonly exitCode: number | null,
    readonly signal: string | null,
    readonly durationMs: number,
    readonly dispatchStarted: boolean,
  ) {
    super(reasonCode === 'validation_failed' && dispatchStarted
      ? 'GOAL_PROVIDER_REPORTED_USAGE_UNAVAILABLE'
      : reasonCode === 'validation_failed'
        ? 'GOAL_SELECTED_TRANSPORT_IDENTITY_MISMATCH'
        : 'GOAL_SELECTED_TRANSPORT_FAILED');
    this.name = 'GoalInvocationTransportError';
  }
}

export function createGoalInvocationTransport(options: {
  readonly spawn?: PlannerSpawnFn;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly now?: () => number;
  readonly resolveAdapter?: (provider: string, model: string) => ProviderAdapter;
} = {}) {
  const spawn = options.spawn ?? createPlannerSpawn();
  const now = options.now ?? (() => performance.now());
  return async (input: { provider: string; model: string; prompt: string; maxWallClockSeconds?: number }): Promise<GoalInvocationTransportResult> => {
    const started = now();
    let adapter: ProviderAdapter;
    let spec: ReturnType<typeof buildPlannerSpawnArgs>;
    try {
      adapter = options.resolveAdapter?.(input.provider, input.model)
        ?? resolveAdapter(undefined, input.model as ModelType, input.provider);
      spec = buildPlannerSpawnArgs(adapter, input.prompt, input.model as ModelType);
    } catch {
      throw new GoalInvocationTransportError('failed', 'command_build_failed', null, null, Math.max(0, now() - started), false);
    }
    if (spec.calledProvider !== input.provider || spec.calledModel !== input.model) {
      throw new GoalInvocationTransportError('failed', 'validation_failed', null, null, Math.max(0, now() - started), false);
    }
    let result;
    try {
      result = await spawn(spec.command, spec.args, {
        timeoutMs: input.maxWallClockSeconds === undefined
          ? (options.timeoutMs ?? 120_000)
          : input.maxWallClockSeconds * 1_000,
        maxOutputBytes: options.maxOutputBytes ?? 10 * 1024 * 1024,
        ...(spec.stdin === undefined ? {} : { stdin: spec.stdin }),
      });
    } catch {
      throw new GoalInvocationTransportError('unknown', 'spawn_error', null, null, Math.max(0, now() - started), true);
    }
    if (result.error || result.signal || result.status !== 0) {
      const timedOut = result.signal === 'SIGTERM' || result.signal === 'SIGKILL';
      throw new GoalInvocationTransportError(timedOut ? 'timeout' : (result.error ? 'unknown' : 'failed'),
        timedOut ? 'timeout' : result.error ? 'spawn_error' : 'nonzero_exit', result.status,
        result.signal, Math.max(0, now() - started), true);
    }
    const usage = adapter.extractUsage?.(result.stdout) ?? null;
    if (!usage || usage.source !== 'provider-adapter') {
      throw new GoalInvocationTransportError('failed', 'validation_failed', result.status, result.signal, Math.max(0, now() - started), true);
    }
    return Object.freeze({
      output: adapter.parseAgentResponse?.(result.stdout) ?? result.stdout,
      usage,
      provider: spec.calledProvider,
      model: spec.calledModel,
      durationMs: Math.max(0, now() - started),
    });
  };
}
