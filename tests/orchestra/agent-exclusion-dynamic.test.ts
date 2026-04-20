// ─── Agent Exclusion Dynamic Tests ──────────────────────────────────────────
// Tests for getDynamicExclusions() — context-aware agent exclusion
// based on intent + scope (replaces hard-coded global exclusion).

import { describe, it, expect } from 'vitest';
import { getDynamicExclusions } from '../../src/core/activation-engine.js';

describe('getDynamicExclusions', () => {
  // Test 1: documentation intent excludes migration-specialist, devops-engineer, security-auditor
  it('documentation intent → exclude migration-specialist, devops-engineer, security-auditor', () => {
    const result = getDynamicExclusions('documentation', ['docs/']);
    expect(result).toContain('migration-specialist');
    expect(result).toContain('devops-engineer');
    expect(result).toContain('security-auditor');
    // Should NOT exclude doc-writer for documentation tasks
    expect(result).not.toContain('doc-writer');
  });

  // Test 2: src/orchestra/ scope excludes frontend-designer, accessibility-auditor
  it('src/orchestra/ scope → exclude frontend-designer, accessibility-auditor', () => {
    const result = getDynamicExclusions('implementation', ['src/orchestra/']);
    expect(result).toContain('frontend-designer');
    expect(result).toContain('accessibility-auditor');
    // Should NOT exclude orchestration-relevant agents
    expect(result).not.toContain('architect');
    expect(result).not.toContain('refactorer');
  });

  // Test 3: src/cli/ scope excludes frontend-designer, accessibility-auditor, migration-specialist
  it('src/cli/ scope → exclude frontend-designer, accessibility-auditor, migration-specialist', () => {
    const result = getDynamicExclusions('implementation', ['src/cli/']);
    expect(result).toContain('frontend-designer');
    expect(result).toContain('accessibility-auditor');
    expect(result).toContain('migration-specialist');
  });

  // Test 4: src/dashboard/ scope excludes data-engineer, migration-specialist
  it('src/dashboard/ scope → exclude data-engineer, migration-specialist', () => {
    const result = getDynamicExclusions('implementation', ['src/dashboard/']);
    expect(result).toContain('data-engineer');
    expect(result).toContain('migration-specialist');
    // Should NOT exclude frontend-designer for dashboard (that's UI work)
    expect(result).not.toContain('frontend-designer');
  });

  // Test 5: security intent → empty exclusion
  it('security intent → no exclusions', () => {
    const result = getDynamicExclusions('security', ['src/core/']);
    expect(result).toHaveLength(0);
  });

  // Test 6: combined intent + scope → merged exclusions (no duplicates)
  it('documentation intent + src/cli/ scope → merged unique exclusions', () => {
    const result = getDynamicExclusions('documentation', ['src/cli/']);
    // Intent: migration-specialist, devops-engineer, security-auditor
    // Scope: frontend-designer, accessibility-auditor, migration-specialist
    // Merged (deduplicated):
    expect(result).toContain('migration-specialist');
    expect(result).toContain('devops-engineer');
    expect(result).toContain('security-auditor');
    expect(result).toContain('frontend-designer');
    expect(result).toContain('accessibility-auditor');
    // No duplicates — migration-specialist appears from both intent and scope
    const migrationCount = result.filter(a => a === 'migration-specialist').length;
    expect(migrationCount).toBe(1);
  });

  // Test 7: old 3 agents NOT globally excluded — architecture-planner, frontend-designer,
  // migration-specialist should be available for appropriate tasks
  it('previously hard-coded agents are NOT globally excluded', () => {
    // architecture-planner should be available for architecture tasks
    const archResult = getDynamicExclusions('implementation', ['src/core/']);
    expect(archResult).not.toContain('architecture-planner');

    // frontend-designer should be available for dashboard tasks
    const dashResult = getDynamicExclusions('design', ['src/dashboard/']);
    expect(dashResult).not.toContain('frontend-designer');

    // migration-specialist should be available for migration tasks
    const migResult = getDynamicExclusions('migration', ['src/core/']);
    expect(migResult).not.toContain('migration-specialist');
  });

  // Test 8: Sprint 146 integration scenario — diverse tasks get different exclusions
  it('Sprint 146 scenario: different tasks get different exclusions', () => {
    // Prompt God Template task (src/orchestra/) — should exclude frontend/a11y
    const promptTask = getDynamicExclusions('implementation', ['src/orchestra/']);
    expect(promptTask).toContain('frontend-designer');

    // Doc update task (docs/) — should exclude migration/devops/security
    const docTask = getDynamicExclusions('documentation', ['docs/']);
    expect(docTask).toContain('migration-specialist');
    expect(docTask).toContain('devops-engineer');
    expect(docTask).toContain('security-auditor');

    // Security audit task — security intent has no intent-based exclusions
    // but scope-based exclusions still apply (src/orchestra/ → frontend-designer, accessibility-auditor)
    const secTask = getDynamicExclusions('security', ['src/core/']);
    expect(secTask).toHaveLength(0);

    // CLI task — should exclude frontend/a11y/migration
    const cliTask = getDynamicExclusions('bugfix', ['src/cli/']);
    expect(cliTask).toContain('frontend-designer');
    expect(cliTask).toContain('migration-specialist');

    // All four tasks have DIFFERENT exclusion sets
    const sets = [promptTask, docTask, secTask, cliTask].map(e => JSON.stringify(e.sort()));
    const uniqueSets = new Set(sets);
    expect(uniqueSets.size).toBeGreaterThanOrEqual(3); // at least 3 different exclusion patterns
  });
});
