import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncAdapterFiles, syncAdapterFilesWithReport } from '../../src/cli/commands/sync.js';

// Live repro (2026-07-14): `.cursor/rules` is a DIRECTORY of `.mdc` files in
// real-world Cursor projects (confirmed in this repo: .cursor/rules/*.mdc),
// not a single file. `ensureDeckentImport()` readFileSync's whatever path it
// is given, so passing that directory through crashes `deckent sync` with
// `EISDIR: illegal operation on a directory, read` on the non-dry-run path.

describe('sync: EISDIR regression (directory where a file is expected)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-sync-eisdir-'));
    writeFileSync(join(root, 'DECKENT.md'), '# deckent\n');
    mkdirSync(join(root, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(root, '.cursor', 'rules', 'some-rule.mdc'), '# rule\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does not throw when .cursor/rules is a directory (live repro)', () => {
    expect(() => syncAdapterFiles(root)).not.toThrow();
  });

  it('still syncs the other adapter files when one entry is a directory', () => {
    syncAdapterFiles(root);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf-8')).toContain('@DECKENT.md');
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf-8')).toContain('@DECKENT.md');
    expect(readFileSync(join(root, 'GEMINI.md'), 'utf-8')).toContain('@DECKENT.md');
  });

  it('collects a typed error for the directory entry instead of throwing', () => {
    const report = syncAdapterFilesWithReport(root);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.label).toBe('.cursor/rules');
    expect(report.errors[0]?.file).toContain('rules');
    expect(report.errors[0]?.reason).toBeTruthy();
    expect(report.synced).toContain('CLAUDE.md');
    expect(report.synced).toContain('AGENTS.md');
    expect(report.synced).toContain('GEMINI.md');
    expect(report.synced).not.toContain('.cursor/rules');
  });

  it('does not write anything and does not throw in dry-run mode, even with the directory collision', () => {
    expect(() => syncAdapterFiles(root, true)).not.toThrow();
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(root, 'GEMINI.md'))).toBe(false);
    expect(existsSync(join(root, '.cursor', 'rules', 'some-rule.mdc'))).toBe(true);
  });
});

describe('sync: dry-run output unchanged for a clean fixture', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-sync-clean-'));
    writeFileSync(join(root, 'DECKENT.md'), '# deckent\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports the same labels as before, with no filesystem writes', () => {
    const synced = syncAdapterFiles(root, true);
    expect(synced).toEqual(['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursor/rules']);
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(root, 'GEMINI.md'))).toBe(false);
    expect(existsSync(join(root, '.cursor'))).toBe(false);
  });

  it('report form matches the plain form for a clean fixture', () => {
    const report = syncAdapterFilesWithReport(root, true);
    expect(report.errors).toHaveLength(0);
    expect(report.synced).toEqual(syncAdapterFiles(root, true));
  });
});
