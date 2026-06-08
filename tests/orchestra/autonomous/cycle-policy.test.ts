import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAutonomousCycle } from '../../../src/orchestra/autonomous-runtime.js';
import type { AutonomousRuntimeDeps, AutonomousTrigger } from '../../../src/orchestra/autonomous-runtime.js';
import { buildEngineRuntime } from '../../../src/orchestra/autonomous/runtime-loop.js';
import { AUTONOMOUS_EXECUTE_ACTION } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import type { TaskResult } from '../../../src/core/types.js';

const trig: AutonomousTrigger = { id: 't1', source: 'backlog', action: 'autonomous.execute', requestedBy: 'system', payload: {} };

function deps(over: Partial<AutonomousRuntimeDeps>): AutonomousRuntimeDeps {
  return {
    triggerSource: { next: () => trig },
    authority: { check: () => ({ outcome: 'allowed', reason: 'ok' }) },
    approvalGate: { request: () => ({ outcome: 'pending', reason: 'parked' }) },
    executor: { execute: vi.fn().mockResolvedValue({ ok: true }) },
    audit: { record: () => {} },
    ...over,
  };
}

describe('cycle policy gate (G2/G3 split from RBAC)', () => {
  it('policyGate=park → cycle parks (pending), executor NOT called', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({ executor: { execute: exec }, policyGate: { decide: () => ({ decision: 'park', reason: 'approval-required' }) } });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('pending');
    expect(exec).not.toHaveBeenCalled();
  });

  it('policyGate=park + approvalGate rejects → rejected, executor NOT called', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({
      executor: { execute: exec },
      approvalGate: { request: () => ({ outcome: 'rejected', reason: 'no' }) },
      policyGate: { decide: () => ({ decision: 'park', reason: 'approval-required' }) },
    });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('rejected');
    expect(exec).not.toHaveBeenCalled();
  });

  it('policyGate=park + approvalGate approves → executes', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({
      executor: { execute: exec },
      approvalGate: { request: () => ({ outcome: 'approved', reason: 'yes' }) },
      policyGate: { decide: () => ({ decision: 'park', reason: 'x' }) },
    });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
    expect(exec).toHaveBeenCalledOnce();
  });

  it('policyGate=auto → executor runs', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({ executor: { execute: exec }, policyGate: { decide: () => ({ decision: 'auto', reason: 'auto' }) } });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
    expect(exec).toHaveBeenCalledOnce();
  });

  it('no policyGate → legacy behavior preserved (executes when authority allowed)', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({ executor: { execute: exec } });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
  });

  it('authority denied still short-circuits before policy gate', async () => {
    const policyDecide = vi.fn().mockReturnValue({ decision: 'auto', reason: 'x' });
    const d = deps({
      authority: { check: () => ({ outcome: 'denied', reason: 'nope' }) },
      policyGate: { decide: policyDecide },
    });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('denied');
    expect(policyDecide).not.toHaveBeenCalled();
  });

  it('authority needs_approval (approved) + policyGate=park → approvalGate.request called ONCE', async () => {
    const requestSpy = vi.fn().mockResolvedValue({ outcome: 'approved', reason: 'yes' });
    const d = deps({
      authority: { check: () => ({ outcome: 'needs_approval', reason: 'risk' }) },
      approvalGate: { request: requestSpy },
      policyGate: { decide: () => ({ decision: 'park', reason: 'policy' }) },
    });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── Gap C: trusted-internal authority wrap (buildEngineRuntime) ─────

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Gap C — trusted-internal authority wrap in buildEngineRuntime', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), `gap-c-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    // Seed an empty backlog so loadBacklog doesn't throw
    writeFileSync(join(tmpDir, 'backlog.json'), JSON.stringify({ _version: '1.0', entries: [] }, null, 2));
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeBundle() {
    const doneResult: TaskResult = {
      taskId: 't', selfAssessment: 'DONE', testsPassed: true,
      filesChanged: [], notes: '', linesAdded: 0, linesRemoved: 0,
    };
    return buildEngineRuntime({
      projectRoot: tmpDir,
      config: { deckent_style: 'task' } as never,
      backlogPath: join(tmpDir, 'backlog.json'),
      flows: [],
      policy: { id: 'p', trigger: 'scheduled', action: 'start', guard: { requiresApproval: false } },
      runTask: vi.fn().mockResolvedValue({ taskId: 't' }),
      runSprint: vi.fn().mockResolvedValue({}),
      waitForResult: vi.fn().mockResolvedValue(doneResult),
    });
  }

  it('system + AUTONOMOUS_EXECUTE_ACTION → allowed (reaches policy gate)', () => {
    const { deps: d } = makeBundle();
    const result = d.authority.check(AUTONOMOUS_EXECUTE_ACTION, 'system');
    expect(result.outcome).toBe('allowed');
    expect(result.reason).toMatch(/trusted internal/);
  });

  it('system:engine + AUTONOMOUS_EXECUTE_ACTION → allowed (prefix match)', () => {
    const { deps: d } = makeBundle();
    const result = d.authority.check(AUTONOMOUS_EXECUTE_ACTION, 'system:engine');
    expect(result.outcome).toBe('allowed');
  });

  it('non-system requestedBy + AUTONOMOUS_EXECUTE_ACTION → delegates to base authority (not blindly allowed)', () => {
    const { deps: d } = makeBundle();
    // 'attacker' is not recognized by makeAuthorityChecker → default-deny
    const result = d.authority.check(AUTONOMOUS_EXECUTE_ACTION, 'attacker');
    expect(result.outcome).toBe('denied');
  });

  it('system + unrelated action → delegates to base authority (default-deny preserved)', () => {
    const { deps: d } = makeBundle();
    // 'some.other.action' is not in the trusted-internal path
    // makeAuthorityChecker maps 'system' to role 'brain'; checkAuthority with a generic
    // action (event_emit) should return needs_approval or denied (not allowed here via wrap)
    const result = d.authority.check('some.other.action', 'system');
    // Must NOT be the special trusted-internal allowed response
    expect(result.reason).not.toMatch(/trusted internal/);
  });
});
