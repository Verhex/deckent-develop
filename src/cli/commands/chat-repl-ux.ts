import { createInterface } from 'node:readline';

// ─── ReplHistory — ring buffer ───────────────────────────────────────

/**
 * Fixed-capacity history ring buffer with cursor-based navigation.
 * Newest entries at index 0; oldest at index size-1.
 */
export class ReplHistory {
  private entries: string[] = [];
  private navIndex: number = -1;

  constructor(private readonly capacity: number = 100) {}

  push(entry: string): void {
    if (!entry.trim()) return;
    if (this.entries.length > 0 && this.entries[0] === entry) {
      this.navIndex = -1;
      return;
    }
    this.entries.unshift(entry);
    if (this.entries.length > this.capacity) this.entries.pop();
    this.navIndex = -1;
  }

  /** Navigate toward older entries. Returns entry string or undefined at boundary. */
  navigateUp(): string | undefined {
    if (this.entries.length === 0) return undefined;
    if (this.navIndex < this.entries.length - 1) this.navIndex++;
    return this.entries[this.navIndex];
  }

  /** Navigate toward newer entries. Returns undefined when back at current (unsaved) line. */
  navigateDown(): string | undefined {
    if (this.navIndex <= 0) {
      this.navIndex = -1;
      return undefined;
    }
    this.navIndex--;
    return this.entries[this.navIndex];
  }

  reset(): void {
    this.navIndex = -1;
  }

  get size(): number {
    return this.entries.length;
  }

  getAt(index: number): string | undefined {
    return this.entries[index];
  }
}

// ─── Slash command handler ───────────────────────────────────────────

export type ReplCommandResult =
  | { action: 'exit' }
  | { action: 'clear' }
  | { action: 'none' };

export function handleReplCommand(line: string): ReplCommandResult {
  const cmd = line.trim().toLowerCase();
  if (cmd === '/exit' || cmd === '/quit') return { action: 'exit' };
  if (cmd === '/clear') return { action: 'clear' };
  return { action: 'none' };
}

// ─── SIGINT state machine ────────────────────────────────────────────

export interface SigintTracker {
  /** First call → 'cancel' (clear line); second call → 'exit'. */
  handle(): 'cancel' | 'exit';
  /** Reset to initial state when user resumes typing. */
  reset(): void;
}

export function createSigintTracker(): SigintTracker {
  let pending = false;
  return {
    handle() {
      if (pending) return 'exit';
      pending = true;
      return 'cancel';
    },
    reset() {
      pending = false;
    },
  };
}

// ─── Multi-line accumulator ──────────────────────────────────────────

export interface MultiLineResult {
  complete: boolean;
  text: string;
}

export interface MultiLineAccumulator {
  /** Append a raw readline line. Returns { complete, text } — text is only valid when complete. */
  append(line: string): MultiLineResult;
  reset(): void;
}

export function createMultiLineAccumulator(): MultiLineAccumulator {
  const parts: string[] = [];
  return {
    append(line: string) {
      if (line.endsWith('\\')) {
        parts.push(line.slice(0, -1));
        return { complete: false, text: '' };
      }
      parts.push(line);
      const text = parts.join('\n');
      parts.length = 0;
      return { complete: true, text };
    },
    reset() {
      parts.length = 0;
    },
  };
}

// ─── createReplLines — readline integration ──────────────────────────

export interface ReplUxOptions {
  /** Prompt string shown to the user. Default: "deckent> " */
  prompt?: string;
  /** Ring buffer capacity for history. Default: 100 */
  historyCapacity?: number;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Async generator wrapping node:readline with REPL UX enhancements:
 * - Displays prompt string before each input
 * - Ring-buffer history (ReplHistory)
 * - /exit, /quit, /clear slash commands
 * - Ctrl-C: first press cancels current line, second press exits
 * - Multi-line input: trailing backslash continues to next line
 *
 * Yields complete, non-empty user input strings suitable for passing
 * directly to runChatNativeLoop({ input: createReplLines(), ... }).
 */
export async function* createReplLines(opts: ReplUxOptions = {}): AsyncIterable<string> {
  const promptStr = opts.prompt ?? 'deckent> ';
  const history = new ReplHistory(opts.historyCapacity ?? 100);
  const sigint = createSigintTracker();
  const multiLine = createMultiLineAccumulator();
  const outStream = opts.output ?? process.stdout;

  type QueueItem = { line: string } | { done: true };
  const queue: QueueItem[] = [];
  let resolveNext: (() => void) | null = null;

  function enqueue(item: QueueItem) {
    queue.push(item);
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  }

  let rlClosed = false;
  const rl = createInterface({
    input: opts.input ?? process.stdin,
    output: outStream,
    terminal: true,
    historySize: 0,
    prompt: promptStr,
  });

  rl.on('line', (raw: string) => enqueue({ line: raw }));

  rl.on('SIGINT', () => {
    const action = sigint.handle();
    if (action === 'cancel') {
      outStream.write('\n^C (press Ctrl-C again to exit)\n');
      multiLine.reset();
      rl.setPrompt(promptStr);
      rl.prompt();
    } else {
      enqueue({ done: true });
      rl.close();
    }
  });

  rl.on('close', () => { rlClosed = true; enqueue({ done: true }); });

  rl.setPrompt(promptStr);
  rl.prompt();

  try {
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => { resolveNext = resolve; });
      }
      const item = queue.shift()!;
      if ('done' in item) break;

      const raw = item.line;
      sigint.reset();

      const cmd = handleReplCommand(raw);
      if (cmd.action === 'exit') {
        rl.close();
        break;
      }
      if (cmd.action === 'clear') {
        outStream.write('\x1B[2J\x1B[H');
        rl.setPrompt(promptStr);
        rl.prompt();
        continue;
      }

      const result = multiLine.append(raw);
      if (!result.complete) {
        rl.setPrompt('... ');
        rl.prompt();
        continue;
      }

      if (result.text.trim().length > 0) {
        history.push(result.text);
        yield result.text;
      }

      rl.setPrompt(promptStr);
      rl.prompt();
    }
  } finally {
    if (!rlClosed) rl.close();
  }
}
