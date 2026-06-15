// tests/core/notify-self-describing.test.ts
// W1 — self-describing notifications: every notification carries the owning PID
// (the process whose terminal the operator must act in) + actionable commands
// (e.g. "deckent nervous accept <id>"), so a sprint terminal / status / dashboard
// can all tell the operator exactly what to run.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createNotification, toEventPayload } from '../../src/core/notification-dispatcher.js';
import { CliNotificationAdapter } from '../../src/core/notify-adapters/cli-adapter.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('self-describing notifications (W1)', () => {
  it('createNotification defaults owningPid to the emitting process.pid', () => {
    const n = createNotification('human-checkpoint-required', 's-1', 'Approval', 'needed');
    expect(n.owningPid).toBe(process.pid);
  });

  it('createNotification accepts an explicit owningPid + actions via opts', () => {
    const n = createNotification('human-checkpoint-required', 's-1', 'Approval', 'needed', undefined, {
      owningPid: 4242,
      actions: [{ label: 'Approve', cliCommand: 'deckent nervous accept abc' }],
    });
    expect(n.owningPid).toBe(4242);
    expect(n.actions).toEqual([{ label: 'Approve', cliCommand: 'deckent nervous accept abc' }]);
  });

  it('toEventPayload carries owningPid + actions so every surface can act', () => {
    const n = createNotification('human-checkpoint-required', 's-1', 'A', 'b', undefined, {
      owningPid: 7,
      actions: [{ label: 'Approve', cliCommand: 'deckent nervous accept x' }],
    });
    const p = toEventPayload(n);
    expect(p['owningPid']).toBe(7);
    expect(p['actions']).toEqual([{ label: 'Approve', cliCommand: 'deckent nervous accept x' }]);
  });

  it('cli-adapter prints the sprint+PID context line and the approval command line', async () => {
    delete process.env['DECKENT_PARENT_PID'];
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const adapter = new CliNotificationAdapter();
    const n = createNotification('human-checkpoint-required', 'sprint-9', 'Approval needed', 'nervous wants to act', undefined, {
      owningPid: 1234,
      actions: [{ label: 'Approve', cliCommand: 'deckent nervous accept k9' }],
    });
    await adapter.send(n);
    const out = writeSpy.mock.calls[0]![0] as string;
    expect(out).toContain('[deckent]');               // backward-compatible prefix preserved
    expect(out).toContain('sprint-9');
    expect(out).toContain('PID 1234');
    expect(out).toContain('deckent nervous accept k9');
  });
});
