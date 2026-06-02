import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/069-event-driven-rbac.md');
const ROADMAP_PATH = join(process.cwd(), 'docs/archive/ROADMAP-GOD-LEVEL.md');

describe('ADR-069: event-driven triggers + RBAC', () => {
  it('ADR file exists', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
  });

  it('has MADR structure (Context, Decision, Consequences, Alternatives, Status proposed)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** proposed');
  });

  it('contains event-driven/webhook/rbac keywords (≥2)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const matches = (content.match(/event-driven|webhook|rbac|RBAC/gi) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('ROADMAP F3-003 marked DONE', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/F3-003.*DONE/);
  });

  it('ROADMAP F4-001 has rbac reference', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/F4-001.*[Rr][Bb][Aa][Cc]/);
  });
});
