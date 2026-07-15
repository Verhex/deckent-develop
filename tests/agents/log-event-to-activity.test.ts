// SURF-3 Claude-CLI rich-stream S1 — logEventToActivity pure map.
//
// The classifier (normalizeStreamEvent, core/log-event.ts) already splits a
// Claude-CLI stream-json line into tool_use/tool_result/usage/…; this proves the
// pure map that turns the tool events into a per-tool ACTIVITY line, extracting
// the tool name + primary arg. Fully hermetic — no I/O, fixture lines only.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeStreamEvent } from '../../src/core/log-event.js';
import { logEventToActivity, makeActivityOnEvent } from '../../src/agents/worker-activity.js';
import { CHANNELS } from '../../src/core/event-stream.js';

function readActivity(root: string, sprintId: string): Array<Record<string, unknown>> {
  const dir = join(root, '.deckent', 'recently-works');
  if (!existsSync(dir)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(dir, name), 'utf-8').split('\n')) {
      if (line.trim()) out.push(JSON.parse(line) as Record<string, unknown>);
    }
  }
  void sprintId; // per-test tmpdir isolates this sprint; filter by channel only.
  return out.filter((e) => e['channel'] === CHANNELS.ACTIVITY);
}

/** Real Claude-Code SDK envelope shapes (NDJSON lines from --output-format stream-json). */
const TOOL_USE_SDK = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Edit', input: { file_path: 'src/x.ts', old: 'a', new: 'b' } }] },
});
const TOOL_USE_BASH = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 'toolu_2', name: 'Bash', input: { cmd: 'npm test' } }] },
});
const TOOL_USE_NOARG = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 'toolu_3', name: 'TodoWrite', input: { todos: [] } }] },
});
const TOOL_RESULT_OK = JSON.stringify({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok', is_error: false }] },
});
const TOOL_RESULT_ERR = JSON.stringify({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'boom', is_error: true }] },
});
const RESULT_USAGE = JSON.stringify({ type: 'result', usage: { input_tokens: 10, output_tokens: 5 } });
const ASSISTANT_TEXT = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } });
const TOOL_USE_RAW = JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', name: 'Read', input: { path: 'a.md' } } });

function activityFor(line: string) {
  return logEventToActivity(normalizeStreamEvent(line, 'claude'), 't1', 'w1');
}

describe('logEventToActivity — tool_use', () => {
  it('SDK envelope → 🔧 {name}({primary-arg}) with tool+args detail', () => {
    const a = activityFor(TOOL_USE_SDK);
    expect(a).toMatchObject({ taskId: 't1', workerId: 'w1', kind: 'tool', line: '🔧 Edit(src/x.ts)' });
    expect(a?.detail).toEqual({ tool: 'Edit', args: { file_path: 'src/x.ts', old: 'a', new: 'b' } });
  });

  it('picks cmd as the primary arg for Bash', () => {
    expect(activityFor(TOOL_USE_BASH)?.line).toBe('🔧 Bash(npm test)');
  });

  it('a tool with no path/cmd/url arg → bare 🔧 {name}', () => {
    expect(activityFor(TOOL_USE_NOARG)?.line).toBe('🔧 TodoWrite');
  });

  it('raw streaming content_block_start form is also handled', () => {
    expect(activityFor(TOOL_USE_RAW)?.line).toBe('🔧 Read(a.md)');
  });
});

describe('logEventToActivity — tool_result', () => {
  it('success → ↳ ✓ ok with ok:true + toolUseId', () => {
    const a = activityFor(TOOL_RESULT_OK);
    expect(a).toMatchObject({ kind: 'tool', line: '↳ ✓ ok' });
    expect(a?.detail).toEqual({ ok: true, toolUseId: 'toolu_1' });
  });

  it('error → ↳ ✗ error with ok:false', () => {
    const a = activityFor(TOOL_RESULT_ERR);
    expect(a).toMatchObject({ kind: 'tool', line: '↳ ✗ error' });
    expect(a?.detail).toMatchObject({ ok: false });
  });
});

describe('logEventToActivity — non-tool events → null (not a per-tool line)', () => {
  it('usage / assistant-text → null', () => {
    expect(activityFor(RESULT_USAGE)).toBeNull();
    expect(activityFor(ASSISTANT_TEXT)).toBeNull();
  });

  it('plain stdout text → null', () => {
    expect(activityFor('just some log output')).toBeNull();
  });

  it('workerId is omitted when not supplied', () => {
    const a = logEventToActivity(normalizeStreamEvent(TOOL_USE_SDK, 'claude'), 't1');
    expect(a).not.toHaveProperty('workerId');
  });
});

describe('makeActivityOnEvent — shared S2/S3 onEvent closure (real emission)', () => {
  let root: string;
  const sprintId = 'sprint-s23';
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'act-tap-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('flag ON: a tool_use event lands as a "🔧 …" line on the ACTIVITY channel', () => {
    const onEvent = makeActivityOnEvent({ projectRoot: root, taskId: 't1', workerId: 'w1', enabled: true, sprintId });
    onEvent(normalizeStreamEvent(TOOL_USE_SDK, 'claude'));

    const activity = readActivity(root, sprintId);
    expect(activity).toHaveLength(1);
    const payload = activity[0]!['payload'] as Record<string, unknown>;
    expect(payload['kind']).toBe('tool');
    expect(payload['line']).toBe('🔧 Edit(src/x.ts)');
    expect(payload['taskId']).toBe('t1');
  });

  it('flag ON: a non-tool event (usage) emits NOTHING', () => {
    const onEvent = makeActivityOnEvent({ projectRoot: root, taskId: 't1', enabled: true, sprintId });
    onEvent(normalizeStreamEvent(RESULT_USAGE, 'claude'));
    expect(readActivity(root, sprintId)).toHaveLength(0);
  });

  it('flag OFF: zero-cost no-op — nothing written', () => {
    const onEvent = makeActivityOnEvent({ projectRoot: root, taskId: 't1', enabled: false, sprintId });
    onEvent(normalizeStreamEvent(TOOL_USE_SDK, 'claude'));
    expect(readActivity(root, sprintId)).toHaveLength(0);
  });

  it('a pathological event shape never escapes the closure (fail-soft invariant)', () => {
    const onEvent = makeActivityOnEvent({ projectRoot: root, taskId: 't', enabled: true, sprintId });
    expect(() => onEvent({ type: 'tool_use', content: undefined } as never)).not.toThrow();
  });
});
