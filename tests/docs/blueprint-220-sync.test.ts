import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BLUEPRINT_PATH = join(process.cwd(), 'docs/vision/blueprint.md');

describe('Blueprint 220-sync — Sprint 220 doc update (task 220-017)', () => {
  it('native güncel — blueprint reflects native REPL as genuinely connected (not skeleton)', () => {
    expect(existsSync(BLUEPRINT_PATH)).toBe(true);
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    // Sprint 220 updated the "Where it stands today" section to reflect native REPL wire
    expect(content).toMatch(/native REPL genuinely connected/i);
    expect(content).toMatch(/Sprint 220/);
    // The old stale "Sprint 219 ... is the on-going work" phrase should be gone
    expect(content).not.toMatch(/Sprint 219.*is the on-going work/);
  });

  it('nervous-active — blueprint mentions nervous system as active in Faz-1', () => {
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    // Sprint 220 activated nervous system — blueprint should reflect this
    expect(content).toMatch(/nervous system active/i);
    expect(content).toMatch(/Faz-1/);
    expect(content).toMatch(/nervous_system\.enabled/);
  });

  it('stale-yok — no stale "provider not yet wired" or skeleton references', () => {
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    expect(content).not.toMatch(/provider not yet wired/i);
    expect(content).not.toMatch(/provider not wired/i);
    // dashboard-v2 live mentioned
    expect(content).toMatch(/dashboard-v2 live/i);
    // Sprint 219 is described as closed, not on-going
    expect(content).toMatch(/Sprint 219 closed/);
  });
});
