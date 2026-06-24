/**
 * Tick-wiring verification for `deckent flow run` (task 323-023).
 *
 * Evidence:
 *   --once  : runtime.tick(callback) called directly (flow.ts:157)
 *   daemon  : runtime.start(callback) called; start() wires setInterval(()=>tick(cb)) (flow-runtime.ts:47)
 *
 * This file captures the callback passed to start(), invokes it (simulating the
 * interval firing), and asserts that handleFlowDispatchTick executes — proving the
 * full tick chain end-to-end without requiring a 60-second wait.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

vi.mock('../../../src/core/scheduled-flow.js', () => ({
  parseCronExpr: vi.fn(),
}));

vi.mock('../../../src/core/flow-registry.js', () => ({
  FlowRegistry: vi.fn().mockImplementation(() => ({
    addFlow: vi.fn(),
    listFlows: vi.fn().mockReturnValue([]),
  })),
}));

const mockTick = vi.fn();
const mockStart = vi.fn();
const mockStop = vi.fn();

vi.mock('../../../src/core/flow-runtime.js', () => ({
  FlowRuntime: vi.fn().mockImplementation(() => ({
    tick: mockTick,
    start: mockStart,
    stop: mockStop,
    running: false,
  })),
}));

import { print } from '../../../src/cli/helpers/output.js';
import { resolveProjectRoot } from '../../../src/cli/helpers/process.js';
import { registerFlow } from '../../../src/cli/commands/flow.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'flow-tick-'));
  tmpDirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function buildProgram(): Command {
  const program = new Command().exitOverride();
  registerFlow(program);
  return program;
}

async function run(...args: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(['node', 'deckent', ...args]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('flow run tick-wiring verification', () => {
  let projectRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = makeTmpDir();
    vi.mocked(resolveProjectRoot).mockReturnValue(projectRoot);

    // Default: tick fires the callback immediately with empty dispatches
    mockTick.mockImplementation((cb: (d: unknown[]) => void) => cb([]));
    mockStart.mockImplementation(() => {});
    mockStop.mockImplementation(() => {});
  });

  // ── --once path ────────────────────────────────────────────────────────────

  describe('--once flag: direct tick call', () => {
    it('calls runtime.tick exactly once', async () => {
      await run('flow', 'run', '--once');

      expect(mockTick).toHaveBeenCalledOnce();
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('tick callback receives dispatches and routes through handleFlowDispatchTick', async () => {
      // Simulate tick returning 0 dispatches → "No flows due." message
      mockTick.mockImplementation((cb: (d: unknown[]) => void) => cb([]));
      await run('flow', 'run', '--once');

      expect(print).toHaveBeenCalledWith('No flows due.');
    });

    it('tick callback with due flows emits self-dispatch queue report', async () => {
      // Simulate tick returning 2 due flow items
      mockTick.mockImplementation((cb: (d: unknown[]) => void) => cb([{}, {}]));
      await run('flow', 'run', '--once');

      const allOutput = vi.mocked(print).mock.calls.map(c => c[0] as string).join('\n');
      expect(allOutput).toContain('2 flow(s) due');
    });
  });

  // ── daemon path ────────────────────────────────────────────────────────────

  describe('daemon mode: start() wires tick via setInterval', () => {
    it('calls runtime.start (not tick) for daemon setup', async () => {
      await run('flow', 'run');

      expect(mockStart).toHaveBeenCalledOnce();
      expect(mockTick).not.toHaveBeenCalled(); // tick deferred to interval
    });

    it('prints daemon-started message', async () => {
      await run('flow', 'run');

      expect(print).toHaveBeenCalledWith(expect.stringContaining('daemon'));
    });

    it('daemon callback invokes handleFlowDispatchTick when interval fires', async () => {
      // Capture the callback that flow.ts passes to runtime.start.
      // This callback is what FlowRuntime calls on every setInterval tick
      // (source: flow-runtime.ts:47 → `() => this.tick(callback)`).
      let capturedCallback: ((dispatches: unknown[]) => void) | undefined;
      mockStart.mockImplementation((cb: (d: unknown[]) => void) => {
        capturedCallback = cb;
      });

      await run('flow', 'run');

      expect(capturedCallback).toBeDefined();

      // Simulate the setInterval firing with 0 due flows
      capturedCallback!([]);

      // handleFlowDispatchTick must have run: it always emits "No flows due."
      expect(print).toHaveBeenCalledWith('No flows due.');
    });

    it('daemon callback with due flows queues self-dispatch and reports correctly', async () => {
      let capturedCallback: ((dispatches: unknown[]) => void) | undefined;
      mockStart.mockImplementation((cb: (d: unknown[]) => void) => {
        capturedCallback = cb;
      });

      await run('flow', 'run');
      expect(capturedCallback).toBeDefined();

      // Simulate interval firing with 1 due flow dispatch
      capturedCallback!([{ kind: 'scheduled' }]);

      const allOutput = vi.mocked(print).mock.calls.map(c => c[0] as string).join('\n');
      expect(allOutput).toContain('1 flow(s) due');
    });
  });
});
