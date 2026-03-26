/**
 * Tests for framework detection improvements:
 * - React detection via src/dashboard/ sub-project
 * - analyzer.ts as a wrapper around detectProjectStack()
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  statSync: vi.fn().mockReturnValue({ mtimeMs: 0 }),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
}));

import * as fs from 'node:fs';
import { detectProjectStack } from '../../src/core/stack-detector.js';
import { analyzeProject, clearAnalyzeCache } from '../../src/core/analyzer.js';

const ROOT = '/test/project';

function mockDashboardPackageJson(deps: Record<string, string> = {}) {
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    const s = String(p);
    return s.includes('src/dashboard') && s.endsWith('package.json');
  });
  vi.mocked(fs.readFileSync).mockImplementation((p) => {
    const s = String(p);
    if (s.includes('src/dashboard') && s.endsWith('package.json')) {
      return JSON.stringify({ dependencies: deps, devDependencies: {} });
    }
    return '{}';
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAnalyzeCache();
  vi.mocked(fs.existsSync).mockReturnValue(false);
  vi.mocked(fs.readFileSync).mockReturnValue('');
  vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 0 } as ReturnType<typeof fs.statSync>);
  vi.mocked(fs.readdirSync).mockReturnValue([]);
});

// ─── React Detection via src/dashboard/ ──────────────────────────────────────

describe('React detection via src/dashboard/', () => {
  it('detects react when src/dashboard/package.json contains react dep', () => {
    mockDashboardPackageJson({ react: '^19.0.0', 'react-dom': '^19.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('react');
  });

  it('does NOT detect react when src/dashboard/package.json has no react dep', () => {
    mockDashboardPackageJson({ lodash: '^4.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('unknown');
  });

  it('skips dashboard check when root package.json already has a framework', () => {
    // Root package.json has express — should NOT be overridden by dashboard check
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.endsWith('package.json');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('src/dashboard')) {
        return JSON.stringify({ dependencies: { react: '^19.0.0' } });
      }
      return JSON.stringify({ dependencies: { express: '^4.18.0' } });
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('express');
  });

  it('does not set framework when src/dashboard/package.json is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('unknown');
  });

  it('handles malformed src/dashboard/package.json gracefully', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.includes('src/dashboard') && s.endsWith('package.json');
    });
    vi.mocked(fs.readFileSync).mockReturnValue('not-valid-json{{{{');

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('unknown');
  });
});

// ─── analyzer.ts → detectProjectStack() wrapper ──────────────────────────────

describe('analyzer.ts as detectProjectStack() wrapper', () => {
  it('returns react framework when dashboard has React', () => {
    mockDashboardPackageJson({ react: '^19.0.0' });

    const analysis = analyzeProject(ROOT);
    expect(analysis.framework).toBe('react');
  });

  it('returns vitest from stack-detector when vitest is in devDeps', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('package.json'));
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' } })
    );

    const analysis = analyzeProject(ROOT);
    expect(analysis.testFramework).toBe('vitest');
  });

  it('detects vite buildTool via stack-detector', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('package.json'));
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ devDependencies: { vite: '^5.0.0' } })
    );

    const analysis = analyzeProject(ROOT);
    expect(analysis.buildTool).toBe('vite');
  });

  it('detects mixed language (TypeScript + Rust coexistence)', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.endsWith('tsconfig.json') || s.endsWith('Cargo.toml');
    });
    vi.mocked(fs.readFileSync).mockReturnValue('');

    const analysis = analyzeProject(ROOT);
    expect(analysis.language).toBe('mixed');
  });

  it('CI detection remains in analyzer (not in stack-detector)', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.includes('.github/workflows');
    });

    const analysis = analyzeProject(ROOT);
    expect(analysis.ci).toBe('github-actions');
    // stack-detector shouldn't change this — it has no ci field
    const stack = detectProjectStack(ROOT);
    expect(stack).not.toHaveProperty('ci');
  });

  it('framework from root package.json takes priority over dashboard', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.endsWith('package.json');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('src/dashboard')) {
        return JSON.stringify({ dependencies: { react: '^19.0.0' } });
      }
      return JSON.stringify({ dependencies: { vue: '^3.0.0' } });
    });

    const analysis = analyzeProject(ROOT);
    expect(analysis.framework).toBe('vue');
  });
});
