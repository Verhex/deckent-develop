// F-2 — `deckent do` planning heartbeat: the propose/plan phase is a real LLM
// round-trip; this pins the visible-wait contract (initial notice naming the
// governing timeout, elapsed ticks, clean stop). Hermetic: injected io + fake
// timers — no stderr writes, no real clock.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { startPlanningHeartbeat } from '../../../src/cli/commands/do.js';

describe('startPlanningHeartbeat (F-2)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prints the initial notice naming the governing timeout in minutes + the config knob', () => {
    vi.useFakeTimers();
    const out: string[] = [];
    const stop = startPlanningHeartbeat('en', 900_000, { write: (s) => { out.push(s); }, isTTY: false });
    expect(out.join('')).toContain('15 min');
    expect(out.join('')).toContain('brain_plan_timeout_ms');
    stop();
  });

  it('non-TTY: emits a full elapsed line every 30s and never ticks after stop()', () => {
    vi.useFakeTimers();
    const out: string[] = [];
    const stop = startPlanningHeartbeat('en', 60_000, { write: (s) => { out.push(s); }, isTTY: false });

    vi.advanceTimersByTime(61_000);
    const ticks = out.filter((s) => s.includes('Planning…'));
    expect(ticks).toHaveLength(2); // 30s + 60s
    expect(ticks[1]).toContain('60s');

    stop();
    vi.advanceTimersByTime(120_000);
    expect(out.filter((s) => s.includes('Planning…'))).toHaveLength(2);
  });

  it('TTY: refreshes one line in place every 5s and erases it on stop()', () => {
    vi.useFakeTimers();
    const out: string[] = [];
    const stop = startPlanningHeartbeat('tr', 900_000, { write: (s) => { out.push(s); }, isTTY: true });

    vi.advanceTimersByTime(10_000);
    const ticks = out.filter((s) => s.includes('Planlanıyor'));
    expect(ticks).toHaveLength(2);
    expect(ticks[0]!.startsWith('\r')).toBe(true); // in-place refresh, not a new line

    stop();
    expect(out[out.length - 1]).toBe('\r\x1b[2K'); // the ticker line is erased
  });
});
