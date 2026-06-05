// CONFIRM-001 (MASTER-PLAN §4G) — `deckent kill --all` confirmation gate.
//
// Root cause: kill.ts ran killAllCascade (cascade-kill ALL workers + controller
// PIDs — irreversible) with zero confirmation; the declared --user-explicit flag
// was never read. shouldProceedKillAll is the testable gate: an explicit flag
// (--force / --user-explicit) bypasses the prompt; otherwise the (injectable)
// confirm decides, so a declined prompt aborts the cascade.
//
// ADR-040 no-silent-destructive: a destructive all-kill must be human-confirmed.

import { describe, it, expect, vi } from 'vitest';
import { shouldProceedKillAll } from '../../src/cli/commands/kill.js';

describe('kill --all confirmation gate (CONFIRM-001)', () => {
  it('proceeds without prompting when --force is set', async () => {
    const confirm = vi.fn(async () => false);
    expect(await shouldProceedKillAll({ force: true }, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('proceeds without prompting when --user-explicit is set', async () => {
    const confirm = vi.fn(async () => false);
    expect(await shouldProceedKillAll({ userExplicit: true }, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('aborts (returns false) when no flag is set and the user declines', async () => {
    expect(await shouldProceedKillAll({}, async () => false)).toBe(false);
  });

  it('proceeds (returns true) when no flag is set and the user confirms', async () => {
    const confirm = vi.fn(async () => true);
    expect(await shouldProceedKillAll({}, confirm)).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });
});
