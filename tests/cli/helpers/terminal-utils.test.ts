import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTerminalWidth,
  truncateString,
  fitTable,
  clearLines,
  isInteractive,
} from '../../../src/cli/helpers/terminal-utils.js';

describe('getTerminalWidth', () => {
  const originalColumns = process.stdout.columns;

  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', {
      value: originalColumns,
      writable: true,
      configurable: true,
    });
  });

  it('returns process.stdout.columns when available', () => {
    Object.defineProperty(process.stdout, 'columns', {
      value: 120,
      writable: true,
      configurable: true,
    });
    expect(getTerminalWidth()).toBe(120);
  });

  it('returns 80 as fallback when columns is 0', () => {
    Object.defineProperty(process.stdout, 'columns', {
      value: 0,
      writable: true,
      configurable: true,
    });
    expect(getTerminalWidth()).toBe(80);
  });

  it('returns 80 as fallback when columns is undefined', () => {
    Object.defineProperty(process.stdout, 'columns', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(getTerminalWidth()).toBe(80);
  });
});

describe('truncateString', () => {
  it('returns string as-is when within max', () => {
    expect(truncateString('hello', 10)).toBe('hello');
  });

  it('truncates and adds ellipsis when exceeding max', () => {
    expect(truncateString('hello world', 8)).toBe('hello...');
  });

  it('returns empty string for max=0', () => {
    expect(truncateString('hello', 0)).toBe('');
  });

  it('returns string as-is when length equals max', () => {
    expect(truncateString('hello', 5)).toBe('hello');
  });

  it('handles max <= 3 without ellipsis', () => {
    expect(truncateString('hello', 2)).toBe('he');
  });

  it('handles max of exactly 3', () => {
    expect(truncateString('hello', 3)).toBe('hel');
  });

  it('handles empty string input', () => {
    expect(truncateString('', 5)).toBe('');
  });

  it('handles max of 4 with long string', () => {
    expect(truncateString('abcdefgh', 4)).toBe('a...');
  });
});

describe('fitTable', () => {
  it('renders headers and data', () => {
    const result = fitTable(['Name', 'Age'], [['Alice', '30']], 80);
    expect(result).toContain('Name');
    expect(result).toContain('Age');
    expect(result).toContain('Alice');
    expect(result).toContain('30');
  });

  it('includes separator line', () => {
    const result = fitTable(['A'], [['x']], 80);
    expect(result).toContain('-');
  });

  it('returns empty string for no columns', () => {
    expect(fitTable([], [], 80)).toBe('');
  });

  it('handles data wider than terminal width', () => {
    const result = fitTable(
      ['Col1', 'Col2'],
      [['a'.repeat(50), 'b'.repeat(50)]],
      40,
    );
    // Should not exceed width drastically — columns should be shrunk
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('aligns columns correctly', () => {
    const result = fitTable(['ID', 'Name'], [['1', 'Short'], ['2', 'Longer name']], 80);
    const lines = result.split('\n');
    // Header and data rows should be present
    expect(lines.length).toBe(4); // header + separator + 2 data rows
  });

  it('handles single column', () => {
    const result = fitTable(['Item'], [['apple'], ['banana']], 80);
    expect(result).toContain('apple');
    expect(result).toContain('banana');
  });
});

describe('clearLines', () => {
  it('returns empty string for 0 lines', () => {
    expect(clearLines(0)).toBe('');
  });

  it('returns empty string for negative lines', () => {
    expect(clearLines(-5)).toBe('');
  });

  it('returns ANSI escape sequences for positive count', () => {
    const result = clearLines(3);
    expect(result).toContain('\x1b[1A');
    expect(result).toContain('\x1b[2K');
  });

  it('produces correct number of escape pairs', () => {
    const result = clearLines(2);
    // Each line produces one pair: \x1b[1A\x1b[2K
    const matches = result.match(/\x1b\[1A\x1b\[2K/g);
    expect(matches).toHaveLength(2);
  });
});

describe('isInteractive', () => {
  it('returns a boolean', () => {
    const result = isInteractive();
    expect(typeof result).toBe('boolean');
  });
});
