// ─── Worker Prompt Quality Invariants ────────────────────────────────────────
// Drives the prompt-pipeline remediation (token-dedup + sprint-correctness +
// multi-provider parity). Each test pins one invariant of the assembled worker
// prompt produced by buildWorkerPrompt — the single artifact written to the
// .prompt file and consumed identically by tmux / subprocess / docker backends
// across all providers.
//
// Hermetic: pure-function over buildWorkerPrompt; no spawn, no network. Runs
// from the real repo root so the live agent/skill content is exercised.

import { describe, it, expect } from 'vitest';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';

const GC_MARKER = 'GOCRITERIA_SENTINEL_42';
const NOGO_MARKER = 'NOGOCRITERIA_SENTINEL_43';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '900-001',
    title: 'Fix null deref in evaluate phase',
    description: 'Add a null guard and a regression test.',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'HIGH',
    reason: 'crash on null result',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/sprint-controller.ts'] },
    dependencies: [],
    goNogo: { goCriteria: GC_MARKER, noGoCriteria: NOGO_MARKER, techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-900',
    createdAt: new Date().toISOString(),
    assignedAgent: 'bug-fixer',
    assignedSkills: ['typescript-expert'],
    provider: 'claude',
    ...overrides,
  };
}

const AGENT = 'AGENT_PROMPT_BODY';
const SKILLS = [{ name: 'typescript-expert', content: 'SKILL_BODY_MARKER' }];

describe('worker prompt quality invariants', () => {
  // ── A: sprint-correctness — goCriteria reaches the worker ──────────────
  it('renders the task goCriteria value into the prompt (A)', () => {
    const prompt = buildWorkerPrompt(makeTask(), AGENT, SKILLS);
    expect(prompt).toContain(GC_MARKER);
  });

  // ── B: no dangling empty "=== Task ===" header ─────────────────────────
  it('emits no empty "=== Task ===" header; the real header is "## Your Task" (B)', () => {
    const prompt = buildWorkerPrompt(makeTask(), AGENT, SKILLS);
    expect(prompt).not.toContain('=== Task ===');
    expect((prompt.match(/## Your Task/g) || []).length).toBe(1);
  });

  // ── C: dead Claude-only prompt-cache marker removed (multi-provider) ────
  it('contains no DECKENT_CACHE_KEY marker (C)', () => {
    const prompt = buildWorkerPrompt(makeTask(), AGENT, SKILLS);
    expect(prompt).not.toContain('DECKENT_CACHE_KEY');
  });

  // ── E: Karpathy injected as concise essence, not the full rule doc ─────
  it('injects a Karpathy essence (effect preserved) without the full rule doc (E)', () => {
    const prompt = buildWorkerPrompt(makeTask(), AGENT, SKILLS);
    // essence keeps the 4-discipline anchor
    expect(prompt).toMatch(/Simplicity/);
    expect(prompt).toMatch(/Goal-driven|Goal-Driven/);
    // full-doc source line must be gone (unique to karpathy-discipline.md)
    expect(prompt).not.toContain('multica-ai');
  });

  // ── E: deduped result/self-assessment — single authoritative section ──
  it('does not duplicate the result instructions across legacy headers (E)', () => {
    const prompt = buildWorkerPrompt(makeTask(), AGENT, SKILLS);
    // the standalone "## Honest Self-Assessment" header is folded into the
    // single "## Result & Self-Assessment" authority section
    expect(prompt).not.toContain('## Honest Self-Assessment');
    expect(prompt).toContain('## Result & Self-Assessment');
  });

  // ── D: token estimate reflects the real assembled prompt ──────────────
  it('sets task.estimatedTokens within ±15% of the real prompt size (D)', () => {
    const task = makeTask();
    const prompt = buildWorkerPrompt(task, AGENT, SKILLS);
    const actual = Math.ceil(prompt.length / 4);
    expect(task.estimatedTokens).toBeDefined();
    const ratio = (task.estimatedTokens as number) / actual;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.15);
  });

  // ── Multi-provider parity — same quality for every provider ───────────
  it('produces provider-agnostic quality (no marker, goCriteria + essence) for gemini (parity)', () => {
    const prompt = buildWorkerPrompt(makeTask({ provider: 'gemini', model: 'gemini-2.5-flash' }), AGENT, SKILLS);
    expect(prompt).not.toContain('DECKENT_CACHE_KEY');
    expect(prompt).toContain(GC_MARKER);
    expect(prompt).toMatch(/Simplicity/);
  });

  it('differs between claude and gemini only by canonical provider identity fields (parity)', () => {
    const c = buildWorkerPrompt(makeTask({ provider: 'claude' }), AGENT, SKILLS);
    const g = buildWorkerPrompt(
      makeTask({ provider: 'gemini', model: 'gemini-2.5-flash' }),
      AGENT,
      SKILLS,
    );
    // Normalize the only legitimate provider-specific receipt fields.
    const norm = (s: string) => s
      .replace(/"provider": "(claude|gemini|codex)"/g, '"provider": "X"')
      .replace(/claude-sonnet-5|gemini-2\.5-flash/g, 'MODEL_API_ID')
      .replace(/(Requested provider|Plan-resolved provider): (claude|gemini)/g, '$1: PROVIDER');
    expect(norm(c)).toBe(norm(g));
  });
});
