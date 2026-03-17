import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn(),
}));

import { analyzeProject } from '../../src/core/analyzer.js';
import type { ProjectAnalysis } from '../../src/core/types.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('CLI analyze command — branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAnalysis: ProjectAnalysis = {
    framework: 'next',
    language: 'typescript',
    testFramework: 'vitest',
    buildTool: 'tsc',
    ci: 'github-actions',
    fileCount: 120,
    authorCount: 3,
    size: 'medium',
    methodology: 'sprint',
  };

  describe('formatAnalysisResult', () => {
    it('returns a formatted table string', async () => {
      const { formatAnalysisResult } = await import('../../src/cli/commands/analyze.js');

      const result = formatAnalysisResult(mockAnalysis);

      expect(result).toContain('Framework');
      expect(result).toContain('next');
      expect(result).toContain('Language');
      expect(result).toContain('typescript');
      expect(result).toContain('Test Framework');
      expect(result).toContain('vitest');
      expect(result).toContain('Build Tool');
      expect(result).toContain('tsc');
      expect(result).toContain('CI');
      expect(result).toContain('github-actions');
      expect(result).toContain('120');
      expect(result).toContain('3');
      expect(result).toContain('medium');
      expect(result).toContain('sprint');
    });
  });

  describe('registerAnalyze action handler', () => {
    it('outputs formatted table by default', async () => {
      const { registerAnalyze } = await import('../../src/cli/commands/analyze.js');

      vi.mocked(analyzeProject).mockReturnValue(mockAnalysis);

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

      const program = new Command();
      program.exitOverride();
      registerAnalyze(program);

      program.parse(['node', 'test', 'analyze']);

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
      expect(output).toContain('Framework');
      expect(output).toContain('next');

      stdoutSpy.mockRestore();
    });

    it('outputs raw JSON with --json flag', async () => {
      const { registerAnalyze } = await import('../../src/cli/commands/analyze.js');

      vi.mocked(analyzeProject).mockReturnValue(mockAnalysis);

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

      const program = new Command();
      program.exitOverride();
      registerAnalyze(program);

      program.parse(['node', 'test', 'analyze', '--json']);

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.framework).toBe('next');
      expect(parsed.language).toBe('typescript');

      stdoutSpy.mockRestore();
    });
  });
});
