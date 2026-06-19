import { describe, it, expect } from 'vitest';
import {
  parseSections, findSectionByTitle, replaceSectionContent,
  appendSection, updateDocSections, trimToMaxLines,
} from '../../../src/orchestra/managed-docs/section-updater.js';

const SAMPLE_DOC = `# My Project

## Vision
This is my vision.
It should not change.

## Sprint Metrics
Old metrics here.

## Architecture
My architecture notes.

## Notes
Some notes.
`;

// ─── parseSections ────────────────────────────────────────────────────────

describe('parseSections', () => {
  it('parses headings correctly', () => {
    const sections = parseSections(SAMPLE_DOC);
    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(sections[0]!.heading).toBe('# My Project');
    expect(sections[0]!.level).toBe(1);
  });

  it('finds ## level headings', () => {
    const sections = parseSections(SAMPLE_DOC);
    const names = sections.map(s => s.heading);
    expect(names).toContain('## Vision');
    expect(names).toContain('## Sprint Metrics');
    expect(names).toContain('## Architecture');
    expect(names).toContain('## Notes');
  });

  it('captures section content', () => {
    const sections = parseSections(SAMPLE_DOC);
    const vision = sections.find(s => s.heading === '## Vision');
    expect(vision).toBeDefined();
    expect(vision!.content).toContain('my vision');
  });

  it('handles empty content', () => {
    const sections = parseSections('# Title\n## Empty\n## Next\nContent');
    const empty = sections.find(s => s.heading === '## Empty');
    expect(empty).toBeDefined();
    expect(empty!.content.trim()).toBe('');
  });
});

// ─── findSectionByTitle ───────────────────────────────────────────────────

describe('findSectionByTitle', () => {
  it('finds section case-insensitively', () => {
    const sections = parseSections(SAMPLE_DOC);
    expect(findSectionByTitle(sections, 'vision')).not.toBeNull();
    expect(findSectionByTitle(sections, 'VISION')).not.toBeNull();
    expect(findSectionByTitle(sections, 'Sprint Metrics')).not.toBeNull();
  });

  it('returns null for non-existent section', () => {
    const sections = parseSections(SAMPLE_DOC);
    expect(findSectionByTitle(sections, 'Nonexistent')).toBeNull();
  });
});

// ─── replaceSectionContent ────────────────────────────────────────────────

describe('replaceSectionContent', () => {
  it('replaces section content', () => {
    const result = replaceSectionContent(SAMPLE_DOC, 'Sprint Metrics', 'New metrics!');
    expect(result).toContain('## Sprint Metrics');
    expect(result).toContain('New metrics!');
    expect(result).not.toContain('Old metrics here');
  });

  it('preserves other sections', () => {
    const result = replaceSectionContent(SAMPLE_DOC, 'Sprint Metrics', 'Updated');
    expect(result).toContain('my vision');
    expect(result).toContain('My architecture notes');
    expect(result).toContain('Some notes');
  });

  it('returns unchanged when section not found', () => {
    const result = replaceSectionContent(SAMPLE_DOC, 'Nonexistent', 'Content');
    expect(result).toBe(SAMPLE_DOC);
  });

  it('preserves AUTOGEN marker blocks nested in the replaced section', () => {
    // B15: managed-docs swaps a whole section body, but AUTOGEN blocks inside
    // are owned by a separate tool (scripts/update-readme-stats.mjs).
    // Destroying the markers breaks `docs:stats:check` — it happened to
    // IDENTITY.md's identity-status block at sprint-173.
    const doc = [
      '# Doc',
      '',
      '## Project Status',
      'old table row',
      '<!-- AUTOGEN:START id="identity-status" -->',
      'stale generated stats',
      '<!-- AUTOGEN:END id="identity-status" -->',
      '',
      '## Next',
      'tail',
    ].join('\n');

    const result = replaceSectionContent(doc, 'Project Status', 'fresh generated table');

    expect(result).toContain('fresh generated table');
    expect(result).toContain('<!-- AUTOGEN:START id="identity-status" -->');
    expect(result).toContain('<!-- AUTOGEN:END id="identity-status" -->');
    expect(result).not.toContain('old table row'); // non-AUTOGEN body still swapped
    expect(result).toContain('## Next'); // section boundary intact
  });
});

// ─── appendSection ────────────────────────────────────────────────────────

describe('appendSection', () => {
  it('appends new section at end', () => {
    const result = appendSection(SAMPLE_DOC, 'New Section', 'New content');
    expect(result).toContain('## New Section');
    expect(result).toContain('New content');
  });

  it('adds ## prefix if not present', () => {
    const result = appendSection('# Doc', 'Test', 'Content');
    expect(result).toContain('## Test');
  });

  it('preserves ## if already present', () => {
    const result = appendSection('# Doc', '### Deep', 'Content');
    expect(result).toContain('### Deep');
  });
});

// ─── updateDocSections ────────────────────────────────────────────────────

describe('updateDocSections', () => {
  it('updates existing auto section', () => {
    const entry = { id: 'test', path: 'test.md', autoSections: ['Sprint Metrics'] };
    const generated = new Map([['Sprint Metrics', 'Fresh metrics']]);
    const result = updateDocSections(SAMPLE_DOC, entry, generated);
    expect(result).toContain('Fresh metrics');
    expect(result).not.toContain('Old metrics here');
  });

  it('appends missing auto section', () => {
    const entry = { id: 'test', path: 'test.md', autoSections: ['New Data'] };
    const generated = new Map([['New Data', 'Generated content']]);
    const result = updateDocSections(SAMPLE_DOC, entry, generated);
    expect(result).toContain('## New Data');
    expect(result).toContain('Generated content');
  });

  it('skips auto sections with no generated content', () => {
    const entry = { id: 'test', path: 'test.md', autoSections: ['Sprint Metrics'] };
    const generated = new Map<string, string>(); // empty
    const result = updateDocSections(SAMPLE_DOC, entry, generated);
    expect(result).toBe(SAMPLE_DOC);
  });

  it('preserves protected sections', () => {
    const entry = {
      id: 'test', path: 'test.md',
      autoSections: ['Sprint Metrics'],
      protectedSections: ['Vision', 'Architecture'],
    };
    const generated = new Map([['Sprint Metrics', 'Updated']]);
    const result = updateDocSections(SAMPLE_DOC, entry, generated);
    expect(result).toContain('my vision');
    expect(result).toContain('My architecture notes');
  });
});

// ─── trimToMaxLines ───────────────────────────────────────────────────────

describe('trimToMaxLines', () => {
  it('returns content unchanged if within limit', () => {
    expect(trimToMaxLines('line1\nline2', 10)).toBe('line1\nline2');
  });

  it('truncates content exceeding limit', () => {
    const content = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const result = trimToMaxLines(content, 5);
    const lines = result.split('\n');
    expect(lines.length).toBeLessThan(20);
    expect(result).toContain('truncated');
  });
});

describe('self-heal: unbounded-growth guard (worker-guide Anti-Patterns bug)', () => {
  it('collapses accumulated duplicate sub-sections to a single fresh copy', () => {
    const generated = '### Sub A\n\nbody a\n\n### Sub B\n\nbody b';
    const dup = '\n\n## Sub A\n\nold a\n\n## Sub B\n\nold b';
    const bloated = `# Doc\n\n## Anti-Patterns${dup}${dup}${dup}\n\n## Protected\n\nkeep me`;

    const out = replaceSectionContent(bloated, 'Anti-Patterns', generated);

    expect((out.match(/Sub A/g) || []).length).toBe(1); // one copy, not 3
    expect((out.match(/Sub B/g) || []).length).toBe(1);
    expect(out).toContain('## Protected');               // unrelated section kept
    expect(out).toContain('keep me');
    expect(out).toContain('body a');                     // fresh content in
    expect(out).not.toContain('old a');                  // stale copies out
  });

  it('is idempotent — a second pass yields identical output', () => {
    const generated = '### Sub A\n\nbody a';
    const bloated = '# Doc\n\n## Anti-Patterns\n\n## Sub A\n\nold\n\n## Sub A\n\nold2\n\n## Protected\n\nkeep';
    const once = replaceSectionContent(bloated, 'Anti-Patterns', generated);
    const twice = replaceSectionContent(once, 'Anti-Patterns', generated);
    expect(twice).toBe(once);
  });

  it('no-op when generated content has no sub-headings (never strips following sections)', () => {
    const generated = '| col |\n|-----|\n| val |';
    const doc = '# Doc\n\n## Metrics\n\nold table\n\n## Next\n\nkeep';
    const out = replaceSectionContent(doc, 'Metrics', generated);
    expect(out).toContain('## Next');
    expect(out).toContain('keep');
    expect(out).toContain('| val |');
  });
});
