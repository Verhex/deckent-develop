// tests/cli/trn3-trace-extract.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  registerTraceExtract,
  collectTranscriptFiles,
  redactExample,
  runExtract,
} from '../../src/cli/commands/trace-extract.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function mkTmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function line(o: unknown): string { return JSON.stringify(o); }

const SECRET = 'abcdefghijklmnopqrstuvwxyz';

/** One segment: user text -> assistant Bash tool_use -> tool_result (carries a secret) -> assistant text. */
const MAPPABLE_SESSION = [
  line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'run the deploy script' }] } }),
  line({ type: 'assistant', message: { role: 'assistant', content: [
    { type: 'text', text: 'Running.' },
    { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'echo hi' } },
  ] } }),
  line({ type: 'user', message: { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 't1', content: `Authorization: Bearer ${SECRET}` },
  ] } }),
  line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } }),
];

/** One segment using a non-mappable tool (Agent) — excluded from aligned, kept in general. */
const NON_MAPPABLE_SESSION = [
  line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'dispatch a subagent' }] } }),
  line({ type: 'assistant', message: { role: 'assistant', content: [
    { type: 'tool_use', id: 'a1', name: 'Agent', input: { task: 'go' } },
  ] } }),
  line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a1', content: 'RESULT' }] } }),
  line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }),
];

// ─── Pure-helper unit tests ─────────────────────────────────────────────────

describe('collectTranscriptFiles', () => {
  it('returns the file itself when given a single file', () => {
    const dir = mkTmp('trn3-file-');
    const f = join(dir, 'session.jsonl');
    writeFileSync(f, MAPPABLE_SESSION.join('\n'), 'utf-8');
    expect(collectTranscriptFiles(f)).toEqual([f]);
  });

  it('recursively collects *.jsonl under a directory, sorted', () => {
    const dir = mkTmp('trn3-dir-');
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'b.jsonl'), '', 'utf-8');
    writeFileSync(join(dir, 'nested', 'a.jsonl'), '', 'utf-8');
    writeFileSync(join(dir, 'ignore.txt'), '', 'utf-8');
    const files = collectTranscriptFiles(dir);
    expect(files).toEqual([join(dir, 'b.jsonl'), join(dir, 'nested', 'a.jsonl')]);
  });
});

describe('redactExample', () => {
  it('redacts message content and tool_call arguments, reports whether anything changed', () => {
    const clean = redactExample({ messages: [{ role: 'user', content: 'hi' }] });
    expect(clean.redacted).toBe(false);
    expect(clean.example.messages[0]!.content).toBe('hi');

    const dirty = redactExample({
      messages: [
        { role: 'tool', tool_call_id: 't1', content: `Authorization: Bearer ${SECRET}` },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 't1', type: 'function', function: { name: 'deckent_bash', arguments: `{"command":"curl -H 'Bearer ${SECRET}'"}` } }],
        },
      ],
    });
    expect(dirty.redacted).toBe(true);
    expect(dirty.example.messages[0]!.content).not.toContain(SECRET);
    expect(dirty.example.messages[0]!.content).toContain('[REDACTED]');
    expect(dirty.example.messages[1]!.tool_calls![0]!.function.arguments).not.toContain(SECRET);
  });
});

// ─── runExtract (fixture transcript -> JSONL, tmpdir) ──────────────────────

describe('runExtract', () => {
  it('extracts a single fixture transcript to aligned/general JSONL with redaction applied', () => {
    const inDir = mkTmp('trn3-in-');
    const outDir = join(mkTmp('trn3-out-'), 'training');
    const file = join(inDir, 'session.jsonl');
    writeFileSync(file, MAPPABLE_SESSION.join('\n'), 'utf-8');

    const summary = runExtract({ inputPath: file, outDir, system: 'SYS' });

    expect(summary.filesProcessed).toBe(1);
    expect(summary.alignedWritten).toBe(1);
    expect(summary.generalWritten).toBe(1);
    expect(summary.redactedCount).toBe(2); // one redacted example in each corpus

    const aligned = JSON.parse(readFileSync(join(outDir, 'aligned.jsonl'), 'utf-8').trim());
    expect(aligned.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    const toolResult = aligned.messages.find((m: { role: string }) => m.role === 'tool');
    expect(toolResult.content).not.toContain(SECRET);
    expect(toolResult.content).toContain('[REDACTED]');
    const assistantCall = aligned.messages.find((m: { tool_calls?: unknown[] }) => m.tool_calls);
    expect(assistantCall.tool_calls[0].function.name).toBe('deckent_bash'); // core-4 remap preserved

    const general = JSON.parse(readFileSync(join(outDir, 'general.jsonl'), 'utf-8').trim());
    expect(general.messages[0]).toEqual({ role: 'system', content: 'SYS' });
  });

  it('walks a directory of transcripts and aggregates honest counts (aligned excludes non-mappable)', () => {
    const inDir = mkTmp('trn3-multi-in-');
    const outDir = join(mkTmp('trn3-multi-out-'), 'training');
    writeFileSync(join(inDir, 'mappable.jsonl'), MAPPABLE_SESSION.join('\n'), 'utf-8');
    writeFileSync(join(inDir, 'non-mappable.jsonl'), NON_MAPPABLE_SESSION.join('\n'), 'utf-8');

    const summary = runExtract({ inputPath: inDir, outDir, system: 'SYS' });

    expect(summary.filesProcessed).toBe(2);
    expect(summary.alignedWritten).toBe(1); // only the Bash (mappable) segment
    expect(summary.generalWritten).toBe(2); // both segments
  });

  it('running twice APPENDS rather than overwriting (accumulating corpus)', () => {
    const inDir = mkTmp('trn3-append-in-');
    const outDir = join(mkTmp('trn3-append-out-'), 'training');
    const file = join(inDir, 'session.jsonl');
    writeFileSync(file, MAPPABLE_SESSION.join('\n'), 'utf-8');

    runExtract({ inputPath: file, outDir, system: 'SYS' });
    runExtract({ inputPath: file, outDir, system: 'SYS' });

    const lines = readFileSync(join(outDir, 'aligned.jsonl'), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

// ─── CLI wiring (hermetic — commander program, no real spawn) ─────────────

function runCli(args: string[]): Promise<Command> {
  const program = new Command();
  program.exitOverride();
  registerTraceExtract(program);
  return program.parseAsync(['node', 'deckent', ...args]);
}

function captureStream(stream: NodeJS.WriteStream, fn: () => void | Promise<void>): Promise<string> {
  const captured: string[] = [];
  const spy = vi.spyOn(stream, 'write').mockImplementation((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  const result = fn();
  if (result instanceof Promise) {
    return result.finally(() => spy.mockRestore()).then(() => captured.join(''));
  }
  spy.mockRestore();
  return Promise.resolve(captured.join(''));
}

const captureStdout = (fn: () => void | Promise<void>): Promise<string> => captureStream(process.stdout, fn);
const captureStderr = (fn: () => void | Promise<void>): Promise<string> => captureStream(process.stderr, fn);

describe('deckent trace extract (CLI wiring)', () => {
  it('registers `trace extract` and --help renders (no real spawn)', async () => {
    let helpErr: unknown;
    const out = await captureStdout(async () => {
      try {
        await runCli(['trace', 'extract', '--help']);
      } catch (err) {
        helpErr = err;
      }
    });
    expect((helpErr as { code?: string } | undefined)?.code).toBe('commander.helpDisplayed');
    expect(out).toContain('extract');
    expect(out).toContain('--out');
  });

  it('reports an error and sets exitCode=1 when the input path does not exist', async () => {
    const missing = join(tmpdir(), 'trn3-does-not-exist-' + Date.now().toString(), 'x.jsonl');
    process.exitCode = undefined;
    const err = await captureStderr(() => runCli(['trace', 'extract', missing]));
    expect(err).toContain('not found');
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});
