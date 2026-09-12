// The harness diagnostic channel that keeps a decided hold decidable.
//
// The harness resolves a precise hold reason and exits non-zero. It used to
// discard that reason, so the runner reported the generic
// `host-proof-process-failed` — a code `isDecidedExactSettlementHold` can never
// classify. A permanently unsettleable attempt therefore blocked every later
// cold start instead of retiring as history (observed live: sprint-746 task
// 746-001 blocking sprint-747).
//
// These tests pin both halves: a well-formed diagnostic is honoured, and
// anything else falls back rather than widening what the runner will report.
// The bytes originate in a container process, so every rejection case matters.

import { describe, it, expect } from 'vitest';
import { parseHarnessFailureReason } from '../../src/orchestra/production-wiring-host-proof-runner.js';

const KIND = 'deckent-production-wiring-host-proof-failure-v1';
/** Canonical JSON sorts keys, so `kind` precedes `reasonCode`. */
const emit = (reasonCode: string, kind: string = KIND) =>
  Buffer.from(`${JSON.stringify({ kind, reasonCode })}\n`);

describe('parseHarnessFailureReason — honours the typed reason', () => {
  it('recovers the reason the harness decided', () => {
    expect(parseHarnessFailureReason(emit('host-proof-request-invalid')))
      .toBe('host-proof-request-invalid');
  });

  it('recovers a verifier-asset reason, the family that retires an attempt', () => {
    // Prefixed by the caller to `production-wiring-host-proof-verifier-asset-invalid`,
    // which is exactly what the decided-hold predicate admits.
    expect(parseHarnessFailureReason(emit('host-proof-verifier-asset-invalid')))
      .toBe('host-proof-verifier-asset-invalid');
  });

  it('tolerates the trailing newline the harness writes', () => {
    const withoutNewline = Buffer.from(JSON.stringify({ kind: KIND, reasonCode: 'host-proof-timeout' }));
    expect(parseHarnessFailureReason(withoutNewline)).toBe('host-proof-timeout');
  });
});

describe('parseHarnessFailureReason — fails closed on anything else', () => {
  it('rejects empty stderr (the pre-fix silent failure)', () => {
    expect(parseHarnessFailureReason(Buffer.alloc(0))).toBeNull();
  });

  it('rejects a foreign kind', () => {
    expect(parseHarnessFailureReason(emit('host-proof-timeout', 'some-other-kind'))).toBeNull();
  });

  it('rejects extra keys — no smuggling past the exact key set', () => {
    const extra = Buffer.from(JSON.stringify({ kind: KIND, note: 'x', reasonCode: 'host-proof-timeout' }));
    expect(parseHarnessFailureReason(extra)).toBeNull();
  });

  it('rejects a missing reasonCode', () => {
    expect(parseHarnessFailureReason(Buffer.from(JSON.stringify({ kind: KIND })))).toBeNull();
  });

  it('rejects free prose, a path or a stack in the reason slot', () => {
    for (const bad of [
      'Error: ENOENT /home/alperen/secret',
      'Host Proof Failed',
      'host proof failed',
      'host_proof_failed',
      '-leading-dash',
      'has/slash',
      'has.dot',
    ]) expect(parseHarnessFailureReason(emit(bad))).toBeNull();
  });

  it('admits the same code shape the settlement predicate accepts', () => {
    // Deliberately NOT stricter than `isDecidedExactSettlementHold`'s
    // `/^[a-z0-9][a-z0-9-]*$/u`: a channel that rejected a code the predicate
    // would have classified as decided would re-open the very block this fixes.
    expect(parseHarnessFailureReason(emit('trailing-'))).toBe('trailing-');
  });

  it('rejects an over-long reason code', () => {
    expect(parseHarnessFailureReason(emit(`a${'b'.repeat(96)}`))).toBeNull();
  });

  it('rejects non-canonical JSON — key order is part of the contract', () => {
    expect(parseHarnessFailureReason(
      Buffer.from(`{"reasonCode":"host-proof-timeout","kind":"${KIND}"}`),
    )).toBeNull();
  });

  it('rejects non-JSON and a bare string', () => {
    expect(parseHarnessFailureReason(Buffer.from('host-proof-timeout'))).toBeNull();
    expect(parseHarnessFailureReason(Buffer.from('not json at all'))).toBeNull();
  });

  it('rejects an array payload', () => {
    expect(parseHarnessFailureReason(Buffer.from('["host-proof-timeout"]'))).toBeNull();
  });
});
