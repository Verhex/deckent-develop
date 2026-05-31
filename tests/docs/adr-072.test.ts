import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/072-routing-balance-dashboard.md');
const ROADMAP_PATH = join(process.cwd(), 'docs/ROADMAP-GOD-LEVEL.md');

describe('ADR-072: Agent Routing Balance + Dashboard API Auth', () => {
  it('ADR file exists with MADR structure (Context, Decision, Consequences, Alternatives Considered, Status accepted)', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('contains routing and dashboard/auth keywords (≥2 matches each)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const routingMatches = (content.match(/routing|multi-signal|domain-match|intent-classifier/gi) || []).length;
    const authMatches = (content.match(/dashboard|auth|localhost|auto-inject/gi) || []).length;
    expect(routingMatches).toBeGreaterThanOrEqual(2);
    expect(authMatches).toBeGreaterThanOrEqual(2);
  });

  it('covers both routing-balance and dashboard-auth in Decision section', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toMatch(/domain.?match bonus|domain-match/i);
    expect(content).toMatch(/intent-classifier|intent classifier/i);
    expect(content).toMatch(/localhost.*auto.?inject|auto.?inject.*localhost/i);
    expect(content).toMatch(/DECKENT_API_AUTH_DISABLED/);
  });

  it('ROADMAP has Sprint 209 reference with routing-balance and F7 content', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/Sprint 209/);
    expect(content).toMatch(/routing.*denge|agent routing dengeleme/i);
    expect(content).toMatch(/F7-001.*DONE|F7-001.*auth fix DONE/i);
  });

  it('ROADMAP F7-001 and F7-002 rows updated to Sprint 209 progress', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/F7-001.*Sprint 209/);
    expect(content).toMatch(/F7-002.*Sprint 209/);
  });
});
