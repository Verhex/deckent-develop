import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeLogEvent,
  normalizeStreamEvent,
  LOG_EVENT_TYPES,
  type LogEvent,
  type StreamLogEvent,
} from '../../src/core/log-event.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'log-event-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function readEvents(logPath: string): LogEvent[] {
  return readFileSync(logPath, 'utf-8')
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as LogEvent);
}

describe('normalizeStreamEvent — provider-agnostic (never drops)', () => {
  it('maps a Claude SDK-message tool_use → tool_use', () => {
    const claudeToolUse = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_01', name: 'Edit', input: { file: 'x.ts' } }],
      },
    };
    const ev = normalizeStreamEvent(claudeToolUse, 'claude');
    expect(ev.type).toBe('tool_use');
    expect(ev.content).toEqual(claudeToolUse);
  });

  it('maps a direct Claude tool_use content-block → tool_use', () => {
    const directToolUse = { type: 'tool_use', id: 'toolu_02', name: 'Bash', input: { cmd: 'ls' } };
    expect(normalizeStreamEvent(directToolUse, 'claude').type).toBe('tool_use');
  });

  it('maps a Claude assistant text message → text', () => {
    const claudeText = {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'thinking...' }] },
    };
    expect(normalizeStreamEvent(claudeText, 'claude').type).toBe('text');
  });

  it('maps a Claude user tool_result message → tool_result', () => {
    const claudeToolResult = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: 'done' }] },
    };
    expect(normalizeStreamEvent(claudeToolResult, 'claude').type).toBe('tool_result');
  });

  it('maps the Claude final result envelope (carries usage) → usage', () => {
    const claudeResult = {
      type: 'result',
      subtype: 'success',
      result: 'ok',
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10 },
    };
    expect(normalizeStreamEvent(claudeResult, 'claude').type).toBe('usage');
  });

  it('attaches canonical terminal semantics to an id-less Codex turn.completed envelope', () => {
    const event = normalizeStreamEvent({
      type: 'usage',
      providerEventType: 'turn.completed',
      codexEventType: 'turn.completed',
      usage: { input_tokens: 100, output_tokens: 25, cached_input_tokens: 40 },
    }, 'codex');

    expect(event).toMatchObject({
      type: 'usage',
      usageSemantics: {
        provider: 'codex',
        providerEventType: 'turn.completed',
        mode: 'cumulative',
        terminal: true,
        countsAsTurn: true,
      },
    });
    expect(event.usageSemantics?.identity).toBeUndefined();
  });

  it('maps a Claude system/init event → lifecycle', () => {
    const init = { type: 'system', subtype: 'init', session_id: 's1' };
    expect(normalizeStreamEvent(init, 'claude').type).toBe('lifecycle');
  });

  it('maps a raw Anthropic streaming content_block_start(tool_use) → tool_use', () => {
    const raw = {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_03', name: 'Read', input: {} },
    };
    expect(normalizeStreamEvent(raw, 'anthropic').type).toBe('tool_use');
  });

  it('maps an Ollama /api/generate streaming chunk → text', () => {
    const ollamaChunk = { model: 'qwen2.5', created_at: '2026-06-26T10:00:00Z', response: 'Hello', done: false };
    const ev = normalizeStreamEvent(ollamaChunk, 'ollama');
    expect(ev.type).toBe('text');
  });

  it('maps an Ollama /api/chat streaming chunk → text', () => {
    const ollamaChat = { model: 'qwen2.5', message: { role: 'assistant', content: 'Hi' }, done: false };
    expect(normalizeStreamEvent(ollamaChat, 'ollama').type).toBe('text');
  });

  it('maps the Ollama final stats chunk (eval_count) → usage', () => {
    const ollamaFinal = { model: 'qwen2.5', response: '', done: true, prompt_eval_count: 10, eval_count: 5 };
    expect(normalizeStreamEvent(ollamaFinal, 'ollama').type).toBe('usage');
  });

  it('maps an OpenAI-compatible delta chunk → text', () => {
    const oai = { id: 'c1', choices: [{ index: 0, delta: { content: 'tok' } }] };
    expect(normalizeStreamEvent(oai, 'openai-compatible').type).toBe('text');
  });

  it('maps an OpenAI-compatible tool_calls delta → tool_use', () => {
    const oai = { id: 'c2', choices: [{ index: 0, delta: { tool_calls: [{ id: 't', function: { name: 'f' } }] } }] };
    expect(normalizeStreamEvent(oai, 'openai-compatible').type).toBe('tool_use');
  });

  it('maps a Gemini candidates chunk → text', () => {
    const gemini = { candidates: [{ content: { parts: [{ text: 'hi' }], role: 'model' } }] };
    expect(normalizeStreamEvent(gemini, 'gemini').type).toBe('text');
  });

  it('maps a Gemini terminal envelope with usageMetadata → canonical usage', () => {
    const event = normalizeStreamEvent({
      candidates: [{ content: { parts: [{ text: 'done' }], role: 'model' } }],
      usageMetadata: {
        promptTokenCount: 20,
        candidatesTokenCount: 5,
        cachedContentTokenCount: 7,
      },
    }, 'gemini');

    expect(event.type).toBe('usage');
    expect(event.usageSemantics).toMatchObject({
      provider: 'gemini',
      mode: 'cumulative',
      terminal: true,
      countsAsTurn: true,
    });
  });

  it('NEVER drops an unknown-shape object → text, content preserved', () => {
    const weird = { foo: 'bar', baz: 123 };
    const ev = normalizeStreamEvent(weird, 'totally-unknown-provider');
    expect(ev).not.toBeNull();
    expect(ev.type).toBe('text');
    expect(ev.content).toEqual(weird);
  });

  it('NEVER drops a non-JSON string chunk → text, raw preserved', () => {
    const ev = normalizeStreamEvent('plain stdout line not json', 'claude');
    expect(ev.type).toBe('text');
    expect(ev.content).toBe('plain stdout line not json');
  });

  it('parses a JSON string chunk before classifying', () => {
    const line = JSON.stringify({ type: 'tool_use', id: 'x', name: 'Grep', input: {} });
    expect(normalizeStreamEvent(line, 'claude').type).toBe('tool_use');
  });

  it('NEVER drops null/primitive raw → text', () => {
    expect(normalizeStreamEvent(null, 'claude').type).toBe('text');
    expect(normalizeStreamEvent(42, 'claude').type).toBe('text');
  });

  it('always returns one of the declared LogEventType values', () => {
    const samples: Array<[unknown, string]> = [
      [{ type: 'assistant', message: { content: [{ type: 'tool_use' }] } }, 'claude'],
      [{ response: 'x', done: false }, 'ollama'],
      [{ random: true }, 'mystery'],
      ['raw text', 'claude'],
    ];
    for (const [raw, provider] of samples) {
      const ev = normalizeStreamEvent(raw, provider);
      expect(LOG_EVENT_TYPES).toContain(ev.type);
    }
  });
});

describe('writeLogEvent — JSONL, monotonic seq, ISO ts', () => {
  it('appends parseable JSONL lines with the supplied monotonic seq and an ISO ts', () => {
    const logPath = join(tmpDir, 'task-X.log');
    const evs: StreamLogEvent[] = [
      { type: 'turn', content: { n: 1 } },
      { type: 'tool_use', content: { name: 'Edit' } },
      { type: 'text', content: 'hello' },
    ];
    evs.forEach((ev, i) => writeLogEvent(logPath, ev, i + 1));

    const parsed = readEvents(logPath);
    expect(parsed).toHaveLength(3);
    // parseable already proven by readEvents (JSON.parse per line)
    expect(parsed.map((p) => p.seq)).toEqual([1, 2, 3]); // monotonic
    expect(parsed.map((p) => p.type)).toEqual(['turn', 'tool_use', 'text']);
    expect(parsed[2].content).toBe('hello');
    for (const p of parsed) {
      expect(typeof p.ts).toBe('string');
      expect(Number.isNaN(Date.parse(p.ts))).toBe(false); // ISO ts parseable
    }
  });

  it('creates missing parent directories', () => {
    const logPath = join(tmpDir, 'nested', 'deep', 'task-Y.log');
    writeLogEvent(logPath, { type: 'lifecycle', content: { phase: 'start' } }, 1);
    expect(existsSync(logPath)).toBe(true);
    expect(readEvents(logPath)[0].type).toBe('lifecycle');
  });

  it('is fail-safe — never throws on a bad path', () => {
    // A directory path as the log file forces an EISDIR on append; must not throw.
    expect(() => writeLogEvent(tmpDir, { type: 'text', content: 'x' }, 1)).not.toThrow();
  });

  it('round-trips normalized provider events to JSONL (never dropping any)', () => {
    const logPath = join(tmpDir, 'rt.log');
    const inputs: Array<[unknown, string]> = [
      [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] } }, 'claude'],
      [{ model: 'qwen', response: 'hi', done: false }, 'ollama'],
      ['a plain non-json line', 'claude'],
    ];
    inputs.forEach(([raw, provider], i) => writeLogEvent(logPath, normalizeStreamEvent(raw, provider), i + 1));

    const parsed = readEvents(logPath);
    expect(parsed).toHaveLength(3); // none dropped
    expect(parsed[0].type).toBe('tool_use');
    expect(parsed[1].type).toBe('text');
    expect(parsed[2].type).toBe('text');
    expect(parsed.map((p) => p.seq)).toEqual([1, 2, 3]);
  });

  it('persists canonical usage semantics beside the lossless provider payload', () => {
    const logPath = join(tmpDir, 'codex-usage.log');
    const event = normalizeStreamEvent({
      type: 'usage',
      providerEventType: 'turn.completed',
      usage: { input_tokens: 4, output_tokens: 2 },
    }, 'codex');

    writeLogEvent(logPath, event, 1);

    expect(readEvents(logPath)[0]).toMatchObject({
      type: 'usage',
      content: {
        providerEventType: 'turn.completed',
        usage: { input_tokens: 4, output_tokens: 2 },
      },
      usageSemantics: {
        provider: 'codex',
        providerEventType: 'turn.completed',
        terminal: true,
      },
    });
  });
});
