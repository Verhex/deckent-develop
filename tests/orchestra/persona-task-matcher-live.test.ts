// Tests for persona-task matcher live verification (Sprint 197 task 197-005)
// Verifies applyPersonaDomainCheck + TEMP_AGENT_DOMAINS + domain-aware getAgentDomain
import { describe, it, expect } from 'vitest';
import { validatePersonaTaskMatch, applyPersonaDomainCheck } from '../../src/orchestra/task-builder.js';
import { getAgentDomain, TEMP_AGENT_DOMAINS } from '../../src/core/agent-pool.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import type { Task } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgent(id: string, overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id,
    name: id,
    description: '',
    systemPrompt: '',
    expertise: [],
    allowedTools: [],
    deniedTools: [],
    preferredModel: 'sonnet',
    effortMultiplier: 1.0,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: false,
    enabled: true,
    source: 'learned',
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    ...overrides,
  };
}

function makeTask(filesWrite: string[], directories: string[] = []): Pick<Task, 'scope'> {
  return { scope: { filesWrite, directories, filesRead: [] } };
}

function makePool(agents: AgentDefinition[]): AgentPool {
  const pool: AgentPool = new Map();
  for (const a of agents) pool.set(a.id, a);
  return pool;
}

// ─── (a) CLI task + temp-react-ts-specialist → HIGH → rotation ───────────────

describe('applyPersonaDomainCheck — live routing scenarios', () => {
  it('(a) CLI task + temp-react-ts-specialist → HIGH mismatch → rotates to architect', () => {
    // temp-react-ts-specialist has domain='react' via TEMP_AGENT_DOMAINS
    const reactSpec = makeAgent('temp-react-ts-specialist');
    const architect = makeAgent('architect', { source: 'builtin' });
    const pool = makePool([reactSpec, architect]);

    const task = makeTask(['src/cli/commands.ts', 'src/cli/index.ts'], ['src/cli/']);
    const result = applyPersonaDomainCheck('temp-react-ts-specialist', task, pool);

    expect(result.rotated).toBe(true);
    expect(result.agentId).toBe('architect'); // cli domain → architect suggested
    expect(result.reason).toBeDefined();
    expect(result.reason).toMatch(/domain/i);
  });

  it('(b) System task (src/orchestra/) + temp-react-ts-specialist → HIGH → architect', () => {
    const reactSpec = makeAgent('temp-react-ts-specialist');
    const architect = makeAgent('architect', { source: 'builtin' });
    const pool = makePool([reactSpec, architect]);

    const task = makeTask(['src/orchestra/sprint-planner.ts'], ['src/orchestra/']);
    const result = applyPersonaDomainCheck('temp-react-ts-specialist', task, pool);

    expect(result.rotated).toBe(true);
    expect(result.agentId).toBe('architect');
  });

  it('(c) React task (src/dashboard/) + temp-react-ts-specialist → match, no rotation', () => {
    const reactSpec = makeAgent('temp-react-ts-specialist');
    const pool = makePool([reactSpec]);

    const task = makeTask(['src/dashboard/App.tsx'], ['src/dashboard/']);
    const result = applyPersonaDomainCheck('temp-react-ts-specialist', task, pool);

    expect(result.rotated).toBe(false);
    expect(result.agentId).toBe('temp-react-ts-specialist');
  });

  it('(d) Multi-domain task → ambiguous, no rotation even for react agent', () => {
    const reactSpec = makeAgent('temp-react-ts-specialist');
    const pool = makePool([reactSpec]);

    // cli + react mixed → multi-domain → no override
    const task = makeTask(['src/cli/cmd.ts', 'src/dashboard/App.tsx'], ['src/cli/', 'src/dashboard/']);
    const result = applyPersonaDomainCheck('temp-react-ts-specialist', task, pool);

    expect(result.rotated).toBe(false);
    expect(result.agentId).toBe('temp-react-ts-specialist');
  });

  it('(e) generic agent always passes through without rotation', () => {
    const pool = makePool([]);
    const task = makeTask(['src/cli/commands.ts'], ['src/cli/']);
    const result = applyPersonaDomainCheck('generic', task, pool);

    expect(result.rotated).toBe(false);
    expect(result.agentId).toBe('generic');
  });
});

// ─── TEMP_AGENT_DOMAINS — domain calibration ──────────────────────────────────

describe('TEMP_AGENT_DOMAINS — domain calibration', () => {
  it('temp-react-ts-specialist has domain react in TEMP_AGENT_DOMAINS', () => {
    expect(TEMP_AGENT_DOMAINS['temp-react-ts-specialist']).toBe('react');
  });

  it('getAgentDomain returns react for temp-react-ts-specialist without explicit domain field', () => {
    // No domain field set in agent.json — relies on TEMP_AGENT_DOMAINS fallback
    const agent = makeAgent('temp-react-ts-specialist');
    expect(agent.domain).toBeUndefined();
    expect(getAgentDomain(agent)).toBe('react');
  });

  it('agent.domain field takes precedence over TEMP_AGENT_DOMAINS override', () => {
    const agent = makeAgent('temp-react-ts-specialist', { domain: 'cli' });
    expect(getAgentDomain(agent)).toBe('cli');
  });
});

// ─── Integration: validatePersonaTaskMatch with TEMP_AGENT_DOMAINS ────────────

describe('validatePersonaTaskMatch integration with TEMP_AGENT_DOMAINS', () => {
  it('temp-react-ts-specialist (no domain field) gets domain react via TEMP_AGENT_DOMAINS', () => {
    const agent = makeAgent('temp-react-ts-specialist'); // no domain field
    const cliTask = makeTask(['src/cli/main.ts'], ['src/cli/']);

    const result = validatePersonaTaskMatch(agent, cliTask);
    // Should detect HIGH mismatch: react agent on cli task
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('HIGH');
    expect(result.suggestedAgent).toBeDefined();
  });

  it('applyPersonaDomainCheck rotation uses TEMP_AGENT_DOMAINS without domain in agent.json', () => {
    const reactSpec = makeAgent('temp-react-ts-specialist'); // no domain field
    const architect = makeAgent('architect', { source: 'builtin' });
    const pool = makePool([reactSpec, architect]);

    const systemTask = makeTask(['src/core/types.ts'], ['src/core/']);
    const result = applyPersonaDomainCheck('temp-react-ts-specialist', systemTask, pool);

    // Should rotate because TEMP_AGENT_DOMAINS gives 'react' domain → system mismatch HIGH
    expect(result.rotated).toBe(true);
    expect(result.agentId).not.toBe('temp-react-ts-specialist');
  });
});
