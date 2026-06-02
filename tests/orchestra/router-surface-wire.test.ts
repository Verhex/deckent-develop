// Sprint 219-015 — Plan-time routing routeTaskV2 wire (surface-bonus).
//
// Verifies that task-router.ts's `routeTask` consults routing-engine's
// user-surface bonus so that cli/commands/, dashboard/, api/ tasks route to
// their surface-owner agent (api-builder / frontend-designer / ci-guardian)
// instead of collapsing onto refactorer's generic impl@7.

import { describe, it, expect } from 'vitest';
import {
  routeTask,
  applyUserSurfaceBonus,
  type TaskRouterConfig,
} from '../../src/orchestra/task-router.js';
import { TaskStatus, type Task, type ProviderName } from '../../src/core/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '219-015-t',
    title: 'Surface routing test',
    description: 'Wire surface-bonus into plan-time router',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

const allProviders: ProviderName[] = ['claude', 'codex', 'gemini'];
const defaultConfig: TaskRouterConfig = {};

describe('routeTask — user-surface bonus wire (Sprint 219-015)', () => {
  it('routes src/cli/commands/ tasks to api-builder (surface owner)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/cli/commands/'],
        filesRead: [],
        filesWrite: ['src/cli/commands/chat-native.ts'],
      },
      // Simulate what V1 selectAgent would have picked — the wire-gap symptom:
      assignedAgent: 'refactorer',
    });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.agent).toBe('api-builder');
  });

  it('routes src/dashboard/ tasks to frontend-designer (surface owner)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/dashboard/src/components/Sidebar.tsx'],
      },
      assignedAgent: 'refactorer',
    });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.agent).toBe('frontend-designer');
  });

  it('routes src/api/ tasks to api-builder (surface owner)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/api/'],
        filesRead: [],
        filesWrite: ['src/api/server.ts'],
      },
      assignedAgent: 'refactorer',
    });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.agent).toBe('api-builder');
  });

  it('preserves src/core/ refactorer/architect (non-surface — no override)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/config.ts'],
      },
      assignedAgent: 'refactorer',
    });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.agent).toBe('refactorer');
  });

  it('preserves src/orchestra/ architect (non-surface — no override)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/sprint-controller.ts'],
      },
      assignedAgent: 'architect',
    });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.agent).toBe('architect');
  });

  it('honors forceAgent over surface routing (user override wins)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/cli/commands/'],
        filesRead: [],
        filesWrite: ['src/cli/commands/foo.ts'],
      },
      forceAgent: 'custom-agent',
      assignedAgent: 'custom-agent',
    });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.agent).toBe('custom-agent');
  });

  it('does not collapse security-bearing src/api/ tasks onto api-builder', () => {
    // A security task touching src/api/ should NOT receive the surface bonus
    // for api-builder — routing-engine's getUserSurfaceBonus zeros it out so
    // security-auditor wins. applyUserSurfaceBonus returns null in that case.
    const task = makeTask({
      title: 'Security audit auth middleware',
      description: 'Harden authentication and authorization for API routes',
      scope: {
        directories: ['src/api/'],
        filesRead: [],
        filesWrite: ['src/api/auth-middleware.ts'],
      },
      assignedAgent: 'security-auditor',
    });
    const surface = applyUserSurfaceBonus(task);
    expect(surface).not.toBe('api-builder');
    const result = routeTask(task, defaultConfig, allProviders);
    // Surface override did not divert; planner-assigned security-auditor preserved.
    expect(result.agent).toBe('security-auditor');
  });

  it('routes ui/ design tasks to frontend-designer (surface owner)', () => {
    const task = makeTask({
      scope: {
        directories: ['ui/'],
        filesRead: [],
        filesWrite: [],
      },
    });
    const result = routeTask(task, defaultConfig, allProviders);
    expect(result.agent).toBe('frontend-designer');
  });
});

describe('applyUserSurfaceBonus — direct unit tests', () => {
  it('returns null for src/core/ (non-surface scope)', () => {
    const task = makeTask({
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] },
    });
    expect(applyUserSurfaceBonus(task)).toBeNull();
  });

  it('returns api-builder for src/cli/commands/ scope', () => {
    const task = makeTask({
      scope: { directories: ['src/cli/commands/'], filesRead: [], filesWrite: [] },
    });
    expect(applyUserSurfaceBonus(task)).toBe('api-builder');
  });

  it('returns null when forceAgent is set (override wins)', () => {
    const task = makeTask({
      scope: { directories: ['src/cli/commands/'], filesRead: [], filesWrite: [] },
      forceAgent: 'my-agent',
    });
    expect(applyUserSurfaceBonus(task)).toBeNull();
  });
});
