// tests/orchestra/trace-content-parity.test.ts
// born-637 (402-002 TRACE-CONTENT-PARITY): docker-backend trace-content channel.
//
// RED-kanit: sprint-401 canlı-kanıt — docker backend's claude CLI ran with
// `--output-format json` (ONE final envelope) → the raw envelope was dumped
// verbatim to `.tasks/task-<id>.log` → `OutputCollector.readLogEvents`
// (LogEvent contract: {ts,seq,type,content}) skipped every line → 0 events →
// `recordSprintWorkerTrace` wrote a `messages:[]` trace entry.
//
// FIX 1 (envelope-fallback, safe baseline): when 0 LogEvent rows are found,
// `recordSprintWorkerTrace` now falls back to a minimal single-message
// reconstruction parsed out of the CLI's final result envelope.
//
// FIX 2 (docker stream-port, claude-scoped): the docker container's claude CLI
// now runs `--output-format stream-json` (claudeStreamJsonBaseArgs) and its
// captured docker-logs output is normalize-written into the LogEvent JSONL
// contract (writeNormalizedDockerLog), so the FAST (non-fallback) path lights
// up for real. patchResultUsageFromEnvelope keeps reading the pristine
// logContent, so real token-usage numbers are provably unchanged across both
// formats (the usage-patch regression fixture below).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OutputCollector } from '../../src/core/output-collector.js';
import { recordSprintWorkerTrace, sprintTraceFilePath } from '../../src/orchestra/output-collector.js';
import { toSprintTrainingExample } from '../../src/agent/trace-recorder.js';
import {
  writeNormalizedDockerLog,
  claudeStreamJsonBaseArgs,
  patchResultUsageFromEnvelope,
} from '../../src/orchestra/spawn-backend-docker.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'trace-parity-'));
  dirs.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function writeLog(root: string, taskId: string, content: string): void {
  writeFileSync(join(root, '.tasks', `task-${taskId}.log`), content, 'utf-8');
}

const ENVELOPE_RESULT_TEXT = 'Implemented the fix and verified with targeted tests.';

/** The docker/tmux dump BEFORE this fix: one `--output-format json` envelope. */
const ENVELOPE_ONLY_LOG = JSON.stringify({
  type: 'result',
  subtype: 'success',
  result: ENVELOPE_RESULT_TEXT,
  usage: {
    input_tokens: 1200,
    output_tokens: 340,
    cache_read_input_tokens: 500,
    cache_creation_input_tokens: 50,
  },
  model: 'claude-opus-4-8',
}) + '\n';

const baseMeta = (taskId: string) => ({
  taskId,
  sprintId: 'sprint-402',
  agent: 'worker',
  model: 'claude-sonnet-5',
  selfAssessment: 'DONE',
  ts: '2026-07-11T00:00:00.000Z',
});

// ─── RED-kanıt: pre-fix davranış ─────────────────────────────────────────────

describe('RED-kanıt: envelope-only .log -> pre-fix davranış (sprint-401 canlı-kanıt)', () => {
  it('readLogEvents 0 event döndürür (LogEvent contract: envelope satırında ts/seq/type/content yok)', () => {
    const root = makeRoot();
    writeLog(root, '999-red', ENVELOPE_ONLY_LOG);
    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-red');
    expect(events).toHaveLength(0);
    collector.dispose();
  });

  it('toSprintTrainingExample([], meta) -> messages: [] (bu, sprint-worker.jsonl\'de görülen buğ)', () => {
    const example = toSprintTrainingExample([], baseMeta('999-red'));
    expect(example.messages).toHaveLength(0);
  });
});

// ─── FIX 1: envelope-fallback ────────────────────────────────────────────────

describe('FIX 1 — envelope-fallback (safe baseline)', () => {
  it('events.length===0 + envelope .log mevcut -> fallback tek assistant-message üretir + contentSource etiketi', () => {
    const root = makeRoot();
    writeLog(root, '999-fb', ENVELOPE_ONLY_LOG);
    const collector = new OutputCollector(root);

    recordSprintWorkerTrace({
      enabled: true,
      projectRoot: root,
      collector,
      meta: baseMeta('999-fb'),
    });

    const file = sprintTraceFilePath(root);
    expect(existsSync(file)).toBe(true);
    const written = JSON.parse(readFileSync(file, 'utf-8').trim()) as {
      messages: Array<{ role: string; content: string }>;
      meta: Record<string, unknown>;
    };

    expect(written.messages).toHaveLength(1);
    expect(written.messages[0]!.role).toBe('assistant');
    expect(written.messages[0]!.content).toBe(ENVELOPE_RESULT_TEXT);
    expect(written.meta.contentSource).toBe('envelope-fallback');
    expect(written.meta).toMatchObject({ taskId: '999-fb', sprintId: 'sprint-402', selfAssessment: 'DONE' });

    collector.dispose();
  });

  it('redaction: envelope.result içindeki secret [REDACTED] olur (unit + redaction testi)', () => {
    const root = makeRoot();
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz012345';
    const log = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: `here is my key ${secret}`,
      usage: { input_tokens: 10, output_tokens: 5 },
    }) + '\n';
    writeLog(root, '999-redact', log);
    const collector = new OutputCollector(root);

    recordSprintWorkerTrace({
      enabled: true,
      projectRoot: root,
      collector,
      meta: baseMeta('999-redact'),
    });

    const writtenRaw = readFileSync(sprintTraceFilePath(root), 'utf-8');
    expect(writtenRaw).not.toContain(secret);
    expect(writtenRaw).toContain('[REDACTED]');

    collector.dispose();
  });

  it('ne .log ne recoverable envelope varsa -> hiçbir trace satırı yazılmaz (messages:[] YERİNE no-op)', () => {
    const root = makeRoot();
    // No .log file at all.
    const collector = new OutputCollector(root);

    recordSprintWorkerTrace({
      enabled: true,
      projectRoot: root,
      collector,
      meta: baseMeta('999-missing'),
    });

    expect(existsSync(sprintTraceFilePath(root))).toBe(false);
    collector.dispose();
  });

  it('garbage .log (JSON değil) -> no-op', () => {
    const root = makeRoot();
    writeLog(root, '999-garbage', 'not json at all\njust plain worker stdout\n');
    const collector = new OutputCollector(root);

    recordSprintWorkerTrace({
      enabled: true,
      projectRoot: root,
      collector,
      meta: baseMeta('999-garbage'),
    });

    expect(existsSync(sprintTraceFilePath(root))).toBe(false);
    collector.dispose();
  });

  it('fast-path korunur: geçerli LogEvent akışı varken fallback DEVREYE GİRMEZ, contentSource yok', () => {
    const root = makeRoot();
    const events = [
      { ts: '2026-07-11T00:00:00.000Z', seq: 1, type: 'turn', content: { note: 'start' } },
      { ts: '2026-07-11T00:00:01.000Z', seq: 2, type: 'text', content: 'hello' },
    ];
    writeLog(root, '999-fast', events.map((e) => JSON.stringify(e)).join('\n') + '\n');
    const collector = new OutputCollector(root);

    recordSprintWorkerTrace({
      enabled: true,
      projectRoot: root,
      collector,
      meta: baseMeta('999-fast'),
    });

    const written = JSON.parse(readFileSync(sprintTraceFilePath(root), 'utf-8').trim()) as {
      messages: unknown[];
      meta: Record<string, unknown>;
    };
    expect(written.messages).toHaveLength(2);
    expect('contentSource' in written.meta).toBe(false);

    collector.dispose();
  });
});

// ─── FIX 2: docker stream-port ───────────────────────────────────────────────

describe('FIX 2 — claudeStreamJsonBaseArgs (docker-local override)', () => {
  it('claude baseArgs: --output-format json -> stream-json + --verbose eklenir', () => {
    expect(claudeStreamJsonBaseArgs(['-p', '-', '--output-format', 'json']))
      .toEqual(['-p', '-', '--output-format', 'stream-json', '--verbose']);
  });

  it('--output-format json yoksa/farklıysa değişmez (no-op, shallow copy)', () => {
    expect(claudeStreamJsonBaseArgs(['exec', '--skip-git-repo-check', '--json']))
      .toEqual(['exec', '--skip-git-repo-check', '--json']);
    expect(claudeStreamJsonBaseArgs(['-p', '{PROMPT_CAT}', '--output-format', 'json']))
      .toEqual(['-p', '{PROMPT_CAT}', '--output-format', 'stream-json', '--verbose']);
  });

  it('paylaşılan spec dizisini MUTATE etmez (shared PROVIDER_COMMAND_SPECS korunur)', () => {
    const original = ['-p', '-', '--output-format', 'json'] as const;
    const result = claudeStreamJsonBaseArgs(original);
    expect(original).toEqual(['-p', '-', '--output-format', 'json']);
    expect(result).not.toBe(original);
  });
});

describe('FIX 2 — writeNormalizedDockerLog (docker-capture normalizasyonu)', () => {
  const STREAM_JSON_FIXTURE = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'abc' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }),
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: ENVELOPE_RESULT_TEXT,
      usage: { input_tokens: 1200, output_tokens: 340, cache_read_input_tokens: 500, cache_creation_input_tokens: 50 },
    }),
  ].join('\n') + '\n';

  it('stream-json NDJSON fixture -> her satır bir LogEvent (ts/seq/type/content) olarak yazılır', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-stream.log');

    const written = writeNormalizedDockerLog(logPath, STREAM_JSON_FIXTURE, 'claude');
    expect(written).toBe(5);
    expect(existsSync(logPath)).toBe(true);

    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-stream');
    expect(events).toHaveLength(5);
    expect(events.every((e) => typeof e.ts === 'string' && typeof e.seq === 'number')).toBe(true);
    expect(events[2]!.type).toBe('tool_use');
    expect(events[3]!.type).toBe('tool_result');
    expect(events[4]!.type).toBe('usage'); // final result envelope carries usage
    collector.dispose();
  });

  it('malformed / plain-text satır asla drop edilmez (normalizeStreamEvent text-fallback)', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-mixed.log');
    const mixed = 'not json at all\n' + JSON.stringify({ type: 'result', usage: { input_tokens: 1, output_tokens: 1 } }) + '\n';

    const written = writeNormalizedDockerLog(logPath, mixed, 'claude');
    expect(written).toBe(2);

    const collector = new OutputCollector(root);
    const events = collector.readLogEvents('999-mixed');
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('text');
    expect(events[1]!.type).toBe('usage');
    collector.dispose();
  });

  it('boş satırlar atlanır (NDJSON inter-record whitespace)', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-blank.log');
    const withBlanks = '\n\n' + JSON.stringify({ type: 'text', content: 'hi' }) + '\n\n\n';

    const written = writeNormalizedDockerLog(logPath, withBlanks, 'claude');
    expect(written).toBe(1);
  });

  it('uçtan-uca: normalize-yazılmış stream-json .log -> recordSprintWorkerTrace FAST-path (fallback DEVRE DIŞI)', () => {
    const root = makeRoot();
    const logPath = join(root, '.tasks', 'task-999-e2e.log');
    writeNormalizedDockerLog(logPath, STREAM_JSON_FIXTURE, 'claude');

    const collector = new OutputCollector(root);
    recordSprintWorkerTrace({
      enabled: true,
      projectRoot: root,
      collector,
      meta: baseMeta('999-e2e'),
    });

    const written = JSON.parse(readFileSync(sprintTraceFilePath(root), 'utf-8').trim()) as {
      messages: unknown[];
      meta: Record<string, unknown>;
    };
    expect(written.messages.length).toBe(5);
    expect('contentSource' in written.meta).toBe(false); // NOT envelope-fallback — real transcript

    collector.dispose();
  });
});

describe('FIX 2 — usage-patch regresyon: MEVCUT token-usage sayıları korunur (json vs stream-json)', () => {
  const USAGE = { input_tokens: 1200, output_tokens: 340, cache_read_input_tokens: 500, cache_creation_input_tokens: 50 };

  const OLD_SINGLE_ENVELOPE_LOG = JSON.stringify({
    type: 'result',
    subtype: 'success',
    result: ENVELOPE_RESULT_TEXT,
    usage: USAGE,
  });

  const NEW_STREAM_JSON_LOG = [
    JSON.stringify({ type: 'system', subtype: 'init' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
    JSON.stringify({ type: 'result', subtype: 'success', result: ENVELOPE_RESULT_TEXT, usage: USAGE }),
  ].join('\n');

  function makeTaskDir(taskId: string): string {
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
          provider: 'claude',
          model: 'claude-sonnet-5',
        },
      }),
      'utf-8',
    );
    return join(root, '.tasks');
  }

  it('eski single-envelope formatı ile yeni stream-json formatı BİREBİR aynı .result.tokenUsage üretir', () => {
    const oldTasksDir = makeTaskDir('999-usage-old');
    const newTasksDir = makeTaskDir('999-usage-new');

    patchResultUsageFromEnvelope(
      oldTasksDir,
      '999-usage-old',
      'claude-sonnet-5',
      OLD_SINGLE_ENVELOPE_LOG,
    );
    patchResultUsageFromEnvelope(
      newTasksDir,
      '999-usage-new',
      'claude-sonnet-5',
      NEW_STREAM_JSON_LOG,
    );

    const oldResult = JSON.parse(readFileSync(join(oldTasksDir, 'task-999-usage-old.result'), 'utf-8')) as {
      tokenUsage: Record<string, unknown>;
    };
    const newResult = JSON.parse(readFileSync(join(newTasksDir, 'task-999-usage-new.result'), 'utf-8')) as {
      tokenUsage: Record<string, unknown>;
    };

    expect(newResult.tokenUsage.inputTokens).toBe(oldResult.tokenUsage.inputTokens);
    expect(newResult.tokenUsage.outputTokens).toBe(oldResult.tokenUsage.outputTokens);
    expect(newResult.tokenUsage.cacheReadTokens).toBe(oldResult.tokenUsage.cacheReadTokens);
    expect(newResult.tokenUsage.cacheCreationTokens).toBe(oldResult.tokenUsage.cacheCreationTokens);

    // And both match the REAL numbers from the fixture (not just each other).
    expect(oldResult.tokenUsage.inputTokens).toBe(1200);
    expect(oldResult.tokenUsage.outputTokens).toBe(340);
    expect(oldResult.tokenUsage.cacheReadTokens).toBe(500);
    expect(oldResult.tokenUsage.cacheCreationTokens).toBe(50);
  });
});
