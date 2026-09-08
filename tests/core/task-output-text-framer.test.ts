import { describe, expect, it } from 'vitest';
import {
  createTaskOutputTextFramer,
  type TaskOutputFramerResult,
} from '../../src/core/task-output-text-framer.js';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function collect(results: TaskOutputFramerResult[]): string[] {
  return results.flatMap((result) => result.lines);
}

describe('task output text framer', () => {
  it('requires a positive byte cap and a caller-owned redaction label', () => {
    expect(() => createTaskOutputTextFramer({ maxPendingBytes: 0, redactionLabel: '<private>' })).toThrow(RangeError);
    expect(() => createTaskOutputTextFramer({ maxPendingBytes: 1.5, redactionLabel: '<private>' })).toThrow(RangeError);
    expect(() => createTaskOutputTextFramer({ maxPendingBytes: 1, redactionLabel: '' })).toThrow(RangeError);
  });

  it('preserves UTF-8 semantic lines across every byte boundary and flushes EOF once', () => {
    const framer = createTaskOutputTextFramer({ maxPendingBytes: 100, redactionLabel: '<private>' });
    const input = encode('Türkçe\r\nson satır');
    const results = Array.from(input, (_, index) => framer.push(input.subarray(index, index + 1)));
    results.push(framer.end(), framer.end());

    expect(collect(results)).toEqual(['Türkçe', 'son satır']);
    expect(results.at(-1)).toEqual({ lines: [] });
  });

  it('does not emit partial tokens and redacts only after a complete line arrives', () => {
    const framer = createTaskOutputTextFramer({ maxPendingBytes: 100, redactionLabel: '<private>' });

    expect(framer.push(encode('Bearer secret-token'))).toEqual({ lines: [] });
    expect(framer.push(encode('\nnext'))).toEqual({ lines: ['Bearer [REDACTED]'] });
    expect(framer.end()).toEqual({ lines: ['next'] });
  });

  it('snapshots only the bounded pending fragment when the caller reuses its backing buffer', () => {
    const framer = createTaskOutputTextFramer({ maxPendingBytes: 4, redactionLabel: '<private>' });
    const backing = new Uint8Array(64 * 1024).fill(0x61);
    const fragment = backing.subarray(backing.length - 4);
    expect(framer.push(fragment)).toEqual({ lines: [] });
    backing.fill(0x62);
    expect(framer.push(encode('\n'))).toEqual({ lines: ['aaaa'] });
  });

  it('treats only CR immediately before LF as a terminator and visibly escapes bare controls', () => {
    const framer = createTaskOutputTextFramer({ maxPendingBytes: 100, redactionLabel: '<private>' });
    const results = [
      framer.push(encode('crlf\r\nlone\rback\b\u0000\u007f\ntrail\r')),
      framer.end(),
    ];

    expect(collect(results)).toEqual(['crlf', 'lone\\x0dback\\x08\\x00\\x7f', 'trail\\x0d']);
  });

  it('strips ANSI and OSC controls after shared redaction without changing nonsecret text', () => {
    const framer = createTaskOutputTextFramer({ maxPendingBytes: 100, redactionLabel: '<private>' });
    const result = framer.push(encode('\x1b[31mhello\x1b[0m \x1b]0;title\x07sk-ant-test-111\n'));

    expect(result).toEqual({ lines: ['hello [REDACTED]'] });
  });

  it('uses one caller label for a private-key PEM block across chunks and requires its matching end', () => {
    const framer = createTaskOutputTextFramer({ maxPendingBytes: 100, redactionLabel: '<private-output>' });
    const results = [
      framer.push(encode('-----BEGIN RSA PRIVATE')),
      framer.push(encode(' KEY-----\nsecret\n-----END EC PRIVATE KEY-----\nstill hidden\n')),
      framer.push(encode('-----END RSA PRIVATE KEY-----\nsafe\n')),
      framer.end(),
    ];

    expect(collect(results)).toEqual(['<private-output>', 'safe']);
  });

  it('recognizes private PEM markers after terminal sanitization but preserves certificates', () => {
    const framer = createTaskOutputTextFramer({ maxPendingBytes: 100, redactionLabel: '<private>' });
    const results = [
      framer.push(encode('\x1b[32m-----BEGIN PRIVATE KEY-----\x1b[0m\nbody\n-----END PRIVATE KEY-----\n')),
      framer.push(encode('-----BEGIN CERTIFICATE-----\ncertificate\n-----END CERTIFICATE-----\n')),
      framer.end(),
    ];

    expect(collect(results)).toEqual([
      '<private>',
      '-----BEGIN CERTIFICATE-----',
      'certificate',
      '-----END CERTIFICATE-----',
    ]);
  });

  it('enforces the cap before emitting an oversized line, including newline and fragmented UTF-8', () => {
    const exact = createTaskOutputTextFramer({ maxPendingBytes: 4, redactionLabel: '<private>' });
    expect(exact.push(encode('1234\n'))).toEqual({ lines: ['1234'] });

    const over = createTaskOutputTextFramer({ maxPendingBytes: 4, redactionLabel: '<private>' });
    expect(over.push(encode('ok\n12345\n'))).toEqual({
      lines: ['ok'],
      held: { reason: 'pending-line-too-large' },
    });

    const splitUtf8 = createTaskOutputTextFramer({ maxPendingBytes: 2, redactionLabel: '<private>' });
    const character = encode('é');
    expect(splitUtf8.push(character.subarray(0, 1))).toEqual({ lines: [] });
    expect(splitUtf8.push(character.subarray(1))).toEqual({ lines: [] });
    expect(splitUtf8.push(encode('\n'))).toEqual({ lines: ['é'] });

    const tooSmall = createTaskOutputTextFramer({ maxPendingBytes: 1, redactionLabel: '<private>' });
    expect(tooSmall.push(character.subarray(0, 1))).toEqual({ lines: [] });
    expect(tooSmall.push(character.subarray(1))).toEqual({
      lines: [],
      held: { reason: 'pending-line-too-large' },
    });
  });

  it('holds large chunks without buffering the arbitrary input and preserves the hold through end', () => {
    const framer = createTaskOutputTextFramer({ maxPendingBytes: 8, redactionLabel: '<private>' });
    const large = new Uint8Array(64 * 1024).fill(0x61);

    expect(framer.push(large)).toEqual({ lines: [], held: { reason: 'pending-line-too-large' } });
    expect(framer.end()).toEqual({ lines: [], held: { reason: 'pending-line-too-large' } });
  });

  it('holds invalid UTF-8 only at a completed line or EOF and never replacement-decodes it', () => {
    const atEof = createTaskOutputTextFramer({ maxPendingBytes: 10, redactionLabel: '<private>' });
    expect(atEof.push(Uint8Array.from([0xff]))).toEqual({ lines: [] });
    expect(atEof.end()).toEqual({ lines: [], held: { reason: 'invalid-utf8' } });

    const atLineBoundary = createTaskOutputTextFramer({ maxPendingBytes: 10, redactionLabel: '<private>' });
    expect(atLineBoundary.push(Uint8Array.from([0xff, 0x0a]))).toEqual({
      lines: [],
      held: { reason: 'invalid-utf8' },
    });
  });
});
