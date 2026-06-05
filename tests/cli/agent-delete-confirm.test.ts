// CONFIRM-002 (MASTER-PLAN §4G) — `deckent agent delete <name>` confirmation gate.
//
// Root cause: the delete action rmSync'd the agent directory (recursive, force)
// with no confirmation and no --force flag. shouldProceedAgentDelete is the
// testable gate: --force bypasses the prompt; otherwise the (injectable) confirm
// decides, so a declined prompt leaves the agent directory intact.

import { describe, it, expect, vi } from 'vitest';
import { shouldProceedAgentDelete } from '../../src/cli/commands/agent.js';

describe('agent delete confirmation gate (CONFIRM-002)', () => {
  it('proceeds without prompting when --force is set', async () => {
    const confirm = vi.fn(async () => false);
    expect(await shouldProceedAgentDelete({ force: true }, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('aborts (returns false) when no flag is set and the user declines', async () => {
    expect(await shouldProceedAgentDelete({}, async () => false)).toBe(false);
  });

  it('proceeds (returns true) when no flag is set and the user confirms', async () => {
    const confirm = vi.fn(async () => true);
    expect(await shouldProceedAgentDelete({}, confirm)).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });
});
