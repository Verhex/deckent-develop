import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuleStore } from '../../src/agent/permission-store.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-store-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const settingsPath = (d: string) => join(d, '.deckent', 'settings.local.json');

describe('createRuleStore', () => {
  it('grant "once" does not persist and is not remembered', () => {
    const d = sandbox();
    const s = createRuleStore(d);
    s.grant({ tool: 'write_file', pattern: 'src/**' }, 'once');
    expect(s.activeRules()).toHaveLength(0);
    expect(existsSync(settingsPath(d))).toBe(false);
  });
  it('grant "session" remembers in memory but does not persist', () => {
    const d = sandbox();
    const s = createRuleStore(d);
    s.grant({ tool: 'write_file', pattern: 'src/**' }, 'session');
    expect(s.activeRules()).toEqual([{ tool: 'write_file', pattern: 'src/**' }]);
    expect(existsSync(settingsPath(d))).toBe(false);
  });
  it('grant "always" persists to settings.local.json AND is active', () => {
    const d = sandbox();
    const s = createRuleStore(d);
    s.grant({ tool: 'bash', pattern: 'npm test*' }, 'always');
    expect(s.activeRules()).toContainEqual({ tool: 'bash', pattern: 'npm test*' });
    const doc = JSON.parse(readFileSync(settingsPath(d), 'utf-8'));
    expect(doc.permissions.rules).toContainEqual({ tool: 'bash', pattern: 'npm test*' });
  });
  it('migrates legacy permissions.allow[toolName] → rule tool(**) on load', () => {
    const d = sandbox();
    writeFileSync(settingsPath(d), JSON.stringify({ permissions: { allow: ['deckent_write_file'] } }));
    const s = createRuleStore(d);
    expect(s.activeRules()).toContainEqual({ tool: 'deckent_write_file', pattern: '**' });
  });
  it('revoke removes a session rule', () => {
    const d = sandbox();
    const s = createRuleStore(d);
    s.grant({ tool: 'write_file', pattern: 'src/**' }, 'session');
    s.revoke({ tool: 'write_file', pattern: 'src/**' });
    expect(s.activeRules()).toHaveLength(0);
  });
  it('revoke of an "always" rule updates the persisted file', () => {
    const d = sandbox();
    const s = createRuleStore(d);
    s.grant({ tool: 'bash', pattern: 'npm test*' }, 'always');
    s.revoke({ tool: 'bash', pattern: 'npm test*' });
    expect(s.activeRules()).toHaveLength(0);
    const doc = JSON.parse(readFileSync(settingsPath(d), 'utf-8'));
    expect(doc.permissions.rules).toHaveLength(0);
  });
  it('persist preserves unrelated top-level keys and drops the legacy allow key', () => {
    const d = sandbox();
    writeFileSync(settingsPath(d), JSON.stringify({ otherKey: 1, permissions: { allow: ['deckent_write_file'] } }));
    const s = createRuleStore(d);
    s.grant({ tool: 'write_file', pattern: 'src/**' }, 'always');
    const doc = JSON.parse(readFileSync(settingsPath(d), 'utf-8'));
    expect(doc.otherKey).toBe(1);
    expect(doc.permissions.allow).toBeUndefined();
    expect(doc.permissions.rules).toEqual(expect.arrayContaining([{ tool: 'write_file', pattern: 'src/**' }]));
  });
});
