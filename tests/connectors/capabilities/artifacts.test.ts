import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtifactStore } from '../../../src/connectors/capabilities/artifacts.js';

describe('artifact store', () => {
  it('registers + retrieves per chatKey; isolates chats; rejects unknown', () => {
    const root = mkdtempSync(join(tmpdir(), 'art-'));
    const store = createArtifactStore(root);
    const ref = store.register('chatA', { filename: 's.png', mime: 'image/png', data: Buffer.from([1, 2]) });
    expect(ref.id).toMatch(/^art_/);
    expect(existsSync(ref.path)).toBe(true);
    expect(store.get('chatA', ref.id)?.filename).toBe('s.png');
    expect(store.get('chatB', ref.id)).toBeNull();   // isolation
    expect(store.get('chatA', 'art_ghost')).toBeNull();
  });

  it('TTL prune: expired artifact returns null on get', () => {
    const root = mkdtempSync(join(tmpdir(), 'art-ttl-'));
    let fakeNow = 0;
    const store = createArtifactStore(root, { ttlMs: 100, now: () => fakeNow });
    const ref = store.register('chatC', { filename: 'x.txt', mime: 'text/plain', data: Buffer.from('hi') });
    // Within TTL — should still be found
    fakeNow = 50;
    expect(store.get('chatC', ref.id)).not.toBeNull();
    // Advance past TTL (mtime is at epoch=0, now=200 → age=200 > ttl=100)
    fakeNow = 200;
    expect(store.get('chatC', ref.id)).toBeNull();
  });

  it('mime is preserved on register and returned on get', () => {
    const root = mkdtempSync(join(tmpdir(), 'art-mime-'));
    const store = createArtifactStore(root);
    const ref = store.register('chatD', { filename: 'doc.pdf', mime: 'application/pdf', data: Buffer.from([0]) });
    expect(ref.mime).toBe('application/pdf');
    const got = store.get('chatD', ref.id);
    expect(got).not.toBeNull();
    // mime is stored in meta, so round-trip is accurate
    expect(got!.mime).toBe('application/pdf');
  });
});
