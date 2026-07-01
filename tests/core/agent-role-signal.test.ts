// PCOMP-W5 (sprint-348-005 prompt analysis) — persona ROLE axis + routing signal.
// A reviewer persona (severity-report output format) on an implementation task is
// the known output-format-conflict class; the router now carries a role-mismatch
// penalty (−3: exactly cancels the +3 domain bonus, so a domain-specialized
// reviewer still competes on activation merit instead of being hard-excluded).

import { describe, it, expect } from 'vitest';
import { getAgentRole, BUILTIN_AGENT_ROLES } from '../../src/core/agent-pool.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import { getRoleMismatchPenalty } from '../../src/core/routing-engine.js';

function agent(id: string, role?: 'implementer' | 'reviewer' | 'analyst'): AgentDefinition {
  return { id, role } as unknown as AgentDefinition;
}

describe('PCOMP-W5: getAgentRole', () => {
  it('reads an explicit agent.json role first', () => {
    expect(getAgentRole(agent('security-auditor', 'implementer'))).toBe('implementer');
  });
  it('falls back to the builtin role map (census-grounded)', () => {
    expect(getAgentRole(agent('code-reviewer'))).toBe('reviewer');
    expect(getAgentRole(agent('security-auditor'))).toBe('reviewer');
    expect(getAgentRole(agent('accessibility-auditor'))).toBe('reviewer');
    expect(getAgentRole(agent('performance-analyzer'))).toBe('analyst');
    expect(getAgentRole(agent('architecture-planner'))).toBe('analyst');
    expect(getAgentRole(agent('bug-fixer'))).toBe('implementer');
    expect(getAgentRole(agent('api-builder'))).toBe('implementer');
  });
  it('defaults an unknown agent to implementer (never penalize the unknown)', () => {
    expect(getAgentRole(agent('some-custom-agent'))).toBe('implementer');
  });
  it('covers every builtin agent with a role', () => {
    // The domain map and the role map must cover the same builtin set.
    expect(Object.keys(BUILTIN_AGENT_ROLES).length).toBeGreaterThanOrEqual(15);
  });
});

describe('PCOMP-W5: getRoleMismatchPenalty', () => {
  it('penalizes a reviewer on an implementation-family kind', () => {
    expect(getRoleMismatchPenalty('reviewer', 'code-development')).toBe(-3);
    expect(getRoleMismatchPenalty('reviewer', 'security')).toBe(-3);
    expect(getRoleMismatchPenalty('analyst', 'refactor')).toBe(-3);
  });
  it('penalizes an implementer on an audit kind', () => {
    expect(getRoleMismatchPenalty('implementer', 'audit')).toBe(-3);
  });
  it('does not penalize matching combinations', () => {
    expect(getRoleMismatchPenalty('implementer', 'code-development')).toBe(0);
    expect(getRoleMismatchPenalty('implementer', 'test')).toBe(0);
    expect(getRoleMismatchPenalty('reviewer', 'audit')).toBe(0);
    expect(getRoleMismatchPenalty('analyst', 'audit')).toBe(0);
  });
  it('has no opinion without a task kind', () => {
    expect(getRoleMismatchPenalty('reviewer', undefined)).toBe(0);
  });
  it('is calibrated to exactly cancel the +3 domain bonus, not hard-exclude', () => {
    // A security-domain reviewer on a security implement task nets 0 extra
    // (+3 domain − 3 role) → decided on activation merit. Guard the calibration.
    expect(getRoleMismatchPenalty('reviewer', 'security')).toBe(-3);
  });
});
