// tests/cli/autonomous-backlog.test.ts
// Unit tests for autonomous backlog CLI helpers (Task 7).
// Hermetic: uses tmpdir, no spawnSync, no gitignored state.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  backlogAdd,
  backlogList,
  backlogRemove,
} from '../../src/cli/commands/autonomous.js';

describe('autonomous backlog CLI helpers', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cli-bl-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('add writes an entry, list returns it', () => {
    backlogAdd({
      root, id: 'x', title: 'demo', kind: 'task',
      description: 'do x', policy: 'auto', lang: 'en',
    });
    const entries = backlogList({ root });
    expect(entries.find((e) => e.id === 'x')).toBeDefined();
    expect(existsSync(join(root, '.deckent/autonomous/backlog.json'))).toBe(true);
  });

  it('added entry has expected fields', () => {
    backlogAdd({
      root, id: 'y', title: 'do y', kind: 'sprint',
      description: 'sprint desc', policy: 'approval-required', lang: 'en',
    });
    const entries = backlogList({ root });
    const e = entries.find((x) => x.id === 'y');
    expect(e).toBeDefined();
    expect(e!.kind).toBe('sprint');
    expect(e!.policy).toBe('approval-required');
    expect(e!.status).toBe('pending');
    expect(e!.trigger.type).toBe('one-off');
    expect(e!.spec.description).toBe('sprint desc');
  });

  it('duplicate id throws a getMessage-based error', () => {
    backlogAdd({ root, id: 'x', title: 'd', kind: 'task', description: 'x', policy: 'auto', lang: 'en' });
    expect(() =>
      backlogAdd({ root, id: 'x', title: 'd', kind: 'task', description: 'x', policy: 'auto', lang: 'en' }),
    ).toThrow(/already exists|zaten var/);
  });

  it('remove deletes the entry', () => {
    backlogAdd({ root, id: 'x', title: 'd', kind: 'task', description: 'x', policy: 'auto', lang: 'en' });
    backlogRemove({ root, id: 'x', lang: 'en' });
    expect(backlogList({ root })).toHaveLength(0);
  });

  it('removing a missing id throws a getMessage-based error', () => {
    expect(() => backlogRemove({ root, id: 'ghost', lang: 'en' })).toThrow(/not found|bulunamadı/);
  });

  it('list returns empty array when no backlog file exists', () => {
    expect(backlogList({ root })).toHaveLength(0);
  });

  it('multiple adds accumulate entries', () => {
    backlogAdd({ root, id: 'a', title: 'A', kind: 'task', description: '', policy: 'auto', lang: 'en' });
    backlogAdd({ root, id: 'b', title: 'B', kind: 'task', description: '', policy: 'auto', lang: 'en' });
    expect(backlogList({ root })).toHaveLength(2);
  });

  it('remove leaves other entries intact', () => {
    backlogAdd({ root, id: 'a', title: 'A', kind: 'task', description: '', policy: 'auto', lang: 'en' });
    backlogAdd({ root, id: 'b', title: 'B', kind: 'task', description: '', policy: 'auto', lang: 'en' });
    backlogRemove({ root, id: 'a', lang: 'en' });
    const remaining = backlogList({ root });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('b');
  });

  it('turkish error messages work (lang=tr)', () => {
    expect(() => backlogRemove({ root, id: 'ghost', lang: 'tr' })).toThrow(/bulunamadı/);
  });

  // ── recurring entries (--cron) ──────────────────────────────────────────

  it('add with cron creates a recurring entry', () => {
    backlogAdd({
      root, id: 'r', title: 'nightly scan', kind: 'task',
      description: 'scan debt', policy: 'auto', lang: 'en', cron: '0 3 * * *',
    });
    const e = backlogList({ root }).find((x) => x.id === 'r');
    expect(e).toBeDefined();
    expect(e!.trigger).toEqual({ type: 'recurring', cron: '0 3 * * *' });
    expect(e!.status).toBe('pending');
  });

  it('add without cron keeps the one-off trigger (backward-safe)', () => {
    backlogAdd({ root, id: 'o', title: 'once', kind: 'task', description: '', policy: 'auto', lang: 'en' });
    expect(backlogList({ root })[0]!.trigger).toEqual({ type: 'one-off' });
  });

  it('add with a malformed cron throws a getMessage-based error (en + tr)', () => {
    expect(() =>
      backlogAdd({ root, id: 'r1', title: 'n', kind: 'task', description: '', policy: 'auto', lang: 'en', cron: 'NOT_A_CRON' }),
    ).toThrow(/cron/i);
    expect(() =>
      backlogAdd({ root, id: 'r2', title: 'n', kind: 'task', description: '', policy: 'auto', lang: 'tr', cron: 'NOT_A_CRON' }),
    ).toThrow(/cron/i);
    expect(backlogList({ root })).toHaveLength(0); // nothing persisted
  });
});
