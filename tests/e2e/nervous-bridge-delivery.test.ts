// ═══ Nervous Bridge Delivery E2E ═══════════════════════════════════════════
// Sprint 151 Task 009
//
// Tests the bridge between NervousDispatcher and DECKENT→USER:NOTIFY pipeline.
// When NervousDispatcher.dispatch() fires, it calls bridgeToUserNotify() which:
//   1. Maps NervousNotification severity → NotificationEventName
//   2. Fires notify() → eventBus emit + global NotifyDispatcher
//
// Severity → EventName mapping:
//   critical + actions  → 'human-checkpoint-required' (critical priority)
//   critical - actions  → 'task-no-go' (warning priority)
//   warning             → 'task-no-go'
//   info                → 'task-done'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { NervousDispatcher, type ChannelAdapter } from '../../src/nervous/dispatcher.js';
import type {
  NervousNotification,
  NervousSystemConfig,
  Severity,
  NotificationAction,
} from '../../src/core/nervous-types.js';
import {
  NotifyDispatcher,
  type Notification,
  type NotificationAdapter,
} from '../../src/core/notification-dispatcher.js';
import {
  setGlobalNotifyDispatcher,
  clearGlobalNotifyDispatcher,
} from '../../src/core/notify-registry.js';
import { eventBus } from '../../src/orchestra/event-bus.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeRoot(): string {
  const root = join(
    tmpdir(),
    `deckent-e2e-bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

function cleanupRoot(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function makeConfig(overrides: Partial<NervousSystemConfig> = {}): NervousSystemConfig {
  return {
    mode: 'balanced',
    enabled: true,
    ...overrides,
  };
}

function makeNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: randomUUID(),
    type: 'test-detector',
    title: 'Test notification',
    message: 'Test message body',
    severity: 'critical',
    createdAt: new Date().toISOString(),
    detectorId: 'test-detector-001',
    actions: [],
    timeoutMs: null,
    sprintId: 'sprint-151',
    ...overrides,
  };
}

function makeAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return {
    id: 'action-kill-sprint',
    label: 'Kill Sprint',
    policy: 'approve',
    risk: 'high',
    isSafetyFloor: true,
    ...overrides,
  };
}

function createMockChannelAdapter(): ChannelAdapter & { notifications: NervousNotification[] } {
  const notifications: NervousNotification[] = [];
  return {
    notifications,
    push: async (n: NervousNotification) => {
      notifications.push(n);
      return true;
    },
  };
}

function createMockNotifyAdapter(): NotificationAdapter & { sent: Notification[] } {
  const sent: Notification[] = [];
  return {
    name: 'bridge-test-adapter',
    isAvailable: () => true,
    send: async (n: Notification) => {
      sent.push(n);
    },
    sent,
  };
}

type EventBusPayload = {
  type: string;
  source: string;
  target: string;
  channel: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('Nervous Bridge Delivery E2E', () => {
  let root: string;
  let notifyDispatcher: NotifyDispatcher;
  let notifyAdapter: ReturnType<typeof createMockNotifyAdapter>;
  let fileAdapter: ReturnType<typeof createMockChannelAdapter>;
  let busEvents: EventBusPayload[];
  let busListener: (data: EventBusPayload) => void;

  beforeEach(() => {
    root = makeRoot();

    // Setup global NotifyDispatcher (target of bridgeToUserNotify)
    notifyDispatcher = new NotifyDispatcher(0); // 0ms throttle for tests
    notifyAdapter = createMockNotifyAdapter();
    notifyDispatcher.addAdapter(notifyAdapter);
    setGlobalNotifyDispatcher(notifyDispatcher);

    // Setup nervous channel adapters
    fileAdapter = createMockChannelAdapter();

    // Capture eventBus emissions
    busEvents = [];
    busListener = (data: EventBusPayload) => {
      if (data.channel === 'DECKENT→USER:NOTIFY') {
        busEvents.push(data);
      }
    };
    eventBus.on('deckent-event', busListener);
  });

  afterEach(() => {
    clearGlobalNotifyDispatcher();
    eventBus.removeListener('deckent-event', busListener);
    cleanupRoot(root);
    vi.restoreAllMocks();
  });

  // ─── Core Bridge: NervousDispatcher → DECKENT→USER:NOTIFY ──────────

  it('bridges critical+actions notification as human-checkpoint-required', async () => {
    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({
      severity: 'critical',
      actions: [makeAction()],
      title: 'Kill komutu bekliyor',
      message: 'Alperen onayi gerekli',
    });

    await nervousDispatcher.dispatch(notification);

    // Allow microtask for notify() promise
    await new Promise((r) => setTimeout(r, 50));

    // eventBus should have received DECKENT→USER:NOTIFY
    expect(busEvents.length).toBeGreaterThanOrEqual(1);
    const busEvent = busEvents[0];
    expect(busEvent.channel).toBe('DECKENT→USER:NOTIFY');
    expect(busEvent.payload.event).toBe('human-checkpoint-required');
    expect(busEvent.payload.priority).toBe('critical');

    // Global NotifyDispatcher adapter should have received it
    expect(notifyAdapter.sent.length).toBeGreaterThanOrEqual(1);
    expect(notifyAdapter.sent[0].event).toBe('human-checkpoint-required');
    expect(notifyAdapter.sent[0].priority).toBe('critical');
    expect(notifyAdapter.sent[0].title).toContain('[Nervous]');
  });

  it('bridges critical without actions as task-no-go', async () => {
    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({
      severity: 'critical',
      actions: [], // no actions
      title: 'Stale worker detected',
    });

    await nervousDispatcher.dispatch(notification);
    await new Promise((r) => setTimeout(r, 50));

    expect(busEvents.length).toBeGreaterThanOrEqual(1);
    expect(busEvents[0].payload.event).toBe('task-no-go');

    expect(notifyAdapter.sent.length).toBeGreaterThanOrEqual(1);
    expect(notifyAdapter.sent[0].event).toBe('task-no-go');
    expect(notifyAdapter.sent[0].priority).toBe('warning');
  });

  it('bridges warning severity as task-no-go', async () => {
    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({
      severity: 'warning',
      actions: [],
      title: 'Debt trend increasing',
    });

    await nervousDispatcher.dispatch(notification);
    await new Promise((r) => setTimeout(r, 50));

    expect(busEvents.length).toBeGreaterThanOrEqual(1);
    expect(busEvents[0].payload.event).toBe('task-no-go');

    expect(notifyAdapter.sent.length).toBeGreaterThanOrEqual(1);
    expect(notifyAdapter.sent[0].event).toBe('task-no-go');
    expect(notifyAdapter.sent[0].priority).toBe('warning');
  });

  it('bridges info severity as task-done', async () => {
    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({
      severity: 'info',
      actions: [],
      title: 'Routine check passed',
    });

    await nervousDispatcher.dispatch(notification);
    await new Promise((r) => setTimeout(r, 50));

    expect(busEvents.length).toBeGreaterThanOrEqual(1);
    expect(busEvents[0].payload.event).toBe('task-done');

    expect(notifyAdapter.sent.length).toBeGreaterThanOrEqual(1);
    expect(notifyAdapter.sent[0].event).toBe('task-done');
    expect(notifyAdapter.sent[0].priority).toBe('info');
  });

  it('bridges emergency+actions as human-checkpoint-required', async () => {
    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({
      severity: 'emergency' as Severity,
      actions: [makeAction({ id: 'action-emergency', label: 'Emergency Stop' })],
      title: 'Cost cap exceeded',
    });

    await nervousDispatcher.dispatch(notification);
    await new Promise((r) => setTimeout(r, 50));

    expect(busEvents.length).toBeGreaterThanOrEqual(1);
    expect(busEvents[0].payload.event).toBe('human-checkpoint-required');
    expect(busEvents[0].payload.priority).toBe('critical');
  });

  // ─── Cross-channel dedup ────────────────────────────────────────────

  it('deduplicates same notification ID (bridge fires only once)', async () => {
    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({ severity: 'critical', actions: [makeAction()] });

    // Dispatch same notification twice
    await nervousDispatcher.dispatch(notification);
    await nervousDispatcher.dispatch(notification);
    await new Promise((r) => setTimeout(r, 50));

    // Bridge should fire only once (dedup by notification.id)
    expect(busEvents).toHaveLength(1);
    expect(notifyAdapter.sent).toHaveLength(1);
  });

  // ─── Fail-safe: bridge errors don't crash dispatch ──────────────────

  it('nervous dispatch does not crash when global NotifyDispatcher is null', async () => {
    clearGlobalNotifyDispatcher(); // simulate CLI-only runtime

    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({ severity: 'critical', actions: [] });

    // Should not throw — fail-safe bridge
    const result = await nervousDispatcher.dispatch(notification);
    await new Promise((r) => setTimeout(r, 50));

    // File adapter still receives (always active)
    expect(fileAdapter.notifications).toHaveLength(1);
    // Dispatch completed (channels array includes at least 'file')
    expect(result.channels).toContain('file');

    // eventBus still receives (notify() emits regardless of dispatcher)
    expect(busEvents.length).toBeGreaterThanOrEqual(1);

    // No NotifyDispatcher delivery (adapter.sent stays empty since dispatcher is null)
    expect(notifyAdapter.sent).toHaveLength(0);
  });

  // ─── Title prefix ──────────────────────────────────────────────────

  it('prepends [Nervous] prefix to title in bridge notification', async () => {
    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({
      severity: 'warning',
      title: 'Scope collision detected',
    });

    await nervousDispatcher.dispatch(notification);
    await new Promise((r) => setTimeout(r, 50));

    expect(notifyAdapter.sent.length).toBeGreaterThanOrEqual(1);
    expect(notifyAdapter.sent[0].title).toBe('[Nervous] Scope collision detected');
  });

  // ─── SprintId passthrough ──────────────────────────────────────────

  it('passes sprintId from NervousNotification to bridge notification', async () => {
    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({
      severity: 'info',
      sprintId: 'sprint-151',
    });

    await nervousDispatcher.dispatch(notification);
    await new Promise((r) => setTimeout(r, 50));

    expect(notifyAdapter.sent.length).toBeGreaterThanOrEqual(1);
    expect(notifyAdapter.sent[0].sprintId).toBe('sprint-151');
  });

  it('uses "unknown" sprintId when NervousNotification has no sprintId', async () => {
    const nervousDispatcher = new NervousDispatcher(makeConfig(), root, {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification = makeNotification({
      severity: 'info',
      sprintId: undefined,
    });

    await nervousDispatcher.dispatch(notification);
    await new Promise((r) => setTimeout(r, 50));

    expect(notifyAdapter.sent.length).toBeGreaterThanOrEqual(1);
    expect(notifyAdapter.sent[0].sprintId).toBe('unknown');
  });
});
