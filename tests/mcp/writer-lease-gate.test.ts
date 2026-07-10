import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  isWriteCall,
  buildLeaseDenialResponse,
  installWriterLeaseGate,
} from '../../src/mcp/writer-lease-gate.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'wgate-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
function seedOtherOwner(root: string, pid: number): void {
  const iso = new Date(1_700_000_000_000).toISOString();
  writeFileSync(
    join(root, '.deckent', 'mcp-writer.lease'),
    JSON.stringify({ pid, acquiredAt: iso, heartbeatAt: iso, ttlMs: 120_000 }),
    'utf-8',
  );
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

describe('isWriteCall', () => {
  it('non-mixed write tools are always writes', () => {
    expect(isWriteCall('deckent_start', {})).toBe(true);
  });
  it('config read is not a write; config set is', () => {
    expect(isWriteCall('deckent_config', { action: 'read' })).toBe(false);
    expect(isWriteCall('deckent_config', { action: 'set' })).toBe(true);
  });
  it('docs list is read; docs track-scan is write', () => {
    expect(isWriteCall('deckent_docs', { action: 'list' })).toBe(false);
    expect(isWriteCall('deckent_docs', { action: 'track-scan' })).toBe(true);
  });
  it('autonomous approve/reject are writes; status/backlog_list are reads', () => {
    expect(isWriteCall('deckent_autonomous', { action: 'approve' })).toBe(true);
    expect(isWriteCall('deckent_autonomous', { action: 'reject' })).toBe(true);
    expect(isWriteCall('deckent_autonomous', { action: 'status' })).toBe(false);
    expect(isWriteCall('deckent_autonomous', { action: 'backlog_list' })).toBe(false);
  });
});

describe('buildLeaseDenialResponse', () => {
  it('returns a non-throwing tool result with code + ownerPid', () => {
    const res = buildLeaseDenialResponse('deckent_start', 4242, 'en');
    expect(res.isError).toBe(true);
    const text = res.content[0]!.text;
    expect(text).toContain('WRITER_LEASE_DENIED');
    expect(text).toContain('4242');
  });
});

describe('installWriterLeaseGate', () => {
  it('read tools (readOnlyHint:true) run ungated even when another window holds the lease', async () => {
    const root = sandbox();
    seedOtherOwner(root, 999_010);
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => true });
    server.registerTool('deckent_status', { annotations: { readOnlyHint: true } }, async () => 'ran');
    await expect(handlers.get('deckent_status')!({}, {})).resolves.toBe('ran');
  });

  it('write tool is denied when another live window owns the lease', async () => {
    const root = sandbox();
    seedOtherOwner(root, 999_011);
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => true, now: () => 1_700_000_001_000 });
    server.registerTool('deckent_start', { annotations: { readOnlyHint: false } }, async () => 'ran');
    const out = await handlers.get('deckent_start')!({}, {}) as { isError?: boolean; content: { text: string }[] };
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain('WRITER_LEASE_DENIED');
  });

  it('write tool runs after handover (owner dead → steal)', async () => {
    const root = sandbox();
    seedOtherOwner(root, 999_012);
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => false });
    server.registerTool('deckent_start', { annotations: { readOnlyHint: false } }, async () => 'ran');
    await expect(handlers.get('deckent_start')!({}, {})).resolves.toBe('ran');
  });

  it('fails CLOSED (denies the write, isError:true) when the lease cannot be written', async () => {
    // projectRoot is a FILE, so the lease dir under it cannot be created → acquire throws.
    // Spec (born-566, K2-approved): an fs error during the lease check itself must
    // never silently permit an unserialized write — ownership could not be
    // determined, so the write is denied with WRITER_LEASE_ERROR, not run.
    const root = sandbox();
    const filePath = join(root, 'not-a-dir');
    writeFileSync(filePath, 'x', 'utf-8');
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: filePath, lang: 'en', isAlive: () => true });
    server.registerTool('deckent_start', { annotations: { readOnlyHint: false } }, async () => 'ran');
    const out = await handlers.get('deckent_start')!({}, {}) as { isError?: boolean; content: { text: string }[] };
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain('WRITER_LEASE_ERROR');
  });

  it('mixed tool read action runs even when lease is held', async () => {
    const root = sandbox();
    seedOtherOwner(root, 999_013);
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => true });
    server.registerTool('deckent_config', { annotations: { readOnlyHint: false } }, async (a: unknown) => `ran:${(a as { action: string }).action}`);
    await expect(handlers.get('deckent_config')!({ action: 'read' }, {})).resolves.toBe('ran:read');
  });
});
