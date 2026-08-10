// tests/orchestra/trace-tail-parity.test.ts
// born-639 (404-005 TRACE-TAIL): 402-002's honest-remaining gap — the docker
// stream-port (born-637) was applied to claude ONLY. codex/gemini docker `.log`s
// were still a RAW dump, so their trace-content stayed empty (HER-ORTAM/Yasa #2
// violation). This proves:
//   (1) RED — today, a raw codex/gemini docker-logs dump produces ZERO LogEvents
//       (OutputCollector.readLogEvents, unmodified code — the same reader
//       trace-content-parity.test.ts already pins for claude's pre-fix state).
//   (2) GREEN — writeNormalizedDockerLog (now provider-agnostic across all 3,
//       spawn-backend-docker.ts) produces real LogEvents for codex (bridged via
//       bridgeCodexEvent — verified against the real codex-cli 0.138.0 capture,
//       .brain/archive/sprints/sprint-366-tasks/task-366-001.log) and gemini
//       (single-envelope fast path), including safe passthrough for anything
//       unrecognized — no data loss.
//   (3) usage-patch regression pin — patchResultUsageFromEnvelope (pristine
//       logContent, untouched by this task) yields the EXACT SAME real numbers
//       for codex/gemini fixtures regardless of the .log normalization change.
//   (4) token-counter.ts tier-2 (tryLoadCliLogTokens) becomes LogEvent-aware —
//       finds usage nested under a LogEvent row's `.content` — while a
//       disambiguator (looksLikeClaudeUsageShape) keeps it from misattributing
//       a DIFFERENT provider's coincidentally-similar nested shape as claude's.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OutputCollector } from '../../src/core/output-collector.js';
import {
  writeNormalizedDockerLog,
  bridgeCodexEvent,
  patchResultUsageFromEnvelope,
} from '../../src/orchestra/spawn-backend-docker.js';
import { tryLoadCliLogTokens } from '../../src/orchestra/token-counter.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'trace-tail-'));
  dirs.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function writeRawLog(root: string, taskId: string, content: string): string {
  const logPath = join(root, '.tasks', `task-${taskId}.log`);
  writeFileSync(logPath, content, 'utf-8');
  return logPath;
}

// ─── Real-format fixtures ─────────────────────────────────────────────────

// A representative excerpt of the REAL codex-cli 0.138.0 v2 event stream
// (verbatim shapes, trimmed to the events this task's bridge covers), captured
// live at .brain/archive/sprints/sprint-366-tasks/task-366-001.log.
const CODEX_USAGE = { input_tokens: 271223, cached_input_tokens: 232320, output_tokens: 4473, reasoning_output_tokens: 2007 };
const CODEX_ERROR_LINE = '2026-07-03T07:12:18.432653Z ERROR codex_core::tools::router: error=apply_patch verification failed';
const CODEX_FIXTURE_LINES = [
  JSON.stringify({ type: 'thread.started', thread_id: '019f26d1-b0da-7c70-bb92-170fe0aff3d9' }),
  JSON.stringify({ type: 'turn.started' }),
  JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'Starting the task.' } }),
  JSON.stringify({ type: 'item.started', item: { id: 'item_1', type: 'file_change', changes: [{ path: '/x/.tasks/task-366-001.hb', kind: 'add' }], status: 'in_progress' } }),
  JSON.stringify({ type: 'item.completed', item: { id: 'item_1', type: 'file_change', changes: [{ path: '/x/.tasks/task-366-001.hb', kind: 'add' }], status: 'completed' } }),
  CODEX_ERROR_LINE,
  // Unrecognized item type (mcp_tool_call) — verified present in the real capture,
  // NOT in this task's bridged list — must pass through safely, never drop.
  JSON.stringify({ type: 'item.completed', item: { id: 'item_9', type: 'mcp_tool_call', server: 'codex', tool: 'list_mcp_resources', status: 'completed' } }),
  JSON.stringify({ type: 'turn.completed', usage: CODEX_USAGE }),
].join('\n') + '\n';

const GEMINI_USAGE_METADATA = {
  promptTokenCount: 1500,
  candidatesTokenCount: 420,
  cachedContentTokenCount: 900,
  thoughtsTokenCount: 128,
  totalTokenCount: 2048,
};
const GEMINI_ENVELOPE_OBJ = { response: 'Task complete.', usageMetadata: GEMINI_USAGE_METADATA };
const GEMINI_COMPACT_FIXTURE = JSON.stringify(GEMINI_ENVELOPE_OBJ);
const GEMINI_PRETTY_FIXTURE = JSON.stringify(GEMINI_ENVELOPE_OBJ, null, 2);

// ─── (1) RED-kanıt: raw dump -> 0 LogEvents (unmodified output-collector.ts) ─

describe('RED-kanıt: codex/gemini RAW docker-logs dump -> readLogEvents 0 (born-639 pre-fix)', () => {
  it('codex NDJSON dump, raw (no normalization) -> 0 events (native lines lack ts/seq/content)', () => {
    const root = makeRoot();
    writeRawLog(root, '999-codex-red', CODEX_FIXTURE_LINES);
    const collector = new OutputCollector(root);
    expect(collector.readLogEvents('999-codex-red')).toHaveLength(0);
    collector.dispose();
  });

  it('gemini single-envelope dump, raw (no normalization) -> 0 events', () => {
    const root = makeRoot();
    writeRawLog(root, '999-gemini-red', GEMINI_COMPACT_FIXTURE);
    const collector = new OutputCollector(root);
    expect(collector.readLogEvents('999-gemini-red')).toHaveLength(0);
    collector.dispose();
  });

  it('gemini pretty-printed multi-line envelope, raw -> 0 events (each fragment line is invalid JSON)', () => {
    const root = makeRoot();
    writeRawLog(root, '999-gemini-pretty-red', GEMINI_PRETTY_FIXTURE);
    const collector = new OutputCollector(root);
    expect(collector.readLogEvents('999-gemini-pretty-red')).toHaveLength(0);
    collector.dispose();
  });
});

// ─── (2) GREEN: writeNormalizedDockerLog produces real LogEvents ────────────

describe('GREEN — writeNormalizedDockerLog(codex): bridged real trace, no data loss', () => {
  it('produces one LogEvent per line, none dropped', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-codex.log');
    const written = writeNormalizedDockerLog(logPath, CODEX_FIXTURE_LINES, 'codex');
    expect(written).toBe(8);

    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-codex');
    expect(events).toHaveLength(8);
    collector.dispose();
  });

  it('bridges thread.started -> lifecycle, turn.started -> turn, turn.completed -> usage', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-codex-types.log');
    writeNormalizedDockerLog(logPath, CODEX_FIXTURE_LINES, 'codex');
    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-codex-types');

    expect(events[0]!.type).toBe('lifecycle');
    expect(events[1]!.type).toBe('turn');
    expect(events[7]!.type).toBe('usage');
    collector.dispose();
  });

  it('bridges file_change item.started/completed -> tool_use/tool_result, agent_message -> text', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-codex-items.log');
    writeNormalizedDockerLog(logPath, CODEX_FIXTURE_LINES, 'codex');
    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-codex-items');

    expect(events[2]!.type).toBe('text'); // agent_message
    expect(events[3]!.type).toBe('tool_use'); // file_change item.started
    expect(events[4]!.type).toBe('tool_result'); // file_change item.completed
    collector.dispose();
  });

  it('plain-text ERROR line -> type text, content is the RAW line verbatim (passthrough, no data loss)', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-codex-errline.log');
    writeNormalizedDockerLog(logPath, CODEX_FIXTURE_LINES, 'codex');
    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-codex-errline');

    expect(events[5]!.type).toBe('text');
    expect(events[5]!.content).toBe(CODEX_ERROR_LINE);
    collector.dispose();
  });

  it('unrecognized item type (mcp_tool_call) passes through safely — never dropped', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-codex-unknown.log');
    writeNormalizedDockerLog(logPath, CODEX_FIXTURE_LINES, 'codex');
    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-codex-unknown');

    // Still present as SOME LogEvent (never silently dropped) — degrades to text.
    expect(events).toHaveLength(8);
    expect(events[6]!.type).toBe('text');
    collector.dispose();
  });

  it('bridgeCodexEvent preserves the original discriminator under codexEventType (no data loss on override)', () => {
    const bridged = bridgeCodexEvent({ type: 'thread.started', thread_id: 'abc' });
    expect(bridged.type).toBe('lifecycle');
    expect(bridged.providerEventType).toBe('thread.started');
    expect(bridged.codexEventType).toBe('thread.started');
    expect(bridged.thread_id).toBe('abc');
  });

  it('bridgeCodexEvent is a no-op for an unrecognized top-level type (returned unchanged)', () => {
    const original = { type: 'session.idle', foo: 'bar' };
    expect(bridgeCodexEvent(original)).toEqual(original);
  });
});

describe('GREEN — writeNormalizedDockerLog(gemini): single-envelope fast path, no data loss', () => {
  it('compact single-line envelope -> exactly 1 LogEvent, content preserves usageMetadata', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-gemini-compact.log');
    const written = writeNormalizedDockerLog(logPath, GEMINI_COMPACT_FIXTURE, 'gemini');
    expect(written).toBe(1);

    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-gemini-compact');
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('usage');
    expect(events[0]!.usageSemantics).toMatchObject({
      provider: 'gemini',
      mode: 'cumulative',
      terminal: true,
      countsAsTurn: true,
    });
    expect((events[0]!.content as Record<string, unknown>).usageMetadata).toEqual(GEMINI_USAGE_METADATA);
    collector.dispose();
  });

  it('pretty-printed multi-line envelope -> STILL exactly 1 LogEvent (whole-value fast path, not shredded per-line)', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-gemini-pretty.log');
    const written = writeNormalizedDockerLog(logPath, GEMINI_PRETTY_FIXTURE, 'gemini');
    expect(written).toBe(1);

    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-gemini-pretty');
    expect(events).toHaveLength(1);
    expect((events[0]!.content as Record<string, unknown>).response).toBe('Task complete.');
    expect((events[0]!.content as Record<string, unknown>).usageMetadata).toEqual(GEMINI_USAGE_METADATA);
    collector.dispose();
  });
});

describe('GREEN — claude regression guard: whole-value fast path never fires for a real NDJSON stream', () => {
  it('multi-event claude stream-json fixture still yields one LogEvent per line (byte-identical to born-637)', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-claude.log');
    const fixture = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
      JSON.stringify({ type: 'result', subtype: 'success', result: 'done', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }),
    ].join('\n') + '\n';

    const written = writeNormalizedDockerLog(logPath, fixture, 'claude');
    expect(written).toBe(3);

    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-claude');
    expect(events).toHaveLength(3);
    expect(events[2]!.type).toBe('usage');
    collector.dispose();
  });
});

// ─── (3) usage-patch regression pin: BİREBİR korunur across all 3 providers ─

describe('usage-patch regresyon: codex/gemini real numbers preserved after .log normalization', () => {
  function makeTaskDir(taskId: string, provider: string, model: string): string {
    const root = makeRoot();
    writeFileSync(
      join(root, '.tasks', `task-${taskId}.result`),
      JSON.stringify({
        taskId,
        selfAssessment: 'DONE',
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          provider,
          model,
        },
      }),
      'utf-8',
    );
    return join(root, '.tasks');
  }

  it('codex: patchResultUsageFromEnvelope pulls the REAL turn.completed usage from pristine content', () => {
    const tasksDir = makeTaskDir('999-codex-usage', 'codex', 'gpt-5.6-sol');
    patchResultUsageFromEnvelope(
      tasksDir,
      '999-codex-usage',
      'gpt-5.6-sol',
      CODEX_FIXTURE_LINES,
    );

    const result = JSON.parse(readFileSync(join(tasksDir, 'task-999-codex-usage.result'), 'utf-8')) as {
      tokenUsage: Record<string, unknown>;
    };
    // Fresh-input contract (2026-08-10): codex reports 271,223 input with 232,320
    // of it cached, so the adapter records 38,903 fresh plus a separate cache leg.
    // The guard's intent is unchanged — real, non-zero numbers survive the .log
    // normalization instead of collapsing to 0/0.
    expect(result.tokenUsage.inputTokens).toBe(38903);
    expect(result.tokenUsage.cacheReadTokens).toBe(232320);
    expect(result.tokenUsage.outputTokens).toBe(4473);
  });

  it('gemini: patchResultUsageFromEnvelope pulls the REAL usageMetadata from pristine content', () => {
    const tasksDir = makeTaskDir('999-gemini-usage', 'gemini', 'gemini-2.5-pro');
    patchResultUsageFromEnvelope(tasksDir, '999-gemini-usage', 'gemini-2.5-pro', GEMINI_COMPACT_FIXTURE);

    const result = JSON.parse(readFileSync(join(tasksDir, 'task-999-gemini-usage.result'), 'utf-8')) as {
      tokenUsage: Record<string, unknown>;
    };
    expect(result.tokenUsage.inputTokens).toBe(1500);
    expect(result.tokenUsage.outputTokens).toBe(420);
  });

  it('codex numbers are IDENTICAL whether or not the .log is ALSO LogEvent-normalized (independent pristine-content path)', () => {
    const tasksDirA = makeTaskDir('999-codex-a', 'codex', 'gpt-5.6-sol');
    const tasksDirB = makeTaskDir('999-codex-b', 'codex', 'gpt-5.6-sol');

    // A: patch runs against the pristine raw content (as today).
    patchResultUsageFromEnvelope(tasksDirA, '999-codex-a', 'gpt-5.6-sol', CODEX_FIXTURE_LINES);
    // B: the .log ALSO gets normalized (this task's fix) — patch still reads the
    // SAME pristine variable, never the now-normalized disk file.
    writeNormalizedDockerLog(join(tasksDirB, 'task-999-codex-b.log'), CODEX_FIXTURE_LINES, 'codex');
    patchResultUsageFromEnvelope(tasksDirB, '999-codex-b', 'gpt-5.6-sol', CODEX_FIXTURE_LINES);

    const a = JSON.parse(readFileSync(join(tasksDirA, 'task-999-codex-a.result'), 'utf-8')) as { tokenUsage: Record<string, unknown> };
    const b = JSON.parse(readFileSync(join(tasksDirB, 'task-999-codex-b.result'), 'utf-8')) as { tokenUsage: Record<string, unknown> };
    expect(b.tokenUsage.inputTokens).toBe(a.tokenUsage.inputTokens);
    expect(b.tokenUsage.outputTokens).toBe(a.tokenUsage.outputTokens);
  });
});

// ─── (4) token-counter.ts tier-2 LogEvent-aware nested usage ────────────────

describe('tier-2 (tryLoadCliLogTokens) LogEvent-aware nested usage — nihai-sayı pin', () => {
  const CLAUDE_USAGE = { input_tokens: 1200, output_tokens: 340, cache_read_input_tokens: 500, cache_creation_input_tokens: 50 };
  const CLAUDE_STREAM_FIXTURE = [
    JSON.stringify({ type: 'system', subtype: 'init' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
    JSON.stringify({ type: 'result', subtype: 'success', result: 'done', usage: CLAUDE_USAGE }),
  ].join('\n') + '\n';

  it('finds usage nested under a LogEvent row .content — matches the pristine top-level extraction exactly', () => {
    const root = makeRoot();
    const oldStyleLog = JSON.stringify({ type: 'result', subtype: 'success', result: 'done', usage: CLAUDE_USAGE });
    writeRawLog(root, '999-tier2-old', oldStyleLog);
    const oldResult = tryLoadCliLogTokens(root, '999-tier2-old');
    expect(oldResult).not.toBeNull();

    const logPath = join(root, '.tasks', 'task-999-tier2-new.log');
    writeNormalizedDockerLog(logPath, CLAUDE_STREAM_FIXTURE, 'claude');
    const newResult = tryLoadCliLogTokens(root, '999-tier2-new');

    expect(newResult).not.toBeNull();
    expect(newResult!.inputTokens).toBe(oldResult!.inputTokens);
    expect(newResult!.outputTokens).toBe(oldResult!.outputTokens);
    expect(newResult!.cacheReadTokens).toBe(oldResult!.cacheReadTokens);
    expect(newResult!.cacheCreationTokens).toBe(oldResult!.cacheCreationTokens);

    expect(newResult!.inputTokens).toBe(1200);
    expect(newResult!.outputTokens).toBe(340);
    expect(newResult!.cacheReadTokens).toBe(500);
    expect(newResult!.cacheCreationTokens).toBe(50);
  });

  it('false-positive guard: a LogEvent row wrapping CODEX-shaped nested usage is NOT misattributed as claude', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-tier2-codex.log');
    // codex's turn.completed shares input_tokens/output_tokens naming with claude
    // but uses cached_input_tokens (no cache_read_input_tokens / cache_creation_input_tokens).
    writeNormalizedDockerLog(logPath, CODEX_FIXTURE_LINES, 'codex');

    const result = tryLoadCliLogTokens(root, '999-tier2-codex');
    expect(result).toBeNull();
  });

  it('gemini-shaped nested usageMetadata (entirely different field names) is never matched by tier-2', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-tier2-gemini.log');
    writeNormalizedDockerLog(logPath, GEMINI_COMPACT_FIXTURE, 'gemini');

    const result = tryLoadCliLogTokens(root, '999-tier2-gemini');
    expect(result).toBeNull();
  });

  it('returns null (safe miss) when no candidate file exists', () => {
    const root = makeRoot();
    expect(tryLoadCliLogTokens(root, 'missing-999')).toBeNull();
  });
});
