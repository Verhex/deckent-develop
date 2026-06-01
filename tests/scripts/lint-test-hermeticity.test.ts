import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWLIST,
  HERMETIC_PATTERNS,
  checkFile,
  scanTestDir,
} from '../../scripts/lint-test-hermeticity.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..', '..');

// Hermetic sandbox — each test gets a fresh tmpdir, cleaned up in afterEach
let sandbox: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'hermetic-lint-'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// ─── checkFile — violation detection ─────────────────────────────────────────

describe('checkFile — violation detection', () => {
  it('detects process.cwd() + .deckent access as a violation', () => {
    const content = `const configPath = join(process.cwd(), '.deckent', 'config.json');`;
    const violations = checkFile(content, 'tests/bad.test.ts');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].line).toBe(1);
    expect(violations[0].label).toContain('.deckent');
  });

  it('detects process.cwd() + .brain access as a violation', () => {
    const content = `const debtPath = join(process.cwd(), '.brain', 'exports', 'debt.md');`;
    const violations = checkFile(content, 'tests/bad.test.ts');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].label).toContain('.brain');
  });

  it('detects .deckent/config.json as literal in readFileSync', () => {
    const content = `const raw = readFileSync('.deckent/config.json', 'utf-8');`;
    const violations = checkFile(content, 'tests/bad.test.ts');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('passes clean test file (uses tmpdir sandbox) with 0 violations', () => {
    const content = [
      `import { tmpdir } from 'node:os';`,
      `const sandbox = mkdtempSync(join(tmpdir(), 'test-'));`,
      `writeFileSync(join(sandbox, '.deckent', 'config.json'), '{}');`,
    ].join('\n');
    const violations = checkFile(content, 'tests/clean.test.ts');
    expect(violations).toHaveLength(0);
  });

  it('does not flag comment-only lines', () => {
    const content = [
      `// process.cwd() + .deckent/config.json example in comment`,
      `// readFileSync('.brain/memory.db') is mentioned here too`,
    ].join('\n');
    const violations = checkFile(content, 'tests/comments.test.ts');
    expect(violations).toHaveLength(0);
  });

  it('includes file:line:match:label in each violation object', () => {
    const content = `const p = join(process.cwd(), '.deckent', 'config.json');`;
    const violations = checkFile(content, 'tests/reporter.test.ts');
    expect(violations.length).toBeGreaterThan(0);
    const v = violations[0];
    expect(v).toHaveProperty('file', 'tests/reporter.test.ts');
    expect(v).toHaveProperty('line', 1);
    expect(typeof v.label).toBe('string');
    expect(typeof v.match).toBe('string');
    expect(v.match).toContain('process.cwd()');
  });

  it('does not flag .deckent paths inside a tmpdir variable on the same line', () => {
    // Line that has both process.cwd() and tmpdir() — should be treated as hermetic
    const content = `const p = join(process.cwd(), tmpdir(), '.deckent', 'test');`;
    const violations = checkFile(content, 'tests/mixed.test.ts');
    expect(violations).toHaveLength(0);
  });

  it('does not flag lines using mkdtempSync sandbox with .deckent', () => {
    const content = [
      `const sandbox = mkdtempSync(join(tmpdir(), 'x-'));`,
      `const cfg = join(sandbox, '.deckent', 'config.json');`,
    ].join('\n');
    // Line 2 has .deckent but NOT process.cwd() — doesn't match any violation pattern
    const violations = checkFile(content, 'tests/sandbox.test.ts');
    expect(violations).toHaveLength(0);
  });
});

// ─── scanTestDir — allowlist ──────────────────────────────────────────────────

describe('scanTestDir — sandbox + allowlist', () => {
  it('detects violations in a synthetic non-hermetic test file', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'bad.test.ts'),
      `const debtPath = join(process.cwd(), '.brain', 'exports', 'debt.md');\n`,
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].file).toContain('bad.test.ts');
    expect(result.checked).toBe(1);
  });

  it('skips files in the allowlist', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'allowed.test.ts'),
      `const p = join(process.cwd(), '.deckent', 'config.json');\n`,
    );
    const result = scanTestDir(join(sandbox, 'tests'), ['tests/allowed.test.ts'], sandbox);
    expect(result.violations).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(result.checked).toBe(0);
  });

  it('reports 0 violations for a fully hermetic test file', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'clean.test.ts'),
      [
        `import { tmpdir } from 'node:os';`,
        `const s = mkdtempSync(join(tmpdir(), 'clean-'));`,
        `writeFileSync(join(s, '.deckent', 'config.json'), '{}');`,
      ].join('\n'),
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations).toHaveLength(0);
    expect(result.checked).toBe(1);
  });

  it('violation objects carry file:line info for reporting', () => {
    mkdirSync(join(sandbox, 'tests'));
    writeFileSync(
      join(sandbox, 'tests', 'reporter.test.ts'),
      `// first line\nconst x = join(process.cwd(), '.brain', 'memory.db');\n`,
    );
    const result = scanTestDir(join(sandbox, 'tests'), [], sandbox);
    expect(result.violations.length).toBeGreaterThan(0);
    const v = result.violations[0];
    expect(v).toHaveProperty('line', 2); // second line (first is comment)
    expect(v.file).toMatch(/reporter\.test\.ts/);
  });
});

// ─── ALLOWLIST integrity ──────────────────────────────────────────────────────

describe('ALLOWLIST', () => {
  it('contains the known skip-if-absent files', () => {
    expect(ALLOWLIST).toContain('tests/scripts/adr-validator.test.ts');
    expect(ALLOWLIST).toContain('tests/core/nervous-enabled-integration.test.ts');
    expect(ALLOWLIST).toContain('tests/orchestra/spawn-backend-docker.test.ts');
    // Meta-test itself is allowlisted (patterns appear as fixture data, not real access)
    expect(ALLOWLIST).toContain('tests/scripts/lint-test-hermeticity.test.ts');
  });

  it('is an array of strings', () => {
    expect(Array.isArray(ALLOWLIST)).toBe(true);
    for (const entry of ALLOWLIST) {
      expect(typeof entry).toBe('string');
    }
  });
});

// ─── HERMETIC_PATTERNS integrity ─────────────────────────────────────────────

describe('HERMETIC_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(HERMETIC_PATTERNS)).toBe(true);
    expect(HERMETIC_PATTERNS.length).toBeGreaterThan(0);
  });

  it('each entry has re (RegExp) and label (string)', () => {
    for (const p of HERMETIC_PATTERNS) {
      expect(p.re).toBeInstanceOf(RegExp);
      expect(typeof p.label).toBe('string');
    }
  });

  it('process.cwd()+.deckent pattern matches expected input', () => {
    const input = `const p = join(process.cwd(), '.deckent', 'config.json');`;
    const matched = HERMETIC_PATTERNS.some(({ re }) => re.test(input));
    expect(matched).toBe(true);
  });

  it('process.cwd()+.brain pattern matches expected input', () => {
    const input = `const d = join(process.cwd(), '.brain', 'exports', 'debt.md');`;
    const matched = HERMETIC_PATTERNS.some(({ re }) => re.test(input));
    expect(matched).toBe(true);
  });
});
