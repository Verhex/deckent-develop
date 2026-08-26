import { describe, expect, it } from 'vitest';

import { classifyTaskArtifact, isCanonicalTaskFilename } from '../../src/core/task-artifact-classifier.js';

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
    ['task-486-002.replan-proposal.json', taskContent(), 'replan-proposal'],
    ['task-486-002.skill-delivery.json', taskContent(), 'skill-delivery'],
    [
      'task-486-002.attempt-5207a413-41a4-4af9-9592-5ba1da226906.codex.prompt-delivery.json',
      taskContent(),
      'prompt-delivery',
    ],
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

// sprint-683 canlı-çöküş regresyonu: sidecar dosya adları canonical task-record
// sayılamaz — naive glob bunları id'siz pseudo-task olarak FIX-fazına sokup
// causal-fold sort'unu undefined.localeCompare ile düşürmüştü.
describe('isCanonicalTaskFilename (sprint-683 regression)', () => {
  it('accepts exact canonical task-record filenames', () => {
    expect(isCanonicalTaskFilename('task-683-001.json')).toBe(true);
    expect(isCanonicalTaskFilename('task-xv-1787682688606-bcaa9b15-1d54-4836-8bce-b5a3f76cfe72.json')).toBe(true);
    expect(isCanonicalTaskFilename('task-run-1787551920419-0.json')).toBe(true);
  });

  it('rejects every sidecar artifact filename', () => {
    expect(isCanonicalTaskFilename('task-683-001.landing-proposal.json')).toBe(false);
    expect(isCanonicalTaskFilename('task-683-001.skill-delivery.json')).toBe(false);
    expect(isCanonicalTaskFilename('task-683-001.attempt-54583642.codex.prompt-delivery.json')).toBe(false);
    expect(isCanonicalTaskFilename('task-683-001.replan-proposal.json')).toBe(false);
    expect(isCanonicalTaskFilename('task-683-001.result')).toBe(false);
    expect(isCanonicalTaskFilename('task-683-001.json.supersede-123')).toBe(false);
  });
});
