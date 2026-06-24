import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityRegistry } from '../../../src/connectors/capabilities/registry.js';
import { runCapability } from '../../../src/connectors/capabilities/execute.js';
import type { Capability, CapabilityContext } from '../../../src/connectors/capabilities/types.js';

function baseCtx(root: string): CapabilityContext {
  return { chatKey: 'c', project: root, lang: 'en', config: { enabled: true }, now: 123,
    spawn: vi.fn() as never, loadMailTransport: async () => { throw new Error('n/a'); } };
}
const mediaCap: Capability = { id: 'shot', titleKey: 't', tier: 'read', defaultPolicy: 'auto', edition: 'solo',
  paramsSchema: z.object({}), preview: () => '', run: async () => ({ text: 'captured',
    media: [{ kind: 'photo', filename: 'x.png', mime: 'image/png', data: Buffer.from([9]) }] }) };

describe('runCapability', () => {
  it('runs capability, sends media via sink out-of-band, returns text-ack, writes audit', () => {
    const root = mkdtempSync(join(tmpdir(), 'cap-exec-'));
    const r = new CapabilityRegistry(); r.register(mediaCap);
    const sink = vi.fn(async () => {});
    return runCapability(r, 'shot', {}, baseCtx(root), 'chan1', sink, 'auto').then((out) => {
      expect(out).toBe('captured');
      expect(sink).toHaveBeenCalledWith('chan1', expect.objectContaining({ kind: 'photo' }));
      const audit = readFileSync(join(root, '.deckent', 'capability-audit.jsonl'), 'utf-8');
      expect(audit).toMatch(/"capId":"shot"/);
      expect(audit).toMatch(/"decision":"auto"/);
      expect(audit).toMatch(/"status":"ok"/);
    });
  });
  it('unknown capability → honest error', async () => {
    const out = await runCapability(new CapabilityRegistry(), 'ghost', {}, baseCtx(mkdtempSync(join(tmpdir(), 'cap-'))), 'c', async () => {}, 'auto');
    expect(out).toMatch(/unknown/i);
  });
  it('invalid args → honest validation error, run not attempted', async () => {
    const r = new CapabilityRegistry();
    const runMock = vi.fn();
    r.register({ ...mediaCap, paramsSchema: z.object({ n: z.number() }), run: runMock as never });
    const out = await runCapability(r, 'shot', { n: 'x' }, baseCtx(mkdtempSync(join(tmpdir(), 'cap-'))), 'c', async () => {}, 'auto');
    expect(out).toMatch(/invalid args/i);
    expect(runMock).not.toHaveBeenCalled();
  });
  it('text-ack includes artifact ids when result.artifacts is non-empty', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cap-art-'));
    const r = new CapabilityRegistry();
    r.register({ ...mediaCap, run: async () => ({ text: 'captured', artifacts: [{ id: 'art_1', filename: 's.png', mime: 'image/png', path: '/tmp/x' }] }) });
    const out = await runCapability(r, 'shot', {}, baseCtx(root), 'c', async () => {}, 'auto');
    expect(out).toMatch(/art_1/);
    expect(out).toMatch(/s\.png/);
  });
});
