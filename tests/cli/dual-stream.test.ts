// tests/cli/dual-stream.test.ts
// Allocation-matrix tests for composeDualStream (Sprint 354, Task 354-004).
// Pure module — no Ink, no React, no I/O; every assertion is a plain array/string check.

import { describe, it, expect } from 'vitest';
import {
  composeDualStream,
  DEFAULT_DUAL_STREAM_LABELS,
  type DualStreamInput,
} from '../../src/cli/repl/dual-stream.js';

const STATUS = ['Running: sprint-354', 'Elapsed: 3m', 'Provider: claude (healthy)'];
const APPROVAL = ['Approve shell-exec? (y/n/a/d)', 'Risk: Çalıştır', 'cmd: npm test --silent'];

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
    const result = composeDualStream({ statusLines: STATUS, approvalLines: [], width: 80, height: 2 });
    expect(result).toEqual([STATUS[0], DEFAULT_DUAL_STREAM_LABELS.overflow]);
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
      const result = composeDualStream({ statusLines: STATUS, approvalLines: APPROVAL, width, height });
      expect(result.length).toBeLessThanOrEqual(height);
      for (const line of result) {
        expect(line.length).toBeLessThanOrEqual(Math.max(1, width));
      }
    });
  }

  it('truncates individual lines to width with an ellipsis', () => {
    const result = composeDualStream({ statusLines: ['a very long status line here'], approvalLines: [], width: 10, height: 5 });
    expect(result).toEqual(['a very lo…']);
    expect(result[0].length).toBe(10);
  });

  it('truncates to a single character at width=1', () => {
    const result = composeDualStream({ statusLines: ['hello'], approvalLines: [], width: 1, height: 5 });
    expect(result).toEqual(['h']);
  });
});

describe('composeDualStream — determinism', () => {
  it('returns byte-identical output for identical input across repeated calls', () => {
    const input: DualStreamInput = { statusLines: STATUS, approvalLines: APPROVAL, width: 40, height: 3 };
    const first = composeDualStream(input);
    const second = composeDualStream(input);
    const third = composeDualStream({ ...input, statusLines: [...STATUS], approvalLines: [...APPROVAL] });
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

  it('defaults to the English ellipsis marker when no labels are supplied', () => {
    const result = composeDualStream({ statusLines: STATUS, approvalLines: [], width: 80, height: 2 });
    expect(result[1]).toBe(DEFAULT_DUAL_STREAM_LABELS.overflow);
  });
});

describe('composeDualStream — approval-region overflow marker (allocated >= 2)', () => {
  it('crops the approval region with a marker when it gets 2+ rows but still overflows', () => {
    const manyApproval = ['a0', 'a1', 'a2', 'a3', 'a4'];
    const result = composeDualStream({ statusLines: ['s0'], approvalLines: manyApproval, width: 80, height: 5 });
    // statusFloor=1 -> approvalRows=min(5,4)=4 -> crop: 3 real + marker
    // remainingForStatus=5-4=1 -> statusRows=1 -> [s0] fits, no crop
    expect(result).toEqual(['a0', 'a1', 'a2', DEFAULT_DUAL_STREAM_LABELS.overflow, 's0']);
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
