import { describe, expect, it } from 'vitest';

import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import { bindHostBoundWorkerIdentity } from '../../src/orchestra/sprint-spawner.js';
import type { Task } from '../../src/core/task-types.js';

function task(): Task {
  return {
    id: '684-002',
    title: 'host-bound heartbeat identity',
    description: 'regression fixture',
    status: 'PENDING',
    model: 'sonnet',
    scope: { filesRead: [], filesWrite: [] },
  } as Task;
}

describe('worker spawn heartbeat identity binding', () => {
  it('turns an identity-bearing spawn into the canonical heartbeat write', () => {
    const compiled = buildTaskPrompt(task(), { leadingT0Reorder: false }).prompt;

    const prompt = bindHostBoundWorkerIdentity(compiled, {
      taskId: '684-002',
      attemptId: 'attempt-host-674',
      backend: 'subprocess',
    });

    expect(prompt).not.toContain('HEARTBEAT_IDENTITY_HOLD');
    expect(prompt).toContain('"attemptId": "attempt-host-674"');
    expect(prompt).toContain('"backend": "subprocess"');
    expect(prompt).toContain('.tasks/task-684-002.hb');
  });

  it('preserves the typed HOLD when host identity is genuinely unavailable', () => {
    const compiled = buildTaskPrompt(task(), { leadingT0Reorder: false }).prompt;

    const prompt = bindHostBoundWorkerIdentity(compiled, {
      taskId: '684-002',
      backend: 'subprocess',
    });

    expect(prompt).toContain('HEARTBEAT_IDENTITY_HOLD');
    expect(prompt).toContain('attemptId/backend were not host-bound');
  });
});
