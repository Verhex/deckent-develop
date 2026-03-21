import { describe, it, expect } from 'vitest';
import { DeckentError, ErrorRegistry } from '../../src/core/errors.js';

// ─── DeckentError class ─────────────────────────────────────────────

describe('DeckentError', () => {
  it('creates error with code and message', () => {
    const err = new DeckentError('DECKENT_E001', 'tmux not found');
    expect(err.code).toBe('DECKENT_E001');
    expect(err.message).toBe('tmux not found');
    expect(err.name).toBe('DeckentError');
  });

  it('includes suggestion when provided', () => {
    const err = new DeckentError('DECKENT_E001', 'tmux not found', 'Install tmux');
    expect(err.suggestion).toBe('Install tmux');
  });

  it('includes docLink when provided', () => {
    const err = new DeckentError('DECKENT_E001', 'msg', 'sug', 'https://docs.example.com');
    expect(err.docLink).toBe('https://docs.example.com');
  });

  it('extends Error', () => {
    const err = new DeckentError('X', 'msg');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DeckentError);
  });

  it('has a stack trace', () => {
    const err = new DeckentError('X', 'msg');
    expect(err.stack).toBeDefined();
    expect(err.stack!.length).toBeGreaterThan(0);
  });

  it('suggestion defaults to undefined', () => {
    const err = new DeckentError('X', 'msg');
    expect(err.suggestion).toBeUndefined();
  });

  it('docLink defaults to undefined', () => {
    const err = new DeckentError('X', 'msg');
    expect(err.docLink).toBeUndefined();
  });
});

// ─── ErrorRegistry ──────────────────────────────────────────────────

describe('ErrorRegistry', () => {
  it('has returns true for pre-populated codes', () => {
    expect(ErrorRegistry.has('DECKENT_E001')).toBe(true);
    expect(ErrorRegistry.has('DECKENT_E010')).toBe(true);
  });

  it('has returns false for unknown codes', () => {
    expect(ErrorRegistry.has('DECKENT_E999')).toBe(false);
  });

  it('get returns entry for known code', () => {
    const entry = ErrorRegistry.get('DECKENT_E001');
    expect(entry).toBeDefined();
    expect(entry!.message).toBe('tmux not found');
    expect(entry!.suggestion).toContain('tmux');
  });

  it('get returns undefined for unknown code', () => {
    expect(ErrorRegistry.get('DECKENT_E999')).toBeUndefined();
  });

  it('getAll returns all 10 pre-populated entries', () => {
    const all = ErrorRegistry.getAll();
    expect(all.size).toBeGreaterThanOrEqual(10);
    expect(all.has('DECKENT_E001')).toBe(true);
    expect(all.has('DECKENT_E010')).toBe(true);
  });

  it('getAll returns a copy (not the internal map)', () => {
    const all = ErrorRegistry.getAll();
    all.delete('DECKENT_E001');
    expect(ErrorRegistry.has('DECKENT_E001')).toBe(true);
  });

  it('createError returns DeckentError for known code', () => {
    const err = ErrorRegistry.createError('DECKENT_E002');
    expect(err).toBeInstanceOf(DeckentError);
    expect(err.code).toBe('DECKENT_E002');
    expect(err.message).toBe('claude CLI not found');
    expect(err.suggestion).toContain('npm install');
  });

  it('createError returns DeckentError with fallback for unknown code', () => {
    const err = ErrorRegistry.createError('DECKENT_E999');
    expect(err).toBeInstanceOf(DeckentError);
    expect(err.code).toBe('DECKENT_E999');
    expect(err.message).toContain('Unknown error');
  });

  it('createError allows message override', () => {
    const err = ErrorRegistry.createError('DECKENT_E001', { message: 'custom msg' });
    expect(err.message).toBe('custom msg');
  });

  it('createError allows suggestion override', () => {
    const err = ErrorRegistry.createError('DECKENT_E001', { suggestion: 'custom sug' });
    expect(err.suggestion).toBe('custom sug');
  });

  it('register adds a new error code', () => {
    ErrorRegistry.register('DECKENT_E100', {
      message: 'test error',
      suggestion: 'test suggestion',
    });
    expect(ErrorRegistry.has('DECKENT_E100')).toBe(true);
    const entry = ErrorRegistry.get('DECKENT_E100');
    expect(entry!.message).toBe('test error');
  });

  it('pre-populated E003 has correct suggestion about DIRECTIVES', () => {
    const entry = ErrorRegistry.get('DECKENT_E003');
    expect(entry!.suggestion).toContain('DIRECTIVES');
  });

  it('pre-populated E009 is about git', () => {
    const entry = ErrorRegistry.get('DECKENT_E009');
    expect(entry!.message).toContain('git');
  });

  it('pre-populated E010 is about node version', () => {
    const entry = ErrorRegistry.get('DECKENT_E010');
    expect(entry!.message).toContain('node version');
  });
});
