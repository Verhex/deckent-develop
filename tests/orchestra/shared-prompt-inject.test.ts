// ─── Sprint 278 COMM-1 / 278-003 ───────────────────────────────────────────
// shared→worker okuma: spawn-time SharedMemory prompt enjeksiyonu.
//
// Verifies that:
//   1. buildSharedContextBlock renders "other workers" notes deterministically.
//   2. buildTaskPrompt appends the Shared Context block at the END of the prompt
//      (most task-specific region) — never splitting the Skills→Agent→ADR prefix.
//   3. When sharedContext is absent/empty the rendered prompt is byte-for-byte
//      identical to the pre-COMM-1 output (opt-in, fail-safe).
//   4. buildWorkerPrompt reads SharedMemory only when worker_comms.enabled &&
//      inject_shared, and excludes the worker's own notes.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildTaskPrompt,
  buildSharedContextBlock,
  type SprintContext,
  type SharedContextEntry,
} from '../../src/orchestra/prompt-god-template.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { SharedMemory } from '../../src/orchestra/shared-memory.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '278-099',
    title: 'Shared context test task',
    description: 'A task used to verify shared-context injection',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: ['src/core/config.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-278',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect Agent\nYou are a system architect.',
    skillPrompts: [
      { name: 'typescript-expert', content: '# TypeScript Expert\nUse strict mode.' },
    ],
    effort: 'high',
    ...overrides,
  };
}

const SHARED_HEADER = '=== Shared Context (other workers) ===';

// ─── buildSharedContextBlock (pure renderer) ────────────────────────────────

describe('buildSharedContextBlock', () => {
  it('returns empty string for undefined or empty entries', () => {
    expect(buildSharedContextBlock(undefined)).toBe('');
    expect(buildSharedContextBlock([])).toBe('');
  });

  it('renders the header and one "- key (by writer): value" line per entry', () => {
    const entries: SharedContextEntry[] = [
      { key: 'api-shape', writerId: '278-001', value: 'use WorkerCommsConfig' },
    ];
    const block = buildSharedContextBlock(entries);
    expect(block).toBe(
      `${SHARED_HEADER}\n- api-shape (by 278-001): use WorkerCommsConfig`,
    );
  });

  it('sorts entries by key deterministically (input order independent)', () => {
    const a: SharedContextEntry[] = [
      { key: 'zeta', writerId: 'w2', value: 'last' },
      { key: 'alpha', writerId: 'w1', value: 'first' },
      { key: 'mid', writerId: 'w3', value: 'middle' },
    ];
    const reversed = [...a].reverse();
    const blockA = buildSharedContextBlock(a);
    const blockB = buildSharedContextBlock(reversed);
    expect(blockA).toBe(blockB);
    // alpha < mid < zeta lexicographic order
    expect(blockA).toBe(
      `${SHARED_HEADER}\n- alpha (by w1): first\n- mid (by w3): middle\n- zeta (by w2): last`,
    );
  });
});

// ─── buildTaskPrompt integration (END placement + opt-in) ───────────────────

describe('buildTaskPrompt — shared context block', () => {
  it('appends the Shared Context block when ctx.sharedContext has entries', () => {
    const { prompt } = buildTaskPrompt(
      makeTask(),
      makeCtx({ sharedContext: [{ key: 'plan', writerId: '278-002', value: 'config-first' }] }),
    );
    expect(prompt).toContain(SHARED_HEADER);
    expect(prompt).toContain('- plan (by 278-002): config-first');
  });

  it('places the Shared Context block at the END (after Skills/Agent/Scope/Task regions)', () => {
    const { prompt } = buildTaskPrompt(
      makeTask(),
      makeCtx({ sharedContext: [{ key: 'plan', writerId: '278-002', value: 'config-first' }] }),
    );
    const sharedIdx = prompt.indexOf(SHARED_HEADER);
    expect(sharedIdx).toBeGreaterThan(-1);
    // Must come after the shared cache-prefix region (Skills/Agent) AND the
    // task-specific structural sections (Your Task / Scope Rules).
    expect(sharedIdx).toBeGreaterThan(prompt.indexOf('=== Skills ==='));
    expect(sharedIdx).toBeGreaterThan(prompt.indexOf('=== Agent:'));
    expect(sharedIdx).toBeGreaterThan(prompt.indexOf('## Your Task'));
    expect(sharedIdx).toBeGreaterThan(prompt.indexOf('## Scope Rules'));
    expect(sharedIdx).toBeGreaterThan(prompt.indexOf('## Karpathy Discipline'));
  });

  it('emits no block (byte-for-byte legacy prompt) when sharedContext is absent', () => {
    const task = makeTask();
    const withField = buildTaskPrompt(task, makeCtx({ sharedContext: undefined })).prompt;
    const withoutField = buildTaskPrompt(task, makeCtx()).prompt;
    expect(withField).not.toContain(SHARED_HEADER);
    expect(withField).toBe(withoutField);
  });

  it('emits no block when sharedContext is an empty array (== no-field baseline)', () => {
    const task = makeTask();
    const empty = buildTaskPrompt(task, makeCtx({ sharedContext: [] })).prompt;
    const baseline = buildTaskPrompt(task, makeCtx()).prompt;
    expect(empty).not.toContain(SHARED_HEADER);
    expect(empty).toBe(baseline);
  });

  it('is deterministic and order-independent for the same entry set', () => {
    const task = makeTask();
    const entries: SharedContextEntry[] = [
      { key: 'b', writerId: 'w2', value: 'two' },
      { key: 'a', writerId: 'w1', value: 'one' },
    ];
    const p1 = buildTaskPrompt(task, makeCtx({ sharedContext: entries })).prompt;
    const p2 = buildTaskPrompt(task, makeCtx({ sharedContext: [...entries].reverse() })).prompt;
    expect(p1).toBe(p2);
    // No ISO-8601 timestamp leaked into the rendered block (determinism guard).
    expect(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p1)).toBe(false);
  });
});

// ─── buildWorkerPrompt wire (config + SharedMemory, hermetic tmpdir) ─────────

describe('buildWorkerPrompt — SharedMemory wire (opt-in)', () => {
  let root: string;

  function setupRoot(workerComms: unknown): string {
    root = mkdtempSync(join(tmpdir(), 'comms-inject-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const cfg = workerComms === undefined ? {} : { worker_comms: workerComms };
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify(cfg), 'utf-8');
    return root;
  }

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('injects shared notes when worker_comms.enabled && inject_shared', () => {
    const r = setupRoot({ enabled: true, inject_shared: true });
    const sm = new SharedMemory(r);
    sm.write('decision', 'auth-gate first', '278-001');

    const prompt = buildWorkerPrompt(makeTask(), undefined, undefined, r);
    expect(prompt).toContain(SHARED_HEADER);
    expect(prompt).toContain('- decision (by 278-001): auth-gate first');
  });

  it('injects nothing when worker_comms is disabled (even with shared entries)', () => {
    const r = setupRoot({ enabled: false });
    const sm = new SharedMemory(r);
    sm.write('decision', 'auth-gate first', '278-001');

    const prompt = buildWorkerPrompt(makeTask(), undefined, undefined, r);
    expect(prompt).not.toContain(SHARED_HEADER);
  });

  it('injects nothing when the worker_comms block is absent', () => {
    const r = setupRoot(undefined);
    const sm = new SharedMemory(r);
    sm.write('decision', 'auth-gate first', '278-001');

    const prompt = buildWorkerPrompt(makeTask(), undefined, undefined, r);
    expect(prompt).not.toContain(SHARED_HEADER);
  });

  it('excludes the worker\'s own notes (only "other workers" appear)', () => {
    const r = setupRoot({ enabled: true });
    const sm = new SharedMemory(r);
    const task = makeTask({ id: '278-099' });
    sm.write('self-note', 'written by me', '278-099');
    sm.write('peer-note', 'written by peer', '278-050');

    const prompt = buildWorkerPrompt(task, undefined, undefined, r);
    expect(prompt).toContain(SHARED_HEADER);
    expect(prompt).toContain('- peer-note (by 278-050): written by peer');
    expect(prompt).not.toContain('self-note');
  });
});
