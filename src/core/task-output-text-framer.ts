import { stripVTControlCharacters } from 'node:util';
import { redactSensitive } from './redact-sensitive.js';

export type TaskOutputHoldReason = 'invalid-utf8' | 'pending-line-too-large';

export interface TaskOutputFramerResult {
  readonly lines: readonly string[];
  readonly held?: { readonly reason: TaskOutputHoldReason };
}

export interface TaskOutputTextFramer {
  push(chunk: Uint8Array): TaskOutputFramerResult;
  end(): TaskOutputFramerResult;
}

export interface TaskOutputTextFramerOptions {
  readonly maxPendingBytes: number;
  readonly redactionLabel: string;
}

const CONTROL_CHARACTER = /[\u0000-\u0009\u000B-\u001F\u007F]/g;
const PEM_BEGIN = /^-----BEGIN ([A-Z0-9][A-Z0-9 ]*)-----$/u;

function sanitizeLine(text: string): string {
  return stripVTControlCharacters(redactSensitive(text)).replace(
    CONTROL_CHARACTER,
    (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
}

function privateKeyPemLabel(line: string): string | undefined {
  const match = PEM_BEGIN.exec(line.trim());
  const label = match?.[1];
  return label?.endsWith('PRIVATE KEY') ? label : undefined;
}

export function createTaskOutputTextFramer(
  options: TaskOutputTextFramerOptions,
): TaskOutputTextFramer {
  if (
    !options ||
    !Number.isSafeInteger(options.maxPendingBytes) ||
    options.maxPendingBytes <= 0 ||
    typeof options.redactionLabel !== 'string' ||
    options.redactionLabel.length === 0
  ) {
    throw new RangeError('maxPendingBytes and redactionLabel are required');
  }

  const { maxPendingBytes, redactionLabel } = options;
  const pendingFragments: Uint8Array[] = [];
  let pendingBytes = 0;
  let ended = false;
  let held: TaskOutputHoldReason | undefined;
  let privateKeyLabel: string | undefined;

  const result = (lines: string[]): TaskOutputFramerResult =>
    held === undefined ? { lines } : { lines, held: { reason: held } };

  const takePendingLine = (stripCrLfTerminator: boolean): Uint8Array => {
    let line: Uint8Array;
    if (pendingFragments.length === 1) {
      line = pendingFragments[0]!; // length is exactly one above
    } else {
      line = new Uint8Array(pendingBytes);
      let offset = 0;
      for (const fragment of pendingFragments) {
        line.set(fragment, offset);
        offset += fragment.byteLength;
      }
    }

    pendingFragments.length = 0;
    pendingBytes = 0;
    return stripCrLfTerminator && line.byteLength > 0 && line[line.byteLength - 1] === 0x0d
      ? line.subarray(0, line.byteLength - 1)
      : line;
  };

  const emitCompletedLine = (lines: string[], stripCrLfTerminator: boolean): void => {
    let decoded: string;
    try {
      // The complete raw line remains byte-accounted until this fatal decode, so an
      // incomplete UTF-8 scalar is both cap-accounted and diagnosed only at its boundary.
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(takePendingLine(stripCrLfTerminator));
    } catch {
      held = 'invalid-utf8';
      return;
    }

    const sanitized = sanitizeLine(decoded);
    if (privateKeyLabel !== undefined) {
      if (sanitized.trim() === `-----END ${privateKeyLabel}-----`) {
        privateKeyLabel = undefined;
      }
      return;
    }

    const pemLabel = privateKeyPemLabel(sanitized);
    if (pemLabel !== undefined) {
      privateKeyLabel = pemLabel;
      lines.push(redactionLabel);
      return;
    }

    lines.push(sanitized);
  };

  const appendFragment = (chunk: Uint8Array, start: number, end: number): boolean => {
    const length = end - start;
    if (length > maxPendingBytes - pendingBytes) {
      held = 'pending-line-too-large';
      pendingFragments.length = 0;
      pendingBytes = 0;
      return false;
    }
    if (length > 0) {
      // Own only the bounded fragment: retaining a view would keep an arbitrary
      // backing allocation alive and let caller buffer reuse rewrite pending text.
      pendingFragments.push(Uint8Array.from(chunk.subarray(start, end)));
      pendingBytes += length;
    }
    return true;
  };

  return {
    push(chunk): TaskOutputFramerResult {
      if (ended || held !== undefined) return result([]);

      const lines: string[] = [];
      let start = 0;
      while (start < chunk.byteLength && held === undefined) {
        const lineFeed = chunk.indexOf(0x0a, start);
        const end = lineFeed === -1 ? chunk.byteLength : lineFeed;
        if (!appendFragment(chunk, start, end)) break;
        if (lineFeed === -1) break;

        emitCompletedLine(lines, true);
        start = lineFeed + 1;
      }
      return result(lines);
    },

    end(): TaskOutputFramerResult {
      if (ended) return result([]);
      ended = true;
      if (held === undefined && pendingBytes > 0) {
        const lines: string[] = [];
        emitCompletedLine(lines, false);
        return result(lines);
      }
      return result([]);
    },
  };
}
