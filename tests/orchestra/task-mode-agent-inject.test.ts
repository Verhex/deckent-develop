import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks ──────────────────────────────────────────────────────────

const backendHarness = vi.hoisted(() => ({ spawn: vi.fn(), kill: vi.fn() }));

vi.mock('../../src/orchestra/spawn-backend.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    SpawnBackendFactory: {
      create: vi.fn(() => ({
        name: 'subprocess',
        liveUsageBudgetSupport: 'measured-stream',
        executionLandingCapability: 'cooperative-landing',
        spawn: backendHarness.spawn,
        kill: backendHarness.kill,
        list: () => [],
        isAvailable: async () => true,
      })),
    },
  };
});

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

vi.mock('../../src/orchestra/event-bus.js', () => ({
  eventBus: { emit: vi.fn() },
}));

import { runTaskMode } from '../../src/orchestra/task-mode-runner.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../src/orchestra/result-collector.js';
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
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'task-mode-agent-inject-'));
    vi.clearAllMocks();
    vi.mocked(buildWorkerPrompt).mockReturnValue('generic-prompt');
    vi.mocked(resolveAgentPrompt).mockResolvedValue(undefined);
    vi.mocked(resolveSkillPrompts).mockResolvedValue([]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('injects agent prompt when task has an assignedAgent', async () => {
    vi.mocked(resolveAgentPrompt).mockResolvedValue('# Bug Fixer agent prompt');
    vi.mocked(resolveSkillPrompts).mockResolvedValue([]);
    vi.mocked(buildWorkerPrompt).mockReturnValue('prompt-with-agent');

    const result = await runTaskMode(
      { description: 'fix a bug', projectRoot: root },
      taskConfig(),
    );

    expect(resolveAgentPrompt).toHaveBeenCalledWith(root, expect.objectContaining({ id: result.taskId }));
    const call = vi.mocked(buildWorkerPrompt).mock.calls[0]!;
    expect(call[1]).toBe('# Bug Fixer agent prompt');
    expect(call[2]).toEqual([]);
    expect(call[3]).toBe(root);
    expect(call[4]).toMatchObject({ deckent_style: 'task', spawn_backend: 'subprocess' });
    expect(result.taskId).toMatch(/^run-/);
  });

  it('injects skill prompts when task has assignedSkills', async () => {
    vi.mocked(resolveAgentPrompt).mockResolvedValue(undefined);
    vi.mocked(resolveSkillPrompts).mockResolvedValue([{ name: 'typescript-expert', content: '# TS skill' }]);
    vi.mocked(buildWorkerPrompt).mockReturnValue('prompt-with-skills');

    await runTaskMode(
      { description: 'type-safe refactor', projectRoot: root },
      taskConfig(),
    );

    expect(resolveSkillPrompts).toHaveBeenCalledWith(root, expect.objectContaining({ id: expect.stringMatching(/^run-/) }));
    const call = vi.mocked(buildWorkerPrompt).mock.calls[0]!;
    expect(call[1]).toBeUndefined();
    expect(call[2]).toEqual([{ name: 'typescript-expert', content: '# TS skill' }]);
    expect(call[3]).toBe(root);
    expect(call[4]).toMatchObject({ deckent_style: 'task', spawn_backend: 'subprocess' });
  });

  it('falls back to generic when both resolvers return nothing (no agent/skills)', async () => {
    vi.mocked(resolveAgentPrompt).mockResolvedValue(undefined);
    vi.mocked(resolveSkillPrompts).mockResolvedValue([]);

    const result = await runTaskMode(
      { description: 'generic task', projectRoot: root },
      taskConfig(),
    );

    const call = vi.mocked(buildWorkerPrompt).mock.calls[0]!;
    expect(call[1]).toBeUndefined();
    expect(call[2]).toEqual([]);
    expect(call[3]).toBe(root);
    expect(call[4]).toMatchObject({ deckent_style: 'task', spawn_backend: 'subprocess' });
    expect(result.backend).toBe('subprocess');
    expect(result.provider).toBe('claude');
  });

  it('does not throw when resolveAgentPrompt rejects — error propagates', async () => {
    vi.mocked(resolveAgentPrompt).mockRejectedValue(new Error('agent pool unavailable'));

    await expect(
      runTaskMode({ description: 'resilience test', projectRoot: root }, taskConfig()),
    ).rejects.toThrow('agent pool unavailable');
  });
});
