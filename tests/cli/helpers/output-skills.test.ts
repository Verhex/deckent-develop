import { describe, it, expect } from 'vitest';
import {
  formatSkillsLabel,
  formatDashboard,
  formatAgentLabel,
} from '../../../src/cli/helpers/output.js';
import { AgentStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DashboardState, AgentRole, AgentInfo } from '../../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDashboard(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    sprint: {
      id: 'sprint-001',
      number: 1,
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
    },
    agents: [],
    progress: { done: 2, active: 1, blocked: 0, total: 5 },
    usage: { fiveHourPercent: 30, weeklyPercent: 45 } as DashboardState['usage'],
    alerts: [],
    updatedAt: '2026-03-20T10:00:00.000Z',
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentInfo> & { assignedSkills?: string[] } = {}): AgentInfo & { assignedSkills?: string[] } {
  return {
    id: 'w1',
    role: 'worker' as AgentRole,
    status: AgentStatus.CODING,
    model: 'sonnet',
    tmuxWindow: 'w1',
    currentAction: 'writing code',
    ...overrides,
  };
}

// ─── formatSkillsLabel ──────────────────────────────────────────────

describe('formatSkillsLabel', () => {
  it('returns dim "none" for undefined skills', () => {
    const label = formatSkillsLabel(undefined);
    expect(label).toContain('none');
    expect(label).toContain('\x1b[2m'); // dim ANSI
  });

  it('returns dim "none" for empty skills array', () => {
    const label = formatSkillsLabel([]);
    expect(label).toContain('none');
    expect(label).toContain('\x1b[2m');
  });

  it('returns yellow-highlighted single skill', () => {
    const label = formatSkillsLabel(['typescript']);
    expect(label).toContain('typescript');
    expect(label).toContain('\x1b[33m'); // yellow ANSI
  });

  it('returns comma-separated skills', () => {
    const label = formatSkillsLabel(['typescript', 'react']);
    expect(label).toContain('typescript, react');
  });

  it('includes ANSI reset code', () => {
    const label = formatSkillsLabel(['skill1']);
    expect(label).toContain('\x1b[0m');
  });

  it('handles three or more skills', () => {
    const label = formatSkillsLabel(['a', 'b', 'c']);
    expect(label).toContain('a, b, c');
  });
});

// ─── formatDashboard skills column ──────────────────────────────────

describe('formatDashboard skills column', () => {
  it('shows skills for agent with assignedSkills', () => {
    const agent = makeAgent({ assignedSkills: ['typescript', 'testing'] });
    const state = makeDashboard({ agents: [agent as unknown as AgentInfo] });
    const result = formatDashboard(state);
    expect(result).toContain('typescript');
  });

  it('shows "none" for agent without assignedSkills', () => {
    const agent = makeAgent({ assignedSkills: undefined });
    const state = makeDashboard({ agents: [agent as unknown as AgentInfo] });
    const result = formatDashboard(state);
    expect(result).toContain('none');
  });

  it('shows "none" for agent with empty assignedSkills', () => {
    const agent = makeAgent({ assignedSkills: [] });
    const state = makeDashboard({ agents: [agent as unknown as AgentInfo] });
    const result = formatDashboard(state);
    expect(result).toContain('none');
  });

  it('preserves backward compatibility with agents having no skills field', () => {
    const agent = makeAgent();
    delete (agent as Record<string, unknown>).assignedSkills;
    const state = makeDashboard({ agents: [agent as unknown as AgentInfo] });
    const result = formatDashboard(state);
    expect(result).toContain('none');
    // Should still render the full dashboard
    expect(result).toContain('Sprint 1');
  });

  it('renders both agent and skills columns', () => {
    const agent = makeAgent({
      assignedAgent: 'security-auditor',
      assignedSkills: ['vuln-scan'],
    });
    const state = makeDashboard({ agents: [agent as unknown as AgentInfo] });
    const result = formatDashboard(state);
    expect(result).toContain('security-auditor');
    expect(result).toContain('vuln-scan');
  });

  it('renders multiple agents each with different skills', () => {
    const agent1 = makeAgent({ id: 'w1', assignedSkills: ['react'] });
    const agent2 = makeAgent({ id: 'w2', assignedSkills: ['testing'] });
    const state = makeDashboard({
      agents: [agent1 as unknown as AgentInfo, agent2 as unknown as AgentInfo],
    });
    const result = formatDashboard(state);
    expect(result).toContain('W1');
    expect(result).toContain('W2');
  });
});
