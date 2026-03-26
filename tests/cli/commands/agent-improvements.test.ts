/**
 * Tests for agent command improvements (task-057-012):
 * A) agent stats command
 * B) trigger pattern validation
 * C) systemPrompt auto-fill from PROMPT.md
 * D) --model flag in create
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';

const testRoot = join(tmpdir(), `deckent-agent-impr-${Date.now()}`);

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

import { registerAgent, validateTriggers } from '../../../src/cli/commands/agent.js';

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
  writeFileSync(join(agentDir, 'PROMPT.md'), `# Agent: ${name}\nTest prompt content.`);
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

describe('agent improvements', () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, '.deckent/agents'), { recursive: true });
    output.length = 0;
  });

  afterEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
  });

  // ─── A) agent stats command ─────────────────────────────────────────────

  describe('A: agent stats', () => {
    it('shows stats for existing agent', async () => {
      makeAgent('stats-agent', { uses: 10, successRate: 90 });
      await run(['agent', 'stats', 'stats-agent']);
      expect(output.some(o => o.includes('stats-agent'))).toBe(true);
      expect(output.some(o => o.includes('10'))).toBe(true);
    });

    it('outputs JSON with --json flag', async () => {
      makeAgent('stats-json-agent');
      await run(['agent', 'stats', '--json', 'stats-json-agent']);
      const jsonLine = output.join('\n');
      const parsed = JSON.parse(jsonLine);
      expect(parsed.agent).toBeDefined();
      expect(parsed.agent.name).toBe('stats-json-agent');
      expect(Array.isArray(parsed.sprints)).toBe(true);
    });

    it('reports error for missing agent', async () => {
      await run(['agent', 'stats', 'missing-agent']);
      expect(output.some(o => o.includes('not found') || o.includes('missing-agent'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    it('shows overall success rate', async () => {
      makeAgent('rate-agent', { uses: 20, successRate: 75 });
      await run(['agent', 'stats', 'rate-agent']);
      expect(output.some(o => o.includes('75%'))).toBe(true);
    });
  });

  // ─── B) trigger validation ──────────────────────────────────────────────

  describe('B: validateTriggers', () => {
    it('accepts valid trigger keywords', () => {
      expect(validateTriggers(['typescript', 'node.js', 'test-runner', 'api*'])).toEqual([]);
    });

    it('rejects empty string', () => {
      expect(validateTriggers([''])).toHaveLength(1);
    });

    it('rejects whitespace-only string', () => {
      expect(validateTriggers(['   '])).toHaveLength(1);
    });

    it('rejects triggers with spaces', () => {
      expect(validateTriggers(['has spaces'])).toHaveLength(1);
    });

    it('accepts mixed valid triggers and returns no errors', () => {
      expect(validateTriggers(['go', 'rust', 'python_3', 'react.js'])).toEqual([]);
    });

    it('enforces validation during agent create --triggers', async () => {
      await run(['agent', 'create', 'trigger-bad-agent', '--triggers', 'has spaces']);
      expect(process.exitCode).toBe(1);
      expect(output.some(o => o.toLowerCase().includes('invalid'))).toBe(true);
    });

    it('saves valid triggers during agent create --triggers', async () => {
      await run(['agent', 'create', 'trigger-good-agent', '--triggers', 'typescript', 'react']);
      const config = JSON.parse(readFileSync(
        join(testRoot, '.deckent/agents/trigger-good-agent/agent.json'), 'utf-8',
      ));
      expect(config.triggers).toEqual(['typescript', 'react']);
    });

    it('enforces validation during agent edit --triggers', async () => {
      makeAgent('trigger-edit-bad');
      await run(['agent', 'edit', 'trigger-edit-bad', '--triggers', '']);
      expect(process.exitCode).toBe(1);
      expect(output.some(o => o.toLowerCase().includes('invalid') || o.toLowerCase().includes('empty'))).toBe(true);
    });

    it('saves valid triggers during agent edit --triggers', async () => {
      makeAgent('trigger-edit-good');
      await run(['agent', 'edit', 'trigger-edit-good', '--triggers', 'api', 'security']);
      const config = JSON.parse(readFileSync(
        join(testRoot, '.deckent/agents/trigger-edit-good/agent.json'), 'utf-8',
      ));
      expect(config.triggers).toEqual(['api', 'security']);
    });
  });

  // ─── C) systemPrompt auto-fill ──────────────────────────────────────────

  describe('C: systemPrompt auto-fill', () => {
    it('creates agent.json with systemPrompt from PROMPT.md', async () => {
      await run(['agent', 'create', 'system-prompt-agent']);
      const configPath = join(testRoot, '.deckent/agents/system-prompt-agent/agent.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.systemPrompt).toBeDefined();
      expect(typeof config.systemPrompt).toBe('string');
      expect(config.systemPrompt.length).toBeGreaterThan(0);
    });

    it('systemPrompt matches PROMPT.md content', async () => {
      await run(['agent', 'create', 'match-prompt-agent']);
      const agentDir = join(testRoot, '.deckent/agents/match-prompt-agent');
      const config = JSON.parse(readFileSync(join(agentDir, 'agent.json'), 'utf-8'));
      const promptContent = readFileSync(join(agentDir, 'PROMPT.md'), 'utf-8');
      expect(config.systemPrompt).toBe(promptContent);
    });
  });

  // ─── D) model selection ─────────────────────────────────────────────────

  describe('D: model selection in create', () => {
    it('defaults to sonnet when --model not specified', async () => {
      await run(['agent', 'create', 'default-model-agent']);
      const config = JSON.parse(readFileSync(
        join(testRoot, '.deckent/agents/default-model-agent/agent.json'), 'utf-8',
      ));
      expect(config.model).toBe('sonnet');
    });

    it('uses opus when --model opus specified', async () => {
      await run(['agent', 'create', 'opus-agent', '--model', 'opus']);
      const config = JSON.parse(readFileSync(
        join(testRoot, '.deckent/agents/opus-agent/agent.json'), 'utf-8',
      ));
      expect(config.model).toBe('opus');
    });

    it('uses haiku when --model haiku specified', async () => {
      await run(['agent', 'create', 'haiku-agent', '--model', 'haiku']);
      const config = JSON.parse(readFileSync(
        join(testRoot, '.deckent/agents/haiku-agent/agent.json'), 'utf-8',
      ));
      expect(config.model).toBe('haiku');
    });

    it('rejects invalid model name', async () => {
      await run(['agent', 'create', 'invalid-model-agent', '--model', 'not-a-model']);
      expect(process.exitCode).toBe(1);
      expect(output.some(o => o.toLowerCase().includes('invalid'))).toBe(true);
    });

    it('shows model in create output', async () => {
      await run(['agent', 'create', 'model-output-agent', '--model', 'opus']);
      expect(output.some(o => o.includes('opus'))).toBe(true);
    });
  });
});
