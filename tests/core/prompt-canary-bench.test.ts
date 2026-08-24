import { describe, expect, it } from 'vitest';
import { BENCH_CASES, benchTransform } from '../../src/core/prompt-canary-bench.js';

describe('prompt-canary bench workload (7094 twin-run surface)', () => {
  it('every case transforms as declared', () => {
    for (const benchCase of BENCH_CASES) {
      expect(benchTransform(benchCase.input)).toBe(benchCase.expected);
    }
  });

  it('case ids are sequential from 1 with no gaps', () => {
    expect(BENCH_CASES.map(benchCase => benchCase.id))
      .toEqual(BENCH_CASES.map((_, index) => index + 1));
    expect(BENCH_CASES.at(-1)?.id).toBe(4);
  });
});
