import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn(() => ({
      name: 'docker',
      liveUsageBudgetSupport: 'measured-stream',
      spawn: backend.spawn,
      kill: vi.fn(),
      list: vi.fn(() => []),
      isAvailable: vi.fn(async () => true),
    })),
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
}));

import { spawnWorkerMultiProvider } from '../../src/cli/commands/spawn.js';
import { taskResultSettlementAttemptPath } from '../../src/core/task-result-settlement.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

afterEach(() => {
  vi.clearAllMocks();
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('spawnWorkerMultiProvider Docker settlement attempt', () => {
  it('durably journals the exact attempt before backend.spawn can perform provider work', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-spawn-attempt-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');

    backend.spawn.mockImplementation((_taskId, _model, _prompt, opts) => {
      expect(opts?.settlementRef).toBeDefined();
      expect(existsSync(taskResultSettlementAttemptPath(opts!.settlementRef!))).toBe(true);
    });

    const result = await spawnWorkerMultiProvider(
      'attempt-a',
      'claude-sonnet-5',
      'bounded prompt',
      root,
      {
        provider: 'claude',
        spawnBackend: 'docker',
        executionBudget: { maxTurns: 1 },
      },
    );

    expect(result.settlementRef).toBeDefined();
    expect(JSON.parse(readFileSync(
      taskResultSettlementAttemptPath(result.settlementRef!),
      'utf-8',
    ))).toMatchObject({
      taskId: 'attempt-a',
      backend: 'docker',
      state: 'pending',
    });
    expect(backend.spawn).toHaveBeenCalledOnce();
  });
});
