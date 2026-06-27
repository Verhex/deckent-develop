import { describe, it, expect, vi } from 'vitest';
import { makeGatedDispatcher, isRiskyBotTool } from '../../src/connectors/bot-agentic.js';
import type { McpToolDispatcher } from '../../src/cli/commands/chat-native.js';

const inner: McpToolDispatcher = { dispatch: vi.fn(async () => 'INNER') };

// B (group buttons): risky deckent_* tools now get a buttoned approval via the
// optional `sendToolApproval` dep — the tool-side twin of capabilities.sendApproval.
describe('makeGatedDispatcher — sendToolApproval (risky tool buttons)', () => {
  it('risky tool + sendToolApproval=true: parks, sends buttoned approval, returns short ack (not "approve <id>")', async () => {
    const sendToolApproval = vi.fn(async () => true);
    const park = vi.fn(() => 'act-1');
    const d = makeGatedDispatcher({ inner, park, sendToolApproval });
    const out = await d.dispatch('deckent_plan', { directive: 'Sprint 400' });
    expect(park).toHaveBeenCalledWith('deckent_plan', { directive: 'Sprint 400' });
    expect(sendToolApproval).toHaveBeenCalledWith('act-1', 'deckent_plan', { directive: 'Sprint 400' });
    expect(out).not.toMatch(/approve act-1/i); // no "type approve <id>" — buttons are on the message
    expect(out).toMatch(/onay|approval/i);
    expect(inner.dispatch).not.toHaveBeenCalled(); // nothing executed
  });

  it('risky tool + no sendToolApproval → legacy parked text (unchanged)', async () => {
    const park = vi.fn(() => 'act-2');
    const d = makeGatedDispatcher({ inner, park });
    expect(await d.dispatch('deckent_kill', {})).toMatch(/approve act-2/i);
  });

  it('risky tool + sendToolApproval=false → legacy parked text (not short ack)', async () => {
    const sendToolApproval = vi.fn(async () => false);
    const park = vi.fn(() => 'act-3');
    const d = makeGatedDispatcher({ inner, park, sendToolApproval });
    const out = await d.dispatch('deckent_sync', {});
    expect(sendToolApproval).toHaveBeenCalledWith('act-3', 'deckent_sync', {});
    expect(out).toMatch(/approve act-3/i);
  });

  it('risky tool + sendToolApproval throws → swallowed, legacy parked text returned', async () => {
    const sendToolApproval = vi.fn(async () => { throw new Error('network down'); });
    const park = vi.fn(() => 'act-4');
    const d = makeGatedDispatcher({ inner, park, sendToolApproval });
    const out = await d.dispatch('deckent_start', {});
    expect(sendToolApproval).toHaveBeenCalledWith('act-4', 'deckent_start', {});
    expect(out).toMatch(/approve act-4/i);
  });
});

// A: cost/usage/observability surface is read-only (auto-exec, never parked).
// Limited to the tools that have a real cliArgsFor → CLI subcommand bridge
// (cost→`cost show`, usage→`usage`, kpi→`kpi`); help/nervous_status were dropped
// because they lack a clean CLI mapping (advertising them = "tool not allowed").
describe('A — read-only tool surface expansion', () => {
  it('cost/usage/kpi are read-only (not risky)', () => {
    for (const t of ['deckent_cost', 'deckent_usage', 'deckent_kpi']) {
      expect(isRiskyBotTool(t)).toBe(false);
    }
  });

  it('deckent_cost auto-executes via inner (no park)', async () => {
    const innerSpy: McpToolDispatcher = { dispatch: vi.fn(async () => 'today: $1.23') };
    const park = vi.fn(() => 'should-not-park');
    const d = makeGatedDispatcher({ inner: innerSpy, park });
    expect(await d.dispatch('deckent_cost', {})).toBe('today: $1.23');
    expect(park).not.toHaveBeenCalled();
  });
});

// D: state-changing tools remain risky (approval-gated) — exposed to the prompt,
// gated by the fail-safe default (anything not read-only is risky).
describe('D — state-changing tools stay gated', () => {
  it('start/run/config/autonomous/process/set_directives are risky (gated)', () => {
    for (const t of [
      'deckent_start',
      'deckent_run',
      'deckent_config',
      'deckent_autonomous',
      'deckent_process',
      'deckent_set_directives',
    ]) {
      expect(isRiskyBotTool(t)).toBe(true);
    }
  });
});
