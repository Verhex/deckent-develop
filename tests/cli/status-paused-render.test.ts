// ═══ RECOVERY-PAUSE-STATUS-001 (GR-2026-08-08-PAUSE-STATUS-01) ══════════════
// Smoke (2026-08-07): `deckent status` after a typed PAUSE errored with
// RUN_STATUS_READ_MODEL_UNAVAILABLE and hid the paused state + recover remedy.
// Root cause: a PAUSED authority required a persisted read-model that pause
// never republished — although the authority already carries the recovery
// command. These pins hold the gate relaxation and the banner contract.
import { describe, it, expect } from 'vitest';
import {
  requiresPersistedRunStatusReadModel,
  formatPausedRunBanner,
} from '../../src/cli/commands/status.js';
import type { CanonicalRunStatus } from '../../src/core/run-status-authority.js';

const pausedAuthority = (over: Partial<CanonicalRunStatus> = {}): CanonicalRunStatus => ({
  schemaVersion: 1,
  lifecycle: 'PAUSED',
  active: false,
  resumable: true,
  sprintId: 'sprint-001',
  phase: 'EXECUTE',
  status: 'PAUSED',
  reason: '1/2 logical tasks remain NO_GO after the admitted FIX budget',
  recoveryCommand: 'deckent recover sprint-001 --resume',
  finalizeCommand: 'deckent finalize --sprint sprint-001 --force',
  coordinator: 'dead',
  conflicts: [],
  ...over,
} as unknown as CanonicalRunStatus);

describe('RECOVERY-PAUSE-STATUS — gate + banner', () => {
  it('a PAUSED authority NO LONGER requires the persisted read-model', () => {
    // The exact fix: PAUSED is a reconciled state, self-sufficient to render.
    expect(requiresPersistedRunStatusReadModel(pausedAuthority({ resumable: false }))).toBe(false);
  });

  it('ORPHANED still requires the read-model (contested state, born-688 safety kept)', () => {
    expect(requiresPersistedRunStatusReadModel(
      pausedAuthority({ lifecycle: 'ORPHANED', status: 'ORPHANED', resumable: false }),
    )).toBe(true);
  });

  it('ACTIVE still requires the read-model', () => {
    expect(requiresPersistedRunStatusReadModel(
      pausedAuthority({ lifecycle: 'ACTIVE', active: true, status: 'ACTIVE' }),
    )).toBe(true);
  });

  it('the paused banner names the paused state AND the exact recover command', () => {
    const out = formatPausedRunBanner(pausedAuthority(), 'en');
    expect(out).toMatch(/sprint-001/u);
    expect(out).toMatch(/deckent recover sprint-001 --resume/u);
    expect(out).toMatch(/NO_GO/u); // the reason is surfaced, not swallowed
  });

  it('the banner falls back to a derived recover command when the authority omits one', () => {
    const out = formatPausedRunBanner(pausedAuthority({ recoveryCommand: null } as never), 'en');
    expect(out).toMatch(/deckent recover sprint-001 --resume/u);
  });
});
