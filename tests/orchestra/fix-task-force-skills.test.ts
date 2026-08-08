// ═══ RCPT-2 (GR-2026-08-08-DOGFOOD-RCPT2-01) — no auto→force skill promotion ═
// Measured in cleanroom-5: the fix-task builder promoted the parent's
// AUTO-assigned skills (including the plan-time temp `project-conventions`)
// into forceSkills; the forced-skill guard treats forceSkills as an OPERATOR
// directive and refused fail-closed when the temp skill's SKILL.md was not
// resolvable — burning the FIX budget on both lineages. These pins hold the
// new inheritance rule through the REAL fix-task builder.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../src/orchestra/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyAsync: vi.fn(),
  bootstrapNotifyDispatcher: vi.fn(),
}));

import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';

/** Drive the REAL fix-task builder (inline in handleEvaluation) and read the
 *  fix task it persists to .tasks/. */
function buildFixViaEvaluation(root: string, parent: Task, result: TaskResult): Task {
  mkdirSync(join(root, '.tasks'), { recursive: true });
  // updateTaskStatus inside handleEvaluation reads the parent's task file.
  writeFileSync(join(root, '.tasks', `task-${parent.id}.json`), JSON.stringify(parent, null, 2));
  handleEvaluation(root, parent, TaskEvaluation.NO_GO, result, { allowPriorityFixCreation: true });
  const fixPath = join(root, '.tasks', `task-${parent.id}-fix.json`);
  expect(existsSync(fixPath)).toBe(true);
  return JSON.parse(readFileSync(fixPath, 'utf-8')) as Task;
}

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Add greetLoud',
    description: 'Add greetLoud to src/greet.js',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: ['src/greet.js'], filesWrite: ['src/greet.js'] },
    dependencies: [],
    goNogo: { goCriteria: 'greetLoud exists', noGoCriteria: 'missing', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    type: 'implementation',
    sprintId: 'sprint-001',
    // The parent's skills were AUTO-selected (temp project-conventions) —
    // there is NO operator force here.
    assignedSkills: ['project-conventions'],
    createdAt: new Date().toISOString(),
    ...overrides,
  } as unknown as Task;
}

function noGoResult(taskId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'failed',
  } as unknown as TaskResult;
}

describe('RCPT-2 — fix-task skill inheritance', () => {
  it('auto-assigned parent skills are NOT promoted to forceSkills on the fix task', () => {
    const root = mkdtempSync(join(tmpdir(), 'rcpt2-'));
    try {
      const fix = buildFixViaEvaluation(root, baseTask(), noGoResult('001-001'));
      // Rotation may keep the auto skill ASSIGNED — that is fine…
      expect(fix.assignedSkills ?? []).toContain('project-conventions');
      // …but it must never carry the operator-contract severity.
      expect(fix.forceSkills).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the parent's GENUINE operator forceSkills are inherited with full severity", () => {
    const root = mkdtempSync(join(tmpdir(), 'rcpt2-'));
    try {
      const fix = buildFixViaEvaluation(
        root,
        baseTask({ forceSkills: ['security-hardening'] } as Partial<Task>),
        noGoResult('001-001'),
      );
      expect(fix.forceSkills).toEqual(['security-hardening']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
