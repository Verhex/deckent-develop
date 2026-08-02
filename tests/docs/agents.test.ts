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

describe('docs/architecture/agents.md', () => {
  const agentsPath = join(ROOT, 'docs', 'architecture', 'agents.md');

  it.skip('file exists', () => {
    expect(existsSync(agentsPath)).toBe(true);
  });

  it.skip('is written in English', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    // Check for English-language markers (no Turkish-specific characters in headings)
    expect(content).toContain('# Agent System');
    expect(content).toContain('What Are Agents');
  });

  it.skip('has all required sections', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    const requiredSections = [
      'What Are Agents',
      'Built-in Agents',
      'Creating Custom Agents',
      'Agent Selection Algorithm',
      'Agent Stats and Learning',
      'Temp Agents',
      'Configuration',
    ];
    for (const section of requiredSections) {
      expect(content).toContain(section);
    }
  });

  it.skip('documents built-in agents (ADR-041 — 15 horizontal agents)', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    const builtInAgents = [
      'security-auditor',
      'doc-writer',
      'bug-fixer',
      'code-reviewer',
      'refactorer',
      'api-builder',
      'performance-analyzer',
      'migration-specialist',
    ];
    for (const agent of builtInAgents) {
      expect(content).toContain(agent);
    }
  });

  it.skip('includes CLI command examples', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('deckent agent list');
    expect(content).toContain('deckent agent create');
    expect(content).toContain('deckent agent enable');
    expect(content).toContain('deckent agent disable');
  });

  it.skip('describes agent.json configuration format', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('agent.json');
    expect(content).toContain('PROMPT.md');
    expect(content).toContain('"triggers"');
    expect(content).toContain('"model"');
  });

  it.skip('explains selection algorithm with trigger matching', () => {
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('trigger');
    expect(content).toContain('generic');
  });
});
