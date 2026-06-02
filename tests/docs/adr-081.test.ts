import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/081-native-agentic-deckent.md');
const MASTER_PLAN_PATH = join(process.cwd(), 'docs/MASTER-PLAN.md');

describe('ADR-081: Native Agentic Deckent', () => {
  it('ADR-081 file exists with MADR structure and accepted status', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('ADR-081 contains ≥3 of the required keywords (native, agentic, REPL, streaming)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const keywords = ['native', 'agentic', 'REPL', 'streaming'];
    const matches = keywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).length;
    expect(matches).toBeGreaterThanOrEqual(3);
  });

  it('MASTER-PLAN.md contains Sprint 219 reference and F2-007 DONE', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toContain('219');
    expect(content).toMatch(/F2-007.*DONE.*Sprint 219|Sprint 219.*F2-007/i);
  });
});
