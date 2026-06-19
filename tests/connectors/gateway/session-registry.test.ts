// tests/connectors/gateway/session-registry.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSessionRegistry } from '../../../src/connectors/gateway/session-registry.js';

async function tmpPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gw-sess-'));
  return join(dir, 'sessions.json');
}

describe('SessionRegistry', () => {
  it('binds, resolves, persists, and reloads', async () => {
    const path = await tmpPath();
    const reg = await loadSessionRegistry({ path, now: () => '2026-06-20T00:00:00Z' });
    await reg.bind('telegram:42', '/foo', 'telegram:42');
    expect(reg.resolve('telegram:42')?.projectPath).toBe('/foo');

    // Persisted to disk and reloaded by a fresh instance.
    const reg2 = await loadSessionRegistry({ path });
    expect(reg2.resolve('telegram:42')?.projectPath).toBe('/foo');
    expect(reg2.list()).toHaveLength(1);
  });

  it('unbinds', async () => {
    const path = await tmpPath();
    const reg = await loadSessionRegistry({ path });
    await reg.bind('telegram:7', '/bar', 'telegram:7');
    expect(await reg.unbind('telegram:7')).toBe(true);
    expect(reg.resolve('telegram:7')).toBeUndefined();
    expect(await reg.unbind('telegram:7')).toBe(false);
  });

  it('treats a corrupt file as empty (fail-safe)', async () => {
    const path = await tmpPath();
    await writeFile(path, '{ this is not json', 'utf-8');
    const reg = await loadSessionRegistry({ path });
    expect(reg.list()).toEqual([]);
  });

  it('writes atomically (no leftover temp file in the json)', async () => {
    const path = await tmpPath();
    const reg = await loadSessionRegistry({ path });
    await reg.bind('telegram:1', '/p', 'telegram:1');
    const raw = JSON.parse(await readFile(path, 'utf-8'));
    expect(raw['telegram:1'].projectPath).toBe('/p');
  });
});
