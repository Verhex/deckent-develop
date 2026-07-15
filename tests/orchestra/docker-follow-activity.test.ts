// SURF-3 S3 — followContainerActivity: live `docker logs -f` → per-tool ACTIVITY.
//
// Hermetic: a FAKE spawnFn returns a fake child whose stdout is a Readable of
// Claude-CLI stream-json lines — the real `docker logs -f` is never run (that
// spawn is the thin, untested shim / honest verification gap). The activity
// mapping (normalize → logEventToActivity → emitWorkerActivity) is exercised
// end-to-end against a real tmpdir event stream.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { followContainerActivity } from '../../src/orchestra/spawn-backend-docker.js';
import { CHANNELS } from '../../src/core/event-stream.js';
import type { ActivityTapContext } from '../../src/agents/worker-activity.js';

const TOOL_USE = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Edit', input: { file_path: 'a.ts' } }] } });
const USAGE = JSON.stringify({ type: 'result', usage: { input_tokens: 1, output_tokens: 1 } });

interface FakeChild extends EventEmitter {
  stdout: Readable;
  kill: () => void;
  killed: boolean;
}

function fakeChildWith(lines: string[]): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = Readable.from(lines.map((l) => `${l}\n`));
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

function readActivity(root: string): Array<Record<string, unknown>> {
  const dir = join(root, '.deckent', 'recently-works');
  if (!existsSync(dir)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(dir, name), 'utf-8').split('\n')) {
      if (line.trim()) out.push(JSON.parse(line) as Record<string, unknown>);
    }
  }
  return out.filter((e) => e['channel'] === CHANNELS.ACTIVITY);
}

/** Wait a tick for the async captureStreamToLog stream to drain. */
const drain = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

describe('followContainerActivity (SURF-3 S3)', () => {
  let root: string;
  const ctx = (enabled: boolean): ActivityTapContext => ({
    projectRoot: root, taskId: 't1', workerId: 'docker-t1', enabled, sprintId: 'sprint-s3',
  });

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'docker-follow-')); mkdirSync(join(root, '.deckent'), { recursive: true }); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('flag ON: each tool_use line in the follow stream lands as a "🔧 …" ACTIVITY event', async () => {
    let spawnArgs: string[] = [];
    const child = fakeChildWith([TOOL_USE, USAGE, TOOL_USE]);
    const spawnFn = ((cmd: string, args: string[]) => { spawnArgs = [cmd, ...args]; return child; }) as never;

    followContainerActivity('cont-1', 'claude', ctx(true), spawnFn);
    await drain();

    // It spawned `docker logs -f cont-1`.
    expect(spawnArgs).toEqual(['docker', 'logs', '-f', 'cont-1']);
    const activity = readActivity(root);
    // 2 tool_use → 2 activity lines; the usage line emits nothing.
    expect(activity).toHaveLength(2);
    expect((activity[0]!['payload'] as Record<string, unknown>)['line']).toBe('🔧 Edit(a.ts)');
  });

  it('flag OFF: never spawns, never emits (zero-cost no-op)', () => {
    let spawned = false;
    const spawnFn = (() => { spawned = true; return fakeChildWith([TOOL_USE]); }) as never;
    const stop = followContainerActivity('cont-2', 'claude', ctx(false), spawnFn);
    stop();
    expect(spawned).toBe(false);
    expect(readActivity(root)).toHaveLength(0);
  });

  it('does NOT write the task .log (activity-only — post-exit writer is authoritative, no double-write)', async () => {
    const child = fakeChildWith([TOOL_USE]);
    const spawnFn = (() => child) as never;
    followContainerActivity('cont-3', 'claude', ctx(true), spawnFn);
    await drain();
    // captureStreamToLog ran with writeLog:false → no task-*.log created by the follow.
    const tasksDir = join(root, '.tasks');
    expect(existsSync(tasksDir) && readdirSync(tasksDir).some((f) => f.endsWith('.log'))).toBeFalsy();
  });

  it('stop() kills the follow child; a spawn that throws degrades to a no-op stop', () => {
    const child = fakeChildWith([TOOL_USE]);
    const stop = followContainerActivity('cont-4', 'claude', ctx(true), ((() => child) as never));
    stop();
    expect(child.killed).toBe(true);

    const throwingSpawn = (() => { throw new Error('docker missing'); }) as never;
    const stop2 = followContainerActivity('cont-5', 'claude', ctx(true), throwingSpawn);
    expect(() => stop2()).not.toThrow();
  });
});
