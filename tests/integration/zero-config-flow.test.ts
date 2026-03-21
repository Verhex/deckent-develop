import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  buildZeroConfigDirectives,
  prepareZeroConfig,
  cleanupZeroConfig,
  readDirectivesContent,
} from '../../src/cli/commands/quick-start.js';
import {
  isCleanWorkingTree,
  createSafetyPoint,
  rollback,
  getRollbackPolicy,
  deleteSafetyPoint,
  recordRollbackInDebt,
  getCurrentCommitSha,
  getCurrentBranch,
  getDirtyFiles,
  safetyBranchExists,
  type SafetyPoint,
  type RollbackResult,
} from '../../src/orchestra/rollback.js';
import { DIRECTIVES_FILE } from '../../src/core/constants.js';

// ─── Temp directory helpers ─────────────────────────────────────────

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-zeroconfig-'));
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ─── buildZeroConfigDirectives ──────────────────────────────────────

describe('buildZeroConfigDirectives', () => {
  it('creates valid DIRECTIVES format with header', () => {
    const content = buildZeroConfigDirectives('Add login page');
    expect(content).toContain('# DIRECTIVES');
    expect(content).toContain('Zero-Config');
  });

  it('includes the description as Task 1 title', () => {
    const content = buildZeroConfigDirectives('Add login page with Google OAuth');
    expect(content).toContain('## Task 1: Add login page with Google OAuth');
  });

  it('includes description in the Description section', () => {
    const desc = 'Implement REST API for user management';
    const content = buildZeroConfigDirectives(desc);
    expect(content).toContain('### Description');
    expect(content).toContain(desc);
  });

  it('includes Tests section', () => {
    const content = buildZeroConfigDirectives('Some feature');
    expect(content).toContain('### Tests');
    expect(content).toContain('Implement the feature');
    expect(content).toContain('Add tests');
  });

  it('handles complex description with special characters', () => {
    const desc = 'Fix all TypeScript errors & refactor "utils" module (priority: HIGH)';
    const content = buildZeroConfigDirectives(desc);
    expect(content).toContain(desc);
  });
});

// ─── prepareZeroConfig ──────────────────────────────────────────────

describe('prepareZeroConfig', () => {
  it('writes temporary DIRECTIVES.md when none exists', () => {
    const result = prepareZeroConfig(tmpRoot, 'Add login page');
    expect(result.createdTemp).toBe(true);
    expect(result.alreadyExisted).toBe(false);
    expect(existsSync(result.directivesPath)).toBe(true);
  });

  it('created file has correct content', () => {
    prepareZeroConfig(tmpRoot, 'Build dashboard');
    const content = readFileSync(join(tmpRoot, DIRECTIVES_FILE), 'utf-8');
    expect(content).toContain('## Task 1: Build dashboard');
    expect(content).toContain('# DIRECTIVES');
  });

  it('warns (returns alreadyExisted=true) if DIRECTIVES.md already exists', () => {
    const directivesPath = join(tmpRoot, DIRECTIVES_FILE);
    writeFileSync(directivesPath, '# Existing directives\n', 'utf-8');

    const result = prepareZeroConfig(tmpRoot, 'New feature');
    expect(result.createdTemp).toBe(false);
    expect(result.alreadyExisted).toBe(true);
    // Original content preserved
    const content = readFileSync(directivesPath, 'utf-8');
    expect(content).toBe('# Existing directives\n');
  });

  it('directivesPath points to correct file', () => {
    const result = prepareZeroConfig(tmpRoot, 'Test');
    expect(result.directivesPath).toBe(join(tmpRoot, DIRECTIVES_FILE));
  });
});

// ─── cleanupZeroConfig ──────────────────────────────────────────────

describe('cleanupZeroConfig', () => {
  it('removes temporary DIRECTIVES.md after sprint', () => {
    const result = prepareZeroConfig(tmpRoot, 'Temp task');
    expect(existsSync(result.directivesPath)).toBe(true);

    cleanupZeroConfig(result);
    expect(existsSync(result.directivesPath)).toBe(false);
  });

  it('does nothing if createdTemp is false', () => {
    const directivesPath = join(tmpRoot, DIRECTIVES_FILE);
    writeFileSync(directivesPath, '# Keep me\n', 'utf-8');

    const result = prepareZeroConfig(tmpRoot, 'Ignored');
    // alreadyExisted = true, createdTemp = false
    cleanupZeroConfig(result);
    expect(existsSync(directivesPath)).toBe(true);
    expect(readFileSync(directivesPath, 'utf-8')).toBe('# Keep me\n');
  });

  it('does not throw if file already deleted', () => {
    const result = prepareZeroConfig(tmpRoot, 'Temp');
    // Manually delete first
    rmSync(result.directivesPath, { force: true });
    expect(() => cleanupZeroConfig(result)).not.toThrow();
  });
});

// ─── readDirectivesContent ──────────────────────────────────────────

describe('readDirectivesContent', () => {
  it('returns null when DIRECTIVES.md does not exist', () => {
    expect(readDirectivesContent(tmpRoot)).toBeNull();
  });

  it('returns content when DIRECTIVES.md exists', () => {
    writeFileSync(join(tmpRoot, DIRECTIVES_FILE), '# My directives', 'utf-8');
    expect(readDirectivesContent(tmpRoot)).toBe('# My directives');
  });
});

// ─── Rollback: getRollbackPolicy ────────────────────────────────────

describe('getRollbackPolicy', () => {
  it('returns "auto" when all evaluations are NO_GO', () => {
    expect(getRollbackPolicy(['NO_GO', 'NO_GO', 'NO_GO'])).toBe('auto');
  });

  it('returns "ask" when some evaluations are NO_GO', () => {
    expect(getRollbackPolicy(['DONE', 'NO_GO', 'GO_WITH_TECH_DEBT'])).toBe('ask');
  });

  it('returns "never" when all evaluations are DONE', () => {
    expect(getRollbackPolicy(['DONE', 'DONE', 'DONE'])).toBe('never');
  });

  it('returns "never" for empty evaluations', () => {
    expect(getRollbackPolicy([])).toBe('never');
  });

  it('returns "never" when all are GO_WITH_TECH_DEBT (no NO_GO)', () => {
    expect(getRollbackPolicy(['GO_WITH_TECH_DEBT', 'GO_WITH_TECH_DEBT'])).toBe('never');
  });

  it('returns "ask" for mixed DONE and NO_GO', () => {
    expect(getRollbackPolicy(['DONE', 'NO_GO'])).toBe('ask');
  });

  it('returns "auto" for single NO_GO evaluation', () => {
    expect(getRollbackPolicy(['NO_GO'])).toBe('auto');
  });
});

// ─── Rollback: isCleanWorkingTree (mock git) ────────────────────────

describe('isCleanWorkingTree', () => {
  it('returns false for non-git directory', () => {
    // tmpRoot is not a git repo, so git status will fail
    expect(isCleanWorkingTree(tmpRoot)).toBe(false);
  });
});

// ─── Rollback: getCurrentCommitSha ──────────────────────────────────

describe('getCurrentCommitSha', () => {
  it('returns empty string for non-git directory', () => {
    expect(getCurrentCommitSha(tmpRoot)).toBe('');
  });
});

// ─── Rollback: getCurrentBranch ─────────────────────────────────────

describe('getCurrentBranch', () => {
  it('returns "HEAD" for non-git directory', () => {
    expect(getCurrentBranch(tmpRoot)).toBe('HEAD');
  });
});

// ─── Rollback: getDirtyFiles ────────────────────────────────────────

describe('getDirtyFiles', () => {
  it('returns empty array for non-git directory', () => {
    expect(getDirtyFiles(tmpRoot)).toEqual([]);
  });
});

// ─── Rollback: safetyBranchExists ───────────────────────────────────

describe('safetyBranchExists', () => {
  it('returns false for non-git directory', () => {
    expect(safetyBranchExists(tmpRoot, 'sprint-999')).toBe(false);
  });
});

// ─── Rollback: recordRollbackInDebt ─────────────────────────────────

describe('recordRollbackInDebt', () => {
  it('creates DEBT.md with header and entry when file does not exist', () => {
    const result: RollbackResult = { success: true, message: 'Rolled back to safety' };
    recordRollbackInDebt(tmpRoot, 'sprint-042', result);

    const debtPath = join(tmpRoot, '.brain', 'DEBT.md');
    expect(existsSync(debtPath)).toBe(true);
    const content = readFileSync(debtPath, 'utf-8');
    expect(content).toContain('rollback-sprint-042');
    expect(content).toContain('SUCCESS');
  });

  it('appends to existing DEBT.md', () => {
    const brainDir = join(tmpRoot, '.brain');
    mkdirSync(brainDir, { recursive: true });
    const debtPath = join(brainDir, 'DEBT.md');
    writeFileSync(debtPath, '| existing | row |\n', 'utf-8');

    const result: RollbackResult = { success: false, message: 'Branch missing' };
    recordRollbackInDebt(tmpRoot, 'sprint-043', result);

    const content = readFileSync(debtPath, 'utf-8');
    expect(content).toContain('existing');
    expect(content).toContain('rollback-sprint-043');
    expect(content).toContain('FAILED');
  });
});

// ─── Full flow: prepare → safety check → (fail) → rollback policy → cleanup

describe('Full zero-config → rollback flow', () => {
  it('prepare → safety check → rollback policy → cleanup', () => {
    // Step 1: Prepare zero-config
    const zcResult = prepareZeroConfig(tmpRoot, 'Fix all TypeScript errors');
    expect(zcResult.createdTemp).toBe(true);
    expect(existsSync(zcResult.directivesPath)).toBe(true);

    // Verify content
    const content = readFileSync(zcResult.directivesPath, 'utf-8');
    expect(content).toContain('Fix all TypeScript errors');

    // Step 2: Determine rollback policy (simulate all NO_GO)
    const policy = getRollbackPolicy(['NO_GO', 'NO_GO', 'NO_GO']);
    expect(policy).toBe('auto');

    // Step 3: Record in debt
    recordRollbackInDebt(tmpRoot, 'sprint-050', {
      success: true,
      message: 'Rolled back successfully',
    });
    const debtPath = join(tmpRoot, '.brain', 'DEBT.md');
    expect(existsSync(debtPath)).toBe(true);

    // Step 4: Cleanup
    cleanupZeroConfig(zcResult);
    expect(existsSync(zcResult.directivesPath)).toBe(false);
  });

  it('zero-config with simple description works end-to-end', () => {
    const result = prepareZeroConfig(tmpRoot, 'Add tests');
    expect(result.createdTemp).toBe(true);
    const content = readFileSync(result.directivesPath, 'utf-8');
    expect(content).toContain('Task 1: Add tests');
    cleanupZeroConfig(result);
    expect(existsSync(result.directivesPath)).toBe(false);
  });

  it('zero-config with complex description works end-to-end', () => {
    const desc = 'Refactor the entire auth module: split into providers, add MFA support, write 50+ integration tests, update API docs';
    const result = prepareZeroConfig(tmpRoot, desc);
    expect(result.createdTemp).toBe(true);
    const content = readFileSync(result.directivesPath, 'utf-8');
    expect(content).toContain(desc);
    cleanupZeroConfig(result);
  });

  it('error handling: cleanup works even after partial failure', () => {
    const result = prepareZeroConfig(tmpRoot, 'Feature X');
    expect(result.createdTemp).toBe(true);

    // Simulate partial error — file still exists
    // Cleanup should not throw
    expect(() => cleanupZeroConfig(result)).not.toThrow();
    expect(existsSync(result.directivesPath)).toBe(false);
  });
});
