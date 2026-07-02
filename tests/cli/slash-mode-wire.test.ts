import { describe, it, expect } from 'vitest';
import { getVisibleCommands } from '../../src/cli/commands/chat-mode.js';
import { buildSlashRegistry } from '../../src/cli/commands/chat-slash-registry.js';

// ─── getVisibleCommands — mode-aware /help wire point ───────────────────────
//
// Sprint 357 Task 357-010 (SLASH-MODE-WIRE, G-034 #3). Exercises the REAL live
// catalog (buildSlashRegistry()), not a fixture — this proves the wire between
// the live registry and filterRegistryByMode actually integrates, which the
// existing tests/cli/chat-mode.test.ts (fixture-only) does not cover.

describe('getVisibleCommands — mode-aware /help list from the live catalog', () => {
  it('user mode filters the 4 enterprise slashes out of the live registry', () => {
    const visible = getVisibleCommands('user');
    const names = visible.map((c) => c.name);
    expect(names).not.toContain('/audit');
    expect(names).not.toContain('/rbac');
    expect(names).not.toContain('/flow');
    expect(names).not.toContain('/cost');
  });

  it('enterprise mode returns the full live registry unfiltered', () => {
    const visible = getVisibleCommands('enterprise');
    const full = buildSlashRegistry();
    expect(visible.length).toBe(full.length);
    // Only /audit is wired into the live SLASH_CATALOG today — /rbac, /flow, /cost
    // are reserved enterprise names (ENTERPRISE_SLASH_NAMES in chat-mode.ts) not
    // yet present as live catalog entries. See docImpact note in .result.
    const names = visible.map((c) => c.name);
    expect(names).toContain('/audit');
  });

  it('/help itself is always visible, in both modes', () => {
    expect(getVisibleCommands('user').some((c) => c.name === '/help')).toBe(true);
    expect(getVisibleCommands('enterprise').some((c) => c.name === '/help')).toBe(true);
  });

  it('user-mode result is a strict subset of the enterprise-mode result', () => {
    const userNames = new Set(getVisibleCommands('user').map((c) => c.name));
    const enterpriseNames = new Set(getVisibleCommands('enterprise').map((c) => c.name));
    for (const name of userNames) {
      expect(enterpriseNames.has(name)).toBe(true);
    }
    expect(userNames.size).toBeLessThan(enterpriseNames.size);
  });
});
