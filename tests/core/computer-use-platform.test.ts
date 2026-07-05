// tests/core/computer-use-platform.test.ts
//
// Sprint 370, Task 370-004 (TOOL-CU-DILIM-2) — platform-capability negotiation
// coverage for src/core/computer-use-platform.ts. Every prober here is a fake
// (vi.fn()) — no real spawn, no real `command -v` shell-out, matching the
// task's "gerçek-spawn testte YASAK" constraint.

import { describe, it, expect, vi } from 'vitest';
import {
  negotiateComputerUseCapabilities,
  isKnownComputerUsePlatform,
  COMPUTER_USE_PLATFORMS,
  type CommandProber,
} from '../../src/core/computer-use-platform.js';
import { COMPUTER_USE_ACTION_KINDS, type ComputerUseConfig } from '../../src/core/computer-use-contract.js';

const ENABLED_ALL: ComputerUseConfig = {
  enabled: true,
  allowed_capabilities: [...COMPUTER_USE_ACTION_KINDS],
};

/** A prober that reports every tool as present. */
function alwaysAvailableProber(): CommandProber {
  return vi.fn(() => true);
}

/** A prober that reports every tool as absent. */
function neverAvailableProber(): CommandProber {
  return vi.fn(() => false);
}

describe('COMPUTER_USE_PLATFORMS / isKnownComputerUsePlatform', () => {
  it('exposes exactly the 4 known platform ids', () => {
    expect(COMPUTER_USE_PLATFORMS).toEqual(['linux', 'wsl', 'darwin', 'win32']);
  });

  it('recognizes each of the 4 known ids', () => {
    for (const platform of COMPUTER_USE_PLATFORMS) {
      expect(isKnownComputerUsePlatform(platform)).toBe(true);
    }
  });

  it('rejects an unknown platform string', () => {
    expect(isKnownComputerUsePlatform('freebsd')).toBe(false);
    expect(isKnownComputerUsePlatform('')).toBe(false);
  });
});

describe('negotiateComputerUseCapabilities — flag-off short-circuit (never probes)', () => {
  it('never calls the prober when config is entirely absent', () => {
    const prober = alwaysAvailableProber();
    const result = negotiateComputerUseCapabilities('linux', undefined, prober);
    expect(prober).not.toHaveBeenCalled();
    for (const kind of COMPUTER_USE_ACTION_KINDS) {
      expect(result[kind].available).toBe(false);
      expect(result[kind].reason).toBeTruthy();
    }
  });

  it('never calls the prober when enabled is explicitly false', () => {
    const prober = alwaysAvailableProber();
    const result = negotiateComputerUseCapabilities(
      'darwin',
      { enabled: false, allowed_capabilities: ['screenshot'] },
      prober,
    );
    expect(prober).not.toHaveBeenCalled();
    expect(result.screenshot.available).toBe(false);
  });

  it('never calls the prober when enabled but allowed_capabilities is empty (fail-closed)', () => {
    const prober = alwaysAvailableProber();
    const result = negotiateComputerUseCapabilities('win32', { enabled: true, allowed_capabilities: [] }, prober);
    expect(prober).not.toHaveBeenCalled();
    for (const kind of COMPUTER_USE_ACTION_KINDS) {
      expect(result[kind].available).toBe(false);
    }
  });
});

describe('negotiateComputerUseCapabilities — unknown platform is honest-unavailable', () => {
  it('marks every capability unavailable with a platform-naming reason, without probing', () => {
    const prober = alwaysAvailableProber();
    const result = negotiateComputerUseCapabilities('freebsd', ENABLED_ALL, prober);
    expect(prober).not.toHaveBeenCalled();
    for (const kind of COMPUTER_USE_ACTION_KINDS) {
      expect(result[kind].available).toBe(false);
      expect(result[kind].reason).toMatch(/unsupported platform 'freebsd'/);
    }
  });
});

describe('negotiateComputerUseCapabilities — 4-platform x >=3-capability detection matrix (fake prober)', () => {
  const cases: Array<{ platform: (typeof COMPUTER_USE_PLATFORMS)[number]; presentTool: string; absentAlternative: string }> = [
    { platform: 'linux', presentTool: 'grim', absentAlternative: 'xdotool' },
    { platform: 'wsl', presentTool: 'powershell.exe', absentAlternative: 'powershell.exe' },
    { platform: 'darwin', presentTool: 'screencapture', absentAlternative: 'osascript' },
    { platform: 'win32', presentTool: 'powershell.exe', absentAlternative: 'powershell.exe' },
  ];

  for (const { platform } of cases) {
    it(`${platform}: screenshot/click/type honestly flip on prober output`, () => {
      const present = negotiateComputerUseCapabilities(platform, ENABLED_ALL, alwaysAvailableProber());
      expect(present.screenshot.available).toBe(true);
      expect(present.click.available).toBe(true);
      expect(present.type.available).toBe(true);

      const absent = negotiateComputerUseCapabilities(platform, ENABLED_ALL, neverAvailableProber());
      expect(absent.screenshot.available).toBe(false);
      expect(absent.screenshot.reason).toBeTruthy();
      expect(absent.click.available).toBe(false);
      expect(absent.click.reason).toBeTruthy();
      expect(absent.type.available).toBe(false);
      expect(absent.type.reason).toBeTruthy();
    });

    it(`${platform}: prober is actually consulted (per-tool) for screenshot/click/type`, () => {
      const prober = vi.fn(() => false);
      negotiateComputerUseCapabilities(platform, ENABLED_ALL, prober);
      expect(prober.mock.calls.length).toBeGreaterThan(0);
    });
  }

  it('linux: mixed prober result (only gnome-screenshot present) still finds screenshot but not click/type', () => {
    const prober: CommandProber = (cmd) => cmd === 'gnome-screenshot';
    const result = negotiateComputerUseCapabilities('linux', ENABLED_ALL, prober);
    expect(result.screenshot.available).toBe(true);
    expect(result.click.available).toBe(false);
    expect(result.type.available).toBe(false);
  });
});

describe('negotiateComputerUseCapabilities — navigate is honestly not-implemented everywhere', () => {
  for (const platform of COMPUTER_USE_PLATFORMS) {
    it(`${platform}: navigate is unavailable regardless of prober output`, () => {
      const present = negotiateComputerUseCapabilities(platform, ENABLED_ALL, alwaysAvailableProber());
      expect(present.navigate.available).toBe(false);
      expect(present.navigate.reason).toMatch(/browser driver bridge/i);

      const absent = negotiateComputerUseCapabilities(platform, ENABLED_ALL, neverAvailableProber());
      expect(absent.navigate.available).toBe(false);
      expect(absent.navigate.reason).toMatch(/browser driver bridge/i);
    });
  }
});

describe('negotiateComputerUseCapabilities — allowlist filtering skips probing for excluded capabilities', () => {
  it('does not probe click/type tools when only screenshot is allowlisted (linux, disjoint tool sets)', () => {
    const calledCommands: string[] = [];
    const prober: CommandProber = (cmd) => {
      calledCommands.push(cmd);
      return true;
    };
    const result = negotiateComputerUseCapabilities(
      'linux',
      { enabled: true, allowed_capabilities: ['screenshot'] },
      prober,
    );
    expect(result.screenshot.available).toBe(true);
    expect(result.click.available).toBe(false);
    expect(result.click.reason).toMatch(/not in the resolved allowed_capabilities allowlist/);
    expect(result.type.available).toBe(false);
    expect(calledCommands).not.toContain('xdotool');
  });

  it('grants exactly the allowlisted subset on darwin', () => {
    const result = negotiateComputerUseCapabilities(
      'darwin',
      { enabled: true, allowed_capabilities: ['click', 'type'] },
      alwaysAvailableProber(),
    );
    expect(result.screenshot.available).toBe(false);
    expect(result.click.available).toBe(true);
    expect(result.type.available).toBe(true);
    expect(result.navigate.available).toBe(false);
  });
});
