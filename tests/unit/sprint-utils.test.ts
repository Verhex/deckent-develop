import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  modelRegistry: {
    get: vi.fn(),
    has: vi.fn().mockReturnValue(true),
    resolveApiId: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
    getAllProviders: vi.fn().mockReturnValue(['claude', 'codex', 'gemini']),
    getByProvider: vi.fn().mockReturnValue([]),
    getAllModelIds: vi.fn().mockReturnValue(['opus', 'sonnet', 'haiku']),
    getAllModels: vi.fn().mockReturnValue([]),
    getByProviderAndTier: vi.fn().mockReturnValue({ id: 'opus' }),
  },
}));

vi.mock('../../src/core/system-profile.js', () => {
  return {
    getSystemProfile: () => ({
      recommendedMaxWorkers: 4,
      cpuCores: 8,
      memoryGB: 16,
      platform: 'linux',
    }),
  };
});

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn().mockReturnValue({
      name: 'claude',
      buildCommand: vi.fn().mockReturnValue('claude -p /dev/null'),
    }),
    getProvider: vi.fn().mockReturnValue({ name: 'claude' }),
  },
  ProviderError: class ProviderError extends Error {
    provider: string;
    constructor(msg: string, provider: string) {
      super(msg);
      this.provider = provider;
    }
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  listWorkers: vi.fn().mockReturnValue([]),
}));

import { existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { readJsonSafe } from '../../src/core/utils.js';
import {
  readFileSafe,
  now,
  isSourceCodeDir,
  isDocTask,
  isStaleTaskFile,
  isTmuxProvider,
  resolveMaxWorkersNumeric,
  getSubprocessWorkerLogPath,
  readSubprocessWorkerLog,
  hasSubprocessWorkerLog,
  writeSprintState,
  readSprintState,
  clearSprintState,
  buildSpawnRetryHint,
  extractGoNogoCriteria,
} from '../../src/orchestra/sprint-utils.js';
import type { Task, Sprint } from '../../src/core/types.js';

const mockExistsSync = vi.mocked(existsSync);
const mockStatSync = vi.mocked(statSync);
const mockReadJsonSafe = vi.mocked(readJsonSafe);

// ─── Tests ──────────────────────────────────────────────────────────

describe('sprint-utils', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isSourceCodeDir', () => {
    it('should identify source code directories', () => {
      expect(isSourceCodeDir('src/')).toBe(true);
      expect(isSourceCodeDir('src/core')).toBe(true);
      expect(isSourceCodeDir('tests/')).toBe(true);
      expect(isSourceCodeDir('tests/unit')).toBe(true);
      expect(isSourceCodeDir('lib/')).toBe(true);
      expect(isSourceCodeDir('src')).toBe(true);
      expect(isSourceCodeDir('tests')).toBe(true);
      expect(isSourceCodeDir('lib')).toBe(true);
    });

    it('should identify non-source directories', () => {
      expect(isSourceCodeDir('docs/')).toBe(false);
      expect(isSourceCodeDir('.brain/')).toBe(false);
      expect(isSourceCodeDir('.')).toBe(false);
      expect(isSourceCodeDir('README.md')).toBe(false);
    });
  });

  describe('isDocTask', () => {
    it('should return true when all directories are non-source', () => {
      const task = {
        scope: { directories: ['docs/', '.brain/'] },
      } as unknown as Task;

      expect(isDocTask(task)).toBe(true);
    });

    it('should return false when any directory is source code', () => {
      const task = {
        scope: { directories: ['docs/', 'src/core/'] },
      } as unknown as Task;

      expect(isDocTask(task)).toBe(false);
    });

    it('should return false when directories are empty', () => {
      const task = { scope: { directories: [] } } as unknown as Task;
      expect(isDocTask(task)).toBe(false);
    });

    it('should handle missing scope gracefully', () => {
      const task = {} as unknown as Task;
      expect(isDocTask(task)).toBe(false);
    });
  });

  describe('isStaleTaskFile', () => {
    it('should return true for files older than maxAgeMs', () => {
      const oldTime = Date.now() - 100_000_000; // ~27 hours ago
      mockStatSync.mockReturnValue({ mtimeMs: oldTime } as any);

      expect(isStaleTaskFile('/test/.tasks/task-001.json')).toBe(true);
    });

    it('should return false for recent files', () => {
      mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 1000 } as any);

      expect(isStaleTaskFile('/test/.tasks/task-001.json')).toBe(false);
    });

    it('should return false when file does not exist', () => {
      mockStatSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(isStaleTaskFile('/nonexistent/file')).toBe(false);
    });
  });

  describe('isTmuxProvider', () => {
    it('should return true for claude provider', () => {
      expect(isTmuxProvider('claude')).toBe(true);
    });

    it('should return false for other providers', () => {
      expect(isTmuxProvider('codex')).toBe(false);
      expect(isTmuxProvider('gemini')).toBe(false);
    });
  });

  describe('resolveMaxWorkersNumeric', () => {
    it('should return numeric max_workers directly', () => {
      const config = { activeModeConfig: { max_workers: 6 } } as any;
      expect(resolveMaxWorkersNumeric(config)).toBe(6);
    });

    it('should resolve auto to system recommendation', () => {
      const config = { activeModeConfig: { max_workers: 'auto' } } as any;
      expect(resolveMaxWorkersNumeric(config)).toBe(4); // from mocked getSystemProfile
    });
  });

  describe('now', () => {
    it('should return a valid ISO 8601 string', () => {
      const result = now();
      expect(new Date(result).toISOString()).toBe(result);
    });
  });

  describe('buildSpawnRetryHint', () => {
    it('should suggest model downgrade on rate limit errors', () => {
      const sprint = { tasks: [{ id: '1' }] } as Sprint;
      const hint = buildSpawnRetryHint(new Error('rate limit 429'), sprint);
      expect(hint).toContain('Rate limit');
    });

    it('should suggest tmux doctor on session errors', () => {
      const sprint = { tasks: [{ id: '1' }] } as Sprint;
      const hint = buildSpawnRetryHint(new Error('tmux session failed'), sprint);
      expect(hint).toContain('tmux');
    });

    it('should warn about high task count', () => {
      const sprint = { tasks: Array(8).fill({ id: '1' }) } as Sprint;
      const hint = buildSpawnRetryHint(new Error('generic error'), sprint);
      expect(hint).toContain('High task count');
    });
  });

  describe('extractGoNogoCriteria', () => {
    it('should extract proof lines as specific criteria', () => {
      const description = `
Fix the config module.

**Kanıt:** \`grep "cacheStamp" src/core/config.ts\` → hit

**Test:** 3+ test
`;
      const result = extractGoNogoCriteria(description);
      expect(result.goCriteria).toContain('cacheStamp');
    });

    it('should use base criteria when no proof lines found', () => {
      const result = extractGoNogoCriteria('Simple description with no proof');
      expect(result.goCriteria).toBe('Tests pass; tsc clean');
      expect(result.noGoCriteria).toBe('Build fails or tests fail');
      expect(result.items?.map(item => [item.polarity, item.statement])).toEqual([
        ['go', 'Tests pass; tsc clean'],
        ['no-go', 'Build fails or tests fail'],
      ]);
    });

    it('should include test target in base criteria', () => {
      const result = extractGoNogoCriteria('desc', 'tests/unit/foo.test.ts');
      expect(result.goCriteria).toContain('tests/unit/foo.test.ts');
    });

    // WP-13 (🔴): the proof-label prefix must be cleanly stripped. The previous
    // strip regex only matched `**Label**:` (colon OUTSIDE the bold) and the
    // `[-*]` fallback then mangled the common `**Kanıt:**` (colon INSIDE the
    // bold) form into `*Kanıt:**`, splicing broken markdown into the DoD block.
    it('WP-13: strips **Kanıt:** (colon inside bold) without mangling to *Kanıt:**', () => {
      const description = '**Kanıt:** `grep -c "crossTenant" tests/api/x.test.ts` >= 2 yeni test';
      const result = extractGoNogoCriteria(description);
      // The command content survives…
      expect(result.goCriteria).toContain('grep -c "crossTenant"');
      // …but the broken/partial label prefix must be gone entirely.
      expect(result.goCriteria).not.toContain('*Kanıt:**');
      expect(result.goCriteria).not.toContain('Kanıt:');
      expect(result.goCriteria).not.toMatch(/\*\*?Kanıt/);
    });

    it('WP-13: strips **Test:** prefix cleanly', () => {
      const description = '**Test:** 2 yeni test (anti-IDOR-404 + positive-OIDC-stamp)';
      const result = extractGoNogoCriteria(description);
      expect(result.goCriteria).toContain('2 yeni test');
      expect(result.goCriteria).not.toMatch(/\*\*?Test:/);
    });

    it('WP-13: strips bulleted **Proof:** prefix cleanly', () => {
      const description = '- **Proof:** `npx vitest run tests/api/x.test.ts` green';
      const result = extractGoNogoCriteria(description);
      expect(result.goCriteria).toContain('npx vitest run');
      expect(result.goCriteria).not.toMatch(/\*\*?Proof:/);
      expect(result.goCriteria).not.toMatch(/^[\s;]*[-*]\s*\*/);
    });

    // F0.2: the `- goCriteria:` / `- nogo:` form (used by DIRECTIVES authors under
    // `### goNogo`) was previously unrecognized → task-specific criteria fell back
    // to the generic base. Both labels must now feed the machine-visible contract.
    it('F0.2: recognizes `- goCriteria:` as a task-specific GO criterion', () => {
      const description = [
        'Fix the tool registry.',
        '',
        '### goNogo',
        "- goCriteria: empty-string description tool connects and REPL still launches (test); registry tests green.",
        "- nogo: do not make description required.",
      ].join('\n');
      const result = extractGoNogoCriteria(description);
      expect(result.goCriteria).toContain('REPL still launches');
      expect(result.goCriteria).not.toMatch(/goCriteria:/i);
      expect(result.items?.filter(item =>
        item.polarity === 'go' && !item.statement.startsWith('Tests pass'),
      ).map(item => item.statement)).toEqual([
        'empty-string description tool connects and REPL still launches (test)',
        'registry tests green.',
      ]);
    });

    it('F0.2: recognizes `- nogo:` and surfaces it in noGoCriteria', () => {
      const description = [
        '### goNogo',
        '- goCriteria: parser recognizes the new labels (test).',
        '- nogo: do not make description required.',
      ].join('\n');
      const result = extractGoNogoCriteria(description);
      expect(result.noGoCriteria).toContain('do not make description required');
      expect(result.noGoCriteria).not.toMatch(/nogo:/i);
    });

    it('F0.2: nogo-only description still captures the prohibition (no proof lines)', () => {
      const result = extractGoNogoCriteria('- nogo: do not touch the openai adapter.');
      expect(result.noGoCriteria).toContain('do not touch the openai adapter');
    });

    it('F0.2: WM-7 kind path composes goCriteria/nogo onto the kind-aware base', () => {
      const description = [
        '### goNogo',
        '- goCriteria: audit doc lists all 16 agents (disk-verify).',
        '- nogo: do not invent counts.',
      ].join('\n');
      const result = extractGoNogoCriteria(description, undefined, { kind: 'documentation', stack: 'generic' });
      expect(result.goCriteria).toContain('lists all 16 agents');
      expect(result.noGoCriteria).toContain('do not invent counts');
    });

    it('keeps an escaped semicolon inside one explicit criterion item', () => {
      const description = [
        '### goNogo',
        String.raw`- goCriteria: one statement with \; punctuation`,
        '- nogo: forbidden regression',
      ].join('\n');
      const result = extractGoNogoCriteria(description);
      expect(result.items?.filter(item =>
        item.statement.includes('one statement'),
      )).toHaveLength(1);
      expect(result.items?.find(item =>
        item.statement.includes('one statement'),
      )?.statement).toBe('one statement with ; punctuation');
    });
  });

  describe('writeSprintState / readSprintState / clearSprintState', () => {
    it('should read sprint state from disk', () => {
      const state = {
        sprintId: 'sprint-100',
        phase: 'EXECUTE',
        status: 'running',
        startedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:01:00Z',
        taskIds: ['001-001', '001-002'],
      };
      mockReadJsonSafe.mockReturnValue(state);

      const result = readSprintState('/test/project');
      expect(result).toEqual(state);
    });

    it('should return null when no state file exists', () => {
      mockReadJsonSafe.mockReturnValue(undefined as any);

      const result = readSprintState('/test/project');
      expect(result).toBeNull();
    });

    it('should clear sprint state file', () => {
      mockExistsSync.mockReturnValue(true);
      clearSprintState('/test/project');
      expect(vi.mocked(unlinkSync)).toHaveBeenCalled();
    });
  });

  describe('subprocess worker log utilities', () => {
    it('should construct correct log path', () => {
      const path = getSubprocessWorkerLogPath('/project', '001-001');
      expect(path).toContain('.tasks');
      expect(path).toContain('task-001-001.log');
    });

    it('should return false for non-existent log', () => {
      mockExistsSync.mockReturnValue(false);
      expect(hasSubprocessWorkerLog('/project', '001-001')).toBe(false);
    });
  });
});
