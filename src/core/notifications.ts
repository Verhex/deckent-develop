// ─── Notification Types — shared event / config / provider contracts ──
// Consumed by notification-providers/{webhook,slack,discord}.ts and
// notify-adapters/webhook-adapter.ts. The legacy NotificationDispatcher
// class was removed (R4 — superseded by the canonical NotifyDispatcher in
// notification-dispatcher.ts + notify-adapters); only the shared types
// remain here.
import type { NotificationEventName } from './notification-dispatcher.js';

export type NotificationEventType =
  | 'sprint_complete'
  | 'sprint_failed'
  | 'task_nogo'
  | 'usage_warning'
  // R4 consolidation (B11 webhook WIRE): the canonical DECKENT→USER:NOTIFY event
  // vocabulary (notification-dispatcher.ts) is accepted too, so the webhook
  // adapter forwards the real event name losslessly instead of a coarse bucket.
  | NotificationEventName;

export interface NotificationEvent {
  type: NotificationEventType;
  summary: string;
  details?: string;
}

export interface NotificationConfig {
  terminal?: boolean;
  webhook?: string;
  discord?: string;
  slack?: string;
  events?: NotificationEventType[];
}

export interface NotificationProvider {
  send(url: string, event: NotificationEvent): Promise<void>;
}
