import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';

// Mock resolveProjectRoot to point to a temp dir
let projectRoot: string;
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => projectRoot,
}));

import { registerRecall } from '../../src/cli/commands/recall.js';

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

function createDbWithEntries(dbPath: string, entries: Array<{
  id: string; type: string; title: string; content: string;
  tags?: string[]; sprint_id?: string; sprint_num?: number; summary?: string;
}>): void {
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
    });
  }
  store.close();
}

async function runRecall(args: string[]): Promise<string> {
  const program = new Command();
  program.exitOverride();
  registerRecall(program);
  try {
    await program.parseAsync(['node', 'test', 'recall', ...args]);
  } catch {
    // commander exit override throws
  }
  return getStdout();
}

// ── Tests ───────────────────────────────────────────────────────

describe('recall command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = mkdtempSync(join(tmpdir(), 'recall-test-'));
    captureOutput();
  });

  afterEach(() => {
    restoreOutput();
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('prints error when memory.db does not exist', async () => {
    await runRecall(['test-query']);
    const stderr = getStderr();
    expect(stderr).toContain('Memory V2 DB not found');
  });

  it('prints "No results" for a query with no matches', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'adr-001', type: 'adr', title: 'TypeScript ESM', content: 'Use TypeScript with ESM' },
    ]);

    const output = await runRecall(['nonexistent-gibberish-xyz']);
    expect(output).toContain('No results');
  });

  it('returns matching results for a basic query', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'adr-001', type: 'adr', title: 'TypeScript ESM', content: 'Use TypeScript with ESM modules' },
      { id: 'mem-001', type: 'memory', title: 'Docker fix', content: 'Fixed docker heartbeat' },
    ]);

    const output = await runRecall(['TypeScript']);
    expect(output).toContain('result(s)');
    expect(output).toContain('TypeScript ESM');
  });

  it('filters by type with --type flag', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'adr-001', type: 'adr', title: 'ESM Decision', content: 'ESM module system decision' },
      { id: 'mem-001', type: 'memory', title: 'ESM Learning', content: 'ESM module learning from sprint' },
    ]);

    const output = await runRecall(['ESM', '--type', 'adr']);
    expect(output).toContain('ESM Decision');
    // Should not contain memory type results
    expect(output).not.toContain('ESM Learning');
  });

  it('uses AND mode with --mode and', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'adr-001', type: 'adr', title: 'TypeScript ESM Decision', content: 'TypeScript with ESM module system' },
      { id: 'adr-002', type: 'adr', title: 'Docker Backend', content: 'Docker container backend only' },
    ]);

    // AND mode: both "TypeScript" AND "ESM" must match
    const output = await runRecall(['TypeScript ESM', '--mode', 'and']);
    expect(output).toContain('TypeScript ESM Decision');
    expect(output).not.toContain('Docker Backend');
  });

  it('uses OR mode by default', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'adr-001', type: 'adr', title: 'TypeScript Config', content: 'TypeScript configuration rules' },
      { id: 'adr-002', type: 'adr', title: 'ESM Modules', content: 'ESM import rules for the project' },
    ]);

    // OR mode: "TypeScript" OR "ESM" — should find both
    const output = await runRecall(['TypeScript ESM']);
    expect(output).toContain('result(s)');
    // Both should appear since OR broadens recall
    expect(output).toContain('TypeScript Config');
    expect(output).toContain('ESM Modules');
  });

  it('respects --limit flag', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    const entries = Array.from({ length: 5 }, (_, i) => ({
      id: `mem-00${i + 1}`,
      type: 'memory',
      title: `Docker Learning ${i + 1}`,
      content: `Docker container learning item number ${i + 1}`,
    }));
    createDbWithEntries(dbPath, entries);

    const output = await runRecall(['Docker', '--limit', '2']);
    expect(output).toContain('2 result(s)');
  });

  it('respects --sprint-min filter', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'mem-001', type: 'memory', title: 'Old Sprint Learning', content: 'Docker old fix', sprint_id: 'sprint-100', sprint_num: 100 },
      { id: 'mem-002', type: 'memory', title: 'Recent Sprint Learning', content: 'Docker recent fix', sprint_id: 'sprint-140', sprint_num: 140 },
    ]);

    const output = await runRecall(['Docker', '--sprint-min', '130']);
    expect(output).toContain('Recent Sprint Learning');
    expect(output).not.toContain('Old Sprint Learning');
  });

  it('displays sprint_id in output when present', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'mem-001', type: 'memory', title: 'Sprint Result', content: 'Sprint 140 learning about Docker fix', sprint_id: 'sprint-140', sprint_num: 140 },
    ]);

    const output = await runRecall(['Sprint']);
    expect(output).toContain('sprint-140');
  });

  it('displays summary when available', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'adr-001', type: 'adr', title: 'ESM Decision', content: 'Detailed ESM content here', summary: 'Use ESM for all modules' },
    ]);

    const output = await runRecall(['ESM']);
    expect(output).toContain('Use ESM for all modules');
  });

  it('displays entry type in brackets', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'pat-001', type: 'pattern', title: 'Singleton Pattern', content: 'Pattern for singleton usage in codebase' },
    ]);

    const output = await runRecall(['Singleton']);
    expect(output).toContain('[pattern]');
    expect(output).toContain('Singleton Pattern');
  });

  it('handles multiple type filters', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
    const dbPath = join(projectRoot, '.brain', 'memory.db');
    createDbWithEntries(dbPath, [
      { id: 'adr-001', type: 'adr', title: 'Docker ADR', content: 'Docker backend decision' },
      { id: 'mem-001', type: 'memory', title: 'Docker Memory', content: 'Docker learning from sprint' },
      { id: 'debt-001', type: 'debt', title: 'Docker Debt', content: 'Docker tech debt item' },
    ]);

    const output = await runRecall(['Docker', '--type', 'adr,memory']);
    expect(output).toContain('Docker ADR');
    expect(output).toContain('Docker Memory');
    expect(output).not.toContain('Docker Debt');
  });
});
