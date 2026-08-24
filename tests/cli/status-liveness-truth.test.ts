import { describe, expect, it } from 'vitest';

import { projectWorkerLiveness } from '../../src/cli/commands/status.js';
import {
  AgentStatus,
  SprintPhase,
  SprintStatus,
  type AgentInfo,
  type DashboardState,
} from '../../src/core/types.js';

const HEARTBEAT_TIMEOUT_MS = 90_000;
const ROOT = '/resolved/project-root';

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
    updatedAt: '2026-08-11T01:00:00.000Z',
  };
}

describe('status worker liveness truth projection', () => {
  it('keeps a frozen one-write activity row active when host authority says alive', () => {
    const source = dashboard([agent({ lastHeartbeat: '2000-01-01T00:00:00.000Z' })]);
    const projected = projectWorkerLiveness(source, {
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      projectRoot: ROOT,
      workerLiveness: (_task, root) => {
        expect(root).toBe(ROOT);
        return 'alive';
      },
    });

    expect(projected.agents[0]).toEqual(source.agents[0]);
    expect(projected.progress.active).toBe(1);
  });

  it('marks only an explicit host-authority dead worker stale with i18n text', () => {
    const source = dashboard([agent({ lastHeartbeat: '2099-01-01T00:00:00.000Z' })]);

    const projected = projectWorkerLiveness(source, {
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      lang: 'en',
      projectRoot: ROOT,
      workerLiveness: () => 'dead',
    });

    expect(projected.agents).toHaveLength(1);
    expect(projected.agents[0]?.status).toBe(AgentStatus.ERROR);
    expect(projected.agents[0]?.currentAction).toContain('Stale workers');
    expect(projected.agents[0]?.currentAction).toContain('Recover a crashed or stuck sprint');
    expect(projected.progress.active).toBe(0);
  });

  it('never renders host-dead workers as writing or active', () => {
    const deadWorkers = dashboard([
      agent({ id: 'w-a', lastHeartbeat: '2026-08-11T00:41:00.000Z' }),
      agent({ id: 'w-b', lastHeartbeat: '2026-08-11T00:41:30.000Z' }),
    ]);

    const projected = projectWorkerLiveness(deadWorkers, {
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      projectRoot: ROOT,
      workerLiveness: () => 'dead',
    });

    expect(projected.progress.active).toBe(0);
    expect(projected.agents.every(row => row.status === AgentStatus.ERROR)).toBe(true);
    expect(projected.agents.every(row => row.currentAction !== 'Writing code')).toBe(true);
  });

  it('keeps unavailable or HOLD authority separate from dead', () => {
    const projected = projectWorkerLiveness(dashboard([agent()]), {
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      projectRoot: ROOT,
      workerLiveness: () => 'unavailable',
    });

    expect(projected.agents[0]?.status).toBe(AgentStatus.CODING);
    expect(projected.progress.active).toBe(1);
  });
});
