import { describe, expect, it } from 'vitest';

import { classifyTaskArtifact } from '../../src/core/task-artifact-classifier.js';

function taskContent(id = '486-002'): string {
  return JSON.stringify({ id, status: 'PENDING' });
}

describe('task artifact classifier', () => {
  it('creates identity only from an exact active task filename and matching validated record', () => {
    expect(classifyTaskArtifact('task-486-002.json', taskContent())).toEqual({
      kind: 'task-record',
      taskId: '486-002',
      record: { id: '486-002', status: 'PENDING' },
    });
  });

  it.each([
    ['task-486-002.tmp', taskContent(), 'temporary'],
    ['task-486-002.partial', taskContent(), 'partial'],
    ['task-486-002.result', taskContent(), 'result'],
    ['task-486-002.hb', taskContent(), 'heartbeat'],
    ['task-486-002.landing-proposal.json', taskContent(), 'proposal'],
    ['task-486-002.lock', taskContent(), 'lock'],
    ['task-486-002.json.partial', taskContent(), 'partial'],
    ['task-486-002.json', taskContent(), 'archived', 'archive'],
  ] as const)('keeps %s as typed non-task residue', (filename, content, reason, placement) => {
    expect(classifyTaskArtifact(filename, content, placement)).toEqual({
      kind: 'non-task-artifact',
      reason,
    });
  });

  it.each([
    ['task-486-002.json', '{not-json', 'malformed-content'],
    ['task-486-002.json', JSON.stringify({ id: '486-002' }), 'invalid-task-record'],
    ['task-486-002.json', JSON.stringify({ id: '486-003', status: 'PENDING' }), 'task-id-mismatch'],
    ['task-486-002.json.bak', taskContent(), 'non-task-filename'],
    ['task-.json', taskContent(), 'non-task-filename'],
  ] as const)('rejects malformed or filename-only task identity: %s', (filename, content, reason) => {
    expect(classifyTaskArtifact(filename, content)).toEqual({
      kind: 'non-task-artifact',
      reason,
    });
  });

  it.each([
    ['.tasks/task-486-002.json'],
    ['.tasks\\task-486-002.json'],
  ])('rejects path-like input without relying on host path semantics: %s', filename => {
    expect(classifyTaskArtifact(filename, taskContent())).toEqual({
      kind: 'non-task-artifact',
      reason: 'path-like-filename',
    });
  });
});
