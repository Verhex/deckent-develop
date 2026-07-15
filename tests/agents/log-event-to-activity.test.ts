// SURF-3 Claude-CLI rich-stream S1 — logEventToActivity pure map.
//
// The classifier (normalizeStreamEvent, core/log-event.ts) already splits a
// Claude-CLI stream-json line into tool_use/tool_result/usage/…; this proves the
// pure map that turns the tool events into a per-tool ACTIVITY line, extracting
// the tool name + primary arg. Fully hermetic — no I/O, fixture lines only.

import { describe, it, expect } from 'vitest';
import { normalizeStreamEvent } from '../../src/core/log-event.js';
import { logEventToActivity } from '../../src/agents/worker-activity.js';

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
