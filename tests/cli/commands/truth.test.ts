import { describe, expect, it } from 'vitest';
import { renderTruthTable, type TruthRun } from '../../../src/cli/commands/truth.js';

describe('truth table renderer contract', () => {
  it('never serializes missing cells as JavaScript nullish text', () => {
    const run = {
      labels: { x: 'x' },
      halfWireCandidates: [],
      results: [{ id: 'x', code: 'ok', wired: undefined, enabled: null, proof: undefined }],
    } as unknown as TruthRun;
    const table = renderTruthTable(run, 'en');
    expect(table).not.toMatch(/undefined|null/);
  });
});
