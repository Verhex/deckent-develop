import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';

// Mock resolveProjectRoot to point to a temp dir
let projectRoot: string;
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => projectRoot,
}));

import { registerMemory } from '../../src/cli/commands/memory.js';

// ── Output capture ──────────────────────────────────────────────

let stdoutData: string[];
let stderrData: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function captureOutput(): void {
  stdoutData = [];
  stderrData = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdoutData.push(String(data));
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
    stderrData.push(String(data));
    return true;
  });
}

function restoreOutput(): void {
  stdoutSpy?.mockRestore();
  stderrSpy?.mockRestore();
}

function getStdout(): string { return stdoutData.join(''); }
function getStderr(): string { return stderrData.join(''); }

// ── Helpers ─────────────────────────────────────────────────────

function ensureDbWithEntries(root: string, entries: Array<{
  id: string; type: string; title: string; content: string;
  tags?: string[]; sprint_id?: string; sprint_num?: number;
  summary?: string; status?: string;
}>): string {
  const brainDir = join(root, '.brain');
  mkdirSync(brainDir, { recursive: true });
  const dbPath = join(brainDir, 'memory.db');
  const store = new MemoryStore(dbPath);
  for (const e of entries) {
    store.insert({
      id: e.id,
      type: e.type,
      title: e.title,
      content: e.content,
      tags: e.tags,
      sprint_id: e.sprint_id,
      sprint_num: e.sprint_num,
      summary: e.summary,
      status: e.status,
    });
  }
  store.close();
  return dbPath;
}

async function runMemory(args: string[]): Promise<string> {
  const program = new Command();
  program.exitOverride();
  registerMemory(program);
  try {
    await program.parseAsync(['node', 'test', 'memory', ...args]);
  } catch {
    // commander exit override throws
  }
  return getStdout();
}

// ── Tests: stats ────────────────────────────────────────────────

describe('memory stats command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = mkdtempSync(join(tmpdir(), 'memory-stats-'));
    captureOutput();
  });

  afterEach(() => {
    restoreOutput();
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('prints error when memory.db does not exist', async () => {
    await runMemory(['stats']);
    expect(getStderr()).toContain('memory.db not found');
  });

  it('shows statistics for populated DB', async () => {
    ensureDbWithEntries(projectRoot, [
      { id: 'adr-001', type: 'adr', title: 'ADR 1', content: 'Content 1' },
      { id: 'adr-002', type: 'adr', title: 'ADR 2', content: 'Content 2' },
      { id: 'mem-001', type: 'memory', title: 'Mem 1', content: 'Content 3' },
    ]);

    const output = await runMemory(['stats']);
    expect(output).toContain('Memory V2 Statistics');
    expect(output).toContain('adr: 2');
    expect(output).toContain('memory: 1');
    expect(output).toContain('Total: 3');
    expect(output).toContain('Schema: v1');
  });

  it('shows zero total for empty DB', async () => {
    ensureDbWithEntries(projectRoot, []);

    const output = await runMemory(['stats']);
    expect(output).toContain('Total: 0');
  });
});

// ── Tests: export ───────────────────────────────────────────────

describe('memory export command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = mkdtempSync(join(tmpdir(), 'memory-export-'));
    captureOutput();
  });

  afterEach(() => {
    restoreOutput();
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('prints error when memory.db does not exist', async () => {
    await runMemory(['export']);
    expect(getStderr()).toContain('memory.db not found');
  });

  it('exports 4 .md files from DB', async () => {
    ensureDbWithEntries(projectRoot, [
      { id: 'adr-001', type: 'adr', title: 'Test ADR', content: 'Test content', status: 'accepted' },
      { id: 'mem-001', type: 'memory', title: 'Test Memory', content: 'Learning content', sprint_id: 'sprint-140', sprint_num: 140 },
    ]);

    const output = await runMemory(['export']);
    expect(output).toContain('Exported 4 .md files');

    const exportsDir = join(projectRoot, '.brain', 'exports');
    expect(existsSync(join(exportsDir, 'summary.md'))).toBe(true);
    expect(existsSync(join(exportsDir, 'decisions.md'))).toBe(true);
    expect(existsSync(join(exportsDir, 'memory.md'))).toBe(true);
    expect(existsSync(join(exportsDir, 'debt.md'))).toBe(true);
  });

  it('creates exports directory if it does not exist', async () => {
    ensureDbWithEntries(projectRoot, []);

    await runMemory(['export']);

    const exportsDir = join(projectRoot, '.brain', 'exports');
    expect(existsSync(exportsDir)).toBe(true);
  });
});

// ── Tests: rebuild ──────────────────────────────────────────────

describe('memory rebuild command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = mkdtempSync(join(tmpdir(), 'memory-rebuild-'));
    captureOutput();
  });

  afterEach(() => {
    restoreOutput();
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('prints error when DB already exists', async () => {
    ensureDbWithEntries(projectRoot, []);

    await runMemory(['rebuild']);
    expect(getStderr()).toContain('memory.db already exists');
  });

  it('prints error when no exports directory exists', async () => {
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });

    await runMemory(['rebuild']);
    expect(getStderr()).toContain('No exports directory');
  });

  it('rebuilds DB from decisions.md export', async () => {
    const brainDir = join(projectRoot, '.brain');
    const exportsDir = join(brainDir, 'exports');
    mkdirSync(exportsDir, { recursive: true });

    // Write a simple decisions.md with ADR format
    const decisionsContent = `# Architecture Decisions

## adr-001: TypeScript ESM

**Status:** accepted

**Context:** Need consistent module system.

**Decision:** Use TypeScript with ESM.

**Consequence:** All imports use .js extension.

---
`;
    writeFileSync(join(exportsDir, 'decisions.md'), decisionsContent);

    const output = await runMemory(['rebuild']);
    expect(output).toContain('Rebuilt memory.db');

    // Verify DB was created
    const dbPath = join(brainDir, 'memory.db');
    expect(existsSync(dbPath)).toBe(true);
  });

  it('imports from original DECISIONS.md when exports are empty', async () => {
    const brainDir = join(projectRoot, '.brain');
    const exportsDir = join(brainDir, 'exports');
    mkdirSync(exportsDir, { recursive: true });

    // Write original DECISIONS.md at brain root
    const decisionsContent = `# Architecture Decisions

## adr-099: Test Decision

**Status:** accepted

**Context:** Test.

**Decision:** Test decision.

**Consequence:** None.

---
`;
    writeFileSync(join(brainDir, 'DECISIONS.md'), decisionsContent);

    const output = await runMemory(['rebuild']);
    expect(output).toContain('from original');
    expect(output).toContain('Rebuilt memory.db');
  });
});

// ── Tests: relations list ───────────────────────────────────────

describe('memory relations list command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = mkdtempSync(join(tmpdir(), 'memory-relations-'));
    captureOutput();
  });

  afterEach(() => {
    restoreOutput();
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('prints error when memory.db does not exist', async () => {
    await runMemory(['relations', 'list']);
    expect(getStderr()).toContain('memory.db not found');
  });

  it('lists relations between entries', async () => {
    const dbPath = ensureDbWithEntries(projectRoot, [
      { id: 'adr-001', type: 'adr', title: 'ADR 1', content: 'Content' },
      { id: 'adr-002', type: 'adr', title: 'ADR 2', content: 'Supersedes ADR-001' },
    ]);

    // Add an explicit relation
    const store = new MemoryStore(dbPath);
    store.insertRelation('adr-002', 'adr-001', 'supersedes');
    store.close();

    const output = await runMemory(['relations', 'list']);
    expect(output).toContain('Relations');
    expect(output).toContain('adr-002');
    expect(output).toContain('adr-001');
    expect(output).toContain('supersedes');
  });
});
