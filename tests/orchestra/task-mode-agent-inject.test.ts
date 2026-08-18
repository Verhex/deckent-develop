import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  TASKS_DIR: '.tasks',
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  // Plain functions (not vi.fn) so beforeEach resetAllMocks cannot strip the
  // implementation the spawner depends on (skillDelivery.deliveredSkillIds).
  writeSkillDeliveryEvidence: () => {},
  applySkillDirectiveAuthority: (task: { assignedSkills?: string[] }) => task?.assignedSkills ?? [],
  buildSkillDeliveryEvidence: (task: { id?: string; assignedSkills?: string[]; forceSkills?: string[] }, delivered?: readonly string[]) => ({
    version: 1, taskId: task?.id ?? '', source: 'worker-prompt',
    deliveredSkillIds: [...(delivered ?? [])],
    assignedSkillIds: [...(task?.assignedSkills ?? [])],
    forcedSkillIds: [...(task?.forceSkills ?? [])],
    undeliveredForcedSkillIds: (task?.forceSkills ?? []).filter((id) => !(delivered ?? []).includes(id)),
  }),
  buildWorkerPrompt: vi.fn().mockReturnValue('generic-prompt'),
}));

vi.mock('../../src/orchestra/result-collector.js', () => ({
  resolveAgentPrompt: vi.fn().mockResolvedValue(undefined),
  resolveSkillPrompts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: vi.fn().mockResolvedValue({ backend: 'subprocess', provider: 'claude' }),
}));

vi.mock('../../src/cli/commands/run.js', () => ({
  createRunTaskId: vi.fn().mockReturnValue('run-test-001'),
  buildRunTask: vi.fn().mockReturnValue({
    id: 'run-test-001',
    title: 'test task',
    description: 'do something',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['.'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'done', noGoCriteria: 'failed', techDebtAcceptable: 'minor ok' },
    status: 'PENDING',
    createdAt: '2026-01-01T00:00:00.000Z',
    assignedAgent: 'bug-fixer',
    assignedSkills: ['typescript-expert'],
  }),
}));

vi.mock('../../src/orchestra/event-bus.js', () => ({
  eventBus: { emit: vi.fn() },
}));

import { runTaskMode } from '../../src/orchestra/task-mode-runner.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../src/orchestra/result-collector.js';
import { spawnWorkerMultiProvider } from '../../src/cli/commands/spawn.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function taskConfig(): ResolvedConfig {
  return {
    deckent_style: 'task',
    spawn_backend: 'subprocess',
    execution_budget: {
      roles: { worker: { default: { maxTokens: 100_000, maxTurns: 10 } } },
      landing: { reserve_ratio: 0.25 },
    },
  } as unknown as ResolvedConfig;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('runTaskMode — agent/skill inject (Fix B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnWorkerMultiProvider).mockResolvedValue({ backend: 'subprocess', provider: 'claude' });
    vi.mocked(buildWorkerPrompt).mockReturnValue('generic-prompt');
    vi.mocked(resolveAgentPrompt).mockResolvedValue(undefined);
    vi.mocked(resolveSkillPrompts).mockResolvedValue([]);
  });

  it('injects agent prompt when task has an assignedAgent', async () => {
    vi.mocked(resolveAgentPrompt).mockResolvedValue('# Bug Fixer agent prompt');
    vi.mocked(resolveSkillPrompts).mockResolvedValue([]);
    vi.mocked(buildWorkerPrompt).mockReturnValue('prompt-with-agent');

    const result = await runTaskMode(
      { description: 'fix a bug', projectRoot: '/tmp/proj' },
      taskConfig(),
    );

    expect(resolveAgentPrompt).toHaveBeenCalledWith('/tmp/proj', expect.objectContaining({ id: 'run-test-001' }));
    expect(buildWorkerPrompt).toHaveBeenCalledWith(
      expect.any(Object),
      '# Bug Fixer agent prompt',
      [],
      '/tmp/proj',
      expect.objectContaining({ deckent_style: 'task', spawn_backend: 'subprocess' }),
    );
    expect(result.taskId).toBe('run-test-001');
  });

  it('injects skill prompts when task has assignedSkills', async () => {
    vi.mocked(resolveAgentPrompt).mockResolvedValue(undefined);
    vi.mocked(resolveSkillPrompts).mockResolvedValue([{ name: 'typescript-expert', content: '# TS skill' }]);
    vi.mocked(buildWorkerPrompt).mockReturnValue('prompt-with-skills');

    await runTaskMode(
      { description: 'type-safe refactor', projectRoot: '/tmp/proj' },
      taskConfig(),
    );

    expect(resolveSkillPrompts).toHaveBeenCalledWith('/tmp/proj', expect.objectContaining({ id: 'run-test-001' }));
    expect(buildWorkerPrompt).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      [{ name: 'typescript-expert', content: '# TS skill' }],
      '/tmp/proj',
      expect.objectContaining({ deckent_style: 'task', spawn_backend: 'subprocess' }),
    );
  });

  it('falls back to generic when both resolvers return nothing (no agent/skills)', async () => {
    vi.mocked(resolveAgentPrompt).mockResolvedValue(undefined);
    vi.mocked(resolveSkillPrompts).mockResolvedValue([]);

    const result = await runTaskMode(
      { description: 'generic task', projectRoot: '/tmp/proj' },
      taskConfig(),
    );

    expect(buildWorkerPrompt).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      [],
      '/tmp/proj',
      expect.objectContaining({ deckent_style: 'task', spawn_backend: 'subprocess' }),
    );
    expect(result.backend).toBe('subprocess');
    expect(result.provider).toBe('claude');
  });

  it('does not throw when resolveAgentPrompt rejects — error propagates', async () => {
    vi.mocked(resolveAgentPrompt).mockRejectedValue(new Error('agent pool unavailable'));

    await expect(
      runTaskMode({ description: 'resilience test', projectRoot: '/tmp/proj' }, taskConfig()),
    ).rejects.toThrow('agent pool unavailable');
  });
});
