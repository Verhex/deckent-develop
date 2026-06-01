import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/078-ci-hermeticity-multiprovider-evolution.md');
const MASTER_PLAN_PATH = join(process.cwd(), 'docs/MASTER-PLAN.md');

describe('ADR-078: CI-Hermeticity + 8-Provider Runtime + Identity-Mutation + Dashboard', () => {
  it('ADR-078 file exists with MADR structure (Context, Decision, Consequences, Alternatives Considered, Status accepted)', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('contains hermeticity, provider, evolution, and dashboard keywords (≥3 matches)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const matches = (content.match(/hermeticity|provider|evolution|dashboard/gi) || []).length;
    expect(matches).toBeGreaterThanOrEqual(3);
  });

  it('covers all four decision parts: hermeticity, bootstrap, mutation, dashboard', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toMatch(/Part A.*CI-Hermeticity|test:ci-sim|sandbox-home/i);
    expect(content).toMatch(/Part B.*bootstrap|registerProvider|DEEPSEEK_API_KEY/i);
    expect(content).toMatch(/Part C.*identity.mutation|applyAdaptation|genealogy/i);
    expect(content).toMatch(/Part D.*Dashboard|EvolutionPage|NervousPage/i);
  });

  it('MASTER-PLAN contains Sprint 215 references (≥1 match)', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    const sprint215Matches = (content.match(/Sprint 215|ADR-078/g) || []).length;
    expect(sprint215Matches).toBeGreaterThanOrEqual(1);
  });
});
