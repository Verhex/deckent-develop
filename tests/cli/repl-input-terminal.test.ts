import { describe, it, expect } from 'vitest';
import { replReadlineOptions } from '../../src/cli/entry.js';

// Sprint 224 T-224-001 — terminal-mode REPL input.
// `replReadlineOptions(isTty)` selects the readline config: TTY → full
// terminal mode (line-editing, history, arrow keys); non-TTY → line-only
// (deterministic, no echo) for pipes/tests/HTTP. Hermetic: pure function,
// no real terminal, no stdin interaction.

describe('replReadlineOptions — terminal-mode selection (T-224-001)', () => {
  it('TTY → terminal: true (enables line-editing + arrow keys)', () => {
    const opts = replReadlineOptions(true);
    expect(opts.terminal).toBe(true);
  });

  it('TTY → output bound to process.stdout (required for terminal rendering)', () => {
    const opts = replReadlineOptions(true);
    expect(opts.output).toBe(process.stdout);
  });

  it('TTY → history enabled (↑/↓ recall), historySize 100', () => {
    const opts = replReadlineOptions(true);
    expect(opts.historySize).toBe(100);
  });

  it('non-TTY → line-only reader: no terminal, no output, no history', () => {
    const opts = replReadlineOptions(false);
    expect(opts.terminal).toBeUndefined();
    expect(opts.output).toBeUndefined();
    expect(opts.historySize).toBeUndefined();
  });

  it('both modes attach input to process.stdin', () => {
    expect(replReadlineOptions(true).input).toBe(process.stdin);
    expect(replReadlineOptions(false).input).toBe(process.stdin);
  });
});
