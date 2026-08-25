// ═══ KN3 — projection-parity guard: landing-proposal artifacts are not task ids
// Measured (sprint-523 live resume): assertTaskProjectionParity's stray scan
// filtered on `f.startsWith('task-') && f.endsWith('.json')`, which also
// matches `task-<id>.landing-proposal.json` — a settled task's leftover
// landing-proposal artifact. Naive id-slicing then fabricated a phantom
// stray id (`<id>.landing-proposal`) and the guard refused a legitimate
// resume. These pins hold the fix: settled-task residue that the shared
// task-artifact-classifier (src/core/task-artifact-classifier.ts) already
// knows how to name is excluded, while a genuinely foreign task-*.json file
// still refuses (the divergence arm must not be weakened).
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertTaskProjectionParity,
  TaskProjectionParityError,
} from '../../src/orchestra/sprint-spawner.js';
import type { Sprint } from '../../src/core/types.js';

function sprintOf(ids: string[]): Sprint {
  return { id: 'sprint-523', number: 523, tasks: ids.map((id) => ({ id })) } as unknown as Sprint;
}

function seedTasks(root: string, ids: string[]): void {
  const dir = join(root, '.tasks');
  mkdirSync(dir, { recursive: true });
  for (const id of ids) {
    writeFileSync(join(dir, `task-${id}.json`), JSON.stringify({ id, status: 'in_progress' }));
  }
}

function writeArtifact(root: string, filename: string, content: string): void {
  const dir = join(root, '.tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), content);
}

describe('KN3 — projection parity vs. settled-task artifacts (landing-proposal not a task id)', () => {
  it('a settled task\'s landing-proposal.json does not fabricate a stray id — parity passes', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-artifacts-'));
    try {
      seedTasks(root, ['523-002']);
      // 523-001 already settled in an earlier wave; its landing-proposal
      // checkpoint artifact is still on disk from that attempt.
      writeArtifact(
        root,
        'task-523-001.landing-proposal.json',
        JSON.stringify({ version: 1, taskId: '523-001', attemptId: 'a1', sequence: 3 }),
      );
      expect(() => assertTaskProjectionParity(root, sprintOf(['523-002']))).not.toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a mix of settled-task residue (.result, .hb, proposal and delivery sidecars) is fully excluded — parity passes', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-artifacts-'));
    try {
      seedTasks(root, ['523-004']);
      writeArtifact(root, 'task-523-001.landing-proposal.json', JSON.stringify({ taskId: '523-001' }));
      writeArtifact(root, 'task-523-002.result', JSON.stringify({ taskId: '523-002', selfAssessment: 'DONE' }));
      writeArtifact(root, 'task-523-003.hb', JSON.stringify({ taskId: '523-003', status: 'EXECUTING' }));
      writeArtifact(root, 'task-523-003.replan-proposal.json', JSON.stringify({
        taskId: '523-003',
        reason: 'retry-budget-exhausted',
      }));
      writeArtifact(root, 'task-523-001.skill-delivery.json', JSON.stringify({
        schemaVersion: 1,
        taskId: '523-001',
        state: 'not-required',
      }));
      writeArtifact(
        root,
        'task-523-001.attempt-attempt-1.codex.prompt-delivery.json',
        JSON.stringify({ version: 2, taskId: '523-001', source: 'worker-prompt' }),
      );
      expect(() => assertTaskProjectionParity(root, sprintOf(['523-004']))).not.toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a genuinely foreign task-*.json (valid task record, unrelated id) still refuses CLOSED', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-artifacts-'));
    try {
      seedTasks(root, ['523-002']);
      // Not a residue artifact at all — a real, valid, but unplanned task file.
      seedTasks(root, ['523-999']);
      expect(() => assertTaskProjectionParity(root, sprintOf(['523-002'])))
        .toThrowError(TaskProjectionParityError);
      try {
        assertTaskProjectionParity(root, sprintOf(['523-002']));
      } catch (e) {
        expect(String(e)).toMatch(/NOT in this plan: \[523-999\]/u);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('an unplanned task-*.json with corrupt/incomplete content still refuses CLOSED (classifier non-task-artifact does not silently swallow it)', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-artifacts-'));
    try {
      mkdirSync(join(root, '.tasks'), { recursive: true });
      seedTasks(root, ['523-002']);
      // Filename-shaped like a real task file, but content lacks a `status`
      // field — the classifier reports invalid-task-record (not a residue
      // reason), so the divergence arm must still fire on the exact-slice id.
      writeArtifact(root, 'task-523-998.json', JSON.stringify({ id: '523-998' }));
      expect(() => assertTaskProjectionParity(root, sprintOf(['523-002'])))
        .toThrowError(/NOT in this plan: \[523-998\]/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('missingOnDisk arm is unaffected by the classifier routing', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-artifacts-'));
    try {
      seedTasks(root, ['523-002']); // 523-005 planned, never written
      expect(() => assertTaskProjectionParity(root, sprintOf(['523-002', '523-005'])))
        .toThrowError(/MISSING on disk: \[523-005\]/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
