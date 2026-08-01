import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';
import { findActiveWriteCollisions } from '../../src/orchestra/scheduler-effects.js';

function task(id: string, status: TaskStatus, filesWrite: string[]): Task {
  return {
    id,
    title: id,
    description: id,
    model: 'gpt-5.6-terra',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'dispatch safety test',
    scope: { directories: [], filesRead: [], filesWrite },
    dependencies: [],
    goNogo: { goCriteria: 'safe', noGoCriteria: 'collision', techDebtAcceptable: '' },
    status,
  } as Task;
}

describe('continuous dispatch safety', () => {
  it('holds a re-dispatch candidate behind an active exact writer', () => {
    const candidate = task('488-002-fix', TaskStatus.PENDING, ['src/Core.ts']);
    const active = task('488-010', TaskStatus.EXECUTING, ['src/core.ts']);

    expect(findActiveWriteCollisions(candidate, [candidate, active], new Set()))
      .toEqual(['488-010']);
    expect(findActiveWriteCollisions(candidate, [candidate, active], new Set(['488-010'])))
      .toEqual([]);
  });

  it('wires vanished-worker reaping before both initial and watcher collection', () => {
    const source = readFileSync(
      new URL('../../src/orchestra/result-collector.ts', import.meta.url),
      'utf-8',
    );
    const reaper = source.slice(source.indexOf('const reapVanishedWorkers'));
    expect(reaper).toContain("reasonCode: 'BACKEND_WORKER_VANISHED'");
    expect(reaper).toContain("reconcilePendingAttempts({ mode: 'terminal-only' })");
    expect(reaper).toContain('DECKENT_E091:vanished-worker-settlement-pending');
    expect(reaper.match(/await reapVanishedWorkers\(\);/gu)).toHaveLength(2);
  });
});
