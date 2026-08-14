import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

function flushFile(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function flushPublishedDirectory(filePath: string): void {
  // POSIX requires the containing directory to be fsynced for a newly linked
  // name to survive power loss. Windows does not expose directory handles via
  // Node's openSync; flushFile(filePath) above maps to FlushFileBuffers and is
  // the strongest portable file-publication primitive available there.
  if (process.platform === 'win32') return;
  const fd = openSync(dirname(filePath), 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/**
 * Publish JSON at `filePath` with first-writer-wins semantics.
 *
 * The fully-written temporary file is linked into the final path. Creating a
 * hard link is an atomic, non-replacing directory operation on local POSIX and
 * NTFS filesystems: one concurrent writer wins, every later writer receives
 * EEXIST, and readers never observe a partially-written final file.
 *
 * Returns `true` for the winner and `false` only when the final path already
 * exists. Any other filesystem capability/error is surfaced fail-loud; approval
 * authority must never degrade to replace-on-write semantics.
 */
function publishFileFirstWriterWins(filePath: string, content: string | Buffer): boolean {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    const tmpFd = openSync(tmpPath, 'wx', 0o600);
    try {
      // A string writes as utf-8 (Node's default); a Buffer writes verbatim —
      // this is the sole difference between the JSON and raw publication paths.
      writeFileSync(tmpFd, content);
      fsyncSync(tmpFd);
    } finally {
      closeSync(tmpFd);
    }
    try {
      linkSync(tmpPath, filePath);
      // Never return authority from page-cache publication alone. The final
      // inode and (where supported) directory entry are durable first.
      flushFile(filePath);
      flushPublishedDirectory(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        // A loser may have observed a winner between link and its durability
        // flush (or after the winner crashed). Flush the existing authority
        // before returning it to the caller as a trustworthy prior winner.
        flushFile(filePath);
        flushPublishedDirectory(filePath);
        return false;
      }
      throw error;
    }
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // The temp may not have been created, or cleanup may race with external
      // maintenance. The final path is never removed or replaced here.
    }
  }
}

export function createJsonFileFirstWriterWins(filePath: string, data: unknown): boolean {
  return publishFileFirstWriterWins(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Publish raw bytes at `filePath` with the identical first-writer-wins,
 * fsync-durable, non-replacing semantics as {@link createJsonFileFirstWriterWins}.
 * Used for host-decoded evidence snapshots that the sandboxed verifier reads with
 * a bare `cat` — no interpreter, no base64 — so adjudication never depends on
 * which interpreters happen to exist in a provider's container image.
 */
export function createRawFileFirstWriterWins(filePath: string, content: Buffer): boolean {
  return publishFileFirstWriterWins(filePath, content);
}
