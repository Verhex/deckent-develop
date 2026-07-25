/**
 * error-registry-lint.test.ts — Retrospective tests for Sprint 136 T-007
 *
 * Task 139-009: Verify that `npm run lint:errors` is functional and
 * that `scripts/check-error-handling.mjs` correctly detects violations.
 *
 * Tests cover:
 * 1. lint:errors invoke (package.json script exists + script exits 0)
 * 2. Pattern match (scanFile detects throw new Error( violations)
 * 3. Error class detection (ErrorRegistry export in src/core/errors.ts)
 * 4. collectTsFiles helper
 * 5. formatViolations output
 * 6. runCheck on actual project root (0 violations)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Import the lint script as a module (ESM .mjs)
import {
  scanFile,
  collectTsFiles,
  fingerprintObservations,
  runCheck,
  formatViolations,
} from '../../scripts/check-error-handling.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join('/tmp', `deckent-lint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runCommand(command: string, args: string[], cwd: string): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', rejectCommand);
    child.once('close', (code) => resolveCommand({ code, stdout, stderr }));
  });
}

// ─── Lint Invoke Tests ────────────────────────────────────────────────────────

describe('lint:errors — npm run invoke', () => {
  it('package.json contains lint:errors script pointing to check-error-handling.mjs', () => {
    const pkgPath = join(PROJECT_ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    const scripts = pkg['scripts'] as Record<string, string> | undefined;
    expect(scripts).toBeDefined();
    expect(scripts!['lint:errors']).toBe('node scripts/check-error-handling.mjs');
  });

  it('npm run lint:errors exits zero with visible known-debt count', async () => {
    const result = await runCommand('npm', ['run', 'lint:errors'], PROJECT_ROOT);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('0 new violation(s)');
    expect(result.stdout).toMatch(/\d+ known baseline occurrence\(s\)/);
  });

  it('check-error-handling.mjs file exists', () => {
    const scriptPath = join(PROJECT_ROOT, 'scripts', 'check-error-handling.mjs');
    // Use readFileSync to confirm existence
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });
});

// ─── Pattern Match Tests (scanFile) ──────────────────────────────────────────

describe('scanFile — pattern match', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects throw new Error( on a single line', () => {
    const file = join(tmpDir, 'violating.ts');
    writeFileSync(file, 'throw new Error("something went wrong");\n');
    const violations = scanFile(file);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(1);
    expect(violations[0].file).toBe(file);
    expect(violations[0].content).toContain('throw new Error(');
  });

  it('detects multiple violations in same file', () => {
    const file = join(tmpDir, 'multi.ts');
    writeFileSync(
      file,
      [
        'function a() {',
        '  throw new Error("first");',
        '}',
        'function b() {',
        '  throw new Error("second");',
        '}',
      ].join('\n'),
    );
    const violations = scanFile(file);
    expect(violations).toHaveLength(2);
    expect(violations[0].line).toBe(2);
    expect(violations[1].line).toBe(5);
  });

  it('returns empty array for file with no violations', () => {
    const file = join(tmpDir, 'clean.ts');
    writeFileSync(file, 'throw new DeckentError("code", "message");\n');
    const violations = scanFile(file);
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag throw new DeckentError( as a violation', () => {
    const file = join(tmpDir, 'deckent-error.ts');
    writeFileSync(file, 'throw new DeckentError("DECKENT_E001", "tmux not found");\n');
    const violations = scanFile(file);
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag throw new TypeError( as a violation (only Error)', () => {
    const file = join(tmpDir, 'type-error.ts');
    writeFileSync(file, 'throw new TypeError("bad type");\n');
    const violations = scanFile(file);
    // TypeError is NOT caught by pattern `throw new Error(`
    expect(violations).toHaveLength(0);
  });

  it('captures correct line number for violation in middle of file', () => {
    const file = join(tmpDir, 'middle.ts');
    writeFileSync(
      file,
      [
        '// line 1: comment',
        '// line 2: another',
        '// line 3: another',
        'throw new Error("bad");',
        '// line 5: after',
      ].join('\n'),
    );
    const violations = scanFile(file);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(4);
  });

  it('handles empty file gracefully', () => {
    const file = join(tmpDir, 'empty.ts');
    writeFileSync(file, '');
    const violations = scanFile(file);
    expect(violations).toHaveLength(0);
  });

  it('ignores comments, strings and template literals containing the raw-throw text', () => {
    const file = join(tmpDir, 'non-executable.ts');
    writeFileSync(
      file,
      [
        '// throw new Error("comment")',
        'const plain = \'throw new Error("string")\';',
        'const template = `throw new Error("template")`;',
      ].join('\n'),
    );
    expect(scanFile(file)).toEqual([]);
  });
});

// ─── collectTsFiles Tests ─────────────────────────────────────────────────────

describe('collectTsFiles — directory traversal', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('collects .ts files from a flat directory', () => {
    writeFileSync(join(tmpDir, 'a.ts'), '');
    writeFileSync(join(tmpDir, 'b.ts'), '');
    writeFileSync(join(tmpDir, 'c.js'), ''); // non-ts should be excluded
    const files = collectTsFiles(tmpDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith('a.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('b.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('c.js'))).toBe(false);
  });

  it('recursively collects .ts files from subdirectories', () => {
    mkdirSync(join(tmpDir, 'sub'), { recursive: true });
    writeFileSync(join(tmpDir, 'root.ts'), '');
    writeFileSync(join(tmpDir, 'sub', 'nested.ts'), '');
    const files = collectTsFiles(tmpDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith('root.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('nested.ts'))).toBe(true);
  });

  it('excludes node_modules directory', () => {
    mkdirSync(join(tmpDir, 'node_modules', 'some-pkg'), { recursive: true });
    writeFileSync(join(tmpDir, 'real.ts'), '');
    writeFileSync(join(tmpDir, 'node_modules', 'some-pkg', 'index.ts'), '');
    const files = collectTsFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('real.ts');
  });

  it('excludes dist directory', () => {
    mkdirSync(join(tmpDir, 'dist'), { recursive: true });
    writeFileSync(join(tmpDir, 'src.ts'), '');
    writeFileSync(join(tmpDir, 'dist', 'compiled.ts'), '');
    const files = collectTsFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('src.ts');
  });

  it('returns empty array for non-existent directory', () => {
    const files = collectTsFiles('/tmp/nonexistent-deckent-lint-test-dir-9999');
    expect(files).toHaveLength(0);
  });

  it('returns empty array for empty directory', () => {
    const files = collectTsFiles(tmpDir);
    expect(files).toHaveLength(0);
  });
});

// ─── runCheck Tests ───────────────────────────────────────────────────────────

describe('runCheck — full scan', () => {
  it('current project exactly matches the canonical baseline', () => {
    const { violations, reductions, knownCount, filesScanned } = runCheck(PROJECT_ROOT);
    expect(violations).toEqual([]);
    expect(reductions).toEqual([]);
    expect(knownCount).toBeGreaterThan(0);
    expect(filesScanned).toBeGreaterThan(0);
  });

  it('filesScanned is positive when scanning real project', () => {
    const { filesScanned } = runCheck(PROJECT_ROOT);
    expect(filesScanned).toBeGreaterThanOrEqual(10); // orchestra/ has 60+ modules
  });

  it('detects violations in a mock project root', () => {
    const mockRoot = makeTmpDir();
    try {
      // Create src/orchestra/ subdirectory with a violation
      mkdirSync(join(mockRoot, 'src', 'orchestra'), { recursive: true });
      writeFileSync(
        join(mockRoot, 'src', 'orchestra', 'bad.ts'),
        'throw new Error("should use DeckentError");\n',
      );
      const { violations, filesScanned } = runCheck(mockRoot);
      expect(violations).toHaveLength(1);
      expect(filesScanned).toBe(1);
    } finally {
      rmSync(mockRoot, { recursive: true, force: true });
    }
  });

  it('fails when a governed file exceeds its explicit baseline count', () => {
    const mockRoot = makeTmpDir();
    try {
      mkdirSync(join(mockRoot, 'src', 'core'), { recursive: true });
      writeFileSync(join(mockRoot, 'src', 'core', 'bad.ts'), 'throw new Error("new debt");\n');
      const result = runCheck(mockRoot, {
        baseline: { version: 2, entries: [] },
      });
      expect(result.violations).toHaveLength(1);
      expect(result.reductions).toEqual([]);
    } finally {
      rmSync(mockRoot, { recursive: true, force: true });
    }
  });

  it('fails when a reduction leaves reusable baseline headroom', () => {
    const mockRoot = makeTmpDir();
    try {
      mkdirSync(join(mockRoot, 'src', 'core'), { recursive: true });
      const file = join(mockRoot, 'src', 'core', 'clean.ts');
      writeFileSync(file, 'throw new Error("legacy");\n');
      const entries = fingerprintObservations(scanFile(file), mockRoot);
      writeFileSync(file, 'export const ok = true;\n');
      const result = runCheck(mockRoot, {
        baseline: { version: 2, entries },
      });
      expect(result.violations).toEqual([]);
      expect(result.reductions).toEqual([
        {
          file: entries[0]!.file,
          fingerprint: entries[0]!.fingerprint,
          expected: 1,
          actual: 0,
        },
      ]);
    } finally {
      rmSync(mockRoot, { recursive: true, force: true });
    }
  });

  it('fails a count-neutral same-file substitution', () => {
    const mockRoot = makeTmpDir();
    try {
      mkdirSync(join(mockRoot, 'src', 'core'), { recursive: true });
      const file = join(mockRoot, 'src', 'core', 'same.ts');
      writeFileSync(file, 'throw new Error("legacy");\n');
      const entries = fingerprintObservations(scanFile(file), mockRoot);
      writeFileSync(file, 'throw new Error("new debt");\n');
      const result = runCheck(mockRoot, { baseline: { version: 2, entries } });
      expect(result.violations).toHaveLength(1);
      expect(result.reductions).toHaveLength(1);
      expect(result.violations[0]?.content).toContain('new debt');
    } finally {
      rmSync(mockRoot, { recursive: true, force: true });
    }
  });

  it('does not fail when an unchanged throw moves to another line', () => {
    const mockRoot = makeTmpDir();
    try {
      mkdirSync(join(mockRoot, 'src', 'core'), { recursive: true });
      const file = join(mockRoot, 'src', 'core', 'moved.ts');
      writeFileSync(file, 'throw new Error("same");\n');
      const entries = fingerprintObservations(scanFile(file), mockRoot);
      writeFileSync(file, '\n\nthrow new Error("same");\n');
      const result = runCheck(mockRoot, { baseline: { version: 2, entries } });
      expect(result.violations).toEqual([]);
      expect(result.reductions).toEqual([]);
    } finally {
      rmSync(mockRoot, { recursive: true, force: true });
    }
  });

  it('returns 0 violations for mock project root with no violations', () => {
    const mockRoot = makeTmpDir();
    try {
      mkdirSync(join(mockRoot, 'src', 'orchestra'), { recursive: true });
      writeFileSync(
        join(mockRoot, 'src', 'orchestra', 'good.ts'),
        'throw new DeckentError("DECKENT_E001", "tmux not found");\n',
      );
      const { violations, filesScanned } = runCheck(mockRoot);
      expect(violations).toHaveLength(0);
      expect(filesScanned).toBe(1);
    } finally {
      rmSync(mockRoot, { recursive: true, force: true });
    }
  });
});

// ─── formatViolations Tests ───────────────────────────────────────────────────

describe('formatViolations — output formatting', () => {
  it('returns empty string for zero violations', () => {
    const result = formatViolations([], PROJECT_ROOT);
    expect(result).toBe('');
  });

  it('includes violation count in header', () => {
    const violations = [
      { file: join(PROJECT_ROOT, 'src', 'orchestra', 'bad.ts'), line: 5, content: 'throw new Error("x");' },
    ];
    const result = formatViolations(violations, PROJECT_ROOT);
    expect(result).toContain('1 violation(s)');
  });

  it('includes relative file path (not absolute)', () => {
    const violations = [
      { file: join(PROJECT_ROOT, 'src', 'orchestra', 'bad.ts'), line: 5, content: 'throw new Error("x");' },
    ];
    const result = formatViolations(violations, PROJECT_ROOT);
    // Should use relative path
    expect(result).toContain('src/orchestra/bad.ts');
    expect(result).not.toContain(PROJECT_ROOT);
  });

  it('includes line number for each violation', () => {
    const violations = [
      { file: join(PROJECT_ROOT, 'src', 'orchestra', 'bad.ts'), line: 42, content: 'throw new Error("x");' },
    ];
    const result = formatViolations(violations, PROJECT_ROOT);
    expect(result).toContain(':42');
  });

  it('includes suggested fix instruction', () => {
    const violations = [
      { file: join(PROJECT_ROOT, 'src', 'orchestra', 'bad.ts'), line: 1, content: 'throw new Error("x");' },
    ];
    const result = formatViolations(violations, PROJECT_ROOT);
    expect(result).toContain('DeckentError');
    expect(result).toContain('How to fix');
  });

  it('handles multiple violations', () => {
    const violations = [
      { file: join(PROJECT_ROOT, 'src', 'orchestra', 'a.ts'), line: 1, content: 'throw new Error("a");' },
      { file: join(PROJECT_ROOT, 'src', 'orchestra', 'b.ts'), line: 2, content: 'throw new Error("b");' },
    ];
    const result = formatViolations(violations, PROJECT_ROOT);
    expect(result).toContain('2 violation(s)');
    expect(result).toContain('src/orchestra/a.ts');
    expect(result).toContain('src/orchestra/b.ts');
  });
});

// ─── ErrorRegistry Export Verification ───────────────────────────────────────

describe('ErrorRegistry — export presence in src/core/errors.ts', () => {
  it('errors.ts exports ErrorRegistry class/object', () => {
    const errorsPath = join(PROJECT_ROOT, 'src', 'core', 'errors.ts');
    const content = readFileSync(errorsPath, 'utf-8');
    expect(content).toContain('ErrorRegistry');
    // Should be exported
    expect(content).toMatch(/export\s+(const|class)\s+ErrorRegistry/);
  });

  it('errors.ts exports DeckentError class', () => {
    const errorsPath = join(PROJECT_ROOT, 'src', 'core', 'errors.ts');
    const content = readFileSync(errorsPath, 'utf-8');
    expect(content).toContain('export class DeckentError');
  });

  it('ErrorRegistry has register() method', () => {
    const errorsPath = join(PROJECT_ROOT, 'src', 'core', 'errors.ts');
    const content = readFileSync(errorsPath, 'utf-8');
    expect(content).toContain('register(');
  });

  it('ErrorRegistry has createError() method', () => {
    const errorsPath = join(PROJECT_ROOT, 'src', 'core', 'errors.ts');
    const content = readFileSync(errorsPath, 'utf-8');
    expect(content).toContain('createError(');
  });

  it('src/core/errors.ts does not contain raw throw new Error( at module level', () => {
    // errors.ts itself should use DeckentError, not raw Error
    const errorsPath = join(PROJECT_ROOT, 'src', 'core', 'errors.ts');
    const content = readFileSync(errorsPath, 'utf-8');
    // The file defines DeckentError class which extends Error — that's allowed
    // But should not have `throw new Error(` at the module level
    const lines = content.split('\n');
    const rawThrows = lines.filter((l) => /throw new Error\(/.test(l));
    expect(rawThrows).toHaveLength(0);
  });
});
