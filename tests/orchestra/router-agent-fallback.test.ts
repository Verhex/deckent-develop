// ─── Router V2 Agent Fallback Chain Tests ─────────────────────────────────────
// Sprint 148 T-148-004: test-writer removed, fallback chain active

import { describe, it, expect } from 'vitest';
import {
  AGENT_FALLBACK_CHAIN,
  selectAgentByFallback,
} from '../../src/core/routing-engine.js';
import type { IntentType } from '../../src/core/routing-types.js';

// Simulated active agent IDs (post-T-148-001: test-writer removed)
const ACTIVE_AGENT_IDS = new Set([
  'architect',
  'security-auditor',
  'doc-writer',
  'bug-fixer',
  'code-reviewer',
  'refactorer',
  'api-builder',
  'performance-analyzer',
  'ci-guardian',
  'architecture-planner',
  'accessibility-auditor',
  'data-engineer',
  'devops-engineer',
  'frontend-designer',
  'migration-specialist',
  // Note: NO 'test-writer' — removed in T-148-001
]);

describe('AGENT_FALLBACK_CHAIN', () => {
  // born-638 (2026-07-11): construction-intent fallbacks must be Write-capable.
  // architect denies Write (agent.json deniedTools:['Write']) — routing a
  // construction task there produced a persona that cannot write the diff
  // (surfaced live by the born-628 prompt-gate on the runSprint path).
  it('T1: core-dev (implementation) → refactorer (Write-capable; architect denies Write)', () => {
    const result = selectAgentByFallback('implementation', ACTIVE_AGENT_IDS);
    expect(result).toBe('refactorer');
  });

  it('T2: documentation → doc-writer', () => {
    const result = selectAgentByFallback('documentation', ACTIVE_AGENT_IDS);
    expect(result).toBe('doc-writer');
  });

  it('T3: bugfix → bug-fixer', () => {
    const result = selectAgentByFallback('bugfix', ACTIVE_AGENT_IDS);
    expect(result).toBe('bug-fixer');
  });

  it('T4: security → security-auditor', () => {
    const result = selectAgentByFallback('security', ACTIVE_AGENT_IDS);
    expect(result).toBe('security-auditor');
  });

  it('T5: design (ui-dev) → frontend-designer', () => {
    const result = selectAgentByFallback('design', ACTIVE_AGENT_IDS);
    expect(result).toBe('frontend-designer');
  });

  it('T6: ACTIVE_AGENT_IDS does NOT contain test-writer', () => {
    expect(ACTIVE_AGENT_IDS.has('test-writer')).toBe(false);
  });

  it('T7: unknown primary → fallback bug-fixer (Write-capable, born-638)', () => {
    const result = selectAgentByFallback('unknown', ACTIVE_AGENT_IDS);
    expect(result).toBe('bug-fixer');
  });

  it('T8: unknown/legacy intent routes to bug-fixer (not test-writer)', () => {
    // Even if a legacy 'testing' string somehow arrives, fallback handles it safely
    // (testing was removed from IntentType in T-148-003)
    const result = selectAgentByFallback('unknown', ACTIVE_AGENT_IDS);
    expect(result).toBe('bug-fixer');
    expect(result).not.toBe('test-writer');
  });

  it('fallback chain covers all IntentType values', () => {
    const allIntents: IntentType[] = [
      'implementation', 'bugfix', 'refactor', 'documentation',
      'security', 'devops', 'config', 'performance', 'design', 'migration', 'unknown',
    ];
    for (const intent of allIntents) {
      expect(AGENT_FALLBACK_CHAIN[intent]).toBeDefined();
      expect(AGENT_FALLBACK_CHAIN[intent].length).toBeGreaterThan(0);
    }
  });

  it('first unavailable agent skipped, second in chain used', () => {
    // Remove refactorer from active set
    const limitedSet = new Set(ACTIVE_AGENT_IDS);
    limitedSet.delete('refactorer');
    const result = selectAgentByFallback('implementation', limitedSet);
    expect(result).toBe('bug-fixer'); // second in chain
  });

  it('all agents unavailable → ultimate fallback bug-fixer (Write-capable, born-638)', () => {
    const emptySet = new Set<string>();
    const result = selectAgentByFallback('documentation', emptySet);
    // doc-writer not in empty set, ultimate fallback
    expect(result).toBe('bug-fixer');
  });
});
