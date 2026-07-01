import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../src/core/tool-registry.js';
import { ToolSearchIndex } from '../../src/core/tool-search.js';
import {
  dispatchToolCall,
  meetsRiskThreshold,
  RISK_ORDER,
  DEFAULT_RISK_THRESHOLD,
  type ToolDispatchPlan,
  type ConfirmFn,
  type ExecImplFn,
} from '../../src/core/tool-dispatch.js';

function plan(overrides: Partial<ToolDispatchPlan> = {}): ToolDispatchPlan {
  return {
    name: 'deckent_kill',
    status: 'valid',
    risk: 'destructive',
    category: 'lifecycle',
    args: { taskId: '123' },
    ...overrides,
  };
}

function fixedClock(times: string[]): () => Date {
  let i = 0;
  return () => new Date(times[Math.min(i++, times.length - 1)]);
}

describe('meetsRiskThreshold / RISK_ORDER', () => {
  it('orders safe < moderate < destructive', () => {
    expect(RISK_ORDER.safe).toBeLessThan(RISK_ORDER.moderate);
    expect(RISK_ORDER.moderate).toBeLessThan(RISK_ORDER.destructive);
  });

  it('meets the threshold at and above it, not below', () => {
    expect(meetsRiskThreshold('moderate', 'moderate')).toBe(true);
    expect(meetsRiskThreshold('destructive', 'moderate')).toBe(true);
    expect(meetsRiskThreshold('safe', 'moderate')).toBe(false);
  });

  it('DEFAULT_RISK_THRESHOLD is moderate', () => {
    expect(DEFAULT_RISK_THRESHOLD).toBe('moderate');
  });
});

describe('dispatchToolCall — short-circuit on non-valid plan status', () => {
  it('unknown_tool: returns status unknown_tool without calling confirm or execImpl', async () => {
    const confirm = vi.fn<ConfirmFn>();
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(
      plan({ name: 'does_not_exist', status: 'unknown_tool', risk: undefined, category: undefined, args: {} }),
      { confirm, execImpl },
    );
    expect(result.status).toBe('unknown_tool');
    expect(confirm).not.toHaveBeenCalled();
    expect(execImpl).not.toHaveBeenCalled();
    expect(result.telemetry.confirmRequired).toBe(false);
  });

  it('invalid: returns status invalid without calling confirm or execImpl', async () => {
    const confirm = vi.fn<ConfirmFn>();
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(plan({ status: 'invalid' }), { confirm, execImpl });
    expect(result.status).toBe('invalid');
    expect(confirm).not.toHaveBeenCalled();
    expect(execImpl).not.toHaveBeenCalled();
  });
});

describe('dispatchToolCall — risk gate', () => {
  it('safe risk skips confirm entirely, even when no confirm is supplied', async () => {
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ok');
    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl });
    expect(result.status).toBe('executed');
    expect(result.result).toBe('ok');
    expect(result.telemetry.confirmRequired).toBe(false);
    expect(result.telemetry.confirmDecision).toBeUndefined();
    expect(execImpl).toHaveBeenCalledWith({ name: 'deckent_kill', args: { taskId: '123' } });
  });

  it('moderate/destructive risk with confirm=allow runs execImpl and reports executed', async () => {
    const confirm = vi.fn<ConfirmFn>().mockResolvedValue('allow');
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue({ killed: true });
    const result = await dispatchToolCall(plan({ risk: 'destructive' }), { confirm, execImpl });
    expect(confirm).toHaveBeenCalledWith({
      toolName: 'deckent_kill',
      risk: 'destructive',
      category: 'lifecycle',
      args: { taskId: '123' },
    });
    expect(result.status).toBe('executed');
    expect(result.result).toEqual({ killed: true });
    expect(result.telemetry.confirmRequired).toBe(true);
    expect(result.telemetry.confirmDecision).toBe('allow');
  });

  it('confirm=deny denies the call and never runs execImpl', async () => {
    const confirm = vi.fn<ConfirmFn>().mockResolvedValue('deny');
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(plan({ risk: 'moderate' }), { confirm, execImpl });
    expect(result.status).toBe('denied');
    expect(execImpl).not.toHaveBeenCalled();
    expect(result.telemetry.confirmRequired).toBe(true);
    expect(result.telemetry.confirmDecision).toBe('deny');
  });

  it('fail-closed: risk meets threshold but no confirm supplied -> denied, execImpl never runs', async () => {
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(plan({ risk: 'destructive' }), { execImpl });
    expect(result.status).toBe('denied');
    expect(execImpl).not.toHaveBeenCalled();
    expect(result.telemetry.confirmRequired).toBe(true);
    expect(result.telemetry.confirmDecision).toBe('deny');
  });

  it('custom riskThreshold: raising it to destructive lets moderate calls skip confirm', async () => {
    const confirm = vi.fn<ConfirmFn>();
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ran');
    const result = await dispatchToolCall(plan({ risk: 'moderate' }), {
      confirm,
      execImpl,
      riskThreshold: 'destructive',
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(result.status).toBe('executed');
    expect(result.telemetry.confirmRequired).toBe(false);
  });

  it('a missing risk on a valid plan defensively falls back to destructive (requires confirm)', async () => {
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(plan({ risk: undefined }), { execImpl });
    expect(result.status).toBe('denied');
    expect(execImpl).not.toHaveBeenCalled();
  });
});

describe('dispatchToolCall — deterministic error-wrapping', () => {
  it('a throw from execImpl becomes a structured error, never rethrown', async () => {
    const execImpl = vi.fn<ExecImplFn>().mockImplementation(() => {
      throw new Error('boom');
    });
    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl });
    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error?.name).toBe('Error');
    expect(result.error?.message).toBe('boom');
  });

  it('a rejected promise from execImpl becomes a structured error', async () => {
    const execImpl = vi.fn<ExecImplFn>().mockRejectedValue(new TypeError('bad args'));
    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl });
    expect(result.status).toBe('error');
    expect(result.error).toEqual(expect.objectContaining({ name: 'TypeError', message: 'bad args' }));
  });

  it('a non-Error throw is wrapped without fabricating a stack', async () => {
    const execImpl = vi.fn<ExecImplFn>().mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'plain string throw';
    });
    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl });
    expect(result.status).toBe('error');
    expect(result.error).toEqual({ name: 'NonErrorThrown', message: 'plain string throw' });
  });

  it('a throw from confirm becomes a structured error and never runs execImpl', async () => {
    const confirm = vi.fn<ConfirmFn>().mockImplementation(() => {
      throw new Error('approval service down');
    });
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(plan({ risk: 'destructive' }), { confirm, execImpl });
    expect(result.status).toBe('error');
    expect(result.error?.message).toBe('approval service down');
    expect(execImpl).not.toHaveBeenCalled();
  });

  it('dispatchToolCall itself never rejects even when both seams throw', async () => {
    const confirm = vi.fn<ConfirmFn>().mockRejectedValue(new Error('unreachable'));
    const execImpl = vi.fn<ExecImplFn>();
    await expect(dispatchToolCall(plan({ risk: 'destructive' }), { confirm, execImpl })).resolves.toBeDefined();
  });
});

describe('dispatchToolCall — telemetry', () => {
  it('reports toolName/risk/category/status and a non-negative duration using the injected clock', async () => {
    const now = fixedClock(['2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.250Z']);
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ok');
    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, now });
    expect(result.telemetry).toEqual({
      toolName: 'deckent_kill',
      status: 'executed',
      risk: 'safe',
      category: 'lifecycle',
      confirmRequired: false,
      startedAt: '2026-07-01T00:00:00.000Z',
      finishedAt: '2026-07-01T00:00:00.250Z',
      durationMs: 250,
    });
  });

  it('telemetry.status always matches the top-level result.status', async () => {
    const confirm = vi.fn<ConfirmFn>().mockResolvedValue('deny');
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(plan({ risk: 'moderate' }), { confirm, execImpl });
    expect(result.telemetry.status).toBe(result.status);
  });
});

describe('dispatchToolCall — integration with real planCall output', () => {
  function buildRegistry(): ToolRegistry {
    const registry = new ToolRegistry();
    registry.registerFromShape(
      {
        name: 'deckent_status',
        description: 'Get the current sprint dashboard',
        paramsSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      { category: 'monitoring', handlerRef: 'mcp:deckent_status' },
    );
    registry.registerFromShape(
      {
        name: 'deckent_kill',
        description: 'Stop one or all running workers',
        paramsSchema: z.object({ taskId: z.string().optional(), all: z.boolean().optional() }),
        annotations: { destructiveHint: true },
      },
      { category: 'lifecycle', handlerRef: 'mcp:deckent_kill' },
    );
    return registry;
  }

  it('a safe/readOnly tool planned via the real ToolSearchIndex executes without confirm', async () => {
    const index = new ToolSearchIndex(buildRegistry());
    const args = {};
    const dispatchPlan: ToolDispatchPlan = { ...index.planCall('deckent_status', args), args };
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue({ agents: [] });
    const result = await dispatchToolCall(dispatchPlan, { execImpl });
    expect(result.status).toBe('executed');
    expect(execImpl).toHaveBeenCalledWith({ name: 'deckent_status', args: {} });
  });

  it('a destructive tool planned via the real ToolSearchIndex is denied without a confirm seam', async () => {
    const index = new ToolSearchIndex(buildRegistry());
    const args = { all: true };
    const dispatchPlan: ToolDispatchPlan = { ...index.planCall('deckent_kill', args), args };
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(dispatchPlan, { execImpl });
    expect(result.status).toBe('denied');
    expect(execImpl).not.toHaveBeenCalled();
  });

  it('an invalid call planned via the real ToolSearchIndex short-circuits before any exec', async () => {
    const index = new ToolSearchIndex(buildRegistry());
    const args = { taskId: 42 };
    const dispatchPlan: ToolDispatchPlan = { ...index.planCall('deckent_kill', args), args };
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(dispatchPlan, { execImpl });
    expect(result.status).toBe('invalid');
    expect(execImpl).not.toHaveBeenCalled();
  });
});

describe('dispatchToolCall — no registry/search mutation', () => {
  it('never touches the registry: dispatching a call has no observable side effect on it', async () => {
    const registry = buildRegistryForNoMutationCheck();
    const index = new ToolSearchIndex(registry);
    const args = {};
    const dispatchPlan: ToolDispatchPlan = { ...index.planCall('deckent_status', args), args };
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ok');
    await dispatchToolCall(dispatchPlan, { execImpl });
    expect(registry.size).toBe(1);
    expect(registry.has('deckent_status')).toBe(true);
  });
});

function buildRegistryForNoMutationCheck(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerFromShape(
    { name: 'deckent_status', description: 'status', paramsSchema: z.object({}), annotations: { readOnlyHint: true } },
    { category: 'monitoring', handlerRef: 'mcp:deckent_status' },
  );
  return registry;
}
