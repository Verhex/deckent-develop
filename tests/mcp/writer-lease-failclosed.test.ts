import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { installWriterLeaseGate } from '../../src/mcp/writer-lease-gate.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'wgate-failclosed-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

// Minimal stub that captures the (possibly gated) handler per tool name.
function makeStub() {
  const handlers = new Map<string, (args: unknown, extra: unknown) => Promise<unknown>>();
  const server = {
    registerTool: (name: string, _config: unknown, cb: (a: unknown, e: unknown) => Promise<unknown>) => {
      handlers.set(name, cb);
      return {};
    },
  } as unknown as McpServer;
  return { server, handlers };
}

describe('installWriterLeaseGate — fail-CLOSED on lease fs-error (born-566)', () => {
  it('denies the write (handler never runs) when the lease check throws an fs-error', async () => {
    // projectRoot is a FILE, so mkdirSync(dirname(leasePath)) throws ENOTDIR → acquire throws.
    const root = sandbox();
    const filePath = join(root, 'not-a-dir');
    writeFileSync(filePath, 'x', 'utf-8');
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: filePath, lang: 'en', isAlive: () => true });
    let handlerRan = false;
    server.registerTool('deckent_start', { annotations: { readOnlyHint: false } }, async () => {
      handlerRan = true;
      return 'ran';
    });
    const out = await handlers.get('deckent_start')!({}, {}) as { isError?: boolean; content: { text: string }[] };
    expect(handlerRan).toBe(false);
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain('WRITER_LEASE_ERROR');
  });

  it('normal lease acquire (no fs-error) still allows the write to proceed', async () => {
    const root = sandbox();
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => true });
    server.registerTool('deckent_start', { annotations: { readOnlyHint: false } }, async () => 'ran');
    await expect(handlers.get('deckent_start')!({}, {})).resolves.toBe('ran');
  });

  it('owner-held live+fresh lease (non-error deny path) is unaffected — still WRITER_LEASE_DENIED', async () => {
    const root = sandbox();
    const iso = new Date(1_700_000_000_000).toISOString();
    writeFileSync(
      join(root, '.deckent', 'mcp-writer.lease'),
      JSON.stringify({ pid: 999_020, acquiredAt: iso, heartbeatAt: iso, ttlMs: 120_000 }),
      'utf-8',
    );
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => true, now: () => 1_700_000_001_000 });
    server.registerTool('deckent_start', { annotations: { readOnlyHint: false } }, async () => 'ran');
    const out = await handlers.get('deckent_start')!({}, {}) as { isError?: boolean; content: { text: string }[] };
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain('WRITER_LEASE_DENIED');
  });
});
