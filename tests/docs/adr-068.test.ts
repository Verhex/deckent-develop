import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/068-enterprise-foundation.md');
const ROADMAP_PATH = join(process.cwd(), 'docs/ROADMAP-GOD-LEVEL.md');

describe('ADR-068: enterprise foundation', () => {
  it('ADR file exists', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
  });

  it('has MADR structure (Context, Decision, Consequences, Alternatives)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** proposed');
  });

  it('contains enterprise/audit query/scheduled keywords (≥2)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const matches = (content.match(/enterprise|audit.*query|scheduled/gi) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('ROADMAP F3-002 marked DONE', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/F3-002.*DONE/);
  });

  it('ROADMAP F4 section exists', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toContain('F4');
  });
});
