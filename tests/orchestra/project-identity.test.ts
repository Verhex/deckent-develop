// ═══ PROJECT-IDENTITY.md Tests ═══════════════════════════════════════
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateProjectIdentity,
  updateProjectIdentity,
} from '../../src/orchestra/sprint-reporter.js';
import type { ProjectIdentityInfo } from '../../src/orchestra/sprint-reporter.js';
import type { SprintMetrics } from '../../src/core/types.js';
import { PROJECT_IDENTITY_FILE, BRAIN_DIR } from '../../src/core/constants.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  const root = join(tmpdir(), `deckent-pi-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(root, BRAIN_DIR), { recursive: true });
  return root;
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 10,
    completedTasks: 8,
    techDebtTasks: 1,
    noGoTasks: 1,
    durationMs: 5000,
    coveragePercent: 85.5,
    noGoRate: 10.0,
    newDebtCount: 1,
    resolvedDebtCount: 0,
    totalOpenDebt: 2,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

function readIdentityFile(root: string): string {
  return readFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), 'utf-8');
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('PROJECT_IDENTITY_FILE constant', () => {
  it('should equal PROJECT-IDENTITY.md', () => {
    expect(PROJECT_IDENTITY_FILE).toBe('PROJECT-IDENTITY.md');
  });
});

describe('generateProjectIdentity', () => {
  it('should generate markdown with project name', () => {
    const content = generateProjectIdentity({ projectName: 'my-app', sprintId: 'sprint-001' });
    expect(content).toContain('# Project Identity');
    expect(content).toContain('- Name: my-app');
  });

  it('should include description when provided', () => {
    const content = generateProjectIdentity({
      projectName: 'my-app',
      sprintId: 'sprint-001',
      description: 'A cool app',
    });
    expect(content).toContain('- Description: A cool app');
  });

  it('should include architecture section with detected stack', () => {
    const content = generateProjectIdentity({
      projectName: 'my-app',
      sprintId: 'sprint-001',
      language: 'typescript',
      framework: 'next',
      testFramework: 'vitest',
      buildTool: 'tsc',
    });
    expect(content).toContain('## Architecture');
    expect(content).toContain('- Language: typescript');
    expect(content).toContain('- Framework: next');
    expect(content).toContain('- Test Framework: vitest');
    expect(content).toContain('- Build Tool: tsc');
  });

  it('should include current state section', () => {
    const content = generateProjectIdentity({
      projectName: 'test',
      sprintId: 'sprint-005',
      totalSprints: 5,
      testCount: 100,
      fileCount: 50,
      lineCount: 5000,
    });
    expect(content).toContain('## Current State');
    expect(content).toContain('- Test Count: 100');
    expect(content).toContain('- File Count: 50');
    expect(content).toContain('- Line Count: 5000');
    expect(content).toContain('- Last Sprint: sprint-005');
    expect(content).toContain('- Total Sprints: 5');
  });

  it('should include active configuration', () => {
    const content = generateProjectIdentity({
      projectName: 'test',
      sprintId: 'sprint-001',
      mode: 'max_plan',
      brainModel: 'opus',
      defaultModel: 'sonnet',
      maxWorkers: 8,
    });
    expect(content).toContain('## Active Configuration');
    expect(content).toContain('- Mode: max_plan');
    expect(content).toContain('- Brain Model: opus');
    expect(content).toContain('- Default Model: sonnet');
    expect(content).toContain('- Max Workers: 8');
  });

  it('should include key rules reference', () => {
    const content = generateProjectIdentity({ projectName: 'test', sprintId: 'sprint-001' });
    expect(content).toContain('## Key Rules');
    expect(content).toContain('DECISIONS.md');
  });

  it('should include module map section', () => {
    const content = generateProjectIdentity({
      projectName: 'test',
      sprintId: 'sprint-001',
      moduleMap: { 'src/core': 'Core utilities', 'src/cli': 'CLI commands' },
    });
    expect(content).toContain('## Module Map');
    expect(content).toContain('- src/core: Core utilities');
    expect(content).toContain('- src/cli: CLI commands');
  });

  it('should show placeholder when no module map provided', () => {
    const content = generateProjectIdentity({ projectName: 'test', sprintId: 'sprint-001' });
    expect(content).toContain('- (auto-populated after first sprint)');
  });

  it('should handle minimal info (only required fields)', () => {
    const content = generateProjectIdentity({ projectName: 'bare', sprintId: 'sprint-000' });
    expect(content).toContain('# Project Identity');
    expect(content).toContain('- Name: bare');
    expect(content).toContain('- Last Sprint: sprint-000');
    // Should not have undefined values
    expect(content).not.toContain('undefined');
  });

  it('should omit architecture details when not provided', () => {
    const content = generateProjectIdentity({ projectName: 'bare', sprintId: 'sprint-000' });
    // Architecture section should exist but be empty
    expect(content).toContain('## Architecture');
    expect(content).not.toContain('- Language:');
    expect(content).not.toContain('- Framework:');
  });

  it('should return valid markdown with all sections', () => {
    const content = generateProjectIdentity({
      projectName: 'full',
      sprintId: 'sprint-010',
      description: 'Full project',
      totalSprints: 10,
      testCount: 500,
      fileCount: 200,
      lineCount: 30000,
      mode: 'api',
      brainModel: 'opus',
      defaultModel: 'sonnet',
      maxWorkers: 10,
      language: 'typescript',
      framework: 'express',
      testFramework: 'vitest',
      buildTool: 'tsc',
      moduleMap: { 'src/': 'Main source' },
    });
    // All 6 sections present
    expect(content).toContain('## What Is This Project');
    expect(content).toContain('## Architecture');
    expect(content).toContain('## Current State');
    expect(content).toContain('## Active Configuration');
    expect(content).toContain('## Key Rules');
    expect(content).toContain('## Module Map');
  });
});

describe('updateProjectIdentity', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
  });

  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  it('should create file with defaults when missing', () => {
    updateProjectIdentity(root, 'sprint-001', makeMetrics());
    expect(existsSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE))).toBe(true);
    const content = readIdentityFile(root);
    expect(content).toContain('# Project Identity');
    expect(content).toContain('- Last Sprint: sprint-001');
  });

  it('should use directory name as project name when creating', () => {
    updateProjectIdentity(root, 'sprint-001', makeMetrics());
    const content = readIdentityFile(root);
    const dirName = root.split(/[\\/]/).pop() ?? '';
    expect(content).toContain(`- Name: ${dirName}`);
  });

  it('should update Current State section in existing file', () => {
    // Write initial file
    const initial = generateProjectIdentity({
      projectName: 'test-project',
      sprintId: 'sprint-001',
      totalSprints: 1,
      language: 'typescript',
    });
    writeFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), initial, 'utf-8');

    // Update
    updateProjectIdentity(root, 'sprint-002', makeMetrics({ totalTasks: 20, completedTasks: 18, coveragePercent: 92.3 }), 2);

    const content = readIdentityFile(root);
    expect(content).toContain('- Last Sprint: sprint-002');
    expect(content).toContain('- Total Sprints: 2');
    expect(content).toContain('- Completed Tasks: 18');
    expect(content).toContain('- Coverage: 92.3%');
    // Should NOT contain old sprint info in current state
    expect(content).not.toContain('- Last Sprint: sprint-001');
  });

  it('should preserve other sections when updating Current State', () => {
    const initial = generateProjectIdentity({
      projectName: 'preserved-project',
      sprintId: 'sprint-001',
      language: 'typescript',
      framework: 'express',
      mode: 'max_plan',
      moduleMap: { 'src/core': 'Core' },
    });
    writeFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), initial, 'utf-8');

    updateProjectIdentity(root, 'sprint-005', makeMetrics(), 5);

    const content = readIdentityFile(root);
    // Other sections preserved
    expect(content).toContain('- Name: preserved-project');
    expect(content).toContain('- Language: typescript');
    expect(content).toContain('- Framework: express');
    expect(content).toContain('- Mode: max_plan');
    expect(content).toContain('- src/core: Core');
  });

  it('should handle file with no Current State section by appending', () => {
    const minimal = '# Project Identity\n\n## What Is This Project\n- Name: test\n';
    writeFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), minimal, 'utf-8');

    updateProjectIdentity(root, 'sprint-003', makeMetrics(), 3);

    const content = readIdentityFile(root);
    expect(content).toContain('## Current State');
    expect(content).toContain('- Last Sprint: sprint-003');
  });

  it('should include No-Go Rate in updated state', () => {
    // First create the file
    const initial = generateProjectIdentity({ projectName: 'test', sprintId: 'sprint-000' });
    writeFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), initial, 'utf-8');

    // Then update it — update path writes No-Go Rate
    updateProjectIdentity(root, 'sprint-001', makeMetrics({ noGoRate: 15.5 }));
    const content = readIdentityFile(root);
    expect(content).toContain('- No-Go Rate: 15.5%');
  });

  it('should handle multiple updates sequentially', () => {
    updateProjectIdentity(root, 'sprint-001', makeMetrics({ totalTasks: 5 }), 1);
    updateProjectIdentity(root, 'sprint-002', makeMetrics({ totalTasks: 10 }), 2);
    updateProjectIdentity(root, 'sprint-003', makeMetrics({ totalTasks: 15 }), 3);

    const content = readIdentityFile(root);
    expect(content).toContain('- Last Sprint: sprint-003');
    expect(content).toContain('- Total Sprints: 3');
    // Test count is now determined by countProjectTestCases() scanning actual test files.
    // The temp dir has no tests/ directory, so count is 0.
    expect(content).toContain('- Test Count: 0');
    expect(content).not.toContain('- Last Sprint: sprint-002');
    expect(content).not.toContain('- Last Sprint: sprint-001');
  });

  it('should create .brain directory if missing', () => {
    const freshRoot = join(tmpdir(), `deckent-pi-fresh-${Date.now()}`);
    mkdirSync(freshRoot, { recursive: true });

    updateProjectIdentity(freshRoot, 'sprint-001', makeMetrics());

    expect(existsSync(join(freshRoot, BRAIN_DIR, PROJECT_IDENTITY_FILE))).toBe(true);
    rmSync(freshRoot, { recursive: true, force: true });
  });

  it('should handle totalSprints being undefined', () => {
    updateProjectIdentity(root, 'sprint-001', makeMetrics());
    const content = readIdentityFile(root);
    expect(content).toContain('- Last Sprint: sprint-001');
    // totalSprints line should still appear in the auto-created file
  });
});

describe('Decay exclusion (PROJECT-IDENTITY.md is never decayed)', () => {
  it('should NOT be targeted by decay — debt-manager only touches MEMORY, PATTERNS, DEBT, sprints', async () => {
    // This is a structural verification: runDecay only targets specific files.
    // PROJECT-IDENTITY.md is a new file in .brain/ that decay never references.
    // Verify by checking constants used in debt-manager imports.
    const { runDecay } = await import('../../src/orchestra/debt-manager.js');
    const root = makeTmpRoot();

    // Create PROJECT-IDENTITY.md
    const identityContent = generateProjectIdentity({ projectName: 'test', sprintId: 'sprint-001' });
    writeFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), identityContent, 'utf-8');

    // Create enough content to trigger decay
    const bigMemory = Array.from({ length: 700 }, (_, i) => `Line ${i}`).join('\n');
    writeFileSync(join(root, BRAIN_DIR, 'MEMORY.md'), bigMemory, 'utf-8');
    writeFileSync(join(root, BRAIN_DIR, 'DEBT.md'), '# Tech Debt\n', 'utf-8');
    writeFileSync(join(root, BRAIN_DIR, 'PATTERNS.md'), '[]', 'utf-8');
    mkdirSync(join(root, BRAIN_DIR, 'sprints'), { recursive: true });

    // Run decay with force
    runDecay(root, 'sprint-010', { force: true });

    // PROJECT-IDENTITY.md should be completely untouched
    const afterDecay = readFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), 'utf-8');
    expect(afterDecay).toBe(identityContent);

    rmSync(root, { recursive: true, force: true });
  });

  it('should survive even aggressive decay', async () => {
    const { runDecay } = await import('../../src/orchestra/debt-manager.js');
    const root = makeTmpRoot();

    const identityContent = '# Project Identity\n\n## Custom\nImportant project info\n';
    writeFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), identityContent, 'utf-8');
    writeFileSync(join(root, BRAIN_DIR, 'MEMORY.md'), Array.from({ length: 800 }, (_, i) => `Line ${i}`).join('\n'), 'utf-8');
    writeFileSync(join(root, BRAIN_DIR, 'DEBT.md'), '# Tech Debt\n', 'utf-8');
    writeFileSync(join(root, BRAIN_DIR, 'PATTERNS.md'), '[]', 'utf-8');
    mkdirSync(join(root, BRAIN_DIR, 'sprints'), { recursive: true });

    runDecay(root, 'sprint-050', { force: true });

    const afterDecay = readFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), 'utf-8');
    expect(afterDecay).toBe(identityContent);

    rmSync(root, { recursive: true, force: true });
  });
});

describe('readContext includes projectIdentity', () => {
  it('should load projectIdentity from DB when memory.db exists', async () => {
    const { readContext } = await import('../../src/orchestra/sprint-controller.js');
    const { MemoryStore } = await import('../../src/core/memory-store.js');
    const root = makeTmpRoot();

    writeFileSync(join(root, 'DIRECTIVES.md'), '# Test', 'utf-8');

    // Create real DB with identity entry
    const dbPath = join(root, BRAIN_DIR, 'memory.db');
    const store = new MemoryStore(dbPath);
    const identityContent = generateProjectIdentity({ projectName: 'ctx-test', sprintId: 'sprint-003' });
    store.insert({ id: 'identity-1', type: 'identity', title: 'Project Identity', content: identityContent, source: 'brain', status: 'active', priority: 'normal', tags: [] });
    store.close();

    const context = readContext(root);
    expect(context.projectIdentity).toContain('ctx-test');
    expect(context.projectIdentity).toContain('sprint-003');

    rmSync(root, { recursive: true, force: true });
  });

  it('should return undefined when no identity entry in DB', async () => {
    const { readContext } = await import('../../src/orchestra/sprint-controller.js');
    const { MemoryStore } = await import('../../src/core/memory-store.js');
    const root = makeTmpRoot();

    writeFileSync(join(root, 'DIRECTIVES.md'), '# Test', 'utf-8');

    // Create empty DB (no identity entry)
    const dbPath = join(root, BRAIN_DIR, 'memory.db');
    const store = new MemoryStore(dbPath);
    store.close();

    const context = readContext(root);
    expect(context.projectIdentity).toBeUndefined();

    rmSync(root, { recursive: true, force: true });
  });
});
