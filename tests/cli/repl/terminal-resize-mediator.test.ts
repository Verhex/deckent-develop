import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createTerminalResizeMediator } from '../../../src/cli/repl/terminal-resize-mediator.js';
import { buildToolReadLabels } from '../../../src/cli/repl/run.js';

class TerminalFixture extends EventEmitter {
  columns = 100;
  rows = 32;
  readonly writes: string[] = [];
  readonly isTTY = true;
  writeResult = true;
  write(value: string, callback?: (error?: Error | null) => void): boolean {
    this.writes.push(value);
    if (callback) queueMicrotask(() => callback(null));
    return this.writeResult;
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  return { promise: new Promise<void>((ok, fail) => { resolve = ok; reject = fail; }), resolve, reject };
}

describe('terminal resize mediator', () => {
  it('substitutes tool-read fields literally without replacement-pattern interpretation', () => {
    const labels = buildToolReadLabels((key) => key === 'tui.tool_read.field' ? '{key}: {value}' : key);
    expect(labels.field('$&$`{value}', '$\'$$$&{key}')).toBe('$&$`{value}: $\'$$$&{key}');
  });

  it('publishes target dimensions before releasing renderer rows and its resize listener', async () => {
    const physical = new TerminalFixture();
    const mediator = createTerminalResizeMediator({ stdout: physical as never });
    const flush = deferred();
    mediator.bind({ waitUntilRenderFlush: vi.fn(() => flush.promise) });
    const snapshots: Array<{ columns: number; rows: number; rendererRows: number }> = [];
    mediator.subscribe(() => snapshots.push({ ...mediator.getSnapshot(), rendererRows: (mediator.stdout as { rows?: number }).rows! }));
    const rendererResize = vi.fn();
    mediator.stdout.on('resize', rendererResize);

    physical.columns = 48; physical.rows = 24; physical.emit('resize');
    await tick();
    expect(snapshots).toEqual([{ columns: 48, rows: 24, rendererRows: 32 }]);
    expect(rendererResize).not.toHaveBeenCalled();
    flush.resolve(); await tick();
    expect((mediator.stdout as { columns?: number; rows?: number }).columns).toBe(48);
    expect((mediator.stdout as { rows?: number }).rows).toBe(24);
    expect(rendererResize).toHaveBeenCalledTimes(1);
    mediator.dispose();
  });

  it('coalesces rapid targets without releasing an intermediate row extent', async () => {
    const physical = new TerminalFixture();
    const mediator = createTerminalResizeMediator({ stdout: physical as never });
    const first = deferred(); const second = deferred();
    const waits = [first.promise, second.promise];
    mediator.bind({ waitUntilRenderFlush: vi.fn(() => waits.shift()!) });
    const rendererRows: number[] = [];
    mediator.stdout.on('resize', () => rendererRows.push((mediator.stdout as { rows?: number }).rows!));
    physical.columns = 70; physical.rows = 28; physical.emit('resize'); await tick();
    physical.columns = 48; physical.rows = 24; physical.emit('resize');
    first.resolve(); await tick();
    expect(rendererRows).toEqual([]);
    expect(mediator.getSnapshot()).toEqual({ columns: 48, rows: 24 });
    second.resolve(); await tick();
    expect(rendererRows).toEqual([24]);
    mediator.dispose();
  });

  it('handles row-only and growing changes with the same sequenced contract', async () => {
    const physical = new TerminalFixture();
    const mediator = createTerminalResizeMediator({ stdout: physical as never });
    mediator.bind({ waitUntilRenderFlush: vi.fn(async () => {}) });
    const seen: Array<[number, number]> = [];
    mediator.stdout.on('resize', () => seen.push([(mediator.stdout as { columns?: number }).columns!, (mediator.stdout as { rows?: number }).rows!]));
    physical.rows = 20; physical.emit('resize'); await tick();
    physical.columns = 120; physical.rows = 40; physical.emit('resize'); await tick();
    expect(seen).toEqual([[100, 20], [120, 40]]);
    mediator.dispose();
  });

  it('exposes a real growing row extent before subscribers render the target frame', async () => {
    const physical = new TerminalFixture();
    physical.rows = 24;
    const mediator = createTerminalResizeMediator({ stdout: physical as never });
    const flush = deferred(); mediator.bind({ waitUntilRenderFlush: vi.fn(() => flush.promise) });
    const during: number[] = [];
    mediator.subscribe(() => during.push((mediator.stdout as { rows?: number }).rows!));
    physical.rows = 32; physical.emit('resize'); await tick();
    expect(mediator.getSnapshot().rows).toBe(32);
    expect(during).toEqual([32]);
    flush.resolve(); await tick();
    expect((mediator.stdout as { rows?: number }).rows).toBe(32);
    mediator.dispose();
  });

  it('retains the largest safe extent across a rapid grow then shrink until the latest compact frame flushes', async () => {
    const physical = new TerminalFixture();
    physical.rows = 24;
    const mediator = createTerminalResizeMediator({ stdout: physical as never });
    const first = deferred(); const second = deferred();
    const waits = [first.promise, second.promise];
    mediator.bind({ waitUntilRenderFlush: vi.fn(() => waits.shift()!) });
    const during: Array<{ target: number; renderer: number }> = [];
    mediator.subscribe(() => during.push({ target: mediator.getSnapshot().rows, renderer: (mediator.stdout as { rows?: number }).rows! }));
    physical.rows = 40; physical.emit('resize'); await tick();
    physical.rows = 20; physical.emit('resize');
    first.resolve(); await tick();
    expect(during).toEqual([{ target: 40, renderer: 40 }, { target: 20, renderer: 40 }]);
    second.resolve(); await tick();
    expect((mediator.stdout as { rows?: number }).rows).toBe(20);
    mediator.dispose();
  });

  it('reports flush rejection or timeout without releasing renderer geometry', async () => {
    for (const mode of ['failure', 'timeout'] as const) {
      const physical = new TerminalFixture();
      const failures: string[] = [];
      const mediator = createTerminalResizeMediator({ stdout: physical as never, flushTimeoutMs: 5, onFailure: (failure) => failures.push(failure.code) });
      mediator.bind({ waitUntilRenderFlush: vi.fn(() => mode === 'failure' ? Promise.reject(new Error('render failed')) : new Promise<void>(() => {})) });
      const rendererResize = vi.fn(); mediator.stdout.on('resize', rendererResize);
      physical.columns = 48; physical.rows = 24; physical.emit('resize');
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(failures).toEqual([mode === 'failure' ? 'TERMINAL_RESIZE_FLUSH_FAILED' : 'TERMINAL_RESIZE_FLUSH_TIMEOUT']);
      expect((mediator.stdout as { rows?: number }).rows).toBe(32);
      expect(rendererResize).not.toHaveBeenCalled();
      mediator.dispose();
    }
  });

  it('disposes pending work without late render notification and restores only its own physical listener', async () => {
    const physical = new TerminalFixture();
    const unrelated = vi.fn(); physical.on('resize', unrelated);
    const mediator = createTerminalResizeMediator({ stdout: physical as never });
    const flush = deferred(); mediator.bind({ waitUntilRenderFlush: vi.fn(() => flush.promise) });
    const rendererResize = vi.fn(); mediator.stdout.on('resize', rendererResize);
    physical.columns = 48; physical.rows = 24; physical.emit('resize'); await tick();
    mediator.dispose(); await tick();
    expect(rendererResize).not.toHaveBeenCalled();
    expect(physical.listeners('resize')).toEqual([unrelated]);
    // The pending renderer promise deliberately never settles: dispose must
    // still clear its own deadline and complete without a late notification.
  });

  it('delegates stream writes/backpressure and non-resize listeners without patching the source', () => {
    const physical = new TerminalFixture();
    const originalOn = physical.on;
    const mediator = createTerminalResizeMediator({ stdout: physical as never });
    physical.writeResult = false;
    const callback = vi.fn();
    expect(mediator.stdout.write('frame', callback)).toBe(false);
    const close = vi.fn(); mediator.stdout.on('close', close); physical.emit('close');
    expect(physical.writes).toEqual(['frame']);
    expect(close).toHaveBeenCalledTimes(1);
    expect(physical.on).toBe(originalOn);
    mediator.dispose();
    return new Promise<void>((resolve) => queueMicrotask(() => { expect(callback).toHaveBeenCalledWith(null); resolve(); }));
  });

  it('keeps once and prepend resize listeners behind the flush boundary', async () => {
    const physical = new TerminalFixture();
    const mediator = createTerminalResizeMediator({ stdout: physical as never });
    mediator.bind({ waitUntilRenderFlush: vi.fn(async () => {}) });
    const order: string[] = [];
    mediator.stdout.on('resize', () => order.push('on'));
    mediator.stdout.once('resize', () => order.push('once'));
    mediator.stdout.prependListener('resize', () => order.push('first'));
    physical.columns = 90; physical.emit('resize'); await tick();
    physical.columns = 80; physical.emit('resize'); await tick();
    expect(order).toEqual(['first', 'on', 'once', 'first', 'on']);
    mediator.dispose();
  });
});
