// ─── Output Mode ────────────────────────────────────────────────────

export type OutputLevel = 'quiet' | 'normal' | 'verbose';

let currentMode: OutputLevel = 'normal';

// ─── Mode management ────────────────────────────────────────────────

/**
 * Set the global output mode.
 */
export function setOutputMode(mode: OutputLevel): void {
  currentMode = mode;
}

/**
 * Get the current output mode.
 */
export function getOutputMode(): OutputLevel {
  return currentMode;
}

/**
 * Reset the output mode back to 'normal'.
 */
export function resetOutputMode(): void {
  currentMode = 'normal';
}

// ─── Level checking ─────────────────────────────────────────────────

const LEVEL_ORDER: Record<OutputLevel, number> = {
  quiet: 0,
  normal: 1,
  verbose: 2,
};

/**
 * Check if a message at the given level should be output.
 * - quiet mode: only 'quiet' messages get through (errors/critical)
 * - normal mode: 'quiet' and 'normal' messages
 * - verbose mode: everything
 */
export function shouldOutput(messageLevel: OutputLevel): boolean {
  return LEVEL_ORDER[messageLevel] <= LEVEL_ORDER[currentMode];
}

// ─── Logger wrapper ─────────────────────────────────────────────────

export interface LevelLogger {
  quiet(message: string): void;
  normal(message: string): void;
  verbose(message: string): void;
}

/**
 * Wrap a write function into a level-aware logger.
 * Messages are only forwarded if shouldOutput returns true for that level.
 */
export function wrapLogger(writeFn: (message: string) => void): LevelLogger {
  return {
    quiet(message: string): void {
      if (shouldOutput('quiet')) {
        writeFn(message);
      }
    },
    normal(message: string): void {
      if (shouldOutput('normal')) {
        writeFn(message);
      }
    },
    verbose(message: string): void {
      if (shouldOutput('verbose')) {
        writeFn(message);
      }
    },
  };
}
