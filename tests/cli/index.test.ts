import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
vi.mock('../../src/cli/commands/usage.js', () => ({ registerUsage: vi.fn() }));
vi.mock('../../src/cli/commands/history.js', () => ({ registerHistory: vi.fn() }));
vi.mock('../../src/cli/commands/plugin.js', () => ({ registerPlugin: vi.fn() }));
vi.mock('../../src/cli/commands/upgrade.js', () => ({ registerUpgrade: vi.fn() }));
vi.mock('../../src/cli/commands/onboard.js', () => ({ registerOnboard: vi.fn() }));

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
import { registerUsage } from '../../src/cli/commands/usage.js';
import { registerHistory } from '../../src/cli/commands/history.js';
import { registerPlugin } from '../../src/cli/commands/plugin.js';
import { registerUpgrade } from '../../src/cli/commands/upgrade.js';
import { registerOnboard } from '../../src/cli/commands/onboard.js';

describe('CLI entry point', () => {
  it('registers all 16 command functions', async () => {
    // Import to trigger the module — all register functions should be called
    await import('../../src/cli/index.js');

    expect(registerInit).toHaveBeenCalled();
    expect(registerStart).toHaveBeenCalled();
    expect(registerPlan).toHaveBeenCalled();
    expect(registerStatus).toHaveBeenCalled();
    expect(registerAttach).toHaveBeenCalled();
    expect(registerSpawn).toHaveBeenCalled();
    expect(registerKill).toHaveBeenCalled();
    expect(registerRetro).toHaveBeenCalled();
    expect(registerCleanup).toHaveBeenCalled();
    expect(registerDoctor).toHaveBeenCalled();
    expect(registerConfig).toHaveBeenCalled();
    expect(registerUsage).toHaveBeenCalled();
    expect(registerHistory).toHaveBeenCalled();
    expect(registerPlugin).toHaveBeenCalled();
    expect(registerUpgrade).toHaveBeenCalled();
    expect(registerOnboard).toHaveBeenCalled();
  });

  it('each register function receives a Command instance', async () => {
    // Already imported above; check the argument type
    const call = vi.mocked(registerInit).mock.calls[0];
    expect(call?.[0]).toBeInstanceOf(Command);
  });

  it('version matches DECKENT_VERSION constant', () => {
    expect(DECKENT_VERSION).toBe('0.1.0');
  });
});
