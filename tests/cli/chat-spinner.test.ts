import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSpinner } from '../../src/cli/commands/chat-spinner.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeFakeTTY(): NodeJS.WriteStream & { written: string[] } {
  const written: string[] = [];
  return {
    isTTY: true,
    write(chunk: string | Uint8Array) {
      written.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    },
    written,
  } as unknown as NodeJS.WriteStream & { written: string[] };
}

function makeFakePipe(): NodeJS.WriteStream & { written: string[] } {
  const written: string[] = [];
  return {
    isTTY: false,
    write(chunk: string | Uint8Array) {
      written.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    },
    written,
  } as unknown as NodeJS.WriteStream & { written: string[] };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('createSpinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() immediately writes first frame to stderr', () => {
    const stream = makeFakeTTY();
    const spinner = createSpinner('düşünüyor…', stream);
    spinner.start();

    expect(stream.written.length).toBeGreaterThanOrEqual(1);
    expect(stream.written[0]).toMatch(/^[\r]/);
    expect(stream.written[0]).toContain('düşünüyor…');
  });

  it('advances frames on interval ticks', () => {
    const stream = makeFakeTTY();
    const spinner = createSpinner('loading', stream);
    spinner.start();
    const after0 = stream.written.length;

    vi.advanceTimersByTime(80);
    const after1 = stream.written.length;

    vi.advanceTimersByTime(80 * 4);
    const after5 = stream.written.length;

    expect(after1).toBeGreaterThan(after0);
    expect(after5).toBeGreaterThan(after1);
  });

  it('stop() clears line and stops further writes', () => {
    const stream = makeFakeTTY();
    const spinner = createSpinner('wait', stream);
    spinner.start();
    vi.advanceTimersByTime(80 * 3);

    const beforeStop = stream.written.length;
    spinner.stop();

    const clearWrite = stream.written[stream.written.length - 1];
    expect(clearWrite).toMatch(/^\r\s+\r$/);

    vi.advanceTimersByTime(80 * 5);
    expect(stream.written.length).toBe(beforeStop + 1);
  });

  it('TTY=false (pipe) → no-op: nothing written on start/stop', () => {
    const stream = makeFakePipe();
    const spinner = createSpinner('test', stream);
    spinner.start();
    vi.advanceTimersByTime(80 * 10);
    spinner.stop();

    expect(stream.written.length).toBe(0);
  });

  it('stop on first chunk: stop() called immediately after start() works', () => {
    const stream = makeFakeTTY();
    const spinner = createSpinner('streaming', stream);
    spinner.start();

    const framesBeforeStop = stream.written.length;
    spinner.stop();

    vi.advanceTimersByTime(80 * 5);
    expect(stream.written.length).toBe(framesBeforeStop + 1);

    const last = stream.written[stream.written.length - 1];
    expect(last).toMatch(/^\r\s+\r$/);
  });

  it('calling start() twice is idempotent (single interval)', () => {
    const stream = makeFakeTTY();
    const spinner = createSpinner('test', stream);
    spinner.start();
    spinner.start();

    vi.advanceTimersByTime(80);
    const count = stream.written.length;
    vi.advanceTimersByTime(80);
    expect(stream.written.length).toBe(count + 1);
  });
});
