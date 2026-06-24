import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ArtifactRef, ArtifactStore } from './types.js';

export type { ArtifactStore };

interface MetaRecord {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly dataFile: string;
  readonly createdAt: number;
}

const META_SUFFIX = '.meta.json';

export function createArtifactStore(root: string, opts: { ttlMs?: number; now?: () => number } = {}): ArtifactStore {
  const ttl = opts.ttlMs ?? 3_600_000;
  const now = opts.now ?? (() => Date.now());

  const chatDir = (chatKey: string) =>
    join(root, '.deckent', 'artifacts', encodeURIComponent(chatKey));

  /** Prune expired entries in a chatKey directory. */
  const prune = (chatKey: string): void => {
    const d = chatDir(chatKey);
    if (!existsSync(d)) return;
    const currentNow = now();
    for (const f of readdirSync(d)) {
      if (!f.endsWith(META_SUFFIX)) continue;
      const metaPath = join(d, f);
      try {
        const meta: MetaRecord = JSON.parse(readFileSync(metaPath, 'utf8'));
        if (currentNow - meta.createdAt > ttl) {
          // Remove data file + meta file
          try { rmSync(join(d, meta.dataFile), { force: true }); } catch { /* ignore */ }
          rmSync(metaPath, { force: true });
        }
      } catch {
        // Corrupt meta — remove it
        try { rmSync(metaPath, { force: true }); } catch { /* ignore */ }
      }
    }
  };

  return {
    register(chatKey, a): ArtifactRef {
      const d = chatDir(chatKey);
      mkdirSync(d, { recursive: true });
      const id = `art_${randomBytes(4).toString('hex')}`;
      const safeFilename = a.filename.replace(/[^\w.\-]/g, '_');
      const dataFile = `${id}__${safeFilename}`;
      const dataPath = join(d, dataFile);
      writeFileSync(dataPath, a.data);
      const meta: MetaRecord = { id, filename: a.filename, mime: a.mime, dataFile, createdAt: now() };
      writeFileSync(join(d, `${id}${META_SUFFIX}`), JSON.stringify(meta));
      return { id, filename: a.filename, mime: a.mime, path: dataPath };
    },

    get(chatKey, id): ArtifactRef | null {
      prune(chatKey);
      const d = chatDir(chatKey);
      if (!existsSync(d)) return null;
      const metaPath = join(d, `${id}${META_SUFFIX}`);
      if (!existsSync(metaPath)) return null;
      try {
        const meta: MetaRecord = JSON.parse(readFileSync(metaPath, 'utf8'));
        const dataPath = join(d, meta.dataFile);
        if (!existsSync(dataPath)) return null;
        return { id: meta.id, filename: meta.filename, mime: meta.mime, path: dataPath };
      } catch {
        return null;
      }
    },
  };
}
