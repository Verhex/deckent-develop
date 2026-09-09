// tests/cli/repl/native-permission-round.test.tsx
// ═══ 7111 — round-scoped grouped intent + read-only transcript marker ═══════
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { createNativePermissionInvocation } from '../../../src/agent/native-permission-binding.js';
import { NativePermissionIntentCard, buildNativePermissionRoundRows } from '../../../src/cli/repl/approval-card.js';
import {
  createNativePermissionIntentController,
  roundCoverableItems,
  type NativePermissionIntent,
  type NativePermissionRound,
} from '../../../src/cli/repl/native-permission-approval.js';
import {
  createNativePermissionRoundTracker,
  createReadOnlyToolMarker,
  projectNativePermissionRoundItem,
} from '../../../src/cli/repl/native-agent-bridge.js';
import { buildNativePermissionIntentLabels } from '../../../src/cli/repl/run.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';
import { CLI_TERMINAL_READONLY_MESSAGES } from '../../../src/cli/helpers/message-catalog/cli-terminal-readonly.js';
import { ToolRegistry } from '../../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../../src/agent/permission-policy.js';
import { nativeBuiltinApprovalClassifier } from '../../../src/agent/native-tool-approval.js';

const invocation = (callId: string, tier: 'confirm' | 'always' = 'confirm', elevated = false) => createNativePermissionInvocation({
  sessionId: 's', sessionInstanceId: 'i', turnGeneration: 1, invocationId: `v-${callId}`, callId, tool: 'deckent_bash',
  rawArgs: { cmd: `cmd ${callId}` }, tier, elevated, nested: false,
});

const round: NativePermissionRound = {
  key: 'i:1:1',
  items: [
    { callId: 'c1', tool: 'deckent_bash', resource: "sed -n '1,5p' a.md", scope: 'file-read', risk: 'none', projection: 'auto' },
    { callId: 'c2', tool: 'deckent_bash', resource: 'npm test', scope: 'shell-exec', risk: 'medium', projection: 'confirm' },
    { callId: 'c3', tool: 'deckent_write_file', resource: 'src/x.ts', scope: 'file-write', risk: 'high', projection: 'confirm' },
    { callId: 'c4', tool: 'deckent_bash', resource: 'rm -rf build', scope: 'shell-exec', risk: 'medium', projection: 'floor' },
  ],
};

const intentFor = (callId: string, extra: Partial<NativePermissionIntent> = {}): NativePermissionIntent => ({
  invocation: invocation(callId), tool: 'deckent_bash', resource: `cmd ${callId}`, actorId: 'operator',
  lifetimes: ['once', 'session', 'always'], round, ...extra,
});

describe('7111 — i18n family', () => {
  it('ships every read-only / round key in EN and TR', () => {
    for (const key of Object.keys(CLI_TERMINAL_READONLY_MESSAGES)) {
      expect(getMessageLanguages(key), key).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en')).not.toBe(key);
      expect(getMessage(key, 'tr')).not.toBe(key);
    }
  });
});

describe('7111 — intent controller round grant', () => {
  it('chooseRound settles the current intent as once and covers the other confirm-projected calls of the SAME round', async () => {
    const controller = createNativePermissionIntentController();
    const first = controller.request(intentFor('c2'));
    expect(roundCoverableItems(controller.current()!).map((i) => i.callId)).toEqual(['c3']);
    expect(controller.chooseRound()).toBe(true);
    await expect(first).resolves.toEqual({ kind: 'selected', lifetime: 'once' });
    // c3 (confirm, same round) is covered → resolves without a card.
    await expect(controller.request(intentFor('c3'))).resolves.toEqual({ kind: 'selected', lifetime: 'once', roundCovered: true });
    expect(controller.current()).toBeNull();
    // c4 sits on the always floor → still shows a card.
    const floor = controller.request(intentFor('c4', { invocation: invocation('c4', 'always'), lifetimes: ['once'] }));
    expect(controller.current()?.invocation.callId).toBe('c4');
    controller.cancel();
    await expect(floor).resolves.toMatchObject({ kind: 'cancelled' });
  });

  it('never covers elevated or foreign-round invocations and consumes each cover once', async () => {
    const controller = createNativePermissionIntentController();
    const first = controller.request(intentFor('c2'));
    controller.chooseRound();
    await first;
    const elevated = controller.request(intentFor('c3', { invocation: invocation('c3', 'confirm', true), lifetimes: ['once'] }));
    expect(controller.current()?.invocation.callId).toBe('c3');
    controller.choose('once');
    await expect(elevated).resolves.toEqual({ kind: 'selected', lifetime: 'once' });
    const other = controller.request(intentFor('c3', { round: { ...round, key: 'i:1:2' } }));
    expect(controller.current()?.invocation.callId).toBe('c3');
    controller.cancel();
    await other;
  });

  it('chooseRound is refused when nothing else in the round is coverable', () => {
    const controller = createNativePermissionIntentController();
    void controller.request(intentFor('c2', { round: { key: 'k', items: [round.items[1]!] } }));
    expect(controller.chooseRound()).toBe(false);
    expect(controller.current()).not.toBeNull();
    controller.cancel();
  });
});

describe('7111 — NativePermissionIntentCard round rendering', () => {
  it.each(['en', 'tr'] as const)('lists every proposed call with scope/risk and offers key 4 in %s', async (lang) => {
    const controller = createNativePermissionIntentController();
    const labels = buildNativePermissionIntentLabels((key) => getMessage(key, lang));
    const pending = controller.request(intentFor('c2'));
    const view = render(<NativePermissionIntentCard intent={controller.current()} controller={controller} labels={labels} isActive />);
    try {
      const frame = view.lastFrame() ?? '';
      expect(frame).toContain(labels.roundTitle.replace('{count}', '4'));
      expect(frame).toContain(labels.roundItemAuto);
      expect(frame).toContain(labels.roundItemCurrent);
      expect(frame).toContain(labels.roundItemCovered);
      expect(frame).toContain(labels.roundItemFloor);
      expect(frame).toContain(labels.scope['file-read']);
      expect(frame).toContain(labels.risk['high']);
      expect(frame).toContain(`4  ${labels.round}`);
      expect(frame).toContain(labels.cancelRound);
      view.stdin.write('4');
      await expect(pending).resolves.toEqual({ kind: 'selected', lifetime: 'once' });
    } finally { view.unmount(); }
  });

  it('collapses rows past the bound and hides key 4 when nothing else is coverable', () => {
    const labels = buildNativePermissionIntentLabels((key) => getMessage(key, 'en'));
    const many: NativePermissionRound = { key: 'k', items: Array.from({ length: 15 }, (_, i) => ({ ...round.items[1]!, callId: `x${i}` })) };
    const rows = buildNativePermissionRoundRows(intentFor('x0', { invocation: invocation('x0'), round: many }), labels);
    expect(rows).toHaveLength(1 + 12 + 1);
    expect(rows[rows.length - 1]).toBe(labels.roundMore.replace('{n}', '3'));
    const controller = createNativePermissionIntentController();
    void controller.request(intentFor('c2', { round: { key: 'k', items: [round.items[1]!] } }));
    const view = render(<NativePermissionIntentCard intent={controller.current()} controller={controller} labels={labels} isActive />);
    try {
      expect(view.lastFrame()).not.toContain(`4  ${labels.round}`);
      expect(view.lastFrame()).toContain(labels.cancel);
    } finally { view.unmount(); controller.cancel(); }
  });
});

describe('7111 — bridge helpers', () => {
  it('read-only marker fires exactly once per silent read and never for asked/denied calls', () => {
    const marker = createReadOnlyToolMarker();
    marker.observeAutoDecision({ tool: 'deckent_bash', resourceClass: 'safe-read', decision: 'allow' });
    marker.observeExecuting({ id: 'c1', tool: 'deckent_bash' });
    expect(marker.consumeResult({ id: 'c1', tool: 'deckent_bash' })).toBe(true);
    expect(marker.consumeResult({ id: 'c1', tool: 'deckent_bash' })).toBe(false);
    marker.observeAutoDecision({ tool: 'deckent_read_file', resourceClass: 'non-shell', decision: 'allow' });
    marker.observeExecuting({ id: 'c2', tool: 'deckent_read_file' });
    expect(marker.consumeResult({ id: 'c2', tool: 'deckent_read_file' })).toBe(false);
    marker.observeAutoDecision({ tool: 'deckent_bash', resourceClass: 'safe-read', decision: 'deny' });
    marker.observeExecuting({ id: 'c3', tool: 'deckent_bash' });
    expect(marker.consumeResult({ id: 'c3', tool: 'deckent_bash' })).toBe(false);
    // An asked call (no auto-decision) never carries the marker.
    marker.observeExecuting({ id: 'c4', tool: 'deckent_bash' });
    expect(marker.consumeResult({ id: 'c4', tool: 'deckent_bash' })).toBe(false);
  });

  it('projects a round with engine-parity tiers and keys it per session/turn/round', () => {
    const registry = new ToolRegistry();
    registry.register({ name: 'deckent_bash', description: 'b', inputSchema: {}, category: 'coding', tier: 'confirm', source: 'builtin', approval: nativeBuiltinApprovalClassifier('deckent_bash', { cwd: () => '/srv/p', platform: 'linux' }), handler: async () => ({ ok: true, output: '' }) });
    registry.register({ name: 'deckent_write_file', description: 'w', inputSchema: {}, category: 'coding', tier: 'confirm', source: 'builtin', approval: nativeBuiltinApprovalClassifier('deckent_write_file'), handler: async () => ({ ok: true, output: '' }) });
    registry.register({ name: 'deckent_read_file', description: 'r', inputSchema: {}, category: 'coding', tier: 'silent', source: 'builtin', handler: async () => ({ ok: true, output: '' }) });
    const deps = {
      registry, policy: SAFE_DEFAULT_POLICY, cwd: '/srv/p', platform: 'linux' as const,
      ruleStore: { activeRules: () => [], activeDenies: () => [{ tool: 'deckent_write_file', pattern: 'locked/**' }] },
      getMode: () => 'suggest' as const,
    };
    expect(projectNativePermissionRoundItem(deps, { id: 'a', tool: 'deckent_bash', args: { cmd: "sed -n '1p' x.md" } })).toEqual({ callId: 'a', tool: 'deckent_bash', resource: "sed -n '1p' x.md", scope: 'file-read', risk: 'none', projection: 'auto' });
    expect(projectNativePermissionRoundItem(deps, { id: 'b', tool: 'deckent_bash', args: { cmd: 'npm test' } })).toMatchObject({ scope: 'shell-exec', risk: 'medium', projection: 'confirm' });
    expect(projectNativePermissionRoundItem(deps, { id: 'c', tool: 'deckent_bash', args: { cmd: 'rm -rf build' } })).toMatchObject({ projection: 'floor' });
    expect(projectNativePermissionRoundItem(deps, { id: 'd', tool: 'deckent_write_file', args: { path: 'locked/a.ts' } })).toMatchObject({ scope: 'file-write', projection: 'denied' });
    expect(projectNativePermissionRoundItem(deps, { id: 'e', tool: 'deckent_read_file', args: { path: 'a.ts' } })).toMatchObject({ scope: 'unclassified', projection: 'auto' });
    expect(projectNativePermissionRoundItem(deps, { id: 'f', tool: 'nope', args: {} })).toBeNull();
    expect(projectNativePermissionRoundItem(deps, { id: 'g', tool: 'deckent_bash', args: { cmd: 'curl -H "Authorization: Bearer sk-abcdefghijklmnop" x' } })?.resource).not.toContain('sk-abcdefghijklmnop');

    const tracker = createNativePermissionRoundTracker(deps);
    tracker.observeProposed({ id: 'a', tool: 'deckent_bash', args: { cmd: 'wc -l x' } });
    tracker.observeProposed({ id: 'b', tool: 'deckent_bash', args: { cmd: 'npm test' } });
    tracker.observeExecution();
    expect(tracker.roundFor('i', 1, 'b')).toEqual({ key: 'i:1:1', items: [expect.objectContaining({ callId: 'a' }), expect.objectContaining({ callId: 'b' })] });
    expect(tracker.roundFor('i', 1, 'zzz')).toBeUndefined();
    tracker.observeProposed({ id: 'c', tool: 'deckent_bash', args: { cmd: 'npm run build' } });
    expect(tracker.roundFor('i', 1, 'c')).toEqual({ key: 'i:1:2', items: [expect.objectContaining({ callId: 'c' })] });
    expect(tracker.roundFor('i', 1, 'a')).toBeUndefined();
  });
});
