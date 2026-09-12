// Docker-version drift in the proof-container absence probe.
//
// Absence must be proven by the daemon's refusal, never by a name guess. The
// original check also required a byte-empty stdout — but current Docker (29.x)
// prints an empty JSON array on inspect failure, so absence could never be
// confirmed and every host proof locked into `proof-container-not-absent`.
// These tests pin both halves: the drift is tolerated, a real container is not.

import { describe, it, expect } from 'vitest';
import { exactDockerAbsence } from '../../src/orchestra/production-wiring-host-proof-runner.js';

const result = (over: Partial<{
  status: number | null; stdout: string; stderr: string; signal: NodeJS.Signals | null;
  error: boolean; overflow: boolean; timedOut: boolean; cancelled: boolean;
}> = {}) => ({
  status: 1,
  stdout: Buffer.from(over.stdout ?? ''),
  stderr: Buffer.from(over.stderr ?? 'Error response from daemon: No such container: deckent-pw-x'),
  signal: over.signal ?? null,
  error: over.error ?? false,
  overflow: over.overflow ?? false,
  timedOut: over.timedOut ?? false,
  cancelled: over.cancelled ?? false,
  ...(over.status !== undefined ? { status: over.status } : {}),
}) as never;

describe('exactDockerAbsence — daemon refusal is the only proof', () => {
  it('accepts a byte-empty stdout (older Docker CLIs)', () => {
    expect(exactDockerAbsence(result({ stdout: '' }))).toBe(true);
  });

  it('accepts an empty JSON array (Docker 29.x, verified on 29.1.3)', () => {
    expect(exactDockerAbsence(result({ stdout: '[]\n' }))).toBe(true);
  });

  it('REFUSES a populated array — an existing container is not absent', () => {
    expect(exactDockerAbsence(result({ stdout: '[{"Id":"abc"}]' }))).toBe(false);
  });

  it('refuses any other stdout payload', () => {
    expect(exactDockerAbsence(result({ stdout: '{"Id":"abc"}' }))).toBe(false);
  });

  it('refuses a success exit even with matching stderr', () => {
    expect(exactDockerAbsence(result({ status: 0, stdout: '[]' }))).toBe(false);
  });

  it('refuses when stderr does not carry the daemon refusal', () => {
    expect(exactDockerAbsence(result({ stdout: '[]', stderr: 'permission denied' }))).toBe(false);
  });

  it('refuses a timed-out, cancelled, overflowed or signalled probe', () => {
    for (const over of [{ timedOut: true }, { cancelled: true }, { overflow: true }, { error: true }]) {
      expect(exactDockerAbsence(result({ stdout: '[]', ...over }))).toBe(false);
    }
    expect(exactDockerAbsence(result({ stdout: '[]', signal: 'SIGKILL' }))).toBe(false);
  });
});
