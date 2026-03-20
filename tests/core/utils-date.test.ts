import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDate, formatDuration, formatRelativeTime } from '../../src/core/utils.js';

describe('formatDate', () => {
  it('formats a Date object in English', () => {
    const d = new Date('2026-03-20T00:00:00.000Z');
    const result = formatDate(d, 'en');
    expect(result).toMatch(/March/);
    expect(result).toMatch(/2026/);
  });

  it('formats an ISO string in English', () => {
    const result = formatDate('2026-01-15T00:00:00.000Z', 'en');
    expect(result).toMatch(/2026/);
  });

  it('formats a Date object in Turkish', () => {
    const d = new Date('2026-03-20T00:00:00.000Z');
    const result = formatDate(d, 'tr');
    // Turkish locale uses "Mart" for March
    expect(result).toMatch(/2026/);
  });

  it('falls back to English for unknown lang', () => {
    const d = new Date('2026-06-01T00:00:00.000Z');
    const result = formatDate(d, 'xx');
    expect(result).toMatch(/2026/);
  });
});

describe('formatDuration', () => {
  it('formats seconds in English', () => {
    expect(formatDuration(5000, 'en')).toBe('5 seconds');
  });

  it('formats 1 second in English (singular)', () => {
    expect(formatDuration(1000, 'en')).toBe('1 second');
  });

  it('formats minutes in English', () => {
    expect(formatDuration(300_000, 'en')).toBe('5 minutes');
  });

  it('formats hours in English', () => {
    expect(formatDuration(7_200_000, 'en')).toBe('2 hours');
  });

  it('formats days in English', () => {
    expect(formatDuration(172_800_000, 'en')).toBe('2 days');
  });

  it('formats seconds in Turkish', () => {
    expect(formatDuration(5000, 'tr')).toBe('5 saniye');
  });

  it('formats minutes in Turkish', () => {
    expect(formatDuration(300_000, 'tr')).toBe('5 dakika');
  });

  it('formats hours in Turkish', () => {
    expect(formatDuration(3_600_000, 'tr')).toBe('1 saat');
  });

  it('formats days in Turkish', () => {
    expect(formatDuration(86_400_000, 'tr')).toBe('1 gün');
  });

  it('returns zero for 0ms in English', () => {
    expect(formatDuration(0, 'en')).toBe('0 seconds');
  });

  it('returns zero for 0ms in Turkish', () => {
    expect(formatDuration(0, 'tr')).toBe('0 saniye');
  });

  it('handles negative ms as 0', () => {
    expect(formatDuration(-5000, 'en')).toBe('0 seconds');
  });

  it('prioritises larger units — 1 minute over 60 seconds', () => {
    expect(formatDuration(60_000, 'en')).toBe('1 minute');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats past time in English', () => {
    const past = new Date('2026-03-20T11:59:55.000Z'); // 5 seconds ago
    expect(formatRelativeTime(past, 'en')).toBe('5 seconds ago');
  });

  it('formats past time in Turkish', () => {
    const past = new Date('2026-03-20T11:59:55.000Z'); // 5 saniye önce
    expect(formatRelativeTime(past, 'tr')).toBe('5 saniye önce');
  });

  it('formats future time in English', () => {
    const future = new Date('2026-03-20T12:01:00.000Z'); // 1 minute from now
    expect(formatRelativeTime(future, 'en')).toBe('in 1 minute');
  });

  it('formats future time in Turkish', () => {
    const future = new Date('2026-03-20T12:01:00.000Z'); // 1 dakika sonra
    expect(formatRelativeTime(future, 'tr')).toBe('1 dakika sonra');
  });

  it('formats 0 diff as 0 seconds ago', () => {
    const now = new Date('2026-03-20T12:00:00.000Z');
    expect(formatRelativeTime(now, 'en')).toBe('0 seconds ago');
  });

  it('formats hours ago in English', () => {
    const past = new Date('2026-03-20T10:00:00.000Z'); // 2 hours ago
    expect(formatRelativeTime(past, 'en')).toBe('2 hours ago');
  });

  it('formats hours in Turkish past', () => {
    const past = new Date('2026-03-20T11:00:00.000Z'); // 1 hour ago
    expect(formatRelativeTime(past, 'tr')).toBe('1 saat önce');
  });

  it('formats days ago in English', () => {
    const past = new Date('2026-03-18T12:00:00.000Z'); // 2 days ago
    expect(formatRelativeTime(past, 'en')).toBe('2 days ago');
  });
});
