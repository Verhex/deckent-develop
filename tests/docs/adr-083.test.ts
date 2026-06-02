import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/083-repl-ux-provider-parity-local-model.md');
const MASTER_PLAN_PATH = join(process.cwd(), 'docs/MASTER-PLAN.md');

describe('ADR-083: REPL-UX-Evolution + Provider-Parity + Local-Model-Foundation', () => {
  it('ADR-083 file exists with MADR structure and accepted status', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('ADR-083 contains ≥4 of the required keywords (REPL, provider, parity, local, ollama)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const keywords = ['REPL', 'provider', 'parity', 'local', 'ollama'];
    const matches = keywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).length;
    expect(matches).toBeGreaterThanOrEqual(4);
  });

  it('MASTER-PLAN.md contains Sprint 221 reference and ADR-083', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toContain('221');
    expect(content).toContain('ADR-083');
  });
});
