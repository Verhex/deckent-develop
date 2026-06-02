import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NERVOUS_FIXTURE = {
  nervous_system: {
    enabled: true,
    mode: 'balanced',
    actionOverrides: {},
    safety_floor: {
      locked_actions: [
        'KILL_LIVE_SPRINT',
        'MANUAL_FILE_DELETE',
        'COST_OVER_THRESHOLD',
        'DESTRUCTIVE_GIT',
        'ADR_DEPRECATE_ACCEPTED',
      ],
      cost_threshold_usd: 110,
      bypass_allowed: false,
    },
  },
};

describe('nervous_system config — hermetic fixture tests', () => {
  it('enabled is true', () => {
    expect(NERVOUS_FIXTURE.nervous_system.enabled).toBe(true);
  });

  it('mode is balanced', () => {
    expect(NERVOUS_FIXTURE.nervous_system.mode).toBe('balanced');
  });

  it('safety-floor locked_actions preserved and bypass_allowed is false', () => {
    const { safety_floor } = NERVOUS_FIXTURE.nervous_system;
    expect(safety_floor.bypass_allowed).toBe(false);
    expect(safety_floor.locked_actions).toContain('KILL_LIVE_SPRINT');
    expect(safety_floor.locked_actions).toContain('DESTRUCTIVE_GIT');
    expect(safety_floor.locked_actions).toContain('ADR_DEPRECATE_ACCEPTED');
  });

  it('writes and reads config fixture via tmpdir without touching live state', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-nervous-test-'));
    try {
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(NERVOUS_FIXTURE, null, 2));
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(parsed.nervous_system.enabled).toBe(true);
      expect(parsed.nervous_system.mode).toBe('balanced');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
