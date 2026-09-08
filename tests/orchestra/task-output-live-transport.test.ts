import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type {
  CreateProcessGroupAnchorResult,
  ProcessGroupAnchor,
  ProcessGroupAnchorSpawnRequest,
} from '../../src/core/process-group-anchor.js';
import {
  streamTaskOutputLive,
  type TaskOutputLiveTransportInput,
  type TaskOutputLiveTransportHooks,
} from '../../src/orchestra/task-output-live-transport.js';

const containerId = 'a'.repeat(64);

interface FakeAnchor {
  readonly anchor: ProcessGroupAnchor;
  readonly stdout: PassThrough;
  readonly stderr: PassThrough;
  readonly spawnTarget: ReturnType<typeof vi.fn>;
  readonly signalGroup: ReturnType<typeof vi.fn>;
  readonly terminateGroup: ReturnType<typeof vi.fn>;
  readonly targetExit: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void;
}

function createFakeAnchor(options: {
  readonly spawn?: { ok: boolean; pid?: number };
  readonly cleanup?: { anchorExited: boolean; groupEmpty: boolean; signalled: boolean };
} = {}): FakeAnchor {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let resolveTarget!: (value: { code: number | null; signal: NodeJS.Signals | null }) => void;
  let resolveAnchor!: (value: { code: number | null; signal: NodeJS.Signals | null }) => void;
  const target = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => { resolveTarget = resolve; });
  const anchorExit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => { resolveAnchor = resolve; });
  const spawnTarget = vi.fn(async (_request: ProcessGroupAnchorSpawnRequest) =>
    options.spawn?.ok === false
      ? { ok: false as const, reason: 'spawn-error' as const, message: 'fixture spawn failure' }
      : { ok: true as const, pid: options.spawn?.pid ?? 42 });
  const signalGroup = vi.fn(() => true);
  const terminateGroup = vi.fn(async () => {
    stdout.end();
    stderr.end();
    resolveAnchor({ code: null, signal: 'SIGKILL' });
    return options.cleanup ?? { anchorExited: true, groupEmpty: true, signalled: true };
  });
  const anchor = {
    anchorPid: 41,
    pgid: 41,
    handshakeMs: 1,
    stdout,
    stderr,
    anchorAlive: () => true,
    anchorExit,
    spawnTarget,
    targetExit: target,
    signalGroup,
    killTarget: vi.fn(() => true),
    probeGroupEmpty: vi.fn(() => false),
    terminateGroup,
  } as unknown as ProcessGroupAnchor;

  return { anchor, stdout, stderr, spawnTarget, signalGroup, terminateGroup, targetExit: resolveTarget };
}

function input(overrides: Partial<TaskOutputLiveTransportInput> = {}): TaskOutputLiveTransportInput {
  return {
    containerId,
    tail: 25,
    follow: true,
    cwd: '/fixture/custody-dir',
    signal: new AbortController().signal,
    limits: { termGraceMs: 5, reapObservationMs: 5, streamCloseMs: 20 },
    onChunk: async () => undefined,
    ...overrides,
  };
}

function anchorFactory(anchor: FakeAnchor): NonNullable<TaskOutputLiveTransportHooks['createAnchor']> {
  return async () => ({ ok: true, anchor: anchor.anchor }) as CreateProcessGroupAnchorResult;
}

describe('task output live transport', () => {
  it('does not report CLOSED when observer exit wins before a final sink rejection', async () => {
    const fake = createFakeAnchor();
    let rejectWrite!: (error: Error) => void;
    const writing = new Promise<void>((_resolve, reject) => { rejectWrite = reject; });
    const terminate = fake.terminateGroup.getMockImplementation()!;
    fake.terminateGroup.mockImplementationOnce(async () => {
      const proof = await terminate();
      rejectWrite(new Error('fixture final delivery rejected'));
      return proof;
    });
    const sink = vi.fn(() => writing);
    const run = streamTaskOutputLive(input({ onChunk: sink }), { createAnchor: anchorFactory(fake) });
    await vi.waitFor(() => expect(fake.spawnTarget).toHaveBeenCalledOnce());
    fake.stdout.write(Buffer.from('final bytes'));
    await vi.waitFor(() => expect(sink).toHaveBeenCalledOnce());
    fake.targetExit({ code: 0, signal: null });
    await expect(run).resolves.toMatchObject({ kind: 'unavailable', reason: 'sink-failed' });
  });
  it('does not spawn when pre-aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const factory = vi.fn();

    await expect(streamTaskOutputLive(input({ signal: controller.signal }), { createAnchor: factory })).resolves.toMatchObject({
      kind: 'aborted',
      phase: 'before-spawn',
      cleanup: { attempted: false },
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects invalid container syntax before it can be mistaken for authorization', async () => {
    const factory = vi.fn();

    await expect(streamTaskOutputLive(input({ containerId: 'short' }), { createAnchor: factory })).resolves.toMatchObject({
      kind: 'unavailable',
      reason: 'invalid-request',
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('uses a single bounded docker logs observer and preserves stdout/stderr identity with awaited sinks', async () => {
    const fake = createFakeAnchor();
    const received: Array<{ bytes: string; stream: string }> = [];
    const run = streamTaskOutputLive(input({
      onChunk: async (bytes, stream) => {
        await Promise.resolve();
        received.push({ bytes: Buffer.from(bytes).toString('utf8'), stream });
      },
    }), { createAnchor: anchorFactory(fake) });

    await vi.waitFor(() => expect(fake.spawnTarget).toHaveBeenCalledOnce());
    expect(fake.spawnTarget).toHaveBeenCalledWith({
      command: 'docker',
      args: ['logs', '--tail', '25', '--follow', containerId],
      cwd: '/fixture/custody-dir',
    });
    fake.stdout.write(Buffer.from('out'));
    fake.stderr.write(Buffer.from('err'));
    fake.targetExit({ code: 0, signal: null });

    await expect(run).resolves.toEqual({
      kind: 'closed',
      observer: { code: 0, signal: null },
      cleanup: { attempted: true, termSent: false, killSent: true, anchorExited: true, groupEmpty: true },
      resources: { readerCount: 2, readersSettled: true, abortListenerRemoved: true, escalationTimerActive: false },
    });
    expect(received).toEqual(expect.arrayContaining([
      { bytes: 'out', stream: 'stdout' },
      { bytes: 'err', stream: 'stderr' },
    ]));
    expect(fake.terminateGroup).toHaveBeenCalledOnce();
  });

  it('does not miss an abort while observer spawn is still pending', async () => {
    const fake = createFakeAnchor();
    let resolveSpawn!: (value: { ok: true; pid: number }) => void;
    const deferredSpawn = vi.fn(() => new Promise<{ ok: true; pid: number }>((resolve) => { resolveSpawn = resolve; }));
    Object.assign(fake.anchor, { spawnTarget: deferredSpawn });
    const controller = new AbortController();
    const run = streamTaskOutputLive(input({ signal: controller.signal }), { createAnchor: anchorFactory(fake) });

    await vi.waitFor(() => expect(deferredSpawn).toHaveBeenCalledOnce());
    controller.abort();

    await expect(run).resolves.toMatchObject({
      kind: 'aborted',
      phase: 'before-spawn',
      cleanup: { anchorExited: true, groupEmpty: true },
    });
    resolveSpawn({ ok: true, pid: 42 });
  });

  it('returns observer failure rather than task success for a nonzero logs client exit', async () => {
    const fake = createFakeAnchor();
    const run = streamTaskOutputLive(input({ follow: false }), { createAnchor: anchorFactory(fake) });

    await vi.waitFor(() => expect(fake.spawnTarget).toHaveBeenCalledOnce());
    fake.stdout.end();
    fake.stderr.end();
    fake.targetExit({ code: 2, signal: null });

    await expect(run).resolves.toMatchObject({
      kind: 'unavailable',
      reason: 'observer-exit',
      observer: { code: 2, signal: null },
      cleanup: { anchorExited: true, groupEmpty: true },
    });

    const signalled = createFakeAnchor();
    const signalRun = streamTaskOutputLive(input(), { createAnchor: anchorFactory(signalled) });
    await vi.waitFor(() => expect(signalled.spawnTarget).toHaveBeenCalledOnce());
    signalled.stdout.end();
    signalled.stderr.end();
    signalled.targetExit({ code: null, signal: 'SIGTERM' });
    await expect(signalRun).resolves.toMatchObject({
      kind: 'unavailable',
      reason: 'observer-exit',
      observer: { code: null, signal: 'SIGTERM' },
    });
  });

  it('TERM-then-reaps only the logs client on abort and exposes settled resources', async () => {
    const fake = createFakeAnchor();
    const controller = new AbortController();
    const run = streamTaskOutputLive(input({ signal: controller.signal }), { createAnchor: anchorFactory(fake) });

    await vi.waitFor(() => expect(fake.spawnTarget).toHaveBeenCalledOnce());
    controller.abort();

    await expect(run).resolves.toMatchObject({
      kind: 'aborted',
      phase: 'running',
      cleanup: { termSent: true, killSent: true, anchorExited: true, groupEmpty: true },
      resources: { readerCount: 2, readersSettled: true, abortListenerRemoved: true, escalationTimerActive: false },
    });
    expect(fake.signalGroup).toHaveBeenCalledWith('SIGTERM');
    expect(fake.terminateGroup).toHaveBeenCalledOnce();
  });

  it('holds when a sink fails and never swallows an unproven group reap', async () => {
    const fake = createFakeAnchor({ cleanup: { anchorExited: false, groupEmpty: false, signalled: true } });
    const run = streamTaskOutputLive(input({
      onChunk: async () => { throw new Error('fixture sink failure'); },
    }), { createAnchor: anchorFactory(fake) });

    await vi.waitFor(() => expect(fake.spawnTarget).toHaveBeenCalledOnce());
    fake.stdout.write(Buffer.from('data'));

    await expect(run).resolves.toMatchObject({
      kind: 'unavailable',
      reason: 'cleanup-unproven',
      cleanup: { anchorExited: false, groupEmpty: false },
    });
  });

  it('never reports closed after a slow sink requires forced reader destruction', async () => {
    const fake = createFakeAnchor();
    const run = streamTaskOutputLive(input({
      limits: { termGraceMs: 5, reapObservationMs: 5, streamCloseMs: 5 },
      onChunk: () => new Promise<void>(() => undefined),
    }), { createAnchor: anchorFactory(fake) });

    await vi.waitFor(() => expect(fake.spawnTarget).toHaveBeenCalledOnce());
    fake.stdout.write(Buffer.from('slow'));
    fake.targetExit({ code: 0, signal: null });

    await expect(run).resolves.toMatchObject({
      kind: 'unavailable',
      reason: 'stream-close-timeout',
      resources: { readersSettled: false, escalationTimerActive: false },
    });
  });

  it('reports the native ownership seam as unavailable instead of a guessed Windows fallback', async () => {
    const unavailable = vi.fn(async () => ({
      ok: false as const,
      reason: 'unsupported-platform' as const,
      message: 'fixture Job Object adapter absent',
      anchorPid: null,
      anchorExited: null,
    }));

    await expect(streamTaskOutputLive(input(), { createAnchor: unavailable })).resolves.toMatchObject({
      kind: 'unavailable',
      reason: 'unsupported-platform',
      cleanup: { attempted: false },
    });
  });
});
