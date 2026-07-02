/**
 * ADR-POINTER-PATH (born-469, sprint-359 task 359-004)
 *
 * born-469: the Tier-2 (constraint) footnote pointer read
 * `.brain/memory.db <id>` — a path outside worker read-scope (`.brain/` is
 * never in `scope.directories`/`scope.filesRead`), breaking the G-027
 * "one pointer away" guarantee. Fix: resolve the pointer to the real
 * `docs/adr/<file>.md` by id-prefix when an `adrDocsDir` is supplied;
 * fail-soft to the legacy `.brain/memory.db <id>` pointer when no file
 * matches (or none is supplied — the default, preserving byte-identical
 * output for every existing caller).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAdrPromptSection,
  resolveAdrDocPointer,
  type AdrRelevance,
} from '../../src/orchestra/adr-selector.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

function makeAdr(id: string, title: string, content: string): MemoryEntryV2 {
  return {
    id,
    type: 'adr',
    source: 'system',
    content,
    summary: null,
    tag_text: '',
    title_norm: '',
    content_norm: '',
    summary_norm: '',
    tag_norm: '',
    status: 'accepted',
    priority: 'normal',
    sprint_id: null,
    sprint_num: 100,
    lang: 'en',
    decay_exempt: true,
    metadata: '{}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    title,
  } as unknown as MemoryEntryV2;
}

function makeRelevance(adrId: string, title: string, matchReasons: string[]): AdrRelevance {
  return { adrId, title, score: 0.9, matchReasons };
}

const BACKGROUND_ADR_CONTENT = `# ADR-G-006: Routing & Selection

**Status:** accepted

## Context
ctx

## Contract (binding)
C1 — routing decisions are multi-signal.

## Decision (Today)
THE FULL DECISION BODY — should not leak into the condensed render.
`;

describe('resolveAdrDocPointer (born-469, id-prefix resolution)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'adr-pointer-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves an id to its real docs/adr/*.md file by id-prefix', () => {
    writeFileSync(join(root, 'adr-g-006-routing-selection.md'), BACKGROUND_ADR_CONTENT);
    writeFileSync(join(root, 'adr-d-004-brain-central-import.md'), '# ADR-D-004\n');

    expect(resolveAdrDocPointer('adr-g-006', root)).toBe('docs/adr/adr-g-006-routing-selection.md');
    expect(resolveAdrDocPointer('adr-d-004', root)).toBe('docs/adr/adr-d-004-brain-central-import.md');
  });

  it('is case-insensitive on the id-prefix match', () => {
    writeFileSync(join(root, 'adr-g-006-routing-selection.md'), BACKGROUND_ADR_CONTENT);
    expect(resolveAdrDocPointer('ADR-G-006', root)).toBe('docs/adr/adr-g-006-routing-selection.md');
  });

  it('fails soft to null when no file matches the id-prefix', () => {
    writeFileSync(join(root, 'adr-d-004-brain-central-import.md'), '# ADR-D-004\n');
    expect(resolveAdrDocPointer('adr-g-006', root)).toBeNull();
  });

  it('fails soft to null when the directory does not exist', () => {
    expect(resolveAdrDocPointer('adr-g-006', join(root, 'nope'))).toBeNull();
  });

  it('does not prefix-collide across zero-padded ids (adr-g-006 vs adr-g-0060)', () => {
    mkdirSync(join(root, 'sub'), { recursive: true });
    writeFileSync(join(root, 'adr-g-0060-unrelated.md'), '# ADR-G-0060\n');
    expect(resolveAdrDocPointer('adr-g-006', root)).toBeNull();
  });
});

describe('buildAdrPromptSection pointer resolution (born-469)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'adr-pointer-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves the constraint-tier "background constraint" pointer to the fixture docs/adr path when adrDocsDir is supplied', () => {
    writeFileSync(join(root, 'adr-g-006-routing-selection.md'), BACKGROUND_ADR_CONTENT);
    const all = [makeAdr('adr-g-006', 'Routing & Selection', BACKGROUND_ADR_CONTENT)];
    const ranked = [makeRelevance('adr-g-006', 'Routing & Selection', ['keyword-match'])];

    const out = buildAdrPromptSection(ranked, 'full', all, 'operative', true, root);

    expect(out).toContain('[background constraint — full text: docs/adr/adr-g-006-routing-selection.md]');
    expect(out).not.toContain('.brain/memory.db');
  });

  it('falls back to the legacy .brain/memory.db pointer when the fixture docs/adr tree has no matching file', () => {
    // root exists but is empty — no adr-g-006-*.md present
    const all = [makeAdr('adr-g-006', 'Routing & Selection', BACKGROUND_ADR_CONTENT)];
    const ranked = [makeRelevance('adr-g-006', 'Routing & Selection', ['keyword-match'])];

    const out = buildAdrPromptSection(ranked, 'full', all, 'operative', true, root);

    expect(out).toContain('[background constraint — full text: .brain/memory.db adr-g-006]');
  });

  it('keeps byte-identical legacy pointer text when adrDocsDir is omitted (default, zero fs access)', () => {
    writeFileSync(join(root, 'adr-g-006-routing-selection.md'), BACKGROUND_ADR_CONTENT);
    const all = [makeAdr('adr-g-006', 'Routing & Selection', BACKGROUND_ADR_CONTENT)];
    const ranked = [makeRelevance('adr-g-006', 'Routing & Selection', ['keyword-match'])];

    // Same call as above, minus the 6th arg — must be unaffected by the fixture file existing on disk.
    const out = buildAdrPromptSection(ranked, 'full', all, 'operative', true);

    expect(out).toContain('[background constraint — full text: .brain/memory.db adr-g-006]');
  });

  it('resolves the scope-gated "[full: …]" condensed pointer too', () => {
    writeFileSync(join(root, 'adr-g-006-routing-selection.md'), BACKGROUND_ADR_CONTENT);
    const all = [makeAdr('adr-g-006', 'Routing & Selection', BACKGROUND_ADR_CONTENT)];
    // No scope-path-match reason → scope-gated condensed branch (adrRender='full', scopeGated=true).
    const ranked = [makeRelevance('adr-g-006', 'Routing & Selection', ['keyword-match'])];

    const out = buildAdrPromptSection(ranked, 'full', all, 'full', true, root);

    expect(out).toContain('[full: docs/adr/adr-g-006-routing-selection.md]');
  });
});
