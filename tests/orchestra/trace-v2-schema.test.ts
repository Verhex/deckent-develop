// tests/orchestra/trace-v2-schema.test.ts
// TT552 (417-003) TRACE-V2 — the sprint-worker trace is made SFT-usable.
//
// RED-kanıt: the SAME LogEvent fixture, mapped by the v1 builder
// (`toSprintTrainingExample`, no `traceV2`), reproduces every documented
// SFT defect — telemetry-as-assistant noise, empty `tool_call_id` orphans
// (403-001), the tool call double-represented as raw JSON in `content`, and
// ZERO system/user turns (no prompt).
//
// GREEN: the same fixture through the v2 projection (`traceV2` + injected
// prompt) yields a clean training record — prompt injected as system/user,
// telemetry split into the `telemetry` sidecar (out of `messages`), native
// `tool_calls` with a MATCHED `tool_call_id`, source seq/ts carried, and the
// Read double-representation unified. Incomplete/promptless records are
// quarantined, and the OLD reader (training/pipeline.ts) round-trips a v2
// record unchanged (dual-read) while the pipeline holds quarantined /
// envelope-fallback records OUT of the corpus.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LogEvent } from '../../src/core/log-event.js';
import {
  toSprintTrainingExample,
  toSprintTrainingExampleV2,
  type SprintTraceMeta,
} from '../../src/agent/trace-recorder.js';
import {
  projectTranscript,
  splitWorkerPrompt,
  loadWorkerPromptMeta,
  TRACE_SCHEMA_VERSION,
} from '../../src/core/trace-schema.js';
import {
  parseTraceLine,
  convertToShareGpt,
  isValidShareGptExample,
  isCorpusExcluded,
  runPipeline,
  type LineSink,
} from '../../src/training/pipeline.js';
import { OutputCollector } from '../../src/core/output-collector.js';
import { recordSprintWorkerTrace, sprintTraceFilePath } from '../../src/orchestra/output-collector.js';
import { readFileSync } from 'node:fs';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const SECRET = 'sk-abcdefghijklmnopqrstuvwxyz012345';

// ─── Shared fixture: a realistic Claude stream-json normalized LogEvent run ───
// 6 events = 3 raw-stream telemetry (lifecycle/turn/usage) + 3 conversation
// (text / tool_use / tool_result). The tool_use id `toolu_1` is echoed by the
// tool_result's `tool_use_id` — a matchable pair the v1 mapping threw away.
const EVENTS: LogEvent[] = [
  { ts: '2026-07-11T00:00:01.000Z', seq: 1, type: 'lifecycle', content: { type: 'system', subtype: 'init', session_id: 'abc' } },
  { ts: '2026-07-11T00:00:02.000Z', seq: 2, type: 'turn', content: { type: 'message_start' } },
  { ts: '2026-07-11T00:00:03.000Z', seq: 3, type: 'text', content: { type: 'assistant', message: { content: [{ type: 'text', text: 'Reading the file now.' }] } } },
  { ts: '2026-07-11T00:00:04.000Z', seq: 4, type: 'tool_use', content: { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { path: 'x.ts' } }] } } },
  { ts: '2026-07-11T00:00:05.000Z', seq: 5, type: 'tool_result', content: { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: `file body ${SECRET}` }] } } },
  { ts: '2026-07-11T00:00:06.000Z', seq: 6, type: 'usage', content: { type: 'result', subtype: 'success', result: 'done', usage: { input_tokens: 1, output_tokens: 1 } } },
];

const SYSTEM_PROMPT = 'You are a Deckent worker agent.\nSee WORKER-GUIDE.md for the contract.';
const TASK_PROMPT = '## Your Task\n417-003: implement the thing\n- Model: opus';

const baseMeta = (over: Partial<SprintTraceMeta> = {}): SprintTraceMeta => ({
  taskId: '417-777',
  sprintId: 'sprint-417',
  agent: 'refactorer',
  model: 'opus',
  selfAssessment: 'DONE',
  ts: '2026-07-11T00:00:07.000Z',
  ...over,
});

// ─── RED-kanıt: the current v1 format IS SFT-unusable ────────────────────────

describe('RED-kanıt: v1 toSprintTrainingExample reproduces the SFT defects', () => {
  const v1 = toSprintTrainingExample(EVENTS, baseMeta());

  it('telemetry NOISE leaks in: every one of the 6 events becomes a message', () => {
    expect(v1.messages).toHaveLength(6);
    // lifecycle/turn/usage telemetry rendered as assistant messages (the ~66% noise).
    const assistantRawTypes = v1.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content);
    expect(assistantRawTypes.some((c) => c.includes('"subtype":"init"'))).toBe(true);
    expect(assistantRawTypes.some((c) => c.includes('"type":"result"'))).toBe(true);
  });

  it('ORPHAN class: the tool_result carries an EMPTY tool_call_id (403-001)', () => {
    const toolMsg = v1.messages.find((m) => m.role === 'tool')!;
    expect(toolMsg.tool_call_id).toBe('');
  });

  it('NO native tool_calls: the tool_use is double-represented as raw JSON in content', () => {
    const hasNativeCall = v1.messages.some((m) => Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
    expect(hasNativeCall).toBe(false);
    const embedsRawCall = v1.messages.some((m) => m.role === 'assistant' && m.content.includes('"type":"tool_use"'));
    expect(embedsRawCall).toBe(true);
  });

  it('PROMPT absent: zero system/user turns', () => {
    expect(v1.messages.some((m) => m.role === 'system')).toBe(false);
    expect(v1.messages.some((m) => m.role === 'user')).toBe(false);
  });

  it('v1 is untouched: no schemaVersion, no telemetry sidecar (byte-identical to pre-TT552)', () => {
    expect(v1.schemaVersion).toBeUndefined();
    expect(v1.telemetry).toBeUndefined();
    expect('quarantine' in v1.meta).toBe(false);
  });
});

// ─── GREEN: the v2 projection is clean, from the SAME fixture ─────────────────

describe('GREEN: v2 projection produces a clean, SFT-usable record', () => {
  const v2 = toSprintTrainingExampleV2(EVENTS, baseMeta({ systemPrompt: SYSTEM_PROMPT, taskPrompt: TASK_PROMPT }));

  it('schemaVersion:2 is stamped top-level AND in meta (dual-read discriminator)', () => {
    expect(v2.schemaVersion).toBe(TRACE_SCHEMA_VERSION);
    expect(v2.meta.schemaVersion).toBe(TRACE_SCHEMA_VERSION);
    expect(TRACE_SCHEMA_VERSION).toBe(2);
  });

  it('PROMPT injected: system + user turns lead the conversation', () => {
    expect(v2.messages[0]).toMatchObject({ role: 'system', content: SYSTEM_PROMPT });
    expect(v2.messages[1]).toMatchObject({ role: 'user', content: TASK_PROMPT });
  });

  it('TELEMETRY-SIDECAR ↔ PROJECTION split: telemetry is OUT of messages, in the sidecar', () => {
    // 5 messages = system + user + assistant(text) + assistant(tool_call) + tool.
    expect(v2.messages).toHaveLength(5);
    // No raw telemetry envelope survives in any message content.
    for (const m of v2.messages) {
      expect(m.content).not.toContain('"subtype":"init"');
      expect(m.content).not.toContain('"type":"result"');
      expect(m.content).not.toContain('"type":"message_start"');
    }
    // The sidecar retains the 3 telemetry events (seq/ts/type only).
    expect(v2.telemetry).toHaveLength(3);
    expect(v2.telemetry!.map((t) => t.type).sort()).toEqual(['lifecycle', 'turn', 'usage']);
    expect(v2.telemetry!.map((t) => t.seq).sort((a, b) => a - b)).toEqual([1, 2, 6]);
  });

  it('REAL tool_calls: native call + MATCHED tool_call_id (orphan class dead)', () => {
    const assistantCall = v2.messages.find((m) => m.role === 'assistant' && m.tool_calls)!;
    expect(assistantCall.tool_calls).toEqual([
      { id: 'toolu_1', type: 'function', function: { name: 'Read', arguments: '{"path":"x.ts"}' } },
    ]);
    const toolMsg = v2.messages.find((m) => m.role === 'tool')!;
    expect(toolMsg.tool_call_id).toBe('toolu_1'); // matches the tool_use id — NOT ''
  });

  it('Read double-representation UNIFIED: the call is not re-embedded as JSON in content', () => {
    const assistantCall = v2.messages.find((m) => m.role === 'assistant' && m.tool_calls)!;
    expect(assistantCall.content).not.toContain('"type":"tool_use"');
    expect(assistantCall.content).toBe(''); // no accompanying text in that event
  });

  it('source ts/seq CARRIED (not dropped) onto the projected messages', () => {
    const textMsg = v2.messages.find((m) => m.role === 'assistant' && m.content === 'Reading the file now.')!;
    expect(textMsg.seq).toBe(3);
    expect(textMsg.ts).toBe('2026-07-11T00:00:03.000Z');
  });

  it('secrets REDACTED before they reach a message', () => {
    const toolMsg = v2.messages.find((m) => m.role === 'tool')!;
    expect(toolMsg.content).not.toContain(SECRET);
    expect(toolMsg.content).toContain('[REDACTED]');
  });

  it('clean record is NOT quarantined (prompt present, ids matched)', () => {
    expect('quarantine' in v2.meta).toBe(false);
  });
});

// ─── INCOMPLETE-QUARANTINE: promptless / orphan records are corpus-OUT ───────

describe('quarantine stamp: incomplete records are stamped corpus-OUT', () => {
  it('promptless transcript → no-prompt reason + meta.quarantine', () => {
    const proj = projectTranscript(EVENTS); // no prompt
    expect(proj.quarantineReasons).toContain('no-prompt');
    const v2 = toSprintTrainingExampleV2(EVENTS, baseMeta()); // no systemPrompt/taskPrompt
    expect(v2.meta.quarantine).toBe(true);
    expect(v2.meta.quarantineReasons).toContain('no-prompt');
  });

  it('orphan tool_result (no originating tool_use) → orphan-tool-result reason', () => {
    const orphanEvents: LogEvent[] = [
      { ts: 'T', seq: 1, type: 'tool_result', content: { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'ghost', content: 'x' }] } } },
    ];
    const proj = projectTranscript(orphanEvents, { system: 'S', task: 'T' });
    expect(proj.quarantineReasons).toContain('orphan-tool-result');
  });

  it('conversation-empty transcript → no-conversation reason', () => {
    const proj = projectTranscript([], { system: 'S', task: 'T' });
    expect(proj.quarantineReasons).toContain('no-conversation');
  });
});

// ─── Prompt inject from the REAL .tasks archive ──────────────────────────────

describe('prompt-inject gerçek-arşivden: loadWorkerPromptMeta', () => {
  const COMPILED = `${SYSTEM_PROMPT}\n\n${TASK_PROMPT}`;

  it('splitWorkerPrompt cuts at the `## Your Task` seam', () => {
    expect(splitWorkerPrompt(COMPILED)).toEqual({ system: SYSTEM_PROMPT, task: TASK_PROMPT });
  });

  it('reads a LIVE .tasks/.prompt-<taskId>-<hash>.txt and splits it', () => {
    const root = mkdtempSync(join(tmpdir(), 'trace-v2-')); dirs.push(root);
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, '.prompt-417-001-abcd.txt'), COMPILED, 'utf-8');

    expect(loadWorkerPromptMeta(tasksDir, '417-001')).toEqual({
      systemPrompt: SYSTEM_PROMPT,
      taskPrompt: TASK_PROMPT,
    });
  });

  it('reads an ARCHIVED prompt under .tasks/archive/sprint-<id>/', () => {
    const root = mkdtempSync(join(tmpdir(), 'trace-v2-')); dirs.push(root);
    const archiveDir = join(root, '.tasks', 'archive', 'sprint-417');
    mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, '.prompt-417-002-ef01.txt'), COMPILED, 'utf-8');

    expect(loadWorkerPromptMeta(join(root, '.tasks'), '417-002').taskPrompt).toBe(TASK_PROMPT);
  });

  it('preferFix disambiguates original vs -fix prompt for the SAME taskId', () => {
    const root = mkdtempSync(join(tmpdir(), 'trace-v2-')); dirs.push(root);
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, '.prompt-417-003-aa.txt'), `ORIG\n\n${TASK_PROMPT}`, 'utf-8');
    writeFileSync(join(tasksDir, '.prompt-417-003-bb-fix.txt'), `FIXED\n\n${TASK_PROMPT}`, 'utf-8');

    expect(loadWorkerPromptMeta(tasksDir, '417-003', { preferFix: false }).systemPrompt).toBe('ORIG');
    expect(loadWorkerPromptMeta(tasksDir, '417-003', { preferFix: true }).systemPrompt).toBe('FIXED');
  });

  it('missing prompt → {} (→ the v2 builder stamps no-prompt quarantine)', () => {
    const root = mkdtempSync(join(tmpdir(), 'trace-v2-')); dirs.push(root);
    mkdirSync(join(root, '.tasks'), { recursive: true });
    expect(loadWorkerPromptMeta(join(root, '.tasks'), 'nope')).toEqual({});
  });
});

// ─── Dual-read: the OLD reader round-trips a v2 record; corpus gate ──────────

describe('schemaVersion + dual-read: old reader (pipeline) handles v1 AND v2', () => {
  const v2 = toSprintTrainingExampleV2(EVENTS, baseMeta({ systemPrompt: SYSTEM_PROMPT, taskPrompt: TASK_PROMPT }));

  it('the UNCHANGED convertToShareGpt projects a v2 record into valid ShareGPT', () => {
    const line = JSON.stringify(v2);
    const parsed = parseTraceLine(line);
    expect(parsed).not.toBeNull();

    const share = convertToShareGpt(parsed!);
    expect(isValidShareGptExample(share)).toBe(true);
    // system → top-level; user → human; tool_use → function_call; tool_result → observation.
    expect(share.system).toBe(SYSTEM_PROMPT);
    expect(share.conversations.map((c) => c.from)).toEqual(['human', 'gpt', 'function_call', 'observation']);
    // No telemetry ever reaches the training projection.
    const blob = JSON.stringify(share);
    expect(blob).not.toContain('"subtype":"init"');
    expect(blob).not.toContain('message_start');
  });

  it('a v1 record still converts (old reader unbroken)', () => {
    const v1 = toSprintTrainingExample(EVENTS, baseMeta());
    const share = convertToShareGpt(v1);
    expect(isValidShareGptExample(share)).toBe(true);
  });

  it('isCorpusExcluded flags quarantine + envelope-fallback, passes clean records', () => {
    const quarantined = toSprintTrainingExampleV2(EVENTS, baseMeta()); // promptless → quarantined
    expect(isCorpusExcluded(quarantined)).toBe(true);
    expect(isCorpusExcluded({ messages: [], meta: { contentSource: 'envelope-fallback' } })).toBe(true);
    expect(isCorpusExcluded(v2)).toBe(false);
  });
});

describe('runPipeline holds quarantined + envelope-fallback records OUT of the corpus', () => {
  it('skips (and counts) incomplete records; only clean records are written', async () => {
    const clean = toSprintTrainingExampleV2(EVENTS, baseMeta({ systemPrompt: SYSTEM_PROMPT, taskPrompt: TASK_PROMPT }));
    const quarantined = toSprintTrainingExampleV2(EVENTS, baseMeta()); // no prompt → quarantine
    const envelope = { messages: [{ role: 'assistant', content: 'done' }], meta: { source: 'sprint-worker', model: 'm', ts: 'T', contentSource: 'envelope-fallback' } };
    const legacyV1 = toSprintTrainingExample(EVENTS, baseMeta());

    const inputLines = [clean, quarantined, envelope, legacyV1].map((r) => JSON.stringify(r));
    const out: string[] = [];
    const sink: LineSink = { write: (l) => out.push(l), close: () => Promise.resolve() };

    const summary = await runPipeline({
      inputPath: 'in.jsonl',
      outputPath: 'out.jsonl',
      openLines: () => (async function* () { for (const l of inputLines) yield l; })(),
      openSink: () => sink,
    });

    expect(summary.linesRead).toBe(4);
    expect(summary.examplesWritten).toBe(2);      // clean v2 + legacy v1
    expect(summary.quarantinedSkipped).toBe(2);   // quarantined v2 + envelope-fallback
    expect(summary.skippedMalformed).toBe(0);

    // The quarantined record's promptless content never reached the output.
    const outBlob = out.join('\n');
    expect(outBlob).not.toContain('"subtype":"init"');
    expect(out).toHaveLength(2);
  });
});

// ─── LIVE SEAM (Proof-of-Function): the production recording path emits v2 ────
// Drives the REAL wire sprint-phases.ts uses — recordSprintWorkerTrace (in the
// unchanged output-collector.ts) with `traceV2:true` + the prompt spread from
// the on-disk archive — through to a schemaVersion:2 line in sprint-worker.jsonl.
describe('LIVE seam: recordSprintWorkerTrace(traceV2 + archived prompt) writes a v2 record', () => {
  it('emits schemaVersion:2 with injected prompt, matched tool_call_id, and telemetry sidecar', () => {
    const root = mkdtempSync(join(tmpdir(), 'trace-v2-live-')); dirs.push(root);
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'task-417-900.log'), EVENTS.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
    writeFileSync(join(tasksDir, '.prompt-417-900-deadbeef.txt'), `${SYSTEM_PROMPT}\n\n${TASK_PROMPT}`, 'utf-8');

    const collector = new OutputCollector(root);
    // Mirror sprint-phases.ts EVALUATE call-site exactly (traceV2 + prompt spread).
    recordSprintWorkerTrace({
      enabled: true,
      projectRoot: root,
      collector,
      meta: {
        taskId: '417-900',
        sprintId: 'sprint-417',
        agent: 'refactorer',
        model: 'opus',
        selfAssessment: 'DONE',
        ts: '2026-07-11T00:00:07.000Z',
        traceV2: true,
        ...loadWorkerPromptMeta(tasksDir, '417-900', { preferFix: false }),
      },
    });

    const written = JSON.parse(readFileSync(sprintTraceFilePath(root), 'utf-8').trim()) as {
      schemaVersion?: number;
      telemetry?: unknown[];
      messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }>;
      meta: Record<string, unknown>;
    };

    expect(written.schemaVersion).toBe(2);
    expect(written.meta.schemaVersion).toBe(2);
    expect(written.messages[0]).toMatchObject({ role: 'system', content: SYSTEM_PROMPT });
    expect(written.messages[1]).toMatchObject({ role: 'user', content: TASK_PROMPT });
    expect(written.messages.find((m) => m.role === 'tool')!.tool_call_id).toBe('toolu_1');
    expect(written.messages.some((m) => Array.isArray(m.tool_calls) && m.tool_calls.length > 0)).toBe(true);
    expect(written.telemetry).toHaveLength(3);
    expect('quarantine' in written.meta).toBe(false);

    collector.dispose();
  });
});
