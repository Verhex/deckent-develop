import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createInputDebugSink,
  debugKeylogPath,
  projectInputDebugEvent,
  type InputDebugFs,
  type InputDebugStatus,
} from '../../../src/cli/repl/input-debug.js';

const roots: string[] = [];
const makeRoot = (prefix = 'deckent-input-debug-'): string => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
};
const waitFor = async (condition: () => boolean): Promise<void> => {
  await vi.waitFor(() => expect(condition()).toBe(true), { timeout: 1_000 });
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('input debug privacy projection', () => {
  it('projects only the closed action/modifier vocabulary and retains no raw input or unknown key data', () => {
    expect(projectInputDebugEvent('secret', { ctrl: true, unknown: 'secret' })).toEqual({
      event: 'key', action: 'paste-or-text', modifiers: ['ctrl'],
    });
    expect(projectInputDebugEvent('\u001b[A', { upArrow: true, meta: true, sequence: '\u001b[A' })).toEqual({
      event: 'key', action: 'up', modifiers: ['meta'],
    });
    const projected = JSON.stringify(projectInputDebugEvent('🔐parola', {
      return: true, shift: true, injected: '🔐parola', codepoint: 12_345,
    }));
    expect(projected).toBe('{"event":"key","action":"return","modifiers":["shift"]}');
    expect(projected).not.toMatch(/parola|🔐|injected|codepoint|12345/);
  });

  it('uses a unique portable default destination while preserving the explicit override', () => {
    const env: NodeJS.ProcessEnv = {};
    const first = debugKeylogPath(env, 42, 'first');
    const second = debugKeylogPath(env, 42, 'second');
    expect(first).toBe(join(tmpdir(), 'deckent-ink-input-42-first.jsonl'));
    expect(second).toBe(join(tmpdir(), 'deckent-ink-input-42-second.jsonl'));
    expect(first).not.toBe(second);
    expect(debugKeylogPath({ DECKENT_INK_DEBUG_LOG: 'chosen.log' }, 42, 'ignored')).toBe('chosen.log');
  });

  it('creates a private exclusive file, drains on close, and never persists content', async () => {
    const path = join(makeRoot(), 'debug.jsonl');
    const sink = createInputDebugSink(path);
    sink.record('hun', { ctrl: true, arbitrary: 'hunter2🔐' });
    sink.record('ter2🔐', { return: true, sequence: 'ter2🔐' });
    sink.close();
    sink.record('after-close', { return: true });
    await waitFor(() => existsSync(path) && readFileSync(path, 'utf8').split('\n').length === 3);
    const text = readFileSync(path, 'utf8');
    expect(text).not.toMatch(/hun|ter2|after-close|arbitrary|sequence|🔐/);
    expect(text).toContain('"action":"return"');
    expect(lstatSync(path).mode & 0o777).toBe(0o600);
  });

  it('refuses pre-existing files and final symlinks without changing either', async () => {
    const root = makeRoot('deckent-input-debug-exclusive-');
    const target = join(root, 'target');
    const link = join(root, 'link');
    writeFileSync(target, 'unchanged', { mode: 0o600 });
    symlinkSync(target, link);
    for (const path of [target, link]) {
      const statuses: InputDebugStatus[] = [];
      const sink = createInputDebugSink(path, (status) => statuses.push(status));
      sink.record('secret', {});
      await waitFor(() => statuses.length === 1);
      expect(statuses).toEqual(['INPUT_DEBUG_OPEN_FAILED']);
      expect(readFileSync(target, 'utf8')).toBe('unchanged');
    }
  });
});

describe('input debug descriptor lifecycle', () => {
  it('does not close a pending write on limit, then drains all 256 accepted rows in order and closes once', async () => {
    const events: string[] = [];
    const statuses: InputDebugStatus[] = [];
    const chunks: Buffer[] = [];
    const writes: Array<{
      buffer: Buffer;
      offset: number;
      length: number;
      callback: (error: NodeJS.ErrnoException | null, written: number) => void;
    }> = [];
    const close = vi.fn((_fd: number, callback: (error?: NodeJS.ErrnoException | null) => void) => {
      events.push('close');
      callback(null);
    });
    const fs: InputDebugFs = {
      open: (_path, flags, mode, callback) => {
        expect(flags).toBe('wx');
        expect(mode).toBe(0o600);
        callback(null, 17);
      },
      write: (_fd, buffer, offset, length, _position, callback) => {
        events.push(`write-${writes.length}-started`);
        writes.push({ buffer, offset, length, callback });
      },
      close,
    };
    const sink = createInputDebugSink('/unused', (status) => statuses.push(status), fs);
    sink.record('secret-0', {});
    for (let index = 1; index <= 256; index += 1) sink.record(`secret-${index}`, {});

    expect(statuses).toEqual(['INPUT_DEBUG_LIMIT_REACHED']);
    expect(writes).toHaveLength(1);
    expect(close).not.toHaveBeenCalled();

    for (let index = 0; index < writes.length; index += 1) {
      const write = writes[index]!;
      chunks.push(Buffer.from(write.buffer.subarray(write.offset, write.offset + write.length)));
      events.push(`write-${index}-completed`);
      write.callback(null, write.length);
    }
    await waitFor(() => close.mock.calls.length === 1);
    expect(writes).toHaveLength(256);
    expect(events.at(-1)).toBe('close');
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text.trim().split('\n')).toHaveLength(256);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(64 * 1024);
    expect(text).not.toContain('secret-');
  });

  it('keeps close behind partial progress and ignores a duplicate callback without completing a newer write', () => {
    const chunks: Buffer[] = [];
    const writes: Array<{
      buffer: Buffer;
      offset: number;
      length: number;
      callback: (error: NodeJS.ErrnoException | null, written: number) => void;
    }> = [];
    const close = vi.fn((_fd: number, callback: (error?: NodeJS.ErrnoException | null) => void) => callback(null));
    const fs: InputDebugFs = {
      open: (_path, _flags, _mode, callback) => callback(null, 8),
      write: (_fd, buffer, offset, length, _position, callback) => writes.push({ buffer, offset, length, callback }),
      close,
    };
    const sink = createInputDebugSink('/unused', () => {}, fs);
    sink.record('first-secret', { return: true });
    sink.record('second-secret', { escape: true });
    sink.close();
    const first = writes[0]!;
    const firstProgress = Math.max(1, Math.floor(first.length / 2));
    chunks.push(Buffer.from(first.buffer.subarray(first.offset, first.offset + firstProgress)));
    first.callback(null, firstProgress);
    expect(writes).toHaveLength(2);
    first.callback(null, first.length);
    expect(writes).toHaveLength(2);
    expect(close).not.toHaveBeenCalled();

    for (let index = 1; index < writes.length; index += 1) {
      const write = writes[index]!;
      chunks.push(Buffer.from(write.buffer.subarray(write.offset, write.offset + write.length)));
      write.callback(null, write.length);
    }
    expect(close).toHaveBeenCalledTimes(1);
    expect(Buffer.concat(chunks).toString('utf8')).toBe(
      '{"event":"key","action":"return","modifiers":[]}\n'
      + '{"event":"key","action":"escape","modifiers":[]}\n',
    );
  });

  it('waits for an in-flight write failure callback before dropping unissued work and closing', () => {
    let writeCallback!: (error: NodeJS.ErrnoException | null, written: number) => void;
    let writes = 0;
    const statuses: InputDebugStatus[] = [];
    const close = vi.fn((_fd: number, callback: (error?: NodeJS.ErrnoException | null) => void) => callback(null));
    const fs: InputDebugFs = {
      open: (_path, _flags, _mode, callback) => callback(null, 9),
      write: (_fd, _buffer, _offset, _length, _position, callback) => { writes += 1; writeCallback = callback; },
      close,
    };
    const sink = createInputDebugSink('/unused', (status) => statuses.push(status), fs);
    sink.record('first-secret', {});
    sink.record('queued-secret', {});
    sink.close();
    expect(close).not.toHaveBeenCalled();
    writeCallback(Object.assign(new Error('private'), { code: 'EIO' }), 0);
    expect(statuses).toEqual(['INPUT_DEBUG_WRITE_FAILED']);
    expect(writes).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
    writeCallback(null, 1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('drains a close requested before open completes and closes the late descriptor once', () => {
    let openCallback!: (error: NodeJS.ErrnoException | null, fd?: number) => void;
    const chunks: Buffer[] = [];
    const close = vi.fn((_fd: number, callback: (error?: NodeJS.ErrnoException | null) => void) => callback(null));
    const fs: InputDebugFs = {
      open: (_path, _flags, _mode, callback) => { openCallback = callback; },
      write: (_fd, buffer, offset, length, _position, callback) => {
        chunks.push(Buffer.from(buffer.subarray(offset, offset + length)));
        callback(null, length);
      },
      close,
    };
    const sink = createInputDebugSink('/unused', () => {}, fs);
    sink.record('late-secret', { downArrow: true });
    sink.close();
    expect(close).not.toHaveBeenCalled();
    openCallback(null, 10);
    expect(close).toHaveBeenCalledTimes(1);
    expect(Buffer.concat(chunks).toString('utf8')).toBe('{"event":"key","action":"down","modifiers":[]}\n');
  });

  it('contains synchronous adapter and reporter exceptions with typed content-free status', () => {
    const openStatuses: InputDebugStatus[] = [];
    const openSink = createInputDebugSink('/private/path', (status) => openStatuses.push(status), {
      open: () => { throw new Error('secret open path'); },
      write: () => { throw new Error('unreachable'); },
      close: () => { throw new Error('unreachable'); },
    });
    expect(() => openSink.record('open-secret', {})).not.toThrow();
    expect(openStatuses).toEqual(['INPUT_DEBUG_OPEN_FAILED']);

    let reports = 0;
    const writeClose = vi.fn((_fd: number, callback: (error?: NodeJS.ErrnoException | null) => void) => callback(null));
    const writeSink = createInputDebugSink('/unused', () => { reports += 1; throw new Error('report secret'); }, {
      open: (_path, _flags, _mode, callback) => callback(null, 11),
      write: () => { throw new Error('write secret'); },
      close: writeClose,
    });
    expect(() => writeSink.record('write-secret', {})).not.toThrow();
    expect(reports).toBe(1);
    expect(writeClose).toHaveBeenCalledTimes(1);

    const closeStatuses: InputDebugStatus[] = [];
    const closeSink = createInputDebugSink('/unused', (status) => closeStatuses.push(status), {
      open: (_path, _flags, _mode, callback) => callback(null, 12),
      write: (_fd, _buffer, _offset, length, _position, callback) => callback(null, length),
      close: () => { throw new Error('close secret'); },
    });
    closeSink.record('close-secret', {});
    expect(() => closeSink.close()).not.toThrow();
    expect(closeStatuses).toEqual(['INPUT_DEBUG_CLOSE_FAILED']);
  });

  it('treats zero and invalid partial progress as terminal without retrying', () => {
    for (const written of [0, -1, 1.5, Number.POSITIVE_INFINITY, 10_000]) {
      const statuses: InputDebugStatus[] = [];
      let writes = 0;
      const close = vi.fn((_fd: number, callback: (error?: NodeJS.ErrnoException | null) => void) => callback(null));
      const sink = createInputDebugSink('/unused', (status) => statuses.push(status), {
        open: (_path, _flags, _mode, callback) => callback(null, 13),
        write: (_fd, _buffer, _offset, _length, _position, callback) => { writes += 1; callback(null, written); },
        close,
      });
      sink.record('secret', {});
      expect(statuses).toEqual(['INPUT_DEBUG_WRITE_FAILED']);
      expect(writes).toBe(1);
      expect(close).toHaveBeenCalledTimes(1);
    }
  });
});
