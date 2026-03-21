import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelemetryCollector } from '../../src/core/telemetry.js';
import type { TelemetryEvent } from '../../src/core/telemetry.js';

describe('TelemetryCollector', () => {
  let collector: TelemetryCollector;

  beforeEach(() => {
    collector = new TelemetryCollector();
  });

  it('is disabled by default', () => {
    expect(collector.isEnabled()).toBe(false);
  });

  it('can be created with enabled=true', () => {
    const c = new TelemetryCollector(true);
    expect(c.isEnabled()).toBe(true);
  });

  it('enable() sets enabled to true', () => {
    collector.enable();
    expect(collector.isEnabled()).toBe(true);
  });

  it('disable() sets enabled to false and clears events', () => {
    collector.enable();
    collector.record('test_event');
    expect(collector.getEvents().length).toBe(1);
    collector.disable();
    expect(collector.isEnabled()).toBe(false);
    expect(collector.getEvents().length).toBe(0);
  });

  it('record() does nothing when disabled', () => {
    collector.record('test_event', { key: 'value' });
    expect(collector.getEvents().length).toBe(0);
  });

  it('record() adds event when enabled', () => {
    collector.enable();
    collector.record('sprint_start', { taskCount: 5 });
    const events = collector.getEvents();
    expect(events.length).toBe(1);
    expect(events[0].event).toBe('sprint_start');
    expect(events[0].properties.taskCount).toBe(5);
  });

  it('record() adds ISO timestamp', () => {
    collector.enable();
    collector.record('test');
    const events = collector.getEvents();
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('flush() returns events and clears internal list', () => {
    collector.enable();
    collector.record('a');
    collector.record('b');
    const flushed = collector.flush();
    expect(flushed.length).toBe(2);
    expect(collector.getEvents().length).toBe(0);
  });

  it('sanitize strips email-like values', () => {
    collector.enable();
    collector.record('test', { email: 'user@example.com', safe: 'hello' });
    const events = collector.getEvents();
    expect(events[0].properties.email).toBeUndefined();
    expect(events[0].properties.safe).toBe('hello');
  });

  it('sanitize strips /home/ paths', () => {
    collector.enable();
    collector.record('test', { path: '/home/user/project', count: 3 });
    const events = collector.getEvents();
    expect(events[0].properties.path).toBeUndefined();
    expect(events[0].properties.count).toBe(3);
  });

  it('sanitize strips /Users/ paths', () => {
    collector.enable();
    collector.record('test', { path: '/Users/alice/code', ok: true });
    const events = collector.getEvents();
    expect(events[0].properties.path).toBeUndefined();
    expect(events[0].properties.ok).toBe(true);
  });

  it('preserves number and boolean properties', () => {
    collector.enable();
    collector.record('test', { count: 42, flag: false, name: 'safe' });
    const props = collector.getEvents()[0].properties;
    expect(props.count).toBe(42);
    expect(props.flag).toBe(false);
    expect(props.name).toBe('safe');
  });

  it('getEvents() returns readonly array', () => {
    collector.enable();
    collector.record('x');
    const events = collector.getEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  it('record() with empty properties works', () => {
    collector.enable();
    collector.record('empty');
    expect(collector.getEvents()[0].properties).toEqual({});
  });
});
