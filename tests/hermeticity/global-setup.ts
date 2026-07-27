import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readlink } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { physicalAncestorFromModuleUrl } from './runtime-write-guard.js';

const REPO_ROOT = physicalAncestorFromModuleUrl(import.meta.url, 2);
const HASH_CONCURRENCY = 8;
const MAX_SNAPSHOT_ENTRIES = 1_000_000;

export interface TreeEntry {
  path: string;
  type: 'directory' | 'file' | 'symlink' | 'other';
  mode: string;
  size: string;
  mtimeNs: string;
  digest?: string;
  target?: string;
}

export interface TreeSnapshot {
  root: string;
  exists: boolean;
  entries: TreeEntry[];
}

interface FileTypeStats {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

function entryType(stats: FileTypeStats): TreeEntry['type'] {
  if (stats.isDirectory()) return 'directory';
  if (stats.isFile()) return 'file';
  if (stats.isSymbolicLink()) return 'symlink';
  return 'other';
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function digestFile(absolutePath: string): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash('sha256');
    const stream = createReadStream(absolutePath, { highWaterMark: 1024 * 1024 });
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', rejectPromise);
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

export async function snapshotTree(root: string): Promise<TreeSnapshot> {
  const absoluteRoot = resolve(root);
  const entries: TreeEntry[] = [];
  const pending = [absoluteRoot];
  const fileJobs: Array<{
    absolutePath: string;
    entry: TreeEntry;
    size: bigint;
    mtimeNs: bigint;
  }> = [];

  while (pending.length > 0) {
    const absolutePath = pending.pop()!;
    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
      stats = await lstat(absolutePath, { bigint: true });
    } catch (error) {
      if (absolutePath === absoluteRoot && isMissingPathError(error)) {
        return { root: absoluteRoot, exists: false, entries: [] };
      }
      throw error;
    }

    const type = entryType(stats);
    const entry: TreeEntry = {
      path: relative(absoluteRoot, absolutePath).replaceAll('\\', '/') || '.',
      type,
      mode: (stats.mode & 0o7777n).toString(8),
      size: stats.size.toString(),
      mtimeNs: stats.mtimeNs.toString(),
    };

    if (type === 'file') {
      fileJobs.push({
        absolutePath,
        entry,
        size: stats.size,
        mtimeNs: stats.mtimeNs,
      });
    } else if (type === 'symlink') {
      entry.target = await readlink(absolutePath);
    }
    entries.push(entry);
    if (entries.length > MAX_SNAPSHOT_ENTRIES) {
      throw new Error(`E_HERMETIC_SNAPSHOT_BUDGET:entries>${MAX_SNAPSHOT_ENTRIES}`);
    }

    if (type === 'directory') {
      const children = (await readdir(absolutePath))
        .sort((left, right) => left.localeCompare(right));
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push(join(absolutePath, children[index]!));
      }
    }
  }

  let nextJob = 0;
  const hashWorker = async (): Promise<void> => {
    while (nextJob < fileJobs.length) {
      const job = fileJobs[nextJob++]!;
      job.entry.digest = await digestFile(job.absolutePath);
      const after = await lstat(job.absolutePath, { bigint: true });
      if (after.size !== job.size || after.mtimeNs !== job.mtimeNs) {
        throw new Error(`E_HERMETIC_SNAPSHOT_RACE:${job.entry.path}`);
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(HASH_CONCURRENCY, fileJobs.length) },
      () => hashWorker(),
    ),
  );

  return { root: absoluteRoot, exists: true, entries };
}

export function firstSnapshotDifference(
  before: TreeSnapshot,
  after: TreeSnapshot,
): string | undefined {
  if (before.exists !== after.exists) return before.exists ? 'removed:.' : 'created:.';
  const maximum = Math.max(before.entries.length, after.entries.length);
  for (let index = 0; index < maximum; index += 1) {
    const left = before.entries[index];
    const right = after.entries[index];
    if (!left) return `created:${right?.path ?? '.'}`;
    if (!right) return `removed:${left.path}`;
    if (JSON.stringify(left) !== JSON.stringify(right)) return `changed:${left.path}`;
  }
  return undefined;
}

export function assertSnapshotHasNoSymlinks(snapshot: TreeSnapshot): void {
  const symlink = snapshot.entries.find(entry => entry.type === 'symlink');
  if (!symlink) return;
  const error = new Error(`E_HERMETIC_DIST_SYMLINK:${symlink.path}`);
  error.name = 'HermeticDistSymlinkError';
  throw error;
}

export function activateHermeticityEnvironment(): () => void {
  const hadPreviousValue = Object.prototype.hasOwnProperty.call(
    process.env,
    'DECKENT_TEST_HERMETICITY',
  );
  const previousValue = process.env['DECKENT_TEST_HERMETICITY'];
  process.env['DECKENT_TEST_HERMETICITY'] = '1';

  return () => {
    if (hadPreviousValue) process.env['DECKENT_TEST_HERMETICITY'] = previousValue;
    else delete process.env['DECKENT_TEST_HERMETICITY'];
  };
}

export async function beginDistIntegritySession(
  distRoot: string,
  snapshot: (root: string) => Promise<TreeSnapshot> = snapshotTree,
): Promise<() => Promise<void>> {
  const restoreEnvironment = activateHermeticityEnvironment();
  let before: TreeSnapshot;
  try {
    before = await snapshot(distRoot);
    assertSnapshotHasNoSymlinks(before);
  } catch (error) {
    restoreEnvironment();
    throw error;
  }

  return async () => {
    try {
      const after = await snapshot(distRoot);
      assertSnapshotHasNoSymlinks(after);
      const difference = firstSnapshotDifference(before, after);
      if (difference) {
        const error = new Error(`E_HERMETIC_SOURCE_DRIFT:dist:${difference}`);
        error.name = 'HermeticDistIntegrityError';
        throw error;
      }
    } finally {
      restoreEnvironment();
    }
  };
}

export async function setup(): Promise<() => Promise<void>> {
  return beginDistIntegritySession(join(REPO_ROOT, 'dist'));
}
