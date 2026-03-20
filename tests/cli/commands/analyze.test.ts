import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import type { ProjectAnalysis } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  formatTable: vi.fn((headers: string[], rows: string[][]) => {
    return [headers.join('|'), ...rows.map(r => r.join('|'))].join('\n');
  }),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { analyzeProject } from '../../../src/core/analyzer.js';
import { print, formatTable } from '../../../src/cli/helpers/output.js';
import { resolveProjectRoot } from '../../../src/cli/helpers/process.js';
import { registerAnalyze, formatAnalysisResult } from '../../../src/cli/commands/analyze.js';

// ─── Helpers ─────────────────────────────────────────────────────────

const mockAnalysis: ProjectAnalysis = {
  framework: 'react',
  language: 'typescript',
  testFramework: 'vitest',
  buildTool: 'vite',
  ci: 'github-actions',
  fileCount: 42,
  authorCount: 3,
  size: 'medium',
  methodology: 'agile',
};

function runCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const program = new Command();
    program.exitOverride();
    registerAnalyze(program);
    try {
      program.parse(['node', 'deckent', ...args]);
      resolve();
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'commander.helpDisplayed' || e?.code === 'commander.version') {
        resolve();
      } else {
        reject(err);
      }
    }
  });
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('registerAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzeProject).mockReturnValue(mockAnalysis);
  });

  describe('command registration', () => {
    it('registers the analyze command', () => {
      const program = new Command();
      registerAnalyze(program);
      const cmd = program.commands.find(c => c.name() === 'analyze');
      expect(cmd).toBeDefined();
    });

    it('registers with correct description', () => {
      const program = new Command();
      registerAnalyze(program);
      const cmd = program.commands.find(c => c.name() === 'analyze');
      expect(cmd?.description()).toContain('Analyze');
    });

    it('registers --json flag', () => {
      const program = new Command();
      registerAnalyze(program);
      const cmd = program.commands.find(c => c.name() === 'analyze');
      const jsonOpt = cmd?.options.find(o => o.long === '--json');
      expect(jsonOpt).toBeDefined();
    });
  });

  describe('analyzeProject delegation', () => {
    it('calls analyzeProject with resolved root', async () => {
      await runCommand(['analyze']);
      expect(analyzeProject).toHaveBeenCalledWith('/mock/root');
    });

    it('calls resolveProjectRoot to determine root', async () => {
      await runCommand(['analyze']);
      expect(resolveProjectRoot).toHaveBeenCalled();
    });

    it('prints formatted table output by default', async () => {
      await runCommand(['analyze']);
      expect(formatTable).toHaveBeenCalled();
      expect(print).toHaveBeenCalled();
    });

    it('prints JSON output with --json flag', async () => {
      await runCommand(['analyze', '--json']);
      const call = vi.mocked(print).mock.calls[0][0];
      const parsed = JSON.parse(call);
      expect(parsed).toMatchObject(mockAnalysis);
    });

    it('JSON output is pretty-printed with 2-space indent', async () => {
      await runCommand(['analyze', '--json']);
      const call = vi.mocked(print).mock.calls[0][0];
      expect(call).toContain('\n');
      expect(call).toContain('  ');
    });
  });

  describe('framework detection via formatAnalysisResult', () => {
    it('includes language in output', () => {
      const result = formatAnalysisResult(mockAnalysis);
      expect(result).toContain('typescript');
    });

    it('includes test framework in output', () => {
      const result = formatAnalysisResult(mockAnalysis);
      expect(result).toContain('vitest');
    });

    it('includes build tool in output', () => {
      const result = formatAnalysisResult(mockAnalysis);
      expect(result).toContain('vite');
    });

    it('includes CI in output', () => {
      const result = formatAnalysisResult(mockAnalysis);
      expect(result).toContain('github-actions');
    });

    it('includes file count in output', () => {
      const result = formatAnalysisResult(mockAnalysis);
      expect(result).toContain('42');
    });
  });

  describe('error handling', () => {
    it('falls back to process.cwd() when resolveProjectRoot throws', async () => {
      vi.mocked(resolveProjectRoot).mockImplementationOnce(() => {
        throw new Error('Not a git repo');
      });
      const cwd = process.cwd();
      await runCommand(['analyze']);
      expect(analyzeProject).toHaveBeenCalledWith(cwd);
    });

    it('still calls analyzeProject even when resolveProjectRoot fails', async () => {
      vi.mocked(resolveProjectRoot).mockImplementationOnce(() => {
        throw new Error('No git');
      });
      await runCommand(['analyze']);
      expect(analyzeProject).toHaveBeenCalledTimes(1);
    });
  });
});

describe('formatAnalysisResult', () => {
  it('passes correct headers to formatTable', () => {
    formatAnalysisResult(mockAnalysis);
    const [headers] = vi.mocked(formatTable).mock.calls[0];
    expect(headers).toEqual(['Property', 'Value']);
  });

  it('includes all expected rows', () => {
    formatAnalysisResult(mockAnalysis);
    const [, rows] = vi.mocked(formatTable).mock.calls[0];
    const props = rows.map((r: string[]) => r[0]);
    expect(props).toContain('Framework');
    expect(props).toContain('Language');
    expect(props).toContain('Test Framework');
    expect(props).toContain('Build Tool');
    expect(props).toContain('CI');
    expect(props).toContain('File Count');
    expect(props).toContain('Authors');
    expect(props).toContain('Size');
    expect(props).toContain('Methodology');
  });

  it('converts numeric fields to strings', () => {
    formatAnalysisResult(mockAnalysis);
    const [, rows] = vi.mocked(formatTable).mock.calls[0];
    const fileCountRow = rows.find((r: string[]) => r[0] === 'File Count');
    expect(typeof fileCountRow[1]).toBe('string');
    expect(fileCountRow[1]).toBe('42');
  });
});
