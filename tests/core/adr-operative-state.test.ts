import { describe, it, expect } from 'vitest';
import {
  readOperativeState,
  writeOperativeState,
  extractOperative,
  operativeMetadata,
  renderOperativeState,
  OPERATIVE_KEY,
  type OperativeState,
} from '../../src/core/adr-operative-state.js';
import { ADR_SEED_DATA } from '../../src/core/adr-seed.js';

// ─── readOperativeState / writeOperativeState round-trip ─────────────────────

describe('operative-state round-trip (metadata blob)', () => {
  const sample: OperativeState = {
    enforcementLevel: 'soft',
    exceptions: ['carve-out A (tracked)', 'carve-out B'],
    flagGating: 'prompt.adr_render',
  };

  it('round-trips through object metadata', () => {
    const adr = writeOperativeState({ metadata: {} as Record<string, unknown> }, sample);
    expect(readOperativeState(adr)).toEqual(sample);
  });

  it('round-trips through string (JSON) metadata — DB form', () => {
    // MemoryEntryV2.metadata is a JSON string; write must preserve that form.
    const adr = writeOperativeState({ metadata: '{}' }, sample);
    expect(typeof adr.metadata).toBe('string');
    expect(readOperativeState(adr)).toEqual(sample);
  });

  it('round-trips when metadata is absent (defaults to object form)', () => {
    const adr = writeOperativeState({}, sample);
    expect(typeof adr.metadata).toBe('object');
    expect(readOperativeState(adr)).toEqual(sample);
  });

  it('round-trips a hard rule without flagGating', () => {
    const hard: OperativeState = { enforcementLevel: 'hard', exceptions: [] };
    const adr = writeOperativeState({ metadata: {} as Record<string, unknown> }, hard);
    const read = readOperativeState(adr);
    expect(read).toEqual(hard);
    expect(read?.flagGating).toBeUndefined();
  });

  it('preserves unrelated metadata keys on write', () => {
    const adr = writeOperativeState(
      { metadata: { unrelated: 42, tags: ['x'] } as Record<string, unknown> },
      sample,
    );
    const meta = adr.metadata as Record<string, unknown>;
    expect(meta.unrelated).toBe(42);
    expect(meta.tags).toEqual(['x']);
    expect(meta[OPERATIVE_KEY]).toBeDefined();
    expect(readOperativeState(adr)).toEqual(sample);
  });

  it('does not mutate the caller-supplied exceptions array', () => {
    const exceptions = ['only one'];
    const state: OperativeState = { enforcementLevel: 'soft', exceptions };
    const adr = writeOperativeState({ metadata: {} as Record<string, unknown> }, state);
    exceptions.push('mutated after write');
    expect(readOperativeState(adr)?.exceptions).toEqual(['only one']);
  });

  it('overwrites a prior operative-state on re-write', () => {
    const first = writeOperativeState({ metadata: {} as Record<string, unknown> }, sample);
    const second = writeOperativeState(first, { enforcementLevel: 'hard', exceptions: [] });
    expect(readOperativeState(second)).toEqual({ enforcementLevel: 'hard', exceptions: [] });
  });
});

// ─── readOperativeState defensiveness ────────────────────────────────────────

describe('readOperativeState — absence & malformed input', () => {
  it('returns null when metadata is absent / null / empty string', () => {
    expect(readOperativeState({})).toBeNull();
    expect(readOperativeState({ metadata: null })).toBeNull();
    expect(readOperativeState({ metadata: '' })).toBeNull();
    expect(readOperativeState({ metadata: '   ' })).toBeNull();
  });

  it('returns null when metadata has no operative key', () => {
    expect(readOperativeState({ metadata: { other: 1 } })).toBeNull();
    expect(readOperativeState({ metadata: '{"other":1}' })).toBeNull();
  });

  it('returns null on malformed JSON string (never throws)', () => {
    expect(readOperativeState({ metadata: 'not json {' })).toBeNull();
  });

  it('returns null when enforcementLevel is missing or invalid', () => {
    expect(readOperativeState({ metadata: { [OPERATIVE_KEY]: { exceptions: [] } } })).toBeNull();
    expect(
      readOperativeState({ metadata: { [OPERATIVE_KEY]: { enforcementLevel: 'maybe' } } }),
    ).toBeNull();
  });

  it('tolerates a missing/non-array exceptions field → []', () => {
    const read = readOperativeState({ metadata: { [OPERATIVE_KEY]: { enforcementLevel: 'soft' } } });
    expect(read).toEqual({ enforcementLevel: 'soft', exceptions: [] });
  });

  it('filters non-string entries out of exceptions', () => {
    const read = readOperativeState({
      metadata: { [OPERATIVE_KEY]: { enforcementLevel: 'soft', exceptions: ['ok', 3, null, 'fine'] } },
    });
    expect(read?.exceptions).toEqual(['ok', 'fine']);
  });

  it('ignores an empty/blank flagGating', () => {
    const read = readOperativeState({
      metadata: { [OPERATIVE_KEY]: { enforcementLevel: 'hard', exceptions: [], flagGating: '  ' } },
    });
    expect(read?.flagGating).toBeUndefined();
  });
});

// ─── operativeMetadata helper ────────────────────────────────────────────────

describe('operativeMetadata', () => {
  it('builds a bare metadata blob readable by readOperativeState', () => {
    const state: OperativeState = { enforcementLevel: 'soft', exceptions: ['x'] };
    const meta = operativeMetadata(state);
    expect(meta[OPERATIVE_KEY]).toBeDefined();
    expect(readOperativeState({ metadata: meta })).toEqual(state);
  });
});

// ─── extractOperative (marker extraction) ────────────────────────────────────

describe('extractOperative', () => {
  it('extracts and trims the section between markers', () => {
    const content = [
      'Preamble.',
      '<!-- worker-operative-start -->',
      '**Decision:** Use ESM.',
      '<!-- worker-operative-end -->',
      'Trailing notes.',
    ].join('\n');
    expect(extractOperative(content)).toBe('**Decision:** Use ESM.');
  });

  it('returns null when markers are absent', () => {
    expect(extractOperative('# ADR with no markers at all')).toBeNull();
  });

  it('returns null when only one marker is present', () => {
    expect(extractOperative('start only <!-- worker-operative-start --> body')).toBeNull();
    expect(extractOperative('end only <!-- worker-operative-end --> body')).toBeNull();
  });

  it('returns null when end precedes start', () => {
    const reversed = '<!-- worker-operative-end -->X<!-- worker-operative-start -->';
    expect(extractOperative(reversed)).toBeNull();
  });
});

// ─── renderOperativeState (prompt-injection SSOT, parity primitive) ──────────

describe('renderOperativeState', () => {
  it('renders a SOFT enforcement line (no exceptions / no flag)', () => {
    const out = renderOperativeState({ enforcementLevel: 'soft', exceptions: [] });
    expect(out).toBe('**enforcement:** SOFT — advisory/warn; a violation is flagged but does NOT block.');
  });

  it('renders a HARD enforcement line', () => {
    const out = renderOperativeState({ enforcementLevel: 'hard', exceptions: [] });
    expect(out).toBe('**enforcement:** HARD — a violation blocks the task (NO_GO).');
  });

  it('prefixes the enforcement line with the supplied label', () => {
    const out = renderOperativeState({ enforcementLevel: 'soft', exceptions: [] }, { label: 'ADR-037' });
    expect(out.startsWith('**ADR-037 enforcement:**')).toBe(true);
  });

  it('lists sanctioned exceptions as bullet lines under a header', () => {
    const out = renderOperativeState({
      enforcementLevel: 'soft',
      exceptions: ['routing-engine ADR-008-W (tracked)', 'sanctioned provider CLI-spawn adapters'],
    });
    expect(out).toContain('Sanctioned exceptions (do NOT flag these as violations):');
    expect(out).toContain('- routing-engine ADR-008-W (tracked)');
    expect(out).toContain('- sanctioned provider CLI-spawn adapters');
  });

  it('emits a flag-gate line only when flagGating is present', () => {
    const gated = renderOperativeState({ enforcementLevel: 'hard', exceptions: [], flagGating: 'prompt.adr_render' });
    expect(gated).toContain('Gated by flag — applies only when `prompt.adr_render` is enabled.');
    const ungated = renderOperativeState({ enforcementLevel: 'hard', exceptions: [] });
    expect(ungated).not.toContain('Gated by flag');
  });

  it('filters out empty / whitespace-only exceptions and trims the rest', () => {
    const out = renderOperativeState({
      enforcementLevel: 'soft',
      exceptions: ['  real exception  ', '', '   '],
    });
    expect(out).toContain('- real exception');
    expect(out).not.toMatch(/- *\n/); // no empty bullet
    expect(out.split('\n').filter((l) => l.startsWith('- ')).length).toBe(1);
  });

  it('returns "" for null / undefined / structurally-invalid state (no stranded label)', () => {
    expect(renderOperativeState(null)).toBe('');
    expect(renderOperativeState(undefined)).toBe('');
    // invalid enforcementLevel that bypassed the reader (defensive)
    expect(renderOperativeState({ enforcementLevel: 'maybe' as 'soft', exceptions: [] })).toBe('');
  });

  it('is deterministic — identical output across repeated calls (prompt-determinism guard)', () => {
    const state: OperativeState = {
      enforcementLevel: 'soft',
      exceptions: ['a', 'b'],
      flagGating: 'feature.x',
    };
    expect(renderOperativeState(state, { label: 'ADR-009' })).toBe(
      renderOperativeState(state, { label: 'ADR-009' }),
    );
  });

  it('integrates with readOperativeState on a seed ADR (read → render → non-empty parity block)', () => {
    const adr037 = ADR_SEED_DATA.find((a) => a.id === 'adr-037')!;
    const rendered = renderOperativeState(readOperativeState(adr037), { label: 'ADR-037' });
    expect(rendered).toContain('**ADR-037 enforcement:** SOFT');
    expect(rendered).toContain('Sanctioned exceptions');
  });
});

// ─── Seed population (RBAC→soft + residual exception) ─────────────────────────

describe('ADR_SEED_DATA operative-state population', () => {
  const byId = (id: string) => ADR_SEED_DATA.find((a) => a.id === id);

  it('adr-037 (RBAC) carries soft enforcement + a non-empty residual exception', () => {
    const state = readOperativeState(byId('adr-037')!);
    expect(state).not.toBeNull();
    expect(state?.enforcementLevel).toBe('soft');
    expect(state?.exceptions.length).toBeGreaterThan(0);
  });

  it('adr-008 (Brain import direction) carries soft enforcement + residual exceptions', () => {
    const state = readOperativeState(byId('adr-008')!);
    expect(state).not.toBeNull();
    expect(state?.enforcementLevel).toBe('soft');
    expect(state?.exceptions.length).toBeGreaterThan(0);
  });

  it('an un-annotated seed ADR returns null (no default injected)', () => {
    expect(readOperativeState(byId('adr-003')!)).toBeNull();
  });
});
