import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, realpath, opendir, open, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { referenceJournalKey, assertReferenceJournalIdentity } from './reference-digest-journal.js';
import { ReferenceDigestError } from './reference-digest-types.js';
import type { DurableReferenceJournal } from './reference-digest-runner-types.js';
import type { ScratchStoreInfo } from './scratch-checkpoint.js';

const sha = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const failed = (): never => { throw new ReferenceDigestError('REFERENCE_STORE_FAILED'); };
/** Append-only, bounded manifests IN the existing scratch namespace. Node bytes live
 * exclusively in SessionToolContentStore. Exclusive hard-link publication prevents two
 * session owners from silently overwriting a revision; partial temp files are never read. */
export async function openReferenceDigestJournal(scratch: ScratchStoreInfo, initial: DurableReferenceJournal,
  limits: { maxEntries: number; maxBytes: number }) {
  if (![limits.maxEntries, limits.maxBytes].every(n => Number.isSafeInteger(n) && n > 0)) failed();
  const key = referenceJournalKey(initial.identity);
  const root = await realpath(scratch.root);
  const parent = await lstat(scratch.root);
  if (!parent.isDirectory() || parent.isSymbolicLink()) failed();
  const dir = join(root, `reference-${key}`);
  await mkdir(dir, { mode: 0o700 }).catch(e => { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; });
  const owned = await lstat(dir);
  if (!owned.isDirectory() || owned.isSymbolicLink()) failed();
  async function assertCustody(): Promise<void> {
    const currentParent = await lstat(scratch.root), current = await lstat(dir);
    if (currentParent.dev !== parent.dev || currentParent.ino !== parent.ino || currentParent.isSymbolicLink()
      || await realpath(scratch.root) !== root || current.dev !== owned.dev || current.ino !== owned.ino || current.isSymbolicLink()) failed();
  }
  async function read(path: string): Promise<string> {
    await assertCustody();
    const st = await lstat(path);
    if (!st.isFile() || st.isSymbolicLink() || st.size > limits.maxBytes) failed();
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const actual = await file.stat();
      if (actual.dev !== st.dev || actual.ino !== st.ino || actual.size !== st.size) failed();
      const bytes = await file.readFile();
      if (bytes.length !== st.size) failed();
      await assertCustody();
      return bytes.toString('utf8');
    } finally { await file.close(); }
  }
  const names: string[] = [];
  // Count before reading payloads. Never traverse an unbounded foreign directory.
  let scanned = 0;
  for await (const entry of await opendir(dir)) {
    if (++scanned > limits.maxEntries * 2) failed();
    const name = entry.name;
    if (/^\d{10}\.json$/.test(name)) names.push(name);
    else if (!/^\.pending-[a-f0-9-]+$/.test(name)) failed();
  }
  names.sort();
  let revision = 0, previous: string | null = null, state = structuredClone(initial);
  for (const name of names) {
    if (name !== `${String(revision).padStart(10, '0')}.json` || revision >= limits.maxEntries) failed();
    const raw = await read(join(dir, name));
    let envelope: { previous: string | null; state: DurableReferenceJournal; digest: string };
    try { envelope = JSON.parse(raw) as typeof envelope; } catch { return failed(); }
    if (envelope.previous !== previous || envelope.digest !== sha(JSON.stringify([envelope.previous, envelope.state]))) failed();
    assertReferenceJournalIdentity(envelope.state.identity, initial.identity);
    if (envelope.state.planDigest !== initial.planDigest) throw new ReferenceDigestError('REFERENCE_JOURNAL_MISMATCH');
    state = envelope.state; previous = envelope.digest; revision++;
  }
  let queue: Promise<unknown> = Promise.resolve();
  return {
    ref: `reference-journal:${key}`,
    snapshot: (): DurableReferenceJournal => structuredClone(state),
    update(mutate: (next: DurableReferenceJournal) => void): Promise<void> {
      const operation = queue.then(async () => {
        await assertCustody();
        if (revision >= limits.maxEntries) failed();
        const next = structuredClone(state); mutate(next);
        assertReferenceJournalIdentity(next.identity, initial.identity);
        if (next.planDigest !== initial.planDigest) failed();
        const digest = sha(JSON.stringify([previous, next]));
        const raw = JSON.stringify({ previous, state: next, digest });
        if (Buffer.byteLength(raw) > limits.maxBytes) failed();
        const temp = join(dir, `.pending-${randomUUID()}`);
        const file = await open(temp, 'wx', 0o600);
        try { await file.writeFile(raw); await file.sync(); } finally { await file.close(); }
        // The published inode already contains complete, flushed, verified bytes.
        if (await read(temp) !== raw) failed();
        try {
          await link(temp, join(dir, `${String(revision).padStart(10, '0')}.json`));
          // Directory fsync is unsupported on native Windows. File flush and atomic
          // publication still apply there; unsupported filesystems fail at link().
          if (process.platform !== 'win32') { const handle = await open(dir, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
          state = next; previous = digest; revision++;
        } finally { await unlink(temp); }
      });
      queue = operation.catch(() => undefined);
      return operation.catch(error => { if (error instanceof ReferenceDigestError) throw error; return failed(); });
    },
  };
}
