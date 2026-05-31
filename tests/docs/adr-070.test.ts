import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/070-brain-eval-integrity.md');
const ROADMAP_PATH = join(process.cwd(), 'docs/ROADMAP-GOD-LEVEL.md');

describe('ADR-070: Brain Evaluation Integrity + Zero-Hard-Code', () => {
  it('ADR file exists with MADR structure (Context, Decision, Consequences, Alternatives, Status accepted)', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('contains coverage/signal/zero-hard/rbac keywords (≥2 matches)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const matches = (content.match(/coverage|signal|zero-hard|rbac/gi) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('ROADMAP has zero-hardcode Sprint 207 reference', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/zero-hardcode|zero-hard-code/i);
    expect(content).toMatch(/Sprint 207/);
  });

  it('ROADMAP Brain-fix DONE and F4-001 RBAC wire referenced', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/Brain-fix.*DONE/);
    expect(content).toMatch(/F4-001.*RBAC.*wire|F4-001.*gate.*wire/i);
  });
});
