// Sprint 161 T-002 — Checkpoint Loop Runtime Wire tests
// Covers computeEventStreamOffset, writeCheckpoint completedTasks/pendingTasks
// invariants, atomic rename, and writePhaseCheckpoint internal offset compute.

import { describe, it, expect } from 'vitest';
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeCheckpoint,
  readCheckpoint,
  writePhaseCheckpoint,
  computeEventStreamOffset,
} from '../../src/orchestra/sprint-checkpoint.js';
import { waitForHumanApproval, resetInterruptState } from '../../src/orchestra/sprint-lifecycle.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task } from '../../src/core/types.js';

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `deckent-test-checkpoint-loop-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent', 'recently-works'), { recursive: true });
  return dir;
}

function makeTask(id: string, status: TaskStatus = TaskStatus.PENDING): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status,
  };
}

function makeSprint(
  id: string,
  tasks: Task[],
  phase: SprintPhase = SprintPhase.EXECUTE,
): Sprint {
  return {
    id,
    number: parseInt(id.replace(/\D/g, ''), 10) || 161,
    status: SprintStatus.ACTIVE,
    phase,
    tasks,
    workers: [],
  };
}

function writeEventsJsonl(
  root: string,
  sprintId: string,
  sequences: number[],
): void {
  const path = join(root, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
  const lines = sequences
    .map((s) =>
      JSON.stringify({
        timestamp: '2026-05-12T00:00:00.000Z',
        sequence: s,
        protocol_version: '1.0',
        source: 'WORKER',
        target: 'BRAIN',
        channel: 'WORKER→BRAIN:TEST',
        payload: {},
      }),
    )
    .join('\n');
  writeFileSync(path, lines + (lines.length ? '\n' : ''), 'utf-8');
}

describe('Sprint 161 T-002 — Checkpoint Loop Runtime Wire', () => {
  it('1. computeEventStreamOffset returns max sequence from events.jsonl', () => {
    const root = makeTempDir();
    try {
      writeEventsJsonl(root, 'sprint-161', [1, 2, 3]);
      const offset = computeEventStreamOffset(root, 'sprint-161');
      expect(offset).toBe(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('2. writeCheckpoint partitions tasks into completed/pending/active disjoint sets', () => {
    const root = makeTempDir();
    try {
      const sprint = makeSprint('sprint-161', [
        makeTask('161-001', TaskStatus.DONE),
        makeTask('161-002', TaskStatus.NO_GO),
        makeTask('161-003', TaskStatus.PENDING),
        makeTask('161-004', TaskStatus.EXECUTING),
        makeTask('161-005', TaskStatus.CLAIMED),
      ]);
      const cp = writeCheckpoint(root, sprint, 7);
      expect(cp).not.toBeNull();
      // Terminal states → completedTasks
      expect(cp!.completedTasks.sort()).toEqual(['161-001', '161-002']);
      // Never-started → pendingTasks
      expect(cp!.pendingTasks.sort()).toEqual(['161-003']);
      // In-flight → activeWorkers (disjoint from pendingTasks)
      expect(cp!.activeWorkers.map(w => w.taskId).sort()).toEqual(['161-004', '161-005']);
      expect(cp!.eventStreamOffset).toBe(7);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('3. writePhaseCheckpoint increments checkpointNumber on subsequent calls', () => {
    const root = makeTempDir();
    try {
      const sprint = makeSprint('sprint-161', [makeTask('161-001', TaskStatus.DONE)]);
      writeEventsJsonl(root, 'sprint-161', [1]);

      const first = writePhaseCheckpoint(root, sprint, SprintPhase.PLAN);
      const second = writePhaseCheckpoint(root, sprint, SprintPhase.SPAWN);
      const third = writePhaseCheckpoint(root, sprint, SprintPhase.EXECUTE);

      expect(first!.checkpointNumber).toBe(1);
      expect(second!.checkpointNumber).toBe(2);
      expect(third!.checkpointNumber).toBe(3);

      const read = readCheckpoint(root, 'sprint-161');
      expect(read!.checkpointNumber).toBe(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('4. writePhaseCheckpoint reflects brainPhase parameter (not sprint.phase) on disk', () => {
    const root = makeTempDir();
    try {
      const sprint = makeSprint('sprint-161', [makeTask('161-001', TaskStatus.DONE)], SprintPhase.EXECUTE);
      writeEventsJsonl(root, 'sprint-161', [1]);

      // Caller explicitly transitions phase via the parameter while sprint.phase still EXECUTE
      const cp = writePhaseCheckpoint(root, sprint, SprintPhase.EVALUATE);
      expect(cp!.brainPhase).toBe(SprintPhase.EVALUATE);

      // Caller's sprint object phase must be restored
      expect(sprint.phase).toBe(SprintPhase.EXECUTE);

      const read = readCheckpoint(root, 'sprint-161');
      expect(read!.brainPhase).toBe(SprintPhase.EVALUATE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('5. Atomic rename leaves no .tmp leftover after a successful write', () => {
    const root = makeTempDir();
    try {
      const sprint = makeSprint('sprint-161', [makeTask('161-001', TaskStatus.DONE)]);
      writeCheckpoint(root, sprint, 1);

      const deckentDir = join(root, '.deckent');
      const leftover = readdirSync(deckentDir).filter((f) => f.endsWith('.tmp'));
      expect(leftover).toEqual([]);

      // And the real checkpoint exists + parses
      const realPath = join(deckentDir, 'sprint-161-checkpoint.json');
      expect(existsSync(realPath)).toBe(true);
      const raw = readFileSync(realPath, 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('6. computeEventStreamOffset returns 0 when events.jsonl is missing', () => {
    const root = makeTempDir();
    try {
      const offset = computeEventStreamOffset(root, 'sprint-161');
      expect(offset).toBe(0);

      // And writePhaseCheckpoint without prior offset still works
      const sprint = makeSprint('sprint-161', [makeTask('161-001', TaskStatus.PENDING)]);
      const cp = writePhaseCheckpoint(root, sprint, SprintPhase.PLAN);
      expect(cp!.eventStreamOffset).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('7. computeEventStreamOffset returns 0 when events.jsonl is empty', () => {
    const root = makeTempDir();
    try {
      const path = join(root, '.deckent', 'recently-works', 'sprint-161-events.jsonl');
      writeFileSync(path, '', 'utf-8');
      expect(computeEventStreamOffset(root, 'sprint-161')).toBe(0);

      // Whitespace-only also yields 0
      writeFileSync(path, '\n\n   \n', 'utf-8');
      expect(computeEventStreamOffset(root, 'sprint-161')).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// 589-003 — the `waitForHumanApproval` checkpoint-notify texts (pending,
// escalation, timeout) used to be hardcoded Turkish literals. They now
// resolve through getMessage()'s `checkpoint.notify_*` key family (en+tr),
// with `lang` found via the existing detectLang() resolution. These tests
// pin the key contract directly (both langs, correct var interpolation)
// and confirm no bare literal Turkish text leaks through when lang='en'.
describe('589-003 — checkpoint notify texts route through getMessage (checkpoint.notify_*)', () => {
  it('checkpoint.notify_pending_title interpolates {phase} in en and tr', () => {
    expect(getMessage('checkpoint.notify_pending_title', 'en', { phase: 'plan' }))
      .toBe('Approval pending: plan');
    expect(getMessage('checkpoint.notify_pending_title', 'tr', { phase: 'plan' }))
      .toBe('Onay bekleniyor: plan');
  });

  it('checkpoint.notify_escalation_title/summary interpolate {phase}/{summary}/{elapsedMinutes} in en and tr', () => {
    expect(getMessage('checkpoint.notify_escalation_title', 'en', { phase: 'evaluate' }))
      .toBe('[Reminder] Approval still pending: evaluate');
    expect(getMessage('checkpoint.notify_escalation_title', 'tr', { phase: 'evaluate' }))
      .toBe('[Hatırlatma] Onay hâlâ bekleniyor: evaluate');

    expect(getMessage('checkpoint.notify_escalation_summary', 'en', {
      summary: 'Ready for review',
      elapsedMinutes: '30',
    })).toBe('Ready for review — pending approval for 30 minute(s).');
    expect(getMessage('checkpoint.notify_escalation_summary', 'tr', {
      summary: 'Ready for review',
      elapsedMinutes: '30',
    })).toBe('Ready for review — 30 dakikadır onay bekliyor.');
  });

  it('checkpoint.notify_timeout_title/summary interpolate {phase}/{summary}/{timeoutMinutes} in en and tr', () => {
    expect(getMessage('checkpoint.notify_timeout_title', 'en', { phase: 'fix' }))
      .toBe('[TIMEOUT] Approval not received: fix');
    expect(getMessage('checkpoint.notify_timeout_title', 'tr', { phase: 'fix' }))
      .toBe('[TIMEOUT] Onay alınamadı: fix');

    expect(getMessage('checkpoint.notify_timeout_summary', 'en', {
      summary: 'Ready for review',
      timeoutMinutes: '240',
    })).toBe('Ready for review — no approval/rejection within 240 minutes; the run is being parked (ABORTED).');
    expect(getMessage('checkpoint.notify_timeout_summary', 'tr', {
      summary: 'Ready for review',
      timeoutMinutes: '240',
    })).toBe('Ready for review — 240 dakika içinde onay/red gelmedi, sprint parklanıyor (ABORTED).');
  });

  it('en lang never leaks the Turkish literal (guards against a re-introduced hardcode)', () => {
    const enPending = getMessage('checkpoint.notify_pending_title', 'en', { phase: 'plan' });
    const enEscalationTitle = getMessage('checkpoint.notify_escalation_title', 'en', { phase: 'plan' });
    const enTimeoutTitle = getMessage('checkpoint.notify_timeout_title', 'en', { phase: 'plan' });
    for (const text of [enPending, enEscalationTitle, enTimeoutTitle]) {
      expect(text).not.toMatch(/Onay|Hatırlatma|dakika/);
    }
  });

  it('waitForHumanApproval still resolves false on bounded timeout after the getMessage migration (regression smoke)', async () => {
    resetInterruptState();
    const root = mkdirTempForApproval();
    try {
      const result = await waitForHumanApproval(
        root,
        'sprint-589',
        'plan',
        'Regression smoke summary',
        { timeoutMs: 60, pollIntervalMs: 15, escalationIntervalMs: 10_000 },
      );
      expect(result).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function mkdirTempForApproval(): string {
  const dir = join(
    tmpdir(),
    `deckent-test-checkpoint-notify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}
