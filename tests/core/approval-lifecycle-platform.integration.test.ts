import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createPrivateJsonFileFirstWriterWins } from '../../src/core/approval-file-cas.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('approval lifecycle private publication platform matrix', () => {
  it('publishes POSIX authority at 0600', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-d4-posix-'));
    roots.push(root);
    const path = join(root, 'nested', 'request.json');
    await expect(createPrivateJsonFileFirstWriterWins(path, { value: 1 }, { platform: 'linux' }))
      .resolves.toEqual({ state: 'VERIFIED', created: true });
    expect(statSync(path).mode & 0o077).toBe(0);
  });

  it('requires a successful Windows icacls proof before publication', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-d4-windows-'));
    roots.push(root);
    const path = join(root, 'request.json');
    await expect(createPrivateJsonFileFirstWriterWins(path, { value: 1 }, {
      platform: 'win32', username: 'deckent-test',
      spawnImpl: () => {
        const process = new EventEmitter() as EventEmitter & { stderr: null };
        process.stderr = null;
        queueMicrotask(() => process.emit('close', 0));
        return process;
      },
    })).resolves.toEqual({ state: 'VERIFIED', created: true });
  });

  it('publishes nothing when the platform cannot prove privacy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-d4-hold-'));
    roots.push(root);
    const path = join(root, 'request.json');
    await expect(createPrivateJsonFileFirstWriterWins(path, { value: 1 }, { platform: 'haiku' as NodeJS.Platform }))
      .resolves.toMatchObject({ state: 'HOLD', reasonCode: 'unsupported-private-acl' });
    expect(existsSync(path)).toBe(false);
  });
});
