// ─── Notification Config Validation ─────────────────────────────────
import type { NotificationConfig, NotificationEventType } from './notifications.js';

const VALID_EVENT_TYPES: readonly NotificationEventType[] = [
  'sprint_complete',
  'sprint_failed',
  'task_nogo',
  'usage_warning',
] as const;

const DEFAULT_EVENTS: NotificationEventType[] = ['sprint_complete', 'sprint_failed'];

// ─── URL Validation ─────────────────────────────────────────────────

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Validate Notification Config ───────────────────────────────────

export function validateNotificationConfig(config: NotificationConfig): string[] {
  const errors: string[] = [];

  if (config.terminal !== undefined && typeof config.terminal !== 'boolean') {
    errors.push('notifications.terminal must be a boolean');
  }

  if (config.webhook !== undefined) {
    if (typeof config.webhook !== 'string') {
      errors.push('notifications.webhook must be a string URL');
    } else if (!isValidUrl(config.webhook)) {
      errors.push(`notifications.webhook is not a valid HTTP/HTTPS URL: "${config.webhook}"`);
    }
  }

  if (config.discord !== undefined) {
    if (typeof config.discord !== 'string') {
      errors.push('notifications.discord must be a string URL');
    } else if (!isValidUrl(config.discord)) {
      errors.push(`notifications.discord is not a valid HTTP/HTTPS URL: "${config.discord}"`);
    }
  }

  if (config.slack !== undefined) {
    if (typeof config.slack !== 'string') {
      errors.push('notifications.slack must be a string URL');
    } else if (!isValidUrl(config.slack)) {
      errors.push(`notifications.slack is not a valid HTTP/HTTPS URL: "${config.slack}"`);
    }
  }

  if (config.events !== undefined) {
    if (!Array.isArray(config.events)) {
      errors.push('notifications.events must be an array');
    } else {
      for (const evt of config.events) {
        if (!(VALID_EVENT_TYPES as readonly string[]).includes(evt)) {
          errors.push(`notifications.events contains invalid type: "${evt}". Must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
        }
      }
    }
  }

  return errors;
}

// ─── Defaults ───────────────────────────────────────────────────────

export function getDefaultNotificationConfig(): NotificationConfig {
  return {
    terminal: true,
    events: [...DEFAULT_EVENTS],
  };
}

// ─── Resolve ────────────────────────────────────────────────────────

export function resolveNotificationConfig(config?: NotificationConfig): NotificationConfig {
  if (!config) {
    return getDefaultNotificationConfig();
  }

  return {
    terminal: config.terminal ?? true,
    webhook: config.webhook,
    discord: config.discord,
    slack: config.slack,
    events: config.events ?? [...DEFAULT_EVENTS],
  };
}
