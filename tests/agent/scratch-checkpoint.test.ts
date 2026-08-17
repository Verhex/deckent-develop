import { afterEach, describe, expect, it } from 'vitest';
import { lstatSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openScratchStore, type ScratchCheckpointPayload, type ScratchStore } from '../../src/agent/scratch-checkpoint.js';
import { Transcript } from '../../src/agent/transcript.js';

const stores: ScratchStore[] = [];
const payload = (n = 1): ScratchCheckpointPayload => ({
  schemaVersion: 1, objective: `objective-${n}`, findings: [], evidenceRefs: [], decisions: [], unresolved: [],
  nextActions: [], inspectedAreas: [], toolResultDigests: [], cumulativeCounters: { toolCalls: n }, createdAt: new Date().toISOString(),
});

describe('transcript epoch and exactly-once metadata', () => {
  it('rejects an immediate duplicate in one turnId and records origin', () => {
    const transcript = new Transcript();
    expect(transcript.appendUser('same', { turnId: 't-1', origin: 'user' })).toEqual({ status: 'appended' });
    expect(transcript.appendUser('same', { turnId: 't-1', origin: 'replay' })).toEqual({
      status: 'duplicate', reason: 'immediate-user-content-hash-match',
    });
    expect(transcript.toEntries()[0]).toMatchObject({ turnId: 't-1', origin: 'user' });
  });

  it('compacts to checkpoint lineage without orphaning tool results', () => {
    const transcript = new Transcript();
    transcript.appendUser('objective', { turnId: 't-1', origin: 'user' });
    for (let n = 0; n < 12; n++) {
      transcript.appendAssistant('', [{ id: `call-${n}`, name: 'read', args: {} }]);
      transcript.appendToolResult(`call-${n}`, `result-${n}`);
    }
    transcript.compactForContextEpoch('objective', JSON.stringify(payload(12)), 'epoch-2', 8);
    const messages = transcript.toProviderMessages();
    for (const [index, message] of messages.entries()) {
      if (message.role !== 'tool') continue;
      expect(messages.slice(0, index).some((candidate) =>
        candidate.role === 'assistant' && candidate.toolCalls?.some((call) => call.id === message.toolCallId),
      )).toBe(true);
    }
    expect(messages[1]!.content).toContain('"toolCalls":12');
  });
});
const open = (): ScratchStore => { const store = openScratchStore({ tenantId: 'tenant', projectId: 'project', sessionId: crypto.randomUUID() }); stores.push(store); return store; };
afterEach(() => { for (const store of stores.splice(0)) { try { store.close({ policy: 'delete' }); } catch { /* already closed */ } } });

describe('scratch checkpoint store', () => {
  it('atomically writes mode-protected data and verifies its checksum', () => {
    const store = open(); const receipt = store.writeCheckpoint(payload());
    expect(receipt.path.startsWith(store.info.root)).toBe(true);
    expect(store.readLatestCheckpoint()).toMatchObject({ status: 'ok', receipt });
    if (process.platform !== 'win32') expect(lstatSync(receipt.path).mode & 0o777).toBe(0o600);
  });

  it('returns typed corruption instead of throwing', () => {
    const store = open(); const receipt = store.writeCheckpoint(payload());
    writeFileSync(receipt.path, readFileSync(receipt.path, 'utf8').replace('objective-1', 'tampered'));
    expect(store.readLatestCheckpoint()).toMatchObject({ status: 'corrupt', reason: 'checksum mismatch' });
  });

  it('retains only the latest five checkpoints', () => {
    const store = open(); for (let n = 1; n <= 7; n++) store.writeCheckpoint(payload(n));
    expect(readdirSync(join(store.info.root, 'checkpoints'))).toHaveLength(5);
    expect(store.readLatestCheckpoint()).toMatchObject({ status: 'ok', payload: { objective: 'objective-7' } });
  });

  it('rejects unsafe identity paths and symlink checkpoint targets', () => {
    expect(() => openScratchStore({ tenantId: '..', projectId: 'p', sessionId: 's' })).toThrow('invalid tenantId');
    const store = open();
    rmSync(join(store.info.root, 'checkpoints'), { recursive: true });
    symlinkSync(store.info.root, join(store.info.root, 'checkpoints'));
    expect(() => store.writeCheckpoint(payload())).toThrow('symlink');
  });
});
