import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseDeckFile,
  loadDeckSecrets,
  validateDeckFile,
  createDeckTemplate,
  ensureDeckGitignore,
  isDeckFileCommitted,
  KNOWN_DECK_KEYS,
  DECK_FILE_NAME,
} from '../../src/core/deck-file.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `deckent-deck-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── parseDeckFile ──────────────────────────────────────────────────────────

describe('parseDeckFile', () => {
  it('parses simple KEY=VALUE pairs', () => {
    const content = 'FOO=bar\nBAZ=qux';
    expect(parseDeckFile(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('skips comment lines starting with #', () => {
    const content = '# this is a comment\nKEY=value\n# another comment';
    expect(parseDeckFile(content)).toEqual({ KEY: 'value' });
  });

  it('skips blank lines', () => {
    const content = '\nKEY=value\n\n\nKEY2=value2\n';
    expect(parseDeckFile(content)).toEqual({ KEY: 'value', KEY2: 'value2' });
  });

  it('trims whitespace around keys and values', () => {
    const content = '  KEY  =  value  ';
    expect(parseDeckFile(content)).toEqual({ KEY: 'value' });
  });

  it('handles = in value (only first = splits)', () => {
    const content = 'DB_URL=postgres://user:pass@host/db?opt=1';
    expect(parseDeckFile(content)).toEqual({ DB_URL: 'postgres://user:pass@host/db?opt=1' });
  });

  it('strips double quotes from values', () => {
    const content = 'KEY="hello world"';
    expect(parseDeckFile(content)).toEqual({ KEY: 'hello world' });
  });

  it('strips single quotes from values', () => {
    const content = "KEY='hello world'";
    expect(parseDeckFile(content)).toEqual({ KEY: 'hello world' });
  });

  it('does not strip mismatched quotes', () => {
    const content = 'KEY="hello\'';
    expect(parseDeckFile(content)).toEqual({ KEY: '"hello\'' });
  });

  it('handles empty value', () => {
    const content = 'KEY=';
    expect(parseDeckFile(content)).toEqual({ KEY: '' });
  });

  it('handles unicode values', () => {
    const content = 'KEY=türkçe-değer-🚀';
    expect(parseDeckFile(content)).toEqual({ KEY: 'türkçe-değer-🚀' });
  });

  it('returns empty record for empty string', () => {
    expect(parseDeckFile('')).toEqual({});
  });

  it('skips lines without = separator', () => {
    const content = 'INVALID_LINE\nKEY=value';
    expect(parseDeckFile(content)).toEqual({ KEY: 'value' });
  });

  it('skips lines with empty key before =', () => {
    const content = '=value\nKEY=ok';
    expect(parseDeckFile(content)).toEqual({ KEY: 'ok' });
  });
});

// ─── loadDeckSecrets ────────────────────────────────────────────────────────

describe('loadDeckSecrets', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty record if .deck file is missing', () => {
    expect(loadDeckSecrets(tempDir)).toEqual({});
  });

  it('loads secrets from existing .deck file', () => {
    writeFileSync(join(tempDir, '.deck'), 'DECKENT_CLAUDE_API_KEY=sk-test\n', 'utf-8');
    const secrets = loadDeckSecrets(tempDir);
    expect(secrets).toEqual({ DECKENT_CLAUDE_API_KEY: 'sk-test' });
  });

  it('returns empty record if .deck file is unreadable', () => {
    // Write a directory named .deck to cause a read error
    mkdirSync(join(tempDir, '.deck'));
    expect(loadDeckSecrets(tempDir)).toEqual({});
  });
});

// ─── validateDeckFile ───────────────────────────────────────────────────────

describe('validateDeckFile', () => {
  it('returns valid for all known keys', () => {
    const secrets: Record<string, string> = {};
    for (const key of KNOWN_DECK_KEYS) {
      secrets[key] = 'test-value';
    }
    const result = validateDeckFile(secrets);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('warns on unknown keys', () => {
    const result = validateDeckFile({ UNKNOWN_KEY: 'value' });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('UNKNOWN_KEY');
  });

  it('errors on invalid key format', () => {
    const result = validateDeckFile({ '123-bad': 'value' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('123-bad');
  });

  it('returns valid for empty record', () => {
    const result = validateDeckFile({});
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('reports both warnings and errors together', () => {
    const result = validateDeckFile({
      DECKENT_CLAUDE_API_KEY: 'ok',
      CUSTOM_KEY: 'warn',
      '!bad': 'error',
    });
    expect(result.valid).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });
});

// ─── createDeckTemplate ─────────────────────────────────────────────────────

describe('createDeckTemplate', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .deck file in project root', () => {
    createDeckTemplate(tempDir);
    expect(existsSync(join(tempDir, '.deck'))).toBe(true);
  });

  it('template contains all known keys', () => {
    createDeckTemplate(tempDir);
    const content = readFileSync(join(tempDir, '.deck'), 'utf-8');
    for (const key of KNOWN_DECK_KEYS) {
      expect(content).toContain(`${key}=`);
    }
  });

  it('template contains comment header', () => {
    createDeckTemplate(tempDir);
    const content = readFileSync(join(tempDir, '.deck'), 'utf-8');
    expect(content).toContain('# ');
    expect(content).toContain('Deckent');
  });

  it('template is parseable and all values are empty', () => {
    createDeckTemplate(tempDir);
    const content = readFileSync(join(tempDir, '.deck'), 'utf-8');
    const parsed = parseDeckFile(content);
    for (const key of KNOWN_DECK_KEYS) {
      expect(parsed[key]).toBe('');
    }
  });
});

// ─── ensureDeckGitignore ────────────────────────────────────────────────────

describe('ensureDeckGitignore', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .gitignore with .deck if not present', () => {
    ensureDeckGitignore(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.deck');
  });

  it('appends .deck to existing .gitignore', () => {
    writeFileSync(join(tempDir, '.gitignore'), 'node_modules\n', 'utf-8');
    ensureDeckGitignore(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('.deck');
  });

  it('does not duplicate .deck entry', () => {
    writeFileSync(join(tempDir, '.gitignore'), '.deck\n', 'utf-8');
    ensureDeckGitignore(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    const count = content.split('\n').filter((l: string) => l.trim() === '.deck').length;
    expect(count).toBe(1);
  });

  it('handles .gitignore without trailing newline', () => {
    writeFileSync(join(tempDir, '.gitignore'), 'node_modules', 'utf-8');
    ensureDeckGitignore(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('.deck');
    // Ensure .deck is on its own line
    const lines = content.split('\n').map((l: string) => l.trim());
    expect(lines).toContain('.deck');
  });
});

// ─── isDeckFileCommitted ────────────────────────────────────────────────────

describe('isDeckFileCommitted', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false when .deck is not tracked', () => {
    writeFileSync(join(tempDir, '.deck'), 'KEY=value\n', 'utf-8');
    expect(isDeckFileCommitted(tempDir)).toBe(false);
  });

  it('returns true when .deck is committed', () => {
    writeFileSync(join(tempDir, '.deck'), 'KEY=value\n', 'utf-8');
    execSync('git add .deck && git commit -m "add deck"', { cwd: tempDir, stdio: 'pipe' });
    expect(isDeckFileCommitted(tempDir)).toBe(true);
  });

  it('returns false in a repo without .deck file', () => {
    expect(isDeckFileCommitted(tempDir)).toBe(false);
  });
});

// ─── Constants export ───────────────────────────────────────────────────────

describe('constants', () => {
  it('DECK_FILE_NAME is .deck', () => {
    expect(DECK_FILE_NAME).toBe('.deck');
  });

  it('KNOWN_DECK_KEYS contains 9 keys', () => {
    expect(KNOWN_DECK_KEYS).toHaveLength(9);
  });
});
