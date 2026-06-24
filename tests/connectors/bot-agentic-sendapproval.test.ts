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
  it('confirm fallback: sendApproval returns false → legacy parked text (not short ack)', async () => {
    const sendApproval = vi.fn(async () => false);
    const park = vi.fn(() => 'act-3');
    const d = makeGatedDispatcher({ inner, park, capabilities: gate({ sendApproval }) });
    const out = await d.dispatch('send_mail', { to: 'b@x.com' });
    expect(sendApproval).toHaveBeenCalledWith('act-3', 'send_mail', { to: 'b@x.com' });
    expect(out).toMatch(/approve act-3/i);
  });
  it('confirm fallback: sendApproval throws → exception swallowed, legacy parked text returned', async () => {
    const sendApproval = vi.fn(async () => { throw new Error('network down'); });
    const park = vi.fn(() => 'act-4');
    const d = makeGatedDispatcher({ inner, park, capabilities: gate({ sendApproval }) });
    const out = await d.dispatch('send_mail', { to: 'c@x.com' });
    expect(sendApproval).toHaveBeenCalledWith('act-4', 'send_mail', { to: 'c@x.com' });
    expect(out).toMatch(/approve act-4/i);
  });
});
