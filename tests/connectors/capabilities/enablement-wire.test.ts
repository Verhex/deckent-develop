/**
 * Enablement wire test — asserts that capConfig: { enabled: true } passed to
 * makeChatResponder actually reaches the capability gate (the gate dispatches,
 * not returns 'unavailable') vs capConfig absent / disabled (gate → unavailable).
 *
 * RED against pre-fix wiring intent: if bot.ts was not threading capConfig,
 * constructing the responder with capConfig: { enabled: true } would behave
 * identically to capConfig absent — the gate would always return 'unavailable'
 * because `deps.capConfig ?? { enabled: false }` would pick up the absent value.
 * This test verifies the gate produces a DIFFERENT result when enabled.
 *
 * GREEN after fix: capConfig is forwarded through makeChatResponder → the gate
 * resolves screenshot to 'auto' when enabled, routing through runAuto rather than
 * returning the unavailable message.
 *
 * Hermetic: tmpdir only, no real network, no real claude, no spawn system commands.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeChatResponder } from '../../../src/connectors/chat-bridge.js';
import { createBuiltinRegistry } from '../../../src/connectors/capabilities/index.js';
import { describeCapabilities } from '../../../src/connectors/capabilities/prompt.js';
import { resolvePolicy } from '../../../src/connectors/capabilities/policy.js';
import type { ChatProviderAdapter, McpToolDispatcher } from '../../../src/cli/commands/chat-native.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'cap-wire-'));
}

const noopDispatcher: McpToolDispatcher = { async dispatch() { return 'inner-fallback'; } };

/**
 * Provider that fires one screenshot tool_use then echos the tool result in
 * its final turn so the test can inspect it. This works with runChatNativeLoop:
 * turn 1 returns tool_use, which the loop dispatches and adds a role:'tool'
 * message to the transcript. Turn 2 receives the full history and echos the
 * last role:'tool' message content.
 */
function echoToolResultProvider(): ChatProviderAdapter {
  let turn = 0;
  return {
    async send(messages) {
      turn++;
      if (turn === 1) {
        return {
          stopReason: 'tool_use' as const,
          toolCalls: [{ id: 't1', name: 'screenshot', args: {} }],
        };
      }
      // On turn 2, find the tool result message (role: 'tool') and echo it.
      const toolMsg = [...messages].reverse().find((m) => m.role === 'tool');
      const toolResult = toolMsg?.content ?? 'none';
      return { text: `echo:${toolResult}`, stopReason: 'end_turn' as const };
    },
  };
}

// ─── Catalog tests (unit — no responder needed) ───────────────────────────────
// These assert the describeCapabilities → resolvePolicy wiring directly, proving
// that { enabled: true } produces a non-empty catalog and { enabled: false } is ''.
// These tests are the strongest proof of the catalog-enablement thread since they
// test the exact functions makeChatResponder uses internally.

describe('describeCapabilities — enabled flag controls catalog visibility', () => {
  const r = createBuiltinRegistry();

  it('enabled=true → non-empty catalog containing screenshot and send_mail', () => {
    const resolve = (id: string) =>
      resolvePolicy(r.get(id)!, { chatKey: 'c', edition: 'solo', config: { enabled: true } });
    const catalog = describeCapabilities(r, resolve, 'en');
    expect(catalog).not.toBe('');
    expect(catalog).toContain('screenshot');
    expect(catalog).toContain('send_mail');
  });

  it('enabled=false → empty catalog (nothing advertised)', () => {
    const resolve = (id: string) =>
      resolvePolicy(r.get(id)!, { chatKey: 'c', edition: 'solo', config: { enabled: false } });
    const catalog = describeCapabilities(r, resolve, 'en');
    expect(catalog).toBe('');
  });

  it('capConfig absent (undefined) → disabled fallback → empty catalog', () => {
    const resolve = (id: string) =>
      resolvePolicy(r.get(id)!, { chatKey: 'c', edition: 'solo', config: {} });
    const catalog = describeCapabilities(r, resolve, 'en');
    expect(catalog).toBe('');
  });
});

// ─── Gate routing tests — proves thread-through of capConfig into the responder ─
// The observable difference: with enabled=true, a screenshot tool_use goes through
// capGate.runAuto → runCapability (returns capability-error or spawn-error, NOT the
// "not available" gate message). With enabled=false, the gate returns the "not
// available" message as the tool result. The provider echoes the tool result in its
// final assistant message so we can assert on it.

describe('makeChatResponder — capConfig thread-through via gate routing', () => {
  it('🔴 capConfig: { enabled: true } — gate routes screenshot to runAuto, NOT "not available"', async () => {
    const root = makeTempRoot();
    try {
      const respond = makeChatResponder({
        agentic: true,
        root,
        provider: echoToolResultProvider(),
        dispatcher: noopDispatcher,
        capConfig: { enabled: true },
      });

      const reply = await respond('sess-enabled', 'take a screenshot');
      // With enabled=true: gate resolves screenshot to 'auto' → runAuto →
      // runCapability runs. The spawn fails (no real display in CI) → returns
      // [capability-error] or spawn-error string. Either way, it's NOT the
      // "not available" gate message.
      // The provider echoes it: "echo:<tool-result>".
      expect(reply).not.toMatch(/not available/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('capConfig absent — gate returns "not available" for screenshot', async () => {
    const root = makeTempRoot();
    try {
      const respond = makeChatResponder({
        agentic: true,
        root,
        provider: echoToolResultProvider(),
        dispatcher: noopDispatcher,
        // capConfig deliberately omitted — default { enabled: false }
      });

      const reply = await respond('sess-disabled', 'take a screenshot');
      // With no capConfig (defaults to disabled): gate resolves screenshot to
      // 'unavailable' → returns "Capability 'screenshot' is not available."
      // The provider echoes it: "echo:Capability 'screenshot' is not available."
      expect(reply).toMatch(/not available/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('capConfig: { enabled: false } explicit — same as absent, gate returns "not available"', async () => {
    const root = makeTempRoot();
    try {
      const respond = makeChatResponder({
        agentic: true,
        root,
        provider: echoToolResultProvider(),
        dispatcher: noopDispatcher,
        capConfig: { enabled: false },
      });

      const reply = await respond('sess-explicit-off', 'take a screenshot');
      expect(reply).toMatch(/not available/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
