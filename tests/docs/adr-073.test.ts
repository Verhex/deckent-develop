import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/073-routing-fix-dashboard.md');
const ROADMAP_PATH = join(process.cwd(), 'docs/archive/ROADMAP-GOD-LEVEL.md');

describe('ADR-073: Routing Live Validation + FIX Prompt Enrichment + Dashboard Control Plane', () => {
  it('ADR file exists with MADR structure (Context, Decision, Consequences, Alternatives Considered, Status accepted)', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('contains routing, fix prompt, and dashboard keywords (≥2 matches each)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const routingMatches = (content.match(/routing|multi-signal|domain-match|diversity/gi) || []).length;
    const fixMatches = (content.match(/fix.*prompt|fix.*description|FIX prompt|debt-manager|NO_GO.*reason/gi) || []).length;
    const dashboardMatches = (content.match(/dashboard|SprintControlPanel|RoutingDistribution|Onboarding/gi) || []).length;
    expect(routingMatches).toBeGreaterThanOrEqual(2);
    expect(fixMatches).toBeGreaterThanOrEqual(2);
    expect(dashboardMatches).toBeGreaterThanOrEqual(2);
  });

  it('covers routing live validation, FIX prompt enrichment, and dashboard sections in Decision', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toMatch(/Part A.*Routing|routing.*live.*valid/i);
    expect(content).toMatch(/Part B.*FIX|FIX.*Prompt/i);
    expect(content).toMatch(/Part C.*Dashboard|Dashboard.*Control/i);
    expect(content).toMatch(/selectFixAgent|fix.*agent.*selection/i);
    expect(content).toMatch(/F7-005|F7-008/);
  });

  it('ROADMAP has Sprint 210 reference with routing-balance, FIX prompt, and F7 content', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/Sprint 210/);
    expect(content).toMatch(/routing.*canlı|routing.*live|routing.*diversity/i);
    expect(content).toMatch(/FIX prompt|fix.*prompt|debt-manager/i);
  });

  it('ROADMAP F7-005 and F7-008 rows updated to Sprint 210 progress', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/F7-005.*Sprint 210|Sprint 210.*F7-005/i);
    expect(content).toMatch(/F7-008.*Sprint 210|Sprint 210.*F7-008/i);
  });
});
