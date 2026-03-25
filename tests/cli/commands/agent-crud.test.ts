import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock resolveProjectRoot before importing module
const testRoot = join(tmpdir(), `deckent-agent-crud-${Date.now()}`);
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
}));

// Capture output
const output: string[] = [];
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (msg: string) => output.push(msg),
  printError: (err: unknown) => output.push(String(err instanceof Error ? err.message : err)),
  formatTable: (headers: string[], rows: string[][]) => {
    return [headers.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n');
  },
}));

import { registerAgent } from '../../../src/cli/commands/agent.js';
import { Command } from 'commander';

function makeAgent(name: string, overrides: Record<string, unknown> = {}) {
  const agentDir = join(testRoot, '.deckent/agents', name);
  mkdirSync(agentDir, { recursive: true });
  const config = {
    name,
    type: 'custom',
    enabled: true,
    model: 'sonnet',
    triggers: [],
    description: `Agent ${name}`,
    uses: 5,
    successRate: 80,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(config, null, 2));
  writeFileSync(join(agentDir, 'PROMPT.md'), `# Agent: ${name}\nTest prompt content`);
  return agentDir;
}

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerAgent(program);
  return program;
}

async function run(args: string[]) {
  output.length = 0;
  process.exitCode = undefined;
  const program = buildProgram();
  await program.parseAsync(['node', 'deckent', ...args]);
}

describe('agent CRUD commands', () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, '.deckent/agents'), { recursive: true });
    output.length = 0;
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  // ─── delete ──────────────────────────────────────────────
  describe('agent delete', () => {
    it('should delete an existing agent', async () => {
      const agentDir = makeAgent('test-agent');
      expect(existsSync(agentDir)).toBe(true);

      await run(['agent', 'delete', 'test-agent']);

      expect(existsSync(agentDir)).toBe(false);
      expect(output.some((o) => o.includes("'test-agent' deleted"))).toBe(true);
    });

    it('should not have directory after delete', async () => {
      makeAgent('doomed');
      await run(['agent', 'delete', 'doomed']);
      expect(existsSync(join(testRoot, '.deckent/agents/doomed'))).toBe(false);
    });

    it('should show error for non-existent agent', async () => {
      await run(['agent', 'delete', 'ghost']);
      expect(output.some((o) => o.includes('not found'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });
  });

  // ─── edit ────────────────────────────────────────────────
  describe('agent edit', () => {
    it('should update model via --model', async () => {
      makeAgent('edit-me');
      await run(['agent', 'edit', 'edit-me', '--model', 'opus']);

      const config = JSON.parse(readFileSync(join(testRoot, '.deckent/agents/edit-me/agent.json'), 'utf-8'));
      expect(config.model).toBe('opus');
      expect(output.some((o) => o.includes('model=opus'))).toBe(true);
    });

    it('should update description via --description', async () => {
      makeAgent('edit-me2');
      await run(['agent', 'edit', 'edit-me2', '--description', 'New desc']);

      const config = JSON.parse(readFileSync(join(testRoot, '.deckent/agents/edit-me2/agent.json'), 'utf-8'));
      expect(config.description).toBe('New desc');
      expect(output.some((o) => o.includes('description=New desc'))).toBe(true);
    });

    it('should show error for non-existent agent', async () => {
      await run(['agent', 'edit', 'nope', '--model', 'opus']);
      expect(output.some((o) => o.includes('not found'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    it('should show info when no options given', async () => {
      makeAgent('show-me', { model: 'haiku', description: 'Test desc' });
      await run(['agent', 'edit', 'show-me']);
      expect(output.some((o) => o.includes('haiku'))).toBe(true);
      expect(output.some((o) => o.includes('Test desc'))).toBe(true);
    });
  });

  // ─── info ────────────────────────────────────────────────
  describe('agent info', () => {
    it('should show agent details', async () => {
      makeAgent('info-agent', { model: 'opus', uses: 10, successRate: 95 });
      await run(['agent', 'info', 'info-agent']);
      expect(output.some((o) => o.includes('info-agent'))).toBe(true);
      expect(output.some((o) => o.includes('opus'))).toBe(true);
      expect(output.some((o) => o.includes('95%'))).toBe(true);
    });

    it('should include PROMPT.md content', async () => {
      makeAgent('prompt-agent');
      await run(['agent', 'info', 'prompt-agent']);
      expect(output.some((o) => o.includes('Test prompt content'))).toBe(true);
    });

    it('should show error for non-existent agent', async () => {
      await run(['agent', 'info', 'missing']);
      expect(output.some((o) => o.includes('not found'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });
  });
});
