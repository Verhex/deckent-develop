import { randomUUID } from 'node:crypto';
import { linkSync, unlinkSync, writeFileSync } from 'node:fs';

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
export function createJsonFileFirstWriterWins(filePath: string, data: unknown): boolean {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', {
      encoding: 'utf-8',
      flag: 'wx',
      mode: 0o600,
    });
    try {
      linkSync(tmpPath, filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
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
