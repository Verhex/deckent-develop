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
  it('is exactly mkdir/chmod/config-migrate — no delete/docker/login', () => {
    expect([...DOCTOR_FIX_ACTION_KINDS].sort()).toEqual(['chmod', 'config-migrate', 'mkdir']);
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
});

/** Small fixture action list for pure formatter tests — no fs I/O needed. */
function planDoctorFixesFixture() {
  return [
    { kind: 'mkdir' as const, target: '/tmp/x/.deckent', description: 'Create missing directory: .deckent/' },
    { kind: 'chmod' as const, target: '/tmp/x/.tasks/.deck-shadow', description: 'Reset permissions on stale .tasks/.deck-shadow: 644 → 600' },
  ];
}
