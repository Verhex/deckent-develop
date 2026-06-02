import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPermissionStore,
  loadPermissions,
  settingsLocalPath,
} from '../../src/cli/commands/chat-permissions.js';

// Sprint 224 T-224-016 — REPL tool permission memory (.deckent/settings.local.json).
// Hermetic: per-test tmpdir cwd.

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-perm-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('chat-permissions (T-224-016)', () => {
  it('isAllowed is false before any approval', () => {
    expect(createPermissionStore(dir).isAllowed('deckent_write_file')).toBe(false);
  });

  it('allow() persists to .deckent/settings.local.json under permissions.allow', () => {
    const store = createPermissionStore(dir);
    store.allow('deckent_write_file');
    expect(store.isAllowed('deckent_write_file')).toBe(true);
    const p = settingsLocalPath(dir);
    expect(existsSync(p)).toBe(true);
    const doc = JSON.parse(readFileSync(p, 'utf-8'));
    expect(doc.permissions.allow).toContain('deckent_write_file');
  });

  it('a fresh store loads previously persisted approvals', () => {
    createPermissionStore(dir).allow('deckent_bash');
    expect(createPermissionStore(dir).isAllowed('deckent_bash')).toBe(true);
  });

  it('preserves other fields in settings.local.json (merge, not overwrite)', () => {
    mkdirSync(join(dir, '.deckent'), { recursive: true });
    writeFileSync(settingsLocalPath(dir), JSON.stringify({ theme: 'dark' }), 'utf-8');
    createPermissionStore(dir).allow('deckent_edit_file');
    const doc = JSON.parse(readFileSync(settingsLocalPath(dir), 'utf-8'));
    expect(doc.theme).toBe('dark');
    expect(doc.permissions.allow).toContain('deckent_edit_file');
  });

  it('malformed file → empty allow-set (fail-safe)', () => {
    mkdirSync(join(dir, '.deckent'), { recursive: true });
    writeFileSync(settingsLocalPath(dir), 'not json', 'utf-8');
    expect(loadPermissions(dir).size).toBe(0);
  });
});
