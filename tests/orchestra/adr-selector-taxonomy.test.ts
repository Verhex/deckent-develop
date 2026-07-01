// ADR-TAXONOMY (2026-07-01) — the ADR-injection prompt path was written for the
// retired numeric ADR IDs (ADR-025) and silently broke on the current ADR-G/D
// taxonomy (ADR-G-025). This suite locks the fixed behaviour of the three pure
// functions that drive selection + distillation so the regressions can't return:
//   • extractExplicitAdrRefs — a task's `Governing: ADR-G-025` pin must be extracted
//     (the class letter used to break the digit match → every pin no-op'd).
//   • normalizeAdrId — canonical id must preserve the g|d class letter.
//   • distillActiveConstraint — the operative rule comes from the `**Enforcement:**
//     today=…` header, NOT the `**Class:** …` metadata line (the old bug).
//   • extractOperativeSection — falls back to `## Decision (Today)` for the new
//     format (no operative-marker comments), which trims the token bloat.

import { describe, it, expect } from 'vitest';
import {
  extractExplicitAdrRefs,
  distillActiveConstraint,
  extractOperativeSection,
} from '../../src/orchestra/adr-selector.js';

describe('ADR-TAXONOMY: extractExplicitAdrRefs matches the G/D taxonomy', () => {
  it('extracts a new-format class-lettered ref (ADR-G-025)', () => {
    expect(extractExplicitAdrRefs('Governing: ADR-G-025 resilience')).toEqual(['adr-g-025']);
  });
  it('extracts a lowercase dashed ref (adr-d-002) and pads the number', () => {
    expect(extractExplicitAdrRefs('per adr-d-2')).toEqual(['adr-d-002']);
  });
  it('still extracts a legacy classless ref (ADR-025) for back-compat', () => {
    expect(extractExplicitAdrRefs('see ADR-025')).toEqual(['adr-025']);
  });
  it('extracts multiple distinct refs, deduplicated', () => {
    const got = extractExplicitAdrRefs('touches ADR-G-017 and adr-g-017 and ADR-D-006');
    expect(got.sort()).toEqual(['adr-d-006', 'adr-g-017']);
  });
  it('returns [] when there is no ref', () => {
    expect(extractExplicitAdrRefs('no adr here')).toEqual([]);
  });
});

describe('ADR-TAXONOMY: distillActiveConstraint reads the real operative rule', () => {
  const NEW_HEADER = [
    '# ADR-G-025: Process Resilience',
    '',
    '**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Enforcement:** today=redact secrets on crash + persist audit → tomorrow=full HMAC chain',
    '**Status:** accepted · **Date:** 2026-06-30',
    '',
    '## Context',
    'Crashes leaked secrets.',
  ].join('\n');

  it('returns the Enforcement `today=` clause, NOT the `**Class:**` metadata', () => {
    const got = distillActiveConstraint(NEW_HEADER);
    expect(got).toContain('redact secrets on crash');
    expect(got).not.toMatch(/class:/i);
    expect(got).not.toContain('→ tomorrow');
  });

  it('prefers an explicit summary when provided', () => {
    expect(distillActiveConstraint(NEW_HEADER, 'the summary')).toBe('the summary');
  });

  it('falls back to the ## Decision line when there is no Enforcement header', () => {
    const c = '# ADR-X\n\n## Decision (Today)\n\n- **The rule** is X.\n\n## Consequences\nbad';
    expect(distillActiveConstraint(c)).toContain('The rule');
  });
});

describe('ADR-TAXONOMY: extractOperativeSection falls back to the Decision section', () => {
  it('returns the `## Decision (Today)` body (through the next ## header)', () => {
    const c = [
      '# ADR-G-017: Isolation',
      '## Context', 'ctx text',
      '## Decision (Today)', 'the operative decision line', 'second decision line',
      '## Consequences', 'consequence text',
    ].join('\n');
    const op = extractOperativeSection(c);
    expect(op).toContain('the operative decision line');
    expect(op).toContain('second decision line');
    expect(op).not.toContain('consequence text');
    expect(op).not.toContain('ctx text');
  });

  it('still honours explicit operative-marker comments when present', () => {
    const c = 'intro <!-- worker-operative-start -->PINNED RULE<!-- worker-operative-end --> outro';
    expect(extractOperativeSection(c)).toBe('PINNED RULE');
  });

  it('returns null when neither markers nor a Decision section exist', () => {
    expect(extractOperativeSection('# ADR\n\n## Context\nonly context')).toBeNull();
  });
});
