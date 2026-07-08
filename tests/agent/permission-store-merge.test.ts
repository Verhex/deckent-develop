// born-555: PERMISSION-STORE READ-MERGE-WRITE — settings.local.json must never
// be silently clobbered by a grant/revoke. Two scenarios:
//  1. Well-formed file: unrelated keys must survive a write.
//  2. Malformed (corrupted) file: the corrupted content must be backed up +
//     warned about, never silently discarded, before a fresh doc is written.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuleStore } from '../../src/agent/permission-store.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-store-merge-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const settingsPath = (d: string) => join(d, '.deckent', 'settings.local.json');
const settingsDir = (d: string) => join(d, '.deckent');

describe('permission-store read-merge-write', () => {
  it('preserves an unrelated top-level custom key across a grant', () => {
    const d = sandbox();
    writeFileSync(settingsPath(d), JSON.stringify({
      customKey: 'should-survive',
      permissions: { rules: [{ tool: 'bash', pattern: 'ls*' }] },
    }));
    const s = createRuleStore(d);
    s.grant({ tool: 'write_file', pattern: 'src/**' }, 'always');

    const doc = JSON.parse(readFileSync(settingsPath(d), 'utf-8'));
    expect(doc.customKey).toBe('should-survive');
    expect(doc.permissions.rules).toEqual(expect.arrayContaining([
      { tool: 'bash', pattern: 'ls*' },
      { tool: 'write_file', pattern: 'src/**' },
    ]));
  });

  it('preserves an unrelated permissions.* sub-key across a grant', () => {
    const d = sandbox();
    writeFileSync(settingsPath(d), JSON.stringify({
      permissions: { rules: [], someOtherPermKey: 'keep-me' },
    }));
    const s = createRuleStore(d);
    s.grant({ tool: 'bash', pattern: 'npm test*' }, 'always');

    const doc = JSON.parse(readFileSync(settingsPath(d), 'utf-8'));
    expect(doc.permissions.someOtherPermKey).toBe('keep-me');
    expect(doc.permissions.rules).toContainEqual({ tool: 'bash', pattern: 'npm test*' });
  });

  it('preserves unrelated keys across a revoke too', () => {
    const d = sandbox();
    writeFileSync(settingsPath(d), JSON.stringify({
      customKey: 'should-survive',
      permissions: { rules: [{ tool: 'bash', pattern: 'ls*' }] },
    }));
    const s = createRuleStore(d);
    s.revoke({ tool: 'bash', pattern: 'ls*' });

    const doc = JSON.parse(readFileSync(settingsPath(d), 'utf-8'));
    expect(doc.customKey).toBe('should-survive');
    expect(doc.permissions.rules).toEqual([]);
  });

  it('backs up a malformed settings.local.json instead of silently discarding it, and warns', () => {
    const d = sandbox();
    const corruptedRaw = '{ "customKey": "lost-if-silent", "permissions": { rules: [] '; // syntactically invalid
    writeFileSync(settingsPath(d), corruptedRaw);
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const s = createRuleStore(d);
    expect(() => s.grant({ tool: 'bash', pattern: 'npm test*' }, 'always')).not.toThrow();

    // A valid settings file now exists with the new grant.
    const doc = JSON.parse(readFileSync(settingsPath(d), 'utf-8'));
    expect(doc.permissions.rules).toContainEqual({ tool: 'bash', pattern: 'npm test*' });

    // The original corrupted bytes were preserved in a backup file, not lost.
    const backups = readdirSync(settingsDir(d)).filter((f) => f.includes('.corrupted-') && f.endsWith('.bak'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(settingsDir(d), backups[0]!), 'utf-8')).toBe(corruptedRaw);

    // The user was warned, not left in the dark.
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('not valid JSON'))).toBe(true);

    warnSpy.mockRestore();
  });

  it('malformed file grant still succeeds (best-effort) even if a backup somehow cannot be written', () => {
    const d = sandbox();
    writeFileSync(settingsPath(d), '{ not: valid json ');
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const s = createRuleStore(d);
    s.grant({ tool: 'bash', pattern: '*' }, 'always');

    expect(existsSync(settingsPath(d))).toBe(true);
    const doc = JSON.parse(readFileSync(settingsPath(d), 'utf-8'));
    expect(doc.permissions.rules).toContainEqual({ tool: 'bash', pattern: '*' });

    warnSpy.mockRestore();
  });
});
