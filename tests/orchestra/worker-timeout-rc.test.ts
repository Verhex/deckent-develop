/**
 * Sprint 183 Task W1-3 — Worker Timeout Root Cause forensic + fix
 *
 * Tests three hypotheses behind Sprint 182's "Worker exited without writing
 * result (exitCode=0)" pattern:
 *
 *   H1 — Prompt size: long dep chains balloon the prompt past worker context.
 *   H2 — Heartbeat / .result force-flush: post-write disk persistence verify.
 *   H3 — Large-prompt guard exported from spawn-backend for backend dispatch.
 *
 * The fix surface is intentionally minimal and scope-confined (prompt-god-
 * template.ts + worker.ts + spawn-backend.ts) — the deeper docker on_exit
 * trap bug (exit_code=0 + git diff dolu → still NO_GO) lives in
 * spawn-backend-docker.ts which is out of scope; documented in the
 * sprint-183 audit report instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildTaskPrompt,
  buildDependenciesBlock,
  DEPENDENCY_ENTRY_MAX_CHARS,
} from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import {
  verifyResultPersisted,
  writeResult,
} from '../../src/agents/worker.js';
import {
  LARGE_PROMPT_THRESHOLD_CHARS,
  isLargePrompt,
} from '../../src/orchestra/spawn-backend.js';

// ─── Helpers ───────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '183-003',
    title: 'W1-3 worker timeout RC',
    description: 'forensic test task',
    model: 'opus',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'Sprint 183 W1-3',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/spawn-backend.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-183',
    assignedAgent: 'bug-fixer',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'bug-fixer',
    agentPrompt: '# Bug Fixer\nTest agent prompt.',
    skillPrompts: [],
    allAdrs: [],
    effort: 'high',
    ...overrides,
  };
}

// ─── H1: Prompt size hypothesis ────────────────────────────────────────

describe('Sprint 183 W1-3 — H1: dependency digest size cap', () => {
  let tasksDir: string;

  beforeEach(() => {
    tasksDir = mkdtempSync(join(tmpdir(), 'sprint183-w13-h1-'));
  });

  afterEach(() => {
    rmSync(tasksDir, { recursive: true, force: true });
  });

  it('exports DEPENDENCY_ENTRY_MAX_CHARS at a bounded value (≤4096) so per-dep digest cannot balloon', () => {
    expect(typeof DEPENDENCY_ENTRY_MAX_CHARS).toBe('number');
    expect(DEPENDENCY_ENTRY_MAX_CHARS).toBeGreaterThan(500);
    expect(DEPENDENCY_ENTRY_MAX_CHARS).toBeLessThanOrEqual(4096);
  });

  it('caps each dependency entry total size — long filesChanged + notes do not balloon the prompt', () => {
    const longNotes = 'A'.repeat(5000);
    const longFiles = Array.from({ length: 200 }, (_, i) => `src/very/deep/path/module-${i}.ts`);

    const depIds: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const depId = `182-00${i}`;
      depIds.push(depId);
      writeFileSync(
        join(tasksDir, `task-${depId}.result`),
        JSON.stringify({
          taskId: depId,
          filesChanged: longFiles,
          linesAdded: 1000,
          linesRemoved: 200,
          selfAssessment: 'DONE',
          notes: longNotes,
        }),
        'utf-8',
      );
    }

    // Use buildDependenciesBlock directly so we measure only the dep block —
    // no other prompt sections (Heartbeat, Result File, etc.) bleed into the
    // last entry's end-slice.
    const block = buildDependenciesBlock(depIds, undefined, tasksDir);

    expect(block).toContain('(dependency digest truncated for prompt size)');

    // Split on the header pattern and isolate each entry. `entries.join('\n\n')`
    // means a blank line precedes each entry except the first; trim those
    // separators so we measure the entry alone.
    const headerRe = /^## Dependency 182-/m;
    const segments = block.split(headerRe).filter(s => s.length > 0);
    // The first segment is the "## Dependencies\nThis task depends on…" preamble.
    expect(segments.length).toBe(11);

    for (let i = 1; i < segments.length; i++) {
      // Re-prepend the header (split consumed it) to measure entry length
      // exactly as capDependencyEntry sees it.
      const entry = ('## Dependency 182-' + segments[i]!).replace(/\n+$/, '');
      expect(entry.length).toBeLessThanOrEqual(DEPENDENCY_ENTRY_MAX_CHARS);
    }
  });
});

// ─── H2: Heartbeat / .result force-flush hypothesis ───────────────────

describe('Sprint 183 W1-3 — H2: verifyResultPersisted post-write disk verification', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'sprint183-w13-h2-'));
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns persisted=false + size=0 when .result file is missing', () => {
    const out = verifyResultPersisted(projectRoot, 'missing-task');
    expect(out.persisted).toBe(false);
    expect(out.size).toBe(0);
  });

  it('returns persisted=true + size>0 after writeResult, and the disk content matches', () => {
    // Need a task JSON so writeResult's updateTaskStatus can read it.
    const taskId = '183-003-h2';
    const taskJson = {
      id: taskId,
      title: 'h2 test',
      description: 'd',
      model: 'opus',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'r',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'g', noGoCriteria: 'ng', techDebtAcceptable: 'n' },
      status: 'CLAIMED',
      sprintId: 'sprint-183',
      assignedAgent: 'bug-fixer',
      assignedSkills: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(
      join(projectRoot, '.tasks', `task-${taskId}.json`),
      JSON.stringify(taskJson, null, 2),
      'utf-8',
    );
    // .plan file (writeResult warns if missing — not a failure but cleaner)
    writeFileSync(
      join(projectRoot, '.tasks', `task-${taskId}.plan`),
      JSON.stringify({ taskId, steps: ['test'] }),
      'utf-8',
    );

    writeResult(projectRoot, {
      taskId,
      filesChanged: ['src/foo.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'H2 test write',
    });

    const out = verifyResultPersisted(projectRoot, taskId);
    expect(out.persisted).toBe(true);
    expect(out.size).toBeGreaterThan(0);

    // Cross-check: the file actually contains the result we just wrote.
    const onDisk = readFileSync(
      join(projectRoot, '.tasks', `task-${taskId}.result`),
      'utf-8',
    );
    expect(onDisk).toContain('"taskId": "183-003-h2"');
    expect(onDisk).toContain('"selfAssessment": "DONE"');
  });
});

// ─── H3: spawn-backend large-prompt guard ─────────────────────────────

describe('Sprint 183 W1-3 — H3: large-prompt guard exported from spawn-backend', () => {
  it('exports LARGE_PROMPT_THRESHOLD_CHARS at a sensible value (≥30K, ≤100K)', () => {
    expect(typeof LARGE_PROMPT_THRESHOLD_CHARS).toBe('number');
    expect(LARGE_PROMPT_THRESHOLD_CHARS).toBeGreaterThanOrEqual(30_000);
    expect(LARGE_PROMPT_THRESHOLD_CHARS).toBeLessThanOrEqual(100_000);
  });

  it('isLargePrompt returns true for >threshold prompt and false for small prompt', () => {
    const small = 'a'.repeat(1_000);
    expect(isLargePrompt(small)).toBe(false);

    const huge = 'b'.repeat(LARGE_PROMPT_THRESHOLD_CHARS + 1);
    expect(isLargePrompt(huge)).toBe(true);
  });

  it('isLargePrompt is exact at the threshold — strictly greater than triggers true', () => {
    const atThreshold = 'c'.repeat(LARGE_PROMPT_THRESHOLD_CHARS);
    expect(isLargePrompt(atThreshold)).toBe(false);
  });
});
