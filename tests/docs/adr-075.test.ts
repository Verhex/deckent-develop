import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/075-evolution-runtime-wiring.md');
const MASTER_PLAN_PATH = join(process.cwd(), 'docs/MASTER-PLAN.md');

describe('ADR-075: F5 Evolution Runtime Wiring + Routing Skill→Agent Affinity + Managed-Docs Code-Derived Counts', () => {
  it('ADR file exists with MADR structure (Context, Decision, Consequences, Alternatives Considered, Status accepted)', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('contains evolution, runtime, caller, routing, and affinity keywords (≥2 matches)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const matches = (content.match(/evolution|runtime|caller|routing|affinity/gi) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('covers all three decision parts: F5 callers, skill→agent signal, code-derived counts', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toMatch(/Part A.*F5.*caller|F5.*runtime.*caller|external caller/i);
    expect(content).toMatch(/SKILL_AGENT_MAP|skill.*agent.*affinity|routing.*skew/i);
    expect(content).toMatch(/countModules|code.derived|readdirSync/i);
  });

  it('MASTER-PLAN has F5-004 and Sprint 212 references with updated F5 status', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toMatch(/Sprint 212/);
    expect(content).toMatch(/F5-004/);
    expect(content).toMatch(/ADR-075/);
    expect(content).toMatch(/W-E.*done|done.*W-E/i);
  });
});
