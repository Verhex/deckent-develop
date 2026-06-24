import { describe, it, expect, vi, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { screenshotCapability } from '../../../src/connectors/capabilities/builtin/screenshot.js';
import type { CapabilityContext, SpawnResult, ArtifactStore, ArtifactRef } from '../../../src/connectors/capabilities/types.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic
function ctx(overrides: Partial<CapabilityContext> & { spawn: CapabilityContext['spawn']; probePlatform?: string }): CapabilityContext {
  return {
    chatKey: 'c', project: '/tmp/p', lang: 'en', config: { enabled: true }, now: 1_700_000_000_000,
    loadMailTransport: async () => { throw new Error('not used'); },
    ...overrides,
  } as CapabilityContext;
}

describe('screenshotCapability', () => {
  afterEach(() => {
    // Clean up the deterministic tmp PNG path written by the darwin mock (ctx.now = 1_700_000_000_000)
    rmSync(join(tmpdir(), 'deckent-ss-1700000000000.png'), { force: true });
  });

  it('darwin: builds `screencapture -x -t png <tmp>` and returns PNG media', async () => {
    const calls: Array<{ cmd: string; args: readonly string[] }> = [];
    const spawn = vi.fn(async (cmd: string, args: readonly string[]): Promise<SpawnResult> => {
      calls.push({ cmd, args });
      // emulate the tool writing the PNG to the last arg path:
      const { writeFileSync } = await import('node:fs');
      writeFileSync(args[args.length - 1] as string, PNG);
      return { code: 0, stdout: Buffer.from(''), stderr: '' };
    });
    const res = await screenshotCapability.run({}, ctx({ spawn, platform: 'darwin' } as never));
    expect(calls[0]?.cmd).toBe('screencapture');
    expect(calls[0]?.args).toEqual(expect.arrayContaining(['-x', '-t', 'png']));
    expect(res.media?.[0]?.mime).toBe('image/png');
    expect(res.media?.[0]?.data.subarray(0, 4)).toEqual(PNG.subarray(0, 4));
  });

  it('nonzero exit → honest error text, no media', async () => {
    const spawn = vi.fn(async (): Promise<SpawnResult> => ({ code: 1, stdout: Buffer.from(''), stderr: 'boom' }));
    const res = await screenshotCapability.run({}, ctx({ spawn, platform: 'darwin' } as never));
    expect(res.media).toBeUndefined();
    expect(res.text).toMatch(/failed|başarısız/i);
  });

  it('unsupported platform → honest "not supported", never throws', async () => {
    const spawn = vi.fn();
    const res = await screenshotCapability.run({}, ctx({ spawn, platform: 'aix' } as never));
    expect(res.text).toMatch(/not supported|desteklenmiyor/i);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('registers artifact when ctx.artifacts present, result includes artifacts array with id', async () => {
    const registeredRef: ArtifactRef = { id: 'art_aabb1122', filename: `screenshot-1700000000000.png`, mime: 'image/png', path: '/tmp/art' };
    const fakeStore: ArtifactStore = { register: vi.fn(() => registeredRef), get: vi.fn(() => null) };
    const spawn = vi.fn(async (_cmd: string, args: readonly string[]): Promise<SpawnResult> => {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(args[args.length - 1] as string, PNG);
      return { code: 0, stdout: Buffer.from(''), stderr: '' };
    });
    const res = await screenshotCapability.run({}, ctx({ spawn, platform: 'darwin', artifacts: fakeStore } as never));
    expect(fakeStore.register).toHaveBeenCalledWith('c', expect.objectContaining({ mime: 'image/png' }));
    expect(res.artifacts).toBeDefined();
    expect(res.artifacts?.[0]?.id).toBe('art_aabb1122');
    // media must still be present
    expect(res.media?.[0]?.mime).toBe('image/png');
  });

  it('no artifact registered when ctx.artifacts absent (backward-compat)', async () => {
    const spawn = vi.fn(async (cmd: string, args: readonly string[]): Promise<SpawnResult> => {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(args[args.length - 1] as string, PNG);
      return { code: 0, stdout: Buffer.from(''), stderr: '' };
    });
    const res = await screenshotCapability.run({}, ctx({ spawn, platform: 'darwin' } as never));
    expect(res.artifacts).toBeUndefined();
    expect(res.media?.[0]?.mime).toBe('image/png');
  });
});
