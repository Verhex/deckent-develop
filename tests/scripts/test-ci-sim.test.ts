import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_STASH_TARGETS,
  restorePaths,
  runCiSim,
  stashPaths,
} from '../../scripts/test-ci-sim.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/test-ci-sim.mjs');

let sandbox: string;

beforeEach(() => {
  // Hermetic: a fresh tmpdir per test so we never touch the live repo state.
  sandbox = mkdtempSync(join(tmpdir(), 'ci-sim-test-'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('stashPaths', () => {
  it('renames an existing target to <path><suffix>', () => {
    mkdirSync(join(sandbox, '.deckent'));
    writeFileSync(join(sandbox, '.deckent/config.json'), '{"x":1}');

    const stashed = stashPaths(['.deckent/config.json'], '.stash-A', sandbox);

    expect(stashed).toHaveLength(1);
    expect(existsSync(join(sandbox, '.deckent/config.json'))).toBe(false);
    expect(existsSync(join(sandbox, '.deckent/config.json.stash-A'))).toBe(true);
    expect(readFileSync(join(sandbox, '.deckent/config.json.stash-A'), 'utf-8')).toBe('{"x":1}');
  });

  it('silently skips non-existent targets', () => {
    const stashed = stashPaths(['does-not-exist.json', '.brain'], '.stash-B', sandbox);
    expect(stashed).toHaveLength(0);
  });
});

describe('restorePaths', () => {
  it('restores every stashed entry back to its original location', () => {
    mkdirSync(join(sandbox, '.brain'));
    writeFileSync(join(sandbox, '.brain/memory.db'), 'fake-sqlite');
    writeFileSync(join(sandbox, 'extra.txt'), 'hello');

    const stashed = stashPaths(['.brain', 'extra.txt'], '.stash-C', sandbox);
    expect(stashed).toHaveLength(2);

    const { restored, errors } = restorePaths(stashed);

    expect(errors).toEqual([]);
    expect(restored).toHaveLength(2);
    expect(existsSync(join(sandbox, '.brain/memory.db'))).toBe(true);
    expect(readFileSync(join(sandbox, '.brain/memory.db'), 'utf-8')).toBe('fake-sqlite');
    expect(readFileSync(join(sandbox, 'extra.txt'), 'utf-8')).toBe('hello');
  });

  it('continues restoring remaining entries when one entry has already been removed', () => {
    writeFileSync(join(sandbox, 'a.json'), 'A');
    writeFileSync(join(sandbox, 'b.json'), 'B');

    const stashed = stashPaths(['a.json', 'b.json'], '.stash-D', sandbox);
    expect(stashed).toHaveLength(2);

    // Simulate a half-corrupted stash: physically remove one stash entry so its
    // restore is a no-op, then ensure the OTHER entry still gets restored.
    rmSync(join(sandbox, 'a.json.stash-D'));

    const { restored, errors } = restorePaths(stashed);

    expect(errors).toEqual([]);
    expect(restored).toEqual([join(sandbox, 'b.json')]);
    expect(existsSync(join(sandbox, 'b.json'))).toBe(true);
    expect(readFileSync(join(sandbox, 'b.json'), 'utf-8')).toBe('B');
  });
});

describe('runCiSim', () => {
  it('sets CI=1 in the runner env when invoking vitest', async () => {
    mkdirSync(join(sandbox, '.deckent'));
    writeFileSync(join(sandbox, '.deckent/config.json'), '{"local":true}');

    let capturedEnv: Record<string, string | undefined> | null = null;
    const fakeRunner = async (_args: string[], opts: { env?: Record<string, string> }) => {
      capturedEnv = opts.env ?? null;
      return { code: 0, signal: null };
    };

    const result = await runCiSim({
      rootDir: sandbox,
      targets: ['.deckent/config.json'],
      suffix: '.stash-E',
      runner: fakeRunner,
    });

    expect(result.code).toBe(0);
    expect(capturedEnv).not.toBeNull();
    expect(capturedEnv!.CI).toBe('1');
    // After the run finished, state must be back in place.
    expect(existsSync(join(sandbox, '.deckent/config.json'))).toBe(true);
  });

  it('restores stashed state even when the runner THROWS (try/finally contract)', async () => {
    mkdirSync(join(sandbox, '.brain'));
    writeFileSync(join(sandbox, '.brain/memory.db'), 'sqlite-bytes');
    writeFileSync(join(sandbox, '.deckent-config'), 'cfg');

    const exploding = async () => {
      throw new Error('vitest blew up mid-run');
    };

    const result = await runCiSim({
      rootDir: sandbox,
      targets: ['.brain', '.deckent-config'],
      suffix: '.stash-F',
      runner: exploding,
    });

    // The thrown error is captured (not re-thrown) so the script can still exit cleanly.
    expect(result.code).toBe(2);
    expect(result.error).toContain('vitest blew up mid-run');
    // Critical: state MUST be back in place even though the runner threw.
    expect(existsSync(join(sandbox, '.brain/memory.db'))).toBe(true);
    expect(readFileSync(join(sandbox, '.brain/memory.db'), 'utf-8')).toBe('sqlite-bytes');
    expect(existsSync(join(sandbox, '.deckent-config'))).toBe(true);
    expect(existsSync(join(sandbox, '.brain.stash-F'))).toBe(false);
    expect(existsSync(join(sandbox, '.deckent-config.stash-F'))).toBe(false);
  });

  it('--dry-run skips the runner but still exercises stash+restore cleanly', async () => {
    mkdirSync(join(sandbox, '.brain'));
    writeFileSync(join(sandbox, '.brain/memory.db'), 'dry');

    let runnerCalled = false;
    const trapRunner = async () => {
      runnerCalled = true;
      return { code: 99, signal: null };
    };

    const result = await runCiSim({
      rootDir: sandbox,
      targets: ['.brain'],
      suffix: '.stash-G',
      runner: trapRunner,
      dryRun: true,
    });

    expect(runnerCalled).toBe(false);
    expect(result.code).toBe(0);
    expect(result.skipped).toBe(true);
    expect(existsSync(join(sandbox, '.brain/memory.db'))).toBe(true);
    expect(existsSync(join(sandbox, '.brain.stash-G'))).toBe(false);
  });
});

describe('script artifact', () => {
  it('exposes the documented public surface', () => {
    expect(typeof stashPaths).toBe('function');
    expect(typeof restorePaths).toBe('function');
    expect(typeof runCiSim).toBe('function');
    expect(Array.isArray(DEFAULT_STASH_TARGETS)).toBe(true);
    // Default stash list MUST cover the two paths the task body names explicitly.
    expect(DEFAULT_STASH_TARGETS).toContain('.deckent/config.json');
    expect(DEFAULT_STASH_TARGETS).toContain('.brain');
  });

  it('script file exists and is within the ≤200 LoC budget', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
    const lines = readFileSync(SCRIPT_PATH, 'utf-8').split('\n').length;
    expect(lines).toBeLessThanOrEqual(200);
  });
});
