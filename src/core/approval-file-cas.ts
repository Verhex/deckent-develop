import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn as nodeSpawn } from 'node:child_process';
import { dirname } from 'node:path';

export type ApprovalFileCasReasonCode =
  | 'lock-timeout'
  | 'unsupported-private-acl'
  | 'windows-username-unavailable'
  | 'windows-icacls-launch-failed'
  | 'windows-icacls-failed'
  | 'posix-private-mode-unverified'
  | 'revision-conflict';

export class ApprovalFileCasError extends Error {
  constructor(
    public readonly reasonCode: ApprovalFileCasReasonCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApprovalFileCasError';
  }
}

export interface ApprovalFileAclVerified {
  readonly state: 'VERIFIED';
  readonly platform: NodeJS.Platform;
}

export interface ApprovalFileAclHold {
  readonly state: 'HOLD';
  readonly platform: NodeJS.Platform;
  readonly reasonCode: Exclude<ApprovalFileCasReasonCode, 'lock-timeout' | 'revision-conflict'>;
}

export function isApprovalFileAclHold(value: unknown): value is ApprovalFileAclHold {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ApprovalFileAclHold>;
  return candidate.state === 'HOLD'
    && typeof candidate.platform === 'string'
    && typeof candidate.reasonCode === 'string';
}

export type ApprovalFileAclResult = ApprovalFileAclVerified | ApprovalFileAclHold;

export interface SpawnedAclProcessLike {
  stderr: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export type ApprovalFileAclSpawn = (command: string, args: string[]) => SpawnedAclProcessLike;

export interface ApprovalFileAclOptions {
  readonly platform?: NodeJS.Platform;
  readonly username?: string;
  readonly spawnImpl?: ApprovalFileAclSpawn;
}

export type ApprovalPrivateCreateResult =
  | { readonly state: 'VERIFIED'; readonly created: boolean }
  | ApprovalFileAclHold;

const POSIX_ACL_PLATFORMS = new Set<NodeJS.Platform>([
  'aix', 'android', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos',
]);

/**
 * Prove that a durable authority file is private on the active platform.
 * Unsupported or unverifiable platforms return a typed HOLD; approval state
 * never silently proceeds with public permissions.
 */
export async function enforcePrivateApprovalFile(
  filePath: string,
  options: ApprovalFileAclOptions = {},
): Promise<ApprovalFileAclResult> {
  const platform = options.platform ?? process.platform;
  if (POSIX_ACL_PLATFORMS.has(platform)) {
    try {
      chmodSync(filePath, 0o600);
      if ((statSync(filePath).mode & 0o077) !== 0) {
        return { state: 'HOLD', platform, reasonCode: 'posix-private-mode-unverified' };
      }
      return { state: 'VERIFIED', platform };
    } catch {
      return { state: 'HOLD', platform, reasonCode: 'posix-private-mode-unverified' };
    }
  }
  if (platform !== 'win32') {
    return { state: 'HOLD', platform, reasonCode: 'unsupported-private-acl' };
  }

  const username = options.username ?? process.env['USERNAME'];
  if (!username) {
    return { state: 'HOLD', platform, reasonCode: 'windows-username-unavailable' };
  }
  const spawn: ApprovalFileAclSpawn = options.spawnImpl
    ?? ((command, args) => nodeSpawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] }));
  return await new Promise<ApprovalFileAclResult>((resolve) => {
    let settled = false;
    const finish = (result: ApprovalFileAclResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let child: SpawnedAclProcessLike;
    try {
      child = spawn('icacls', [filePath, '/inheritance:r', '/grant:r', `${username}:F`]);
    } catch {
      finish({ state: 'HOLD', platform, reasonCode: 'windows-icacls-launch-failed' });
      return;
    }
    child.on('error', () => finish({ state: 'HOLD', platform, reasonCode: 'windows-icacls-failed' }));
    child.on('close', (code) => finish(code === 0
      ? { state: 'VERIFIED', platform }
      : { state: 'HOLD', platform, reasonCode: 'windows-icacls-failed' }));
  });
}

/**
 * Async private first-writer-wins publication for governed approval records.
 * ACL privacy is proven on the unpublished temporary inode before its atomic
 * hard-link name becomes visible. A typed ACL HOLD publishes nothing.
 */
export async function createPrivateJsonFileFirstWriterWins(
  filePath: string,
  data: unknown,
  aclOptions: ApprovalFileAclOptions = {},
): Promise<ApprovalPrivateCreateResult> {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  const fd = openSync(tmpPath, 'wx', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    const acl = await enforcePrivateApprovalFile(tmpPath, aclOptions);
    if (acl.state === 'HOLD') return acl;
    try {
      linkSync(tmpPath, filePath);
      flushFile(filePath);
      flushPublishedDirectory(filePath);
      return { state: 'VERIFIED', created: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      flushFile(filePath);
      flushPublishedDirectory(filePath);
      return { state: 'VERIFIED', created: false };
    }
  } finally {
    try { unlinkSync(tmpPath); } catch { /* never remove or replace the final authority */ }
  }
}

export interface ApprovalFileLockOptions {
  readonly timeoutMs?: number;
  readonly retryMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cross-process exclusive lock based on atomic directory creation. Locks are
 * never stolen: an unverifiable/stale owner causes a bounded typed HOLD rather
 * than concurrent authority. The callback must perform its authoritative
 * reload after the lock is acquired.
 */
export async function withApprovalFileLock<T>(
  authorityPath: string,
  callback: () => Promise<T> | T,
  options: ApprovalFileLockOptions = {},
): Promise<T> {
  const lockPath = `${authorityPath}.lock`;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const retryMs = options.retryMs ?? 10;
  const startedAt = Date.now();
  mkdirSync(dirname(authorityPath), { recursive: true, mode: 0o700 });
  while (true) {
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new ApprovalFileCasError('lock-timeout', `approval file lock timed out: ${authorityPath}`);
      }
      await delay(retryMs);
    }
  }
  const ownerPath = `${lockPath}/owner.json`;
  try {
    writeFileSync(ownerPath, `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    return await callback();
  } finally {
    try { unlinkSync(ownerPath); } catch { /* owner record may not have been written */ }
    try { rmdirSync(lockPath); } catch { /* fail closed: a foreign entry keeps the lock visible */ }
  }
}

export interface RevisionedJson<T> {
  readonly revision: number;
  readonly value: T;
}

export function readRevisionedJson<T>(filePath: string): RevisionedJson<T> | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<RevisionedJson<T>>;
    if (!Number.isSafeInteger(parsed.revision) || Number(parsed.revision) < 0 || !('value' in parsed)) return null;
    return { revision: Number(parsed.revision), value: parsed.value as T };
  } catch {
    return null;
  }
}

/**
 * Replace a revisioned JSON authority while its caller holds
 * {@link withApprovalFileLock}. The expected revision is checked against a
 * fresh disk read. Publication is same-directory rename + fsync and private
 * ACL verification; a mismatch or unprovable ACL is a typed failure.
 */
export async function replaceRevisionedJson(
  filePath: string,
  expectedRevision: number,
  value: unknown,
  aclOptions: ApprovalFileAclOptions = {},
): Promise<number> {
  const current = readRevisionedJson(filePath);
  const actualRevision = current?.revision ?? 0;
  if (actualRevision !== expectedRevision) {
    throw new ApprovalFileCasError(
      'revision-conflict',
      `approval file revision conflict: expected ${expectedRevision}, observed ${actualRevision}`,
    );
  }
  const nextRevision = actualRevision + 1;
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  const fd = openSync(tmpPath, 'wx', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify({ revision: nextRevision, value }, null, 2)}\n`, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmpPath, filePath);
    flushFile(filePath);
    flushPublishedDirectory(filePath);
    const acl = await enforcePrivateApprovalFile(filePath, aclOptions);
    if (acl.state === 'HOLD') {
      throw new ApprovalFileCasError(acl.reasonCode, `approval file ACL is not proven: ${acl.reasonCode}`);
    }
  } finally {
    try { unlinkSync(tmpPath); } catch { /* renamed or already absent */ }
  }
  return nextRevision;
}

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
