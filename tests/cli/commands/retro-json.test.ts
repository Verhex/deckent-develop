import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let testRoot: string;

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => testRoot),
}));

import { Command } from 'commander';
import { registerRetro, parseRetroToRichSummary } from '../../../src/cli/commands/retro.js';
import { MemoryStore } from '../../../src/core/memory-store.js';
import { MEMORY_DB_FILE } from '../../../src/core/constants.js';

let printOutput: string[] = [];
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn((...args: unknown[]) => { printOutput.push(args.map(String).join(' ')); }),
}));

const SAMPLE_RETRO = `# Sprint: sprint-055

| What | Value |
|------|-------|
| Tasks completed | 7/10 |
| NO_GO rate | 20% (2/10) |
| Sprint time | 5m 12s |
| Coverage | 91.3% |

## Learnings
- Some learning
`;

describe('retro --json', () => {
  beforeEach(() => {
    printOutput = [];
    vi.clearAllMocks();
    testRoot = mkdtempSync(join(tmpdir(), 'retro-json-'));
    mkdirSync(join(testRoot, '.brain'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  function buildProgram(): Command {
    const program = new Command();
    program.exitOverride();
    registerRetro(program);
    return program;
  }

  // B8: `deckent retro` reads the retro from memory.db `retro` entries.
  function writeRetro(content: string, sprintId = 'sprint-055'): void {
    const store = new MemoryStore(join(testRoot, '.brain', MEMORY_DB_FILE));
    try {
      store.upsert({
        id: `retro-${sprintId}`,
        type: 'retro',
        title: `${sprintId} Retrospective`,
        content,
        source: 'brain',
        sprint_id: sprintId,
        sprint_num: parseInt(sprintId.replace(/\D/g, ''), 10) || 0,
        tags: ['retro'],
      }, 'test');
    } finally {
      store.close();
    }
  }

  it('should output valid JSON', async () => {
    writeRetro(SAMPLE_RETRO);
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'retro', '--json']);
    const parsed = JSON.parse(printOutput[0]!);
    expect(parsed).toBeDefined();
    expect(parsed.sprintId).toBe('sprint-055');
  });

  it('should not include raw field', async () => {
    writeRetro(SAMPLE_RETRO);
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'retro', '--json']);
    const parsed = JSON.parse(printOutput[0]!);
    expect(parsed.raw).toBeUndefined();
  });

  it('should include parsed metrics', async () => {
    writeRetro(SAMPLE_RETRO);
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'retro', '--json']);
    const parsed = JSON.parse(printOutput[0]!);
    expect(parsed.completed).toBe(7);
    expect(parsed.totalTasks).toBe(10);
    expect(parsed.noGo).toBe(2);
    expect(parsed.coverage).toBe('91.3%');
    expect(parsed.duration).toBe('5m 12s');
  });

  it('should include delta with --compare', async () => {
    // Two retro entries: sprint-054 (previous) + sprint-055 (latest).
    writeRetro(`# Sprint sprint-054\n| Tasks completed | 5/8 |\n| NO_GO rate | 12% (1/8) |\n| Sprint time | 3m |\n| Coverage | 88% |`, 'sprint-054');
    writeRetro(SAMPLE_RETRO, 'sprint-055');

    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'retro', '--json', '--compare']);
    const parsed = JSON.parse(printOutput[0]!);
    expect(parsed.delta).toBeDefined();
    expect(typeof parsed.delta.successRate).toBe('number');
    expect(typeof parsed.delta.noGo).toBe('number');
    expect(parsed.delta.previous).toBeDefined();
    expect(parsed.delta.previous.raw).toBeUndefined();
  });

  it('should prefer --json over --raw', async () => {
    writeRetro(SAMPLE_RETRO);
    const program = buildProgram();
    await program.parseAsync(['node', 'test', 'retro', '--raw', '--json']);
    // Should be JSON, not raw markdown
    const parsed = JSON.parse(printOutput[0]!);
    expect(parsed.sprintId).toBe('sprint-055');
  });

  it('should handle empty retro gracefully', async () => {
    // json-output-contract (559-003): with --json, stdout carries ONLY a JSON
    // document — the no-retro notice moved to stderr, stdout stays empty.
    writeRetro('');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const program = buildProgram();
      await program.parseAsync(['node', 'test', 'retro', '--json']);
      expect(printOutput).toHaveLength(0);
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrText).toContain('No retrospective found');
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
