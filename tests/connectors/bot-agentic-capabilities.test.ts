/**
 * Task 9 — capability-aware gated dispatcher (slice 1 cap-slice1).
 *
 * Verifies the capability branch added at the TOP of makeGatedDispatcher.dispatch:
 *   auto     → runAuto (not parked, not inner)
 *   confirm  → park (existing flow), does NOT run
 *   deny     → refusal message
 *   unavailable → not-available message
 *   non-capability tool → falls through to existing inner path unchanged
 */

import { describe, it, expect, vi } from 'vitest';
import { makeGatedDispatcher, type CapabilityGate } from '../../src/connectors/bot-agentic.js';
import type { McpToolDispatcher } from '../../src/cli/commands/chat-native.js';

const inner: McpToolDispatcher = { dispatch: vi.fn(async () => 'INNER') };

function gate(resolve: CapabilityGate['resolve'], runAuto = vi.fn(async () => 'RAN')): CapabilityGate {
  return { has: (id) => id === 'screenshot', resolve, runAuto };
}

describe('makeGatedDispatcher — capabilities', () => {
  it('auto → runs capability (not parked, not inner)', async () => {
    const runAuto = vi.fn(async () => 'RAN');
    const park = vi.fn();
    const d = makeGatedDispatcher({ inner, park, capabilities: gate(() => 'auto', runAuto) });
    expect(await d.dispatch('screenshot', {})).toBe('RAN');
    expect(runAuto).toHaveBeenCalledWith('screenshot', {});
    expect(park).not.toHaveBeenCalled();
    expect(inner.dispatch).not.toHaveBeenCalled();
  });
  it('confirm → parks (existing approve flow), does NOT run', async () => {
    const runAuto = vi.fn();
    const park = vi.fn(() => 'cap-7');
    const d = makeGatedDispatcher({ inner, park, capabilities: gate(() => 'confirm', runAuto) });
    const out = await d.dispatch('screenshot', { display: 'primary' });
    expect(park).toHaveBeenCalledWith('screenshot', { display: 'primary' });
    expect(runAuto).not.toHaveBeenCalled();
    expect(out).toContain('cap-7');
  });
  it('deny → refusal, nothing runs/parks', async () => {
    const park = vi.fn();
    const d = makeGatedDispatcher({ inner, park, capabilities: gate(() => 'deny') });
    expect(await d.dispatch('screenshot', {})).toMatch(/denied|reddedildi/i);
    expect(park).not.toHaveBeenCalled();
  });
  it('unavailable → not-available message', async () => {
    const d = makeGatedDispatcher({ inner, park: vi.fn(), capabilities: gate(() => 'unavailable') });
    expect(await d.dispatch('screenshot', {})).toMatch(/not available|kullanılamıyor/i);
  });
  it('non-capability tool path is unchanged (read-only auto-exec)', async () => {
    const d = makeGatedDispatcher({ inner, park: vi.fn(), capabilities: gate(() => 'auto') });
    expect(await d.dispatch('deckent_status', {})).toBe('INNER');
  });
});
