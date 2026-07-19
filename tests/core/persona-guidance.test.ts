import { describe, it, expect } from 'vitest';
import {
  parseGuidanceSections,
  personaCoreBody,
  selectGuidanceSlice,
} from '../../src/core/persona-guidance.js';

describe('parseGuidanceSections', () => {
  it('extracts well-formed sections for known intents and default, trimmed, no issues', () => {
    const md = [
      '# Some Agent',
      '',
      '<!-- guidance:bugfix-start -->',
      'Reproduce first. Write a failing test before touching the fix.',
      '<!-- guidance:bugfix-end -->',
      '',
      '<!-- guidance:default-start -->',
      'General-purpose guidance for any intent.',
      '<!-- guidance:default-end -->',
      '',
      '## Full body continues here',
    ].join('\n');

    const result = parseGuidanceSections(md);

    expect(result.issues).toEqual([]);
    expect(result.sections.get('bugfix')).toBe(
      'Reproduce first. Write a failing test before touching the fix.',
    );
    expect(result.sections.get('default')).toBe('General-purpose guidance for any intent.');
    expect(result.sections.size).toBe(2);
  });

  it('returns an empty sections map and no issues when the document has no markers', () => {
    const md = '# Some Agent\n\nJust a plain prompt body, no guidance markers at all.';

    const result = parseGuidanceSections(md);

    expect(result.sections.size).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it('ignores an unknown intent key and reports it', () => {
    const md = [
      '<!-- guidance:frontend-start -->',
      'Not a real intent key.',
      '<!-- guidance:frontend-end -->',
      '<!-- guidance:default-start -->',
      'Fallback text.',
      '<!-- guidance:default-end -->',
    ].join('\n');

    const result = parseGuidanceSections(md);

    expect(result.sections.has('frontend')).toBe(false);
    expect(result.sections.get('default')).toBe('Fallback text.');
    expect(result.issues.some(i => i.includes('unknown intent key "frontend"'))).toBe(true);
  });

  it('keeps the first pair on duplicate same-intent markers and reports the rest', () => {
    const md = [
      '<!-- guidance:security-start -->',
      'FIRST slice — wins.',
      '<!-- guidance:security-end -->',
      '<!-- guidance:security-start -->',
      'SECOND slice — duplicate, discarded.',
      '<!-- guidance:security-end -->',
    ].join('\n');

    const result = parseGuidanceSections(md);

    expect(result.sections.get('security')).toBe('FIRST slice — wins.');
    expect(result.issues.some(i => i.includes('duplicate guidance marker for intent "security"'))).toBe(
      true,
    );
  });

  it('ignores a section whose start marker is never closed and reports it', () => {
    const md = [
      '<!-- guidance:performance-start -->',
      'This never gets a closing marker.',
      '',
      '<!-- guidance:default-start -->',
      'Default still parses fine.',
      '<!-- guidance:default-end -->',
    ].join('\n');

    const result = parseGuidanceSections(md);

    expect(result.sections.has('performance')).toBe(false);
    expect(result.sections.get('default')).toBe('Default still parses fine.');
    expect(
      result.issues.some(
        i => i.includes('unclosed guidance marker for intent "performance"') && i.includes('no matching end'),
      ),
    ).toBe(true);
  });

  it('recovers a later well-formed pair when an earlier start for the same key is never closed', () => {
    const md = [
      '<!-- guidance:migration-start -->',
      'Dangling start, no end — should be dropped.',
      '<!-- guidance:migration-start -->',
      'Second start closes properly.',
      '<!-- guidance:migration-end -->',
    ].join('\n');

    const result = parseGuidanceSections(md);

    expect(result.sections.get('migration')).toBe('Second start closes properly.');
    expect(
      result.issues.some(i => i.includes('unclosed guidance marker for intent "migration"')),
    ).toBe(true);
  });

  it('reports a stray end marker with no matching start', () => {
    const md = ['Some text before.', '<!-- guidance:devops-end -->', 'Some text after.'].join('\n');

    const result = parseGuidanceSections(md);

    expect(result.sections.has('devops')).toBe(false);
    expect(
      result.issues.some(
        i => i.includes('unclosed guidance marker for intent "devops"') && i.includes('no matching start'),
      ),
    ).toBe(true);
  });

  it('never throws on a document combining every malformed edge at once', () => {
    const chaotic = [
      '<!-- guidance:not-a-real-intent-start -->orphan unknown<!-- guidance:not-a-real-intent-end -->',
      '<!-- guidance:bugfix-end -->', // stray end, no start
      '<!-- guidance:bugfix-start -->dangling, never closed',
      '<!-- guidance:security-start -->first<!-- guidance:security-end -->',
      '<!-- guidance:security-start -->duplicate<!-- guidance:security-end -->',
      '<!-- guidance:default-start -->',
    ].join('\n');

    expect(() => parseGuidanceSections(chaotic)).not.toThrow();
    const result = parseGuidanceSections(chaotic);
    expect(result.sections.get('security')).toBe('first');
    expect(result.sections.has('default')).toBe(false);
    expect(result.sections.has('bugfix')).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('drops both sections and reports both issues when two different intents interleave', () => {
    const md = [
      '<!-- guidance:security-start -->',
      'foo',
      '<!-- guidance:config-start -->',
      'bar',
      '<!-- guidance:security-end -->',
      'baz',
      '<!-- guidance:config-end -->',
    ].join('\n');

    expect(() => parseGuidanceSections(md)).not.toThrow();
    const result = parseGuidanceSections(md);

    expect(result.sections.has('security')).toBe(false);
    expect(result.sections.has('config')).toBe(false);
    expect(
      result.issues.some(
        i => i.includes('overlapping guidance marker inside intent "security"') && i.includes('"config"'),
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        i => i.includes('overlapping guidance marker inside intent "config"') && i.includes('"security"'),
      ),
    ).toBe(true);
  });

  it('drops all sections and reports every pair when THREE intents mutually interleave', () => {
    // A-start B-start C-start A-end B-end C-end — generalizes the two-key case above; the
    // intruder check must not be a pairwise special-case, it must hold for any marker count.
    const md = [
      '<!-- guidance:security-start -->',
      'a',
      '<!-- guidance:config-start -->',
      'b',
      '<!-- guidance:performance-start -->',
      'c',
      '<!-- guidance:security-end -->',
      'd',
      '<!-- guidance:config-end -->',
      'e',
      '<!-- guidance:performance-end -->',
    ].join('\n');

    const result = parseGuidanceSections(md);

    expect(result.sections.size).toBe(0);
    expect(result.issues).toHaveLength(3);
    expect(result.issues.some(i => i.includes('intent "security"') && i.includes('"config"'))).toBe(true);
    expect(result.issues.some(i => i.includes('intent "config"') && i.includes('"performance"'))).toBe(true);
    expect(result.issues.some(i => i.includes('intent "performance"') && i.includes('"security"'))).toBe(true);
  });

  it('drops only the entangled sections in a chained interleave, keeping none of A-D corrupted', () => {
    // A-start B-start A-end C-start B-end D-start C-end D-end — each key overlaps only its
    // immediate neighbor, never all four at once; every one of the four is still entangled
    // with at least one neighbor, so none may survive with corrupted (raw-marker) content.
    const md = [
      '<!-- guidance:security-start -->',
      'a',
      '<!-- guidance:config-start -->',
      'b',
      '<!-- guidance:security-end -->',
      'c',
      '<!-- guidance:performance-start -->',
      'd',
      '<!-- guidance:config-end -->',
      'e',
      '<!-- guidance:design-start -->',
      'f',
      '<!-- guidance:performance-end -->',
      'g',
      '<!-- guidance:design-end -->',
    ].join('\n');

    const result = parseGuidanceSections(md);

    expect(result.sections.size).toBe(0);
    for (const key of ['security', 'config', 'performance', 'design']) {
      expect(result.issues.some(i => i.includes(`intent "${key}"`))).toBe(true);
    }
  });

  it('handles empty and non-string-ish input without throwing', () => {
    expect(() => parseGuidanceSections('')).not.toThrow();
    const result = parseGuidanceSections('');
    expect(result.sections.size).toBe(0);
    expect(result.issues).toEqual([]);
  });
});

describe('selectGuidanceSlice', () => {
  const md = [
    '<!-- guidance:bugfix-start -->',
    'Bugfix-specific guidance.',
    '<!-- guidance:bugfix-end -->',
    '',
    '<!-- guidance:default-start -->',
    'Default guidance for anything else.',
    '<!-- guidance:default-end -->',
    '',
    '## Rest of the persona body follows here, well past 5 lines',
    'line a',
    'line b',
    'line c',
  ].join('\n');

  it('picks the exact-intent slice when present (source: intent)', () => {
    const result = selectGuidanceSlice(md, 'bugfix');
    expect(result).toEqual({ slice: 'Bugfix-specific guidance.', source: 'intent' });
  });

  it('falls back to default when the intent has no section (source: default)', () => {
    const result = selectGuidanceSlice(md, 'security');
    expect(result).toEqual({ slice: 'Default guidance for anything else.', source: 'default' });
  });

  it('falls back to the full body when neither intent nor default exist (source: full-body)', () => {
    const plain = '# Agent\n\nNo guidance markers here at all.';
    const result = selectGuidanceSlice(plain, 'bugfix');
    expect(result).toEqual({ slice: plain, source: 'full-body' });
  });

  it('falls back straight to default for the unknown intent (no unknown-key section exists)', () => {
    const result = selectGuidanceSlice(md, 'unknown');
    expect(result).toEqual({ slice: 'Default guidance for anything else.', source: 'default' });
  });

  it('is deterministic across repeated calls on the same (promptMd, intent) pair', () => {
    const first = selectGuidanceSlice(md, 'bugfix');
    const second = selectGuidanceSlice(md, 'bugfix');
    expect(first).toEqual(second);
  });

  it('never mutates the input promptMd string', () => {
    const original = md;
    const snapshot = `${md}`;
    selectGuidanceSlice(original, 'bugfix');
    expect(original).toBe(snapshot);
  });
});

// ─── F1 — personaCoreBody (full-render transport hygiene, sprint-443) ────────

describe('personaCoreBody — guidance blocks never duplicate into the full render', () => {
  it('removes valid marker blocks and cuts an emptied "## Guidance Slices" heading (real content-task shape)', () => {
    const body = '# Agent X\n\nCore rule one.\n';
    const appendix = '\n## Guidance Slices\n\n<!-- guidance:default-start -->\nDistilled copy.\n<!-- guidance:default-end -->\n';
    const out = personaCoreBody(body + appendix);
    expect(out).toBe('# Agent X\n\nCore rule one.');
    expect(out).not.toContain('Guidance Slices');
    expect(out).not.toContain('Distilled copy.');
  });

  it('returns the input BYTE-IDENTICAL when there are no valid guidance blocks', () => {
    const plain = '# Agent X\nNo markers here.\n';
    expect(personaCoreBody(plain)).toBe(plain);
  });

  it('interleaved (heading-free) marker blocks are removed while body prose survives', () => {
    const md = [
      '# Agent',
      '',
      '<!-- guidance:bugfix-start -->',
      'slice text',
      '<!-- guidance:bugfix-end -->',
      '',
      '## Full body continues here',
      'deep dive',
    ].join('\n');
    const out = personaCoreBody(md);
    expect(out).toBe('# Agent\n\n## Full body continues here\ndeep dive');
  });

  it('malformed (unclosed) markers are NOT deleted — fail-soft keeps non-block text intact', () => {
    const md = '# Agent\n<!-- guidance:bugfix-start -->\ndangling text without an end marker\n';
    expect(personaCoreBody(md)).toBe(md);
  });

  it('a "## Guidance Slices" heading with REAL remaining content after block removal stays', () => {
    const md = [
      '# Agent',
      '',
      '## Guidance Slices',
      '',
      'Hand-written prose that is not inside any marker.',
      '',
      '<!-- guidance:default-start -->',
      'slice',
      '<!-- guidance:default-end -->',
    ].join('\n');
    const out = personaCoreBody(md);
    expect(out).toContain('## Guidance Slices');
    expect(out).toContain('Hand-written prose that is not inside any marker.');
    expect(out).not.toContain('slice\n');
  });
});
