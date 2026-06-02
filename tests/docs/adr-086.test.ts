import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/086-native-cli-parity.md');
const MASTER_PLAN_PATH = join(process.cwd(), 'docs/MASTER-PLAN.md');

describe('ADR-086: Native CLI Parity (F11)', () => {
  it('ADR-086 file exists with MADR structure and accepted status', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('ADR-086 contains ≥4 of the required keywords (parity, terminal, agentic, streaming, permission)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const keywords = ['parity', 'terminal', 'agentic', 'streaming', 'permission'];
    const matches = keywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).length;
    expect(matches).toBeGreaterThanOrEqual(4);
  });

  it('MASTER-PLAN.md contains Sprint 224 reference and ADR-086', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toContain('224');
    expect(content).toContain('ADR-086');
  });
});
