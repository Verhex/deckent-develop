import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStatus } from '../../src/core/types.js';
import type { ModelType, ResolvedConfig, Sprint, Task } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import { persistPlanGeneratedProjectConventionsSkill } from '../../src/orchestra/sprint-phases.js';
import { resolveSkillPrompts } from '../../src/orchestra/result-collector.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { spawnWorkers } from '../../src/orchestra/sprint-spawner.js';
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import { detectProjectStack } from '../../src/core/stack-detector.js';
import { generateProjectConventionsSkill, getGeneratedContent } from '../../src/orchestra/temp-skill-generator.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '507-003-task',
    title: 'Keep generated skill across fixes',
    description: 'Verify a PLAN generated skill remains available to a repair task.',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-507',
    assignedSkills: ['project-conventions'],
    createdAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  } as Task;
}

function makeConfig(): ResolvedConfig {
  return {
    activeModeConfig: {
      max_workers: 1,
      brain_model: 'claude-sonnet-5',
      default_model: 'claude-sonnet-5',
    },
  } as ResolvedConfig;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-507',
    number: 507,
    status: 'ACTIVE',
    phase: 'SPAWN',
    tasks,
    workers: [],
  } as Sprint;
}

function makeBackend(): SpawnBackend {
  return {
    name: 'test',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: 'cooperative-landing',
    spawn: async () => undefined,
    kill: () => undefined,
    list: () => [],
    isAvailable: async () => true,
  };
}

/** Backend that records every prompt handed to it, so a spawn's real prompt input can be asserted. */
function makeCapturingBackend(captured: Array<{ taskId: string; prompt: string }>): SpawnBackend {
  return {
    ...makeBackend(),
    spawn: (taskId: string, _model: ModelType, prompt: string) => {
      captured.push({ taskId, prompt });
    },
  } as SpawnBackend;
}

function writeProjectFixture(root: string): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    devDependencies: { typescript: '5.0.0', vitest: '3.0.0' },
  }));
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
}

/**
 * Simulate what a worker does mid-run: change the project stack (a new dependency)
 * and make the change unambiguously newer than the stack-detector cache, so a fresh
 * detection/generation would produce a DIFFERENT skill body.
 */
function driftProjectStack(root: string): void {
  const pkgPath = join(root, 'package.json');
  writeFileSync(pkgPath, JSON.stringify({
    dependencies: { zod: '3.23.0', commander: '12.0.0' },
    devDependencies: { typescript: '5.0.0', vitest: '3.0.0' },
  }));
  const future = new Date(Date.now() + 10_000);
  utimesSync(pkgPath, future, future);
}

describe('PLAN-generated skill durability across FIX/XFIX', () => {
  it('persists the PLAN rendering so every repair prompt resolves identical content', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-generated-skill-'));
    try {
      writeProjectFixture(root);
      expect(persistPlanGeneratedProjectConventionsSkill(root)).toBe(true);

      const skillPath = join(root, '.deckent', 'skills', 'project-conventions', 'SKILL.md');
      expect(existsSync(skillPath)).toBe(true);
      const planContent = readFileSync(skillPath, 'utf8');

      // The manifest lands next to the body, so the skill is pool-visible (and
      // therefore forceSkills-resolvable) for the rest of the lineage.
      const pooled = new SkillPoolManager(root).getSkill('project-conventions');
      expect(pooled?.enabled).toBe(true);

      const firstRound = makeTask();
      const secondRound = makeTask({ id: '507-003-task-fix-2', fixForTaskId: firstRound.id });
      const firstPrompts = await resolveSkillPrompts(root, firstRound);
      const secondPrompts = await resolveSkillPrompts(root, secondRound);

      expect(firstPrompts).toEqual([{ name: 'project-conventions', content: planContent }]);
      expect(secondPrompts).toEqual(firstPrompts);
      expect(buildWorkerPrompt(secondRound, undefined, secondPrompts, root)).toContain(planContent);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the PLAN body byte-identical after the project stack drifts mid-run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-generated-skill-drift-'));
    try {
      writeProjectFixture(root);
      expect(persistPlanGeneratedProjectConventionsSkill(root)).toBe(true);
      const planContent = readFileSync(
        join(root, '.deckent', 'skills', 'project-conventions', 'SKILL.md'),
        'utf8',
      );

      driftProjectStack(root);

      // Guard the guard: after the drift a fresh generation really would produce a
      // different body, so the equality below can only hold by persistence — a
      // regenerate-per-round implementation fails this case.
      const drifted = detectProjectStack(root);
      expect(drifted).not.toBeNull();
      expect(getGeneratedContent(generateProjectConventionsSkill(drifted!))).not.toBe(planContent);

      const laterRound = makeTask({ id: '507-003-task-fix-3', fixForTaskId: '507-003-task' });
      expect(await resolveSkillPrompts(root, laterRound)).toEqual([
        { name: 'project-conventions', content: planContent },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('delivers the persisted skill to a real FIX-round spawn that forces it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-generated-skill-fix-spawn-'));
    try {
      writeProjectFixture(root);
      mkdirSync(join(root, '.tasks'), { recursive: true });
      expect(persistPlanGeneratedProjectConventionsSkill(root)).toBe(true);
      const planContent = readFileSync(
        join(root, '.deckent', 'skills', 'project-conventions', 'SKILL.md'),
        'utf8',
      );

      const fixTask = makeTask({
        id: '507-003-fix-round',
        isPriorityFix: true,
        fixForTaskId: '507-003-task',
        forceSkills: ['project-conventions'],
        budget: { maxTokens: 50_000, maxTurns: 3 },
        budgetPolicy: { landingPolicy: { reserve_ratio: 0.25 } },
      });
      const captured: Array<{ taskId: string; prompt: string }> = [];

      await spawnWorkers(root, makeSprint([fixTask]), makeConfig(), {
        spawnBackend: makeCapturingBackend(captured),
      });

      // The forced skill resolved: no typed pre-dispatch hold was written.
      expect(existsSync(join(root, '.tasks', 'task-507-003-fix-round.result'))).toBe(false);
      expect(fixTask.status).not.toBe(TaskStatus.NO_GO);

      const spawned = captured.find(c => c.taskId === '507-003-fix-round');
      expect(spawned).toBeDefined();
      expect(spawned!.prompt).toContain(planContent);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed with FORCED_SKILL_UNAVAILABLE when a forced skill is genuinely absent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-generated-skill-absent-'));
    try {
      mkdirSync(join(root, '.tasks'), { recursive: true });
      const task = makeTask({
        id: '507-003-missing',
        assignedSkills: ['genuinely-absent-skill'],
        forceSkills: ['genuinely-absent-skill'],
      });

      await spawnWorkers(root, makeSprint([task]), makeConfig(), { spawnBackend: makeBackend() });

      expect(task.status).toBe(TaskStatus.NO_GO);
      const result = JSON.parse(readFileSync(join(root, '.tasks', 'task-507-003-missing.result'), 'utf8')) as {
        preDispatchSettlement?: { reasonCode?: string };
      };
      expect(result.preDispatchSettlement?.reasonCode).toBe('FORCED_SKILL_UNAVAILABLE');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
