import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';
import { containCapturedToolResult } from '../../src/agent/tool-result-broker.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function makeStore(
  options: Parameters<typeof createSessionToolContentStore>[0] = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'deckent-content-test-'));
  directories.push(directory);
  return {
    directory,
    store: createSessionToolContentStore({ dir: directory, ...options }),
  };
}

describe('session tool content store', () => {
  it('never follows a replaced capture pathname when appending the next chunk', () => {
    const { directory, store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 8 });
    capture.append(Buffer.from('before'));
    const root = join(directory, 'tool-content');
    const temporary = readdirSync(root).find((name) => name.endsWith('.tmp'))!;
    const temporaryPath = join(root, temporary);
    renameSync(temporaryPath, join(root, 'original-capture'));
    const foreign = join(directory, 'foreign');
    writeFileSync(foreign, 'unchanged');
    symlinkSync(foreign, temporaryPath);
    capture.append(Buffer.from('after'));
    expect(readFileSync(foreign, 'utf8')).toBe('unchanged');
    expect(capture.finish()).toMatchObject({
      complete: false,
      detailRef: null,
      legacyContentRef: null,
      reasonCode: 'CONTENT_STORE_FAILED',
    });
  });

  it('captures a prefix separately from all observed bytes and marks quota partial', async () => {
    const { store } = makeStore({ maxSessionBytes: 8 });
    const capture = store.beginCapture({
      channel: 'stdout',
      previewBytes: 5,
      maxStoredBytes: 8,
    });
    capture.append(Buffer.from('ççççç', 'utf8'));
    const receipt = capture.finish();
    expect(receipt.preview).toBe('çç');
    expect(receipt.observedBytes).toBe(10);
    expect(receipt.observedSha256).toBe(
      createHash('sha256').update('ççççç').digest('hex'),
    );
    expect(receipt.storedBytes).toBe(8);
    expect(receipt.complete).toBe(false);
    expect(receipt.legacyContentRef).toBeNull();
    expect(receipt.detailRef).not.toBeNull();
    const result = await store.readDetailRange({
      detailRef: receipt.detailRef!,
      offset: 0,
      limit: 8,
      expectedStoredSha256: receipt.storedSha256!,
    });
    expect(result).toMatchObject({
      kind: 'loaded',
      completeCapture: false,
      totalBytes: 8,
    });
  });

  it('releases an aborted capture reservation and permanently expires opaque references on close', async () => {
    const { store } = makeStore({ maxSessionBytes: 4, maxActive: 1 });
    const first = store.beginCapture({ channel: 'stdout', previewBytes: 4 });
    first.append(Buffer.from('1234'));
    first.abort();
    const second = store.beginCapture({ channel: 'stderr', previewBytes: 4 });
    second.append(Buffer.from('abcd'));
    const receipt = second.finish();
    expect(receipt.complete).toBe(true);
    store.close?.();
    await expect(
      store.readDetailRange({
        detailRef: receipt.detailRef!,
        offset: 0,
        limit: 1,
        expectedStoredSha256: receipt.storedSha256!,
      }),
    ).resolves.toEqual({ kind: 'hold', reasonCode: 'CONTENT_REF_EXPIRED' });
    expect(() =>
      store.beginCapture({ channel: 'stdout', previewBytes: 1 }),
    ).toThrow('closed');
  });

  it('rejects tampering and symlink replacement without accepting a filesystem path', async () => {
    const { directory, store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 8 });
    capture.append(Buffer.from('trusted bytes'));
    const receipt = capture.finish();
    const content = join(
      directory,
      'tool-content',
      `capture-${receipt.detailRef}.bin`,
    );
    writeFileSync(content, 'changed bytes');
    await expect(
      store.readDetailRange({
        detailRef: receipt.detailRef!,
        offset: 0,
        limit: 3,
        expectedStoredSha256: receipt.storedSha256!,
      }),
    ).resolves.toEqual({ kind: 'hold', reasonCode: 'CONTENT_DIGEST_MISMATCH' });
    renameSync(content, `${content}.old`);
    writeFileSync(join(directory, 'foreign'), 'foreign');
    symlinkSync(join(directory, 'foreign'), content);
    await expect(
      store.readDetailRange({
        detailRef: receipt.detailRef!,
        offset: 0,
        limit: 3,
        expectedStoredSha256: receipt.storedSha256!,
      }),
    ).resolves.toEqual({ kind: 'hold', reasonCode: 'CONTENT_READ_FAILED' });
    await expect(
      store.readDetailRange({
        detailRef: '/etc/passwd',
        offset: 0,
        limit: 3,
        expectedStoredSha256: receipt.storedSha256!,
      }),
    ).resolves.toEqual({ kind: 'hold', reasonCode: 'CONTENT_REF_DENIED' });
  });

  it('validates finite limits before allocating and bounds range requests', async () => {
    expect(() => createSessionToolContentStore({ maxActive: 0 })).toThrow(
      'invalid content store limit',
    );
    const { store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 1 });
    capture.append(Buffer.from('x'));
    const receipt = capture.finish();
    await expect(
      store.readDetailRange({
        detailRef: receipt.detailRef!,
        offset: 0,
        limit: 256 * 1024 + 1,
        expectedStoredSha256: receipt.storedSha256!,
      }),
    ).resolves.toEqual({ kind: 'hold', reasonCode: 'CONTENT_RANGE_INVALID' });
  });

  it('keeps a bounded trailing protocol marker authoritative beyond the preview', () => {
    const { store } = makeStore();
    const stdout = store.beginCapture({ channel: 'stdout', previewBytes: 4 });
    stdout.append(Buffer.from(`${'x'.repeat(8_192)}\n[exit 7]`));
    const stderr = store.beginCapture({ channel: 'stderr', previewBytes: 4 });
    const stdoutReceipt = stdout.finish(),
      stderrReceipt = stderr.finish();
    expect(stdoutReceipt.preview).toBe('xxxx');
    expect(stdoutReceipt.protocolTail).toContain('[exit 7]');
    expect(
      containCapturedToolResult({
        stdout: stdoutReceipt,
        stderr: stderrReceipt,
        exitCode: null,
        signal: null,
      }),
    ).toMatchObject({ ok: false, exitCode: 7, reason: 'exit-code' });
  });

  it('keeps malformed UTF-8 replacement expansion within the preview byte limit', async () => {
    const { store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 8 });
    const bytes = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x61, 0x62, 0x63, 0x64]);
    capture.append(bytes);
    const receipt = capture.finish();
    expect(Buffer.byteLength(receipt.preview)).toBeLessThanOrEqual(8);
    expect(receipt.preview).toBe('\ufffd\ufffd');
    expect(receipt.observedSha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    const detail = await store.readDetailRange({
      detailRef: receipt.detailRef!,
      offset: 0,
      limit: 8,
      expectedStoredSha256: receipt.storedSha256!,
    });
    expect(detail.kind).toBe('loaded');
    if (detail.kind === 'loaded')
      expect(Buffer.from(detail.bytes)).toEqual(bytes);
  });

  it('preserves trailing exit precedence alongside an earlier retained denied marker', () => {
    const { store } = makeStore();
    const stdout = store.beginCapture({ channel: 'stdout', previewBytes: 4 });
    stdout.append(
      Buffer.from(`[deckent-denied]\n${'x'.repeat(9_000)}\n[exit 7]`),
    );
    const stderr = store.beginCapture({ channel: 'stderr', previewBytes: 4 });
    expect(
      containCapturedToolResult({
        stdout: stdout.finish(),
        stderr: stderr.finish(),
        exitCode: null,
        signal: null,
      }),
    ).toMatchObject({ ok: false, exitCode: 7, reason: 'exit-code' });
  });

  it('does not promote a mid-line marker at the carry buffer boundary', () => {
    const { store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 4 });
    const marker = '[deckent-denied]';
    capture.append(
      Buffer.from(`x${marker}${'x'.repeat(8_192 - marker.length)}`),
    );
    capture.append(Buffer.from('tail'));
    expect(capture.finish().protocolFailure).toBeNull();
  });

  it('retains split line markers and timeout context separated by long chunks', () => {
    const { store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 4 });
    capture.append(
      Buffer.from(`timed out after 1s\n${'x'.repeat(9_000)}\n[mcp-`),
    );
    capture.append(Buffer.from('error]'));
    expect(capture.finish().protocolFailure).toBe('timeout');
  });

  it('does not create a capture hole after quota is later freed, and sees mid-stream markers', () => {
    const { store } = makeStore({ maxSessionBytes: 4 });
    const first = store.beginCapture({ channel: 'stdout', previewBytes: 4 });
    first.append(Buffer.from('abcdef'));
    const released = store.beginCapture({ channel: 'stderr', previewBytes: 4 });
    released.append(Buffer.from('12'));
    released.abort();
    first.append(Buffer.from('GHIJ'));
    const receipt = first.finish();
    expect(receipt.storedBytes).toBe(4);
    expect(receipt.complete).toBe(false);
    const marked = store.beginCapture({ channel: 'stderr', previewBytes: 2 });
    marked.append(
      Buffer.from(
        `${'x'.repeat(9_000)}\n[deckent-denied] x\n[mcp-error] timed out after 1s`,
      ),
    );
    expect(marked.finish().protocolFailure).toBe('denied');
  });

  it('preserves the standalone custom temporary directory prefix', () => {
    const content = createSessionToolContentStore({
      prefix: 'custom-content-',
    });
    const receipt = content.write(Buffer.from('x'));
    expect(receipt.path.split('/').at(-2)).toMatch(/^custom-content-/);
    content.close?.();
  });

  it('invalidates a range read closed while its asynchronous file open is pending', async () => {
    const { store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 16 });
    capture.append(Buffer.alloc(256 * 1024, 120));
    const receipt = capture.finish();
    const pending = store.readDetailRange({
      detailRef: receipt.detailRef!,
      offset: 0,
      limit: 16,
      expectedStoredSha256: receipt.storedSha256!,
    });
    store.close();
    expect(await pending).toMatchObject({ kind: 'hold' });
  });

  it('never recreates a closed store from a pending capture', () => {
    const { directory, store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 16 });
    capture.append(Buffer.from('before close'));
    store.close();
    capture.append(Buffer.from('after close'));
    expect(capture.finish()).toMatchObject({
      complete: false,
      detailRef: null,
      reasonCode: 'CONTENT_STORE_FAILED',
    });
    expect(existsSync(join(directory, 'tool-content'))).toBe(false);
  });

  it('does not read or delete a replacement content root', async () => {
    const { directory, store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 8 });
    capture.append(Buffer.from('original'));
    const receipt = capture.finish();
    const root = join(directory, 'tool-content');
    renameSync(root, join(directory, 'original-root'));
    mkdirSync(root);
    writeFileSync(join(root, 'sentinel'), 'not owned by the capture store');
    expect(
      await store.readDetailRange({
        detailRef: receipt.detailRef!,
        offset: 0,
        limit: 8,
        expectedStoredSha256: receipt.storedSha256!,
      }),
    ).toMatchObject({ kind: 'hold' });
    store.close();
    expect(existsSync(join(root, 'sentinel'))).toBe(true);
  });

  it('returns a typed failure when publication collides with an existing directory', () => {
    const { directory, store } = makeStore();
    const capture = store.beginCapture({ channel: 'stdout', previewBytes: 8 });
    capture.append(Buffer.from('payload'));
    const root = join(directory, 'tool-content');
    const temporary = readdirSync(root).find((name) =>
      /^\.capture-[a-f0-9]{48}\.tmp$/.test(name),
    );
    expect(temporary).toBeDefined();
    const target = join(root, temporary!.slice(1).replace(/\.tmp$/, '.bin'));
    mkdirSync(target);
    writeFileSync(join(target, 'sentinel'), 'collision');
    expect(capture.finish()).toMatchObject({
      complete: false,
      detailRef: null,
      reasonCode: 'CONTENT_STORE_FAILED',
    });
    expect(existsSync(join(target, 'sentinel'))).toBe(true);
  });

  it('preserves an empty complete stream digest without a fabricated detail reference', () => {
    const { store } = makeStore();
    const receipt = store
      .beginCapture({ channel: 'stderr', previewBytes: 4 })
      .finish();
    const empty = createHash('sha256').update('').digest('hex');
    expect(receipt).toMatchObject({
      complete: true,
      observedBytes: 0,
      storedBytes: 0,
      observedSha256: empty,
      storedSha256: empty,
      detailRef: null,
    });
  });

  it('returns unsupported rather than silently omitting no-follow protection', async () => {
    vi.resetModules();
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return { ...actual, constants: { ...actual.constants, O_NOFOLLOW: 0 } };
    });
    let store: ReturnType<typeof createSessionToolContentStore> | undefined;
    try {
      const isolated = await import('../../src/agent/session-tool-content.js');
      const directory = mkdtempSync(
        join(tmpdir(), 'deckent-content-unsupported-'),
      );
      directories.push(directory);
      store = isolated.createSessionToolContentStore({ dir: directory });
      const capture = store.beginCapture({
        channel: 'stdout',
        previewBytes: 8,
      });
      capture.append(Buffer.from('payload'));
      const receipt = capture.finish();
      expect(
        await store.readDetailRange({
          detailRef: receipt.detailRef!,
          offset: 0,
          limit: 8,
          expectedStoredSha256: receipt.storedSha256!,
        }),
      ).toEqual({ kind: 'hold', reasonCode: 'CONTENT_READ_UNSUPPORTED' });
    } finally {
      store?.close();
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });
});
