import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../../src/core/memory-store.js';

// Capture output
const outputLines: string[] = [];

let tmpDir: string;

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => tmpDir,
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (msg: string) => { outputLines.push(msg); },
  printError: (msg: string) => { outputLines.push(`ERROR: ${msg}`); },
}));

// Dynamic import after mocks
const { registerRecall } = await import('../../../src/cli/commands/recall.js');

describe('recall CLI command', () => {
  beforeEach(() => {
    outputLines.length = 0;
    tmpDir = mkdtempSync(join(tmpdir(), 'recall-cli-'));
    mkdirSync(join(tmpDir, '.brain'), { recursive: true });
    const dbPath = join(tmpDir, '.brain', 'memory.db');
    const store = new MemoryStore(dbPath);
    store.insert({
      id: 'mem-test-1',
      type: 'memory',
      title: 'Docker HB Fix',
      content: 'atomicWriteFileSync heartbeat fix',
      tags: ['docker', 'heartbeat'],
      sprint_num: 139,
    });
    store.insert({
      id: 'mem-test-2',
      type: 'memory',
      title: 'ADR Governance',
      content: 'MADR v3 governance integration',
      tags: ['adr', 'governance'],
      sprint_num: 138,
    });
    store.close();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function run(args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerRecall(program);
    try {
      await program.parseAsync(['node', 'deckent', 'recall', ...args]);
    } catch {
      // commander exits on error
    }
  }

  it('passes --mode=or to searchMemory (default)', async () => {
    await run(['docker governance']);
    const text = outputLines.join('\n');
    // OR mode: both entries should appear
    expect(text).toContain('Docker HB Fix');
    expect(text).toContain('ADR Governance');
  });

  it('passes --mode=and to searchMemory', async () => {
    await run(['docker governance', '--mode', 'and']);
    const text = outputLines.join('\n');
    // AND mode: no entry has both "docker" AND "governance"
    expect(text).toContain('No results');
  });
});
