import { describe, it, expect, vi } from 'vitest';
import { createBuiltinRegistry, buildMediaSink } from '../../../src/connectors/capabilities/index.js';
import { describeCapabilities } from '../../../src/connectors/capabilities/prompt.js';
import { resolvePolicy } from '../../../src/connectors/capabilities/policy.js';

describe('builtin registry', () => {
  it('contains screenshot (read/auto) and send_mail (external/confirm)', () => {
    const r = createBuiltinRegistry();
    expect(r.has('screenshot')).toBe(true);
    expect(r.has('send_mail')).toBe(true);
    expect(r.get('screenshot')?.tier).toBe('read');
    expect(r.get('send_mail')?.defaultPolicy).toBe('confirm');
  });
});

describe('describeCapabilities', () => {
  it('lists only available capabilities (enabled), with ids', () => {
    const r = createBuiltinRegistry();
    const resolve = (id: string) => resolvePolicy(r.get(id)!, { chatKey: 'c', edition: 'solo', config: { enabled: true } });
    const text = describeCapabilities(r, resolve, 'en');
    expect(text).toContain('screenshot');
    expect(text).toContain('send_mail');
  });
  it('returns empty string when master disabled (nothing advertised)', () => {
    const r = createBuiltinRegistry();
    const resolve = (id: string) => resolvePolicy(r.get(id)!, { chatKey: 'c', edition: 'solo', config: { enabled: false } });
    expect(describeCapabilities(r, resolve, 'en')).toBe('');
  });
});

describe('buildMediaSink', () => {
  it('uses connector.sendMedia when present', async () => {
    const sendMedia = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const sink = buildMediaSink({ id: 'telegram', sendMedia } as never, 'en', send);
    await sink('chan', { kind: 'photo', filename: 'x.png', mime: 'image/png', data: Buffer.from([1]) });
    expect(sendMedia).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
  it('falls back to honest text when connector lacks sendMedia', async () => {
    const send = vi.fn(async () => {});
    const sink = buildMediaSink({ id: 'discord' } as never, 'en', send);
    await sink('chan', { kind: 'photo', filename: 'x.png', mime: 'image/png', data: Buffer.from([1]) });
    expect(send).toHaveBeenCalledWith('chan', expect.stringMatching(/cannot display|gösteremiyor/i));
  });
});
