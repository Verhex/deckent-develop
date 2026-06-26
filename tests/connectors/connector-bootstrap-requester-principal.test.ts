// tests/connectors/connector-bootstrap-requester-principal.test.ts
//
// Regression for the confused-deputy fix (final review of the connector-bootstrap
// identity integration). A parked bot-action must carry the REQUESTER's principal
// — the user who actually parked the action — NOT "the last chat sender" cached in
// a channel-keyed slot. Multi-user channel scenario:
//   user B (low perms) parks action P; user A (admin) chats later; approving P must
//   authorize as B, never A. The old channel-keyed `lastPrincipals` map let A's
//   principal authorize B's action → privilege escalation.
//
// Two reachable proofs:
//   1. parkBotAction stores + returns a per-action requesterPrincipal; a later park
//      by A does NOT overwrite B's stored principal (no channel-keyed clobber).
//   2. The chat-turn path threads the per-message principal onto the parked action
//      (makeChatResponder, agentic park path) — hermetic fake tool_use provider.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parkBotAction, takeBotAction, listBotActions } from '../../src/connectors/bot-action-store.js';
import { makeChatResponder } from '../../src/connectors/chat-bridge.js';
import type { ChatProviderAdapter, McpToolDispatcher } from '../../src/cli/commands/chat-native.js';
import type { ResolvedPrincipal } from '../../src/connectors/identity/provider.js';

const principalB: ResolvedPrincipal = {
  userId: 'userB', role: 'viewer', permissions: ['order:read'],
  tenantId: 'firmax', verified: true, source: 'local',
};
const principalA: ResolvedPrincipal = {
  userId: 'userA', role: 'admin', permissions: ['order:read', 'order:write', 'order:delete'],
  tenantId: 'firmax', verified: true, source: 'local',
};

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'req-principal-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('parkBotAction — requester principal (confused-deputy fix)', () => {
  it('stores the per-action requester principal; a later park by A does NOT overwrite B', () => {
    // B (low perms) parks first.
    const idB = parkBotAction(root, { tool: 'send_mail', args: { to: 'x@y.com' }, channelId: 'shared-chan', requesterPrincipal: principalB });
    // A (admin) parks on the SAME channel afterwards — the old channel-keyed model
    // would clobber B's slot with A here, escalating B's pending action to admin.
    const idA = parkBotAction(root, { tool: 'deckent_kill', args: {}, channelId: 'shared-chan', requesterPrincipal: principalA });

    const takenB = takeBotAction(root, idB);
    const takenA = takeBotAction(root, idA);
    // B's action is authorized as B — NOT the last sender A (no privilege escalation).
    expect(takenB?.requesterPrincipal).toMatchObject({ userId: 'userB', role: 'viewer', permissions: ['order:read'] });
    expect(takenB?.requesterPrincipal?.userId).toBe('userB');
    // A's own action carries A.
    expect(takenA?.requesterPrincipal).toMatchObject({ userId: 'userA', role: 'admin' });
  });

  it('omits requesterPrincipal when none is supplied (identity-disabled path byte-for-byte unchanged)', () => {
    const id = parkBotAction(root, { tool: 'send_mail', args: {}, channelId: 'c1' });
    const taken = takeBotAction(root, id);
    expect(taken?.requesterPrincipal).toBeUndefined();
    expect(taken).toMatchObject({ tool: 'send_mail', channelId: 'c1' }); // every other field unchanged
  });
});

describe('chat-turn → park threading (primary-path L2 gate is no longer a no-op)', () => {
  // Hermetic fake tool_use provider: turn 1 requests a RISKY tool (deckent_plan)
  // that the gated dispatcher PARKS; turn 2 produces the final text.
  function planningProvider(): ChatProviderAdapter {
    let turn = 0;
    return {
      async send() {
        turn++;
        if (turn === 1) {
          return { stopReason: 'tool_use' as const, toolCalls: [{ id: 't1', name: 'deckent_plan', args: { directive: 'Sprint 300' } }] };
        }
        return { text: 'Parked for your approval.', stopReason: 'end_turn' as const };
      },
    };
  }

  it('the principal passed to the chat turn is carried onto the parked action', async () => {
    const innerSpy: McpToolDispatcher = { dispatch: vi.fn(async () => 'SHOULD NOT RUN') };
    const respond = makeChatResponder({ agentic: true, root, provider: planningProvider(), dispatcher: innerSpy });
    // 5th positional arg = the per-message resolved principal (B).
    await respond('shared-chan', 'plan a new sprint', undefined, undefined, principalB);
    const parked = listBotActions(root);
    expect(parked).toHaveLength(1);
    expect(parked[0]?.requesterPrincipal).toMatchObject({ userId: 'userB', role: 'viewer' });
    expect(innerSpy.dispatch).not.toHaveBeenCalled(); // risky never auto-executed
  });

  it('no principal (identity disabled) → parked action has no requesterPrincipal (unchanged)', async () => {
    const innerSpy: McpToolDispatcher = { dispatch: vi.fn(async () => 'SHOULD NOT RUN') };
    const respond = makeChatResponder({ agentic: true, root, provider: planningProvider(), dispatcher: innerSpy });
    await respond('shared-chan', 'plan a new sprint');
    const parked = listBotActions(root);
    expect(parked).toHaveLength(1);
    expect(parked[0]?.requesterPrincipal).toBeUndefined();
  });
});
