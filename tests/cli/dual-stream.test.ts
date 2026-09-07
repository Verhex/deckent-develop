// tests/cli/dual-stream.test.ts
// Allocation-matrix tests for composeDualStream (Sprint 354, Task 354-004).
// Pure module — no Ink, no React, no I/O; every assertion is a plain array/string check.

import { describe, it, expect } from 'vitest';
import {
  clipTerminalCells,
  composeDualStream,
  type DualStreamInput,
} from '../../src/cli/repl/dual-stream.js';
import { displayWidth } from '../../src/cli/repl/cursor-model.js';
import { InjectedLabelMissingError } from '../../src/cli/helpers/injected-label.js';
import { theme } from '../../src/cli/helpers/theme.js';

const STATUS = ['Running: sprint-354', 'Elapsed: 3m', 'Provider: claude (healthy)'];
const APPROVAL = ['Approve shell-exec? (y/n/a/d)', 'Risk: Çalıştır', 'cmd: npm test --silent'];
const UNICODE = { labels: { overflow: '…' } } as const;
const ASCII = { labels: { overflow: '...' } } as const;

describe('composeDualStream — basic composition', () => {
  it('returns both regions, approval first, when everything fits', () => {
    const result = composeDualStream({ statusLines: STATUS, approvalLines: APPROVAL, width: 80, height: 10 });
    expect(result).toEqual([...APPROVAL, ...STATUS]);
  });

  it('returns [] when height is 0', () => {
    const result = composeDualStream({ statusLines: STATUS, approvalLines: APPROVAL, width: 80, height: 0 });
    expect(result).toEqual([]);
  });

  it('returns [] when both inputs are empty, regardless of height', () => {
    const result = composeDualStream({ statusLines: [], approvalLines: [], width: 80, height: 5 });
    expect(result).toEqual([]);
  });
});

describe('composeDualStream — approval-yokken tam-status (full status with no approval)', () => {
  it('shows full status when approval is empty and it fits', () => {
    const result = composeDualStream({ statusLines: STATUS, approvalLines: [], width: 80, height: 10 });
    expect(result).toEqual(STATUS);
  });

  it('shows full status up to height with no approval competing, cropping only on true overflow', () => {
    const result = composeDualStream({ statusLines: STATUS, approvalLines: [], width: 80, height: 3 });
    expect(result).toEqual(STATUS);
  });

  it('crops status with the overflow marker when status alone exceeds height', () => {
    const result = composeDualStream({ statusLines: STATUS, approvalLines: [], width: 80, height: 2 }, UNICODE);
    expect(result).toEqual([STATUS[0], '…']);
  });
});

describe('composeDualStream — status never fully disappears (min-1 line)', () => {
  it('reserves 1 status line even when approval wants all remaining room', () => {
    const result = composeDualStream({ statusLines: STATUS, approvalLines: APPROVAL, width: 80, height: 4 });
    // height=4: statusFloor=1 -> approvalRows=min(3,3)=3 (fits exactly) -> remainingForStatus=1 -> statusRows=1
    expect(result).toEqual([...APPROVAL, STATUS[0]]);
  });

  it('gives 1 real line to each region rather than a bare marker when both are squeezed to 1 row', () => {
    const result = composeDualStream({ statusLines: STATUS, approvalLines: APPROVAL, width: 80, height: 2 });
    // height=2: statusFloor=1 -> approvalRows=min(3,1)=1 -> allocated=1 -> real content wins over a bare marker
    expect(result).toEqual([APPROVAL[0], STATUS[0]]);
  });

  it('documented edge case: height=1 with both non-empty gives the single row to status', () => {
    const result = composeDualStream({ statusLines: STATUS, approvalLines: APPROVAL, width: 80, height: 1 });
    expect(result).toEqual([STATUS[0]]);
  });

  it('approval gets the single row when status is empty', () => {
    const result = composeDualStream({ statusLines: [], approvalLines: APPROVAL, width: 80, height: 1 });
    expect(result).toEqual([APPROVAL[0]]);
  });
});

describe('composeDualStream — narrow/short terminal allocation matrix', () => {
  const matrix: Array<{ width: number; height: number }> = [
    { width: 1, height: 1 },
    { width: 1, height: 2 },
    { width: 5, height: 1 },
    { width: 5, height: 3 },
    { width: 10, height: 0 },
    { width: 80, height: 1 },
    { width: 80, height: 2 },
    { width: 80, height: 6 },
  ];

  for (const { width, height } of matrix) {
    it(`fits within height=${height} width=${width}`, () => {
      const result = composeDualStream({ statusLines: STATUS, approvalLines: APPROVAL, width, height }, UNICODE);
      expect(result.length).toBeLessThanOrEqual(height);
      for (const line of result) {
        expect(displayWidth(line)).toBeLessThanOrEqual(Math.max(1, width));
      }
    });
  }

  it('truncates individual lines to width with an ellipsis', () => {
    const result = composeDualStream({ statusLines: ['a very long status line here'], approvalLines: [], width: 10, height: 5 }, UNICODE);
    expect(result).toEqual(['a very lo…']);
    expect(result[0].length).toBe(10);
  });

  it('truncates to a single character at width=1', () => {
    const result = composeDualStream({ statusLines: ['hello'], approvalLines: [], width: 1, height: 5 }, UNICODE);
    expect(result).toEqual(['…']);
  });

  it.each([
    { width: Number.NaN, height: 2, expected: ['…'] },
    { width: Number.POSITIVE_INFINITY, height: 2, expected: ['…'] },
    { width: 8, height: Number.NaN, expected: [] },
    { width: 8, height: Number.POSITIVE_INFINITY, expected: [] },
  ])('normalizes non-finite dimensions without unbounded allocation: $width × $height', ({ width, height, expected }) => {
    expect(composeDualStream({ statusLines: ['long status'], approvalLines: [], width, height }, UNICODE)).toEqual(expected);
  });
});

describe('composeDualStream — determinism', () => {
  it('returns byte-identical output for identical input across repeated calls', () => {
    const input: DualStreamInput = { statusLines: STATUS, approvalLines: APPROVAL, width: 40, height: 3 };
    const first = composeDualStream(input, UNICODE);
    const second = composeDualStream(input, UNICODE);
    const third = composeDualStream({ ...input, statusLines: [...STATUS], approvalLines: [...APPROVAL] }, UNICODE);
    expect(first).toEqual(second);
    expect(first).toEqual(third);
  });
});

describe('composeDualStream — i18n seam (label injection)', () => {
  it('uses the injected overflow label instead of the English default', () => {
    const result = composeDualStream(
      { statusLines: STATUS, approvalLines: [], width: 80, height: 2 },
      { labels: { overflow: '(daha fazla)' } },
    );
    expect(result).toEqual([STATUS[0], '(daha fazla)']);
  });

  it('fails closed only when overflow is actually needed and the caller omitted the marker', () => {
    expect(() => composeDualStream({ statusLines: STATUS, approvalLines: [], width: 80, height: 2 }))
      .toThrow(InjectedLabelMissingError);
    expect(composeDualStream({ statusLines: ['fits'], approvalLines: [], width: 80, height: 2 })).toEqual(['fits']);
  });
});

describe('composeDualStream — approval-region overflow marker (allocated >= 2)', () => {
  it('crops the approval region with a marker when it gets 2+ rows but still overflows', () => {
    const manyApproval = ['a0', 'a1', 'a2', 'a3', 'a4'];
    const result = composeDualStream({ statusLines: ['s0'], approvalLines: manyApproval, width: 80, height: 5 }, UNICODE);
    // statusFloor=1 -> approvalRows=min(5,4)=4 -> crop: 3 real + marker
    // remainingForStatus=5-4=1 -> statusRows=1 -> [s0] fits, no crop
    expect(result).toEqual(['a0', 'a1', 'a2', '…', 's0']);
  });
});

describe('composeDualStream — display-cell and grapheme safety', () => {
  it.each([0, -4, Number.NaN, Number.POSITIVE_INFINITY])('direct clip normalizes width=%s to one finite cell', (width) => {
    expect(clipTerminalCells('状态', width, '…')).toBe('…');
  });
  it.each([
    ['CJK', '状态正常', 5],
    ['combining', 'Cafe\u0301 status', 6],
    ['emoji ZWJ', '👨‍👩‍👧‍👦 family status', 5],
  ])('%s truncation stays within cells and never splits a grapheme', (_name, line, width) => {
    const result = composeDualStream({ statusLines: [line], approvalLines: [], width, height: 1 }, UNICODE);
    expect(displayWidth(result[0]!)).toBeLessThanOrEqual(width);
    expect(result[0]!.endsWith('…')).toBe(true);
    expect(result[0]!).not.toContain('\uFFFD');
  });

  it('uses the caller-selected ASCII marker within the same cell budget', () => {
    const [line] = composeDualStream({ statusLines: ['状态 normal'], approvalLines: [], width: 6, height: 1 }, ASCII);
    expect(line).toBe('状...');
    expect(displayWidth(line!)).toBe(5);
  });

  it.each([
    ['CJK', '状态x'],
    ['ZWJ emoji', '👨‍👩‍👧‍👦 family'],
  ])('renders marker-only when a %s grapheme cannot fit before the width-4 ASCII marker', (_name, text) => {
    expect(composeDualStream({ statusLines: [text], approvalLines: [], width: 4, height: 1 }, ASCII))
      .toEqual(['...']);
  });

  it.each([
    [1, '…'],
    [2, '…'],
  ])('keeps a wide grapheme atomic at width=%i', (width, expected) => {
    const [line] = composeDualStream({ statusLines: ['状态'], approvalLines: [], width, height: 1 }, UNICODE);
    expect(line).toBe(expected);
    expect(displayWidth(line!)).toBeLessThanOrEqual(width);
  });

  it('does not split ANSI sequences while truncating visible cells', () => {
    const [line] = composeDualStream({ statusLines: ['\x1b[31m状态abcdef\x1b[0m'], approvalLines: [], width: 6, height: 1 }, UNICODE);
    expect(line).toMatch(/^\x1b\[31m/);
    const visible = theme.strip(line!);
    expect(displayWidth(visible)).toBeLessThanOrEqual(6);
    expect(visible.endsWith('…')).toBe(true);
    expect(line!.endsWith('\x1b[0m')).toBe(true);
  });

  it.each([
    ['BEL', '\x07'],
    ['ST', '\x1b\\'],
  ])('closes an OSC 8 link using its %s terminator before the overflow marker', (_name, terminator) => {
    const open = `\x1b]8;id=deckent;https://example.invalid${terminator}`;
    const close = `\x1b]8;;${terminator}`;
    const [line] = composeDualStream({
      statusLines: [`${open}abcdef${close}`],
      approvalLines: [],
      width: 4,
      height: 1,
    }, UNICODE);
    expect(line).toBe(`${open}abc${close}…`);
    expect(line!.replace(/\x1b\]8;[^;]*;[^\x07\x1b]*(?:\x07|\x1b\\)/gu, '')).toBe('abc…');
    expect(displayWidth(line!.replace(/\x1b\]8;[^;]*;[^\x07\x1b]*(?:\x07|\x1b\\)/gu, ''))).toBe(4);
  });

  it('orders OSC 8 close before marker and SGR reset for combined styled links', () => {
    const sgrOpen = '\x1b[31m';
    const oscOpen = '\x1b]8;id=combined;https://example.invalid\x07';
    const oscClose = '\x1b]8;;\x07';
    const [line] = composeDualStream({
      statusLines: [`${sgrOpen}${oscOpen}abcdef${oscClose}\x1b[0m`],
      approvalLines: [],
      width: 4,
      height: 1,
    }, UNICODE);
    expect(line).toBe(`${sgrOpen}${oscOpen}abc${oscClose}…\x1b[0m`);
    expect(line!.indexOf(oscClose)).toBeLessThan(line!.indexOf('…'));
    expect(line!.indexOf('…')).toBeLessThan(line!.lastIndexOf('\x1b[0m'));
  });
});

describe('composeDualStream — surplus reallocation', () => {
  it('gives status extra rows when approval needs less than its reserved share', () => {
    const result = composeDualStream({
      statusLines: STATUS,
      approvalLines: ['only one approval line'],
      width: 80,
      height: 4,
    });
    // approvalRows = min(1, 4-1=3) = 1 (fits, no crop) -> remainingForStatus = 3 -> statusRows = min(3,3) = 3
    expect(result).toEqual(['only one approval line', ...STATUS]);
  });
});
