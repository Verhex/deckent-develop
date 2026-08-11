// tests/training/trn4-pipeline.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  convertToShareGpt,
  compressToolResults,
  truncateToolResult,
  redactShareGptExample,
  traceToShareGpt,
  isValidShareGptExample,
  parseTraceLine,
  parseTraceLineDetailed,
  normalizeContent,
  runPipeline,
  DEFAULT_TRUNCATION_POLICY,
  type TraceLike,
  type TruncationPolicy,
  type ShareGptExample,
  type LineSink,
  type CanonicalCorpusAuthority,
} from '../../src/training/pipeline.js';
import type { OpenAiMessage, TraceMeta } from '../../src/agent/trace-recorder.js';
import { migrateHistoricalTraces } from '../../src/training/historical-trace-migration.js';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function sys(content: string): OpenAiMessage {
  return { role: 'system', content };
}
function human(content: string): OpenAiMessage {
  return { role: 'user', content };
}
function toolResult(id: string, content: string): OpenAiMessage {
  return { role: 'tool', tool_call_id: id, content };
}
function gpt(content: string, toolCalls?: Array<{ id: string; name: string; args: unknown }>): OpenAiMessage {
  return {
    role: 'assistant',
    content,
    ...(toolCalls && toolCalls.length > 0
      ? { tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.args) } })) }
      : {}),
  };
}
function makeTrace(messages: OpenAiMessage[], meta?: Partial<TraceMeta>): TraceLike {
  return meta !== undefined ? { messages, meta } : { messages };
}

// ─── convertToShareGpt (converter + label-enrichment) ───────────────────────

describe('convertToShareGpt', () => {
  it('maps system -> top-level system, user -> human, assistant -> gpt, tool -> observation', () => {
    const trace = makeTrace([
      sys('SYSTEM PROMPT'),
      human('read x'),
      gpt('Reading.', [{ id: 't1', name: 'deckent_read_file', args: { file_path: 'x' } }]),
      toolResult('t1', 'BODY'),
      gpt('Done.'),
    ]);

    const example = convertToShareGpt(trace);

    expect(example.system).toBe('SYSTEM PROMPT');
    expect(example.conversations).toEqual([
      { from: 'human', value: 'read x' },
      { from: 'gpt', value: 'Reading.' },
      { from: 'function_call', value: JSON.stringify({ name: 'deckent_read_file', arguments: { file_path: 'x' } }) },
      { from: 'observation', value: 'BODY' },
      { from: 'gpt', value: 'Done.' },
    ]);
    expect(isValidShareGptExample(example)).toBe(true);
  });

  it('emits only function_call turns (no empty gpt turn) when assistant content is empty', () => {
    const trace = makeTrace([sys('S'), human('go'), gpt('', [{ id: 'a1', name: 'Agent', args: { task: 'go' } }])]);
    const example = convertToShareGpt(trace);
    expect(example.conversations.map((c) => c.from)).toEqual(['human', 'function_call']);
  });

  it('preserves order across multiple tool_calls in one assistant turn', () => {
    const trace = makeTrace([
      sys('S'),
      human('go'),
      gpt('', [
        { id: 'a', name: 'Read', args: { x: 1 } },
        { id: 'b', name: 'Write', args: { x: 2 } },
      ]),
    ]);
    const example = convertToShareGpt(trace);
    const calls = example.conversations.filter((c) => c.from === 'function_call');
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0]!.value)).toEqual({ name: 'Read', arguments: { x: 1 } });
    expect(JSON.parse(calls[1]!.value)).toEqual({ name: 'Write', arguments: { x: 2 } });
  });

  it('keeps a malformed tool_call arguments string as-is rather than dropping the call', () => {
    const trace = makeTrace([
      sys('S'),
      human('go'),
      { role: 'assistant', content: '', tool_calls: [{ id: 'x', type: 'function', function: { name: 'Bash', arguments: '{ not json' } }] },
    ]);
    const example = convertToShareGpt(trace);
    const call = example.conversations.find((c) => c.from === 'function_call')!;
    expect(JSON.parse(call.value)).toEqual({ name: 'Bash', arguments: '{ not json' });
  });

  it('enriches labels with outcome/agent/model when meta is present', () => {
    const trace = makeTrace([sys('S'), human('hi'), gpt('yo')], {
      source: 'sprint-worker',
      model: 'claude-sonnet-5',
      ts: '2026-07-01T00:00:00.000Z',
      agent: 'bug-fixer',
      selfAssessment: 'DONE',
    });
    const example = convertToShareGpt(trace);
    // TRN-PIPE-WIRE (358-009): outcome maps through mapTaskEvaluationToLabel — DONE → 'success'.
    expect(example.labels).toEqual({ outcome: 'success', agent: 'bug-fixer', model: 'claude-sonnet-5' });
  });

  it('omits labels entirely when meta is absent (TRN-3 aligned/general shape)', () => {
    const trace = makeTrace([sys('S'), human('hi'), gpt('yo')]);
    const example = convertToShareGpt(trace);
    expect(example.labels).toBeUndefined();
    expect('labels' in example).toBe(false);
  });

  it('includes only the fields present on a partial meta (model is always required)', () => {
    const trace = makeTrace([sys('S'), human('hi'), gpt('yo')], {
      source: 'native-repl',
      model: 'claude-opus-5',
      ts: '2026-07-01T00:00:00.000Z',
    });
    const example = convertToShareGpt(trace);
    expect(example.labels).toEqual({ model: 'claude-opus-5' });
  });
});

// ─── Compressor (tool-result truncation policy) ─────────────────────────────

describe('truncateToolResult / compressToolResults', () => {
  it('leaves content at or under the policy limit unchanged', () => {
    const content = 'x'.repeat(50);
    expect(truncateToolResult(content, { maxChars: 50 })).toBe(content);
  });

  it('truncates deterministically with a head+tail split and an omitted-count marker', () => {
    const content = 'A'.repeat(60) + 'B'.repeat(60); // 120 chars
    const policy: TruncationPolicy = { maxChars: 100 }; // head=70, tail=30
    const out = truncateToolResult(content, policy);

    expect(out.startsWith('A'.repeat(60) + 'B'.repeat(10))).toBe(true); // head[0:70) = 60 A's + 10 B's
    expect(out.endsWith('B'.repeat(30))).toBe(true); // tail = last 30 chars
    expect(out).toContain('[...20 chars omitted...]'); // 120 - 70 - 30 = 20 omitted
    expect(truncateToolResult(content, policy)).toBe(out); // deterministic — same input, same output
  });

  it('only compresses `observation` turns — human/gpt/function_call are left untouched even when huge', () => {
    const big = 'z'.repeat(10_000);
    const example: ShareGptExample = {
      conversations: [
        { from: 'human', value: big },
        { from: 'gpt', value: big },
        { from: 'function_call', value: big },
        { from: 'observation', value: big },
      ],
    };
    const { example: out, truncated } = compressToolResults(example, DEFAULT_TRUNCATION_POLICY);
    expect(truncated).toBe(true);
    expect(out.conversations[0]!.value).toBe(big);
    expect(out.conversations[1]!.value).toBe(big);
    expect(out.conversations[2]!.value).toBe(big);
    expect(out.conversations[3]!.value.length).toBeLessThan(big.length);
  });

  it('reports truncated=false when nothing needed compression', () => {
    const example: ShareGptExample = { conversations: [{ from: 'observation', value: 'short' }] };
    const { truncated } = compressToolResults(example, DEFAULT_TRUNCATION_POLICY);
    expect(truncated).toBe(false);
  });
});

// ─── Redaction (single pass + double-check proof) ───────────────────────────

describe('redactShareGptExample', () => {
  it('redacts secrets in turn values and in system', () => {
    const example: ShareGptExample = {
      system: 'token=' + 'a'.repeat(10),
      conversations: [{ from: 'human', value: 'Bearer ' + 'x'.repeat(30) }],
    };
    const { example: out, redacted } = redactShareGptExample(example);
    expect(redacted).toBe(true);
    expect(out.system).toContain('[REDACTED]');
    expect(out.conversations[0]!.value).toContain('[REDACTED]');
  });

  it('reports redacted=false when nothing needed redaction', () => {
    const example: ShareGptExample = { conversations: [{ from: 'human', value: 'hello world' }] };
    const { redacted } = redactShareGptExample(example);
    expect(redacted).toBe(false);
  });
});

describe('traceToShareGpt — redaction double-pass (çift-kontrol)', () => {
  const policy: TruncationPolicy = { maxChars: 100 }; // head=70, tail=30

  it('catches a secret that straddles the truncation boundary — proves the PRE-compression pass is required', () => {
    const junkHead = 'A'.repeat(59) + ' '; // ends on a word-boundary space, so the secret pattern can match
    const secret = 'sk-' + 'x'.repeat(25); // 28 chars, matches redactSensitive's sk- pattern (>=20 after prefix)
    const junkTail = ' ' + 'B'.repeat(61); // starts on a word-boundary space
    const observationValue = junkHead + secret + junkTail; // 150 chars > 100 -> triggers truncation
    expect(observationValue.length).toBeGreaterThan(policy.maxChars);

    const trace = makeTrace([
      sys('S'),
      human('go'),
      gpt('', [{ id: 't1', name: 'deckent_bash', args: {} }]),
      toolResult('t1', observationValue),
    ]);

    // Full double-pass pipeline: redact BEFORE compression catches the whole intact token.
    const result = traceToShareGpt(trace, policy);
    const observation = result.example.conversations.find((c) => c.from === 'observation')!;
    expect(observation.value).not.toContain('sk-');
    expect(observation.value).toContain('[REDACTED]');
    expect(result.redacted).toBe(true);

    // Reconstruct a single POST-compression-only pass: truncation splits the token
    // before the regex's required 20-char run completes, so a single pass run only
    // AFTER compression would leak a live, recognizable secret-prefix fragment.
    const { example: compressedOnly } = compressToolResults(convertToShareGpt(trace), policy);
    const { example: postOnly } = redactShareGptExample(compressedOnly);
    const postOnlyObservation = postOnly.conversations.find((c) => c.from === 'observation')!;
    expect(postOnlyObservation.value).toContain('sk-xxxxxxx');
  });

  it('exactly matches manually composing convert -> redact -> compress -> redact', () => {
    const trace = makeTrace(
      [sys('token=' + 'a'.repeat(15)), human('go'), gpt('Bearer ' + 'y'.repeat(30))],
      { source: 'native-repl', model: 'claude-sonnet-5', ts: '2026-07-01T00:00:00.000Z' },
    );

    const converted = convertToShareGpt(trace);
    const passA = redactShareGptExample(converted);
    const { example: compressed } = compressToolResults(passA.example, DEFAULT_TRUNCATION_POLICY);
    const passB = redactShareGptExample(compressed);

    const direct = traceToShareGpt(trace, DEFAULT_TRUNCATION_POLICY);
    expect(direct.example).toEqual(passB.example);
  });
});

// ─── Schema validator ────────────────────────────────────────────────────────

describe('isValidShareGptExample', () => {
  it('accepts a well-formed example (with and without optional fields)', () => {
    expect(isValidShareGptExample({ conversations: [] })).toBe(true);
    expect(
      isValidShareGptExample({
        conversations: [{ from: 'human', value: 'hi' }],
        system: 'S',
        labels: { outcome: 'DONE' },
      }),
    ).toBe(true);
  });

  it('rejects malformed shapes', () => {
    expect(isValidShareGptExample(null)).toBe(false);
    expect(isValidShareGptExample({})).toBe(false); // no conversations
    expect(isValidShareGptExample({ conversations: [{ from: 'bogus', value: 'x' }] })).toBe(false);
    expect(isValidShareGptExample({ conversations: [{ from: 'human', value: 1 }] })).toBe(false);
    expect(isValidShareGptExample({ conversations: [], system: 5 })).toBe(false);
    expect(isValidShareGptExample({ conversations: [], labels: 'nope' })).toBe(false);
  });
});

// ─── parseTraceLine ──────────────────────────────────────────────────────────

describe('parseTraceLine', () => {
  it('parses a valid trace line, meta included when present', () => {
    const line = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], meta: { source: 's', model: 'm', ts: 't' } });
    const parsed = parseTraceLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.messages).toHaveLength(1);
    expect(parsed!.meta).toEqual({ source: 's', model: 'm', ts: 't' });
  });

  it('omits the meta key when absent (TRN-3 shape)', () => {
    const line = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] });
    const parsed = parseTraceLine(line);
    expect(parsed).not.toBeNull();
    expect('meta' in parsed!).toBe(false);
  });

  it('returns null for malformed JSON or a missing messages array, without throwing', () => {
    expect(parseTraceLine('{ not json')).toBeNull();
    expect(parseTraceLine(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(parseTraceLine(JSON.stringify(null))).toBeNull();
  });
});

describe('structured canonical records', () => {
  it('normalizes structured content and preserves canonical provenance only in the versioned projection', () => {
    const trace = parseTraceLine(JSON.stringify({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'inspect the run' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'working' }], tool_calls: [{ id: 'c1', type: 'function', function: { name: 'Read', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: [{ type: 'text', text: 'tool result' }] },
      ],
      acceptedVerdict: 'DONE',
      acceptedVerdictAuthorityRef: '.tasks/task-515-003.result#brainEvaluation',
      duplicateWeight: 0,
      provenance: { taskId: '515-003', sprintId: '515', attemptId: 'a1', integrity: 'verified', disposition: 'auxiliary' },
      meta: { selfAssessment: 'NO_GO', model: 'model-a' },
    }))!;

    expect(normalizeContent([{ type: 'text', text: 'a' }, { type: 'image', id: 'b' }])).toBe('a\n{"type":"image","id":"b"}');
    const legacy = convertToShareGpt(trace);
    expect(legacy.provenance).toBeUndefined();
    expect(legacy.labels).toEqual({ outcome: 'failed', model: 'model-a' });
    const structured = convertToShareGpt(trace, 'structured-v2');
    expect(structured.provenance).toEqual(trace.provenance);
    expect(structured.weight).toBe(0);
    expect(structured.labels).toEqual({ outcome: 'success', workerClaim: 'NO_GO', model: 'model-a' });
    expect(structured.conversations).toContainEqual({ from: 'function_call', value: JSON.stringify({ name: 'Read', arguments: {} }), causalId: 'c1' });
    expect(structured.conversations).toContainEqual({ from: 'observation', value: 'tool result', causalId: 'c1' });
  });

  it('returns a typed parse rejection reason', () => {
    expect(parseTraceLineDetailed('{ nope')).toEqual({ ok: false, reason: 'MALFORMED_JSON' });
    expect(parseTraceLineDetailed('{}')).toEqual({ ok: false, reason: 'MISSING_MESSAGES' });
  });
});

// ─── runPipeline — streaming driver (memory-safe: line-in, line-out) ────────

/** Injectable line source from an in-memory array (hermetic — same pattern as core/limit-ledger.ts tests). */
function fakeOpenLines(map: Record<string, string[]>): (p: string) => AsyncIterable<string> {
  return (p: string): AsyncIterable<string> => {
    const lines = map[p] ?? [];
    return {
      [Symbol.asyncIterator](): AsyncIterator<string> {
        let i = 0;
        return {
          next(): Promise<IteratorResult<string>> {
            if (i < lines.length) return Promise.resolve({ value: lines[i++]!, done: false });
            return Promise.resolve({ value: '', done: true });
          },
        };
      },
    };
  };
}

/** Injectable in-memory sink — captures written lines instead of touching disk. */
function fakeSink(): { sink: LineSink; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    sink: {
      write(l: string): void {
        lines.push(l);
      },
      close(): Promise<void> {
        return Promise.resolve();
      },
    },
  };
}

describe('runPipeline (hermetic — injected I/O)', () => {
  it('streams trace lines into ShareGPT lines, skipping malformed input', async () => {
    const traceLine = JSON.stringify({
      messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }],
      meta: { source: 'sprint-worker', model: 'claude-sonnet-5', ts: 't', selfAssessment: 'DONE' },
    });
    const { sink, lines: written } = fakeSink();

    const summary = await runPipeline({
      inputPath: '/fake/in.jsonl',
      outputPath: '/fake/out.jsonl',
      openLines: fakeOpenLines({ '/fake/in.jsonl': [traceLine, '{ broken', ''] }),
      openSink: () => sink,
    });

    expect(summary.linesRead).toBe(2); // empty line is skipped before counting
    expect(summary.examplesWritten).toBe(1);
    expect(summary.skippedMalformed).toBe(1);
    expect(written).toHaveLength(1);
    const parsed = JSON.parse(written[0]!);
    expect(isValidShareGptExample(parsed)).toBe(true);
    // TRN-PIPE-WIRE (358-009): DONE → 'success' via the RunOutcomeLabel taxonomy.
    expect(parsed.labels).toEqual({ outcome: 'success', model: 'claude-sonnet-5' });
  });

  it('counts truncated and redacted examples in the summary', async () => {
    // A secret plus enough surrounding bulk that the content is STILL over the
    // default 4000-char policy even after "Bearer <token>" collapses to "Bearer [REDACTED]".
    // The space before the padding keeps the padding OUTSIDE the greedy token match.
    const bigSecret = 'Bearer ' + 'x'.repeat(30) + ' ' + 'C'.repeat(6000);
    const traceLine = JSON.stringify({
      messages: [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'go' },
        { role: 'assistant', content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'Bash', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 't1', content: bigSecret },
      ],
    });
    const { sink, lines: written } = fakeSink();

    const summary = await runPipeline({
      inputPath: '/fake/in.jsonl',
      outputPath: '/fake/out.jsonl',
      openLines: fakeOpenLines({ '/fake/in.jsonl': [traceLine] }),
      openSink: () => sink,
    });

    expect(summary.truncatedCount).toBe(1);
    expect(summary.redactedCount).toBe(1);
    const parsed = JSON.parse(written[0]!);
    const observation = parsed.conversations.find((c: { from: string }) => c.from === 'observation');
    expect(observation.value.length).toBeLessThan(bigSecret.length);
  });

  it('processes a large number of lines without materializing the whole file (approximate streaming proof)', async () => {
    const N = 3000;
    const lines: string[] = [];
    for (let i = 0; i < N; i++) {
      lines.push(
        JSON.stringify({
          messages: [{ role: 'system', content: 'S' }, { role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` }],
        }),
      );
    }
    const { sink, lines: written } = fakeSink();

    const summary = await runPipeline({
      inputPath: '/fake/in.jsonl',
      outputPath: '/fake/out.jsonl',
      openLines: fakeOpenLines({ '/fake/in.jsonl': lines }),
      openSink: () => sink,
    });

    expect(summary.linesRead).toBe(N);
    expect(summary.examplesWritten).toBe(N);
    expect(written).toHaveLength(N);
  });

  it('isolates one conversion failure and reconciles structured counters without truncating following records', async () => {
    const valid = JSON.stringify({ messages: [{ role: 'user', content: 'good' }], duplicateWeight: 0, provenance: { taskId: 't', disposition: 'auxiliary' } });
    const invalidRole = JSON.stringify({ messages: [{ role: 'unsupported', content: 'bad' }] });
    const { sink, lines: written } = fakeSink();
    const summary = await runPipeline({
      inputPath: '/fake/in.jsonl', outputPath: '/fake/out.jsonl', projectionMode: 'structured-v2',
      openLines: fakeOpenLines({ '/fake/in.jsonl': [invalidRole, valid] }), openSink: () => sink,
    });
    expect(summary).toMatchObject({ linesRead: 2, examplesWritten: 1, conversionFailedCount: 1, auxiliaryCount: 1, duplicateWeightZeroCount: 1 });
    expect(summary.conversionFailureReasons).toEqual({ INVALID_MESSAGE_ROLE: 1 });
    expect(summary.manifest).toMatchObject({ linesRead: 2, examplesWritten: 1, conversionFailedCount: 1, auxiliaryCount: 1, duplicateWeightZeroCount: 1 });
    expect(written).toHaveLength(1);
  });

  it('surfaces sink write failures after closing the sink', async () => {
    let closed = false;
    await expect(runPipeline({
      inputPath: '/fake/in.jsonl', outputPath: '/fake/out.jsonl',
      openLines: fakeOpenLines({ '/fake/in.jsonl': [JSON.stringify({ messages: [{ role: 'user', content: 'x' }] })] }),
      openSink: () => ({ write: () => Promise.reject(new Error('disk full')), close: async () => { closed = true; } }),
    })).rejects.toThrow('disk full');
    expect(closed).toBe(true);
  });
});

describe('runPipeline (default fs I/O — real tmpdir, end-to-end)', () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = null;
    }
  });

  it('reads a real input file via node:readline and writes a real output file via node:fs, streaming (no injected I/O)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'trn4-pipeline-'));
    const inputPath = join(dir, 'in.jsonl');
    const outputPath = join(dir, 'out.jsonl');

    const traceLines = [
      JSON.stringify({
        messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
        meta: { source: 'native-repl', model: 'claude-sonnet-5', ts: '2026-07-01T00:00:00.000Z' },
      }),
      JSON.stringify({ messages: [{ role: 'user', content: 'no system here' }, { role: 'assistant', content: 'ok' }] }),
    ];
    writeFileSync(inputPath, traceLines.join('\n') + '\n', 'utf-8');

    const summary = await runPipeline({ inputPath, outputPath });

    expect(summary.linesRead).toBe(2);
    expect(summary.examplesWritten).toBe(2);
    expect(summary.skippedMalformed).toBe(0);

    const outLines = readFileSync(outputPath, 'utf-8').split('\n').filter((l) => l.length > 0);
    expect(outLines).toHaveLength(2);
    for (const l of outLines) {
      expect(isValidShareGptExample(JSON.parse(l))).toBe(true);
    }
  });

  it('verifies migration authority and projects only train-ready canonical envelopes with tool causality', async () => {
    dir = mkdtempSync(join(tmpdir(), 'trn4-canonical-'));
    mkdirSync(join(dir, 'traces'));
    const records = [
      {
        schemaVersion: 2,
        messages: [
          { role: 'user', content: 'read it' },
          { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'Read', arguments: '{"path":"x.ts"}' } }] },
          { role: 'tool', tool_call_id: 'c1', content: 'file body' },
          { role: 'assistant', content: 'done' },
        ],
        meta: { source: 'sprint-worker', schemaVersion: 2, sprintId: 'sprint-515', taskId: '515-003', model: 'model-a', agent: 'worker-a', selfAssessment: 'DONE' },
      },
      {
        schemaVersion: 2,
        messages: [{ role: 'user', content: 'incomplete' }],
        meta: { source: 'sprint-worker', schemaVersion: 2, quarantine: true, quarantineReasons: ['no-prompt'] },
      },
    ];
    writeFileSync(join(dir, 'traces', 'sprint-worker.jsonl'), records.map(value => JSON.stringify(value)).join('\n') + '\n');
    const migration = await migrateHistoricalTraces({
      projectRoot: dir, inputPaths: ['traces'], outputPath: 'migration', dryRun: false,
      policy: { allowTraining: true, trainingWeight: 1 },
    });
    const authority: CanonicalCorpusAuthority = {
      migrationId: migration.manifest.migrationId,
      codeVersion: migration.manifest.codeVersion,
      envelopeSchemaVersion: migration.manifest.envelopeSchemaVersion,
      policyVersion: migration.manifest.policyVersion,
      contractVersion: migration.manifest.contractVersion,
      policy: migration.manifest.policy,
      policyDigest: migration.manifest.policyDigest,
      sourceDigest: migration.manifest.sourceDigest,
      projectionDigest: migration.manifest.projectionDigest,
    };
    const inputPath = join(dir, 'migration', 'projection.jsonl');
    const outputPath = join(dir, 'corpus.jsonl');
    const summary = await runPipeline({ inputPath, outputPath, projectionMode: 'canonical-v1', canonicalAuthority: authority });
    expect(summary).toMatchObject({ canonicalRecordsSeen: 2, examplesWritten: 1, quarantinedSkipped: 1, policyRejectedCount: 1 });
    const corpus = JSON.parse(readFileSync(outputPath, 'utf8').trim());
    expect(corpus.provenance).toMatchObject({ schemaVersion: 1, migrationId: authority.migrationId, disposition: 'train-ready', integrity: 'verified', verdictAuthority: 'trace-meta-brain-evaluation' });
    expect(corpus.labels).toMatchObject({ outcome: 'success', model: 'model-a', agent: 'worker-a' });
    expect(corpus.conversations).toContainEqual({ from: 'function_call', value: JSON.stringify({ name: 'Read', arguments: { path: 'x.ts' } }), causalId: 'c1' });
    expect(corpus.conversations).toContainEqual({ from: 'observation', value: 'file body', causalId: 'c1' });
    expect(isValidShareGptExample(corpus)).toBe(true);
    expect(JSON.parse(readFileSync(`${outputPath}.manifest.json`, 'utf8'))).toMatchObject({ outputDigest: summary.manifest.outputDigest, migrationId: authority.migrationId });
  });

  it('refuses absent/tampered canonical authority and never clobbers an existing corpus', async () => {
    dir = mkdtempSync(join(tmpdir(), 'trn4-canonical-hold-'));
    mkdirSync(join(dir, 'traces'));
    writeFileSync(join(dir, 'traces', 'sprint-worker.jsonl'), JSON.stringify({
      schemaVersion: 2, messages: [{ role: 'user', content: 'hello' }], meta: { source: 'sprint-worker', schemaVersion: 2 },
    }) + '\n');
    const migration = await migrateHistoricalTraces({ projectRoot: dir, inputPaths: ['traces'], outputPath: 'migration', dryRun: false, policy: { allowTraining: true, trainingWeight: 1 } });
    const inputPath = join(dir, 'migration', 'projection.jsonl');
    const outputPath = join(dir, 'corpus.jsonl');
    await expect(runPipeline({ inputPath, outputPath, projectionMode: 'canonical-v1' })).rejects.toMatchObject({ code: 'CANONICAL_AUTHORITY_REQUIRED' });
    expect(existsSync(outputPath)).toBe(false);
    const authority: CanonicalCorpusAuthority = {
      migrationId: migration.manifest.migrationId, codeVersion: migration.manifest.codeVersion,
      envelopeSchemaVersion: migration.manifest.envelopeSchemaVersion, policyVersion: migration.manifest.policyVersion,
      contractVersion: migration.manifest.contractVersion, policy: migration.manifest.policy,
      policyDigest: migration.manifest.policyDigest, sourceDigest: migration.manifest.sourceDigest,
      projectionDigest: migration.manifest.projectionDigest,
    };
    writeFileSync(inputPath, readFileSync(inputPath, 'utf8') + ' ');
    await expect(runPipeline({ inputPath, outputPath, projectionMode: 'canonical-v1', canonicalAuthority: authority })).rejects.toMatchObject({ code: 'CANONICAL_SOURCE_DIGEST_MISMATCH' });
    expect(existsSync(outputPath)).toBe(false);
  });
});
