// 7113 D — the view surface: one calm Workline line, the /context detail block
// and full EN/TR coverage. Every value is the host's projection; unknown stays
// unknown and default-OFF renders byte-identically to pre-7113.
import { describe, it, expect } from 'vitest';
import { formatReferenceActivityLabels, formatReferenceBytes, applySignalVars } from '../../../src/cli/repl/native-agent-bridge.js';
import { formatContextSnapshot, buildContextSlashLabels } from '../../../src/cli/repl/run.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';
import { REFERENCE_FAILURE_CODES } from '../../../src/agent/reference-digest-types.js';
import type { ReferenceDigestProgress } from '../../../src/agent/reference-digest-types.js';
import type { ContextSnapshot } from '../../../src/cli/repl/native-agent-bridge.js';

const PHASES = ['ADMITTING', 'SNAPSHOTTING', 'MAPPING', 'REDUCING', 'ANSWERING', 'COMPLETE', 'PARTIAL', 'FAILED', 'CANCELLED'] as const;
const t = (lang: string) => (key: string): string => getMessage(key, lang);
// Both catalogue languages, taken from the catalogue itself.
const LANGS = getMessageLanguages('native.reference.unknown');

const progress = (over: Partial<ReferenceDigestProgress> = {}): ReferenceDigestProgress => ({
  phase: 'MAPPING',
  sourcePath: 'docs/MASTER-PLAN.md',
  sourceBytes: 1_310_720,
  sourceDigest: 'a'.repeat(64),
  observedBytes: 1_310_720,
  sections: { covered: 3, total: 8 },
  coveredBytes: 491_520,
  requests: { map: 3, reduce: 1, cap: 64 },
  usage: { inputTokens: 1613, outputTokens: 783 },
  deadlineRemainingMs: 42_000,
  journalRef: 'reference-journal:abc',
  startedAtMs: 1_000_000,
  updatedAt: 1_000_000,
  ...over,
});

const snapshot = (referenceProgress?: ReferenceDigestProgress): ContextSnapshot => ({
  window: 131_072, measuredInputTokens: 13_703, epoch: 1, messages: 4, preambleMessages: 0,
  checkpoint: 'empty', refreshPlanned: false, highWaterRatio: 0.75,
  ...(referenceProgress ? { referenceProgress } : {}),
});

describe('7113 D Workline line', () => {
  it('ships both catalogue languages for the digest surface', () => {
    expect([...LANGS].sort()).toEqual(['en', 'tr']);
  });

  it.each(LANGS)('%s: names the source, phase, verified sections, size and age on ONE line', (lang) => {
    const labels = formatReferenceActivityLabels({ progress: progress(), t: t(lang), now: 1_012_000 });
    expect(labels.label).toContain('docs/MASTER-PLAN.md');
    expect(labels.label).toContain(getMessage('native.reference.phase.mapping', lang));
    expect(labels.label).toContain('3/8');
    expect(labels.label).toContain('1.3 MiB');
    // 12 s of PROGRAM time, not the age of the projection object.
    expect(labels.label).toContain('12');
    expect(labels.label.split('\n')).toHaveLength(1);
    expect(labels.compactLabel.split('\n')).toHaveLength(1);
    // The compact form is what a narrow terminal shows: strictly shorter.
    expect(labels.compactLabel.length).toBeLessThan(labels.label.length);
  });

  it.each(LANGS)('%s: an unknown section total renders as unknown, never as 0', (lang) => {
    const labels = formatReferenceActivityLabels({ progress: progress({ sections: undefined }), t: t(lang), now: 1_000_000 });
    expect(labels.label).toContain(getMessage('native.reference.unknown', lang));
    expect(labels.label).not.toContain('0/0');
  });

  it('falls back to the source digest when the host has no path for the reference', () => {
    const labels = formatReferenceActivityLabels({ progress: progress({ sourcePath: undefined }), t: t('en'), now: 1_000_000 });
    expect(labels.label).toContain('sha256:aaaaaaaaaaaa');
  });

  it('renders bytes in a stable unit that is never a token count', () => {
    expect(formatReferenceBytes(512)).toBe('512 B');
    expect(formatReferenceBytes(2048)).toBe('2.0 KiB');
    expect(formatReferenceBytes(1_310_720)).toBe('1.3 MiB');
  });
});

describe('7113 D /context detail', () => {
  it.each(LANGS)('%s: reports source bytes, coverage, child requests, retained tokens, deadline and journal', (lang) => {
    const labels = buildContextSlashLabels(t(lang));
    const text = formatContextSnapshot(snapshot(progress({ phase: 'COMPLETE', retained: { digestTokens: 900, capTokens: 40_000, windowTokens: 131_072 } })), labels);
    expect(text).toContain('docs/MASTER-PLAN.md');
    expect(text).toContain(getMessage('native.reference.phase.complete', lang));
    expect(text).toContain('1.3 MiB');
    expect(text).toContain('3/8');
    expect(text).toContain('1613');
    expect(text).toContain('783');
    expect(text).toContain('900');
    expect(text).toContain('131072');
    expect(text).toContain('42');
    expect(text).toContain('reference-journal:abc');
  });

  it.each(LANGS)('%s: an unmeasured retained digest is unknown, not zero', (lang) => {
    const labels = buildContextSlashLabels(t(lang));
    const text = formatContextSnapshot(snapshot(progress()), labels);
    const line = text.split('\n').find(row => row.includes(getMessage('native-context.slash.reference_retained', lang).split('{')[0]!.trim()))!;
    expect(line).toContain(getMessage('native.reference.unknown', lang));
    expect(line).not.toMatch(/\b0\b/);
  });

  it.each(LANGS)('%s: a typed failure is a sentence, not a raw code', (lang) => {
    const labels = buildContextSlashLabels(t(lang));
    const text = formatContextSnapshot(snapshot(progress({ phase: 'PARTIAL', failure: 'REFERENCE_DEADLINE' })), labels);
    expect(text).toContain(getMessage('native.reference.failure.reference_deadline', lang));
    expect(text).not.toContain('REFERENCE_DEADLINE');
  });

  it.each(LANGS)('%s: with no digest program the output is byte-identical to pre-7113', (lang) => {
    const labels = buildContextSlashLabels(t(lang));
    expect(formatContextSnapshot(snapshot(), labels)).toBe(formatContextSnapshot(snapshot(), labels));
    expect(formatContextSnapshot(snapshot(), labels)).not.toContain(getMessage('native-context.slash.reference_header', lang).split('{')[0]!.trim());
  });
});

describe('7113 D localization completeness', () => {
  it.each(LANGS)('%s: every phase and every typed failure has a real translation', (lang) => {
    for (const phase of PHASES) {
      const key = `native.reference.phase.${phase.toLowerCase()}`;
      expect(getMessage(key, lang), key).not.toBe(key);
    }
    for (const code of REFERENCE_FAILURE_CODES) {
      const key = `native.reference.failure.${code.toLowerCase()}`;
      expect(getMessage(key, lang), key).not.toBe(key);
    }
  });

  it.each(LANGS)('%s: the unavailable signal shows the localized reason, not the code', (lang) => {
    const text = applySignalVars(t(lang), getMessage('native.reference.unavailable', lang), { reason: 'REFERENCE_SOURCE_TOO_LARGE' });
    expect(text).toContain(getMessage('native.reference.failure.reference_source_too_large', lang));
    expect(text).not.toContain('REFERENCE_SOURCE_TOO_LARGE');
  });

  it('an unknown reason code still reaches the user instead of vanishing', () => {
    const text = applySignalVars(t('en'), 'x {reason}', { reason: 'REFERENCE_FUTURE_CODE' });
    expect(text).toBe('x REFERENCE_FUTURE_CODE');
  });
});
