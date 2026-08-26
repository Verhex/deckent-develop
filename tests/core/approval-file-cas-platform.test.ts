import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ApprovalFileCasError,
  createPrivateJsonFileFirstWriterWins,
  enforcePrivateApprovalFile,
  readRevisionedJson,
  replaceRevisionedJson,
  withApprovalFileLock,
  type SpawnedAclProcessLike,
} from '../../src/core/approval-file-cas.js';

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'deckent-approval-cas-'));
  roots.push(value);
  return value;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function aclProcess(exitCode: number): SpawnedAclProcessLike {
  const child = new EventEmitter() as SpawnedAclProcessLike;
  child.stderr = null;
  queueMicrotask(() => child.emit('close', exitCode));
  return child;
}

describe('approval private cross-platform CAS adapter', () => {
  it('proves privacy before first-writer-wins publication', async () => {
    const dir = await root();
    const path = join(dir, 'request.json');
    await expect(createPrivateJsonFileFirstWriterWins(path, { id: 1 }))
      .resolves.toEqual({ state: 'VERIFIED', created: true });
    await expect(createPrivateJsonFileFirstWriterWins(path, { id: 2 }))
      .resolves.toEqual({ state: 'VERIFIED', created: false });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ id: 1 });

    const heldPath = join(dir, 'held.json');
    await expect(createPrivateJsonFileFirstWriterWins(heldPath, { secret: true }, {
      platform: 'win32', username: '',
    })).resolves.toEqual({ state: 'HOLD', platform: 'win32', reasonCode: 'windows-username-unavailable' });
    await expect(readFile(heldPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('publishes a revisioned file durably with owner-only POSIX mode', async () => {
    const dir = await root();
    const path = join(dir, 'state.json');

    const revision = await withApprovalFileLock(path, () => replaceRevisionedJson(path, 0, { pending: 1 }));

    expect(revision).toBe(1);
    expect(readRevisionedJson<{ pending: number }>(path)).toEqual({ revision: 1, value: { pending: 1 } });
    expect((await stat(path)).mode & 0o077).toBe(0);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ revision: 1, value: { pending: 1 } });
  });

  it('rejects a stale revision instead of clamping or replacing the winner', async () => {
    const dir = await root();
    const path = join(dir, 'state.json');
    await withApprovalFileLock(path, () => replaceRevisionedJson(path, 0, { winner: 1 }));

    await expect(withApprovalFileLock(path, () => replaceRevisionedJson(path, 0, { loser: 1 })))
      .rejects.toMatchObject<Partial<ApprovalFileCasError>>({ reasonCode: 'revision-conflict' });
    expect(readRevisionedJson(path)?.value).toEqual({ winner: 1 });
  });

  it('serializes concurrent writers and requires reload under the lock', async () => {
    const dir = await root();
    const path = join(dir, 'state.json');
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = withApprovalFileLock(path, async () => {
      order.push('first-enter');
      await firstGate;
      order.push('first-exit');
    });
    const second = withApprovalFileLock(path, () => { order.push('second-enter'); });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(order).toEqual(['first-enter']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-enter', 'first-exit', 'second-enter']);
  });

  it('returns typed Windows ACL outcomes using async icacls', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const verified = await enforcePrivateApprovalFile('C:\\state.json', {
      platform: 'win32',
      username: 'deckent-user',
      spawnImpl: (command, args) => {
        calls.push({ command, args });
        return aclProcess(0);
      },
    });
    expect(verified).toEqual({ state: 'VERIFIED', platform: 'win32' });
    expect(calls).toEqual([{
      command: 'icacls',
      args: ['C:\\state.json', '/inheritance:r', '/grant:r', 'deckent-user:F'],
    }]);

    await expect(enforcePrivateApprovalFile('C:\\state.json', { platform: 'win32', username: '' }))
      .resolves.toEqual({ state: 'HOLD', platform: 'win32', reasonCode: 'windows-username-unavailable' });
    await expect(enforcePrivateApprovalFile('C:\\state.json', {
      platform: 'win32', username: 'deckent-user', spawnImpl: () => aclProcess(5),
    })).resolves.toEqual({ state: 'HOLD', platform: 'win32', reasonCode: 'windows-icacls-failed' });
  });

  it('fails honestly on a platform whose private ACL cannot be proven', async () => {
    await expect(enforcePrivateApprovalFile('/state.json', { platform: 'haiku' as NodeJS.Platform }))
      .resolves.toEqual({ state: 'HOLD', platform: 'haiku', reasonCode: 'unsupported-private-acl' });
  });
});
