// ═══ http-agentic-worker SCOPE_INSUFFICIENT emission — F1-013 phase-2 (334-005) ═══
//
// Hermetic (tmpdir + injected send + injected dispatcher + injected event-emitter;
// no real spawn, no network). Verifies that runHttpAgenticWorker emits the SAME
// WORKER→BRAIN:SCOPE_INSUFFICIENT event the Ollama runner emits when an out-of-scope
// write/edit is rejected — in ADDITION to feeding the error back to the model — and
// does NOT emit it for in-scope writes. Pre-fix RED: zero events emitted (the scope
// error was fed to the model only). One event per violation (no spam).

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
  runHttpAgenticWorker,
  type HttpAgenticSend,
  type HttpAgenticTurn,
  type HttpAgenticMessage,
  type HttpAgenticRunnerOptions,
  type HttpAgenticEventEmitter,
} from '../../src/agents/http-agentic-worker.js';
import type { McpToolDispatcher } from '../../src/cli/commands/chat-native.js';
import { SCOPE_INSUFFICIENT_CHANNEL } from '../../src/orchestra/event-stream.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CapturedTurn {
  messages: HttpAgenticMessage[];
  model: string;
}

/** A scripted `send` that returns `turns` in order and snapshots each input. */
function scriptSend(turns: HttpAgenticTurn[], captured: CapturedTurn[] = []): HttpAgenticSend {
  let i = 0;
  return async (messages, model) => {
    captured.push({
      messages: JSON.parse(JSON.stringify(messages)) as HttpAgenticMessage[],
      model,
    });
    const t = turns[Math.min(i, turns.length - 1)]!;
    i++;
    return t;
  };
}

/** A turn requesting tool calls. `arguments` is stringified to mirror the OpenAI wire. */
function toolTurn(
  calls: { name: string; args: Record<string, unknown>; id?: string }[],
  content = '',
): HttpAgenticTurn {
  return {
    content,
    toolCalls: calls.map((c, idx) => ({
      id: c.id ?? `call-${idx}`,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    })),
  };
}

/** A recording event emitter — captures every emission so it can be asserted. */
interface EmittedEvent {
  source: string;
  target: string;
  channel: string;
  payload: Record<string, unknown>;
}
function recordingEmitter(sink: EmittedEvent[]): HttpAgenticEventEmitter {
  return (source, target, channel, payload) => {
    sink.push({ source, target, channel, payload: payload as Record<string, unknown> });
  };
}

/** A recording dispatcher — never touches disk; reports a write/edit as succeeded. */
interface DispatchedCall {
  name: string;
  args: Record<string, unknown>;
}
function recordingDispatcher(sink: DispatchedCall[]): McpToolDispatcher {
  return {
    async dispatch(name, args) {
      sink.push({ name, args: args as Record<string, unknown> });
      return `[ok] ${name}`;
    },
  };
}

function baseOpts(
  projectRoot: string,
  send: HttpAgenticSend,
  overrides: Partial<HttpAgenticRunnerOptions> = {},
): HttpAgenticRunnerOptions {
  return {
    taskId: 'scope-evt-001',
    model: 'deepseek-chat',
    prompt: 'Do the task.',
    scope: { directories: ['src/'], filesWrite: ['allowed.ts'], filesRead: [] },
    goNogo: { goCriteria: 'file written correctly', noGoCriteria: 'nothing written', techDebtAcceptable: 'minor' },
    projectRoot,
    provider: 'deepseek',
    send,
    ...overrides,
  };
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('http-agentic-worker — SCOPE_INSUFFICIENT emission parity (334-005)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'http-agentic-scope-evt-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  // ── A: out-of-scope write → exactly one event + model still fed the error ──
  it('out-of-scope write_file → emits exactly one SCOPE_INSUFFICIENT event AND still feeds the model', async () => {
    const captured: CapturedTurn[] = [];
    const events: EmittedEvent[] = [];
    const dispatched: DispatchedCall[] = [];
    const send = scriptSend(
      [
        toolTurn([{ name: 'write_file', args: { path: 'forbidden.ts', content: 'pwn' }, id: 'call-evil' }]),
        toolTurn([{ name: 'task_done', args: { selfAssessment: 'NO_GO', notes: 'no in-scope path' } }]),
      ],
      captured,
    );

    const result = await runHttpAgenticWorker(
      baseOpts(projectRoot, send, {
        emitEvent: recordingEmitter(events),
        dispatcher: recordingDispatcher(dispatched),
      }),
    );

    // (b) Exactly one scope-violation event, mirroring the Ollama-runner contract.
    const scopeEvents = events.filter(e => e.channel === SCOPE_INSUFFICIENT_CHANNEL);
    expect(scopeEvents.length).toBe(1);
    const evt = scopeEvents[0]!;
    expect(evt.source).toBe('worker');
    expect(evt.target).toBe('brain');
    expect(evt.channel).toBe('WORKER→BRAIN:SCOPE_INSUFFICIENT');
    expect(evt.payload['taskId']).toBe('scope-evt-001');
    expect(evt.payload['attemptedPath']).toBe('forbidden.ts');
    expect(typeof evt.payload['reason']).toBe('string');
    expect(evt.payload['reason'] as string).toContain('[scope-violation]');
    expect(evt.payload['goCriteria']).toBe('file written correctly');
    const scope = evt.payload['currentScope'] as Record<string, unknown>;
    expect(scope['filesWrite']).toEqual(['allowed.ts']);
    expect(scope['directories']).toEqual(['src/']);

    // (a) The model-facing error feed is unchanged: the next request carries the
    //     [scope-violation] tool message, and the rejected write never dispatched
    //     nor hit disk.
    expect(dispatched.length).toBe(0);
    expect(existsSync(join(projectRoot, 'forbidden.ts'))).toBe(false);
    expect(captured.length).toBe(2);
    const toolMsg = captured[1]!.messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toContain('[scope-violation]');
    expect(toolMsg!.content).toContain('forbidden.ts');
    expect(toolMsg!.tool_call_id).toBe('call-evil');
    expect(result.selfAssessment).toBe('NO_GO');
  });

  // ── B: in-scope write → no scope event; dispatcher invoked ──
  it('in-scope write_file → no SCOPE_INSUFFICIENT event emitted', async () => {
    const events: EmittedEvent[] = [];
    const dispatched: DispatchedCall[] = [];
    const send = scriptSend([
      toolTurn([{ name: 'write_file', args: { path: 'allowed.ts', content: 'export const x = 1;\n' } }]),
      toolTurn([{ name: 'task_done', args: { selfAssessment: 'DONE', notes: 'wrote allowed.ts' } }]),
    ]);

    const result = await runHttpAgenticWorker(
      baseOpts(projectRoot, send, {
        emitEvent: recordingEmitter(events),
        dispatcher: recordingDispatcher(dispatched),
      }),
    );

    expect(events.filter(e => e.channel === SCOPE_INSUFFICIENT_CHANNEL).length).toBe(0);
    // The in-scope write reached the dispatcher (was not blocked).
    expect(dispatched.some(d => d.name === 'write_file' && d.args['path'] === 'allowed.ts')).toBe(true);
    expect(result.filesChanged).toEqual(['allowed.ts']);
  });

  // ── C: two out-of-scope attempts → exactly two events (one per violation, no spam) ──
  it('two out-of-scope attempts → exactly two events (one per violation)', async () => {
    const events: EmittedEvent[] = [];
    const dispatched: DispatchedCall[] = [];
    const send = scriptSend([
      toolTurn([{ name: 'write_file', args: { path: '../first-escape.ts', content: 'a' }, id: 'c1' }]),
      toolTurn([{ name: 'edit_file', args: { path: '/tmp/second-escape.ts', content: 'b' }, id: 'c2' }]),
      toolTurn([{ name: 'task_done', args: { selfAssessment: 'NO_GO', notes: 'all paths rejected' } }]),
    ]);

    await runHttpAgenticWorker(
      baseOpts(projectRoot, send, {
        emitEvent: recordingEmitter(events),
        dispatcher: recordingDispatcher(dispatched),
      }),
    );

    const scopeEvents = events.filter(e => e.channel === SCOPE_INSUFFICIENT_CHANNEL);
    expect(scopeEvents.length).toBe(2);
    const paths = scopeEvents.map(e => e.payload['attemptedPath']);
    expect(paths).toContain('../first-escape.ts');
    expect(paths).toContain('/tmp/second-escape.ts');
    expect(dispatched.length).toBe(0);
  });

  // ── D: DEFAULT emitter (no injection) + seeded sprint-state → one event on disk ──
  //   Proves the production default path writes the SAME event the Ollama runner
  //   writes (writeEvent → .deckent/recently-works/<sid>-events.jsonl). No network.
  it('default emitter + active sprint → SCOPE_INSUFFICIENT event written to the project event stream', async () => {
    const sprintId = 'sprint-http-scope-evt-test';
    const deckentDir = join(projectRoot, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    writeFileSync(join(deckentDir, 'sprint-state.json'), JSON.stringify({ sprintId }), 'utf-8');

    const dispatched: DispatchedCall[] = [];
    const send = scriptSend([
      toolTurn([{ name: 'write_file', args: { path: '../escape.ts', content: 'pwn' }, id: 'evil' }]),
      toolTurn([{ name: 'task_done', args: { selfAssessment: 'NO_GO', notes: 'no in-scope path' } }]),
    ]);

    // No emitEvent override → exercises buildDefaultEmitEvent (real writeEvent).
    await runHttpAgenticWorker(
      baseOpts(projectRoot, send, { dispatcher: recordingDispatcher(dispatched) }),
    );

    const eventsPath = join(deckentDir, 'recently-works', `${sprintId}-events.jsonl`);
    expect(existsSync(eventsPath)).toBe(true);
    const onDisk = readFileSync(eventsPath, 'utf-8')
      .split('\n')
      .filter(l => l.trim().length > 0)
      .map(l => JSON.parse(l) as Record<string, unknown>);
    const scopeEvents = onDisk.filter(e => e['channel'] === SCOPE_INSUFFICIENT_CHANNEL);
    expect(scopeEvents.length).toBe(1);
    expect(scopeEvents[0]!['source']).toBe('worker');
    expect(scopeEvents[0]!['target']).toBe('brain');
    const payload = scopeEvents[0]!['payload'] as Record<string, unknown>;
    expect(payload['attemptedPath']).toBe('../escape.ts');
    expect(payload['taskId']).toBe('scope-evt-001');
  });

  // ── E: channel constant is the canonical protocol string (reuse, not reinvent) ──
  it('SCOPE_INSUFFICIENT_CHANNEL is the canonical protocol value', () => {
    expect(SCOPE_INSUFFICIENT_CHANNEL).toBe('WORKER→BRAIN:SCOPE_INSUFFICIENT');
  });
});
