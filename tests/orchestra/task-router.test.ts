import { describe, it, expect } from 'vitest';
import { routeTask, detectTaskType, type TaskRouterConfig } from '../../src/orchestra/task-router.js';
import { TaskStatus, type Task, type ProviderName } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

const allProviders: ProviderName[] = ['claude', 'codex', 'gemini'];
const defaultConfig: TaskRouterConfig = {};

// ─── detectTaskType ─────────────────────────────────────────────────

describe('detectTaskType', () => {
  it('detects code tasks from src/ directories', () => {
    const task = makeTask({ scope: { directories: ['src/'], filesRead: [], filesWrite: [] } });
    expect(detectTaskType(task)).toBe('code');
  });

  it('detects code tasks from .ts files', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['app.ts'] } });
    expect(detectTaskType(task)).toBe('code');
  });

  it('detects code tasks from .py files', () => {
    const task = makeTask({ scope: { directories: [], filesRead: ['main.py'], filesWrite: [] } });
    expect(detectTaskType(task)).toBe('code');
  });

  it('detects test tasks from tests/ directory', () => {
    const task = makeTask({ scope: { directories: ['tests/'], filesRead: [], filesWrite: [] } });
    expect(detectTaskType(task)).toBe('test');
  });

  it('detects test tasks from .test. file pattern', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['foo.test.ts'] } });
    expect(detectTaskType(task)).toBe('test');
  });

  it('detects test tasks from .spec. file pattern', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['bar.spec.js'] } });
    expect(detectTaskType(task)).toBe('test');
  });

  it('detects doc tasks from docs/ directory', () => {
    const task = makeTask({ scope: { directories: ['docs/'], filesRead: [], filesWrite: [] } });
    expect(detectTaskType(task)).toBe('doc');
  });

  it('detects doc tasks from .md files', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['CHANGELOG.md'] } });
    expect(detectTaskType(task)).toBe('doc');
  });

  it('detects design tasks from ui/ directory', () => {
    const task = makeTask({ scope: { directories: ['ui/'], filesRead: [], filesWrite: [] } });
    expect(detectTaskType(task)).toBe('design');
  });

  it('detects design tasks from components/ directory', () => {
    const task = makeTask({ scope: { directories: ['components/widgets'], filesRead: [], filesWrite: [] } });
    expect(detectTaskType(task)).toBe('design');
  });

  it('detects design tasks from .css files', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['styles.css'] } });
    expect(detectTaskType(task)).toBe('design');
  });

  it('returns unknown for unrecognized scope', () => {
    const task = makeTask({ scope: { directories: ['misc/'], filesRead: [], filesWrite: ['data.bin'] } });
    expect(detectTaskType(task)).toBe('unknown');
  });
});

// ─── routeTask ──────────────────────────────────────────────────────

describe('routeTask', () => {
  it('uses config skill_routing override for design tasks', () => {
    const task = makeTask({ scope: { directories: ['ui/'], filesRead: [], filesWrite: [] } });
    const config: TaskRouterConfig = { skill_routing: { design: 'gemini' } };
    const result = routeTask(task, config, allProviders);
    expect(result.provider).toBe('gemini');
    expect(result.reason).toContain('skill_routing.design');
  });

  it('uses config skill_routing override for testing tasks', () => {
    const task = makeTask({ scope: { directories: ['tests/'], filesRead: [], filesWrite: [] } });
    const config: TaskRouterConfig = { skill_routing: { testing: 'codex' } };
    const result = routeTask(task, config, allProviders);
    expect(result.provider).toBe('codex');
    expect(result.reason).toContain('skill_routing.testing');
  });

  it('uses config skill_routing override for doc tasks', () => {
    const task = makeTask({ scope: { directories: ['docs/'], filesRead: [], filesWrite: [] } });
    const config: TaskRouterConfig = { skill_routing: { docs: 'gemini' } };
    const result = routeTask(task, config, allProviders);
    expect(result.provider).toBe('gemini');
    expect(result.reason).toContain('skill_routing.docs');
  });

  it('uses task forceModel to infer provider', () => {
    const task = makeTask({ forceModel: 'gpt-5' });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.provider).toBe('codex');
    expect(result.reason).toContain('forceModel');
  });

  it('uses task forceModel with gemini model', () => {
    const task = makeTask({ forceModel: 'gemini-2.5-pro' });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.provider).toBe('gemini');
  });

  it('uses task provider field when set', () => {
    const task = makeTask({ provider: 'codex' });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.provider).toBe('codex');
    expect(result.reason).toContain('Task provider field');
  });

  it('uses skill_routing.default for code tasks with no specific routing', () => {
    const task = makeTask({ scope: { directories: ['src/'], filesRead: [], filesWrite: [] } });
    const config: TaskRouterConfig = { skill_routing: { default: 'codex' } };
    const result = routeTask(task, config, allProviders);
    expect(result.provider).toBe('codex');
    expect(result.reason).toContain('skill_routing.default');
  });

  it('uses worker_provider when no other config matches', () => {
    const task = makeTask({ scope: { directories: ['misc/'], filesRead: [], filesWrite: ['data.bin'] } });
    const config: TaskRouterConfig = { worker_provider: 'gemini' };
    const result = routeTask(task, config, allProviders);
    expect(result.provider).toBe('gemini');
    expect(result.reason).toContain('worker_provider');
  });

  it('falls back to first available provider when nothing matches', () => {
    const task = makeTask({ scope: { directories: ['misc/'], filesRead: [], filesWrite: ['data.bin'] } });
    const result = routeTask(task, defaultConfig, ['codex', 'gemini']);
    expect(result.provider).toBe('codex');
    expect(result.reason).toContain('first available');
  });

  it('falls back when preferred provider is unavailable', () => {
    const task = makeTask({ provider: 'gemini' });
    const result = routeTask(task, defaultConfig, ['claude', 'codex']);
    expect(result.provider).toBe('claude');
    expect(result.reason).toContain('unavailable');
  });

  it('falls back to claude when no providers are available', () => {
    const task = makeTask();
    const result = routeTask(task, defaultConfig, []);
    expect(result.provider).toBe('claude');
    expect(result.reason).toContain('No providers available');
  });

  it('preserves assignedAgent from task', () => {
    const task = makeTask({ assignedAgent: 'agent-42' });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.agent).toBe('agent-42');
  });

  it('defaults agent to generic when not assigned', () => {
    const task = makeTask();
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.agent).toBe('generic');
  });

  it('preserves assignedSkills from task', () => {
    const task = makeTask({ assignedSkills: ['typescript', 'testing'] });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.skills).toEqual(['typescript', 'testing']);
  });

  it('defaults skills to empty array when not assigned', () => {
    const task = makeTask();
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.skills).toEqual([]);
  });

  it('config skill_routing takes priority over task forceModel', () => {
    const task = makeTask({
      forceModel: 'gpt-5',
      scope: { directories: ['ui/'], filesRead: [], filesWrite: [] },
    });
    const config: TaskRouterConfig = { skill_routing: { design: 'claude' } };
    const result = routeTask(task, config, allProviders);
    expect(result.provider).toBe('claude');
    expect(result.reason).toContain('skill_routing.design');
  });

  it('forceModel takes priority over task.provider', () => {
    const task = makeTask({
      forceModel: 'gemini-2.5-flash',
      provider: 'codex',
      scope: { directories: ['misc/'], filesRead: [], filesWrite: ['data.bin'] },
    });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.provider).toBe('gemini');
  });

  it('skill_routing null value is ignored', () => {
    const task = makeTask({ scope: { directories: ['ui/'], filesRead: [], filesWrite: [] } });
    const config: TaskRouterConfig = { skill_routing: { design: null, default: 'codex' } };
    const result = routeTask(task, config, allProviders);
    expect(result.provider).toBe('codex');
    expect(result.reason).toContain('skill_routing.default');
  });

  it('handles forceModel fallback when provider unavailable', () => {
    const task = makeTask({ forceModel: 'gemini-2.5-pro' });
    const result = routeTask(task, defaultConfig, ['claude']);
    expect(result.provider).toBe('claude');
    expect(result.reason).toContain('unavailable');
  });
});
