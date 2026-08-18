import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

vi.mock('../../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn((_key: string, _lang: string) => _key),
  getLanguage: vi.fn().mockReturnValue('en'),
  resolveLanguage: vi.fn().mockReturnValue('en'),
}));

// B8: `deckent explain` reads sprint learnings from memory.db `retro` entries.
const RETRO_CONTENT = vi.hoisted(() => `## Learnings
- Lesson one
- Lesson two
`);
vi.mock('../../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(() => ({
    getById: (id: string) =>
      id.startsWith('retro-') ? { id, content: RETRO_CONTENT, sprint_num: 42, sprint_id: 'sprint-042' } : null,
    getByType: (t: string) =>
      t === 'retro' ? [{ content: RETRO_CONTENT, sprint_num: 42, sprint_id: 'sprint-042' }] : [],
    close: () => {},
  })),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { print } from '../../../src/cli/helpers/output.js';
import { getLangFromConfig } from '../../../src/cli/helpers/config-reader.js';
import {
  registerExplain,
  buildExplainOutput,
  extractGoalFromDirectives,
  extractGoalFromSprintLog,
} from '../../../src/cli/commands/explain.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockPrint = vi.mocked(print);
const mockGetLang = vi.mocked(getLangFromConfig);

const SPRINT_CONTENT = `# Sprint sprint-042

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 5 |
| Tech Debt | 1 |
| No-Go | 2 |
| Duration | 120000ms |

- Task 1: Something
- Task 2: Another thing
`;

const DIRECTIVES_CONTENT = `# DIRECTIVES — Sprint 042: Big Refactor

## Goal: Refactor the core module for better performance

## Task 1: Do something
`;

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerExplain(program);
  return program;
}

function runExplain(...args: string[]): void {
  const program = buildProgram();
  program.parse(['node', 'test', 'explain', ...args]);
}

describe('explain enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLang.mockReturnValue('en');
  });

  describe('--sprint flag', () => {
    it('should show specific sprint by ID', () => {
      mockExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('sprint-042.md')) return true;
        if (s.includes('RETRO.md')) return false;
        if (s.includes('DIRECTIVES.md')) return false;
        return false;
      });
      mockReadFileSync.mockReturnValue(SPRINT_CONTENT);

      runExplain('--sprint', '042');

      expect(mockPrint).toHaveBeenCalled();
      const output = String(mockPrint.mock.calls[0]?.[0]);
      expect(output).toContain('Sprint #42');
    });

    it('should error on non-existent sprint ID', () => {
      mockExistsSync.mockReturnValue(false);

      runExplain('--sprint', '999');

      expect(mockPrint).toHaveBeenCalledWith('Sprint 999 not found');
    });

    it('should default to latest sprint without --sprint', () => {
      mockReaddirSync.mockReturnValue(['sprint-041.md', 'sprint-042.md'] as unknown as ReturnType<typeof readdirSync>);
      mockExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('sprints')) return true;
        if (s.includes('RETRO.md')) return false;
        if (s.includes('DIRECTIVES.md')) return false;
        return false;
      });
      mockReadFileSync.mockReturnValue(SPRINT_CONTENT);

      runExplain();

      const output = String(mockPrint.mock.calls[0]?.[0]);
      expect(output).toContain('Sprint #42');
    });
  });

  describe('goal extraction', () => {
    it('should extract goal from DIRECTIVES.md', () => {
      mockReaddirSync.mockReturnValue(['sprint-042.md'] as unknown as ReturnType<typeof readdirSync>);
      mockExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('sprints')) return true;
        if (s.includes('DIRECTIVES.md')) return true;
        if (s.includes('RETRO.md')) return false;
        return false;
      });
      mockReadFileSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('DIRECTIVES.md')) return DIRECTIVES_CONTENT;
        return SPRINT_CONTENT;
      });

      runExplain();

      const output = String(mockPrint.mock.calls[0]?.[0]);
      expect(output).toContain('Refactor the core module for better performance');
      expect(output).not.toContain('No goal recorded');
    });

    it('should fallback when no goal available', () => {
      mockReaddirSync.mockReturnValue(['sprint-042.md'] as unknown as ReturnType<typeof readdirSync>);
      mockExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('sprints')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(SPRINT_CONTENT);

      runExplain();

      const output = String(mockPrint.mock.calls[0]?.[0]);
      expect(output).toContain('No goal recorded');
    });
  });

  describe('--json flag', () => {
    it('should output valid JSON', () => {
      mockReaddirSync.mockReturnValue(['sprint-042.md'] as unknown as ReturnType<typeof readdirSync>);
      mockExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('sprints')) return true;
        if (s.includes('memory.db')) return true;
        if (s.includes('DIRECTIVES.md')) return false;
        return false;
      });
      mockReadFileSync.mockImplementation(() => SPRINT_CONTENT);

      runExplain('--json');

      const raw = String(mockPrint.mock.calls[0]?.[0]);
      const parsed = JSON.parse(raw);
      expect(parsed.sprintId).toBe(42);
      expect(parsed.metrics).toBeDefined();
      expect(parsed.metrics.totalTasks).toBe(8);
      expect(parsed.learnings).toEqual(['Lesson one', 'Lesson two']);
    });
  });

  describe('language support', () => {
    it('should show Turkish labels when language is tr', () => {
      mockGetLang.mockReturnValue('tr');
      mockReaddirSync.mockReturnValue(['sprint-042.md'] as unknown as ReturnType<typeof readdirSync>);
      mockExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('sprints')) return true;
        if (s.includes('RETRO.md')) return false;
        if (s.includes('DIRECTIVES.md')) return false;
        return false;
      });
      mockReadFileSync.mockReturnValue(SPRINT_CONTENT);

      runExplain();

      const output = String(mockPrint.mock.calls[0]?.[0]);
      expect(output).toContain('Ne oldu:');
      expect(output).toContain('Özet');
    });
  });

  describe('empty sprint log', () => {
    it('should handle empty content gracefully', () => {
      mockReaddirSync.mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
      mockExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('sprints')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue('');

      runExplain();

      expect(mockPrint).toHaveBeenCalled();
      const output = String(mockPrint.mock.calls[0]?.[0]);
      expect(output).toContain('Sprint #1');
    });
  });

  describe('extractGoalFromDirectives', () => {
    it('should extract goal line', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(DIRECTIVES_CONTENT);
      const goal = extractGoalFromDirectives('/mock/root');
      expect(goal).toBe('Refactor the core module for better performance');
    });

    it('should return null when no DIRECTIVES.md', () => {
      mockExistsSync.mockReturnValue(false);
      const goal = extractGoalFromDirectives('/mock/root');
      expect(goal).toBeNull();
    });
  });

  describe('extractGoalFromSprintLog', () => {
    it('should extract first line after sprint heading', () => {
      const content = '# Sprint 042\nThis is the goal line\n\n## Tasks';
      const goal = extractGoalFromSprintLog(content);
      expect(goal).toBe('This is the goal line');
    });

    it('should return null for empty content', () => {
      expect(extractGoalFromSprintLog('')).toBeNull();
    });
  });

  describe('buildExplainOutput i18n', () => {
    it('should use Turkish labels', () => {
      const summary = {
        sprintNumber: 1,
        totalTasks: 3,
        completed: 2,
        techDebt: 0,
        noGo: 1,
        durationMs: 60000,
        goal: 'Test goal',
        tasks: [],
      };
      const output = buildExplainOutput(summary, { items: ['a'] }, 'tr');
      expect(output).toContain('Ne oldu:');
      expect(output).toContain('Temel öğrenmeler:');
      expect(output).toContain('Hedef: Test goal');
      expect(output).toContain('Süre');
    });
  });
});
