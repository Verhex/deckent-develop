// tests/cli/native-propose-run-bootstrap.test.ts
// 557-003: `deckent_propose_run` performs a lazy, idempotent provider
// bootstrap (mirrors src/cli/commands/spawn.ts:397-405) before
// `controller.proposeRun`. Hermetic: `core/provider.js` is fully mocked —
// no network, no real provider CLI probing.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { RUN_FLOW_PROPOSAL_TOOL_NAME } from '../../src/cli/repl/cli-bridge-tool-specs.js';
import type { RunFlowController } from '../../src/cli/repl/run-flow-controller.js';
import type { RunFlowContext } from '../../src/core/run-flow-contract.js';

const listProvidersMock = vi.fn<[], string[]>();
const bootstrapProvidersMock = vi.fn<[unknown, string | undefined], Promise<unknown>>();

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: { listProviders: (...a: []) => listProvidersMock(...a) },
  bootstrapProviders: (...a: [unknown, string | undefined]) => bootstrapProvidersMock(...a),
}));

function fakeController(overrides?: Partial<RunFlowController>): RunFlowController {
  const collecting: RunFlowContext = { state: 'COLLECTING' };
  return {
    getContext: () => collecting,
    proposeRun: vi.fn(async () => collecting),
    approve: vi.fn(() => collecting),
    reject: vi.fn(() => collecting),
    ...overrides,
  };
}

function buildProposeRunTool(controller: RunFlowController) {
  const reg = buildNativeToolRegistry({
    cwd: () => tmpdir(),
    runFlow: { enabled: true, controller },
  });
  const tool = reg.get(RUN_FLOW_PROPOSAL_TOOL_NAME);
  expect(tool).toBeDefined();
  return tool!;
}

describe('deckent_propose_run — lazy provider bootstrap seam (557-003)', () => {
  beforeEach(() => {
    listProvidersMock.mockReset();
    bootstrapProvidersMock.mockReset();
  });

  it('bootstraps the provider registry BEFORE controller.proposeRun when the registry is empty', async () => {
    listProvidersMock.mockReturnValue([]);
    const order: string[] = [];
    bootstrapProvidersMock.mockImplementation(async () => {
      order.push('bootstrap');
      return undefined;
    });
    const controller = fakeController({
      proposeRun: vi.fn(async () => {
        order.push('proposeRun');
        return { state: 'COLLECTING' };
      }),
    });
    const tool = buildProposeRunTool(controller);

    const r = await tool.handler({ intentSummary: 'ship the thing' });

    expect(r).toEqual({ ok: true, output: JSON.stringify({ state: 'COLLECTING', preview: null }) });
    expect(order).toEqual(['bootstrap', 'proposeRun']);
    expect(bootstrapProvidersMock).toHaveBeenCalledTimes(1);
  });

  it('a bootstrap fault falls through to the existing honest [mcp-error] path — no throw escape, no new error shape', async () => {
    listProvidersMock.mockReturnValue([]);
    bootstrapProvidersMock.mockRejectedValue(new Error('boom: provider bootstrap unavailable'));
    const controller = fakeController({
      proposeRun: vi.fn(async () => {
        throw new Error('no provider available');
      }),
    });
    const tool = buildProposeRunTool(controller);

    const r = await tool.handler({ intentSummary: 'ship the thing' });

    expect(r).toEqual({ ok: false, output: '[mcp-error] deckent_propose_run: no provider available' });
    // the bootstrap fault itself never surfaces as a distinct error shape —
    // only the pre-existing controller.proposeRun catch produces output.
    expect(bootstrapProvidersMock).toHaveBeenCalledTimes(1);
  });

  it('skips the bootstrap seam entirely when the registry already has providers', async () => {
    listProvidersMock.mockReturnValue(['claude']);
    const controller = fakeController();
    const tool = buildProposeRunTool(controller);

    const r = await tool.handler({ intentSummary: 'ship the thing' });

    expect(r.ok).toBe(true);
    expect(bootstrapProvidersMock).not.toHaveBeenCalled();
  });

  it('does not double-bootstrap on a second call once the registry becomes populated (idempotent at the seam)', async () => {
    let populated = false;
    listProvidersMock.mockImplementation(() => (populated ? ['claude'] : []));
    bootstrapProvidersMock.mockImplementation(async () => {
      populated = true;
      return undefined;
    });
    const controller = fakeController();
    const tool = buildProposeRunTool(controller);

    await tool.handler({ intentSummary: 'first' });
    await tool.handler({ intentSummary: 'second' });

    expect(bootstrapProvidersMock).toHaveBeenCalledTimes(1);
  });
});
