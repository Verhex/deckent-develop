// Sprint 196 Task 196-003 (WP-5) — Anthropic prompt-cache wire tests.
//
// Verifies five properties of the cache-control surface:
//   (a) Frozen-slice determinism — same (agent, skills) → same cacheKey
//   (b) Dynamic-slice variation  — same agent/skills + different task → same key, different combined
//   (c) parseCacheUsage parses cache_read_input_tokens from a Claude CLI envelope
//   (d) parseCacheUsage gracefully returns 0 when the cache field is absent
//   (e) Backward-compat — legacy buildWorkerPrompt(...) still returns a string
//       and that string carries the DECKENT_CACHE_KEY marker

import { describe, it, expect } from 'vitest';
import {
  parseCacheUsage,
  attachCacheControlToMessages,
  CACHE_CONTROL_EPHEMERAL,
} from '../../src/providers/claude.js';
import {
  buildWorkerPrompt,
  buildWorkerPromptStructured,
  computePromptCacheKey,
  extractPromptCacheKey,
  PROMPT_CACHE_KEY_MARKER_RE,
} from '../../src/orchestra/task-builder.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Fixtures ──────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '196-test-001',
    title: 'fixture task',
    description: 'fixture description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'unit-test fixture',
    scope: {
      directories: ['src/providers/'],
      filesRead: [],
      filesWrite: ['src/providers/claude.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'tests pass',
      noGoCriteria: 'tests fail',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-196',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    createdAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  } as Task;
}

const AGENT_PROMPT = 'You are the architect agent — design systems, write specs.';
const SKILLS = [
  { name: 'typescript-expert', content: 'TypeScript expert skill content — strict mode, generics.' },
  { name: 'anthropic-sdk',     content: 'Anthropic SDK skill content — prompt caching, tool use.' },
];

// ─── Tests ─────────────────────────────────────────────────────────────

describe('prompt cache wire (WP-5)', () => {
  it('(a) frozen slice is deterministic — same agent+skills produce the same cacheKey', () => {
    const t1 = makeTask({ id: '196-test-a1', description: 'first task body' });
    const t2 = makeTask({ id: '196-test-a2', description: 'totally different task body' });

    const r1 = buildWorkerPromptStructured(t1, AGENT_PROMPT, SKILLS);
    const r2 = buildWorkerPromptStructured(t2, AGENT_PROMPT, SKILLS);

    // Two renders with identical (agent, skills) must yield identical frozen + cacheKey
    expect(r1.frozen).toBe(r2.frozen);
    expect(r1.cacheKey).toBe(r2.cacheKey);
    expect(r1.cacheKey).toMatch(/^[a-f0-9]{32}$/);
    // Spot-check that computePromptCacheKey agrees with the embedded value
    expect(computePromptCacheKey(r1.frozen)).toBe(r1.cacheKey);
  });

  it('(b) dynamic slice varies per task; frozen + cacheKey remain stable across tasks', () => {
    const t1 = makeTask({ id: '196-test-b1', description: 'description ONE',  title: 'title-one' });
    const t2 = makeTask({ id: '196-test-b2', description: 'description TWO',  title: 'title-two' });

    const r1 = buildWorkerPromptStructured(t1, AGENT_PROMPT, SKILLS);
    const r2 = buildWorkerPromptStructured(t2, AGENT_PROMPT, SKILLS);

    // Same agent+skills → same cacheKey (cache identity holds across tasks)
    expect(r1.cacheKey).toBe(r2.cacheKey);
    // Dynamic content reflects each task's description/title
    expect(r1.dynamic).toContain('description ONE');
    expect(r2.dynamic).toContain('description TWO');
    expect(r1.dynamic).not.toBe(r2.dynamic);
    // Combined strings differ (per-task content threads through)
    expect(r1.combined).not.toBe(r2.combined);

    // A different agent set MUST change the cacheKey (cache identity must
    // shift when the frozen prefix really changes — otherwise the wire is
    // returning a constant by accident).
    const r3 = buildWorkerPromptStructured(t1, 'different agent — security-auditor', SKILLS);
    expect(r3.cacheKey).not.toBe(r1.cacheKey);
  });

  it('(c) parseCacheUsage extracts cache_read_input_tokens from a Claude CLI JSON envelope', () => {
    const envelope = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'task ok',
      usage: {
        input_tokens: 1500,
        output_tokens: 320,
        cache_read_input_tokens: 85000,
        cache_creation_input_tokens: 1200,
      },
    });
    const usage = parseCacheUsage(envelope);
    expect(usage.cacheReadTokens).toBe(85000);
    expect(usage.cacheCreationTokens).toBe(1200);

    // Object input (already-parsed SDK response) works too
    const usageObj = parseCacheUsage({
      usage: { cache_read_input_tokens: 42, cache_creation_input_tokens: 7 },
    });
    expect(usageObj.cacheReadTokens).toBe(42);
    expect(usageObj.cacheCreationTokens).toBe(7);
  });

  it('(d) parseCacheUsage returns zeros for envelopes without cache fields (cache miss fallback)', () => {
    const noCache = JSON.stringify({ type: 'result', usage: { input_tokens: 100, output_tokens: 50 } });
    const u1 = parseCacheUsage(noCache);
    expect(u1.cacheReadTokens).toBe(0);
    expect(u1.cacheCreationTokens).toBe(0);

    // Garbage in → zeros, never throws
    expect(parseCacheUsage('not json').cacheReadTokens).toBe(0);
    expect(parseCacheUsage('').cacheReadTokens).toBe(0);
    expect(parseCacheUsage(null).cacheReadTokens).toBe(0);
    expect(parseCacheUsage({ usage: null }).cacheReadTokens).toBe(0);
    // Negative or NaN values are clamped to 0
    expect(parseCacheUsage({ usage: { cache_read_input_tokens: -5 } }).cacheReadTokens).toBe(0);
    expect(parseCacheUsage({ usage: { cache_read_input_tokens: 'abc' } }).cacheReadTokens).toBe(0);
  });

  it('(e) backward compat — buildWorkerPrompt returns a string carrying the DECKENT_CACHE_KEY marker', () => {
    const task = makeTask({ id: '196-test-e1', description: 'legacy consumer call' });

    const promptStr = buildWorkerPrompt(task, AGENT_PROMPT, SKILLS);
    expect(typeof promptStr).toBe('string');
    expect(promptStr.length).toBeGreaterThan(0);

    // Marker is at the head of the prompt and matches the canonical regex
    const match = PROMPT_CACHE_KEY_MARKER_RE.exec(promptStr.slice(0, 200));
    expect(match).not.toBeNull();
    expect(match?.[1]).toMatch(/^[a-f0-9]{32}$/);

    // Extractor returns the same key the structured builder produced
    const struct = buildWorkerPromptStructured(task, AGENT_PROMPT, SKILLS);
    expect(extractPromptCacheKey(promptStr)).toBe(struct.cacheKey);
    expect(promptStr).toBe(struct.combined);
  });

  it('(f) attachCacheControlToMessages marks the system block as ephemeral', () => {
    const messages = [
      { role: 'system' as const, content: 'FROZEN BOILERPLATE — Karpathy + agent + skills' },
      { role: 'user' as const,   content: 'task-specific description' },
    ];
    const out = attachCacheControlToMessages(messages);

    // System message content becomes a block array with the cache_control marker
    const systemMsg = out.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(Array.isArray(systemMsg!.content)).toBe(true);
    const blocks = systemMsg!.content as Array<{ type: string; cache_control?: unknown }>;
    expect(blocks[0]?.cache_control).toEqual({ type: CACHE_CONTROL_EPHEMERAL.type });

    // Input is not mutated
    expect(typeof messages[0]!.content).toBe('string');
  });
});
