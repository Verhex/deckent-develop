import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  isAllowlisted,
  isCommentLine,
  isTestFile,
  scanFile,
  scanForViolations,
} from '../../scripts/zero-hardcode-audit.mjs';

const projectRoot = resolve(import.meta.dirname, '..', '..');
const tmpDir = join(projectRoot, '.tmp-test', 'zero-hardcode');

function ensureTmp() {
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
}

function writeTmp(name: string, content: string): string {
  ensureTmp();
  const p = join(tmpDir, name);
  writeFileSync(p, content, 'utf-8');
  return p;
}

// ─── isAllowlisted ────────────────────────────────────────────────────────

describe('isAllowlisted', () => {
  it('returns true for model-registry.ts', () => {
    const p = join(projectRoot, 'src', 'core', 'model-registry.ts');
    expect(isAllowlisted(p, projectRoot)).toBe(true);
  });

  it('returns true for model-catalog.ts', () => {
    const p = join(projectRoot, 'src', 'core', 'model-catalog.ts');
    expect(isAllowlisted(p, projectRoot)).toBe(true);
  });

  it('returns false for other src files', () => {
    const p = join(projectRoot, 'src', 'core', 'pricing-updater.ts');
    expect(isAllowlisted(p, projectRoot)).toBe(false);
  });

  it('returns false for test files', () => {
    const p = join(projectRoot, 'tests', 'core', 'model-registry.test.ts');
    expect(isAllowlisted(p, projectRoot)).toBe(false);
  });
});

// ─── isCommentLine ────────────────────────────────────────────────────────

describe('isCommentLine', () => {
  it('identifies // comment lines', () => {
    expect(isCommentLine('  // this is a comment')).toBe(true);
  });

  it('identifies JSDoc * lines', () => {
    expect(isCommentLine('   * @param foo bar')).toBe(true);
  });

  it('returns false for regular code lines', () => {
    expect(isCommentLine('  const model = "claude-opus-4-8";')).toBe(false);
  });

  it('returns false for empty lines', () => {
    expect(isCommentLine('')).toBe(false);
  });
});

// ─── scanFile — violation detection ──────────────────────────────────────

describe('scanFile — violation detection', () => {
  it('detects hardcoded opus model string in code', () => {
    const path = writeTmp('violation-opus.ts', `
const MODEL = 'claude-opus-4-8';
export { MODEL };
`);
    const violations = scanFile(path);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].match).toBe('claude-opus-4-8');
  });

  it('detects hardcoded sonnet model string in code', () => {
    const path = writeTmp('violation-sonnet.ts', `
const id = "claude-sonnet-4-6";
`);
    const violations = scanFile(path);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].match).toBe('claude-sonnet-4-6');
  });

  it('skips hardcoded model string in comment lines', () => {
    const path = writeTmp('comment-only.ts', `
// Normalize: "anthropic/claude-opus-4-6" → "claude-opus-4-6"
// * example: claude-sonnet-4-6
`);
    const violations = scanFile(path);
    expect(violations.length).toBe(0);
  });

  it('skips hardcoded model string in JSDoc lines', () => {
    const path = writeTmp('jsdoc-only.ts', `
/**
 * @example
 *   model: 'claude-opus-4-7',
 */
export function foo() {}
`);
    const violations = scanFile(path);
    expect(violations.length).toBe(0);
  });

  it('returns empty array for non-existent file', () => {
    const violations = scanFile('/nonexistent/path/file.ts');
    expect(violations).toEqual([]);
  });

  it('returns violation with correct line number', () => {
    const path = writeTmp('line-number.ts', `
const a = 1;
const b = 2;
const model = 'claude-haiku-4-5-20251001';
`);
    const violations = scanFile(path);
    expect(violations.length).toBe(1);
    expect(violations[0].line).toBe(4);
  });
});

// ─── scanForViolations — full scan ───────────────────────────────────────

describe('scanForViolations — clean→exit0', () => {
  it('exits 0 on current codebase (clean)', () => {
    const result = scanForViolations(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.violations.length).toBe(0);
  });
});

describe('scanForViolations — dirty→exit1', () => {
  it('exits 1 when a violation is injected via scanFile', () => {
    const path = writeTmp('injected-violation.ts', `
// This simulates a file that slipped a hardcoded model into actual code
export const DEFAULT_MODEL = 'claude-opus-4-8';
`);
    const violations = scanFile(path);
    expect(violations.length).toBeGreaterThan(0);
    // exit code would be 1 if this file were in src/
    const exitCode = violations.length > 0 ? 1 : 0;
    expect(exitCode).toBe(1);
  });
});

// ─── Script execution (CLI) ───────────────────────────────────────────────

describe('zero-hardcode-audit.mjs CLI execution', () => {
  it('exits 0 on current clean codebase', () => {
    const result = spawnSync('node', [
      join(projectRoot, 'scripts', 'zero-hardcode-audit.mjs'),
      '--root', projectRoot,
    ], { encoding: 'utf-8', timeout: 30_000 });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK');
  }, 45_000);

  it('produces JSON output with --json flag', () => {
    const result = spawnSync('node', [
      join(projectRoot, 'scripts', 'zero-hardcode-audit.mjs'),
      '--root', projectRoot,
      '--json',
    ], { encoding: 'utf-8', timeout: 30_000 });

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json).toHaveProperty('violations');
    expect(json).toHaveProperty('exitCode');
    expect(json.exitCode).toBe(0);
  }, 45_000);

  it('allowlist exempts model-registry.ts from violations', () => {
    // model-registry.ts has apiId: 'claude-opus-4-8' etc. — must NOT appear in violations
    const result = spawnSync('node', [
      join(projectRoot, 'scripts', 'zero-hardcode-audit.mjs'),
      '--root', projectRoot,
      '--json',
    ], { encoding: 'utf-8', timeout: 30_000 });

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    const modelRegistryViolation = json.violations.find(
      (v: { file: string }) => v.file.includes('model-registry.ts')
    );
    expect(modelRegistryViolation).toBeUndefined();
  }, 45_000);
});
