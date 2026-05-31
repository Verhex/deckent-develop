import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCapabilityCounts, formatHelp, HELP_CONTENT } from '../../src/cli/commands/help.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `help-dynamic-counts-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seedAgent(root: string, id: string): void {
  const agentDir = join(root, '.deckent', 'agents', id);
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    join(agentDir, 'agent.json'),
    JSON.stringify({ id, name: `Agent ${id}`, source: 'builtin', enabled: true }),
    'utf8',
  );
}

function seedSkill(root: string, id: string): void {
  const skillDir = join(root, '.deckent', 'skills', id);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'manifest.json'),
    JSON.stringify({ id, name: `Skill ${id}`, enabled: true }),
    'utf8',
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getCapabilityCounts — agent count is dynamic', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns 0 agents when registry is empty (graceful)', () => {
    const counts = getCapabilityCounts(root);
    expect(counts.agents).toBe(0);
  });

  it('returns count matching actual agents in registry', () => {
    seedAgent(root, 'alpha');
    seedAgent(root, 'beta');
    const counts = getCapabilityCounts(root);
    expect(counts.agents).toBe(2);
  });

  it('reflects additional agents added at runtime', () => {
    seedAgent(root, 'a1');
    const before = getCapabilityCounts(root).agents;
    seedAgent(root, 'a2');
    seedAgent(root, 'a3');
    const after = getCapabilityCounts(root).agents;
    expect(after).toBe(before + 2);
  });
});

describe('getCapabilityCounts — skill count is dynamic', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns 0 skills when registry is empty (graceful)', () => {
    const counts = getCapabilityCounts(root);
    expect(counts.skills).toBe(0);
  });

  it('returns count matching actual skills in registry', () => {
    seedSkill(root, 'ts-expert');
    seedSkill(root, 'react-spec');
    seedSkill(root, 'docker-expert');
    const counts = getCapabilityCounts(root);
    expect(counts.skills).toBe(3);
  });
});

describe('getCapabilityCounts — tool count uses override', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('defaults to 0 when no override provided', () => {
    const counts = getCapabilityCounts(root);
    expect(counts.tools).toBe(0);
  });

  it('uses overrideToolCount when provided', () => {
    const counts = getCapabilityCounts(root, 31);
    expect(counts.tools).toBe(31);
  });

  it('returns all three counts together', () => {
    seedAgent(root, 'x');
    seedSkill(root, 'y');
    const counts = getCapabilityCounts(root, 5);
    expect(counts).toEqual({ agents: 1, skills: 1, tools: 5 });
  });
});

describe('help.ts — no hardcoded agent/skill/tool counts in output', () => {
  it('formatHelp EN output contains no hardcoded count literals', () => {
    const output = formatHelp('en');
    // These are the zero-hardcode forbidden patterns per task spec
    expect(output).not.toMatch(/\b15\s+(?:built-in\s+)?agent/i);
    expect(output).not.toMatch(/\b21\s+skill/i);
    expect(output).not.toMatch(/\b3[12]\s+tool/i);
  });

  it('formatHelp TR output contains no hardcoded count literals', () => {
    const output = formatHelp('tr');
    expect(output).not.toMatch(/\b15\s+(?:built-in\s+)?agent/i);
    expect(output).not.toMatch(/\b21\s+skill/i);
    expect(output).not.toMatch(/\b3[12]\s+tool/i);
  });

  it('HELP_CONTENT has no hardcoded count strings in static data', () => {
    const raw = JSON.stringify(HELP_CONTENT);
    expect(raw).not.toMatch(/\b15 agent|\b21 skill|\b3[12] tool/i);
  });
});
