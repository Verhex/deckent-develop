// PCOMP (sprint-348-005 prompt-composition analysis) — locks the P0 fixes:
//   W1 — scope single-authority: with an explicit filesWrite list the directory
//        list is READ scope and filesWrite is the SOLE write authority (the old
//        template printed two conflicting authorities).
//   W2 — step-4 no longer orders the worker to edit docs outside its write list;
//        doc staleness goes to the result `notes` as a docImpact: line.
//   W6 — result-precedence: the .result schema is the only output contract; a
//        persona's report format never replaces it.
//   W4 — tiered ADR injection: only the GOVERNING (explicit-ref) ADR gets a full
//        operative body; scoring-selected ADRs render condensed (Active-constraint
//        + Contract + pointer). Measured dead weight before: ~40-50%/prompt.
//   W3 — injection decisions are audited to .deckent/prompts/injection-audit.jsonl.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildScopeBlock } from '../../src/orchestra/prompt-god-template.js';
import {
  buildAdrPromptSection,
  classifyInjectionTier,
  extractContractSection,
} from '../../src/orchestra/adr-selector.js';
import type { AdrRelevance } from '../../src/orchestra/adr-selector.js';
import { logInjectionAudit } from '../../src/orchestra/task-builder.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── W1: scope single-authority ─────────────────────────────────────────

describe('PCOMP-W1: scope block has a single write authority', () => {
  const scope = {
    directories: ['src/cli/', 'src/core/', 'docs/adr/'],
    filesRead: [],
    filesWrite: ['src/cli/helpers/error-handler.ts', 'tests/cli/error-handler-redact.test.ts'],
  };

  it('labels directories as READ scope and filesWrite as the canonical WRITE authority', () => {
    const out = buildScopeBlock(scope, [], false);
    expect(out).toContain('READ/context scope');
    expect(out).toContain('WRITE authority (canonical');
    // The old conflicting phrasing must be gone when filesWrite exists.
    expect(out).not.toContain('You may ONLY modify files in these directories');
  });

  it('states explicitly that a read directory does NOT grant write permission', () => {
    const out = buildScopeBlock(scope, [], false);
    expect(out).toMatch(/does NOT grant write permission/i);
  });

  it('keeps the directory-fallback wording when no filesWrite list exists (PQ-4 F5)', () => {
    const out = buildScopeBlock({ directories: ['src/x/'], filesRead: [], filesWrite: [] }, [], false);
    expect(out).toContain('You may ONLY modify files in these directories');
  });
});

// ─── W4: tiered ADR injection ───────────────────────────────────────────

const GOVERNING_ADR: MemoryEntryV2 = {
  id: 'adr-g-025',
  type: 'adr',
  status: 'accepted',
  title: 'Process Resilience',
  content: [
    '# ADR-G-025: Process Resilience',
    '**Class:** ADR-G · **Enforcement:** today=redact on crash → tomorrow=more',
    '## Context', 'ctx',
    '## Decision (Today)', 'THE OPERATIVE DECISION BODY',
    '## Consequences', 'cons',
  ].join('\n'),
} as unknown as MemoryEntryV2;

const BACKGROUND_ADR: MemoryEntryV2 = {
  id: 'adr-d-004',
  type: 'adr',
  status: 'accepted',
  title: 'Layer-1 Import Direction',
  content: [
    '# ADR-D-004: Layer-1',
    '**Class:** ADR-D · **Enforcement:** today=core→orchestra scan only',
    '## Context', 'layer ctx',
    '## Contract (immutable — import-direction core)', 'C1 — lower layers never import upward.',
    '## Decision (Today)', 'THE FULL LAYER MODEL BODY',
    '## Consequences', 'layer cons',
  ].join('\n'),
} as unknown as MemoryEntryV2;

function rel(adrId: string, title: string, reasons: string[]): AdrRelevance {
  return { adrId, title, score: 1, matchReasons: reasons };
}

describe('PCOMP-W4: tiered ADR injection (operative render)', () => {
  const ranked = [
    rel('adr-g-025', 'Process Resilience', ['explicit-ref', 'scope-path-match']),
    rel('adr-d-004', 'Layer-1 Import Direction', ['scope-path-match', 'keyword-match']),
  ];
  const all = [GOVERNING_ADR, BACKGROUND_ADR];

  it('classifies explicit-ref as governing, scoring-only as constraint', () => {
    expect(classifyInjectionTier(ranked[0]!)).toBe('governing');
    expect(classifyInjectionTier(ranked[1]!)).toBe('constraint');
  });

  it('governing ADR gets its full operative (Decision) body', () => {
    const out = buildAdrPromptSection(ranked, 'full', all, 'operative', true);
    expect(out).toContain('THE OPERATIVE DECISION BODY');
  });

  it('constraint ADR is condensed: constraint line + Contract, NO full body', () => {
    const out = buildAdrPromptSection(ranked, 'full', all, 'operative', true);
    expect(out).not.toContain('THE FULL LAYER MODEL BODY'); // dead weight removed
    expect(out).toContain('C1 — lower layers never import upward.'); // Contract kept verbatim
    expect(out).toContain('[background constraint — full text: .brain/memory.db adr-d-004]');
  });

  it('extractContractSection returns the Contract body through the next header', () => {
    const c = extractContractSection(BACKGROUND_ADR.content);
    expect(c).toContain('C1 — lower layers never import upward.');
    expect(c).not.toContain('THE FULL LAYER MODEL BODY');
  });
});

// ─── W3: injection audit log ────────────────────────────────────────────

describe('PCOMP-W3: injection decisions are audited to JSONL', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pcomp-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('writes one line per prompt build with id/score/tier/reasons', () => {
    logInjectionAudit(root, { id: '348-005', title: 'CRASH-REDACT' }, [
      rel('adr-g-025', 'Resilience', ['explicit-ref']),
      rel('adr-g-006', 'Routing', ['keyword-match']),
    ]);
    const p = join(root, '.deckent', 'prompts', 'injection-audit.jsonl');
    expect(existsSync(p)).toBe(true);
    const rec = JSON.parse(readFileSync(p, 'utf-8').trim());
    expect(rec.task).toBe('348-005');
    expect(rec.adrs).toHaveLength(2);
    expect(rec.adrs[0]).toMatchObject({ id: 'adr-g-025', tier: 'governing' });
    expect(rec.adrs[1]).toMatchObject({ id: 'adr-g-006', tier: 'constraint', reasons: ['keyword-match'] });
  });

  it('is fail-soft: an unwritable root never throws', () => {
    expect(() => logInjectionAudit('/nonexistent/deny', { id: 'x' }, [])).not.toThrow();
  });
});
