import { describe, it, expect } from 'vitest';
import { getContextualHints } from '../../src/cli/helpers/hints.js';

describe('getContextualHints', () => {
  // COMPLETE phase
  it('COMPLETE phase returns Turkish hint', () => {
    const hints = getContextualHints('COMPLETE', undefined, 'tr');
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('deckent retro');
    expect(hints[0]).toContain('tamamlandı');
  });

  it('COMPLETE phase returns English hint', () => {
    const hints = getContextualHints('COMPLETE', undefined, 'en');
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('deckent retro');
    expect(hints[0]).toContain('Sprint complete');
  });

  // EXECUTE phase
  it('EXECUTE phase returns hint', () => {
    const hints = getContextualHints('EXECUTE', undefined, 'en');
    expect(hints.length).toBeGreaterThanOrEqual(1);
    expect(hints[0]).toContain('deckent status --watch');
  });

  it('EXECUTE phase returns Turkish hint', () => {
    const hints = getContextualHints('EXECUTE', undefined, 'tr');
    expect(hints[0]).toContain('deckent status --watch');
    expect(hints[0]).toContain('Görevler');
  });

  it('EXECUTE phase with taskCount includes task count hint', () => {
    const hints = getContextualHints('EXECUTE', { taskCount: 5 }, 'en');
    expect(hints.length).toBeGreaterThanOrEqual(2);
    expect(hints.some(h => h.includes('5'))).toBe(true);
  });

  it('EXECUTE phase with sprintId includes sprint hint', () => {
    const hints = getContextualHints('EXECUTE', { sprintId: 'sprint-022' }, 'en');
    expect(hints.some(h => h.includes('sprint-022'))).toBe(true);
  });

  // PLAN phase
  it('PLAN phase returns correct hint', () => {
    const hints = getContextualHints('PLAN', undefined, 'en');
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('deckent start');
  });

  it('PLAN phase returns Turkish hint', () => {
    const hints = getContextualHints('PLAN', undefined, 'tr');
    expect(hints[0]).toContain('deckent start');
    expect(hints[0]).toContain('başlatın');
  });

  // IDLE phase
  it('IDLE phase returns correct hint', () => {
    const hints = getContextualHints('IDLE', undefined, 'en');
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('deckent plan');
  });

  it('IDLE phase returns Turkish hint', () => {
    const hints = getContextualHints('IDLE', undefined, 'tr');
    expect(hints[0]).toContain('deckent plan');
    expect(hints[0]).toContain('planlayın');
  });

  // Case insensitivity
  it('lowercase phase name works', () => {
    const hints = getContextualHints('complete', undefined, 'en');
    expect(hints.length).toBeGreaterThanOrEqual(1);
    expect(hints[0]).toContain('deckent retro');
  });

  // Unknown phase
  it('unknown phase returns empty array', () => {
    const hints = getContextualHints('UNKNOWN_PHASE', undefined, 'en');
    expect(hints).toEqual([]);
  });

  // Default lang is 'en'
  it('default lang is English', () => {
    const hints = getContextualHints('COMPLETE');
    expect(hints[0]).toContain('Sprint complete');
  });
});
