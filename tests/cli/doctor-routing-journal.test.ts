import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkRoutingJournal } from '../../src/cli/commands/doctor-checks.js';

/** 673-005: routing decision-journal health surfaces in doctor. */
describe('doctor — routing journal health', () => {
  it('flags the legacy decisions-v3 rename leftover', () => {
    const r = mkdtempSync(join(tmpdir(), 'doctor-journal-'));
    mkdirSync(join(r, '.deckent', 'routing', 'decisions-v3'), { recursive: true });
    const check = checkRoutingJournal(r);
    expect(check.passed).toBe(false);
    expect(check.message).toContain('legacy decisions-v3');
  });

  it('reads the newest journal and reports corrupted lines', () => {
    const r = mkdtempSync(join(tmpdir(), 'doctor-journal-'));
    const dir = join(r, '.deckent', 'routing', 'decisions');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'sprint-001.jsonl'), '{ not json\n');
    const check = checkRoutingJournal(r);
    expect(check.passed).toBe(false);
    expect(check.message).toMatch(/corrupted line/u);
  });
});
