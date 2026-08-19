// NT-01/04/05 — tool-result containment chokepoint.
//
// Hermetic: every filesystem touch happens inside a per-test mkdtemp under
// os.tmpdir() (never the source tree, never a hardcoded '/tmp'), removed in
// afterEach. No subprocess is ever spawned — the bash/CLI seams are injected.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  containToolResult,
  renderToolResultEnvelope,
  brokerToolResult,
  resolveExitTruth,
  createSessionContentStore,
  sliceUtf8,
  DEFAULT_MAX_PREVIEW_BYTES,
  HARD_MAX_PREVIEW_BYTES,
  RENDER_HARD_CAP_BYTES,
  type ContentWriter,
} from '../../src/agent/tool-result-broker.js';
import { createToolExecDispatcher } from '../../src/cli/commands/chat-tool-exec.js';
import { createCliToolDispatcher } from '../../src/cli/commands/chat-tool-bridge.js';

let workDir: string;
let store: ContentWriter;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'deckent-broker-test-'));
  store = createSessionContentStore({ prefix: 'deckent-broker-content-' });
});

afterEach(() => {
  // The store now owns its teardown — closing it is what keeps a run from
  // leaving one content directory per test behind in the OS temp namespace.
  store.close?.();
  rmSync(workDir, { recursive: true, force: true });
});

/** A generated (NOT copied) large tool output, line-structured like a real one. */
function hugeOutput(chars = 470_000): string {
  const line = `${'y'.repeat(89)}`;
  const lines: string[] = [];
  let total = 0;
  for (let i = 0; lines.length === 0 || total < chars; i++) {
    const next = `line ${i} ${line}`;
    lines.push(next);
    total += next.length + 1;
  }
  return lines.join('\n');
}

describe('containToolResult — budget containment (NT-01/04)', () => {
  it('passes an under-cap result through inline, byte-identical, with no contentRef', () => {
    const output = 'total 4\nsrc\ntests\n';
    const env = containToolResult({ output, ok: true }, { store });

    expect(env.truncated).toBe(false);
    expect(env.contentRef).toBeNull();
    expect(env.boundedPreview).toBe(output);
    expect(env.bytes).toBe(Buffer.byteLength(output));
    expect(env.sha256).toBe(createHash('sha256').update(output).digest('hex'));
    expect(env.summary).toBe('total 4');
    // Render must not perturb a plain, successful, small result at all.
    expect(renderToolResultEnvelope(env)).toBe(output);
  });

  it('spills a generated 470k-char output to the store and hands the loop a ≤64KB envelope', () => {
    const output = hugeOutput();
    expect(output.length).toBeGreaterThanOrEqual(470_000);

    const env = containToolResult({ output, ok: true }, { store });

    expect(env.truncated).toBe(true);
    expect(env.bytes).toBe(Buffer.byteLength(output));
    expect(Buffer.byteLength(env.boundedPreview)).toBeLessThanOrEqual(DEFAULT_MAX_PREVIEW_BYTES);
    expect(env.approxTokens).toBeGreaterThan(100_000);
    expect(env.contentRef).not.toBeNull();
    expect(env.storeError).toBeNull();

    // contentRef is READABLE and the digest verifies against the full bytes.
    const persisted = readFileSync(env.contentRef!);
    expect(persisted.toString('utf8')).toBe(output);
    expect(createHash('sha256').update(persisted).digest('hex')).toBe(env.sha256);

    // What actually reaches the loop.
    const rendered = renderToolResultEnvelope(env);
    expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(RENDER_HARD_CAP_BYTES);
    expect(rendered.startsWith(env.boundedPreview)).toBe(true);
    expect(rendered).toContain(env.contentRef!);
    expect(rendered).toContain(`sha256:${env.sha256}`);
  });

  it('clamps a caller preview budget to the hard cap and still renders ≤64KB', () => {
    const output = hugeOutput();
    const env = containToolResult({ output, ok: true }, { store, maxPreviewBytes: 10_000_000 });

    expect(Buffer.byteLength(env.boundedPreview)).toBeLessThanOrEqual(HARD_MAX_PREVIEW_BYTES);
    expect(Buffer.byteLength(renderToolResultEnvelope(env))).toBeLessThanOrEqual(RENDER_HARD_CAP_BYTES);
    expect(renderToolResultEnvelope(env)).toContain(env.contentRef!);
  });

  it('never splits a multi-byte UTF-8 character at the preview boundary', () => {
    // 'ç' is 2 bytes: a cap of 5 bytes lands mid-character on the third one.
    const output = 'ççççç';
    const env = containToolResult({ output, ok: true }, { store, maxPreviewBytes: 5 });
    expect(env.boundedPreview).toBe('çç');
    expect(env.boundedPreview).not.toContain('�');
    expect(sliceUtf8(Buffer.from(output, 'utf8'), 5)).toBe('çç');
  });

  it('reports a store failure honestly instead of inventing a contentRef', () => {
    const brokenStore: ContentWriter = {
      write() { throw new Error('ENOSPC: no space left on device'); },
    };
    const env = containToolResult({ output: hugeOutput(), ok: true }, { store: brokenStore });

    expect(env.truncated).toBe(true);
    expect(env.contentRef).toBeNull();
    expect(env.storeError).toContain('ENOSPC');
    expect(renderToolResultEnvelope(env)).toContain('full content unavailable');
  });

  it('rejects a content reference whose digest does not match the summarised bytes', () => {
    const lyingStore: ContentWriter = {
      write: () => ({ path: join(workDir, 'nope.bin'), sha256: 'deadbeef' }),
    };
    const env = containToolResult({ output: hugeOutput(), ok: true }, { store: lyingStore });
    expect(env.contentRef).toBeNull();
    expect(env.storeError).toBe('content digest mismatch');
  });
});

describe('resolveExitTruth — exit-code truth (NT-05)', () => {
  it('marks a bash result ending in [exit 2] as not ok, even when the caller said ok', () => {
    const env = containToolResult({ output: 'npm ERR! test failed\n[exit 2]', ok: true }, { store });
    expect(env.ok).toBe(false);
    expect(env.exitCode).toBe(2);
    expect(env.reason).toBe('exit-code');
  });

  it('leaves an [exit 0] marker as ok', () => {
    const truth = resolveExitTruth({ output: 'done\n[exit 0]', ok: true });
    expect(truth.ok).toBe(true);
    expect(truth.reason).toBeNull();
  });

  it('types a timeout as ok:false / timeout from the caller reason and from the marker', () => {
    const explicit = resolveExitTruth({ output: '', ok: false, reason: 'timeout' });
    expect(explicit).toEqual({ ok: false, exitCode: null, reason: 'timeout' });

    const fromMarker = resolveExitTruth({
      output: 'partial\n[mcp-error] deckent_bash: timed out after 300s',
      ok: true,
    });
    expect(fromMarker.ok).toBe(false);
    expect(fromMarker.reason).toBe('timeout');
  });

  it('types a real non-zero exit code and a terminating signal', () => {
    expect(resolveExitTruth({ output: 'out', ok: true, exitCode: 1 })).toEqual({
      ok: false, exitCode: 1, reason: 'exit-code',
    });
    expect(resolveExitTruth({ output: 'out', ok: true, exitCode: null, signal: 'SIGKILL' }).reason).toBe('signal');
  });

  it('classifies the denied and generic tool-error protocol markers', () => {
    expect(resolveExitTruth({ output: '[deckent-denied] deckent_bash', ok: true }).reason).toBe('denied');
    expect(resolveExitTruth({ output: '[mcp-error] deckent_read_file: file not found: x', ok: true }).reason)
      .toBe('tool-error');
  });

  it('never upgrades a caller-reported failure into a success', () => {
    const env = containToolResult({ output: 'looks fine', ok: false, reason: 'spawn-error' }, { store });
    expect(env.ok).toBe(false);
    expect(env.reason).toBe('spawn-error');
    expect(renderToolResultEnvelope(env)).toContain('tool-result not ok: spawn-error');
  });

  it('keeps stderr in its own field and surfaces it as a labelled block, never merged', () => {
    const env = containToolResult(
      { output: 'stdout line', ok: true, exitCode: 1, stderr: 'fatal: not a git repository' },
      { store },
    );
    expect(env.boundedPreview).toBe('stdout line');
    expect(env.boundedPreview).not.toContain('fatal:');
    expect(env.stderr).toBe('fatal: not a git repository');
    const rendered = renderToolResultEnvelope(env);
    expect(rendered).toContain('[deckent-stderr] fatal: not a git repository');
    expect(rendered).toContain('tool-result not ok: exit-code (exit 1)');
  });
});

describe('createSessionContentStore — session-scoped, atomic, sha256-named', () => {
  it('writes outside the source tree with a sha256 name and restrictive modes', () => {
    const bytes = Buffer.from('persisted content', 'utf8');
    const receipt = store.write(bytes);

    expect(receipt.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(receipt.path).toContain(receipt.sha256);
    expect(receipt.path.startsWith(tmpdir())).toBe(true);
    expect(receipt.path).not.toContain(`${process.cwd()}/src`);
    expect(readFileSync(receipt.path).toString('utf8')).toBe('persisted content');
    if (process.platform !== 'win32') {
      expect(statSync(receipt.path).mode & 0o777).toBe(0o600);
    }
  });

  it('anchors its content directory inside the session scratch root when given one', () => {
    const scratchRoot = join(workDir, 'deckent', 'slug', 'sess-1', 'scratchpad');
    mkdirSync(scratchRoot, { recursive: true });
    const anchored = createSessionContentStore({ dir: scratchRoot });

    // Lazy: no directory exists until something actually overflows.
    expect(existsSync(join(scratchRoot, 'tool-content'))).toBe(false);

    const receipt = anchored.write(Buffer.from('overflow bytes', 'utf8'));
    expect(receipt.path).toBe(join(scratchRoot, 'tool-content', `content-${receipt.sha256}.bin`));
    if (process.platform !== 'win32') {
      expect(statSync(join(scratchRoot, 'tool-content')).mode & 0o777).toBe(0o700);
    }

    // close() releases exactly what it created, leaving the scratch root — the
    // reaper's unit — intact and sweepable as ONE namespace.
    anchored.close?.();
    expect(existsSync(join(scratchRoot, 'tool-content'))).toBe(false);
    expect(existsSync(scratchRoot)).toBe(true);
  });

  it('close() is idempotent and a no-op when nothing was ever written', () => {
    const unused = createSessionContentStore({ dir: join(workDir, 'never-used') });
    expect(() => { unused.close?.(); unused.close?.(); }).not.toThrow();
    expect(existsSync(join(workDir, 'never-used'))).toBe(false);

    const used = createSessionContentStore({ dir: workDir });
    used.write(Buffer.from('x', 'utf8'));
    used.close?.();
    used.close?.();
    expect(existsSync(join(workDir, 'tool-content'))).toBe(false);
    expect(existsSync(workDir)).toBe(true);
  });
});

describe('dispatcher wiring — no raw unbounded path survives', () => {
  it('chat-tool-exec: a generated 470k-char file read reaches the loop as a ≤64KB envelope', async () => {
    const big = hugeOutput();
    writeFileSync(join(workDir, 'huge.log'), big, 'utf-8');
    const dispatcher = createToolExecDispatcher({ cwd: workDir, contentStore: store });

    const result = await dispatcher.dispatch('deckent_read_file', { path: 'huge.log' });

    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(RENDER_HARD_CAP_BYTES);
    expect(result).toContain('tool-result truncated');
    const ref = /full content at (\S+)/.exec(result)?.[1];
    expect(ref).toBeDefined();
    expect(readFileSync(ref!).toString('utf8')).toBe(big);
  });

  it('chat-tool-exec: read_file honours a server-side {offset, limit} range', async () => {
    mkdirSync(join(workDir, 'nested'), { recursive: true });
    writeFileSync(join(workDir, 'nested', 'lines.txt'), 'a\nb\nc\nd\ne', 'utf-8');
    const dispatcher = createToolExecDispatcher({ cwd: workDir, contentStore: store });

    expect(await dispatcher.dispatch('deckent_read_file', { path: 'nested/lines.txt' })).toBe('a\nb\nc\nd\ne');
    expect(await dispatcher.dispatch('deckent_read_file', { path: 'nested/lines.txt', offset: 2, limit: 2 }))
      .toBe('b\nc');
    expect(await dispatcher.dispatch('deckent_read_file', { path: 'nested/lines.txt', offset: 4 })).toBe('d\ne');
  });

  it('chat-tool-exec: a bash command exiting non-zero stays visibly not-ok', async () => {
    const dispatcher = createToolExecDispatcher({
      cwd: workDir,
      contentStore: store,
      bashRun: async () => 'npm ERR! 1 test failed\n[exit 2]',
    });
    const result = await dispatcher.dispatch('deckent_bash', { cmd: 'npm test' });
    expect(result).toContain('[exit 2]');
    expect(containToolResult({ output: result, ok: true }, { store }).ok).toBe(false);
  });

  it('chat-tool-bridge: a real non-zero exit code becomes ok:false with stderr kept separate', async () => {
    const dispatcher = createCliToolDispatcher({
      contentStore: store,
      spawnOutcomeFn: async () => ({
        stdout: 'partial status',
        stderr: 'DECKENT_E001: config missing',
        exitCode: 1,
        signal: null,
      }),
    });
    const result = await dispatcher.dispatch('deckent_status', {});
    expect(result).toContain('partial status');
    expect(result).toContain('[deckent-stderr] DECKENT_E001: config missing');
    expect(result).toContain('tool-result not ok: exit-code (exit 1)');
  });

  it('chat-tool-bridge: a clean exit 0 renders exactly the stdout it always did', async () => {
    const dispatcher = createCliToolDispatcher({
      contentStore: store,
      spawnOutcomeFn: async () => ({ stdout: 'Sprint sprint-553 — 3/3 DONE', stderr: '', exitCode: 0, signal: null }),
    });
    expect(await dispatcher.dispatch('deckent_status', {})).toBe('Sprint sprint-553 — 3/3 DONE');
  });

  it('chat-tool-bridge: an unbounded CLI stdout is contained before it reaches the loop', async () => {
    const big = hugeOutput();
    const dispatcher = createCliToolDispatcher({
      contentStore: store,
      spawnOutcomeFn: async () => ({ stdout: big, stderr: '', exitCode: 0, signal: null }),
    });
    const result = await dispatcher.dispatch('deckent_history', {});
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(RENDER_HARD_CAP_BYTES);
    const ref = /full content at (\S+)/.exec(result)?.[1];
    expect(ref).toBeDefined();
    expect(readFileSync(ref!).toString('utf8')).toBe(big);
  });

  it('brokerToolResult is the one-call shape both dispatchers use', () => {
    expect(brokerToolResult({ output: 'small', ok: true }, { store })).toBe('small');
  });
});
