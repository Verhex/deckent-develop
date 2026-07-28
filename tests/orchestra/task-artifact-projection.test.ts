import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  inspectTaskArtifactsNoClobber,
  publishTaskArtifactsNoClobber,
  TaskArtifactProjectionError,
} from '../../src/orchestra/task-artifact-projection.js';

const roots: string[] = [];

function fixtureRoot(prefix = 'deckent-task-projection-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('task artifact no-clobber projection authority', () => {
  it('publishes missing files durably and treats semantic JSON equality as idempotent', () => {
    const root = fixtureRoot();
    const task = {
      id: '461-001',
      title: 'Exact plan task',
      status: 'PENDING',
      dependencies: [],
    };

    expect(inspectTaskArtifactsNoClobber(root, [task])).toEqual({
      taskIds: ['461-001'],
      idempotent: [],
      missing: ['461-001'],
    });
    expect(publishTaskArtifactsNoClobber(root, [task], 'flow-1:r1')).toEqual({
      taskIds: ['461-001'],
      created: ['461-001'],
      idempotent: [],
    });

    const target = join(root, '.tasks', 'task-461-001.json');
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(task);
    writeFileSync(target, JSON.stringify({
      dependencies: [],
      status: 'PENDING',
      title: 'Exact plan task',
      id: '461-001',
    }), 'utf8');
    expect(publishTaskArtifactsNoClobber(root, [task], 'flow-1:r1-retry')).toEqual({
      taskIds: ['461-001'],
      created: [],
      idempotent: ['461-001'],
    });
  });

  it('preflights every target and creates nothing when any existing payload conflicts', () => {
    const root = fixtureRoot();
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir);
    const conflict = join(tasksDir, 'task-461-002.json');
    writeFileSync(conflict, JSON.stringify({ id: 'another-task' }), 'utf8');
    const tasks = [
      { id: '461-001', status: 'PENDING' },
      { id: '461-002', status: 'PENDING' },
    ];

    expect(() => publishTaskArtifactsNoClobber(root, tasks, 'flow-conflict:r1'))
      .toThrowError(expect.objectContaining<TaskArtifactProjectionError>({
        code: 'TASK_ARTIFACT_CONTENT_CONFLICT',
      }));
    expect(existsSync(join(tasksDir, 'task-461-001.json'))).toBe(false);
    expect(JSON.parse(readFileSync(conflict, 'utf8'))).toEqual({ id: 'another-task' });
  });

  it('rejects portable filename hazards and case-fold collisions before publication', () => {
    const root = fixtureRoot();
    expect(() => publishTaskArtifactsNoClobber(
      root,
      [{ id: '../escape', status: 'PENDING' }],
      'flow-invalid:r1',
    )).toThrowError(expect.objectContaining<TaskArtifactProjectionError>({
      code: 'TASK_ARTIFACT_ID_INVALID',
    }));
    expect(() => publishTaskArtifactsNoClobber(
      root,
      [
        { id: 'Task-A', status: 'PENDING' },
        { id: 'task-a', status: 'PENDING' },
      ],
      'flow-collision:r1',
    )).toThrowError(expect.objectContaining<TaskArtifactProjectionError>({
      code: 'TASK_ARTIFACT_ID_INVALID',
    }));
  });

  it('refuses a symlinked task directory instead of publishing outside the project', () => {
    const root = fixtureRoot();
    const outside = fixtureRoot('deckent-task-projection-outside-');
    symlinkSync(outside, join(root, '.tasks'), 'dir');

    expect(() => publishTaskArtifactsNoClobber(
      root,
      [{ id: '461-001', status: 'PENDING' }],
      'flow-symlink:r1',
    )).toThrowError(expect.objectContaining<TaskArtifactProjectionError>({
      code: 'TASK_ARTIFACT_DIRECTORY_DRIFT',
    }));
    expect(existsSync(join(outside, 'task-461-001.json'))).toBe(false);
  });
});
