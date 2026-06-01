import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/080-dashboard-god-level.md');
const MASTER_PLAN_PATH = join(process.cwd(), 'docs/MASTER-PLAN.md');

describe('ADR-080: Dashboard God-Level + Sprint-Start Detach', () => {
  it('ADR-080 file exists with MADR structure and accepted status', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('ADR-080 contains ≥3 of the required keywords (detach, dashboard, god-level, route, chat)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const keywords = ['detach', 'dashboard', 'god-level', 'route', 'chat'];
    const matches = keywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).length;
    expect(matches).toBeGreaterThanOrEqual(3);
  });

  it('ADR-080 references the key implementation decisions: startSprintDetached, App.tsx wiring, chat round-trip', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toMatch(/startSprintDetached|sprint-job-runner|detached.*child/i);
    expect(content).toMatch(/App\.tsx|route.*evolution|route.*nervous/i);
    expect(content).toMatch(/ChatPage|\/api\/chat|round-trip/i);
  });

  it('MASTER-PLAN §10 contains Sprint 218 entry describing dashboard god-level work', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toContain('218');
    expect(content).toMatch(/218.*Dashboard God-Level|Dashboard God-Level.*218/i);
  });

  it('MASTER-PLAN F7 section updated to ~95% with run-proven DONE for F7-003/006/009/010', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toMatch(/F7.*95%|95%.*F7|Dashboard.*95%/i);
    expect(content).toMatch(/F7-003.*DONE.*Sprint 218|Sprint 218.*run-proven/i);
  });
});
