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
/**
 * 7110 — typed, digest-addressed read of bytes this store itself wrote through
 * `write()` (the broker's spill path and the checkpoint trail). The caller
 * names a sha256 digest, never a path: a digest this store did not produce is
 * refused as `CONTENT_REF_UNKNOWN`, so a checkpoint-provided reference can never
 * turn into a scope escape (`DECKENT_E005`) or an arbitrary-file read.
 */
export type ContentRefReadReason =
  | 'CONTENT_REF_DENIED'
  | 'CONTENT_REF_UNKNOWN'
  | 'CONTENT_REF_EXPIRED'
  | 'CONTENT_DIGEST_MISMATCH'
  | 'CONTENT_RANGE_INVALID'
  | 'CONTENT_READ_FAILED'
  | 'CONTENT_READ_UNSUPPORTED';
export type ContentRefRead =
  | {
      kind: 'loaded';
      /** The bytes actually returned — a UTF-8-aligned slice (see {@link alignUtf8Slice}). */
      bytes: Uint8Array;
      /** Effective start offset: equals the requested offset unless it landed
       *  inside a UTF-8 sequence, in which case it was snapped forward to the
       *  next code-point boundary (`snappedFrom` names the requested value). */
      offset: number;
      snappedFrom?: number;
      /** Byte right after the last complete character returned; null at EOF. */
      nextOffset: number | null;
      totalBytes: number;
      sha256: string;
    }
  | { kind: 'hold'; reasonCode: ContentRefReadReason };
export interface ContentRefReader {
  readContentRef(
    input: { sha256: string; offset: number; limit: number },
    signal?: AbortSignal,
  ): Promise<ContentRefRead>;
}
/** Longest UTF-8 sequence — the lookahead a boundary-safe slice may need. */
const UTF8_MAX_SEQUENCE = 4;
const isUtf8Continuation = (byte: number): boolean => (byte & 0xc0) === 0x80;
/** Expected sequence length for a lead byte; 0 when the byte is not a valid lead. */
function utf8SequenceLength(lead: number): number {
  if (lead < 0x80) return 1;
  if ((lead & 0xe0) === 0xc0) return 2;
  if ((lead & 0xf0) === 0xe0) return 3;
  if ((lead & 0xf8) === 0xf0) return 4;
  return 0;
}

/**
 * 7110 B4 — boundary-safe UTF-8 slicing over a byte window that starts up to
 * 3 bytes BEFORE the requested offset (`lookbehind`) and extends up to
 * `limit + 3` bytes past it (the lookahead). Rules, all byte-exact and
 * documented on the tool:
 *   • START: the offset snaps FORWARD to the next boundary ONLY when the
 *     lookbehind proves it sits inside a WELL-FORMED sequence (a valid lead
 *     before the offset whose complete continuation run spans it); reported
 *     via `snappedFrom`. A continuation-looking byte with no such lead (binary
 *     data, a chunk boundary chosen by this very function) never snaps, so
 *     following `nextOffset` reproduces any content byte-for-byte.
 *   • END: the slice never ends inside a well-formed sequence. When the
 *     requested limit cuts a sequence whose completion is present in the
 *     lookahead, the end backs off to the sequence's lead byte — unless that
 *     would leave the slice EMPTY (limit < sequence length), in which case the
 *     whole sequence is returned (over-return ≤ 3 bytes, never a lost char).
 *   • EOF: nothing follows, so the tail is returned exactly as stored.
 *   • MALFORMED bytes (invalid lead, truncated sequence even with lookahead)
 *     are never "repaired": the slice cuts at the byte, so binary content
 *     round-trips exactly by following `nextOffset`.
 * Returns the window-relative `[start, end)` plus the snap, so `nextOffset`
 * (offset + end) always points at the byte after the last complete character.
 */
export function alignUtf8Slice(
  window: Uint8Array,
  input: { offset: number; lookbehind: number; limit: number; eofInWindow: boolean },
): { start: number; end: number; snappedFrom?: number } {
  let start = input.lookbehind;
  for (let lead = start - 1; lead >= Math.max(0, start - (UTF8_MAX_SEQUENCE - 1)); lead--) {
    const byte = window[lead]!;
    if (isUtf8Continuation(byte)) continue;
    const length = utf8SequenceLength(byte);
    if (length > 1 && lead + length > start && lead + length <= window.length) {
      let complete = true;
      for (let i = lead + 1; i < lead + length; i++) if (!isUtf8Continuation(window[i]!)) { complete = false; break; }
      if (complete) start = lead + length;
    }
    break;
  }
  const available = window.length - start;
  let end = start + Math.min(input.limit, available);
  const cutsInsideWindow = end < window.length && !(input.eofInWindow && end === window.length);
  if (cutsInsideWindow) {
    for (let lead = end - 1; lead >= start && lead >= end - (UTF8_MAX_SEQUENCE - 1); lead--) {
      const byte = window[lead]!;
      if (isUtf8Continuation(byte)) continue;
      const length = utf8SequenceLength(byte);
      if (length <= 1 || lead + length <= end) break; // ends on a boundary (or malformed lead) — nothing to do
      if (lead + length > window.length) break; // truncated even with lookahead → malformed, cut at the byte
      let complete = true;
      for (let i = lead + 1; i < lead + length; i++) if (!isUtf8Continuation(window[i]!)) { complete = false; break; }
      if (!complete) break;
      end = lead === start ? lead + length : lead;
      break;
    }
  }
  return { start, end, ...(start > input.lookbehind ? { snappedFrom: input.offset } : {}) };
}

/** Structural guard — the registry/session only receive a `ContentWriter`. */
export function isContentRefReader(value: unknown): value is ContentRefReader {
  return !!value && typeof value === 'object'
    && typeof (value as { readContentRef?: unknown }).readContentRef === 'function';
}
export interface SessionToolContentStore extends ContentWriter, ContentRefReader {
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
  /** sha256 → row for bytes written through `write()` (content-<sha>.bin). */
  const contentRefs = new Map<string, StoredRow>();
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
    // Digest-addressed read identity (7110): the published inode is what a
    // later `readContentRef` must still find — a replaced file is a mismatch.
    try {
      const identity = lstatSync(target);
      if (identity.isFile() && !identity.isSymbolicLink() && identity.size === bytes.length) {
        contentRefs.set(sha, { path: target, sha, bytes: bytes.length, complete: true, dev: identity.dev, ino: identity.ino });
      } else {
        contentRefs.delete(sha);
      }
    } catch {
      contentRefs.delete(sha);
    }
    return { path: target, sha256: sha };
  };
  /**
   * Verified range read of one stored row: O_NOFOLLOW open, identity pinned
   * before and after, the WHOLE file re-hashed against the row's digest while
   * the range is copied out. Shared by the capture (`readDetailRange`) and the
   * content-ref (`readContentRef`) paths so both carry identical guarantees.
   */
  const readVerifiedRange = async (
    row: StoredRow,
    offset: number,
    limit: number,
    stillCurrent: () => boolean,
    signal?: AbortSignal,
  ): Promise<
    | { kind: 'loaded'; bytes: Buffer; offset: number; nextOffset: number | null; totalBytes: number }
    | { kind: 'hold'; reasonCode: ContentRefReadReason }
  > => {
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
      const requested = Math.min(limit, Math.max(0, row.bytes - offset)),
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
        const start = Math.max(cursor, offset),
          end = Math.min(cursor + bytesRead, offset + requested);
        if (end > start) {
          const sourceOffset = start - cursor;
          part.copy(range, rangeWritten, sourceOffset, sourceOffset + end - start);
          rangeWritten += end - start;
        }
        cursor += bytesRead;
      }
      const after = await file.stat();
      if (closed || !rootMatches() || !stillCurrent() || signal?.aborted)
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
        offset,
        nextOffset: offset + requested < row.bytes ? offset + requested : null,
        totalBytes: row.bytes,
      };
    } catch {
      return { kind: 'hold', reasonCode: 'CONTENT_READ_FAILED' };
    } finally {
      await file?.close().catch(() => undefined);
    }
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
      const read = await readVerifiedRange(
        row, input.offset, input.limit, () => refs.get(input.detailRef) === row, signal);
      if (read.kind === 'hold') {
        // The capture surface never had an "unknown ref" class — keep its contract.
        return { kind: 'hold', reasonCode: read.reasonCode === 'CONTENT_REF_UNKNOWN' ? 'CONTENT_REF_DENIED' : read.reasonCode };
      }
      return {
        kind: 'loaded',
        bytes: read.bytes,
        offset: read.offset,
        nextOffset: read.nextOffset,
        totalBytes: read.totalBytes,
        storedSha256: row.sha,
        completeCapture: row.complete,
      };
    },
    async readContentRef(input, signal) {
      if (closed) return { kind: 'hold', reasonCode: 'CONTENT_REF_EXPIRED' };
      if (typeof input.sha256 !== 'string' || !isDigest(input.sha256))
        return { kind: 'hold', reasonCode: 'CONTENT_REF_DENIED' };
      if (
        !Number.isSafeInteger(input.offset) ||
        input.offset < 0 ||
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > TOOL_DETAIL_RANGE_MAX_BYTES
      )
        return { kind: 'hold', reasonCode: 'CONTENT_RANGE_INVALID' };
      const row = contentRefs.get(input.sha256);
      if (!row) return { kind: 'hold', reasonCode: 'CONTENT_REF_UNKNOWN' };
      if (signal?.aborted)
        return { kind: 'hold', reasonCode: 'CONTENT_READ_FAILED' };
      const dir = root;
      if (
        !dir ||
        row.path !== join(dir, `content-${input.sha256}.bin`) ||
        !row.path.startsWith(`${dir}${sep}`)
      )
        return { kind: 'hold', reasonCode: 'CONTENT_REF_DENIED' };
      // Read 3 bytes before the offset (lookbehind) and `limit + 3` past it
      // (lookahead): what a boundary-safe cut needs on both sides (B4).
      const lookbehind = Math.min(input.offset, UTF8_MAX_SEQUENCE - 1);
      const read = await readVerifiedRange(
        row, input.offset - lookbehind, lookbehind + input.limit + (UTF8_MAX_SEQUENCE - 1), () => contentRefs.get(input.sha256) === row, signal);
      if (read.kind === 'hold') return read;
      const aligned = alignUtf8Slice(read.bytes, { offset: input.offset, lookbehind, limit: input.limit, eofInWindow: read.nextOffset === null });
      const nextOffset = input.offset + (aligned.end - lookbehind);
      return {
        kind: 'loaded',
        bytes: read.bytes.subarray(aligned.start, aligned.end),
        offset: input.offset + (aligned.start - lookbehind),
        ...(aligned.snappedFrom !== undefined ? { snappedFrom: aligned.snappedFrom } : {}),
        nextOffset: nextOffset < read.totalBytes ? nextOffset : null,
        totalBytes: read.totalBytes,
        sha256: row.sha,
      };
    },
    close() {
      if (closed) return;
      closed = true;
      refs.clear();
      contentRefs.clear();
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
