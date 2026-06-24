import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { SprintTrendAnalyzer } from '../../src/orchestra/cross-sprint-analyzer.js';

vi.mock('../../src/orchestra/cross-sprint-analyzer.js', () => ({
  SprintTrendAnalyzer: vi.fn(),
}));

const MockAnalyzer = SprintTrendAnalyzer as unknown as ReturnType<typeof vi.fn>;

function makeProgram(analyzeMock: () => unknown): Command {
  MockAnalyzer.mockImplementation(() => ({ analyze: analyzeMock }));
  const { registerEvolve } = require('../../src/cli/commands/evolve.js') as typeof import('../../src/cli/commands/evolve.js');
  const program = new Command();
  program.exitOverride();
  registerEvolve(program);
  return program;
}

describe('registerEvolve', () => {
  it('report command prints no-data message when analyzedSprintCount is 0', async () => {
    MockAnalyzer.mockImplementation(() => ({
      analyze: () => ({ sprints: [], trends: { agentTrends: [], skillTrends: [], noGoTrend: 'stable' }, analyzedSprintCount: 0 }),
    }));

    const { registerEvolve } = await import('../../src/cli/commands/evolve.js');
    const program = new Command();
    program.exitOverride();
    registerEvolve(program);

    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => { out.push(msg); });

    await program.parseAsync(['evolve', 'report'], { from: 'user' });

    expect(out.some(l => String(l).includes('No sprint data'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('report command renders trend table with mock data', async () => {
    MockAnalyzer.mockImplementation(() => ({
      analyze: () => ({
        sprints: [],
        trends: {
          agentTrends: [{ entityId: 'refactorer', direction: 'improving', firstHalfAvg: 0.7, secondHalfAvg: 0.9 }],
          skillTrends: [],
          noGoTrend: 'stable',
        },
        analyzedSprintCount: 5,
      }),
    }));

    const { registerEvolve } = await import('../../src/cli/commands/evolve.js');
    const program = new Command();
    program.exitOverride();
    registerEvolve(program);

    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => { out.push(msg); });

    await program.parseAsync(['evolve', 'report'], { from: 'user' });

    expect(out.some(l => String(l).includes('5 sprints'))).toBe(true);
    expect(out.some(l => String(l).includes('refactorer'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('report --json outputs valid JSON with analyzedSprintCount', async () => {
    MockAnalyzer.mockImplementation(() => ({
      analyze: () => ({
        sprints: [],
        trends: { agentTrends: [], skillTrends: [], noGoTrend: 'stable' },
        analyzedSprintCount: 3,
      }),
    }));

    const { registerEvolve } = await import('../../src/cli/commands/evolve.js');
    const program = new Command();
    program.exitOverride();
    registerEvolve(program);

    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => { out.push(msg); });

    await program.parseAsync(['evolve', 'report', '--json'], { from: 'user' });

    const parsed = JSON.parse(out[0]!);
    expect(parsed).toHaveProperty('analyzedSprintCount', 3);
    vi.restoreAllMocks();
  });

  it('registerEvolve is wired in src/cli/index.ts', () => {
    const src = readFileSync(new URL('../../src/cli/index.ts', import.meta.url), 'utf-8');
    expect(src).toContain('registerEvolve');
  });
});
