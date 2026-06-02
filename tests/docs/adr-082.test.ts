import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/082-native-llm-nervous-dashboard-v2.md');
const MASTER_PLAN_PATH = join(process.cwd(), 'docs/MASTER-PLAN.md');

describe('ADR-082: Native-LLM-Wire + Nervous-Activation + Dashboard-v2', () => {
  it('ADR-082 file exists with MADR structure and accepted status', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('ADR-082 contains ≥3 of the required keywords (native, nervous, dashboard, wire)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const keywords = ['native', 'nervous', 'dashboard', 'wire'];
    const matches = keywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).length;
    expect(matches).toBeGreaterThanOrEqual(3);
  });

  it('MASTER-PLAN.md contains Sprint 220 reference and ADR-082', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toContain('220');
    expect(content).toContain('ADR-082');
  });
});
