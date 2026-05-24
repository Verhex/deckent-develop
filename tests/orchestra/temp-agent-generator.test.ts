import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AGENT_PROMPT_TEMPLATES,
  ensureAgentPromptMd,
  getPromptTemplate,
  persistTempAgentPrompts,
  promptMdPath,
  renderAgentPromptMd,
  writeAgentPromptMd,
  type AgentPromptTemplate,
} from '../../src/orchestra/temp-agent-generator.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mkAgent(
  id: string,
  overrides: Partial<AgentDefinition> = {},
): Pick<AgentDefinition, 'id' | 'name' | 'description' | 'expertise'> {
  return {
    id,
    name: overrides.name ?? `Agent ${id}`,
    description: overrides.description ?? `description for ${id}`,
    expertise: overrides.expertise ?? ['typescript', 'react'],
  };
}

const FOUR_DISCIPLINE_HEADINGS = [
  '### Think Before Coding',
  '### Simplicity First',
  '### Surgical Changes',
  '### Goal-Driven Execution',
];

// ─── getPromptTemplate ──────────────────────────────────────────────────────

describe('temp-agent-generator: getPromptTemplate', () => {
  it('returns the react-ts template for temp-react-ts-specialist', () => {
    const tpl = getPromptTemplate('temp-react-ts-specialist');
    expect(tpl).toBe(AGENT_PROMPT_TEMPLATES['react-ts-specialist']);
    expect(tpl.stackHeading).toBe('React + TypeScript');
  });

  it('returns the python-api template for temp-python-api-specialist', () => {
    const tpl = getPromptTemplate('temp-python-api-specialist');
    expect(tpl.stackHeading).toBe('Python + FastAPI');
    expect(tpl.testingHint.toLowerCase()).toContain('pytest');
  });

  it('falls back to generic template for unknown agent id', () => {
    const tpl = getPromptTemplate('temp-unknown-quantum-specialist');
    expect(tpl.stackHeading).toBe('Generic');
    expect(tpl.tagline.length).toBeGreaterThan(0);
  });

  it('handles agent id without the temp- prefix', () => {
    const tpl = getPromptTemplate('go-specialist');
    expect(tpl.stackHeading).toBe('Go');
  });
});

// ─── renderAgentPromptMd ────────────────────────────────────────────────────

describe('temp-agent-generator: renderAgentPromptMd', () => {
  it('renders react-ts PROMPT.md with stack section + 4-discipline block', () => {
    const md = renderAgentPromptMd(mkAgent('temp-react-ts-specialist', { name: 'React TS' }));
    expect(md).toContain('# React TS');
    expect(md).toContain('## Stack: React + TypeScript');
    for (const heading of FOUR_DISCIPLINE_HEADINGS) {
      expect(md).toContain(heading);
    }
    expect(md).toContain('## Discipline');
  });

  it('renders python-api PROMPT.md mentioning FastAPI + Pydantic', () => {
    const md = renderAgentPromptMd(mkAgent('temp-python-api-specialist', { name: 'Py API' }));
    expect(md).toContain('## Stack: Python + FastAPI');
    expect(md.toLowerCase()).toContain('pydantic');
    expect(md.toLowerCase()).toContain('fastapi');
  });

  it('falls back to generic template for unknown agent id but still includes 4-discipline block', () => {
    const md = renderAgentPromptMd(mkAgent('temp-quantum-banana', { name: 'Quantum' }));
    expect(md).toContain('## Stack: Generic');
    for (const heading of FOUR_DISCIPLINE_HEADINGS) {
      expect(md).toContain(heading);
    }
  });

  it('includes agent description and expertise when supplied', () => {
    const md = renderAgentPromptMd({
      id: 'temp-react-specialist',
      name: 'React Pro',
      description: 'Specialist agent for component refactors.',
      expertise: ['react', 'redux', 'css-in-js'],
    });
    expect(md).toContain('Specialist agent for component refactors.');
    expect(md).toContain('**Expertise:** react, redux, css-in-js');
  });

  it('accepts an explicit template override', () => {
    const override: AgentPromptTemplate = {
      stackHeading: 'CustomStack',
      tagline: 'custom tagline value',
      bestPractices: ['custom-bp'],
      antiPatterns: ['custom-ap'],
      testingHint: 'custom-test-hint',
    };
    const md = renderAgentPromptMd(mkAgent('temp-anything'), override);
    expect(md).toContain('## Stack: CustomStack');
    expect(md).toContain('custom tagline value');
    expect(md).toContain('- custom-bp');
    expect(md).toContain('- custom-ap');
    expect(md).toContain('- custom-test-hint');
  });
});

// ─── Filesystem helpers ─────────────────────────────────────────────────────

describe('temp-agent-generator: writeAgentPromptMd / ensureAgentPromptMd', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-temp-agent-gen-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('writeAgentPromptMd creates .deckent/agents/<id>/PROMPT.md', () => {
    writeAgentPromptMd(projectRoot, 'temp-react-ts-specialist', '# hello');
    const target = promptMdPath(projectRoot, 'temp-react-ts-specialist');
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('# hello');
  });

  it('writeAgentPromptMd overwrites existing content', () => {
    writeAgentPromptMd(projectRoot, 'temp-go-specialist', 'first');
    writeAgentPromptMd(projectRoot, 'temp-go-specialist', 'second');
    expect(readFileSync(promptMdPath(projectRoot, 'temp-go-specialist'), 'utf8')).toBe('second');
  });

  it('ensureAgentPromptMd creates PROMPT.md when missing', () => {
    const wrote = ensureAgentPromptMd(projectRoot, mkAgent('temp-react-ts-specialist'));
    expect(wrote).toBe(true);
    const target = promptMdPath(projectRoot, 'temp-react-ts-specialist');
    expect(existsSync(target)).toBe(true);
    const content = readFileSync(target, 'utf8');
    expect(content).toContain('## Stack: React + TypeScript');
    for (const heading of FOUR_DISCIPLINE_HEADINGS) {
      expect(content).toContain(heading);
    }
  });

  it('ensureAgentPromptMd preserves an existing non-empty PROMPT.md', () => {
    const target = promptMdPath(projectRoot, 'temp-react-ts-specialist');
    mkdirSync(join(projectRoot, '.deckent', 'agents', 'temp-react-ts-specialist'), { recursive: true });
    writeFileSync(target, '# hand-edited prompt', 'utf8');

    const wrote = ensureAgentPromptMd(projectRoot, mkAgent('temp-react-ts-specialist'));
    expect(wrote).toBe(false);
    expect(readFileSync(target, 'utf8')).toBe('# hand-edited prompt');
  });

  it('ensureAgentPromptMd rewrites empty PROMPT.md files', () => {
    const target = promptMdPath(projectRoot, 'temp-react-ts-specialist');
    mkdirSync(join(projectRoot, '.deckent', 'agents', 'temp-react-ts-specialist'), { recursive: true });
    writeFileSync(target, '   \n  ', 'utf8'); // whitespace only

    const wrote = ensureAgentPromptMd(projectRoot, mkAgent('temp-react-ts-specialist'));
    expect(wrote).toBe(true);
    expect(readFileSync(target, 'utf8').length).toBeGreaterThan(50);
  });
});

// ─── Bulk persist ───────────────────────────────────────────────────────────

describe('temp-agent-generator: persistTempAgentPrompts', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-temp-agent-gen-bulk-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('writes a PROMPT.md for every agent and returns the write count', () => {
    const agents = [
      mkAgent('temp-react-ts-specialist'),
      mkAgent('temp-python-specialist'),
      mkAgent('temp-go-specialist'),
    ];
    const written = persistTempAgentPrompts(projectRoot, agents);
    expect(written).toBe(3);
    for (const agent of agents) {
      expect(existsSync(promptMdPath(projectRoot, agent.id))).toBe(true);
    }
  });

  it('skips agents that already have a non-empty PROMPT.md (idempotent)', () => {
    const agents = [mkAgent('temp-react-ts-specialist'), mkAgent('temp-go-specialist')];
    persistTempAgentPrompts(projectRoot, agents);
    // Second call should write 0 new files.
    const second = persistTempAgentPrompts(projectRoot, agents);
    expect(second).toBe(0);
  });

  it('returns 0 when called with an empty agent list', () => {
    expect(persistTempAgentPrompts(projectRoot, [])).toBe(0);
  });
});

// ─── Integration: temp-skill-generator wiring ───────────────────────────────

describe('temp-agent-generator: generateTempAgents projectRoot wiring', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-gen-wire-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('writes PROMPT.md for every generated temp agent when projectRoot is supplied', async () => {
    const { generateTempAgents } = await import('../../src/orchestra/temp-skill-generator.js');
    const agents = generateTempAgents(
      {
        language: 'TypeScript',
        framework: 'React',
        buildTool: 'vite',
        testFramework: 'vitest',
        dependencies: ['react', 'typescript', '@vitejs/plugin-react'],
        detectedAt: '2026-01-01T00:00:00.000Z',
      },
      projectRoot,
    );
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(existsSync(promptMdPath(projectRoot, agent.id))).toBe(true);
    }
  });

  it('does not write PROMPT.md when projectRoot is omitted (backward compat)', async () => {
    const { generateTempAgents } = await import('../../src/orchestra/temp-skill-generator.js');
    const agents = generateTempAgents({
      language: 'TypeScript',
      framework: 'React',
      buildTool: 'vite',
      testFramework: 'vitest',
      dependencies: ['react', 'typescript'],
      detectedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(agents.length).toBeGreaterThan(0);
    // No PROMPT.md should exist under projectRoot since we never passed it.
    for (const agent of agents) {
      expect(existsSync(promptMdPath(projectRoot, agent.id))).toBe(false);
    }
  });
});
