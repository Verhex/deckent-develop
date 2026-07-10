/**
 * born-593 DNA-FILTER-STAT-CREDIT (kök-neden-4c).
 *
 * buildWorkerPrompt (task-builder.ts) silently drops DNA-irrelevant skills from
 * the worker prompt via filterSkillPromptsByDNA — but that drop was invisible
 * to sprint-finalizer.ts, which credits usage/success stats for every id still
 * in task.assignedSkills unconditionally. A dropped skill kept earning credit
 * for a prompt it never actually reached, poisoning the routing learning loop.
 *
 * Fix lives entirely in result-collector.ts:resolveSkillPrompts — the single
 * choke point every spawn path routes through before buildWorkerPrompt runs.
 * It now mirrors buildWorkerPrompt's own DNA-filter gate, and for any skill
 * that would be dropped: (a) removes it from task.assignedSkills (excluding it
 * from the finalizer's stat-credit chain, without touching the finalizer), and
 * (b) surfaces the drop via debugLog + a `skill.dna_filtered` metric.
 *
 * Hermetic: tmpdir projectRoot with real `.deckent/skills/<id>/SKILL.md`
 * fixtures; only `../../src/core/observability.js` is mocked (to spy on
 * `metric`) — resolveSkillPrompts and the real filterSkillPromptsByDNA under
 * test are not mocked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../src/core/observability.js', () => ({
  metric: vi.fn(),
}));

import { metric } from '../../src/core/observability.js';
import { resolveSkillPrompts } from '../../src/orchestra/result-collector.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';
import type { TaskDNA } from '../../src/core/routing-types.js';

// ─── Helpers ────────────────────────────────────────────────────────

let projectRoot: string;

function writeSkill(id: string, content: string): void {
  const dir = join(projectRoot, '.deckent', 'skills', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
}

/** DNA whose primary intent is 'documentation' (affinity: documentation, docs, writer, readme, guide, markdown). */
function makeDocDNA(): TaskDNA {
  return {
    intent: { primary: 'documentation', secondary: [], confidence: 0.9 },
    tags: [],
    domains: [],
    operations: [{ type: 'modify', weight: 1 }],
    complexity: { fileCount: 1, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
    scope: { writeRatio: {}, primaryWriteTarget: 'docs/', testWriteRatio: 0 },
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-dna-1',
    title: 'DNA filter task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['docs/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-dna',
    createdAt: '2026-07-10T00:00:00.000Z',
    assignedAgent: 'generic',
    assignedSkills: [],
    ...overrides,
  } as Task;
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'deckent-dna-filter-'));
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('resolveSkillPrompts — DNA-filter stat credit (born-593)', () => {
  it('excludes a DNA-filtered skill from assignedSkills credit and emits skill.dna_filtered', async () => {
    writeSkill('documentation-writer', 'A skill for writing documentation and guides.');
    writeSkill('typescript-expert', 'A skill for strict-mode generics and module design.');

    const task = makeTask({
      assignedSkills: ['documentation-writer', 'typescript-expert'],
      routingMeta: { routingVersion: 'v2', taskDNA: makeDocDNA() },
    });

    const results = await resolveSkillPrompts(projectRoot, task);

    // (a) credit chain: the DNA-irrelevant skill is removed from assignedSkills.
    expect(task.assignedSkills).toEqual(['documentation-writer']);

    // buildWorkerPrompt's own filtering decides prompt content — resolveSkillPrompts
    // still returns the FULL resolved list unchanged (DNA-filter semantics preserved).
    expect(results.map(r => r.name).sort()).toEqual(['documentation-writer', 'typescript-expert']);

    // (b) visibility: metric fires for the dropped skill only.
    expect(metric).toHaveBeenCalledWith('skill.dna_filtered', 1, {
      skillId: 'typescript-expert',
      taskId: 'task-dna-1',
    });
    expect(metric).not.toHaveBeenCalledWith('skill.dna_filtered', 1, expect.objectContaining({ skillId: 'documentation-writer' }));
  });

  it('leaves a DNA-relevant skill\'s credit untouched and does not emit skill.dna_filtered for it', async () => {
    writeSkill('documentation-writer', 'A skill for writing documentation and guides.');
    writeSkill('doc-readme-helper', 'A guide and readme helper for markdown docs.');

    const task = makeTask({
      assignedSkills: ['documentation-writer', 'doc-readme-helper'],
      routingMeta: { routingVersion: 'v2', taskDNA: makeDocDNA() },
    });

    await resolveSkillPrompts(projectRoot, task);

    // Both skills pass the DNA filter for a documentation-intent task — credit unchanged.
    expect(task.assignedSkills).toEqual(['documentation-writer', 'doc-readme-helper']);
    expect(metric).not.toHaveBeenCalledWith('skill.dna_filtered', expect.anything(), expect.anything());
  });

  it('does not filter when routing is not v2 (matches buildWorkerPrompt bypass)', async () => {
    writeSkill('documentation-writer', 'A skill for writing documentation and guides.');
    writeSkill('typescript-expert', 'A skill for strict-mode generics and module design.');

    const task = makeTask({
      assignedSkills: ['documentation-writer', 'typescript-expert'],
      routingMeta: { taskDNA: makeDocDNA() },
    });

    await resolveSkillPrompts(projectRoot, task);

    expect(task.assignedSkills).toEqual(['documentation-writer', 'typescript-expert']);
    expect(metric).not.toHaveBeenCalledWith('skill.dna_filtered', expect.anything(), expect.anything());
  });

  it('does not filter a single-skill task (matches buildWorkerPrompt\'s length>1 gate)', async () => {
    writeSkill('typescript-expert', 'A skill for strict-mode generics and module design.');

    const task = makeTask({
      assignedSkills: ['typescript-expert'],
      routingMeta: { routingVersion: 'v2', taskDNA: makeDocDNA() },
    });

    await resolveSkillPrompts(projectRoot, task);

    expect(task.assignedSkills).toEqual(['typescript-expert']);
    expect(metric).not.toHaveBeenCalledWith('skill.dna_filtered', expect.anything(), expect.anything());
  });
});
