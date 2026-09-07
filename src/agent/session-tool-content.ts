import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  chmodSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type {
  ContentWriteReceipt,
  ContentWriter,
} from './tool-result-broker.js';

export const TOOL_CAPTURE_MAX_CHANNEL_BYTES = 64 * 1024 * 1024;
export const TOOL_CAPTURE_MAX_SESSION_BYTES = 128 * 1024 * 1024;
export const TOOL_CAPTURE_MAX_ACTIVE = 8;
export const TOOL_CAPTURE_MAX_RETAINED = 64;
export const TOOL_DETAIL_RANGE_MAX_BYTES = 256 * 1024;
const HASH_CHUNK_BYTES = 64 * 1024;
const PROTOCOL_TAIL_BYTES = 4 * 1024;
const DETAIL_REF_RE = /^[a-f0-9]{48}$/;

export type ToolContentChannel = 'stdout' | 'stderr';
export type CaptureReason =
  null | 'CAPTURE_LIMIT_EXCEEDED' | 'CONTENT_STORE_FAILED';
export interface ToolCaptureReceipt {
  legacyContentRef: string | null;
  detailRef: string | null;
  observedSha256: string;
  observedBytes: number;
  storedSha256: string | null;
  storedBytes: number;
  preview: string;
  protocolTail: string;
  protocolFailure: 'denied' | 'timeout' | 'tool-error' | null;
  complete: boolean;
  reasonCode: CaptureReason;
}
export interface ToolCapture {
  append(chunk: Uint8Array): void;
  finish(): ToolCaptureReceipt;
  abort(): ToolCaptureReceipt;
}
export type ToolDetailRead =
  | {
      kind: 'loaded';
      bytes: Uint8Array;
      offset: number;
      nextOffset: number | null;
      totalBytes: number;
      storedSha256: string;
      completeCapture: boolean;
    }
  | {
      kind: 'hold';
      reasonCode:
        | 'CONTENT_REF_DENIED'
        | 'CONTENT_REF_EXPIRED'
        | 'CONTENT_DIGEST_MISMATCH'
        | 'CONTENT_RANGE_INVALID'
        | 'CONTENT_READ_FAILED'
        | 'CONTENT_READ_UNSUPPORTED';
    };
export interface SessionToolContentStore extends ContentWriter {
  beginCapture(input: {
    channel: ToolContentChannel;
    maxStoredBytes?: number;
    previewBytes: number;
  }): ToolCapture;
  readDetailRange(
    input: {
      detailRef: string;
      offset: number;
      limit: number;
      expectedStoredSha256: string;
    },
    signal?: AbortSignal,
  ): Promise<ToolDetailRead>;
  close(): void;
}
type StoredRow = {
  path: string;
  sha: string;
  bytes: number;
  complete: boolean;
  dev: number;
  ino: number;
};

/** A session-owned opaque-reference content store; callers never supply paths to read. */
export function createSessionToolContentStore(
  opts: {
    dir?: string;
    prefix?: string;
    maxSessionBytes?: number;
    maxActive?: number;
    maxRetained?: number;
  } = {},
): SessionToolContentStore {
  const sessionLimit = valid(
    opts.maxSessionBytes,
    TOOL_CAPTURE_MAX_SESSION_BYTES,
  );
  const activeLimit = valid(opts.maxActive, TOOL_CAPTURE_MAX_ACTIVE);
  const retainedLimit = valid(opts.maxRetained, TOOL_CAPTURE_MAX_RETAINED);
  let root: string | null = null,
    rootDev: number | null = null,
    rootIno: number | null = null,
    closed = false,
    active = 0,
    retained = 0,
    sessionBytes = 0;
  const refs = new Map<string, StoredRow>();
  const captureHandles = new Set<number>();
  const rootMatches = (): boolean => {
    if (root === null) return false;
    try {
      const state = lstatSync(root);
      return (
        state.isDirectory() &&
        !state.isSymbolicLink() &&
        state.dev === rootDev &&
        state.ino === rootIno &&
        realpathSync(root) === root
      );
    } catch {
      return false;
    }
  };
  const ensure = (): string => {
    if (closed) throw new Error('content store closed');
    if (root) {
      if (!rootMatches()) throw new Error('content store root changed');
      return root;
    }
    const requested = opts.dir
      ? join(opts.dir, 'tool-content')
      : mkdtempSync(join(tmpdir(), opts.prefix ?? 'deckent-tool-content-'));
    mkdirSync(requested, { recursive: true, mode: 0o700 });
    const observed = lstatSync(requested);
    if (!observed.isDirectory() || observed.isSymbolicLink())
      throw new Error('unsafe content store directory');
    const directory = realpathSync(resolve(requested)),
      state = lstatSync(directory);
    if (
      !state.isDirectory() ||
      state.isSymbolicLink() ||
      state.dev !== observed.dev ||
      state.ino !== observed.ino
    )
      throw new Error('unsafe content store directory');
    try {
      chmodSync(directory, 0o700);
    } catch {
      /* Windows has no POSIX modes */
    }
    root = directory;
    rootDev = state.dev;
    rootIno = state.ino;
    return directory;
  };
  const legacyWrite = (bytes: Buffer): ContentWriteReceipt => {
    const dir = ensure(),
      sha = createHash('sha256').update(bytes).digest('hex');
    const target = join(dir, `content-${sha}.bin`),
      temporary = join(
        dir,
        `.content-${sha}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
      );
    writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' });
    try {
      renameSync(temporary, target);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
    return { path: target, sha256: sha };
  };
  return {
    write: legacyWrite,
    beginCapture({ channel, maxStoredBytes, previewBytes }) {
      if (channel !== 'stdout' && channel !== 'stderr')
        throw new Error('invalid capture channel');
      if (closed) throw new Error('content store closed');
      if (active >= activeLimit || retained >= retainedLimit)
        throw new Error('capture admission unavailable');
      const channelLimit = valid(
          maxStoredBytes,
          TOOL_CAPTURE_MAX_CHANNEL_BYTES,
        ),
        previewLimit = valid(previewBytes, 65_536),
        dir = ensure();
      const id = randomBytes(24).toString('hex'),
        temporary = join(dir, `.capture-${id}.tmp`),
        observed = createHash('sha256'),
        stored = createHash('sha256'),
        preview = Buffer.allocUnsafe(previewLimit),
        protocolTail = Buffer.allocUnsafe(PROTOCOL_TAIL_BYTES);
      let previewLength = 0,
        protocolTailLength = 0,
        observedBytes = 0,
        storedBytes = 0,
        done = false,
        storageFailed = false,
        storageCapped = false;
      let markerCarry = '',
        markerCarryStartsLine = true,
        sawDenied = false,
        sawMcp = false,
        sawTimeout = false;
      let reason: CaptureReason = null;
      let handle = -1;
      let captureIdentity: { dev: number; ino: number };
      try {
        handle = openSync(temporary, 'wx', 0o600);
        captureIdentity = fstatSync(handle);
        captureHandles.add(handle);
      } catch {
        if (handle >= 0) {
          try {
            closeSync(handle);
          } catch {
            /* setup failed */
          }
        }
        throw new Error('capture storage unavailable');
      }
      active += 1;
      const settle = (abort: boolean): ToolCaptureReceipt => {
        if (done) throw new Error('capture already settled');
        done = true;
        active -= 1;
        if (captureHandles.delete(handle)) {
          try {
            closeSync(handle);
          } catch {
            storageFailed = true;
            reason = 'CONTENT_STORE_FAILED';
          }
        }
        const observedSha256 = observed.digest('hex'),
          storedSha256 = stored.digest('hex');
        let detailRef: string | null = null,
          legacyContentRef: string | null = null,
          retainedBytes = false;
        if (closed || !rootMatches()) {
          reason = 'CONTENT_STORE_FAILED';
          storageFailed = true;
        }
        if (
          !abort &&
          !storageFailed &&
          storedBytes > 0 &&
          retained < retainedLimit
        ) {
          const target = join(dir, `capture-${id}.bin`);
          try {
            const pending = lstatSync(temporary);
            if (
              !pending.isFile() ||
              pending.isSymbolicLink() ||
              pending.size !== storedBytes ||
              pending.dev !== captureIdentity.dev ||
              pending.ino !== captureIdentity.ino
            )
              throw new Error('capture identity mismatch');
            renameSync(temporary, target);
            const identity = lstatSync(target);
            if (
              !identity.isFile() ||
              identity.isSymbolicLink() ||
              identity.size !== storedBytes ||
              identity.dev !== captureIdentity.dev ||
              identity.ino !== captureIdentity.ino
            )
              throw new Error('capture identity mismatch');
            refs.set(id, {
              path: target,
              sha: storedSha256,
              bytes: storedBytes,
              complete: reason === null,
              dev: identity.dev,
              ino: identity.ino,
            });
            retained += 1;
            retainedBytes = true;
            detailRef = id;
            if (reason === null) legacyContentRef = target;
          } catch {
            reason = 'CONTENT_STORE_FAILED';
            storageFailed = true;
            if (rootMatches()) {
              try {
                rmSync(target, { force: true });
              } catch {
                /* partial cleanup remains unavailable */
              }
            }
          }
        } else if (!abort && storedBytes > 0 && retained >= retainedLimit)
          reason = 'CAPTURE_LIMIT_EXCEEDED';
        if (!retainedBytes) {
          if (rootMatches()) {
            try {
              rmSync(temporary, { force: true });
            } catch {
              reason = 'CONTENT_STORE_FAILED';
            }
          }
          sessionBytes = Math.max(0, sessionBytes - storedBytes);
          storedBytes = 0;
        }
        const protocolFailure = sawDenied
          ? 'denied'
          : sawMcp
            ? sawTimeout
              ? 'timeout'
              : 'tool-error'
            : null;
        return {
          legacyContentRef,
          detailRef,
          observedSha256,
          observedBytes,
          storedSha256:
            retainedBytes || (!abort && reason === null && !storageFailed)
              ? storedSha256
              : null,
          storedBytes,
          preview: utf8Prefix(preview.subarray(0, previewLength)),
          protocolTail: utf8Tail(protocolTail.subarray(0, protocolTailLength)),
          protocolFailure,
          complete: !abort && reason === null && !storageFailed,
          reasonCode: abort ? 'CONTENT_STORE_FAILED' : reason,
        };
      };
      return {
        append(chunk) {
          if (done) return;
          const bytes = Buffer.from(chunk);
          observed.update(bytes);
          observedBytes += bytes.length;
          if (previewLength < previewLimit) {
            const count = Math.min(previewLimit - previewLength, bytes.length);
            bytes.copy(preview, previewLength, 0, count);
            previewLength += count;
          }
          if (bytes.length >= PROTOCOL_TAIL_BYTES) {
            bytes.copy(protocolTail, 0, bytes.length - PROTOCOL_TAIL_BYTES);
            protocolTailLength = PROTOCOL_TAIL_BYTES;
          } else {
            const retainedTail = Math.min(
              protocolTailLength,
              PROTOCOL_TAIL_BYTES - bytes.length,
            );
            if (retainedTail > 0)
              protocolTail.copyWithin(
                0,
                protocolTailLength - retainedTail,
                protocolTailLength,
              );
            bytes.copy(protocolTail, retainedTail);
            protocolTailLength = retainedTail + bytes.length;
          }
          // Protocol tokens are ASCII; latin1 preserves byte positions across
          // arbitrary UTF-8 chunk boundaries without introducing replacements.
          const markerScan = `${markerCarry}${bytes.toString('latin1')}`;
          const anchoredScan = markerCarryStartsLine
            ? markerScan
            : `x${markerScan}`;
          if (/(^|\n)\[deckent-denied\]/m.test(anchoredScan)) sawDenied = true;
          if (/(^|\n)\[mcp-error\]/m.test(anchoredScan)) sawMcp = true;
          if (/timed out after/.test(markerScan)) sawTimeout = true;
          const carryStart = Math.max(0, markerScan.length - 8_192);
          if (carryStart > 0)
            markerCarryStartsLine = markerScan[carryStart - 1] === '\n';
          markerCarry = markerScan.slice(carryStart);
          if (closed || !rootMatches()) {
            storageFailed = true;
            reason = 'CONTENT_STORE_FAILED';
            return;
          }
          if (storageFailed || storageCapped) return;
          const allowed = Math.max(
            0,
            Math.min(
              channelLimit - storedBytes,
              sessionLimit - sessionBytes,
              bytes.length,
            ),
          );
          if (allowed > 0)
            try {
              const part = bytes.subarray(0, allowed);
              // Keep writes bound to the created file descriptor. Reopening
              // a mutable pathname per chunk could follow a replaced symlink.
              let written = 0;
              while (written < part.length) {
                const count = writeSync(
                  handle,
                  part,
                  written,
                  part.length - written,
                );
                if (count === 0)
                  throw new Error('capture write made no progress');
                written += count;
              }
              stored.update(part);
              storedBytes += allowed;
              sessionBytes += allowed;
            } catch {
              storageFailed = true;
              reason = 'CONTENT_STORE_FAILED';
              return;
            }
          if (allowed < bytes.length) {
            reason = 'CAPTURE_LIMIT_EXCEEDED';
            storageCapped = true;
          }
        },
        finish: () => settle(false),
        abort: () => settle(true),
      };
    },
    async readDetailRange(input, signal) {
      if (closed) return { kind: 'hold', reasonCode: 'CONTENT_REF_EXPIRED' };
      if (
        !DETAIL_REF_RE.test(input.detailRef) ||
        !isDigest(input.expectedStoredSha256)
      )
        return { kind: 'hold', reasonCode: 'CONTENT_REF_DENIED' };
      if (
        !Number.isSafeInteger(input.offset) ||
        input.offset < 0 ||
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > TOOL_DETAIL_RANGE_MAX_BYTES
      )
        return { kind: 'hold', reasonCode: 'CONTENT_RANGE_INVALID' };
      const row = refs.get(input.detailRef);
      if (!row) return { kind: 'hold', reasonCode: 'CONTENT_REF_DENIED' };
      if (signal?.aborted)
        return { kind: 'hold', reasonCode: 'CONTENT_READ_FAILED' };
      if (row.sha !== input.expectedStoredSha256)
        return { kind: 'hold', reasonCode: 'CONTENT_DIGEST_MISMATCH' };
      const dir = root;
      if (
        !dir ||
        row.path !== join(dir, `capture-${input.detailRef}.bin`) ||
        !row.path.startsWith(`${dir}${sep}`)
      )
        return { kind: 'hold', reasonCode: 'CONTENT_REF_DENIED' };
      let file: Awaited<ReturnType<typeof open>> | null = null;
      try {
        const noFollow =
          typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
        // A platform without this primitive is not silently treated as safe.
        // Its direct file reader requires a separately verified platform adapter.
        if (noFollow === 0)
          return { kind: 'hold', reasonCode: 'CONTENT_READ_UNSUPPORTED' };
        if (!rootMatches())
          return { kind: 'hold', reasonCode: 'CONTENT_READ_FAILED' };
        const published = lstatSync(row.path);
        if (!sameIdentity(published, row))
          return { kind: 'hold', reasonCode: 'CONTENT_READ_FAILED' };
        file = await open(row.path, constants.O_RDONLY | noFollow);
        const before = await file.stat();
        if (!sameIdentity(before, row))
          return { kind: 'hold', reasonCode: 'CONTENT_DIGEST_MISMATCH' };
        const requested = Math.min(
            input.limit,
            Math.max(0, row.bytes - input.offset),
          ),
          range = Buffer.allocUnsafe(requested),
          chunk = Buffer.allocUnsafe(HASH_CHUNK_BYTES),
          hash = createHash('sha256');
        let cursor = 0,
          rangeWritten = 0;
        while (cursor < row.bytes) {
          if (signal?.aborted)
            return { kind: 'hold', reasonCode: 'CONTENT_READ_FAILED' };
          const wanted = Math.min(chunk.length, row.bytes - cursor),
            { bytesRead } = await file.read(chunk, 0, wanted, cursor);
          if (bytesRead !== wanted)
            return { kind: 'hold', reasonCode: 'CONTENT_DIGEST_MISMATCH' };
          const part = chunk.subarray(0, bytesRead);
          hash.update(part);
          const start = Math.max(cursor, input.offset),
            end = Math.min(cursor + bytesRead, input.offset + requested);
          if (end > start) {
            const sourceOffset = start - cursor;
            part.copy(
              range,
              rangeWritten,
              sourceOffset,
              sourceOffset + end - start,
            );
            rangeWritten += end - start;
          }
          cursor += bytesRead;
        }
        const after = await file.stat();
        if (
          closed ||
          !rootMatches() ||
          refs.get(input.detailRef) !== row ||
          signal?.aborted
        )
          return { kind: 'hold', reasonCode: 'CONTENT_READ_FAILED' };
        if (
          !sameIdentity(after, row) ||
          rangeWritten !== requested ||
          hash.digest('hex') !== row.sha
        )
          return { kind: 'hold', reasonCode: 'CONTENT_DIGEST_MISMATCH' };
        return {
          kind: 'loaded',
          bytes: range,
          offset: input.offset,
          nextOffset:
            input.offset + requested < row.bytes
              ? input.offset + requested
              : null,
          totalBytes: row.bytes,
          storedSha256: row.sha,
          completeCapture: row.complete,
        };
      } catch {
        return { kind: 'hold', reasonCode: 'CONTENT_READ_FAILED' };
      } finally {
        await file?.close().catch(() => undefined);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      refs.clear();
      for (const handle of captureHandles) {
        try {
          closeSync(handle);
        } catch {
          /* already unavailable */
        }
      }
      captureHandles.clear();
      if (root && rootMatches())
        try {
          rmSync(root, { recursive: true, force: true });
        } catch {
          /* teardown best effort */
        }
      root = null;
      rootDev = null;
      rootIno = null;
      sessionBytes = 0;
    },
  };
}
function valid(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > fallback)
    throw new Error('invalid content store limit');
  return value;
}
function isDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
function sameIdentity(
  stat: {
    isFile(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    dev: number;
    ino: number;
  },
  row: StoredRow,
): boolean {
  return (
    stat.isFile() &&
    !stat.isSymbolicLink() &&
    stat.size === row.bytes &&
    stat.dev === row.dev &&
    stat.ino === row.ino
  );
}
/** Preserve whole code points and bound replacement expansion for invalid bytes. */
function utf8Prefix(bytes: Buffer): string {
  // write(), unlike end(), keeps an incomplete final sequence out of preview.
  const decoded = new StringDecoder('utf8').write(bytes);
  const encoded = Buffer.from(decoded, 'utf8');
  return encoded.length <= bytes.length
    ? decoded
    : new StringDecoder('utf8').write(encoded.subarray(0, bytes.length));
}
function utf8Tail(bytes: Buffer): string {
  let start = 0;
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start += 1;
  const encoded = Buffer.from(bytes.subarray(start).toString('utf8'), 'utf8');
  let boundedStart = Math.max(0, encoded.length - bytes.length);
  while (
    boundedStart < encoded.length &&
    (encoded[boundedStart]! & 0xc0) === 0x80
  )
    boundedStart += 1;
  return encoded.subarray(boundedStart).toString('utf8');
}
