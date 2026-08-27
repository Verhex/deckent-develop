import { afterEach, describe, expect, it } from 'vitest';
import { renderTruthTable, type TruthRun } from '../../src/cli/commands/truth.js';

function run(proof: unknown, wired: unknown = 'ok'): TruthRun {
  return {
    labels: { feature: 'Feature' },
    halfWireCandidates: [],
    results: [{
      id: 'feature', code: 'ok', wired, enabled: null, proof,
    }] as unknown as TruthRun['results'],
  };
}

afterEach(() => { delete process.env.NO_COLOR; });

describe('truth proof rendering', () => {
  it('uses the typed catalog dash when proof is absent', () => {
    process.env.NO_COLOR = '1';
    const rendered = renderTruthTable(run(undefined), 'en');
    expect(rendered).toContain('—');
    expect(rendered).not.toContain('undefined');
    expect(rendered).not.toContain('null');
  });

  it('sanitizes raw nullish spellings in every cell', () => {
    process.env.NO_COLOR = '1';
    const rendered = renderTruthTable(run('null', 'undefined'), 'en');
    expect(rendered).not.toContain('undefined');
    expect(rendered).not.toContain('null');
  });
});
