// ═══ SCOPE-W1 — scope-insufficiency escalation tests ════════════════════════
//
// Hermetic (tmpdir + scripted fetch + no spawnSync).
// Verifies that runAgenticWorker emits WORKER→BRAIN:SCOPE_INSUFFICIENT via
// writeEvent when an out-of-scope write is rejected, and does NOT emit it for
// in-scope writes.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runAgenticWorker,
  type AgenticRunnerOptions,
} from '../../src/agents/agentic-worker-runner.js';
import { SCOPE_INSUFFICIENT_CHANNEL } from '../../src/orchestra/event-stream.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const SPRINT_ID = 'sprint-scope-w1-test';

/** Build a stub fetch that returns a scripted sequence of /api/chat bodies. */
function scriptFetch(bodies: unknown[]): typeof fetch {
  let i = 0;
  return (async (_input: unknown, init?: RequestInit) => {
    void init;
    const next = bodies[Math.min(i, bodies.length - 1)];
    i++;
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

/** Build a single Ollama-shape /api/chat response. */
function chatResp(
  toolCalls: { name: string; args: Record<string, unknown>; id?: string }[],
  content = '',
): unknown {
  return {
    message: {
      role: 'assistant',
      content,
      tool_calls: toolCalls.map((c, idx) => ({
        id: c.id ?? `call-${idx}`,
        function: { name: c.name, arguments: c.args },
      })),
    },
  };
}

/** Build runner options with sensible defaults. */
function buildOpts(
  projectRoot: string,
  overrides: Partial<AgenticRunnerOptions> = {},
): AgenticRunnerOptions {
  return {
    taskId: 'test-scope-001',
    model: 'qwen3.6:27b',
    host: 'http://localhost:11434',
    prompt: 'Do the task.',
    scope: {
      directories: ['src/'],
      filesWrite: ['allowed.ts'],
      filesRead: [],
    },
    goNogo: {
      goCriteria: 'file written correctly',
      noGoCriteria: 'nothing written',
      techDebtAcceptable: 'minor',
    },
    projectRoot,
    ...overrides,
  };
}

/** Read events JSONL and return parsed event objects. */
function readEventsFromDisk(projectRoot: string): Array<Record<string, unknown>> {
  const eventsPath = join(
    projectRoot,
    '.deckent',
    'recently-works',
    `${SPRINT_ID}-events.jsonl`,
  );
  if (!existsSync(eventsPath)) return [];
  const raw = readFileSync(eventsPath, 'utf-8');
  return raw
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as Record<string, unknown>);
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('SCOPE-W1 — scope-insufficiency escalation event', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'scope-w1-'));
    // Seed sprint-state.json so getCurrentSprintId returns our fixture sprint.
    const deckentDir = join(projectRoot, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    writeFileSync(
      join(deckentDir, 'sprint-state.json'),
      JSON.stringify({ sprintId: SPRINT_ID }),
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  // ── Test A: out-of-scope write → SCOPE_INSUFFICIENT event emitted ──
  it('out-of-scope write_file → SCOPE_INSUFFICIENT event emitted with correct payload', async () => {
    const fetchImpl = scriptFetch([
      // Turn 1: model proposes an out-of-scope path.
      chatResp([
        { name: 'write_file', args: { path: '../escape.ts', content: 'pwn' }, id: 'call-evil' },
      ]),
      // Turn 2: model self-corrects with NO_GO.
      chatResp([
        { name: 'task_done', args: { selfAssessment: 'NO_GO', notes: 'no in-scope path' } },
      ]),
    ]);

    await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    const events = readEventsFromDisk(projectRoot);
    const scopeEvent = events.find(e => e['channel'] === SCOPE_INSUFFICIENT_CHANNEL);

    expect(scopeEvent).toBeDefined();
    expect(scopeEvent!['source']).toBe('worker');
    expect(scopeEvent!['target']).toBe('brain');
    expect(scopeEvent!['channel']).toBe('WORKER→BRAIN:SCOPE_INSUFFICIENT');

    const payload = scopeEvent!['payload'] as Record<string, unknown>;
    expect(payload['taskId']).toBe('test-scope-001');
    expect(payload['attemptedPath']).toBe('../escape.ts');
    expect(typeof payload['reason']).toBe('string');
    expect((payload['reason'] as string).length).toBeGreaterThan(0);
    expect(payload['goCriteria']).toBe('file written correctly');
    const scope = payload['currentScope'] as Record<string, unknown>;
    expect(Array.isArray(scope['filesWrite'])).toBe(true);
    expect(Array.isArray(scope['directories'])).toBe(true);
  });

  // ── Test B: in-scope write → no SCOPE_INSUFFICIENT event ──
  it('in-scope write_file → no SCOPE_INSUFFICIENT event emitted', async () => {
    const fetchImpl = scriptFetch([
      chatResp([
        { name: 'write_file', args: { path: 'allowed.ts', content: 'export const x = 1;\n' } },
      ]),
      chatResp([
        { name: 'task_done', args: { selfAssessment: 'DONE', notes: 'wrote allowed.ts' } },
      ]),
    ]);

    await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    const events = readEventsFromDisk(projectRoot);
    const scopeEvent = events.find(e => e['channel'] === SCOPE_INSUFFICIENT_CHANNEL);
    expect(scopeEvent).toBeUndefined();
  });

  // ── Test C: SCOPE_INSUFFICIENT_CHANNEL value is the correct protocol string ──
  it('SCOPE_INSUFFICIENT_CHANNEL has the correct protocol value', () => {
    expect(SCOPE_INSUFFICIENT_CHANNEL).toBe('WORKER→BRAIN:SCOPE_INSUFFICIENT');
  });

  // ── Test D: multiple out-of-scope attempts → multiple events (one per violation) ──
  it('multiple out-of-scope write attempts → one SCOPE_INSUFFICIENT event per violation', async () => {
    const fetchImpl = scriptFetch([
      // Turn 1: first out-of-scope attempt.
      chatResp([
        { name: 'write_file', args: { path: '../first-escape.ts', content: 'a' }, id: 'call-1' },
      ]),
      // Turn 2: second out-of-scope attempt.
      chatResp([
        { name: 'write_file', args: { path: '/tmp/second-escape.ts', content: 'b' }, id: 'call-2' },
      ]),
      // Turn 3: model gives up.
      chatResp([
        { name: 'task_done', args: { selfAssessment: 'NO_GO', notes: 'all paths rejected' } },
      ]),
    ]);

    await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    const events = readEventsFromDisk(projectRoot);
    const scopeEvents = events.filter(e => e['channel'] === SCOPE_INSUFFICIENT_CHANNEL);
    expect(scopeEvents.length).toBe(2);

    const payloads = scopeEvents.map(e => (e['payload'] as Record<string, unknown>)['attemptedPath']);
    expect(payloads).toContain('../first-escape.ts');
    expect(payloads).toContain('/tmp/second-escape.ts');
  });
});
