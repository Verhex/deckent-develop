// ─── Prompt-Cost Canary Bench Workload (7094) ────────────────────────────────
// A deliberately tiny, real, append-only workload used to produce BYTE-COMPARABLE
// twin sprints for the prompt-cost canary (baseline flags OFF vs candidate flags
// ON). Each measurement run adds exactly ONE next sequential case mirroring the
// existing shape, so both cohorts perform the same magnitude of real work. This
// module is production-inert on purpose: nothing imports it at runtime; it exists
// as the stable cross-sprint workload surface the 7094 A/B measurement edits.

export interface BenchCase {
  readonly id: number;
  readonly input: string;
  readonly expected: string;
}

/** Reverse the input and upper-case it — trivially verifiable per case. */
export function benchTransform(input: string): string {
  return input.split('').reverse().join('').toUpperCase();
}

export const BENCH_CASES: readonly BenchCase[] = [
  { id: 1, input: 'deckent', expected: 'TNEKCED' },
  { id: 2, input: 'signal', expected: 'LANGIS' },
  { id: 3, input: 'orbit', expected: 'TIBRO' },
  { id: 4, input: 'cobalt', expected: 'TLABOC' },
];
