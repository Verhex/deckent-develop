import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeckentError } from '../../src/core/errors.js';
import { handleError } from '../../src/cli/helpers/error-handler.js';

// ─── Capture stderr ─────────────────────────────────────────────────

let stderrOutput: string;
let originalWrite: typeof process.stderr.write;

beforeEach(() => {
  stderrOutput = '';
  originalWrite = process.stderr.write;
  process.stderr.write = vi.fn((chunk: unknown) => {
    stderrOutput += String(chunk);
    return true;
  }) as unknown as typeof process.stderr.write;
});

afterEach(() => {
  process.stderr.write = originalWrite;
});

// ─── DeckentError handling ──────────────────────────────────────────

describe('handleError — DeckentError', () => {
  it('prints error code and message for DeckentError', () => {
    const err = new DeckentError('DECKENT_E001', 'tmux not found');
    handleError(err);
    expect(stderrOutput).toContain('DECKENT_E001');
    expect(stderrOutput).toContain('tmux not found');
  });

  it('prints suggestion when available', () => {
    const err = new DeckentError('DECKENT_E001', 'tmux not found', 'Install tmux');
    handleError(err);
    expect(stderrOutput).toContain('Suggestion:');
    expect(stderrOutput).toContain('Install tmux');
  });

  it('prints docLink when available', () => {
    const err = new DeckentError('DECKENT_E001', 'msg', 'sug', 'https://docs.example.com');
    handleError(err);
    expect(stderrOutput).toContain('Docs:');
    expect(stderrOutput).toContain('https://docs.example.com');
  });

  it('does not print suggestion when not provided', () => {
    const err = new DeckentError('X', 'msg');
    handleError(err);
    expect(stderrOutput).not.toContain('Suggestion:');
  });

  it('prints stack trace in verbose mode', () => {
    const err = new DeckentError('X', 'msg');
    handleError(err, { verbose: true });
    expect(stderrOutput).toContain('at ');
  });

  it('does not print stack trace without verbose', () => {
    const err = new DeckentError('X', 'msg');
    handleError(err);
    // Stack trace lines contain "at " — the output should not have many
    const lines = stderrOutput.split('\n').filter(l => l.includes('    at '));
    expect(lines.length).toBe(0);
  });
});

// ─── Generic Error handling ─────────────────────────────────────────

describe('handleError — generic Error', () => {
  it('prints error message', () => {
    handleError(new Error('something failed'));
    expect(stderrOutput).toContain('something failed');
  });

  it('prints report URL', () => {
    handleError(new Error('fail'));
    expect(stderrOutput).toContain('https://github.com/VerhexIO/deckent/issues');
  });

  it('prints stack in verbose mode', () => {
    handleError(new Error('fail'), { verbose: true });
    expect(stderrOutput).toContain('at ');
  });
});

// ─── Non-Error handling ─────────────────────────────────────────────

describe('handleError — non-Error values', () => {
  it('handles string thrown as error', () => {
    handleError('raw string error');
    expect(stderrOutput).toContain('raw string error');
  });

  it('handles number thrown as error', () => {
    handleError(42);
    expect(stderrOutput).toContain('42');
  });
});
