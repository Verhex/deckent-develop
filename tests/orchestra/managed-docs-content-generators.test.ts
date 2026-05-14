import { describe, it, expect } from 'vitest';
import { findGenerator, generateAllSections } from '../../src/orchestra/managed-docs/content-generators.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { DocUpdateContext } from '../../src/orchestra/doc-updaters/types.js';
import type { ResolvedConfig, Sprint, SprintMetrics } from '../../src/core/types.js';

function makeCtx(): DocUpdateContext {
  const metrics: SprintMetrics = {
    totalTasks: 5,
    completedTasks: 4,
    techDebtTasks: 1,
    noGoTasks: 0,
    durationMs: 300000,
    coveragePercent: 95.5,
    noGoRate: 0,
    newDebtCount: 1,
    resolvedDebtCount: 0,
    totalOpenDebt: 3,
    boundaryViolations: 0,
    crossAssignments: 0,
  };

  const sprint = {
    id: 'sprint-166',
    number: 166,
    tasks: [
      { id: '166-001', title: 'Bug M Fix', assignedAgent: 'bug-fixer' },
    ],
  } as unknown as Sprint;

  const evaluations = new Map<string, TaskEvaluation>();
  evaluations.set('166-001', TaskEvaluation.DONE);

  return {
    projectRoot: process.cwd(),
    sprintResult: { sprint, evaluations, metrics },
    config: { auto_docs: { tier1: true, tier2: true, tier3: true } } as ResolvedConfig,
    isInternalProject: false,
  };
}

// ─── MCP Tools generator ──────────────────────────────────────────────────

describe('mcp-tools generator', () => {
  it('findGenerator matches "MCP Tools" section title', () => {
    expect(findGenerator('MCP Tools')).not.toBeNull();
    expect(findGenerator('mcp tools')).not.toBeNull();
    expect(findGenerator('tools list')).not.toBeNull();
  });

  it('generates MCP tool table including key tools', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['MCP Tools'], ctx);
    const content = result.get('MCP Tools') ?? '';
    // Key MCP tools that must appear
    expect(content).toContain('deckent_audit');
    expect(content).toContain('deckent_recover');
    expect(content).toContain('deckent_watch');
    expect(content).toContain('deckent_nervous');
    expect(content).toContain('deckent_memory_query');
    // Should be a table with at least 20 tools
    const rows = content.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| Tool') && !l.startsWith('|---'));
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });
});

// ─── CLI Commands generator ───────────────────────────────────────────────

describe('cli-commands generator', () => {
  it('findGenerator matches "CLI Commands" section title', () => {
    expect(findGenerator('CLI Commands')).not.toBeNull();
    expect(findGenerator('commands list')).not.toBeNull();
  });

  it('generates CLI command table with 50+ commands', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['CLI Commands'], ctx);
    const content = result.get('CLI Commands') ?? '';
    // Key CLI commands that must appear
    expect(content).toContain('recall');
    expect(content).toContain('remember');
    expect(content).toContain('spawn');
    // Should have many command rows
    const rows = content.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| Command') && !l.startsWith('|---'));
    expect(rows.length).toBeGreaterThanOrEqual(50);
  });
});

// ─── Boot Sequence generator ──────────────────────────────────────────────

describe('boot-sequence generator', () => {
  it('findGenerator matches "Boot Sequence" section title', () => {
    expect(findGenerator('Boot Sequence')).not.toBeNull();
    expect(findGenerator('boot sequence')).not.toBeNull();
    expect(findGenerator('startup sequence')).not.toBeNull();
  });

  it('generates 7-step boot sequence with all key phases', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['Boot Sequence'], ctx);
    const content = result.get('Boot Sequence') ?? '';
    // Must mention DIRECTIVES, memory.db, workers, heartbeats, evaluation, retrospective
    expect(content).toContain('DIRECTIVES.md');
    expect(content).toContain('memory.db');
    expect(content).toContain('heartbeat');
    expect(content).toContain('GO');
    expect(content).toContain('Retrospective');
    // Must be exactly 7 numbered steps
    const steps = content.split('\n').filter(l => /^\d\./.test(l));
    expect(steps.length).toBe(7);
  });
});

// ─── Worker Anti-Patterns generator ──────────────────────────────────────

describe('worker-anti-patterns generator', () => {
  it('findGenerator matches "Anti-Patterns" section title', () => {
    expect(findGenerator('Anti-Patterns')).not.toBeNull();
    expect(findGenerator('anti-patterns')).not.toBeNull();
    expect(findGenerator('worker anti-patterns')).not.toBeNull();
  });

  it('generates content with verify-ran marker and honest-result gate', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['Anti-Patterns'], ctx);
    const content = result.get('Anti-Patterns') ?? '';
    // verify-ran and honest-result gate are REQUIRED
    expect(content).toContain('verify-ran');
    expect(content).toContain('honest-result gate');
    // ADR-037 RBAC content
    expect(content).toContain('ADR-037');
    // processQueue stall awareness
    expect(content).toContain('processQueue');
    // Forbidden anti-patterns table
    expect(content).toContain('it.skip');
    expect(content).toContain('stub()');
  });
});
