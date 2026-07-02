import { describe, it, expect } from 'vitest';

import {
  buildSlashRegistry,
  resolveSlash,
  resolveNervousSlash,
} from '../../src/cli/commands/chat-slash-registry.js';
import {
  applyNervousBridgePlan,
  type NervousPendingStore,
  type NervousBridgeExecutor,
  type NervousBridgePendingCleanup,
  type NervousBridgeResolution,
} from '../../src/cli/repl/nervous-bridge.js';
import type { NervousNotification } from '../../src/core/nervous-types.js';
import { getCommand } from '../../src/cli/command-registry.js';

// Sprint 358 Task 358-004 (REPL-DISPATCH-PARITY) — MASTER-PLAN Sıra-66 (REPL-001)
// + Sıra-72 kalanı.
//
// Verifies:
//  1. The registry carries TERM-3 category/risk tags for the 3 command families
//     this task wires (/nervous, /autonomous, /mcp), cross-referenced from
//     command-registry.ts (no literal duplication).
//  2. `/nervous accept|reject|edit` genuinely CONSUME the 357-006 plan-object
//     bridge (nervous-bridge.ts) — plans built via resolveSlash/resolveNervousSlash
//     apply correctly through a fake executor (applyNervousBridgePlan), without
//     nervous-bridge.ts itself being modified.
//  3. `/autonomous` start/backlog/status parity (pre-existing from Sprint 269
//     T-269-003 — regression guard, not a re-implementation).
//  4. `/mcp` list vs. restart-hint fallback-notice parity.
//  5. resolveSlash's optional 3rd param is backward-compatible (2-arg calls
//     behave exactly as before this task).

// ─── fixtures ───────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    shortCode: 'ab12c',
    type: 'test-type',
    title: 'Test notification',
    message: 'A test message',
    severity: 'warning',
    createdAt: '2026-07-01T00:00:00.000Z',
    detectorId: 'test-detector',
    actions: [
      { id: 'TEST_ACTION', label: 'Test Action', policy: 'approve', risk: 'medium', isSafetyFloor: false },
    ],
    timeoutMs: null,
    ...overrides,
  };
}

function makeStore(notifications: readonly NervousNotification[]): NervousPendingStore {
  return { listPending: () => notifications };
}

interface FakeExecutor extends NervousBridgeExecutor {
  readonly calls: Array<{
    notificationId: string;
    decision: NervousBridgeResolution;
    opts: { modifiedPayload?: Record<string, unknown> } | undefined;
  }>;
}

function makeExecutor(result = true): FakeExecutor {
  const calls: FakeExecutor['calls'] = [];
  return {
    calls,
    resolveApproval(notificationId, decision, opts) {
      calls.push({ notificationId, decision, opts });
      return result;
    },
  };
}

interface FakeCleanup extends NervousBridgePendingCleanup {
  readonly removed: string[];
}

function makeCleanup(): FakeCleanup {
  const removed: string[] = [];
  return { removed, remove: (id) => removed.push(id) };
}

// ─── 1. TERM-3 category/risk tags for the 3 command families ────────────────

describe('buildSlashRegistry — TERM-3 category/risk parity (358-004)', () => {
  it('/nervous carries category/risk cross-referenced from command-registry.ts', () => {
    const entry = buildSlashRegistry().find((c) => c.name === '/nervous');
    const canonical = getCommand('nervous');
    expect(canonical).toBeDefined();
    expect(entry?.category).toBe(canonical?.category);
    expect(entry?.risk).toBe(canonical?.risk);
    expect(entry?.category).toBe('Enterprise');
    expect(entry?.risk).toBe('Değiştir');
  });

  it('/autonomous carries category/risk cross-referenced from command-registry.ts', () => {
    const entry = buildSlashRegistry().find((c) => c.name === '/autonomous');
    const canonical = getCommand('autonomous');
    expect(entry?.category).toBe(canonical?.category);
    expect(entry?.risk).toBe(canonical?.risk);
    expect(entry?.category).toBe('Enterprise');
    expect(entry?.risk).toBe('Otonom');
  });

  it('/mcp carries category/risk cross-referenced from the mcp-bridge (REPL-surface) command-registry entry', () => {
    const entry = buildSlashRegistry().find((c) => c.name === '/mcp');
    const canonical = getCommand('mcp-bridge');
    expect(canonical?.surfaces).toContain('repl');
    expect(entry?.category).toBe(canonical?.category);
    expect(entry?.risk).toBe(canonical?.risk);
    expect(entry?.category).toBe('MCP');
    expect(entry?.risk).toBe('Çalıştır');
  });

  it('an untagged entry (e.g. /help) has category/risk undefined', () => {
    const entry = buildSlashRegistry().find((c) => c.name === '/help');
    expect(entry?.category).toBeUndefined();
    expect(entry?.risk).toBeUndefined();
  });
});

// ─── 2. /nervous — plan-object bridge consumption ────────────────────────────

describe('resolveSlash / resolveNervousSlash — /nervous consumes the 357-006 bridge', () => {
  it('/nervous (bare) lists pending via listPendingNervous — read-only, no plan', () => {
    const notification = makeNotification();
    const store = makeStore([notification]);
    const action = resolveNervousSlash([], store);
    expect(action).toEqual({ action: 'nervous-list', items: [notification] });
  });

  it('/nervous list is equivalent to bare /nervous', () => {
    const store = makeStore([makeNotification()]);
    expect(resolveNervousSlash(['list'], store)).toEqual(resolveNervousSlash([], store));
  });

  it('/nervous accept <id> builds an unapplied accept plan that applies correctly via a fake executor', () => {
    const notification = makeNotification();
    const store = makeStore([notification]);
    const action = resolveNervousSlash(['accept', notification.id], store);
    expect(action.action).toBe('nervous-plan');
    if (action.action !== 'nervous-plan') throw new Error('unreachable');
    expect(action.sub).toBe('accept');
    expect(action.plan.notification).toEqual(notification);
    expect(action.plan.resolution).toBe('accepted');

    // Fake-executor plan-correctness (goCriteria): applying the plan this
    // resolver built must resolve + clear-pending exactly once, for the right id.
    const executor = makeExecutor();
    const cleanup = makeCleanup();
    const resolved = applyNervousBridgePlan(action.plan, executor, cleanup);
    expect(resolved).toBe(true);
    expect(executor.calls).toEqual([{ notificationId: notification.id, decision: 'accepted', opts: undefined }]);
    expect(cleanup.removed).toEqual([notification.id]);
  });

  it('/nervous reject <id> <reason...> builds a reject plan carrying the reason', () => {
    const notification = makeNotification();
    const store = makeStore([notification]);
    const action = resolveNervousSlash(['reject', notification.id, 'too', 'risky'], store);
    expect(action.action).toBe('nervous-plan');
    if (action.action !== 'nervous-plan') throw new Error('unreachable');
    expect(action.sub).toBe('reject');
    expect(action.plan.resolution).toBe('rejected');
    expect(action.plan.reason).toBe('too risky');

    const executor = makeExecutor();
    applyNervousBridgePlan(action.plan, executor);
    expect(executor.calls).toEqual([{ notificationId: notification.id, decision: 'rejected', opts: undefined }]);
  });

  it('/nervous edit <id> <json> builds an accept-with-modifiedPayload plan that applies correctly via a fake executor', () => {
    const notification = makeNotification();
    const store = makeStore([notification]);
    const action = resolveNervousSlash(['edit', notification.id, '{"foo":"bar"}'], store);
    expect(action.action).toBe('nervous-plan');
    if (action.action !== 'nervous-plan') throw new Error('unreachable');
    expect(action.sub).toBe('edit');
    expect(action.plan.resolution).toBe('accepted');
    expect(action.plan.modifiedPayload).toEqual({ foo: 'bar' });
    // regression parity (project_nervous_accept_pending_not_cleared): edit-accept
    // must carry the same clear-pending step as a plain accept.
    expect(action.plan.steps.map((s) => s.kind)).toEqual(['resolve-approval', 'clear-pending']);

    const executor = makeExecutor();
    const cleanup = makeCleanup();
    const resolved = applyNervousBridgePlan(action.plan, executor, cleanup);
    expect(resolved).toBe(true);
    expect(executor.calls).toEqual([
      { notificationId: notification.id, decision: 'accepted', opts: { modifiedPayload: { foo: 'bar' } } },
    ]);
    expect(cleanup.removed).toEqual([notification.id]);
  });

  it('/nervous edit <id> key=value ... parses key=value payload form', () => {
    const notification = makeNotification();
    const store = makeStore([notification]);
    const action = resolveNervousSlash(['edit', notification.id, 'foo=bar', 'baz=qux'], store);
    expect(action.action).toBe('nervous-plan');
    if (action.action !== 'nervous-plan') throw new Error('unreachable');
    expect(action.plan.modifiedPayload).toEqual({ foo: 'bar', baz: 'qux' });
  });

  it('/nervous edit <id> {bad json} → nervous.slash_edit_invalid_json message, no plan built', () => {
    const store = makeStore([makeNotification()]);
    const action = resolveNervousSlash(['edit', 'aaaaaaaa-0000-0000-0000-000000000001', '{not json'], store);
    expect(action).toEqual({
      action: 'message',
      messageKey: 'nervous.slash_edit_invalid_json',
      params: { detail: '{not json' },
    });
  });

  it('/nervous edit <id> badtoken → nervous.slash_edit_invalid_kv message', () => {
    const store = makeStore([makeNotification()]);
    const action = resolveNervousSlash(['edit', 'aaaaaaaa-0000-0000-0000-000000000001', 'badtoken'], store);
    expect(action).toEqual({
      action: 'message',
      messageKey: 'nervous.slash_edit_invalid_kv',
      params: { arg: 'badtoken' },
    });
  });

  it('/nervous edit <id> (no payload) → nervous.slash_edit_payload_required message', () => {
    const store = makeStore([makeNotification()]);
    const action = resolveNervousSlash(['edit', 'aaaaaaaa-0000-0000-0000-000000000001'], store);
    expect(action).toEqual({ action: 'message', messageKey: 'nervous.slash_edit_payload_required' });
  });

  it('/nervous accept (no id) → nervous.slash_id_required message', () => {
    const store = makeStore([makeNotification()]);
    const action = resolveNervousSlash(['accept'], store);
    expect(action).toEqual({
      action: 'message',
      messageKey: 'nervous.slash_id_required',
      params: { sub: 'accept' },
    });
  });

  it('/nervous accept <unknown-id> → nervous.slash_not_found message', () => {
    const store = makeStore([makeNotification()]);
    const action = resolveNervousSlash(['accept', 'does-not-exist'], store);
    expect(action).toEqual({
      action: 'message',
      messageKey: 'nervous.slash_not_found',
      params: { id: 'does-not-exist' },
    });
  });

  it('/nervous frobnicate → chat.slash_unknown_subaction message', () => {
    const store = makeStore([]);
    const action = resolveNervousSlash(['frobnicate'], store);
    expect(action).toEqual({
      action: 'message',
      messageKey: 'chat.slash_unknown_subaction',
      params: { command: '/nervous', sub: 'frobnicate' },
    });
  });

  it('resolveSlash("/nervous accept <id>", registry, store) dispatches through resolveNervousSlash', () => {
    const notification = makeNotification();
    const store = makeStore([notification]);
    const viaResolveSlash = resolveSlash(`/nervous accept ${notification.id}`, buildSlashRegistry(), store);
    const viaDirect = resolveNervousSlash(['accept', notification.id], store);
    expect(viaResolveSlash).toEqual(viaDirect);
  });

  it('resolveSlash("/nervous", registry) WITHOUT a store — backward-compatible, resolves to none', () => {
    // Every existing 2-arg call site (chat-native.ts, prior tests) must see
    // byte-for-byte identical behavior after this task's optional 3rd param.
    expect(resolveSlash('/nervous', buildSlashRegistry())).toEqual({ action: 'none' });
    expect(resolveSlash('/nervous accept x', buildSlashRegistry())).toEqual({ action: 'none' });
  });
});

// ─── 3. /autonomous — start/backlog/status parity (regression guard) ────────

describe('resolveSlash — /autonomous start/backlog/status parity (358-004 regression guard)', () => {
  it('/autonomous (bare) defaults to status', () => {
    expect(resolveSlash('/autonomous', buildSlashRegistry())).toEqual({
      action: 'agentic',
      tool: 'deckent_autonomous',
      args: { action: 'status' },
    });
  });

  it('/autonomous start', () => {
    expect(resolveSlash('/autonomous start', buildSlashRegistry())).toEqual({
      action: 'agentic',
      tool: 'deckent_autonomous',
      args: { action: 'start' },
    });
  });

  it('/autonomous backlog list', () => {
    expect(resolveSlash('/autonomous backlog list', buildSlashRegistry())).toEqual({
      action: 'agentic',
      tool: 'deckent_autonomous',
      args: { action: 'backlog_list' },
    });
  });

  it('/autonomous backlog add <title>', () => {
    expect(resolveSlash('/autonomous backlog add Ship the thing', buildSlashRegistry())).toEqual({
      action: 'agentic',
      tool: 'deckent_autonomous',
      args: { action: 'backlog_add', id: 'ship-the-thing', title: 'Ship the thing' },
    });
  });
});

// ─── 4. /mcp — list vs. restart-hint fallback-notice parity ─────────────────

describe('resolveSlash — /mcp list vs. restart-hint (358-004)', () => {
  it('/mcp (bare) → honest not-wired notice (unchanged from before this task)', () => {
    expect(resolveSlash('/mcp', buildSlashRegistry())).toEqual({
      action: 'message',
      messageKey: 'chat.mcp_not_wired',
    });
  });

  it('/mcp list → same not-wired notice as bare (this fallback layer only fires with no live bridge)', () => {
    expect(resolveSlash('/mcp list', buildSlashRegistry())).toEqual({
      action: 'message',
      messageKey: 'chat.mcp_not_wired',
    });
  });

  it('/mcp restart → honest unknown-subaction hint (no restart verb exists in the mcp bridge)', () => {
    expect(resolveSlash('/mcp restart', buildSlashRegistry())).toEqual({
      action: 'message',
      messageKey: 'chat.slash_unknown_subaction',
      params: { command: '/mcp', sub: 'restart' },
    });
  });
});
