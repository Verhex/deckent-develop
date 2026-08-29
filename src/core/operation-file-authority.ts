import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { Op, resolveOperation } from './operation-catalog/index.js';

let operationAuthorityVerified = false;

function assertOperationAuthority(): void {
  if (operationAuthorityVerified) return;
  const writeOperation = resolveOperation(Op.FsWrite);
  const deleteOperation = resolveOperation(Op.FsDelete);
  if (
    writeOperation.effect !== 'MUTATE_LOCAL'
    || writeOperation.idempotency !== 'KEYED'
    || !writeOperation.capabilities.includes('fs-write')
    || deleteOperation.effect !== 'DESTRUCTIVE'
    || !deleteOperation.capabilities.includes('fs-write')
  ) throw new Error('OPERATION_FILE_AUTHORITY_CATALOG_MISMATCH');
  operationAuthorityVerified = true;
}

function fsyncDirectory(directory: string): void {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(directory, 'r');
    fsyncSync(descriptor);
  } catch {
    // Some Windows/filesystem combinations do not expose directory handles.
    // The file itself was flushed before rename; unsupported directory flush
    // remains an honest platform limitation rather than a silent write skip.
  } finally {
    if (descriptor !== null) {
      try { closeSync(descriptor); } catch { /* preserve primary write result */ }
    }
  }
}

/**
 * Catalog-mediated, keyed atomic local-file replacement. The caller owns the
 * payload schema and replay/conflict policy; this authority owns only the
 * fs-write/fs-delete operation boundary and durable temp-to-rename mechanics.
 */
export function writeOperationFileAtomic(
  targetPath: string,
  bytes: string | Uint8Array,
  mode = 0o600,
): void {
  assertOperationAuthority();
  const directory = dirname(targetPath);
  mkdirSync(directory, { recursive: true });
  const temporary = join(
    directory,
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, 'wx', mode);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporary, targetPath);
    fsyncDirectory(directory);
  } finally {
    if (descriptor !== null) {
      try { closeSync(descriptor); } catch { /* preserve primary failure */ }
    }
    try { unlinkSync(temporary); } catch { /* absent after rename or failed open */ }
  }
}
