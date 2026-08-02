import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// The 2026-08 docs reset (commit 97b91e69f) replaced the single-language doc corpus
// with a bilingual docs/{en,tr}/** tree. Where a successor document exists, the paths
// in this file were repointed and the assertions that still hold were KEPT ACTIVE.
// The `it.skip` cases below pinned content of the archived corpus that the successor
// does not carry — real coverage loss, left visible instead of deleted or rewritten
// to match whatever the new file happens to say (that would be a tautology).
// Archived originals: docs/archive/docs-pre-reset-2026-08-03/.
// Closing these is a MASTER-PLAN item; see PAZARTESI.md.

const ROOT = join(import.meta.dirname, '..', '..');

describe('docs/development/agent-guide.md', () => {
  const guidePath = join(ROOT, 'docs', 'development', 'agent-guide.md');

  it.skip('file exists', () => {
    expect(existsSync(guidePath)).toBe(true);
  });

  it.skip('is written in English', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('# Agent Guide');
    expect(content).toContain('What Are Agents');
  });

  it.skip('has all 7 required sections', () => {
    const content = readFileSync(guidePath, 'utf-8');
    const requiredSections = [
      'What Are Agents',
      'Built-in Agents',
      'Agent Selection Algorithm',
      'Custom Agents',
      'Adaptive Agent',
      'Retirement',
      'Performance Tracking',
    ];
    for (const section of requiredSections) {
      expect(content).toContain(section);
    }
  });

  it.skip('documents all 15 built-in agents', () => {
    const content = readFileSync(guidePath, 'utf-8');
    // The 15 built-in agents per src/core/agent-pool.ts (ADR-041, Sprint 166
    // reconfirmed — testing agents removed; test-writer/api-designer/devops-agent
    // never existed in the current roster).
    const builtInAgents = [
      'security-auditor',
      'doc-writer',
      'bug-fixer',
      'code-reviewer',
      'refactorer',
      'api-builder',
      'performance-analyzer',
      'ci-guardian',
      'architect',
      'architecture-planner',
      'accessibility-auditor',
      'data-engineer',
      'devops-engineer',
      'frontend-designer',
      'migration-specialist',
    ];
    for (const agent of builtInAgents) {
      expect(content).toContain(agent);
    }
  });

  it.skip('explains the selection algorithm scoring', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('score');
    expect(content).toContain('trigger');
    expect(content).toContain('Threshold');
    expect(content).toContain('Fallback');
  });

  it.skip('describes custom agent creation', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('deckent agent create');
    expect(content).toContain('agent.json');
    expect(content).toContain('PROMPT.md');
  });

  it.skip('describes performance tracking commands', () => {
    const content = readFileSync(guidePath, 'utf-8');
    expect(content).toContain('deckent agent stats');
    expect(content).toContain('--json');
  });
});
