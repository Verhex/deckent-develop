import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

// ─── Module under test ─────────────────────────────────────────────
import {
  buildZeroConfigDirectives,
  prepareZeroConfig,
  cleanupZeroConfig,
  readDirectivesContent,
} from '../../src/cli/commands/quick-start.js';

// ─── Helpers ───────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-qstart-'));
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('buildZeroConfigDirectives', () => {
  it('returns a string with the description in a Task 1 heading', () => {
    const content = buildZeroConfigDirectives('Add login page with Google OAuth');
    expect(content).toContain('## Task 1: Add login page with Google OAuth');
  });

  it('includes the description in the body', () => {
    const description = 'Fix all TypeScript errors';
    const content = buildZeroConfigDirectives(description);
    expect(content).toContain(description);
  });

  it('starts with a top-level DIRECTIVES heading', () => {
    const content = buildZeroConfigDirectives('Some task');
    expect(content).toMatch(/^# DIRECTIVES/);
  });

  it('includes a Tests section', () => {
    const content = buildZeroConfigDirectives('Some task');
    expect(content).toContain('### Tests');
  });

  it('handles description with special characters', () => {
    const description = 'Fix bug: user can\'t login with "special" chars & symbols';
    const content = buildZeroConfigDirectives(description);
    expect(content).toContain(description);
  });

  it('produces non-empty output for any description', () => {
    const content = buildZeroConfigDirectives('x');
    expect(content.length).toBeGreaterThan(0);
  });
});

describe('prepareZeroConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates DIRECTIVES.md when it does not exist', () => {
    const result = prepareZeroConfig(tempDir, 'Add login page');
    const path = join(tempDir, 'DIRECTIVES.md');
    expect(existsSync(path)).toBe(true);
    expect(result.createdTemp).toBe(true);
    expect(result.alreadyExisted).toBe(false);
  });

  it('returns the correct directivesPath', () => {
    const result = prepareZeroConfig(tempDir, 'Add login page');
    expect(result.directivesPath).toBe(join(tempDir, 'DIRECTIVES.md'));
  });

  it('writes the description into the temporary DIRECTIVES.md', () => {
    const description = 'Add login page with Google OAuth';
    prepareZeroConfig(tempDir, description);
    const content = readFileSync(join(tempDir, 'DIRECTIVES.md'), 'utf-8');
    expect(content).toContain(description);
  });

  it('writes valid DIRECTIVES format to the file', () => {
    prepareZeroConfig(tempDir, 'Build dashboard UI');
    const content = readFileSync(join(tempDir, 'DIRECTIVES.md'), 'utf-8');
    expect(content).toContain('## Task 1:');
    expect(content).toContain('### Description');
  });

  it('does NOT create a file when DIRECTIVES.md already exists', () => {
    const path = join(tempDir, 'DIRECTIVES.md');
    const originalContent = '# Original DIRECTIVES\n\n## Task 1: Existing task\n';
    writeFileSync(path, originalContent, 'utf-8');

    const result = prepareZeroConfig(tempDir, 'New task');
    expect(result.createdTemp).toBe(false);
    expect(result.alreadyExisted).toBe(true);
  });

  it('returns alreadyExisted=true when file exists', () => {
    writeFileSync(join(tempDir, 'DIRECTIVES.md'), '# existing', 'utf-8');
    const result = prepareZeroConfig(tempDir, 'New task');
    expect(result.alreadyExisted).toBe(true);
  });

  it('preserves existing DIRECTIVES.md content when already exists', () => {
    const path = join(tempDir, 'DIRECTIVES.md');
    const originalContent = '# Original DIRECTIVES\n\n## Task 1: Existing task\n';
    writeFileSync(path, originalContent, 'utf-8');

    prepareZeroConfig(tempDir, 'New task');
    const afterContent = readFileSync(path, 'utf-8');
    expect(afterContent).toBe(originalContent);
  });

  it('handles descriptions with leading/trailing spaces', () => {
    const description = '  Add login page  ';
    prepareZeroConfig(tempDir, description);
    const content = readFileSync(join(tempDir, 'DIRECTIVES.md'), 'utf-8');
    expect(content).toContain(description.trim() === '' ? description : description);
  });

  it('creates the file with UTF-8 encoding', () => {
    const description = 'Türkçe karakter testi — sümbül';
    prepareZeroConfig(tempDir, description);
    const content = readFileSync(join(tempDir, 'DIRECTIVES.md'), 'utf-8');
    expect(content).toContain(description);
  });
});

describe('cleanupZeroConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes DIRECTIVES.md when createdTemp is true', () => {
    const result = prepareZeroConfig(tempDir, 'Some task');
    expect(result.createdTemp).toBe(true);

    cleanupZeroConfig(result);
    expect(existsSync(join(tempDir, 'DIRECTIVES.md'))).toBe(false);
  });

  it('does not remove DIRECTIVES.md when createdTemp is false', () => {
    const path = join(tempDir, 'DIRECTIVES.md');
    writeFileSync(path, '# Original\n', 'utf-8');

    const result = prepareZeroConfig(tempDir, 'Some task');
    expect(result.createdTemp).toBe(false);

    cleanupZeroConfig(result);
    expect(existsSync(path)).toBe(true);
  });

  it('does not throw when file was already deleted', () => {
    const result = prepareZeroConfig(tempDir, 'Some task');
    unlinkSync(result.directivesPath); // delete manually first
    expect(() => cleanupZeroConfig(result)).not.toThrow();
  });

  it('is a no-op when alreadyExisted is true', () => {
    const path = join(tempDir, 'DIRECTIVES.md');
    const original = '# Original\n';
    writeFileSync(path, original, 'utf-8');

    const result = { createdTemp: false, alreadyExisted: true, directivesPath: path };
    cleanupZeroConfig(result);

    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf-8')).toBe(original);
  });
});

describe('readDirectivesContent', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns the file content when DIRECTIVES.md exists', () => {
    const content = '# DIRECTIVES\n\n## Task 1: Test task\n';
    writeFileSync(join(tempDir, 'DIRECTIVES.md'), content, 'utf-8');

    const result = readDirectivesContent(tempDir);
    expect(result).toBe(content);
  });

  it('returns null when DIRECTIVES.md does not exist', () => {
    const result = readDirectivesContent(tempDir);
    expect(result).toBeNull();
  });

  it('returns empty string for an empty file', () => {
    writeFileSync(join(tempDir, 'DIRECTIVES.md'), '', 'utf-8');
    const result = readDirectivesContent(tempDir);
    expect(result).toBe('');
  });
});

describe('zero-config end-to-end flow', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates, populates, and cleans up DIRECTIVES.md in full flow', () => {
    const description = 'Add login page with Google OAuth';

    // Step 1: Prepare
    const result = prepareZeroConfig(tempDir, description);
    expect(result.createdTemp).toBe(true);
    expect(existsSync(result.directivesPath)).toBe(true);

    // Step 2: Verify content
    const content = readFileSync(result.directivesPath, 'utf-8');
    expect(content).toContain('## Task 1: ' + description);

    // Step 3: Cleanup
    cleanupZeroConfig(result);
    expect(existsSync(result.directivesPath)).toBe(false);
  });

  it('handles concurrent prepare calls (second call sees existing file)', () => {
    const result1 = prepareZeroConfig(tempDir, 'First task');
    expect(result1.createdTemp).toBe(true);

    // Second call while file exists
    const result2 = prepareZeroConfig(tempDir, 'Second task');
    expect(result2.createdTemp).toBe(false);
    expect(result2.alreadyExisted).toBe(true);

    // Content from first call should be preserved
    const content = readFileSync(result1.directivesPath, 'utf-8');
    expect(content).toContain('First task');
    expect(content).not.toContain('Second task');

    // Cleanup only removes if we created it
    cleanupZeroConfig(result2); // no-op
    expect(existsSync(result1.directivesPath)).toBe(true);

    cleanupZeroConfig(result1); // removes it
    expect(existsSync(result1.directivesPath)).toBe(false);
  });
});
