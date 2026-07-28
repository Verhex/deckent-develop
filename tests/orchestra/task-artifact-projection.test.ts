import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  inspectTaskArtifactsNoClobber,
  inspectStructuredCriteriaProjectionAdoption,
  migrateStructuredCriteriaProjection,
  publishTaskArtifactsNoClobber,
  readTaskArtifactProjectionSet,
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

  it('binds and idempotently migrates only missing structured criteria', () => {
    const root = fixtureRoot();
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir);
    const legacy = {
      id: '461-001',
      sprintId: 'sprint-461',
      createdAt: '2026-07-27T00:00:00.000Z',
      title: 'Exact task',
      goNogo: {
        goCriteria: 'proof passes',
        noGoCriteria: 'proof fails',
        techDebtAcceptable: 'none',
      },
    };
    writeFileSync(
      join(tasksDir, 'task-461-001.json'),
      JSON.stringify(legacy, null, 2),
      'utf8',
    );
    const fresh = {
      ...legacy,
      createdAt: '2026-07-28T00:00:00.000Z',
      goNogo: {
        ...legacy.goNogo,
        items: [{
          id: 'criterion-go-proof',
          polarity: 'go',
          statement: 'proof passes',
          evidenceRequirements: ['proof passes'],
        }],
      },
    };

    const inspected = inspectStructuredCriteriaProjectionAdoption(
      root,
      'sprint-461',
      [fresh],
    );
    expect(inspected.requiresMigration).toEqual(['461-001']);
    expect(inspected.canonicalTasks[0]?.createdAt).toBe(legacy.createdAt);
    expect(inspected.legacyProjectionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(inspected.canonicalProjectionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(inspected.canonicalProjectionDigest).not.toBe(inspected.legacyProjectionDigest);

    expect(migrateStructuredCriteriaProjection(
      root,
      inspected.canonicalTasks,
      inspected.legacyProjectionDigest,
    )).toEqual({ migrated: ['461-001'], idempotent: [] });
    expect(JSON.parse(readFileSync(
      join(tasksDir, 'task-461-001.json'),
      'utf8',
    ))).toEqual(inspected.canonicalTasks[0]);
    expect(migrateStructuredCriteriaProjection(
      root,
      inspected.canonicalTasks,
      inspected.legacyProjectionDigest,
    )).toEqual({ migrated: [], idempotent: ['461-001'] });
    expect(
      readdirSync(tasksDir).filter(name => name.endsWith('.previous')),
    ).toHaveLength(1);
  });

  it('resumes from a durable predecessor without clobbering a recreated target', () => {
    const root = fixtureRoot();
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir);
    const legacy = {
      id: '461-001',
      sprintId: 'sprint-461',
      createdAt: '2026-07-27T00:00:00.000Z',
      title: 'Exact task',
      goNogo: {
        goCriteria: 'proof passes',
        noGoCriteria: 'proof fails',
        techDebtAcceptable: 'none',
      },
    };
    const target = join(tasksDir, 'task-461-001.json');
    writeFileSync(target, JSON.stringify(legacy), 'utf8');
    const fresh = {
      ...legacy,
      goNogo: {
        ...legacy.goNogo,
        items: [{
          id: 'criterion-go-proof',
          polarity: 'go',
          statement: 'proof passes',
          evidenceRequirements: ['proof passes'],
        }],
      },
    };
    const inspected = inspectStructuredCriteriaProjectionAdoption(
      root,
      'sprint-461',
      [fresh],
    );
    const predecessor = join(
      tasksDir,
      '.task-migration-461-001-crash.previous',
    );
    renameSync(target, predecessor);

    expect(migrateStructuredCriteriaProjection(
      root,
      inspected.canonicalTasks,
      inspected.legacyProjectionDigest,
    )).toEqual({ migrated: ['461-001'], idempotent: [] });
    expect(JSON.parse(readFileSync(target, 'utf8')))
      .toEqual(inspected.canonicalTasks[0]);
    expect(JSON.parse(readFileSync(predecessor, 'utf8'))).toEqual(legacy);

    writeFileSync(target, JSON.stringify({
      ...legacy,
      title: 'concurrent writer content',
    }), 'utf8');
    expect(() => migrateStructuredCriteriaProjection(
      root,
      inspected.canonicalTasks,
      inspected.legacyProjectionDigest,
    )).toThrowError(expect.objectContaining<TaskArtifactProjectionError>({
      code: 'TASK_ARTIFACT_CONTENT_CONFLICT',
    }));
    expect(JSON.parse(readFileSync(target, 'utf8')))
      .toMatchObject({ title: 'concurrent writer content' });
    expect(JSON.parse(readFileSync(predecessor, 'utf8'))).toEqual(legacy);
  });

  it('rejects any legacy drift beyond timestamp retention and additive criteria', () => {
    const root = fixtureRoot();
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir);
    writeFileSync(
      join(tasksDir, 'task-461-001.json'),
      JSON.stringify({
        id: '461-001',
        sprintId: 'sprint-461',
        createdAt: '2026-07-27T00:00:00.000Z',
        title: 'tampered title',
        goNogo: {
          goCriteria: 'proof passes',
          noGoCriteria: 'proof fails',
          techDebtAcceptable: 'none',
        },
      }),
      'utf8',
    );

    expect(() => inspectStructuredCriteriaProjectionAdoption(
      root,
      'sprint-461',
      [{
        id: '461-001',
        sprintId: 'sprint-461',
        createdAt: '2026-07-28T00:00:00.000Z',
        title: 'canonical title',
        goNogo: {
          goCriteria: 'proof passes',
          noGoCriteria: 'proof fails',
          techDebtAcceptable: 'none',
          items: [{
            id: 'criterion-go-proof',
            polarity: 'go',
            statement: 'proof passes',
            evidenceRequirements: ['proof passes'],
          }],
        },
      }],
    )).toThrowError(expect.objectContaining<TaskArtifactProjectionError>({
      code: 'TASK_ARTIFACT_CONTENT_CONFLICT',
      details: expect.objectContaining({
        reason: 'unsupported_legacy_projection_drift',
      }),
    }));
    expect(readTaskArtifactProjectionSet(root, ['461-001']).tasks[0])
      .toMatchObject({ title: 'tampered title' });
  });
});
