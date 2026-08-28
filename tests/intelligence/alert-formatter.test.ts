import { describe, expect, it } from 'vitest';

import { compareSignal } from '../../src/intelligence/comparison.js';
import {
  formatAlert,
  type AlertFormatInput,
} from '../../src/intelligence/alert-formatter.js';
import type { CapabilityEntry } from '../../src/intelligence/types.js';

const BASELINE: CapabilityEntry = {
  capabilityId: 'capability-authority',
  domain: 'capability authority',
  status: 'WIRED_UNPROVEN',
  evidenceRefs: [
    'src/core/capability-broker.ts:41-73',
    'src/core/capability-registry.ts#resolve',
  ],
  sourceDigest: 'sha256:fixture',
  notes: 'Capability broker is wired but not observed live.',
};

const INPUT: AlertFormatInput = {
  occurredAt: '2026-08-28T12:30:00Z',
  event: {
    competitor: 'OpenAI Codex',
    eventType: 'Yeni protocol desteği yayınlandı',
    affectedCapability: 'capability authority',
  },
  baseline: BASELINE,
  comparison: compareSignal({
    signalId: 'codex-protocol-release',
    baselineStatus: 'WIRED_UNPROVEN',
    competitorStatus: 'LIVE_PROVEN',
    evidenceRefs: ['competitor/release.md'],
    dimensions: {
      capability: 'Competitor capability is live.',
      'protocol/interop': 'A new interoperable protocol is available.',
    },
  }),
  action: 'protocol adapter spike aç ve live evidence üret',
};

describe('compact Turkish alert formatter', () => {
  it('includes every required section, typed classes, and exact baseline evidence refs', () => {
    const result = formatAlert(INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('Ne oldu: Yeni protocol desteği yayınlandı');
    expect(result.text).toContain('Rakip: OpenAI Codex');
    expect(result.text).toContain('Yetenek alanı: capability authority');
    expect(result.text).toContain('Deckent statüsü: WIRED_UNPROVEN');
    expect(result.text).toContain('Göreli sınıf: BEHIND');
    expect(result.text).toContain('Boşluk boyutu: capability, protocol/interop');
    expect(result.text).toContain(
      'Ne yapılabilir: protocol adapter spike aç ve live evidence üret',
    );
    expect(result.text).toContain('src/core/capability-broker.ts:41-73');
    expect(result.text).toContain('src/core/capability-registry.ts#resolve');
    expect(result.evidenceRefs).toBe(BASELINE.evidenceRefs);
    expect(result.text).not.toContain('competitor/release.md');
    expect(result.text).not.toMatch(/(?:yüzde|puan|skor|score)/i);
    expect(result.text).not.toMatch(/\b\d+(?:[.,]\d+)?\s*%/);
    expect(result.text).not.toMatch(/\b\d+(?:[.,]\d+)?\s*\/\s*\d+\b/);
  });

  it('returns identical text for identical input, including the injected time', () => {
    expect(formatAlert(INPUT)).toEqual(formatAlert(INPUT));
    const result = formatAlert(INPUT);
    expect(result.ok && result.text).toContain('Zaman: 2026-08-28T12:30:00Z');
  });

  it('returns a typed error when the relevant baseline entry is missing', () => {
    expect(formatAlert({ ...INPUT, baseline: undefined })).toEqual({
      ok: false,
      error: {
        code: 'BASELINE_ENTRY_MISSING',
        capability: 'capability authority',
        message: 'capability authority için baseline girdisi gerekli',
      },
    });
  });

  it('names an honest typed gap value when no dimension is affected', () => {
    const result = formatAlert({
      ...INPUT,
      comparison: compareSignal({
        signalId: 'no-gap',
        baselineStatus: 'LIVE_PROVEN',
        competitorStatus: 'LIVE_PROVEN',
        evidenceRefs: ['competitor/release.md'],
        dimensions: {},
      }),
    });

    expect(result.ok && result.text).toContain('Boşluk boyutu: NOT_APPLICABLE');
  });
});
