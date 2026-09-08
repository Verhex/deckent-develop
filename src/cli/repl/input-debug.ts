import { randomUUID } from 'node:crypto';
import { close as fsClose, open as fsOpen, write as fsWrite } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type InputDebugAction = 'return' | 'escape' | 'backspace' | 'delete' | 'left' | 'right' | 'up' | 'down' | 'paste-or-text' | 'text';
export type InputDebugModifier = 'ctrl' | 'meta' | 'shift' | 'tab';
export type InputDebugEvent = Readonly<{ event: 'key'; action: InputDebugAction; modifiers: readonly InputDebugModifier[] }>;
export type InputDebugStatus = 'INPUT_DEBUG_OPEN_FAILED' | 'INPUT_DEBUG_WRITE_FAILED' | 'INPUT_DEBUG_CLOSE_FAILED' | 'INPUT_DEBUG_LIMIT_REACHED';

export interface InputDebugFs {
  open(path: string, flags: string, mode: number, callback: (error: NodeJS.ErrnoException | null, fd?: number) => void): void;
  write(fd: number, buffer: Buffer, offset: number, length: number, position: null, callback: (error: NodeJS.ErrnoException | null, written: number) => void): void;
  close(fd: number, callback: (error?: NodeJS.ErrnoException | null) => void): void;
}

export interface InputDebugSink {
  record(input: string, key: Record<string, unknown>): void;
  close(): void;
}

type SinkState = 'open' | 'closing' | 'limit-draining' | 'failed' | 'closed';
type ActiveWrite = { buffer: Buffer; offset: number };
type WriteOperation = { active: ActiveWrite; fd: number };

const MAX_EVENTS = 256;
const MAX_BYTES = 64 * 1024;
const DEFAULT_FS: InputDebugFs = { open: fsOpen, write: fsWrite, close: fsClose };

export function debugKeylogPath(env: NodeJS.ProcessEnv = process.env, pid = process.pid, id = randomUUID()): string {
  return env['DECKENT_INK_DEBUG_LOG'] ?? join(tmpdir(), `deckent-ink-input-${pid}-${id}.jsonl`);
}

export function projectInputDebugEvent(input: string, key: Record<string, unknown>): InputDebugEvent {
  let action: InputDebugAction;
  if (key.return === true) action = 'return';
  else if (key.escape === true) action = 'escape';
  else if (key.backspace === true) action = 'backspace';
  else if (key.delete === true) action = 'delete';
  else if (key.leftArrow === true) action = 'left';
  else if (key.rightArrow === true) action = 'right';
  else if (key.upArrow === true) action = 'up';
  else if (key.downArrow === true) action = 'down';
  else action = input.length > 1 ? 'paste-or-text' : 'text';
  const modifiers: InputDebugModifier[] = [];
  for (const modifier of ['ctrl', 'meta', 'shift', 'tab'] as const) {
    if (key[modifier] === true) modifiers.push(modifier);
  }
  return Object.freeze({ event: 'key', action, modifiers: Object.freeze(modifiers) });
}

/** Content-free, bounded diagnostic sink. close() stops admission and drains accepted records. */
export function createInputDebugSink(
  path = debugKeylogPath(),
  report: (code: InputDebugStatus) => void = (code) => { process.stderr.write(`${code}\n`); },
  fs: InputDebugFs = DEFAULT_FS,
): InputDebugSink {
  let state: SinkState = 'open';
  let fd: number | null = null;
  let opening = false;
  let closeInFlight = false;
  let inFlight: WriteOperation | null = null;
  let active: ActiveWrite | null = null;
  let acceptedBytes = 0;
  let reported = false;
  const queue: Buffer[] = [];
  const closingFds = new Set<number>();

  const reportOnce = (code: InputDebugStatus): void => {
    if (reported) return;
    reported = true;
    try { report(code); } catch { /* diagnostics cannot break input */ }
  };

  const closeFd = (value: number): void => {
    if (closingFds.has(value)) return;
    closingFds.add(value);
    if (fd === value) fd = null;
    closeInFlight = true;
    let settled = false;
    const onClose = (error?: NodeJS.ErrnoException | null): void => {
      if (settled) return;
      settled = true;
      closeInFlight = false;
      state = 'closed';
      if (error) reportOnce('INPUT_DEBUG_CLOSE_FAILED');
    };
    try { fs.close(value, onClose); } catch {
      onClose(Object.assign(new Error('close failed'), { code: 'EIO' }));
    }
  };

  const finishTerminal = (): boolean => {
    if (opening || inFlight || active || queue.length > 0) return false;
    if (fd !== null) {
      closeFd(fd);
      return true;
    }
    if (!closeInFlight) state = 'closed';
    return true;
  };

  const fail = (code: InputDebugStatus): void => {
    if (state === 'failed' || state === 'closed') return;
    state = 'failed';
    queue.length = 0;
    if (!inFlight) active = null;
    reportOnce(code);
    finishTerminal();
  };

  const flush = (): void => {
    if (state === 'closed') return;
    if (state === 'failed') {
      finishTerminal();
      return;
    }
    if (inFlight) return;
    if (!active) {
      const next = queue.shift();
      if (next) active = { buffer: next, offset: 0 };
    }
    if (!active) {
      if (state === 'closing' || state === 'limit-draining') finishTerminal();
      return;
    }
    if (fd === null) {
      if (opening) return;
      opening = true;
      let settled = false;
      const onOpen = (error: NodeJS.ErrnoException | null, value?: number): void => {
        if (settled) return;
        settled = true;
        opening = false;
        if (error || value === undefined) {
          fail('INPUT_DEBUG_OPEN_FAILED');
          return;
        }
        if (state === 'failed' || state === 'closed') {
          active = null;
          closeFd(value);
          return;
        }
        fd = value;
        flush();
      };
      try { fs.open(path, 'wx', 0o600, onOpen); } catch {
        if (!settled) {
          settled = true;
          opening = false;
          fail('INPUT_DEBUG_OPEN_FAILED');
        }
      }
      return;
    }

    const operation: WriteOperation = { active, fd };
    inFlight = operation;
    const remaining = operation.active.buffer.length - operation.active.offset;
    let settled = false;
    const onWrite = (error: NodeJS.ErrnoException | null, written: number): void => {
      if (settled) return;
      settled = true;
      if (inFlight !== operation) return;
      inFlight = null;
      if (state === 'failed') {
        active = null;
        finishTerminal();
        return;
      }
      if (error || !Number.isInteger(written) || written <= 0 || written > remaining) {
        fail('INPUT_DEBUG_WRITE_FAILED');
        return;
      }
      operation.active.offset += written;
      if (operation.active.offset === operation.active.buffer.length) active = null;
      flush();
    };
    try {
      fs.write(operation.fd, operation.active.buffer, operation.active.offset, remaining, null, onWrite);
    } catch {
      if (!settled) {
        settled = true;
        if (inFlight === operation) inFlight = null;
        fail('INPUT_DEBUG_WRITE_FAILED');
      }
    }
  };

  return {
    record(input, key) {
      if (state !== 'open') return;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(`${JSON.stringify(projectInputDebugEvent(input, key))}\n`, 'utf8');
      } catch {
        fail('INPUT_DEBUG_WRITE_FAILED');
        return;
      }
      if (queue.length + (active ? 1 : 0) >= MAX_EVENTS || acceptedBytes + buffer.length > MAX_BYTES) {
        state = 'limit-draining';
        reportOnce('INPUT_DEBUG_LIMIT_REACHED');
        flush();
        return;
      }
      queue.push(buffer);
      acceptedBytes += buffer.length;
      flush();
    },
    close() {
      if (state === 'closed' || state === 'failed' || state === 'closing') return;
      if (state === 'open') state = 'closing';
      flush();
    },
  };
}
