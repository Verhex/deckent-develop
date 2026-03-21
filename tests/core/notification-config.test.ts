import { describe, it, expect } from 'vitest';
import {
  validateNotificationConfig,
  getDefaultNotificationConfig,
  resolveNotificationConfig,
  isValidUrl,
} from '../../src/core/notification-config.js';
import type { NotificationConfig } from '../../src/core/notifications.js';

// ─── isValidUrl ─────────────────────────────────────────────────────

describe('isValidUrl', () => {
  it('accepts https URLs', () => {
    expect(isValidUrl('https://example.com/hook')).toBe(true);
  });

  it('accepts http URLs', () => {
    expect(isValidUrl('http://localhost:3000/webhook')).toBe(true);
  });

  it('rejects ftp URLs', () => {
    expect(isValidUrl('ftp://example.com/file')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  it('rejects URLs without protocol', () => {
    expect(isValidUrl('example.com')).toBe(false);
  });
});

// ─── validateNotificationConfig ─────────────────────────────────────

describe('validateNotificationConfig', () => {
  it('returns empty array for valid config', () => {
    const config: NotificationConfig = {
      terminal: true,
      webhook: 'https://example.com/hook',
      events: ['sprint_complete'],
    };
    expect(validateNotificationConfig(config)).toEqual([]);
  });

  it('returns empty array for minimal config', () => {
    expect(validateNotificationConfig({})).toEqual([]);
  });

  it('rejects non-boolean terminal', () => {
    const errors = validateNotificationConfig({ terminal: 'yes' as unknown as boolean });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('terminal');
  });

  it('rejects invalid webhook URL', () => {
    const errors = validateNotificationConfig({ webhook: 'not-a-url' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('webhook');
  });

  it('rejects non-string webhook', () => {
    const errors = validateNotificationConfig({ webhook: 123 as unknown as string });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('webhook');
  });

  it('rejects invalid discord URL', () => {
    const errors = validateNotificationConfig({ discord: 'bad-url' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('discord');
  });

  it('rejects non-string discord', () => {
    const errors = validateNotificationConfig({ discord: 42 as unknown as string });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('discord');
  });

  it('rejects invalid slack URL', () => {
    const errors = validateNotificationConfig({ slack: 'bad' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('slack');
  });

  it('rejects non-string slack', () => {
    const errors = validateNotificationConfig({ slack: false as unknown as string });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('slack');
  });

  it('rejects invalid event type', () => {
    const errors = validateNotificationConfig({ events: ['sprint_complete', 'invalid_type' as unknown as 'sprint_complete'] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('invalid_type');
  });

  it('rejects non-array events', () => {
    const errors = validateNotificationConfig({ events: 'sprint_complete' as unknown as [] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('events');
  });

  it('accumulates multiple errors', () => {
    const errors = validateNotificationConfig({
      terminal: 'x' as unknown as boolean,
      webhook: 'bad',
      discord: 'bad',
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── getDefaultNotificationConfig ───────────────────────────────────

describe('getDefaultNotificationConfig', () => {
  it('returns terminal true by default', () => {
    const config = getDefaultNotificationConfig();
    expect(config.terminal).toBe(true);
  });

  it('returns default events', () => {
    const config = getDefaultNotificationConfig();
    expect(config.events).toEqual(['sprint_complete', 'sprint_failed']);
  });

  it('does not include webhook by default', () => {
    const config = getDefaultNotificationConfig();
    expect(config.webhook).toBeUndefined();
  });
});

// ─── resolveNotificationConfig ──────────────────────────────────────

describe('resolveNotificationConfig', () => {
  it('returns defaults when config is undefined', () => {
    const resolved = resolveNotificationConfig(undefined);
    expect(resolved.terminal).toBe(true);
    expect(resolved.events).toEqual(['sprint_complete', 'sprint_failed']);
  });

  it('preserves webhook from config', () => {
    const resolved = resolveNotificationConfig({ webhook: 'https://example.com/hook' });
    expect(resolved.webhook).toBe('https://example.com/hook');
  });

  it('fills in defaults for missing fields', () => {
    const resolved = resolveNotificationConfig({ discord: 'https://discord.com/hook' });
    expect(resolved.terminal).toBe(true);
    expect(resolved.events).toEqual(['sprint_complete', 'sprint_failed']);
    expect(resolved.discord).toBe('https://discord.com/hook');
  });

  it('respects terminal: false', () => {
    const resolved = resolveNotificationConfig({ terminal: false });
    expect(resolved.terminal).toBe(false);
  });

  it('respects custom events list', () => {
    const resolved = resolveNotificationConfig({ events: ['task_nogo'] });
    expect(resolved.events).toEqual(['task_nogo']);
  });
});
