import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { countModules, findGenerator, generateAllSections } from '../../src/orchestra/managed-docs/content-generators.js';
import { loadDocsConfig } from '../../src/orchestra/managed-docs/docs-config.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { DocUpdateContext } from '../../src/orchestra/doc-updaters/types.js';
import type { ResolvedConfig, Sprint, SprintMetrics } from '../../src/core/types.js';

function makeCtx(projectRoot = process.cwd()): DocUpdateContext {
  const metrics: SprintMetrics = {
    totalTasks: 5,
    completedTasks: 5,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 120000,
    coveragePercent: 95,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
  };
  const sprint = {
    id: 'sprint-215',
    number: 215,
    tasks: [{ id: '215-001', title: 'test', assignedAgent: 'refactorer' }],
  } as unknown as Sprint;
  const evaluations = new Map<string, TaskEvaluation>();
  evaluations.set('215-001', TaskEvaluation.DONE);
  return {
    projectRoot,
    sprintResult: { sprint, evaluations, metrics },
    config: { auto_docs: { tier1: true, tier2: true, tier3: true } } as ResolvedConfig,
    isInternalProject: false,
  };
}

// ─── core/ module count is code-derived ──────────────────────────────────

describe('module-count-sync: core module count', () => {
  it('countModules(src/core) returns code-derived count > 90 (not hardcoded old value 90)', () => {
    const coreDir = join(process.cwd(), 'src', 'core');
    const count = countModules(coreDir);
    // Old stale value was 90 — real count is 112+
    expect(count).toBeGreaterThan(90);
  });

  it('countModules result matches direct readdirSync .ts file count for src/core (no drift)', () => {
    const coreDir = join(process.cwd(), 'src', 'core');
    const directCount = readdirSync(coreDir).filter(f => f.endsWith('.ts')).length;
    const count = countModules(coreDir);
    expect(count).toBe(directCount);
  });
});

// ─── orchestra/ module count is code-derived ─────────────────────────────

describe('module-count-sync: orchestra module count', () => {
  it('countModules(src/orchestra) returns code-derived count > 76 (not hardcoded old value 76)', () => {
    const orchestraDir = join(process.cwd(), 'src', 'orchestra');
    const count = countModules(orchestraDir);
    // Old stale value was 76 — real count is 88+
    expect(count).toBeGreaterThan(76);
  });

  it('countModules result matches direct readdirSync .ts file count for src/orchestra (no drift)', () => {
    const orchestraDir = join(process.cwd(), 'src', 'orchestra');
    const directCount = readdirSync(orchestraDir).filter(f => f.endsWith('.ts')).length;
    const count = countModules(orchestraDir);
    expect(count).toBe(directCount);
  });
});

// ─── architecture-map generator is wired (autoSection ready) ─────────────

describe('module-count-sync: architecture-map generator', () => {
  it('findGenerator("Architecture") is not null — generator is registered and ready as autoSection', () => {
    expect(findGenerator('Architecture')).not.toBeNull();
    expect(findGenerator('architecture map')).not.toBeNull();
    expect(findGenerator('module counts')).not.toBeNull();
  });

  it('architecture-map generator produces table with live core/ and orchestra/ counts', () => {
    const ctx = makeCtx();
    const sections = generateAllSections(['Architecture'], ctx);
    const content = sections.get('Architecture') ?? '';
    expect(content).toContain('core/');
    expect(content).toContain('orchestra/');
    expect(content).toContain('|');
  });

  it('architecture-map table core/ count matches countModules (no hardcode drift)', () => {
    const ctx = makeCtx();
    const sections = generateAllSections(['Architecture'], ctx);
    const content = sections.get('Architecture') ?? '';
    const coreDir = join(process.cwd(), 'src', 'core');
    const expectedCount = countModules(coreDir);
    expect(content).toContain(`| core/ | ${expectedCount} |`);
  });

  it('architecture-map table orchestra/ count matches countModules (no hardcode drift)', () => {
    const ctx = makeCtx();
    const sections = generateAllSections(['Architecture'], ctx);
    const content = sections.get('Architecture') ?? '';
    const orchDir = join(process.cwd(), 'src', 'orchestra');
    const expectedCount = countModules(orchDir);
    expect(content).toContain(`| orchestra/ | ${expectedCount} |`);
  });
});

// ─── docs.json current state (gap documentation) ─────────────────────────

describe('module-count-sync: docs.json Architecture section state', () => {
  it('docs.json loads successfully', () => {
    const cfg = loadDocsConfig(process.cwd());
    expect(cfg).not.toBeNull();
    expect(cfg?.docs).toBeInstanceOf(Array);
  });

  it('architecture-map generator produces non-empty content for any project root', () => {
    const ctx = makeCtx();
    const sections = generateAllSections(['Architecture'], ctx);
    const content = sections.get('Architecture') ?? '';
    // Generator is functional — Architecture auto-section is ready to use
    expect(content.length).toBeGreaterThan(0);
    expect(content).toMatch(/\| \w+\/ \| \d+ \|/);
  });
});
