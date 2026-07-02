// Task 357-014 — ONB-HONEST: doctor "ready | missing | one-command-fix" honest
// summary presentation layer. Verifies buildDoctorHonestSummary()/
// formatDoctorHonestSummary() (the pure logic behind the closing summary block
// in formatHumanDoctor() and the `--json` `honestSummary` field) and confirms
// the block is actually wired into formatHumanDoctor()'s output.
//
// Hermetic: pure-function fixtures only, no filesystem/process/network I/O.

import { describe, it, expect } from 'vitest';
import {
  buildDoctorHonestSummary,
  formatDoctorHonestSummary,
  formatHumanDoctor,
  type DoctorHonestState,
} from '../../src/cli/commands/doctor.js';
import type { DetectedProvider } from '../../src/core/provider.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

interface CheckFixture {
  name: string;
  passed: boolean;
  message: string;
  required: boolean;
}

function check(overrides: Partial<CheckFixture> & { name: string }): CheckFixture {
  return { passed: true, message: 'ok', required: false, ...overrides };
}

const ALL_READY_CHECKS: CheckFixture[] = [
  check({ name: 'Node.js', passed: true, required: true }),
  check({ name: 'git', passed: true, required: true }),
];

// 'Workspace' is the one check that maps onto `deckent doctor --fix`'s closed
// mkdir/chmod/config-migrate whitelist (missing .deckent/ -> mkdir action).
const MIXED_CHECKS: CheckFixture[] = [
  check({ name: 'Node.js', passed: true, required: true }),
  check({ name: 'git', passed: true, required: true }),
  check({ name: 'tmux', passed: false, message: 'not found', required: true }),
  check({ name: 'Workspace', passed: false, message: '.deckent/ missing — run `deckent init`', required: false }),
];

const NO_FIXABLE_CHECKS: CheckFixture[] = [
  check({ name: 'Node.js', passed: true, required: true }),
  check({ name: 'tmux', passed: false, message: 'not found', required: true }),
  check({ name: 'Brain Dir', passed: false, message: '.brain/ missing', required: false }),
];

// ─── classification (ready | missing | one-command-fix) ────────────────────

describe('buildDoctorHonestSummary — three-state classification', () => {
  it('classifies every passing check as ready', () => {
    const summary = buildDoctorHonestSummary(ALL_READY_CHECKS, 'en');
    expect(summary.checks.every(c => c.state === 'ready')).toBe(true);
    expect(summary.readyCount).toBe(2);
    expect(summary.missingCount).toBe(0);
    expect(summary.fixableCount).toBe(0);
  });

  it('classifies a failing "Workspace" check as one-command-fix (deckent doctor --fix can repair it)', () => {
    const summary = buildDoctorHonestSummary(MIXED_CHECKS, 'en');
    const workspace = summary.checks.find(c => c.name === 'Workspace');
    expect(workspace?.state).toBe('one-command-fix');
  });

  it('classifies a failing check outside the --fix whitelist as missing', () => {
    const summary = buildDoctorHonestSummary(MIXED_CHECKS, 'en');
    const tmux = summary.checks.find(c => c.name === 'tmux');
    expect(tmux?.state).toBe('missing');
  });

  it('counts missingCount as the combined total of missing + one-command-fix', () => {
    const summary = buildDoctorHonestSummary(MIXED_CHECKS, 'en');
    // tmux (missing) + Workspace (one-command-fix) = 2
    expect(summary.missingCount).toBe(2);
    expect(summary.fixableCount).toBe(1);
    expect(summary.readyCount).toBe(2);
  });

  it('never classifies a passing check as anything other than ready, regardless of name', () => {
    const summary = buildDoctorHonestSummary(
      [check({ name: 'Workspace', passed: true })],
      'en',
    );
    expect(summary.checks[0]?.state).toBe('ready' satisfies DoctorHonestState);
  });
});

// ─── summaryLine — three closing-line variants ──────────────────────────────

describe('buildDoctorHonestSummary — summaryLine variants', () => {
  it('renders an all-ready celebratory line when nothing is missing', () => {
    const summary = buildDoctorHonestSummary(ALL_READY_CHECKS, 'en');
    expect(summary.summaryLine).toContain('2 ready');
    expect(summary.summaryLine).not.toContain('missing');
  });

  it('renders "N ready · M missing (K fixed by `deckent doctor --fix`)" when some are fixable', () => {
    const summary = buildDoctorHonestSummary(MIXED_CHECKS, 'en');
    expect(summary.summaryLine).toContain('2 ready');
    expect(summary.summaryLine).toContain('2 missing');
    expect(summary.summaryLine).toContain('1 fixed by `deckent doctor --fix`');
  });

  it('renders "N ready · M missing" with no fix-hint parenthetical when none are fixable', () => {
    const summary = buildDoctorHonestSummary(NO_FIXABLE_CHECKS, 'en');
    expect(summary.summaryLine).toContain('1 ready');
    expect(summary.summaryLine).toContain('2 missing');
    expect(summary.summaryLine).not.toContain('deckent doctor --fix');
  });

  it('renders the Turkish variants with hazır/eksik/düzelir wording', () => {
    const allReady = buildDoctorHonestSummary(ALL_READY_CHECKS, 'tr');
    expect(allReady.summaryLine).toContain('hazır');

    const mixed = buildDoctorHonestSummary(MIXED_CHECKS, 'tr');
    expect(mixed.summaryLine).toContain('hazır');
    expect(mixed.summaryLine).toContain('eksik');
    expect(mixed.summaryLine).toContain('düzelir');

    const noFixable = buildDoctorHonestSummary(NO_FIXABLE_CHECKS, 'tr');
    expect(noFixable.summaryLine).toContain('eksik');
    expect(noFixable.summaryLine).not.toContain('düzelir');
  });
});

// ─── per-check explanation — plain-language, i18n, robust fallback ─────────

describe('buildDoctorHonestSummary — per-check explanations', () => {
  it('gives ready checks an empty explanation', () => {
    const summary = buildDoctorHonestSummary(ALL_READY_CHECKS, 'en');
    expect(summary.checks.every(c => c.explanation === '')).toBe(true);
  });

  it('gives a known check name a non-technical, non-empty explanation', () => {
    const summary = buildDoctorHonestSummary(MIXED_CHECKS, 'en');
    const tmux = summary.checks.find(c => c.name === 'tmux');
    expect(tmux?.explanation).toBeTruthy();
    expect(tmux?.explanation).not.toBe('tmux');
    expect(tmux?.explanation.toLowerCase()).toContain('tmux');
  });

  it('appends a fixable-suffix mentioning `deckent doctor --fix` only for one-command-fix state', () => {
    const summary = buildDoctorHonestSummary(MIXED_CHECKS, 'en');
    const workspace = summary.checks.find(c => c.name === 'Workspace');
    const tmux = summary.checks.find(c => c.name === 'tmux');
    expect(workspace?.explanation).toContain('deckent doctor --fix');
    expect(tmux?.explanation).not.toContain('deckent doctor --fix');
  });

  it('falls back to a generic i18n template for an unknown/future check name (never breaks silently)', () => {
    const summary = buildDoctorHonestSummary(
      [check({ name: 'Some Future Check', passed: false, message: 'widget missing' })],
      'en',
    );
    const entry = summary.checks[0];
    expect(entry?.state).toBe('missing');
    expect(entry?.explanation).toContain('Some Future Check');
    expect(entry?.explanation).toContain('widget missing');
  });
});

// ─── formatDoctorHonestSummary — rendered lines ─────────────────────────────

describe('formatDoctorHonestSummary', () => {
  it('includes the header and summary line, and one line per not-ready check only', () => {
    const summary = buildDoctorHonestSummary(MIXED_CHECKS, 'en');
    const lines = formatDoctorHonestSummary(summary, 'en');
    expect(lines[0]).toBe('Honest Summary:');
    expect(lines[1]).toBe(summary.summaryLine);

    const joined = lines.join('\n');
    expect(joined).toContain('tmux');
    expect(joined).toContain('Workspace');
    // Ready checks (Node.js, git) must NOT get their own explanation line.
    expect(joined).not.toContain('Node.js:');
    expect(joined).not.toContain('git:');
  });

  it('emits no per-check lines when everything is ready', () => {
    const summary = buildDoctorHonestSummary(ALL_READY_CHECKS, 'en');
    const lines = formatDoctorHonestSummary(summary, 'en');
    expect(lines).toHaveLength(2); // header + summary line only
  });
});

// ─── formatHumanDoctor — honest block is actually wired into the CLI output ─

describe('formatHumanDoctor — honest summary is appended at the end', () => {
  const providers: DetectedProvider[] = [];

  it('appends "Honest Summary:" as the final section of the human doctor output', () => {
    const output = formatHumanDoctor({
      result: { ok: false, checks: MIXED_CHECKS },
      providers,
      brainLines: 0,
      brainBudget: 900,
      lastSprintId: null,
      debtItems: { total: 0, critical: 0 },
      lang: 'en',
    });

    const headerIdx = output.indexOf('Honest Summary:');
    expect(headerIdx).toBeGreaterThan(-1);
    // It must be the LAST section — nothing meaningful after the honest block's lines.
    expect(headerIdx).toBeGreaterThan(output.indexOf('Recommendation:'));
    expect(output).toContain('missing');
  });

  it('respects the Turkish lang option end-to-end through formatHumanDoctor', () => {
    const output = formatHumanDoctor({
      result: { ok: false, checks: MIXED_CHECKS },
      providers,
      brainLines: 0,
      brainBudget: 900,
      lastSprintId: null,
      debtItems: { total: 0, critical: 0 },
      lang: 'tr',
    });
    expect(output).toContain('Dürüst Özet:');
    expect(output).toContain('hazır');
  });
});
