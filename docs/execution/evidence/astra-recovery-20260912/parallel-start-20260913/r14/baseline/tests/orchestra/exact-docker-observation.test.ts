import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => ({ spawn: vi.fn(), worker: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: doubles.spawn }));
vi.mock('node:worker_threads', () => ({ Worker: doubles.worker }));
import { runExactDockerWorkspaceCommand } from '../../src/orchestra/exact-docker-workspace-command.js';
import { isExactDockerReadOnlyObservation, runIsolatedExactDockerReadOnlyObservation, resolveExactDockerObservationRunner } from '../../src/orchestra/exact-docker-container-observation.js';

import { runIsolatedExactDockerCaptureWindow } from '../../src/orchestra/exact-docker-command-transport.js';

const input = (args: string[]) => ({ command: 'docker' as const, args, stdin: new Uint8Array(),
  timeoutMs: 100, stdoutCeiling: 1024, stderrCeiling: 1024 });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('exact read-only daemon observation boundary', () => {
  it.each([
    ['inspect', 'exact-worker'], ['volume', 'inspect', 'exact-volume'], ['image', 'inspect', 'registry.example/team/worker@sha256:abc'],
    ['inspect', '--format', '{{.State.Running}}|{{.State.ExitCode}}', 'exact-worker'],
  ])('accepts bounded read syntax %j', (...args) => {
    expect(isExactDockerReadOnlyObservation(input(args))).toBe(true);
  });
  it.each([
    ['inspect', '--all'], ['inspect', 'a', 'b'], ['volume', 'rm', 'exact-volume'], ['volume', 'create', 'exact-volume'],
    ['image', 'pull', 'image'], ['run', 'image'], ['volume', 'inspect', '--all'],
    ['volume', 'inspect', 'a', 'b'], ['image', 'inspect', 'a;rm'],
  ])('rejects mutation or ambiguous syntax %j', async (...args) => {
    expect(await runIsolatedExactDockerReadOnlyObservation(input(args))).toMatchObject({ error: true, status: null });
    expect(doubles.worker).not.toHaveBeenCalled();
  });
  it('does not return a thread message before the observation thread exits', async () => {
    const worker = new EventEmitter();
    doubles.worker.mockImplementation(function () { return worker; });
    let settled = false;
    const pending = runIsolatedExactDockerReadOnlyObservation(input(['volume', 'inspect', 'v']))
      .then(result => { settled = true; return result; });
    worker.emit('message', { status: 1, signal: null, error: false, overflow: false,
      stdout: new Uint8Array(), stderr: new TextEncoder().encode('no such volume') });
    await Promise.resolve();
    expect(settled).toBe(false);
    worker.emit('exit', 0);
    expect(await pending).toMatchObject({ status: 1, error: false });
  });
  it('waits for child close after a real deadline decision', async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(),
      stdin: Object.assign(new EventEmitter(), { end: vi.fn() }), kill: vi.fn() });
    doubles.spawn.mockReturnValue(child);
    let settled = false;
    const pending = runExactDockerWorkspaceCommand(input(['volume', 'inspect', 'v']))
      .then(result => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).toBe(false);
    child.emit('close', null, 'SIGKILL');
    expect(await pending).toMatchObject({ status: null, error: true, diagnostic: { reason: 'timeout', timeoutMs: 100 } });
  });
});

describe('production recovery observation routing', () => {
  it('preserves injected command runner identity', () => {
    const runner = vi.fn();
    expect(resolveExactDockerObservationRunner(runner)).toBe(runner);
  });
  it('routes full container inspection through observation worker, without coordinator spawn', async () => {
    const worker = new EventEmitter();
    doubles.worker.mockImplementation(function () { return worker; });
    const pending = resolveExactDockerObservationRunner(runExactDockerWorkspaceCommand)(input(['inspect', 'exact-worker']));
    expect(doubles.worker).toHaveBeenCalledOnce();
    expect(doubles.spawn).not.toHaveBeenCalled();
    worker.emit('message', { status: 1, signal: null, error: false, overflow: false, stdout: new Uint8Array(), stderr: new TextEncoder().encode('error: no such object: exact-worker') });
    worker.emit('exit', 0);
    expect(await pending).toMatchObject({status: 1, error: false});
  });
  it('keeps mutation on the owned coordinator command path', async () => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: Object.assign(new EventEmitter(), { end: vi.fn() }), kill: vi.fn() });
    doubles.spawn.mockReturnValue(child);
    const pending = resolveExactDockerObservationRunner(runExactDockerWorkspaceCommand)(input(['volume', 'rm', 'v']));
    expect(doubles.spawn).toHaveBeenCalledOnce();
    expect(doubles.worker).not.toHaveBeenCalled();
    child.emit('close', 0, null);
    expect(await pending).toMatchObject({status: 0, error: false});
  });
});


describe('admitted capture IO window', () => {
  const windowInput = () => ({ helper: input(['run', 'trusted-helper']),
    volumeName: `deckent-xw-${'a'.repeat(48)}`, deadlineUnixMs: 1000 });
  const commandResult = () => ({ status: 0, signal: null, error: false, overflow: false,
    stdout: new Uint8Array(), stderr: new Uint8Array() });
  it('preserves measured completion across delayed parent delivery and waits for retirement', async () => {
    const worker = new EventEmitter(); doubles.worker.mockImplementation(function () { return worker; });
    let settled = false;
    const pending = runIsolatedExactDockerCaptureWindow(windowInput()).then(r => { settled = true; return r; });
    const completedAt = new Date(900).toISOString();
    worker.emit('message', { helper: commandResult(), postGeneration: commandResult(), completedAt });
    await Promise.resolve(); expect(settled).toBe(false);
    expect(doubles.spawn).not.toHaveBeenCalled();
    worker.emit('exit', 0);
    expect(await pending).toMatchObject({completedAt, helper: {status:0}, postGeneration: {status:0}});
  });
  it.each(['bad-post', 'bad-clock', 'worker-error', 'abnormal-exit'])(
    'does not accept %s', async fault => {
      const worker = new EventEmitter(); doubles.worker.mockImplementation(function () { return worker; });
      const pending = runIsolatedExactDockerCaptureWindow(windowInput());
      worker.emit('message', { helper: commandResult(),
        postGeneration: fault === 'bad-post' ? {} : commandResult(),
        completedAt: fault === 'bad-clock' ? 'invalid' : new Date(900).toISOString() });
      if(fault === 'worker-error') worker.emit('error', new Error('failed'));
      worker.emit('exit', fault === 'abnormal-exit' ? 1 : 0);
      expect(await pending).toBeNull();
    });
  it('rejects population stdin and unbound volume targets before creating a thread', async () => {
    expect(await runIsolatedExactDockerCaptureWindow({...windowInput(), volumeName:'--all'})).toBeNull();
    expect(await runIsolatedExactDockerCaptureWindow({...windowInput(), helper:{...input(['run','image']),stdin:new Uint8Array([1])}})).toBeNull();
    expect(doubles.worker).not.toHaveBeenCalled();
  });
});
