import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..', '..');

// ─── Decision Matrix Document Schema ─────────────────────────────────────

describe('dead-code-decisions.md schema', () => {
  const decisionPath = join(projectRoot, 'docs', 'audits', 'sprint-139', 'dead-code-decisions.md');

  it('decision matrix document exists', () => {
    expect(existsSync(decisionPath)).toBe(true);
  });

  it('contains all required sections', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // Title and metadata
    expect(content).toContain('# Dead Code Audit — Decision Matrix');
    expect(content).toContain('ADR Reference:');

    // Decision categories definition
    expect(content).toContain('## Decision Categories');
    expect(content).toContain('Remove');
    expect(content).toContain('Defer + ADR');
    expect(content).toContain('Deprecate + Warning');

    // Summary matrix
    expect(content).toContain('## Summary Matrix');

    // Detailed decisions section for each module
    expect(content).toContain('## Detailed Decisions');

    // Execute checklist for Sprint 140
    expect(content).toContain('## Execute Checklist');

    // Risk summary
    expect(content).toContain('## Risk Summary');
  });

  it('covers all 11 modules from the audit report', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // 6 Dead modules
    expect(content).toContain('learning-decay.ts');
    expect(content).toContain('learning-migration.ts');
    expect(content).toContain('combination-scorer.ts');
    expect(content).toContain('handoff-protocol.ts');
    expect(content).toContain('batch-stats.ts');
    expect(content).toContain('brain-context.ts');

    // 4 Dormant modules
    expect(content).toContain('decision-engine.ts');
    expect(content).toContain('decision-replay.ts');
    expect(content).toContain('agent-step.ts');
    expect(content).toContain('scope-step.ts');

    // 1 False positive
    expect(content).toContain('parallel-pipeline.ts');
  });

  it('has decision rationale for each detailed entry', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // Each detailed decision should have a rationale section
    expect(content).toContain('Decision Rationale');

    // Each should have risk assessment
    expect(content).toContain('Risk Assessment');

    // Each should have rollback plan
    expect(content).toContain('Rollback Plan');
  });

  it('assigns correct decisions: 3 Remove, 3 Defer, 4 Deprecate, 1 False Positive', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // Summary should reflect correct counts
    expect(content).toContain('Remove: 3 modules');
    expect(content).toContain('Defer: 3 modules');
    expect(content).toContain('Deprecate: 4 modules');
    expect(content).toContain('False Positive: 1 module');
  });

  it('Remove decisions include only low-value modules', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // learning-decay, learning-migration, batch-stats should be Remove
    const summarySection = content.split('## Summary Matrix')[1]?.split('## Detailed')[0] || '';

    // Check that Remove is assigned to the correct modules
    expect(summarySection).toContain('learning-decay.ts');
    expect(summarySection).toContain('learning-migration.ts');
    expect(summarySection).toContain('batch-stats.ts');
  });

  it('Defer decisions reference future sprint reassessment', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // Deferred modules should have reassessment timeline
    expect(content).toContain('Sprint 145');
    expect(content).toContain('Sprint 142');
    expect(content).toContain('Reassessment');
  });
});

// ─── ADR-038 Write Verification ──────────────────────────────────────────
//
// Taxonomy migration (2026-06-30 redesign): ADR-038 (Dead Code Disposition) no longer exists as
// its own numbered entry. Per .analysis/adr-review-crosswalk.md (line 55), it was archived and its
// durable policy folded into **adr-d-006** ("Code Architecture Conventions") — the Sprint-139
// audit/module list stays a historical record (verified above), only the 4-tier disposition
// policy carries forward as an active convention. decisions.md keeps the absorption record as an
// uppercase "ADR-038" prose reference inside the adr-d-006 block (no lowercase `adr-038` id exists
// any more), so these assertions target adr-d-006 and content-grep for the ADR-038 reference.

describe('ADR-038 dead-code policy — absorbed into adr-d-006', () => {
  // Memory V2 migration: DECISIONS.md no longer exists. ADRs are in exports/decisions.md
  const decisionsPath = join(projectRoot, '.brain', 'exports', 'decisions.md');

  function getSuccessorBlock(content: string): string {
    const start = content.indexOf('## adr-d-006:');
    expect(start).toBeGreaterThan(-1);
    const rest = content.slice(start);
    const nextAdr = rest.indexOf('\n## adr-', 10);
    return nextAdr > 0 ? rest.slice(0, nextAdr) : rest;
  }

  it('successor adr-d-006 exists and references ADR-038', () => {
    const content = readFileSync(decisionsPath, 'utf-8');
    const block = getSuccessorBlock(content);
    expect(block).toContain('ADR-038');
  });

  it('adr-d-006 has accepted status', () => {
    const content = readFileSync(decisionsPath, 'utf-8');
    const block = getSuccessorBlock(content);
    expect(block).toMatch(/accepted/i);
  });

  it('adr-d-006 has Decision and Context fields', () => {
    const content = readFileSync(decisionsPath, 'utf-8');
    const block = getSuccessorBlock(content);
    expect(block).toContain('Decision');
    expect(block).toContain('Context');
  });

  it('adr-d-006 references dead code disposition', () => {
    const content = readFileSync(decisionsPath, 'utf-8');
    const block = getSuccessorBlock(content);
    expect(block.toLowerCase()).toContain('dead code');
  });

  it('adr-d-006 defines disposition categories', () => {
    const content = readFileSync(decisionsPath, 'utf-8');
    const block = getSuccessorBlock(content);
    // At minimum should mention Remove/Defer approach
    expect(block.toLowerCase()).toMatch(/remove|defer|deprecate|disposition/);
  });

  it('adr-d-006 mentions alternatives/consequences', () => {
    const content = readFileSync(decisionsPath, 'utf-8');
    const block = getSuccessorBlock(content);
    expect(block.toLowerCase()).toMatch(/alternative|consequence/);
  });
});

// ─── Rationale Completeness ──────────────────────────────────────────────

describe('decision rationale completeness', () => {
  const decisionPath = join(projectRoot, 'docs', 'audits', 'sprint-139', 'dead-code-decisions.md');

  it('every Remove decision has LoC count', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // Each Remove module should specify its line count
    expect(content).toContain('learning-decay.ts` (151 LoC)');
    expect(content).toContain('learning-migration.ts` (229 LoC)');
    expect(content).toContain('batch-stats.ts` (141 LoC)');
  });

  it('every Defer decision has future connection', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // Each Defer module should have a Future Connection section
    expect(content).toContain('**Future Connection:**');
  });

  it('false positive section explains root cause', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // parallel-pipeline false positive should explain WHY it was flagged
    expect(content).toContain('Root Cause of False Positive');
    expect(content).toContain('PipelineTask');
  });

  it('execute checklist lists all Remove targets', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    const checklistSection = content.split('## Execute Checklist')[1] || '';

    // All 3 Remove source files
    expect(checklistSection).toContain('learning-decay.ts');
    expect(checklistSection).toContain('learning-migration.ts');
    expect(checklistSection).toContain('batch-stats.ts');

    // All 3 Remove test files
    expect(checklistSection).toContain('tests/orchestra/learning-decay.test.ts');
    expect(checklistSection).toContain('tests/orchestra/learning-migration.test.ts');
    expect(checklistSection).toContain('tests/orchestra/batch-stats.test.ts');
  });

  it('decision matrix references ADR-028 for dormant modules', () => {
    const content = readFileSync(decisionPath, 'utf-8');

    // Dormant modules should reference ADR-028
    expect(content).toContain('ADR-028');
    expect(content).toContain('referans implementasyonu');
  });
});
