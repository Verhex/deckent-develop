// Tests for worker comms instruction block (Sprint 278 COMM-1 / 278-006)
// Verifies: enabled → instruction block present; disabled/absent → no block.

import { describe, it, expect } from 'vitest';
import {
  buildWorkerCommsInstructionBlock,
  buildTaskPrompt,
  type SprintContext,
} from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';

// ─── Minimal task fixture ───────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '278-006',
    title: 'comms-instruction test task',
    description: 'Test task for comms instruction block.',
    model: 'sonnet',
    effort: 'low',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/prompt-god-template.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'block present when enabled',
      noGoCriteria: 'block present when disabled',
      techDebtAcceptable: 'none',
    },
    status: 'EXECUTING',
    sprintId: 'sprint-278',
    createdAt: new Date().toISOString(),
    assignedAgent: 'doc-writer',
    assignedSkills: [],
    provider: 'claude',
    ...overrides,
  };
}

// ─── Unit tests: buildWorkerCommsInstructionBlock ───────────────────────────

describe('buildWorkerCommsInstructionBlock', () => {
  it('returns empty string when enabled is undefined (default-off)', () => {
    expect(buildWorkerCommsInstructionBlock(undefined)).toBe('');
  });

  it('returns empty string when enabled is false', () => {
    expect(buildWorkerCommsInstructionBlock(false)).toBe('');
  });

  it('returns non-empty string when enabled is true', () => {
    const block = buildWorkerCommsInstructionBlock(true);
    expect(block).toBeTruthy();
  });

  it('contains sharedNotes instruction when enabled', () => {
    const block = buildWorkerCommsInstructionBlock(true);
    expect(block).toContain('sharedNotes');
  });

  it('contains handoffNotes instruction when enabled', () => {
    const block = buildWorkerCommsInstructionBlock(true);
    expect(block).toContain('handoffNotes');
  });

  it('starts with the expected header when enabled', () => {
    const block = buildWorkerCommsInstructionBlock(true);
    expect(block).toContain('Worker Communications');
  });
});

// ─── Integration tests: buildTaskPrompt with workerCommsEnabled ─────────────

describe('buildTaskPrompt — worker comms instruction', () => {
  const baseCtx: SprintContext = {
    agentId: 'doc-writer',
  };

  it('does NOT include Worker Communications block when workerCommsEnabled is absent', () => {
    const { prompt } = buildTaskPrompt(makeTask(), { ...baseCtx });
    expect(prompt).not.toContain('Worker Communications');
  });

  it('does NOT include Worker Communications block when workerCommsEnabled is false', () => {
    const { prompt } = buildTaskPrompt(makeTask(), { ...baseCtx, workerCommsEnabled: false });
    expect(prompt).not.toContain('Worker Communications');
  });

  it('includes Worker Communications block when workerCommsEnabled is true', () => {
    const { prompt } = buildTaskPrompt(makeTask(), { ...baseCtx, workerCommsEnabled: true });
    expect(prompt).toContain('Worker Communications');
  });

  it('includes sharedNotes and handoffNotes in the prompt when workerCommsEnabled is true', () => {
    const { prompt } = buildTaskPrompt(makeTask(), { ...baseCtx, workerCommsEnabled: true });
    expect(prompt).toContain('sharedNotes');
    expect(prompt).toContain('handoffNotes');
  });

  it('places Worker Communications block AFTER the Karpathy section (END region)', () => {
    const { prompt } = buildTaskPrompt(makeTask(), { ...baseCtx, workerCommsEnabled: true });
    const karpathyIdx = prompt.indexOf('Karpathy Discipline');
    const commsIdx = prompt.indexOf('Worker Communications');
    expect(karpathyIdx).toBeGreaterThan(-1);
    expect(commsIdx).toBeGreaterThan(-1);
    expect(commsIdx).toBeGreaterThan(karpathyIdx);
  });

  it('comms block is at the very end when no shared/handoff blocks are present', () => {
    const { prompt } = buildTaskPrompt(makeTask(), { ...baseCtx, workerCommsEnabled: true });
    const commsIdx = prompt.indexOf('Worker Communications');
    // No content should follow the comms block
    const afterComms = prompt.slice(commsIdx);
    expect(afterComms).toContain('sharedNotes');
    // sharedNotes should appear in the comms block area
    const sharedContextIdx = prompt.indexOf('Shared Context (other workers)');
    expect(sharedContextIdx).toBe(-1); // no shared context injected
  });
});
