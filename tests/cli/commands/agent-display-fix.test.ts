/**
 * Tests for agent display fix (task-061-003):
 * A) agent list stats safe read (stats.totalUses vs direct uses)
 * B) history parseAgentSkillInfo table format parsing
 * C) agent stats --json serialization
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';

const testRoot = join(tmpdir(), `deckent-agent-display-${Date.now()}`);

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
}));

const output: string[] = [];
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (msg: string) => output.push(msg),
  printError: (err: unknown) => output.push(String(err instanceof Error ? err.message : err)),
  formatTable: (headers: string[], rows: string[][]) =>
    [headers.join('|'), ...rows.map(r => r.join('|'))].join('\n'),
}));

import { registerAgent, getAgentUses, getAgentSuccessRate } from '../../../src/cli/commands/agent.js';
import { parseAgentSkillInfo, parseSprintLog } from '../../../src/cli/commands/history.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeAgentDir(name: string, config: Record<string, unknown>) {
  const agentDir = join(testRoot, '.deckent/agents', name);
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(config, null, 2));
  return agentDir;
}

async function run(args: string[]) {
  output.length = 0;
  process.exitCode = undefined;
  const program = new Command();
  program.exitOverride();
  registerAgent(program);
  try {
    await program.parseAsync(['node', 'deckent', ...args]);
  } catch {
    // commander exitOverride
  }
}

// ─── A: getAgentUses / getAgentSuccessRate helpers ───────────────────

describe('getAgentUses', () => {
  it('reads from stats.totalUses (builtin agent format)', () => {
    expect(getAgentUses({ name: 'x', enabled: true, stats: { totalUses: 7 } })).toBe(7);
  });

  it('reads from direct uses field (custom agent format)', () => {
    expect(getAgentUses({ name: 'x', enabled: true, uses: 5 })).toBe(5);
  });

  it('returns 0 when both uses and stats.totalUses are missing', () => {
    expect(getAgentUses({ name: 'x', enabled: true })).toBe(0);
  });

  it('returns 0 when uses is NaN', () => {
    expect(getAgentUses({ name: 'x', enabled: true, uses: NaN })).toBe(0);
  });

  it('prefers stats.totalUses over uses when both present', () => {
    expect(getAgentUses({ name: 'x', enabled: true, uses: 3, stats: { totalUses: 10 } })).toBe(10);
  });
});

describe('getAgentSuccessRate', () => {
  it('reads from stats.successRate (builtin agent format)', () => {
    expect(getAgentSuccessRate({ name: 'x', enabled: true, stats: { successRate: 75 } })).toBe(75);
  });

  it('reads from direct successRate field (custom agent format)', () => {
    expect(getAgentSuccessRate({ name: 'x', enabled: true, successRate: 80 })).toBe(80);
  });

  it('returns 0 when both are missing', () => {
    expect(getAgentSuccessRate({ name: 'x', enabled: true })).toBe(0);
  });

  it('returns 0 when successRate is NaN', () => {
    expect(getAgentSuccessRate({ name: 'x', enabled: true, successRate: NaN })).toBe(0);
  });

  it('rounds to integer', () => {
    expect(getAgentSuccessRate({ name: 'x', enabled: true, successRate: 83.7 })).toBe(84);
  });
});

// ─── A: agent list display ────────────────────────────────────────────

describe('agent list display fix', () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, '.deckent/agents'), { recursive: true });
    output.length = 0;
  });

  afterEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
  });

  it('displays "0" uses and "0%" success for builtin agent with stats.totalUses=0', async () => {
    makeAgentDir('builtin-agent', {
      name: 'builtin-agent',
      enabled: true,
      model: 'opus',
      source: 'builtin',
      stats: { totalUses: 0, successRate: 0 },
    });
    await run(['agent', 'list']);
    const tableOutput = output.join('\n');
    expect(tableOutput).toContain('0');
    expect(tableOutput).not.toContain('undefined');
    expect(tableOutput).not.toContain('NaN');
  });

  it('displays correct uses from stats.totalUses for builtin agent', async () => {
    makeAgentDir('builtin-used', {
      name: 'builtin-used',
      enabled: true,
      model: 'opus',
      stats: { totalUses: 15, successRate: 86 },
    });
    await run(['agent', 'list']);
    const tableOutput = output.join('\n');
    expect(tableOutput).toContain('15');
    expect(tableOutput).toContain('86%');
  });

  it('displays correct uses from direct uses field (custom agent)', async () => {
    makeAgentDir('custom-agent', {
      name: 'custom-agent',
      type: 'custom',
      enabled: true,
      model: 'sonnet',
      uses: 5,
      successRate: 80,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await run(['agent', 'list']);
    const tableOutput = output.join('\n');
    expect(tableOutput).toContain('5');
    expect(tableOutput).toContain('80%');
  });
});

// ─── C: agent stats --json ────────────────────────────────────────────

describe('agent stats --json fix', () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, '.deckent/agents'), { recursive: true });
    output.length = 0;
  });

  afterEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
  });

  it('serializes uses as number (not undefined) for builtin agent', async () => {
    makeAgentDir('stats-builtin', {
      name: 'stats-builtin',
      enabled: true,
      model: 'opus',
      stats: { totalUses: 12, successRate: 90 },
    });
    await run(['agent', 'stats', '--json', 'stats-builtin']);
    const parsed = JSON.parse(output.join('\n'));
    expect(typeof parsed.agent.uses).toBe('number');
    expect(parsed.agent.uses).toBe(12);
    expect(parsed.agent.successRate).toBe(90);
  });

  it('serializes uses as number from direct fields (custom agent)', async () => {
    makeAgentDir('stats-custom', {
      name: 'stats-custom',
      type: 'custom',
      enabled: true,
      model: 'sonnet',
      uses: 7,
      successRate: 70,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await run(['agent', 'stats', '--json', 'stats-custom']);
    const parsed = JSON.parse(output.join('\n'));
    expect(parsed.agent.uses).toBe(7);
    expect(parsed.agent.successRate).toBe(70);
  });

  it('serializes 0 for missing stats (not undefined)', async () => {
    makeAgentDir('stats-empty', {
      name: 'stats-empty',
      enabled: true,
      model: 'sonnet',
    });
    await run(['agent', 'stats', '--json', 'stats-empty']);
    const parsed = JSON.parse(output.join('\n'));
    expect(parsed.agent.uses).toBe(0);
    expect(parsed.agent.successRate).toBe(0);
  });
});

// ─── B: parseAgentSkillInfo table format ─────────────────────────────

describe('parseAgentSkillInfo — task table format', () => {
  it('parses agent from 3-col | Task | Agent | Status | table', () => {
    const content = [
      '| Task | Agent | Status |',
      '|------|-------|--------|',
      '| 001-001: Fix bug | security-auditor | GO |',
      '| 001-002: Add tests | test-writer | GO_WITH_TECH_DEBT |',
    ].join('\n');
    const { agents } = parseAgentSkillInfo(content);
    expect(agents).toContain('security-auditor');
    expect(agents).toContain('test-writer');
  });

  it('parses agent from 4-col | Task | Agent | Skills | Status | table', () => {
    const content = [
      '| Task | Agent | Skills | Status |',
      '|------|-------|--------|--------|',
      '| 001-001: Fix bug | security-auditor | typescript-expert | GO |',
      '| 001-002: Add tests | test-writer | testing-expert | DONE |',
    ].join('\n');
    const { agents } = parseAgentSkillInfo(content);
    expect(agents).toContain('security-auditor');
    expect(agents).toContain('test-writer');
  });

  it('extracts skills from 4-col table', () => {
    const content = [
      '| Task | Agent | Skills | Status |',
      '|------|-------|--------|--------|',
      '| 001-001: Fix bug | security-auditor | typescript-expert, testing-expert | GO |',
    ].join('\n');
    const { skills } = parseAgentSkillInfo(content);
    expect(skills).toContain('typescript-expert');
    expect(skills).toContain('testing-expert');
  });

  it('ignores header and separator rows in table', () => {
    const content = [
      '| Task | Agent | Status |',
      '|------|-------|--------|',
    ].join('\n');
    const { agents } = parseAgentSkillInfo(content);
    expect(agents).not.toContain('Task');
    expect(agents).not.toContain('Agent');
    expect(agents).not.toContain('Status');
  });

  it('does not include generic agent in agents list', () => {
    const content = '| 001-001: Fix | generic | GO |';
    const { agents } = parseAgentSkillInfo(content);
    expect(agents).not.toContain('generic');
  });

  it('merges agents from Agents: header and table format', () => {
    const content = [
      'Agents: doc-writer',
      '| 001-001: Fix bug | security-auditor | GO |',
    ].join('\n');
    const { agents } = parseAgentSkillInfo(content);
    expect(agents).toContain('doc-writer');
    expect(agents).toContain('security-auditor');
  });

  it('deduplicates agents appearing in both formats', () => {
    const content = [
      'Agents: security-auditor',
      '| 001-001: Fix bug | security-auditor | GO |',
    ].join('\n');
    const { agents } = parseAgentSkillInfo(content);
    expect(agents.filter(a => a === 'security-auditor')).toHaveLength(1);
  });
});

// ─── B: parseSprintLog with task table ───────────────────────────────

describe('parseSprintLog — task table with agents', () => {
  it('extracts agents from 4-col task table in sprint log', () => {
    const content = [
      '# sprint-061',
      '## Metrics',
      '| Metric | Value |',
      '|--------|-------|',
      '| Total Tasks | 3 |',
      '| Completed | 3 |',
      '| Duration | 5000ms |',
      '',
      '## Agents',
      'Agents: -',
      'Skills: -',
      '',
      '## Tasks',
      '| Task | Agent | Skills | Status |',
      '|------|-------|--------|--------|',
      '| 061-001: Fix auth | security-auditor | typescript-expert | GO |',
      '| 061-002: Add tests | test-writer | testing-expert | GO |',
      '| 061-003: Docs | doc-writer | - | DONE |',
    ].join('\n');
    const record = parseSprintLog(content);
    expect(record.agents).toContain('security-auditor');
    expect(record.agents).toContain('test-writer');
    expect(record.agents).toContain('doc-writer');
  });

  it('extracts skills from 4-col task table in sprint log', () => {
    const content = [
      '# sprint-061',
      '## Tasks',
      '| Task | Agent | Skills | Status |',
      '|------|-------|--------|--------|',
      '| 061-001: Fix | security-auditor | typescript-expert | GO |',
    ].join('\n');
    const record = parseSprintLog(content);
    expect(record.skills).toContain('typescript-expert');
  });

  it('falls back to Agents: header when table has no agents', () => {
    const content = [
      '# sprint-061',
      'Agents: doc-writer',
      'Skills: testing-expert',
    ].join('\n');
    const record = parseSprintLog(content);
    expect(record.agents).toContain('doc-writer');
    expect(record.skills).toContain('testing-expert');
  });
});
