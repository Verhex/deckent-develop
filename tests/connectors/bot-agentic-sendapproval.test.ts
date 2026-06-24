import { describe, it, expect, vi } from 'vitest';
import { makeGatedDispatcher, type CapabilityGate } from '../../src/connectors/bot-agentic.js';
import type { McpToolDispatcher } from '../../src/cli/commands/chat-native.js';

const inner: McpToolDispatcher = { dispatch: vi.fn(async () => 'INNER') };
function gate(over: Partial<CapabilityGate>): CapabilityGate {
  return { has: (id) => id === 'send_mail', resolve: () => 'confirm', runAuto: vi.fn(), ...over };
}

describe('makeGatedDispatcher — sendApproval', () => {
  it('confirm: parks, calls sendApproval, returns short ack (not the type-approve text)', async () => {
    const sendApproval = vi.fn(async () => true);
    const park = vi.fn(() => 'act-1');
    const d = makeGatedDispatcher({ inner, park, capabilities: gate({ sendApproval }) });
    const out = await d.dispatch('send_mail', { to: 'a@x.com' });
    expect(park).toHaveBeenCalledWith('send_mail', { to: 'a@x.com' });
    expect(sendApproval).toHaveBeenCalledWith('act-1', 'send_mail', { to: 'a@x.com' });
    expect(out).not.toMatch(/approve act-1/i);        // no "type approve <id>"
    expect(out).toMatch(/onay|approval/i);
  });
  it('confirm fallback: no sendApproval (or returns false) → legacy parked text', async () => {
    const park = vi.fn(() => 'act-2');
    const d = makeGatedDispatcher({ inner, park, capabilities: gate({ sendApproval: undefined }) });
    expect(await d.dispatch('send_mail', {})).toMatch(/approve act-2/i);
  });
});
