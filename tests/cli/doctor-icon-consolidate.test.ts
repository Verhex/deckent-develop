/**
 * born-557 (DOCTOR-ICON-CONSOLIDATE, Task 388-009).
 *
 * doctor.ts used to render status markers with two competing vocabularies:
 * Unicode symbols (✓ / ⚠ / ✗) in formatProviderDiagnosticsActionable, and
 * ASCII brackets ([PASS] / [WARN] / [FAIL]) in formatConnectorHealthLines,
 * formatWorkerImageLines, and the --pre-flight handler — sections that all
 * render inside the SAME default `deckent doctor` invocation.
 *
 * This suite pins the canonical `doctorStatusIcon` helper and verifies every
 * section now emits the single ASCII vocabulary, with no stray Unicode
 * symbols left over from the old vocabulary.
 *
 * formatHumanDoctor's own OK/FAIL/SKIP/Warning bare-word vocabulary and
 * formatRamExperiment's ✓/⚠/? are intentionally NOT touched by born-557 —
 * both are pinned byte-for-byte by pre-existing tests outside this task's
 * write scope (tests/cli/commands/doctor.test.ts,
 * tests/cli/doctor-ram-experiment.test.ts); changing them would regress
 * those suites. See task-388-009 .result notes for the docImpact follow-up.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn().mockReturnValue({}),
  validateDeckFile: vi.fn().mockReturnValue({ valid: true, warnings: [], errors: [] }),
  isDeckFileCommitted: vi.fn().mockReturnValue(false),
  KNOWN_DECK_KEYS: ['DECKENT_CLAUDE_API_KEY', 'DECKENT_OPENAI_API_KEY', 'DECKENT_GOOGLE_API_KEY'],
}));

vi.mock('../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('vscode'),
}));

import {
  doctorStatusIcon,
  formatProviderDiagnosticsActionable,
  formatConnectorHealthLines,
  formatWorkerImageLines,
} from '../../src/cli/commands/doctor.js';
import type { ProviderAvailabilityDetail } from '../../src/core/provider.js';
import type { HealthCheckResult } from '../../src/orchestra/connector.js';
import type { WorkerImageReport } from '../../src/core/worker-image-check.js';

/** Old, now-retired Unicode vocabulary — must never reappear in any of these renderers. */
const STALE_UNICODE_SYMBOLS = ['✓', '⚠', '✗'];

function makeProviderDetail(overrides: Partial<ProviderAvailabilityDetail>): ProviderAvailabilityDetail {
  return {
    name: 'claude',
    binaryFound: true,
    version: '1.0.0',
    versionStatus: 'ok',
    authMethod: 'session',
    authStatus: 'ok',
    available: true,
    partial: false,
    models: [],
    reason: 'ok',
    hints: [],
    ...overrides,
  } as ProviderAvailabilityDetail;
}

describe('doctorStatusIcon — canonical tri-state vocabulary', () => {
  it('returns [PASS] for pass', () => {
    expect(doctorStatusIcon('pass')).toBe('[PASS]');
  });

  it('returns [WARN] for warn', () => {
    expect(doctorStatusIcon('warn')).toBe('[WARN]');
  });

  it('returns [FAIL] for fail', () => {
    expect(doctorStatusIcon('fail')).toBe('[FAIL]');
  });
});

describe('formatProviderDiagnosticsActionable — migrated off Unicode symbols', () => {
  it('renders [PASS] for an available provider (not ✓)', () => {
    const out = formatProviderDiagnosticsActionable([
      makeProviderDetail({ name: 'claude', available: true, partial: false }),
    ]);
    expect(out).toContain('[PASS] Claude');
    for (const sym of STALE_UNICODE_SYMBOLS) expect(out).not.toContain(sym);
  });

  it('renders [WARN] for a partial provider (not ⚠)', () => {
    const out = formatProviderDiagnosticsActionable([
      makeProviderDetail({ name: 'codex', available: false, partial: true, reason: 'binary OK, auth missing' }),
    ]);
    expect(out).toContain('[WARN] Codex');
    for (const sym of STALE_UNICODE_SYMBOLS) expect(out).not.toContain(sym);
  });

  it('renders [FAIL] for a missing provider (not ✗)', () => {
    const out = formatProviderDiagnosticsActionable([
      makeProviderDetail({ name: 'gemini', available: false, partial: false, binaryFound: false }),
    ]);
    expect(out).toContain('[FAIL] Gemini');
    for (const sym of STALE_UNICODE_SYMBOLS) expect(out).not.toContain(sym);
  });
});

describe('formatConnectorHealthLines — unchanged output, now sourced from doctorStatusIcon', () => {
  function makeHealthResult(
    provider: string,
    available: boolean,
    authStatus: 'ok' | 'missing' | 'expired' = 'ok',
    cliVersion: string | null = null,
  ): HealthCheckResult {
    return { provider: provider as HealthCheckResult['provider'], available, authStatus, cliVersion, error: null };
  }

  it('still renders [PASS] for a healthy provider', () => {
    const lines = formatConnectorHealthLines([makeHealthResult('claude', true, 'ok', 'v2.1')], '/mock/root');
    expect(lines.some(l => l.includes('[PASS]') && l.includes('Claude'))).toBe(true);
  });

  it('still renders [WARN] for an unavailable provider', () => {
    const lines = formatConnectorHealthLines([makeHealthResult('gemini', false, 'missing')], '/mock/root');
    expect(lines.some(l => l.includes('[WARN]') && l.includes('Gemini'))).toBe(true);
  });

  it('has no stray Unicode status symbols anywhere in the output', () => {
    const lines = formatConnectorHealthLines(
      [makeHealthResult('claude', true, 'ok', 'v2.1'), makeHealthResult('codex', false, 'missing')],
      '/mock/root',
    );
    const joined = lines.join('\n');
    for (const sym of STALE_UNICODE_SYMBOLS) expect(joined).not.toContain(sym);
  });
});

describe('formatWorkerImageLines — unchanged output, now sourced from doctorStatusIcon', () => {
  const readyReport: WorkerImageReport = {
    state: 'ready',
    missingClis: [],
    missingCaCerts: false,
    suggestedBuildCmd: 'docker build .',
  };
  const missingReport: WorkerImageReport = {
    state: 'missing',
    missingClis: ['codex'],
    missingCaCerts: false,
    suggestedBuildCmd: 'docker build --build-arg WITH_CODEX=1 .',
  };

  it('renders a single [PASS] line when ready', () => {
    const lines = formatWorkerImageLines(readyReport);
    expect(lines.some(l => l.includes('[PASS]'))).toBe(true);
    expect(lines.some(l => l.includes('[WARN]'))).toBe(false);
  });

  it('renders a [WARN] line when not ready', () => {
    const lines = formatWorkerImageLines(missingReport);
    expect(lines.some(l => l.includes('[WARN]'))).toBe(true);
  });

  it('has no stray Unicode status symbols anywhere in the output', () => {
    const joined = [...formatWorkerImageLines(readyReport), ...formatWorkerImageLines(missingReport)].join('\n');
    for (const sym of STALE_UNICODE_SYMBOLS) expect(joined).not.toContain(sym);
  });
});
