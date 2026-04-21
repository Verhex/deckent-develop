import { describe, it, expect } from 'vitest';
import { findExports, auditKnownSuspects, generateReport } from '../../scripts/dead-code-audit.mjs';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..', '..');

// ─── findExports ──────────────────────────────────────────────────────────

describe('findExports', () => {
  it('extracts named function exports', () => {
    const testFile = join(projectRoot, 'src', 'core', 'config.ts');
    const exports = findExports(testFile);
    expect(exports).toContain('loadConfig');
  });

  it('extracts class exports', () => {
    const testFile = join(projectRoot, 'src', 'orchestra', 'parallel-pipeline.ts');
    const exports = findExports(testFile);
    expect(exports).toContain('ParallelPipelineManager');
  });

  it('extracts interface/type exports', () => {
    // types.ts uses `export *` re-exports which aren't named exports
    // Use task-types.ts which has actual interface declarations
    const testFile = join(projectRoot, 'src', 'core', 'task-types.ts');
    const exports = findExports(testFile);
    expect(exports.length).toBeGreaterThan(0);
  });

  it('returns empty array for non-existent file', () => {
    const exports = findExports('/nonexistent/file.ts');
    expect(exports).toEqual([]);
  });
});

// ─── auditKnownSuspects ──────────────────────────────────────────────────

describe('auditKnownSuspects', () => {
  it('returns results for all existing suspects', () => {
    const results = auditKnownSuspects();
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty('module');
      expect(r).toHaveProperty('category');
      expect(r).toHaveProperty('reason');
      expect(r).toHaveProperty('importCount');
      expect(r).toHaveProperty('lineCount');
      expect(typeof r.lineCount).toBe('number');
      expect(r.lineCount).toBeGreaterThan(0);
    }
  });

  it('categorizes ADR-protected modules as Dormant', () => {
    const results = auditKnownSuspects();
    const decisionEngine = results.find(r => r.module.includes('decision-engine.ts'));
    expect(decisionEngine).toBeDefined();
    expect(decisionEngine!.category).toBe('Dormant');
  });

  it('categorizes unimported modules as Dead', () => {
    const results = auditKnownSuspects();
    const learningDecay = results.find(r => r.module.includes('learning-decay.ts'));
    if (learningDecay) {
      expect(learningDecay.category).toBe('Dead');
      expect(learningDecay.importCount).toBe(0);
    }
  });

  it('assigns correct categories: Dead, Dormant, Lightly-Used, or Active', () => {
    const validCategories = ['Dead', 'Dormant', 'Lightly-Used', 'Active'];
    const results = auditKnownSuspects();
    for (const r of results) {
      expect(validCategories).toContain(r.category);
    }
  });
});

// ─── generateReport ───────────────────────────────────────────────────────

describe('generateReport', () => {
  it('generates valid markdown with all sections', () => {
    const report = generateReport({
      suspectResults: [
        {
          module: 'src/test/dead.ts',
          category: 'Dead',
          reason: 'never imported',
          importCount: 0,
          importedBy: [],
          lineCount: 100,
        },
        {
          module: 'src/test/dormant.ts',
          category: 'Dormant',
          reason: 'ADR protected',
          importCount: 0,
          importedBy: [],
          lineCount: 50,
        },
      ],
      unusedExports: [
        { file: 'src/test/foo.ts', export: 'unusedFn', importCount: 0 },
      ],
    });

    expect(report).toContain('# Dead Code Audit Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Dead Code');
    expect(report).toContain('## Dormant Code');
    expect(report).toContain('## Lightly-Used Code');
    expect(report).toContain('## Active Code');
    expect(report).toContain('## Unused Export Sampling');
    expect(report).toContain('## Recommendations');
  });

  it('includes correct line counts in summary table', () => {
    const report = generateReport({
      suspectResults: [
        {
          module: 'src/a.ts',
          category: 'Dead',
          reason: 'test',
          importCount: 0,
          importedBy: [],
          lineCount: 200,
        },
        {
          module: 'src/b.ts',
          category: 'Dead',
          reason: 'test',
          importCount: 0,
          importedBy: [],
          lineCount: 300,
        },
      ],
      unusedExports: [],
    });

    // 2 dead modules, 500 total lines
    expect(report).toContain('| Dead | 2 | 500 |');
  });

  it('handles empty results gracefully', () => {
    const report = generateReport({
      suspectResults: [],
      unusedExports: [],
    });

    expect(report).toContain('# Dead Code Audit Report');
    expect(report).toContain('No dead modules found');
  });
});

// ─── Script execution ─────────────────────────────────────────────────────

describe('dead-code-audit.mjs script execution', () => {
  it('runs successfully with exit code 0', () => {
    const result = spawnSync('node', [
      join(projectRoot, 'scripts', 'dead-code-audit.mjs'),
      '--root', projectRoot,
    ], {
      encoding: 'utf-8',
      timeout: 120_000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Audit complete');
  }, 150_000);

  it('produces JSON output with --json flag', () => {
    const result = spawnSync('node', [
      join(projectRoot, 'scripts', 'dead-code-audit.mjs'),
      '--root', projectRoot,
      '--json',
    ], {
      encoding: 'utf-8',
      timeout: 120_000,
    });

    expect(result.status).toBe(0);
    // JSON output should contain suspectResults
    expect(result.stdout).toContain('"suspectResults"');
    expect(result.stdout).toContain('"summary"');
  }, 150_000);

  it('generates report file', () => {
    const reportPath = join(projectRoot, 'docs', 'audits', 'sprint-139', 'dead-code-report.md');
    expect(existsSync(reportPath)).toBe(true);
  });
});
