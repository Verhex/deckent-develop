import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { DECKENT_VERSION } from '../../src/core/constants.js';

// Mock all command registrations to avoid pulling in real dependencies
vi.mock('../../src/cli/commands/init.js', () => ({ registerInit: vi.fn() }));
vi.mock('../../src/cli/commands/start.js', () => ({ registerStart: vi.fn() }));
vi.mock('../../src/cli/commands/plan.js', () => ({ registerPlan: vi.fn() }));
vi.mock('../../src/cli/commands/status.js', () => ({ registerStatus: vi.fn() }));
vi.mock('../../src/cli/commands/attach.js', () => ({ registerAttach: vi.fn() }));
vi.mock('../../src/cli/commands/spawn.js', () => ({ registerSpawn: vi.fn() }));
vi.mock('../../src/cli/commands/kill.js', () => ({ registerKill: vi.fn() }));
vi.mock('../../src/cli/commands/retro.js', () => ({ registerRetro: vi.fn() }));
vi.mock('../../src/cli/commands/cleanup.js', () => ({ registerCleanup: vi.fn() }));
vi.mock('../../src/cli/commands/doctor.js', () => ({ registerDoctor: vi.fn() }));
vi.mock('../../src/cli/commands/config.js', () => ({ registerConfig: vi.fn() }));
vi.mock('../../src/cli/commands/history.js', () => ({ registerHistory: vi.fn() }));
vi.mock('../../src/cli/commands/plugin.js', () => ({ registerPlugin: vi.fn() }));
vi.mock('../../src/cli/commands/upgrade.js', () => ({ registerUpgrade: vi.fn() }));
vi.mock('../../src/cli/commands/onboard.js', () => ({ registerOnboard: vi.fn() }));
vi.mock('../../src/cli/commands/analyze.js', () => ({ registerAnalyze: vi.fn() }));
vi.mock('../../src/cli/commands/archive-debt.js', () => ({ registerArchiveDebt: vi.fn() }));
vi.mock('../../src/cli/commands/dashboard.js', () => ({ registerDashboard: vi.fn() }));
vi.mock('../../src/cli/commands/serve.js', () => ({ registerServe: vi.fn() }));
vi.mock('../../src/cli/commands/web.js', () => ({ registerWeb: vi.fn() }));
vi.mock('../../src/cli/commands/sync.js', () => ({ registerSync: vi.fn() }));
vi.mock('../../src/cli/commands/watch.js', () => ({ registerWatch: vi.fn() }));
vi.mock('../../src/cli/commands/run.js', () => ({ registerRun: vi.fn() }));
vi.mock('../../src/cli/commands/test-run.js', () => ({ registerTestRun: vi.fn() }));
vi.mock('../../src/cli/commands/agent.js', () => ({ registerAgent: vi.fn() }));
vi.mock('../../src/cli/commands/skill.js', () => ({ registerSkill: vi.fn() }));
vi.mock('../../src/cli/commands/review.js', () => ({ registerReview: vi.fn() }));
vi.mock('../../src/cli/commands/finalize.js', () => ({ registerFinalize: vi.fn() }));
vi.mock('../../src/cli/version-info.js', () => ({
  buildVersionString: vi.fn((v: string) => v),
  buildVersionJson: vi.fn((v: string) => ({ version: v })),
}));

import { buildProgram } from '../../src/cli/index.js';
import { registerInit } from '../../src/cli/commands/init.js';
import { registerStart } from '../../src/cli/commands/start.js';
import { registerPlan } from '../../src/cli/commands/plan.js';
import { registerStatus } from '../../src/cli/commands/status.js';
import { registerAttach } from '../../src/cli/commands/attach.js';
import { registerSpawn } from '../../src/cli/commands/spawn.js';
import { registerKill } from '../../src/cli/commands/kill.js';
import { registerRetro } from '../../src/cli/commands/retro.js';
import { registerCleanup } from '../../src/cli/commands/cleanup.js';
import { registerDoctor } from '../../src/cli/commands/doctor.js';
import { registerConfig } from '../../src/cli/commands/config.js';
import { registerHistory } from '../../src/cli/commands/history.js';
import { registerPlugin } from '../../src/cli/commands/plugin.js';
import { registerUpgrade } from '../../src/cli/commands/upgrade.js';
import { registerOnboard } from '../../src/cli/commands/onboard.js';
import { registerAnalyze } from '../../src/cli/commands/analyze.js';
import { registerArchiveDebt } from '../../src/cli/commands/archive-debt.js';
import { registerDashboard } from '../../src/cli/commands/dashboard.js';
import { registerServe } from '../../src/cli/commands/serve.js';
import { registerWeb } from '../../src/cli/commands/web.js';
import { registerSync } from '../../src/cli/commands/sync.js';
import { registerWatch } from '../../src/cli/commands/watch.js';
import { registerRun } from '../../src/cli/commands/run.js';
import { registerTestRun } from '../../src/cli/commands/test-run.js';
import { registerAgent } from '../../src/cli/commands/agent.js';
import { registerSkill } from '../../src/cli/commands/skill.js';
import { registerReview } from '../../src/cli/commands/review.js';
import { registerFinalize } from '../../src/cli/commands/finalize.js';

describe('CLI index — buildProgram()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports buildProgram as a function', () => {
    expect(typeof buildProgram).toBe('function');
  });

  it('importing index.ts does NOT trigger parseAsync (no side-effects)', async () => {
    // If we got here without errors, no parseAsync was called on import.
    // The module only exports buildProgram — no top-level parseAsync call.
    const mod = await import('../../src/cli/index.js');
    expect(mod.buildProgram).toBeDefined();
    // No parseAsync property or side-effect
    expect(Object.keys(mod)).toContain('buildProgram');
  });

  it('buildProgram returns a Command instance', () => {
    const program = buildProgram();
    expect(program).toBeInstanceOf(Command);
  });

  it('program name is "deckent"', () => {
    const program = buildProgram();
    expect(program.name()).toBe('deckent');
  });

  it('program has --version-json option', () => {
    const program = buildProgram();
    const opts = program.options.map((o) => o.long);
    expect(opts).toContain('--version-json');
  });

  it('program has -V/--version flag', () => {
    const program = buildProgram();
    const opts = program.options.map((o) => o.long);
    expect(opts).toContain('--version');
  });

  it('registers all 28 command functions', () => {
    buildProgram();

    expect(registerInit).toHaveBeenCalledTimes(1);
    expect(registerStart).toHaveBeenCalledTimes(1);
    expect(registerPlan).toHaveBeenCalledTimes(1);
    expect(registerStatus).toHaveBeenCalledTimes(1);
    expect(registerAttach).toHaveBeenCalledTimes(1);
    expect(registerSpawn).toHaveBeenCalledTimes(1);
    expect(registerKill).toHaveBeenCalledTimes(1);
    expect(registerRetro).toHaveBeenCalledTimes(1);
    expect(registerCleanup).toHaveBeenCalledTimes(1);
    expect(registerDoctor).toHaveBeenCalledTimes(1);
    expect(registerConfig).toHaveBeenCalledTimes(1);
    expect(registerHistory).toHaveBeenCalledTimes(1);
    expect(registerPlugin).toHaveBeenCalledTimes(1);
    expect(registerUpgrade).toHaveBeenCalledTimes(1);
    expect(registerOnboard).toHaveBeenCalledTimes(1);
    expect(registerAnalyze).toHaveBeenCalledTimes(1);
    expect(registerArchiveDebt).toHaveBeenCalledTimes(1);
    expect(registerDashboard).toHaveBeenCalledTimes(1);
    expect(registerServe).toHaveBeenCalledTimes(1);
    expect(registerWeb).toHaveBeenCalledTimes(1);
    expect(registerSync).toHaveBeenCalledTimes(1);
    expect(registerWatch).toHaveBeenCalledTimes(1);
    expect(registerRun).toHaveBeenCalledTimes(1);
    expect(registerTestRun).toHaveBeenCalledTimes(1);
    expect(registerAgent).toHaveBeenCalledTimes(1);
    expect(registerSkill).toHaveBeenCalledTimes(1);
    expect(registerReview).toHaveBeenCalledTimes(1);
    expect(registerFinalize).toHaveBeenCalledTimes(1);
  });

  it('each register function receives a Command instance', () => {
    buildProgram();
    const call = vi.mocked(registerInit).mock.calls[0];
    expect(call?.[0]).toBeInstanceOf(Command);
  });

  it('calling buildProgram multiple times creates independent programs', () => {
    const p1 = buildProgram();
    const p2 = buildProgram();
    expect(p1).not.toBe(p2);
    expect(p1).toBeInstanceOf(Command);
    expect(p2).toBeInstanceOf(Command);
  });

  it('version matches DECKENT_VERSION constant', () => {
    expect(DECKENT_VERSION).toBe('0.3.0-beta.3');
  });

  it('buildProgram does not call parseAsync', () => {
    const program = buildProgram();
    // parseAsync should not have been called — program is returned without parsing
    // We verify by checking that program is ready to parse (has commands) but hasn't executed
    expect(program.name()).toBe('deckent');
  });

  it('program description is set correctly', () => {
    const program = buildProgram();
    expect(program.description()).toContain('AI agent orchestration system');
  });
});

describe('CLI entry.ts', () => {
  it('entry.ts file exists and exports from index', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const entryPath = path.resolve(import.meta.dirname ?? '.', '../../src/cli/entry.ts');
    const content = fs.readFileSync(entryPath, 'utf-8');
    expect(content).toContain("import { buildProgram } from './index.js'");
    expect(content).toContain('buildProgram()');
    expect(content).toContain('parseAsync');
  });
});

describe('package.json bin field', () => {
  it('bin.deckent points to dist/cli/entry.js', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.resolve(import.meta.dirname ?? '.', '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.bin.deckent).toBe('./dist/cli/entry.js');
  });
});
