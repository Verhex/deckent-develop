// tests/cli/config-nervous.test.ts
//
// `deckent config nervous` TUI tests — Sprint 147 Task 15.
// Tests for: set mode, override, list, reset, invalid preset, invalid action, safety floor.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createTmpRoot(): string {
  const root = join(tmpdir(), `config-nervous-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

function readConfig(root: string): Record<string, unknown> {
  const cfgPath = join(root, '.deckent', 'config.json');
  if (!existsSync(cfgPath)) return {};
  return JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
}

function writeConfig(root: string, config: Record<string, unknown>): void {
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
}

// ─── Mock resolveProjectRoot ─────────────────────────────────────────────────

let testRoot: string;

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
  handleCliError: (err: unknown) => { throw err; },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

const {
  handleSetMode,
  handleOverride,
  handleList,
  handleReset,
  registerConfigNervous,
} = await import('../../src/cli/commands/config-nervous.js');
const { Command } = await import('commander');

// ─── Capture Output Helpers ──────────────────────────────────────────────────

function captureOutput(fn: () => void): string {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunks.join('');
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;

  try {
    fn();
  } finally {
    process.stderr.write = originalWrite;
  }
  return chunks.join('');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deckent config nervous', () => {
  beforeEach(() => {
    testRoot = createTmpRoot();
    process.exitCode = undefined;
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch {}
  });

  // Test 1: set mode strict → config.nervous_system.mode = 'strict'
  it('should set mode to strict and persist to config', () => {
    const output = captureOutput(() => {
      handleSetMode(testRoot, 'strict');
    });

    expect(output).toContain('strict');
    expect(output).toContain('✓');

    const cfg = readConfig(testRoot);
    const ns = (cfg.nervous_system as Record<string, unknown>);
    expect(ns).toBeDefined();
    expect(ns['mode']).toBe('strict');
    expect(process.exitCode).toBeUndefined();
  });

  // Test 2: override COMMIT_PUSH approve → action_overrides updated
  it('should add COMMIT_PUSH override to action_overrides', () => {
    const output = captureOutput(() => {
      handleOverride(testRoot, 'COMMIT_PUSH', 'approve');
    });

    expect(output).toContain('COMMIT_PUSH');
    expect(output).toContain('approve');
    expect(output).toContain('✓');

    const cfg = readConfig(testRoot);
    const ns = (cfg.nervous_system as Record<string, unknown>);
    const overrides = ns['actionOverrides'] as Record<string, string>;
    expect(overrides).toBeDefined();
    expect(overrides['COMMIT_PUSH']).toBe('approve');
    expect(process.exitCode).toBeUndefined();
  });

  // Test 3: list → 4 line matrix table (one row per preset)
  it('should display 4-row authority matrix table', () => {
    const output = captureOutput(() => {
      handleList(testRoot);
    });

    // All 4 presets should appear
    expect(output).toContain('strict');
    expect(output).toContain('balanced');
    expect(output).toContain('autopilot');
    expect(output).toContain('full-auto');

    // Risk columns should be labeled
    expect(output).toContain('Low Risk');
    expect(output).toContain('Medium Risk');
    expect(output).toContain('High Risk');
  });

  // Test 4: reset → action_overrides = {}
  it('should reset action_overrides to empty object', () => {
    // Set up some overrides first
    writeConfig(testRoot, {
      nervous_system: {
        mode: 'autopilot',
        enabled: false,
        actionOverrides: {
          COMMIT_PUSH: 'approve',
          SPRINT_START: 'suggest-5m',
        },
      },
    });

    const output = captureOutput(() => {
      handleReset(testRoot);
    });

    expect(output).toContain('reset');

    const cfg = readConfig(testRoot);
    const ns = (cfg.nervous_system as Record<string, unknown>);
    const overrides = ns['actionOverrides'] as Record<string, string>;
    expect(Object.keys(overrides)).toHaveLength(0);
    expect(ns['mode']).toBe('autopilot'); // mode should NOT be changed
    expect(process.exitCode).toBeUndefined();
  });

  // Test 5: Invalid preset → error + exit 1
  it('should error on invalid preset and set exitCode to 1', () => {
    const errOutput = captureStderr(() => {
      captureOutput(() => {
        handleSetMode(testRoot, 'super-auto');
      });
    });

    expect(errOutput).toContain('Invalid preset');
    expect(errOutput).toContain('super-auto');
    expect(process.exitCode).toBe(1);

    // Config should NOT have been written
    const cfg = readConfig(testRoot);
    expect(cfg.nervous_system).toBeUndefined();
  });

  // Test 6: Invalid action ID → error
  it('should error on unknown action ID', () => {
    const errOutput = captureStderr(() => {
      captureOutput(() => {
        handleOverride(testRoot, 'NONEXISTENT_ACTION', 'approve');
      });
    });

    expect(errOutput).toContain('Invalid action ID');
    expect(errOutput).toContain('NONEXISTENT_ACTION');
    expect(process.exitCode).toBe(1);

    // Config should NOT have been written with this override
    const cfg = readConfig(testRoot);
    expect(cfg.nervous_system).toBeUndefined();
  });

  // Test 7: Safety floor override attempt (KILL_LIVE_SPRINT=autonomous) → rejected + warning
  it('should reject safety floor override with autonomous policy and show warning', () => {
    const output = captureOutput(() => {
      handleOverride(testRoot, 'KILL_LIVE_SPRINT', 'autonomous');
    });

    // Warning message should be in stdout (not stderr)
    expect(output).toContain('Safety floor');
    expect(output).toContain('KILL_LIVE_SPRINT');
    expect(process.exitCode).toBe(1);

    // Override should NOT have been written
    const cfg = readConfig(testRoot);
    if (cfg.nervous_system) {
      const ns = cfg.nervous_system as Record<string, unknown>;
      const overrides = ns['actionOverrides'] as Record<string, string> | undefined;
      if (overrides) {
        expect(overrides['KILL_LIVE_SPRINT']).toBeUndefined();
      }
    }
  });

  // Additional: safety floor with suggest-5m should also be rejected
  it('should reject safety floor override with suggest-5m as well', () => {
    captureOutput(() => {
      handleOverride(testRoot, 'DESTRUCTIVE_GIT', 'suggest-5m');
    });

    expect(process.exitCode).toBe(1);
  });

  // Additional: safety floor with approve is allowed
  it('should allow safety floor override with approve policy', () => {
    const output = captureOutput(() => {
      handleOverride(testRoot, 'KILL_LIVE_SPRINT', 'approve');
    });

    expect(output).toContain('✓');
    expect(process.exitCode).toBeUndefined();

    const cfg = readConfig(testRoot);
    const ns = (cfg.nervous_system as Record<string, unknown>);
    const overrides = ns['actionOverrides'] as Record<string, string>;
    expect(overrides['KILL_LIVE_SPRINT']).toBe('approve');
  });

  // Integration: command tree via Commander
  it('should wire up set mode via Commander subcommand', () => {
    // registerConfigNervous(program) finds the 'config' subcommand via program.commands
    const program = new Command();
    program.command('config').description('config parent'); // create config subcommand first
    registerConfigNervous(program);

    captureOutput(() => {
      program.parse(['node', 'deckent', 'config', 'nervous', 'set', 'mode', 'autopilot'], { from: 'node' });
    });

    const cfg = readConfig(testRoot);
    const ns = (cfg.nervous_system as Record<string, unknown>);
    expect(ns['mode']).toBe('autopilot');
  });

  // Integration: override via Commander
  it('should wire up override via Commander subcommand', () => {
    const program = new Command();
    program.command('config').description('config parent');
    registerConfigNervous(program);

    captureOutput(() => {
      program.parse(['node', 'deckent', 'config', 'nervous', 'override', 'COMMIT_PUSH', 'suggest-5m'], { from: 'node' });
    });

    const cfg = readConfig(testRoot);
    const ns = (cfg.nervous_system as Record<string, unknown>);
    const overrides = ns['actionOverrides'] as Record<string, string>;
    expect(overrides['COMMIT_PUSH']).toBe('suggest-5m');
  });

  // Integration: list via Commander
  it('should wire up list via Commander subcommand', () => {
    const program = new Command();
    program.command('config').description('config parent');
    registerConfigNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'config', 'nervous', 'list'], { from: 'node' });
    });

    expect(output).toContain('strict');
    expect(output).toContain('balanced');
    expect(output).toContain('autopilot');
    expect(output).toContain('full-auto');
  });

  // Integration: reset via Commander
  it('should wire up reset via Commander subcommand', () => {
    writeConfig(testRoot, {
      nervous_system: { mode: 'strict', enabled: false, actionOverrides: { COMMIT_PUSH: 'approve' } },
    });

    const program = new Command();
    program.command('config').description('config parent');
    registerConfigNervous(program);

    captureOutput(() => {
      program.parse(['node', 'deckent', 'config', 'nervous', 'reset'], { from: 'node' });
    });

    const cfg = readConfig(testRoot);
    const ns = (cfg.nervous_system as Record<string, unknown>);
    const overrides = ns['actionOverrides'] as Record<string, string>;
    expect(Object.keys(overrides)).toHaveLength(0);
  });

  // Preserves existing mode when setting only overrides
  it('should preserve existing mode when adding override', () => {
    writeConfig(testRoot, {
      nervous_system: { mode: 'autopilot', enabled: true, actionOverrides: {} },
    });

    captureOutput(() => {
      handleOverride(testRoot, 'SPRINT_START', 'approve');
    });

    const cfg = readConfig(testRoot);
    const ns = (cfg.nervous_system as Record<string, unknown>);
    expect(ns['mode']).toBe('autopilot'); // preserved
    const overrides = ns['actionOverrides'] as Record<string, string>;
    expect(overrides['SPRINT_START']).toBe('approve');
  });

  // List shows active overrides when present
  it('should show active overrides in list output', () => {
    writeConfig(testRoot, {
      nervous_system: {
        mode: 'balanced',
        enabled: false,
        actionOverrides: { COMMIT_PUSH: 'suggest-30m' },
      },
    });

    const output = captureOutput(() => {
      handleList(testRoot);
    });

    expect(output).toContain('COMMIT_PUSH');
    expect(output).toContain('suggest-30m');
  });

  // List shows active preset marker
  it('should mark the current active preset in list', () => {
    writeConfig(testRoot, {
      nervous_system: { mode: 'autopilot', enabled: false, actionOverrides: {} },
    });

    const output = captureOutput(() => {
      handleList(testRoot);
    });

    expect(output).toContain('active');
    expect(output).toContain('autopilot');
  });
});
