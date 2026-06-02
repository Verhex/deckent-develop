import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/067-process-mode-tenancy.md');
const ROADMAP_PATH = join(process.cwd(), 'docs/archive/ROADMAP-GOD-LEVEL.md');

describe('ADR-067: process mode tenancy', () => {
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

  it('contains tenant isolation and process mode keywords (≥2)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const matches = (content.match(/tenant|process.mode|isolation/gi) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('ROADMAP F2-003 marked DONE', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/F2-003.*DONE/);
  });

  it('ROADMAP F3-001 marked DONE', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/F3-001.*DONE/);
  });
});
