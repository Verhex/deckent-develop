import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtifactStore } from '../../../src/connectors/capabilities/artifacts.js';

const tmpdirs: string[] = [];

function makeRoot(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpdirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpdirs.splice(0)) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('artifact store', () => {
  it('registers + retrieves per chatKey; isolates chats; rejects unknown', () => {
    const root = makeRoot('art-');
    const store = createArtifactStore(root);
    const ref = store.register('chatA', { filename: 's.png', mime: 'image/png', data: Buffer.from([1, 2]) });
    expect(ref.id).toMatch(/^art_/);
    expect(existsSync(ref.path)).toBe(true);
    expect(store.get('chatA', ref.id)?.filename).toBe('s.png');
    expect(store.get('chatB', ref.id)).toBeNull();   // isolation
    expect(store.get('chatA', 'art_ghost')).toBeNull();
  });

  it('TTL prune: expired artifact returns null on get', () => {
    const root = makeRoot('art-ttl-');
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
    const root = makeRoot('art-mime-');
    const store = createArtifactStore(root);
    const ref = store.register('chatD', { filename: 'doc.pdf', mime: 'application/pdf', data: Buffer.from([0]) });
    expect(ref.mime).toBe('application/pdf');
    const got = store.get('chatD', ref.id);
    expect(got).not.toBeNull();
    // mime is stored in meta, so round-trip is accurate
    expect(got!.mime).toBe('application/pdf');
  });

  // --- Security: path traversal hardening ---

  it('SEC: get() with path-traversal id returns null (id format guard)', () => {
    const root = makeRoot('art-sec-id-');
    const store = createArtifactStore(root);
    // Register a valid artifact first so the chatKey dir exists
    store.register('chatE', { filename: 'test.txt', mime: 'text/plain', data: Buffer.from('x') });
    // Adversarial id values — none match ^art_[0-9a-f]{8}$
    expect(store.get('chatE', '../../escape')).toBeNull();
    expect(store.get('chatE', '../../../etc/passwd')).toBeNull();
    expect(store.get('chatE', 'art_../../../../bad')).toBeNull();
    expect(store.get('chatE', '')).toBeNull();
    expect(store.get('chatE', 'art_ghost')).toBeNull(); // valid prefix, wrong length
  });

  it('SEC: chatKey=".." sanitizes to "__" — artifact path stays inside artifacts dir', () => {
    const root = makeRoot('art-sec-ck-');
    const store = createArtifactStore(root);
    const ref = store.register('..', { filename: 'bad.txt', mime: 'text/plain', data: Buffer.from('bad') });
    // The stored path must remain under <root>/.deckent/artifacts/
    const artifactsBase = join(root, '.deckent', 'artifacts');
    expect(ref.path.startsWith(artifactsBase)).toBe(true);
    // Path must NOT contain a /../ traversal segment (normalized path check)
    expect(ref.path).not.toContain('/../');
    // Reading back using valid id also works and returns same safe path
    const got = store.get('..', ref.id);
    expect(got).not.toBeNull();
    expect(got!.path.startsWith(artifactsBase)).toBe(true);
    // The directory created must be inside artifactsBase (__ not ..)
    const dirUsed = join(root, '.deckent', 'artifacts', '__');
    expect(existsSync(dirUsed)).toBe(true);
  });
});
