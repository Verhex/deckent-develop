import { describe, expect, it, vi } from 'vitest';

import { projectWorkerLiveness } from '../../src/cli/commands/status.js';
import {
  AgentStatus,
  SprintPhase,
  SprintStatus,
  type AgentInfo,
  type DashboardState,
} from '../../src/core/types.js';

const NOW = Date.parse('2026-08-11T01:00:00.000Z');
const HEARTBEAT_TIMEOUT_MS = 90_000;

function agent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'w-512-002',
    role: 'worker',
    status: AgentStatus.CODING,
    model: 'sonnet',
    tmuxWindow: 'w-512-002',
    taskId: '512-002',
    currentAction: 'Writing code',
    ...overrides,
  };
}

function dashboard(agents: AgentInfo[]): DashboardState {
  return {
    sprint: {
      id: 'sprint-512',
      number: 512,
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
    },
    agents,
    progress: { done: 0, active: agents.length, blocked: 0, total: agents.length },
    alerts: [],
    updatedAt: new Date(NOW).toISOString(),
  };
}

describe('status worker liveness truth projection', () => {
  it('preserves the active output contract for a fresh heartbeat', () => {
    const source = dashboard([
      agent({ lastHeartbeat: new Date(NOW - HEARTBEAT_TIMEOUT_MS + 1).toISOString() }),
    ]);

    const projected = projectWorkerLiveness(source, {
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      nowMs: NOW,
      isProcessAlive: vi.fn(() => false),
    });

    expect(projected.agents[0]).toEqual(source.agents[0]);
    expect(projected.progress.active).toBe(1);
  });

  it('keeps a stale worker visible with a typed stale label and recovery hint', () => {
    const source = dashboard([
      agent({ lastHeartbeat: new Date(NOW - HEARTBEAT_TIMEOUT_MS).toISOString() }),
    ]);

    const projected = projectWorkerLiveness(source, {
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      nowMs: NOW,
      lang: 'en',
      isProcessAlive: vi.fn(() => false),
    });

    expect(projected.agents).toHaveLength(1);
    expect(projected.agents[0]?.status).toBe(AgentStatus.ERROR);
    expect(projected.agents[0]?.currentAction).toContain('Stale workers');
    expect(projected.agents[0]?.currentAction).toContain('Recover a crashed or stuck sprint');
    expect(projected.progress.active).toBe(0);
  });

  it('never renders dead workers with stale heartbeats as writing or active', () => {
    const deadWorkers = dashboard([
      agent({ id: 'w-a', lastHeartbeat: '2026-08-11T00:41:00.000Z' }),
      agent({ id: 'w-b', lastHeartbeat: '2026-08-11T00:41:30.000Z' }),
    ]);

    const projected = projectWorkerLiveness(deadWorkers, {
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      nowMs: Date.parse('2026-08-11T00:44:00.000Z'),
      isProcessAlive: vi.fn(() => false),
    });

    expect(projected.progress.active).toBe(0);
    expect(projected.agents.every(row => row.status === AgentStatus.ERROR)).toBe(true);
    expect(projected.agents.every(row => row.currentAction !== 'Writing code')).toBe(true);
  });

  it('accepts a verifiably live process when heartbeat evidence is stale', () => {
    const livePidAgent = agent({
      lastHeartbeat: new Date(NOW - HEARTBEAT_TIMEOUT_MS).toISOString(),
      pid: 4242,
    } as Partial<AgentInfo> & { pid: number });

    const projected = projectWorkerLiveness(dashboard([livePidAgent]), {
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      nowMs: NOW,
      isProcessAlive: vi.fn(pid => pid === 4242),
    });

    expect(projected.agents[0]?.status).toBe(AgentStatus.CODING);
    expect(projected.progress.active).toBe(1);
  });
});
