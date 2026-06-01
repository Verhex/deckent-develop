import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/079-proof-of-function-dod.md');
const MASTER_PLAN_PATH = join(process.cwd(), 'docs/MASTER-PLAN.md');

describe('ADR-079: Proof-of-Function DoD + run-verify gate', () => {
  it('ADR-079 file exists with MADR structure and accepted status', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('ADR-079 contains proof-of-function, Tier-1, run-verify, and smoke keywords (≥3 matches)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const keywords = ['proof-of-function', 'Tier-1', 'run-verify', 'smoke', 'Smoke', 'user-surface'];
    const matches = keywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).length;
    expect(matches).toBeGreaterThanOrEqual(3);
  });

  it('ADR-079 covers all four decision areas: classification, gate, routing, regression guard', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toMatch(/isUserSurfaceTask|Tier classification|scope\.filesWrite/i);
    expect(content).toMatch(/verifyProofOfFunction|proof-of-function\.ts|smoke gate/i);
    expect(content).toMatch(/getDomainMatchBonus|routing.*surface|surface-aware/i);
    expect(content).toMatch(/test:e2e-surfaces|regression guard/i);
  });

  it('MASTER-PLAN marks Sprint 216 as DONE and F7-001 as FIXED', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toMatch(/\*\*216\*\*.*✅.*DONE/i);
    expect(content).toMatch(/F7-001.*FIXED|FIXED.*F7-001/i);
    const sprint216Matches = (content.match(/216/g) || []).length;
    expect(sprint216Matches).toBeGreaterThanOrEqual(1);
  });

  it('MASTER-PLAN §11 references ADR-079 and Sprint 216 implementation', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toMatch(/ADR-079/i);
    expect(content).toMatch(/implementation landed Sprint 216|Sprint 216.*impl/i);
  });
});
