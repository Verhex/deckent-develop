// Task 356-006 — DOCTOR-FIX: `deckent doctor --fix` closed-whitelist safe repairs.
//
// Verifies planDoctorFixes()/applyDoctorFixes()/formatDoctorFixLines() — the pure
// logic behind `doctor --fix` (dry-run) and `doctor --fix --yes` (apply). No CLI
// process is spawned; these are the exported building blocks the `--fix`/`--yes`
// branch in registerDoctor() calls directly.
//
// Hermetic per the CUSTOM Test Hermeticity rule: every fixture lives under a
// fresh os.tmpdir() directory created in beforeEach and removed in afterEach —
// no reads of gitignored project state, no mocked fs (these functions do real,
// scoped fs I/O against the tmpdir root, which is exactly what they're built to do).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  planDoctorFixes,
  applyDoctorFixes,
  formatDoctorFixLines,
  DOCTOR_FIX_ACTION_KINDS,
} from '../../src/cli/commands/doctor.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-doctor-fix-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('DOCTOR_FIX_ACTION_KINDS — closed whitelist', () => {
  it('is exactly mkdir/chmod/config-migrate/config-recreate/unlock — no docker/login, no delete of live data', () => {
    expect([...DOCTOR_FIX_ACTION_KINDS].sort()).toEqual(
      ['chmod', 'config-migrate', 'config-recreate', 'mkdir', 'unlock'],
    );
  });
});

describe('planDoctorFixes — dry-run detection (no mutation)', () => {
  it('returns an empty list on a fully clean fixture', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const actions = planDoctorFixes(root);
    expect(actions).toEqual([]);
  });

  it('proposes mkdir for a missing .deckent/ directory, without creating it', () => {
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const actions = planDoctorFixes(root);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: 'mkdir', target: join(root, '.deckent') });
    expect(existsSync(join(root, '.deckent'))).toBe(false);
    // reversible-report: every action carries a "before" value (Task 367-006)
    expect(actions[0]?.previousValue).toBeTruthy();
  });

  it('proposes mkdir for a missing .tasks/ directory, without creating it', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const actions = planDoctorFixes(root);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: 'mkdir', target: join(root, '.tasks') });
    expect(existsSync(join(root, '.tasks'))).toBe(false);
  });

  it('proposes mkdir for BOTH missing dirs when neither exists', () => {
    const actions = planDoctorFixes(root);
    const kinds = actions.map(a => a.kind);
    expect(kinds).toEqual(['mkdir', 'mkdir']);
    expect(actions.map(a => a.target).sort()).toEqual(
      [join(root, '.deckent'), join(root, '.tasks')].sort(),
    );
  });

  it('proposes chmod for a stale-mode .deck-shadow, without touching its mode', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const shadowPath = join(root, '.tasks', '.deck-shadow');
    writeFileSync(shadowPath, '', { mode: 0o644 });

    const actions = planDoctorFixes(root);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: 'chmod', target: shadowPath });
    // dry-run — mode must be unchanged
    expect(statSync(shadowPath).mode & 0o777).toBe(0o644);
    // reversible-report: the prior octal mode is captured
    expect(actions[0]?.previousValue).toContain('644');
  });

  it('does NOT propose a chmod when .deck-shadow is already 0o600', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.tasks', '.deck-shadow'), '', { mode: 0o600 });

    const actions = planDoctorFixes(root);
    expect(actions).toEqual([]);
  });

  it('proposes config-migrate when config.json is missing default fields, without writing to it', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const configPath = join(root, '.deckent', 'config.json');
    // A deliberately minimal config — createDefaultConfig() has many more fields.
    writeFileSync(configPath, JSON.stringify({ mode: 'balanced' }, null, 2));
    const before = statSync(configPath).mtimeMs;

    const actions = planDoctorFixes(root);
    const configAction = actions.find(a => a.kind === 'config-migrate');
    expect(configAction).toBeDefined();
    expect(configAction?.target).toBe(configPath);
    expect(configAction?.description).toContain('missing config default');
    // reversible-report: prior key count captured (Task 367-006)
    expect(configAction?.previousValue).toContain('1 top-level key');
    // dry-run — file must be untouched (no backup written, no mtime change)
    expect(statSync(configPath).mtimeMs).toBe(before);
    expect(existsSync(`${configPath}.bak`)).toBe(false);
  });

  it('does NOT propose config-migrate when config.json does not exist', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const actions = planDoctorFixes(root);
    expect(actions.find(a => a.kind === 'config-migrate')).toBeUndefined();
  });

  it('proposes config-recreate (backup + rewrite) when config.json is corrupt JSON, without touching it', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const configPath = join(root, '.deckent', 'config.json');
    const corrupt = '{ "mode": "balanced", oops this is not valid json';
    writeFileSync(configPath, corrupt);
    const before = statSync(configPath).mtimeMs;

    const actions = planDoctorFixes(root);
    // Corrupt JSON is mutually exclusive with config-migrate (which requires a parse to succeed).
    expect(actions.find(a => a.kind === 'config-migrate')).toBeUndefined();
    const recreateAction = actions.find(a => a.kind === 'config-recreate');
    expect(recreateAction).toBeDefined();
    expect(recreateAction?.target).toBe(configPath);
    expect(recreateAction?.description).toContain('corrupted');
    expect(recreateAction?.previousValue).toContain(corrupt);
    // dry-run — file must be untouched (no backup written, no mtime change)
    expect(statSync(configPath).mtimeMs).toBe(before);
    expect(readFileSync(configPath, 'utf-8')).toBe(corrupt);
  });

  it('does NOT propose config-recreate when config.json is valid JSON', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ mode: 'balanced' }));
    const actions = planDoctorFixes(root);
    expect(actions.find(a => a.kind === 'config-recreate')).toBeUndefined();
  });

  it('proposes unlock for a stale lock file, without deleting it', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const locksPath = join(root, '.locks');
    mkdirSync(locksPath, { recursive: true });
    const lockPath = join(locksPath, 'src__foo.ts.lock');
    const staleAcquiredAt = new Date(Date.now() - 400_000).toISOString(); // 400s > 300s threshold
    const lockContent = JSON.stringify({ filePath: 'src/foo.ts', ownerWorkerId: 'w-dead', acquiredAt: staleAcquiredAt, taskId: 'task-001' });
    writeFileSync(lockPath, lockContent);

    const actions = planDoctorFixes(root);
    const unlockAction = actions.find(a => a.kind === 'unlock');
    expect(unlockAction).toBeDefined();
    expect(unlockAction?.target).toBe(lockPath);
    expect(unlockAction?.description).toContain('w-dead');
    expect(unlockAction?.description).toContain('src/foo.ts');
    expect(unlockAction?.previousValue).toBe(lockContent);
    // dry-run — lock file must still exist
    expect(existsSync(lockPath)).toBe(true);
  });

  it('does NOT propose unlock for a fresh (non-stale) lock file', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const locksPath = join(root, '.locks');
    mkdirSync(locksPath, { recursive: true });
    const lockPath = join(locksPath, 'src__foo.ts.lock');
    writeFileSync(lockPath, JSON.stringify({
      filePath: 'src/foo.ts', ownerWorkerId: 'w-alive', acquiredAt: new Date().toISOString(), taskId: 'task-001',
    }));

    const actions = planDoctorFixes(root);
    expect(actions.find(a => a.kind === 'unlock')).toBeUndefined();
  });

  it('ignores .spawnlock files entirely (distinct namespace, never proposed for unlock)', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const locksPath = join(root, '.locks');
    mkdirSync(locksPath, { recursive: true });
    writeFileSync(join(locksPath, 'abc123.spawnlock'), JSON.stringify({
      filePath: 'src/foo.ts', taskId: 'task-001', acquiredAt: new Date(Date.now() - 400_000).toISOString(),
    }));

    const actions = planDoctorFixes(root);
    expect(actions.find(a => a.kind === 'unlock')).toBeUndefined();
  });

  it('every planned action kind is a member of the closed whitelist', () => {
    // Dirty fixture: nothing present at all — exercises every branch at once.
    writeFileSync(join(root, 'unrelated.txt'), 'noise');
    const actions = planDoctorFixes(root);
    for (const action of actions) {
      expect(DOCTOR_FIX_ACTION_KINDS).toContain(action.kind);
    }
  });
});

describe('applyDoctorFixes — --yes real application', () => {
  it('creates missing .deckent/ and .tasks/ directories for real', () => {
    const actions = planDoctorFixes(root);
    expect(existsSync(join(root, '.deckent'))).toBe(false);
    expect(existsSync(join(root, '.tasks'))).toBe(false);

    const results = applyDoctorFixes(actions);

    expect(results.every(r => r.applied)).toBe(true);
    expect(existsSync(join(root, '.deckent'))).toBe(true);
    expect(existsSync(join(root, '.tasks'))).toBe(true);
  });

  it('resets a stale .deck-shadow file to 0o600 for real', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const shadowPath = join(root, '.tasks', '.deck-shadow');
    writeFileSync(shadowPath, '', { mode: 0o666 });

    const actions = planDoctorFixes(root);
    const results = applyDoctorFixes(actions);

    expect(results.every(r => r.applied)).toBe(true);
    expect(statSync(shadowPath).mode & 0o777).toBe(0o600);
  });

  it('applies migrateConfig for real, adding missing defaults and leaving a backup', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const configPath = join(root, '.deckent', 'config.json');
    writeFileSync(configPath, JSON.stringify({ mode: 'balanced' }, null, 2));

    const actions = planDoctorFixes(root);
    const results = applyDoctorFixes(actions);

    expect(results.every(r => r.applied)).toBe(true);
    const merged = JSON.parse(readFileSync(configPath, 'utf-8'));
    // Original value preserved
    expect(merged.mode).toBe('balanced');
    // At least one default field was added
    expect(Object.keys(merged).length).toBeGreaterThan(1);
    // migrateConfig's own timestamped backup exists somewhere in .deckent/
    const deckentFiles = readdirSync(join(root, '.deckent'));
    expect(deckentFiles.some((f: string) => f.startsWith('config.json.bak.'))).toBe(true);
  });

  it('applies config-recreate for real: backs up the corrupt file and rewrites valid defaults', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const configPath = join(root, '.deckent', 'config.json');
    const corrupt = '{ not: valid json at all';
    writeFileSync(configPath, corrupt);

    const actions = planDoctorFixes(root);
    const results = applyDoctorFixes(actions);

    expect(results.every(r => r.applied)).toBe(true);
    // config.json is now valid, parseable, and has real default content
    const recreated = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(Object.keys(recreated).length).toBeGreaterThan(1);
    // The corrupt original is preserved verbatim in a backup file
    const deckentFiles = readdirSync(join(root, '.deckent'));
    const backupFile = deckentFiles.find((f: string) => f.startsWith('config.json.corrupt.'));
    expect(backupFile).toBeDefined();
    expect(readFileSync(join(root, '.deckent', backupFile!), 'utf-8')).toBe(corrupt);
  });

  it('applies unlock for real: removes the stale lock file', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const locksPath = join(root, '.locks');
    mkdirSync(locksPath, { recursive: true });
    const lockPath = join(locksPath, 'src__foo.ts.lock');
    writeFileSync(lockPath, JSON.stringify({
      filePath: 'src/foo.ts', ownerWorkerId: 'w-dead', acquiredAt: new Date(Date.now() - 400_000).toISOString(), taskId: 'task-001',
    }));

    const actions = planDoctorFixes(root);
    const results = applyDoctorFixes(actions);

    expect(results.every(r => r.applied)).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('captures a per-action failure without aborting the remaining actions', () => {
    // Both dirs missing → two mkdir actions are planned.
    const actions = planDoctorFixes(root);
    expect(actions).toHaveLength(2);

    // Simulate a race between plan and apply: a FILE (not a directory) now
    // occupies the .deckent/ target. mkdirSync({recursive:true}) throws EEXIST
    // when the final path exists as a non-directory — a real, deterministic failure.
    writeFileSync(join(root, '.deckent'), 'not a directory');

    const results = applyDoctorFixes(actions);
    const deckentResult = results.find(r => r.action.target === join(root, '.deckent'));
    const tasksResult = results.find(r => r.action.target === join(root, '.tasks'));

    expect(deckentResult?.applied).toBe(false);
    expect(deckentResult?.error).toBeTruthy();
    // The other action is unaffected — one failure never aborts the rest.
    expect(tasksResult?.applied).toBe(true);
    expect(existsSync(join(root, '.tasks'))).toBe(true);
  });

  it('never emits or applies a kind outside the closed whitelist', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.tasks', '.deck-shadow'), '', { mode: 0o644 });
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ mode: 'balanced' }));

    const actions = planDoctorFixes(root);
    const results = applyDoctorFixes(actions);
    for (const r of results) {
      expect(DOCTOR_FIX_ACTION_KINDS).toContain(r.action.kind);
    }
  });
});

describe('formatDoctorFixLines', () => {
  it('reports "nothing to repair" for an empty action list', () => {
    const lines = formatDoctorFixLines([]);
    expect(lines.join('\n')).toContain('nothing to repair');
  });

  it('lists each action with a "would fix" prefix in dry-run mode, and points at --yes', () => {
    const actions = planDoctorFixesFixture();
    const lines = formatDoctorFixLines(actions);
    const joined = lines.join('\n');
    for (const a of actions) expect(joined).toContain(a.description);
    expect(joined).toContain('[would fix]');
    expect(joined).toContain('--fix --yes');
  });

  it('lists each result with a "fixed" or "FAILED" prefix when results are supplied', () => {
    const actions = planDoctorFixesFixture();
    const results = actions.map(action => ({ action, applied: true }));
    const lines = formatDoctorFixLines(actions, results);
    const joined = lines.join('\n');
    expect(joined).toContain('[fixed]');
    expect(joined).not.toContain('[would fix]');
  });

  it('surfaces a FAILED line with the error message when a result did not apply', () => {
    const actions = planDoctorFixesFixture();
    const results = [{ action: actions[0]!, applied: false, error: 'boom' }];
    const lines = formatDoctorFixLines([actions[0]!], results);
    const joined = lines.join('\n');
    expect(joined).toContain('[FAILED]');
    expect(joined).toContain('boom');
  });

  it('renders a "before:" line for an action that carries a previousValue (dry-run)', () => {
    const actions = [{ kind: 'chmod' as const, target: '/tmp/x/.deck-shadow', description: 'Reset permissions', previousValue: 'mode 644' }];
    const lines = formatDoctorFixLines(actions);
    expect(lines.some(l => l.includes('mode 644'))).toBe(true);
  });

  it('renders a "before:" line for an applied action that carries a previousValue', () => {
    const actions = [{ kind: 'unlock' as const, target: '/tmp/x/.locks/foo.lock', description: 'Remove stale lock', previousValue: '{"ownerWorkerId":"w-dead"}' }];
    const results = [{ action: actions[0]!, applied: true }];
    const lines = formatDoctorFixLines(actions, results);
    expect(lines.some(l => l.includes('w-dead'))).toBe(true);
  });

  it('does NOT render a "before:" line when previousValue is absent (backward-compat fixture shape)', () => {
    const actions = planDoctorFixesFixture();
    const lines = formatDoctorFixLines(actions);
    expect(lines.some(l => l.includes('before:'))).toBe(false);
  });

  it('appends a "Manual" section listing non-auto-fixable checks, honestly labeled', () => {
    const actions = planDoctorFixesFixture();
    const manual = [{ name: 'git', message: 'not found — Install git' }];
    const lines = formatDoctorFixLines(actions, undefined, manual);
    const joined = lines.join('\n');
    expect(joined).toContain('[manual]');
    expect(joined).toContain('git');
    expect(joined).toContain('not found — Install git');
  });

  it('replaces "nothing to repair" with an honest "manual attention needed" line when actions is empty but manual is not', () => {
    const manual = [{ name: 'tmux', message: 'not found' }];
    const lines = formatDoctorFixLines([], undefined, manual);
    const joined = lines.join('\n');
    expect(joined).not.toContain('nothing to repair');
    expect(joined).toContain('manual attention');
    expect(joined).toContain('[manual]');
    expect(joined).toContain('tmux');
  });

  it('still reports "nothing to repair" when BOTH actions and manual are empty', () => {
    const lines = formatDoctorFixLines([], undefined, []);
    expect(lines.join('\n')).toContain('nothing to repair');
  });

  it('renders the Turkish variant when lang="tr" is passed', () => {
    const lines = formatDoctorFixLines([], undefined, [], 'tr');
    expect(lines.join('\n')).toContain('onarılacak bir şey yok');
  });
});

/** Small fixture action list for pure formatter tests — no fs I/O needed. */
function planDoctorFixesFixture() {
  return [
    { kind: 'mkdir' as const, target: '/tmp/x/.deckent', description: 'Create missing directory: .deckent/' },
    { kind: 'chmod' as const, target: '/tmp/x/.tasks/.deck-shadow', description: 'Reset permissions on stale .tasks/.deck-shadow: 644 → 600' },
  ];
}
