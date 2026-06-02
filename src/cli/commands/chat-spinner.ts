/** Braille spinner frames for "thinking..." indicator. */
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

export interface Spinner {
  start(): void;
  stop(): void;
}

/**
 * Create a TTY-only braille spinner that writes to stderr.
 * Returns a no-op when the target stream is not a TTY (pipe-safe).
 *
 * @param label  Text shown after the spinning frame, e.g. "düşünüyor…"
 * @param stream Target write stream — defaults to process.stderr.
 */
export function createSpinner(label: string, stream?: NodeJS.WriteStream): Spinner {
  const out = stream ?? process.stderr;

  if (!out.isTTY) {
    return { start() {}, stop() {} };
  }

  let frame = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick(): void {
    out.write(`\r${FRAMES[frame % FRAMES.length]} ${label}`);
    frame++;
  }

  return {
    start() {
      if (timer !== null) return;
      tick();
      timer = setInterval(tick, INTERVAL_MS);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      const clearLine = '\r' + ' '.repeat(label.length + 3) + '\r';
      out.write(clearLine);
    },
  };
}
