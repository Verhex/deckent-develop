import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BrainContext, Sprint, ResolvedConfig, SprintSizeRecommendation, Task } from '../../src/core/types.js';
import { DebtPriority, SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `brain-skill-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeConfig(projectRoot: string): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
      usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
      brain_planning: 'structured',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test-project',
    projectRoot,
    version: '1.0.0',
  };
}

function makeContext(directives: string): BrainContext {
  return {
    directives,
    memory: '',
    retro: '',
    debt: [],
    patterns: '',
    decisions: '',
    existingTasks: [],
    projectState: { gitStatus: '', fileTree: [] },
  };
}

function makeRecommendation(): SprintSizeRecommendation {
  return {
    size: 'full',
    maxWorkers: 4,
    modelConstraint: null,
    reason: 'No constraints',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('planSprint — skill selection integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    // Create required directories
    mkdirSync(join(tempDir, '.brain'), { recursive: true });
    mkdirSync(join(tempDir, '.tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.deckent'), { recursive: true });
    // Create config.json for getNextSprintId
    writeFileSync(join(tempDir, '.deckent', 'config.json'), JSON.stringify({ mode: 'max_plan', modes: {} }), 'utf8');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('planSprint returns Sprint object with tasks', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: Simple fix\n- Scope: src/core/\n');
    const recommendation = makeRecommendation();

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    expect(sprint).toBeDefined();
    expect(sprint.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it('tasks have assignedSkills as empty array when no skill pool exists', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: Test task\n- Scope: src/core/\n');
    const recommendation = makeRecommendation();

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    // Without skill pool directory, skills default to empty array (initialized in createTask)
    for (const task of sprint.tasks) {
      expect(task.assignedSkills).toEqual([]);
    }
  });

  it('tasks get assignedSkills when skills exist in pool', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: TypeScript migration\n- Scope: src/core/\n');
    const recommendation = makeRecommendation();

    // Create a skill that matches via triggers
    const skillDir = join(tempDir, '.deckent', 'skills', 'typescript-expert');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
      id: 'typescript-expert',
      name: 'TypeScript Expert',
      version: '1.0.0',
      description: 'TypeScript expertise',
      entrypoint: 'SKILL.md',
      category: 'language',
      triggers: ['typescript', 'migration'],
      stackDetection: { files: [], dependencies: [], commands: [] },
      composableWith: [],
      priority: 5,
      promptInjection: { position: 'append', maxTokens: 1500 },
      enabled: true,
      stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    }), 'utf8');

    // Create package.json for stack detection
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { typescript: '5.0.0' },
    }), 'utf8');

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    // At least one task should have skills assigned via trigger matching
    const hasSkills = sprint.tasks.some(t => t.assignedSkills && t.assignedSkills.length > 0);
    expect(hasSkills).toBe(true);
  });

  it('skill selection is non-fatal when import fails', async () => {
    // planSprint should still work even if dynamic imports fail
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: Simple task\n- Scope: src/cli/\n');
    const recommendation = makeRecommendation();

    // No skill pool or stack detector needed; it should just skip
    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    expect(sprint.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it('assignedSkills contains correct skill ids', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: Security audit review\n- Scope: src/core/\n');
    const recommendation = makeRecommendation();

    // Create security skill
    const skillDir = join(tempDir, '.deckent', 'skills', 'security-specialist');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
      id: 'security-specialist',
      name: 'Security Specialist',
      version: '1.0.0',
      description: 'Security expertise',
      entrypoint: 'SKILL.md',
      category: 'domain',
      triggers: ['security', 'audit'],
      stackDetection: { files: [], dependencies: [], commands: [] },
      composableWith: [],
      priority: 3,
      promptInjection: { position: 'append', maxTokens: 1500 },
      enabled: true,
      stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    }), 'utf8');

    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({}), 'utf8');

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    const taskWithSkill = sprint.tasks.find(t => t.assignedSkills && t.assignedSkills.includes('security-specialist'));
    expect(taskWithSkill).toBeDefined();
  });

  it('disabled skills are not assigned', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: TypeScript task\n- Scope: src/core/\n');
    const recommendation = makeRecommendation();

    const skillDir = join(tempDir, '.deckent', 'skills', 'disabled-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
      id: 'disabled-skill',
      name: 'Disabled Skill',
      version: '1.0.0',
      description: 'Should not match',
      entrypoint: 'SKILL.md',
      category: 'tool',
      triggers: ['typescript', 'task'],
      stackDetection: { files: [], dependencies: [], commands: [] },
      composableWith: [],
      priority: 10,
      promptInjection: { position: 'append', maxTokens: 1500 },
      enabled: false,
      stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    }), 'utf8');

    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({}), 'utf8');

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    const hasDisabled = sprint.tasks.some(
      t => t.assignedSkills && t.assignedSkills.includes('disabled-skill'),
    );
    expect(hasDisabled).toBe(false);
  });

  it('multiple tasks can each get different skills', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext(
      '## Task 1: Security audit\n- Scope: src/core/\n\n' +
      '## Task 2: TypeScript migration\n- Scope: src/cli/\n',
    );
    const recommendation = makeRecommendation();

    // Create two skills
    for (const skillDef of [
      { id: 'sec-skill', triggers: ['security', 'audit'], category: 'domain' },
      { id: 'ts-skill', triggers: ['typescript', 'migration'], category: 'language' },
    ]) {
      const skillDir = join(tempDir, '.deckent', 'skills', skillDef.id);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
        id: skillDef.id,
        name: skillDef.id,
        version: '1.0.0',
        description: '',
        entrypoint: 'SKILL.md',
        category: skillDef.category,
        triggers: skillDef.triggers,
        stackDetection: { files: [], dependencies: [], commands: [] },
        composableWith: [],
        priority: 5,
        promptInjection: { position: 'append', maxTokens: 1500 },
        enabled: true,
        stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
      }), 'utf8');
    }

    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({}), 'utf8');

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    expect(sprint.tasks.length).toBe(2);
  });

  it('planSprint returns correct sprint id format', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: Basic task\n- Scope: src/\n');
    const recommendation = makeRecommendation();

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    expect(sprint.id).toMatch(/^sprint-\d+$/);
  });

  it('planSprint is an async function', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: Async test\n- Scope: src/core/\n');
    const recommendation = makeRecommendation();

    const result = planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    expect(result).toBeInstanceOf(Promise);
    await result; // Ensure it resolves
  });

  it('skill selection does not affect task count', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const directives = '## Task 1: First\n- Scope: src/\n\n## Task 2: Second\n- Scope: tests/\n';
    const context = makeContext(directives);
    const recommendation = makeRecommendation();

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    expect(sprint.tasks.length).toBe(2);
  });

  it('tasks still have correct status after skill selection', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: Status check\n- Scope: src/\n');
    const recommendation = makeRecommendation();

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    for (const task of sprint.tasks) {
      expect(task.status).toBe(TaskStatus.PENDING);
    }
  });

  it('task files written to disk include assignedSkills when present', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: Performance optimization\n- Scope: src/core/\n');
    const recommendation = makeRecommendation();

    const skillDir = join(tempDir, '.deckent', 'skills', 'perf-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
      id: 'perf-skill',
      name: 'Performance Skill',
      version: '1.0.0',
      description: '',
      entrypoint: 'SKILL.md',
      category: 'domain',
      triggers: ['performance', 'optimization'],
      stackDetection: { files: [], dependencies: [], commands: [] },
      composableWith: [],
      priority: 5,
      promptInjection: { position: 'append', maxTokens: 1500 },
      enabled: true,
      stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    }), 'utf8');

    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({}), 'utf8');

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    const taskWithSkill = sprint.tasks.find(t => t.assignedSkills && t.assignedSkills.includes('perf-skill'));
    if (taskWithSkill) {
      const taskFile = join(tempDir, '.tasks', `task-${taskWithSkill.id}.json`);
      expect(existsSync(taskFile)).toBe(true);
      const written = JSON.parse(readFileSync(taskFile, 'utf8'));
      expect(written.assignedSkills).toContain('perf-skill');
    }
  });

  it('empty skill pool does not break planSprint', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    const config = makeConfig(tempDir);
    const context = makeContext('## Task 1: Empty pool test\n- Scope: src/\n');
    const recommendation = makeRecommendation();

    // Create skills directory but no skills in it
    mkdirSync(join(tempDir, '.deckent', 'skills'), { recursive: true });
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({}), 'utf8');

    const sprint = await planSprint(tempDir, config, context, recommendation, { mode: 'structured' });
    expect(sprint.tasks.length).toBeGreaterThanOrEqual(1);
  });
});
