// tests/connectors/gateway/project-registry.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectRegistry } from '../../../src/connectors/gateway/project-registry.js';

async function tmpPath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'gw-proj-')), 'projects.json');
}

describe('ProjectRegistry', () => {
  it('adds and resolves by name OR path', async () => {
    const path = await tmpPath();
    const reg = await loadProjectRegistry({ path });
    await reg.add('foo', '/home/me/foo');
    expect(reg.resolve('foo')?.path).toBe('/home/me/foo');
    expect(reg.resolve('/home/me/foo')?.name).toBe('foo');
    expect(reg.resolve('missing')).toBeUndefined();
  });

  it('persists across reloads and dedupes by name', async () => {
    const path = await tmpPath();
    const reg = await loadProjectRegistry({ path });
    await reg.add('foo', '/a');
    await reg.add('foo', '/b'); // same name updates path
    const reg2 = await loadProjectRegistry({ path });
    expect(reg2.list()).toHaveLength(1);
    expect(reg2.resolve('foo')?.path).toBe('/b');
  });
});
