import { describe, it, expect } from 'vitest';
import { trimMemoryWithHeader } from '../../src/orchestra/brain.js';

describe('trimMemoryWithHeader', () => {
  it('returns unchanged when lines under max', () => {
    const lines = ['line1', 'line2', 'line3'];
    const result = trimMemoryWithHeader(lines, 10);
    expect(result).toBe('line1\nline2\nline3');
  });

  it('returns unchanged when lines exactly at max', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
    const result = trimMemoryWithHeader(lines, 20);
    expect(result).toBe(lines.join('\n'));
  });

  it('preserves first 10 lines (header) and trims from middle when over max', () => {
    // 30 lines, max 20 — should keep first 10 (header) + last 10 (recent)
    const lines = Array.from({ length: 30 }, (_, i) => `line-${i}`);
    const result = trimMemoryWithHeader(lines, 20);
    const resultLines = result.split('\n');

    expect(resultLines).toHaveLength(20);
    // First 10 lines preserved (header)
    for (let i = 0; i < 10; i++) {
      expect(resultLines[i]).toBe(`line-${i}`);
    }
    // Last 10 lines preserved (recent entries, lines 20-29)
    for (let i = 0; i < 10; i++) {
      expect(resultLines[10 + i]).toBe(`line-${20 + i}`);
    }
    // Middle lines (10-19) should be trimmed
    expect(result).not.toContain('line-10');
    expect(result).not.toContain('line-15');
    expect(result).not.toContain('line-19');
  });

  it('handles empty array', () => {
    const result = trimMemoryWithHeader([], 10);
    expect(result).toBe('');
  });

  it('handles maxLines of 0', () => {
    const lines = ['a', 'b', 'c'];
    const result = trimMemoryWithHeader(lines, 0);
    // When maxLines is 0, headerEnd = min(10, 0) = 0, keepFromEnd = 0
    expect(result).toBe('');
  });

  it('handles maxLines smaller than header size', () => {
    // maxLines = 5, so headerEnd = min(10, 5) = 5, keepFromEnd = 0
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
    const result = trimMemoryWithHeader(lines, 5);
    const resultLines = result.split('\n');

    expect(resultLines).toHaveLength(5);
    // Only first 5 lines (partial header)
    for (let i = 0; i < 5; i++) {
      expect(resultLines[i]).toBe(`line-${i}`);
    }
  });

  it('preserves header content with real-world MEMORY.md format', () => {
    const lines = [
      '# Memory Index',
      '',
      '- [feedback.md](feedback.md) — feedback notes',
      '- [language.md](language.md) — language prefs',
      '',
      '# currentDate',
      'Today is 2026-03-19.',
      '',
      '## Sprint 20 Learnings',
      '- Learning A',
      // Lines 10+ are body content
      '- Old learning B',
      '- Old learning C',
      '- Old learning D',
      '- Old learning E',
      '- Old learning F',
      '## Sprint 21 Learnings',
      '- Recent learning G',
      '- Recent learning H',
      '- Recent learning I',
      '- Recent learning J',
    ];

    // 20 lines, max 15 — keep first 10 (header) + last 5 (recent)
    const result = trimMemoryWithHeader(lines, 15);
    const resultLines = result.split('\n');

    expect(resultLines).toHaveLength(15);
    // Header preserved
    expect(resultLines[0]).toBe('# Memory Index');
    expect(resultLines[9]).toBe('- Learning A');
    // Recent entries preserved
    expect(resultLines[14]).toBe('- Recent learning J');
    // Old middle entries trimmed
    expect(result).not.toContain('Old learning B');
  });

  it('single line array under max returns that line', () => {
    const result = trimMemoryWithHeader(['only-line'], 5);
    expect(result).toBe('only-line');
  });

  it('maxLines equal to header size keeps only header', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
    const result = trimMemoryWithHeader(lines, 10);
    const resultLines = result.split('\n');

    expect(resultLines).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(resultLines[i]).toBe(`line-${i}`);
    }
  });
});
