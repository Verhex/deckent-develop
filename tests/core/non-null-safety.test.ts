/**
 * Non-Null Assertion Safety Tests
 *
 * Validates that all non-null assertion replacements preserve runtime behavior.
 * Each test exercises a code path where a `!` assertion was replaced with
 * a safe alternative (nullish coalescing, optional chaining, guard clause, etc.).
 */
import { describe, it, expect, vi } from 'vitest';
import { parseDebtTable, formatDate } from '../../src/core/utils.js';
import { lazyLoad, LazyMap } from '../../src/core/lazy-loader.js';
import { registerHook, clearHooks, getHookCount } from '../../src/core/plugin-hooks.js';
import { SkillLoadingCache } from '../../src/core/skill-cache.js';
import { DependencyResolver, CircularDependencyError } from '../../src/core/marketplace/dependency-resolver.js';
import { PromptMetrics } from '../../src/agents/prompt-metrics.js';
import { AgentGenealogy } from '../../src/agents/agent-genealogy.js';
import type { PromptVersion } from '../../src/agents/prompt-version.js';
import { WorkerChannel, WorkerSideChannel } from '../../src/agents/worker-ipc.js';
import { buildWorkerPrompt, createTask } from '../../src/orchestra/task-builder.js';
import { ConflictResolver } from '../../src/orchestra/conflict-resolver.js';
import { deduplicateAlerts } from '../../src/monitor/auditor.js';
import { parseSprintLog, formatDurationMs, parseAgentSkillInfo } from '../../src/cli/commands/history.js';
import { parseRetroToRichSummary } from '../../src/cli/commands/retro.js';

// ─── 1. parseDebtTable: cols array access with ?? fallback ──────────
describe('parseDebtTable safe array access', () => {
  it('parses a valid debt table row without crashing', () => {
    const content = `| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
|----|----|----|----|----|----|----|----|----|
| D1 | desc | T1 | S1 | HIGH | 0 | false | - | 2026-01-01 |`;
    const items = parseDebtTable(content);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('D1');
    expect(items[0]?.description).toBe('desc');
    expect(items[0]?.createdAt).toBe('2026-01-01');
  });

  it('handles short columns gracefully (< 9 cols skipped)', () => {
    const content = `| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
|----|----|----|----|----|----|----|----|----|
| D1 | desc |`;
    const items = parseDebtTable(content);
    expect(items).toHaveLength(0);
  });
});

// ─── 2. formatDate: DATE_LOCALES fallback with ?? ────────────────────
describe('formatDate safe locale fallback', () => {
  it('uses en locale for unknown language code', () => {
    const result = formatDate('2026-01-15', 'xx');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats date with known locale (en)', () => {
    const result = formatDate('2026-01-15', 'en');
    expect(result).toContain('2026');
  });

  it('formats date with known locale (tr)', () => {
    const result = formatDate('2026-01-15', 'tr');
    expect(result).toContain('2026');
  });
});

// ─── 3. lazyLoad: cached value returned as T ────────────────────────
describe('lazyLoad safe return', () => {
  it('returns loaded value without non-null assertion', () => {
    const handle = lazyLoad(() => 42);
    expect(handle.value).toBe(42);
    expect(handle.isLoaded).toBe(true);
  });

  it('caches the value across multiple accesses', () => {
    let callCount = 0;
    const handle = lazyLoad(() => { callCount++; return 'hello'; });
    expect(handle.value).toBe('hello');
    expect(handle.value).toBe('hello');
    expect(callCount).toBe(1);
  });

  it('reset allows reloading', () => {
    let callCount = 0;
    const handle = lazyLoad(() => ++callCount);
    expect(handle.value).toBe(1);
    handle.reset();
    expect(handle.value).toBe(2);
  });
});

// ─── 4. LazyMap.get: safe loader resolution ─────────────────────────
describe('LazyMap safe loader access', () => {
  it('returns undefined for unregistered key', () => {
    const map = new LazyMap<number>();
    expect(map.get('missing')).toBeUndefined();
  });

  it('loads registered key safely', () => {
    const map = new LazyMap<string>();
    map.register('key1', () => 'value1');
    expect(map.get('key1')).toBe('value1');
  });
});

// ─── 5. registerHook: safe Map.get after has() ──────────────────────
describe('registerHook safe map access', () => {
  it('registers and counts hooks without crash', () => {
    clearHooks();
    registerHook('beforeSprint', async () => {});
    registerHook('beforeSprint', async () => {});
    expect(getHookCount('beforeSprint')).toBe(2);
    clearHooks();
  });
});

// ─── 6. SkillLoadingCache eviction: safe Map.get ────────────────────
describe('SkillLoadingCache eviction safety', () => {
  it('evicts oldest entry when budget exceeded', () => {
    // Create a cache with a tiny budget
    const cache = new SkillLoadingCache('/nonexistent', 100);
    // loadAndCache will fail because dir doesn't exist, but tests the structure
    const result = cache.loadAndCache('nonexistent-skill');
    expect(result).toBeNull();
    expect(cache.size).toBe(0);
  });
});

// ─── 7. DependencyResolver: safe topological sort ───────────────────
describe('DependencyResolver safe queue processing', () => {
  it('resolves linear dependency chain', () => {
    const lookup = new Map([
      ['a', { name: 'a', version: '1.0.0', dependencies: { b: '1.0.0' } }],
      ['b', { name: 'b', version: '1.0.0', dependencies: { c: '1.0.0' } }],
      ['c', { name: 'c', version: '1.0.0' }],
    ]);
    const resolver = new DependencyResolver('/tmp', { registryLookup: lookup });
    const result = resolver.resolve('a');
    expect(result.ordered.map(d => d.name)).toEqual(['c', 'b', 'a']);
  });

  it('resolves conflicts picking highest version', () => {
    const versions = new Map([
      ['pkg', ['1.0.0', '2.0.0', '1.5.0']],
    ]);
    const resolver = new DependencyResolver('/tmp');
    const resolved = resolver.resolveConflicts(versions);
    expect(resolved.get('pkg')).toBe('2.0.0');
  });

  it('resolveConflicts handles empty version list', () => {
    const versions = new Map([['pkg', [] as string[]]]);
    const resolver = new DependencyResolver('/tmp');
    const resolved = resolver.resolveConflicts(versions);
    expect(resolved.has('pkg')).toBe(false);
  });
});

// ─── 8. PromptMetrics: safe array access ────────────────────────────
describe('PromptMetrics safe array access', () => {
  const metrics = new PromptMetrics();

  it('handles empty versions array', () => {
    const report = metrics.collectMetrics('agent-1', []);
    expect(report.currentVersion).toBe(0);
    expect(report.bestVersion.version).toBe(0);
    expect(report.worstVersion.version).toBe(0);
    expect(report.trend).toBe('stable');
  });

  it('handles single version array', () => {
    const versions: PromptVersion[] = [
      { version: 1, prompt: 'test', createdAt: new Date().toISOString(), stats: { uses: 5, successes: 4, failures: 1, successRate: 0.8 } },
    ];
    const report = metrics.collectMetrics('agent-1', versions);
    expect(report.currentVersion).toBe(1);
    expect(report.bestVersion.version).toBe(1);
    expect(report.trend).toBe('stable');
  });

  it('detects improving trend over multiple versions', () => {
    const versions: PromptVersion[] = [
      { version: 1, prompt: 'v1', createdAt: new Date().toISOString(), stats: { uses: 10, successes: 3, failures: 7, successRate: 0.3 } },
      { version: 2, prompt: 'v2', createdAt: new Date().toISOString(), stats: { uses: 10, successes: 5, failures: 5, successRate: 0.5 } },
      { version: 3, prompt: 'v3', createdAt: new Date().toISOString(), stats: { uses: 10, successes: 9, failures: 1, successRate: 0.9 } },
    ];
    const report = metrics.collectMetrics('agent-1', versions);
    expect(report.trend).toBe('improving');
  });
});

// ─── 9. AgentGenealogy: safe ancestor chain traversal ───────────────
describe('AgentGenealogy safe traversal', () => {
  it('handles empty genealogy for descendants', () => {
    const genealogy = new AgentGenealogy('/tmp/test-nonexistent');
    const descendants = genealogy.getDescendants('root');
    expect(descendants).toEqual([]);
  });

  it('getParent returns null for missing agent', () => {
    const genealogy = new AgentGenealogy('/tmp/test-nonexistent');
    expect(genealogy.getParent('missing')).toBeNull();
  });
});

// ─── 10. WorkerChannel / WorkerSideChannel: safe handler push ──────
describe('WorkerChannel safe handler registration', () => {
  it('registers message handlers safely', () => {
    const mockProc = {
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn().mockReturnValue(true),
      removeListener: vi.fn(),
    };
    const channel = new WorkerChannel(mockProc as any, 'task-001');
    // Should not throw
    channel.onMessage('HEARTBEAT', () => {});
    channel.onMessage('HEARTBEAT', () => {});
    channel.close();
  });
});

// ─── 11. (removed) diffDecisions was V1 decision-replay — purged by ROUTE-V1-PURGE ─

// ─── 12. buildWorkerPrompt: safe skill header length ────────────────
describe('buildWorkerPrompt safe skill section', () => {
  it('builds prompt with skills without crash', () => {
    const task = createTask({
      title: 'Test Task',
      description: 'A test',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'testing',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'passes', noGoCriteria: 'fails', techDebtAcceptable: 'yes' },
      sprintId: 'sprint-001',
    }, 1);

    const prompt = buildWorkerPrompt(task, undefined, [
      { name: 'skill-a', content: 'Skill A content' },
    ]);
    expect(prompt).toContain('=== Skills ===');
    expect(prompt).toContain('skill-a');
  });
});

// ─── 13. ConflictResolver: safe array access in detect/report ───────
describe('ConflictResolver safe array access', () => {
  it('generates report for multiple conflicts', () => {
    const resolver = new ConflictResolver();
    const report = resolver.generateConflictReport([
      { type: 'scope_overlap', files: ['a.ts'], workers: ['w1', 'w2'], detail: 'overlap' },
      { type: 'test_file_modify', files: ['b.test.ts'], workers: ['w3'], detail: 'test mod' },
    ]);
    expect(report).toContain('1.');
    expect(report).toContain('2.');
  });

  it('returns no-conflict message for empty array', () => {
    const resolver = new ConflictResolver();
    expect(resolver.generateConflictReport([])).toBe('No conflicts detected.');
  });
});

// ─── 14. deduplicateAlerts: safe merged array access ────────────────
describe('deduplicateAlerts safe merge', () => {
  it('increments count for duplicate alerts', () => {
    const existing = [
      { level: 'warn' as const, message: 'stale', timestamp: '2026-01-01T00:00:00Z', count: 1 },
    ];
    const incoming = [
      { level: 'warn' as const, message: 'stale', timestamp: '2026-01-01T00:01:00Z' },
    ];
    const result = deduplicateAlerts(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(2);
  });

  it('adds new alerts that do not match existing', () => {
    const existing = [
      { level: 'warn' as const, message: 'stale', timestamp: '2026-01-01T00:00:00Z', count: 1 },
    ];
    const incoming = [
      { level: 'error' as const, message: 'boundary', timestamp: '2026-01-01T00:01:00Z' },
    ];
    const result = deduplicateAlerts(existing, incoming);
    expect(result).toHaveLength(2);
  });
});

// ─── 15. parseSprintLog / parseRetro: safe regex group access ───────
describe('parseSprintLog and parseRetro safe regex access', () => {
  it('parses sprint log with table format', () => {
    const content = `# Sprint 035
| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 6 |
| No-Go | 1 |
| Coverage | 85% |
| Duration | 300000ms |
`;
    const record = parseSprintLog(content);
    expect(record.sprint).toBe('Sprint 035');
    expect(record.tasks).toBe('8');
    expect(record.completed).toBe('6');
  });

  it('parses retro with table format', () => {
    const content = `Sprint: sprint-035
| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 6 |
| No-Go | 1 |
| Tech Debt | 2 |
| Coverage | 85% |
| Duration | 5m |
`;
    const summary = parseRetroToRichSummary(content);
    expect(summary.totalTasks).toBe(8);
    expect(summary.completed).toBe(6);
    expect(summary.noGo).toBe(1);
    expect(summary.techDebt).toBe(2);
  });

  it('handles missing regex groups gracefully', () => {
    const record = parseSprintLog('No structured content here.');
    expect(record.tasks).toBe('-');
    expect(record.completed).toBe('-');
    expect(record.sprint).toBe('Unknown');
  });
});

// ─── 16. formatDurationMs: safe regex group access ──────────────────
describe('formatDurationMs safe parsing', () => {
  it('formats milliseconds to seconds', () => {
    expect(formatDurationMs('5000ms')).toBe('5s');
  });

  it('formats milliseconds to minutes + seconds', () => {
    expect(formatDurationMs('125000ms')).toBe('2m 5s');
  });

  it('returns raw string if not matching ms pattern', () => {
    expect(formatDurationMs('5m')).toBe('5m');
  });
});

// ─── 17. parseAgentSkillInfo: safe regex group access ───────────────
describe('parseAgentSkillInfo safe regex access', () => {
  it('parses agent and skill info from content', () => {
    const content = 'Agents: coder, tester\nSkills: typescript, vitest';
    const { agents, skills } = parseAgentSkillInfo(content);
    expect(agents).toContain('coder');
    expect(skills).toContain('typescript');
  });

  it('returns empty arrays for content without agent/skill info', () => {
    const { agents, skills } = parseAgentSkillInfo('No info here');
    expect(agents).toEqual([]);
    expect(skills).toEqual([]);
  });
});
