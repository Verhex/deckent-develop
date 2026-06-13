import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/071-autonomous-enterprise.md');
const ROADMAP_PATH = join(process.cwd(), 'docs/archive/ROADMAP-GOD-LEVEL.md');

describe('ADR-071: F3 Autonomous Mode + F4 Enterprise', () => {
  it('ADR file exists with MADR structure (Context, Decision, Consequences, Alternatives, Status accepted)', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('contains autonomous+enterprise keywords (≥3 matches)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const matches = (content.match(/autonomous|self-dispatch|rbac|tenant|enterprise/gi) || []).length;
    expect(matches).toBeGreaterThanOrEqual(3);
  });

  it('covers both F3 autonomous and F4 enterprise sections in Decision', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toMatch(/FlowRuntime|flow-runtime|flow runtime/i);
    expect(content).toMatch(/SelfDispatchPolicy|self-dispatch/i);
    expect(content).toMatch(/requiresApproval/);
    expect(content).toMatch(/RBAC|role hierarchy|permission matrix/i);
    expect(content).toMatch(/audit.*writ|writeAuditEvent/i);
  });

  it('ROADMAP has Sprint 208 reference with autonomous/enterprise content', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/Sprint 208/);
    expect(content).toMatch(/zero-hardcode TAM/i);
    expect(content).toMatch(/self-dispatch|SelfDispatch/i);
  });

  it('ROADMAP F3-005 and F3-006 marked DONE (Sprint 208)', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/F3-005.*DONE.*Sprint 208/i);
    expect(content).toMatch(/F3-006.*DONE.*Sprint 208/i);
  });

  it('ROADMAP F5-001 and F5-002 show Sprint 208 progress', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf-8');
    expect(content).toMatch(/F5-001.*208/);
    expect(content).toMatch(/F5-002.*208/);
  });
});
