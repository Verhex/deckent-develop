import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeckentError, ErrorRegistry } from '../../../src/core/errors.js';
import { handleError } from '../../../src/cli/helpers/error-handler.js';

describe('handleError', () => {
  let stderrOutput: string;

  beforeEach(() => {
    stderrOutput = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderrOutput += String(chunk);
      return true;
    });
  });

  it('handles DeckentError with human context (noColor)', () => {
    const err = ErrorRegistry.createError('DECKENT_E003');
    handleError(err, { noColor: true });
    expect(stderrOutput).toContain('Error: no DIRECTIVES.md [DECKENT_E003]');
    expect(stderrOutput).toContain('What happened:');
    expect(stderrOutput).toContain('Why:');
    expect(stderrOutput).toContain('How to fix:');
  });

  it('handles DeckentError with color (default)', () => {
    const err = ErrorRegistry.createError('DECKENT_E001');
    handleError(err);
    // Color codes should be present
    expect(stderrOutput).toContain('\x1b[31m');
    expect(stderrOutput).toContain('tmux');
  });

  it('handles DeckentError without human context (legacy format)', () => {
    const err = new DeckentError('DECKENT_TEST', 'test message', 'test suggestion');
    handleError(err, { noColor: true });
    expect(stderrOutput).toContain('[DECKENT_TEST]');
    expect(stderrOutput).toContain('test message');
    expect(stderrOutput).toContain('Suggestion: test suggestion');
  });

  it('handles DeckentError legacy format with docLink', () => {
    const err = new DeckentError('X', 'msg', 'sug', 'https://docs.example.com');
    handleError(err, { noColor: true });
    expect(stderrOutput).toContain('Docs: https://docs.example.com');
  });

  it('handles generic Error', () => {
    handleError(new Error('something broke'));
    expect(stderrOutput).toContain('Error: something broke');
    expect(stderrOutput).toContain('Report:');
  });

  it('handles non-Error values', () => {
    handleError('string error');
    expect(stderrOutput).toContain('Error: string error');
  });

  it('shows stack trace when verbose', () => {
    const err = ErrorRegistry.createError('DECKENT_E001');
    handleError(err, { verbose: true, noColor: true });
    expect(stderrOutput).toContain('at ');
  });

  it('does not show stack when not verbose', () => {
    const err = ErrorRegistry.createError('DECKENT_E001');
    handleError(err, { noColor: true });
    // Stack traces contain 'at ' followed by function name
    const lines = stderrOutput.split('\n');
    const stackLines = lines.filter(l => l.trim().startsWith('at '));
    expect(stackLines.length).toBe(0);
  });
});
