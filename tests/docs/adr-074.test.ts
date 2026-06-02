import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/074-native-chat-enterprise-evolution.md');
const ROADMAP_PATH = join(process.cwd(), 'docs/archive/ROADMAP-GOD-LEVEL.md');

describe('ADR-074: Native Chat Real Round-Trip + Enterprise RBAC/Audit/Rate + F5 Evolution Wire', () => {
  it('ADR file exists with MADR structure (Context, Decision, Consequences, Alternatives Considered, Status accepted)', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('contains native chat, enterprise, evolution, and rate keywords (≥2 matches)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const matches = (content.match(/native chat|enterprise|evolution|rate/gi) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('covers F2, F4, and F5 sections in Decision', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toMatch(/Part A.*F2|F2.*native chat|native.*chat.*round.?trip/i);
    expect(content).toMatch(/Part B.*F4|F4.*enterprise|RBAC.*enforcement|enforceRbac/i);
    expect(content).toMatch(/Part C.*F5|F5.*evolution|prompt.?evolution|cross.?sprint/i);
  });

  it('ROADMAP has Sprint 211 reference with F2/F4/F5 content and updated maturity', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/Sprint 211/);
    expect(content).toMatch(/F4.*DONE|F4 enterprise.*TAMAMLANDI|enterprise.*tamamland/i);
    expect(content).toMatch(/F5.*evrimsel.*wire|prompt.?evolution.*wire|evolution.*wire/i);
    expect(content).toMatch(/F2.*native chat.*round.?trip|konuşulabilir.*%80|~%80/i);
  });
});
