import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncAdapterFiles, syncAdapterFilesWithReport } from '../../src/cli/commands/sync.js';

// Live repro (2026-07-14): `.cursor/rules` is a DIRECTORY of `.mdc` files in
// real-world Cursor projects (confirmed in this repo: .cursor/rules/*.mdc),
// not a single file. `ensureDeckentImport()` readFileSync's whatever path it
// is given, so passing that directory through crashed `deckent sync` with
// `EISDIR: illegal operation on a directory, read` on the non-dry-run path.
//
// Contract evolution: `syncCursorAdapter` now treats `.cursor/rules` as the
// directory it really is and syncs `.cursor/rules/deckent.mdc` inside it via
// `ensureCursorRules` (owner-authored rules untouched). The EISDIR condition
// is healed by design — the directory fixture syncs cleanly with NO typed
// error, instead of merely being skipped.

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

  it('heals the directory entry: syncs .cursor/rules/deckent.mdc with no typed error', () => {
    const report = syncAdapterFilesWithReport(root);
    expect(report.errors).toHaveLength(0);
    expect(report.synced).toContain('CLAUDE.md');
    expect(report.synced).toContain('AGENTS.md');
    expect(report.synced).toContain('GEMINI.md');
    expect(report.synced).toContain('.cursor/rules');
    // deckent.mdc is written INSIDE the directory, carrying the @DECKENT.md reference…
    const mdcPath = join(root, '.cursor', 'rules', 'deckent.mdc');
    expect(existsSync(mdcPath)).toBe(true);
    expect(readFileSync(mdcPath, 'utf-8')).toContain('@DECKENT.md');
    // …and owner-authored rules are left untouched.
    expect(readFileSync(join(root, '.cursor', 'rules', 'some-rule.mdc'), 'utf-8')).toBe('# rule\n');
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
