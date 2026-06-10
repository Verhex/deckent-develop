// ─── Sprint 278 COMM-1 / 278-004 ───────────────────────────────────────────
// handoff→downstream worker prompt injection.
//
// Verifies that:
//   1. buildHandoffBlock renders executed-handoff context (artifacts + notes).
//   2. buildTaskPrompt appends the Upstream Handoffs block at the END of the
//      prompt (most task-specific region) — never splitting the Skills→Agent→ADR
//      cache prefix.
//   3. When upstreamHandoffs is absent/empty the rendered prompt is byte-for-byte
//      identical to the pre-COMM-1 output (opt-in, fail-safe).
//   4. buildWorkerPrompt reads handoffs only when worker_comms.enabled &&
//      inject_handoffs, and only for executed (`ready`) handoffs addressed to it.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildTaskPrompt,
  buildHandoffBlock,
  type SprintContext,
  type UpstreamHandoffEntry,
} from '../../src/orchestra/prompt-god-template.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { HandoffProtocol } from '../../src/orchestra/handoff-protocol.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '278-099',
    title: 'Handoff inject test task',
    description: 'A task used to verify upstream-handoff injection',
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

const HANDOFF_HEADER = '=== Upstream Handoffs ===';

/**
 * Create an EXECUTED (`ready`) handoff from `from` → `to` in the given root.
 * Artifacts are materialised on disk so executeHandoff flips status to 'ready'.
 */
function createReadyHandoff(
  root: string,
  from: string,
  to: string,
  artifacts: string[],
  notes?: string,
): void {
  const protocol = new HandoffProtocol(root);
  for (const a of artifacts) {
    const full = join(root, a);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, '// artifact', 'utf-8');
  }
  const h = protocol.createHandoff(from, to, artifacts, notes);
  const res = protocol.executeHandoff(h.id);
  if (!res.success) throw new Error(`handoff did not become ready: ${res.missingArtifacts.join(',')}`);
}

// ─── buildHandoffBlock (pure renderer) ──────────────────────────────────────

describe('buildHandoffBlock', () => {
  it('returns empty string for undefined or empty entries', () => {
    expect(buildHandoffBlock(undefined)).toBe('');
    expect(buildHandoffBlock([])).toBe('');
  });

  it('renders the header and one "- from … : artifacts [...], note: …" line per entry', () => {
    const entries: UpstreamHandoffEntry[] = [
      { fromTaskId: '278-001', artifacts: ['src/a.ts', 'src/b.ts'], notes: 'use the new API' },
    ];
    const block = buildHandoffBlock(entries);
    expect(block).toBe(
      `${HANDOFF_HEADER}\n- from 278-001: artifacts [src/a.ts, src/b.ts], note: use the new API`,
    );
  });

  it('omits the note segment when the handoff has no notes', () => {
    const entries: UpstreamHandoffEntry[] = [
      { fromTaskId: '278-001', artifacts: ['src/a.ts'] },
    ];
    const block = buildHandoffBlock(entries);
    expect(block).toBe(`${HANDOFF_HEADER}\n- from 278-001: artifacts [src/a.ts]`);
    expect(block).not.toContain('note:');
  });

  it('renders multiple upstream handoffs in the given (caller-sorted) order', () => {
    const entries: UpstreamHandoffEntry[] = [
      { fromTaskId: '278-001', artifacts: ['src/a.ts'], notes: 'first' },
      { fromTaskId: '278-002', artifacts: ['src/b.ts', 'src/c.ts'] },
    ];
    const block = buildHandoffBlock(entries);
    expect(block).toBe(
      `${HANDOFF_HEADER}\n` +
      `- from 278-001: artifacts [src/a.ts], note: first\n` +
      `- from 278-002: artifacts [src/b.ts, src/c.ts]`,
    );
  });
});

// ─── buildTaskPrompt integration (END placement + opt-in) ───────────────────

describe('buildTaskPrompt — upstream handoff block', () => {
  it('appends the Upstream Handoffs block when ctx.upstreamHandoffs has entries', () => {
    const { prompt } = buildTaskPrompt(
      makeTask(),
      makeCtx({ upstreamHandoffs: [{ fromTaskId: '278-002', artifacts: ['src/x.ts'], notes: 'ready' }] }),
    );
    expect(prompt).toContain(HANDOFF_HEADER);
    expect(prompt).toContain('- from 278-002: artifacts [src/x.ts], note: ready');
  });

  it('places the Upstream Handoffs block at the END (after Skills/Agent/Scope/Task regions)', () => {
    const { prompt } = buildTaskPrompt(
      makeTask(),
      makeCtx({ upstreamHandoffs: [{ fromTaskId: '278-002', artifacts: ['src/x.ts'] }] }),
    );
    const handoffIdx = prompt.indexOf(HANDOFF_HEADER);
    expect(handoffIdx).toBeGreaterThan(-1);
    // Must come after the shared cache-prefix region (Skills/Agent) AND the
    // task-specific structural sections (Your Task / Scope Rules / Karpathy).
    expect(handoffIdx).toBeGreaterThan(prompt.indexOf('=== Skills ==='));
    expect(handoffIdx).toBeGreaterThan(prompt.indexOf('=== Agent:'));
    expect(handoffIdx).toBeGreaterThan(prompt.indexOf('## Your Task'));
    expect(handoffIdx).toBeGreaterThan(prompt.indexOf('## Scope Rules'));
    expect(handoffIdx).toBeGreaterThan(prompt.indexOf('## Karpathy Discipline'));
  });

  it('emits no block (byte-for-byte legacy prompt) when upstreamHandoffs is absent', () => {
    const task = makeTask();
    const withField = buildTaskPrompt(task, makeCtx({ upstreamHandoffs: undefined })).prompt;
    const withoutField = buildTaskPrompt(task, makeCtx()).prompt;
    expect(withField).not.toContain(HANDOFF_HEADER);
    expect(withField).toBe(withoutField);
  });

  it('emits no block when upstreamHandoffs is an empty array (== no-field baseline)', () => {
    const task = makeTask();
    const empty = buildTaskPrompt(task, makeCtx({ upstreamHandoffs: [] })).prompt;
    const baseline = buildTaskPrompt(task, makeCtx()).prompt;
    expect(empty).not.toContain(HANDOFF_HEADER);
    expect(empty).toBe(baseline);
  });

  it('coexists with the Shared Context block (both in the END region, no timestamp leak)', () => {
    const task = makeTask();
    const { prompt } = buildTaskPrompt(task, makeCtx({
      sharedContext: [{ key: 'plan', writerId: '278-002', value: 'config-first' }],
      upstreamHandoffs: [{ fromTaskId: '278-002', artifacts: ['src/x.ts'], notes: 'done' }],
    }));
    expect(prompt).toContain('=== Shared Context (other workers) ===');
    expect(prompt).toContain(HANDOFF_HEADER);
    expect(prompt.indexOf(HANDOFF_HEADER)).toBeGreaterThan(prompt.indexOf('## Karpathy Discipline'));
    // determinism guard: no ISO-8601 timestamp leaked into the rendered prompt.
    expect(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(prompt)).toBe(false);
  });
});

// ─── buildWorkerPrompt wire (config + HandoffProtocol, hermetic tmpdir) ──────

describe('buildWorkerPrompt — upstream handoff wire (opt-in)', () => {
  let root: string;

  function setupRoot(workerComms: unknown): string {
    root = mkdtempSync(join(tmpdir(), 'handoff-inject-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const cfg = workerComms === undefined ? {} : { worker_comms: workerComms };
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify(cfg), 'utf-8');
    return root;
  }

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('injects an executed handoff when worker_comms.enabled && inject_handoffs', () => {
    const r = setupRoot({ enabled: true, inject_handoffs: true });
    createReadyHandoff(r, '278-001', '278-099', ['src/core/config.ts'], 'extend WorkerCommsConfig');

    const prompt = buildWorkerPrompt(makeTask({ id: '278-099' }), undefined, undefined, r);
    expect(prompt).toContain(HANDOFF_HEADER);
    expect(prompt).toContain('- from 278-001: artifacts [src/core/config.ts], note: extend WorkerCommsConfig');
  });

  it('injects handoffs by default when enabled (inject_handoffs omitted)', () => {
    const r = setupRoot({ enabled: true });
    createReadyHandoff(r, '278-001', '278-099', ['src/core/config.ts']);

    const prompt = buildWorkerPrompt(makeTask({ id: '278-099' }), undefined, undefined, r);
    expect(prompt).toContain(HANDOFF_HEADER);
    expect(prompt).toContain('- from 278-001: artifacts [src/core/config.ts]');
  });

  it('injects nothing when worker_comms is disabled (even with a ready handoff)', () => {
    const r = setupRoot({ enabled: false });
    createReadyHandoff(r, '278-001', '278-099', ['src/core/config.ts'], 'note');

    const prompt = buildWorkerPrompt(makeTask({ id: '278-099' }), undefined, undefined, r);
    expect(prompt).not.toContain(HANDOFF_HEADER);
  });

  it('injects nothing when inject_handoffs is explicitly false', () => {
    const r = setupRoot({ enabled: true, inject_handoffs: false });
    createReadyHandoff(r, '278-001', '278-099', ['src/core/config.ts'], 'note');

    const prompt = buildWorkerPrompt(makeTask({ id: '278-099' }), undefined, undefined, r);
    expect(prompt).not.toContain(HANDOFF_HEADER);
  });

  it('injects nothing when there is no handoff targeting this task', () => {
    const r = setupRoot({ enabled: true });
    const prompt = buildWorkerPrompt(makeTask({ id: '278-099' }), undefined, undefined, r);
    expect(prompt).not.toContain(HANDOFF_HEADER);
  });

  it('skips a pending (not executed) handoff — only ready handoffs are injected', () => {
    const r = setupRoot({ enabled: true });
    // createHandoff WITHOUT executeHandoff → status stays 'pending'.
    new HandoffProtocol(r).createHandoff('278-001', '278-099', ['src/core/config.ts'], 'pending note');

    const prompt = buildWorkerPrompt(makeTask({ id: '278-099' }), undefined, undefined, r);
    expect(prompt).not.toContain(HANDOFF_HEADER);
  });

  it('renders multiple upstream handoffs targeting this task (deterministic id order)', () => {
    const r = setupRoot({ enabled: true });
    createReadyHandoff(r, '278-001', '278-099', ['src/core/a.ts'], 'first');
    createReadyHandoff(r, '278-002', '278-099', ['src/core/b.ts'], 'second');
    // a handoff to a DIFFERENT task must not leak in.
    createReadyHandoff(r, '278-003', '278-050', ['src/core/c.ts'], 'other');

    const prompt = buildWorkerPrompt(makeTask({ id: '278-099' }), undefined, undefined, r);
    expect(prompt).toContain('- from 278-001: artifacts [src/core/a.ts], note: first');
    expect(prompt).toContain('- from 278-002: artifacts [src/core/b.ts], note: second');
    expect(prompt).not.toContain('278-050');
    expect(prompt).not.toContain('src/core/c.ts');
    // id-sorted (278-001-to-278-099 < 278-002-to-278-099): from 278-001 precedes from 278-002.
    expect(prompt.indexOf('from 278-001')).toBeLessThan(prompt.indexOf('from 278-002'));
  });
});
