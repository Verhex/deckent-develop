import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// KARIŞIK — kalan skip sınıfı REWRITE (README yayın-kalite sözleşmesi); sahip: DOCS-RELEASE-TRUTH-001 — karar kaydı docs/analysis/DOC-GAP-DISPOSITION-2026-08-03.md.
// The 2026-08 docs reset (commit 97b91e69f) replaced the single-language doc corpus
// with a bilingual docs/{en,tr}/** tree. Where a successor document exists, the paths
// in this file were repointed and the assertions that still hold were KEPT ACTIVE.
// The `it.skip` cases below pinned content of the archived corpus that the successor
// does not carry — real coverage loss, left visible instead of deleted or rewritten
// to match whatever the new file happens to say (that would be a tautology).
// Archived originals: docs/archive/docs-pre-reset-2026-08-03/.
// DOC-GAP dispozisyonu (2026-08-03, Alperen onayı): süperseded iddialar EMEKLİ edildi —
// karar kaydı docs/analysis/DOC-GAP-DISPOSITION-2026-08-03.md; arşiv içerik docs/archive/docs-pre-reset-2026-08-03/ altında durur.

const README_PATH = join(process.cwd(), 'README.md');

describe('README.md', () => {
  const content = readFileSync(README_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(100);
  });

  it.skip('contains npm badge', () => {
    expect(content).toContain('[![npm version]');
    expect(content).toContain('https://www.npmjs.com/package/deckent');
  });

  it.skip('contains tests badge', () => {
    expect(content).toContain('[![tests]');
  });

  it.skip('contains license badge', () => {
    expect(content).toContain('[![license]');
  });

  // Sprint 150 T-150-021: README overhaul removed historical quick-start block.
  // Re-asserted in Sprint 151 with new structure.
  it.skip('contains quick start section', () => {
    expect(content).toContain('## Quick Start');
    expect(content).toContain('npx deckent init');
    expect(content).toContain('npx deckent start');
  });

  it.skip('documents requirements', () => {
    // Requirements now live inline in the "## Install" section under a
    // "**Requirements:**" callout rather than a dedicated "## Requirements" heading.
    expect(content).toContain('**Requirements:**');
    expect(content).toContain('Node.js');
    expect(content).toContain('≥ 24');
    expect(content).toContain('git');
    // Provider-neutral: README no longer requires Claude specifically —
    // any provider CLI (claude/codex/gemini) or Ollama. Assert the neutral framing.
    expect(content).toContain('at least one provider');
  });

  it.skip('documents CLI usage with command examples', () => {
    // CLI commands are shown across the tour/install/sprint sections rather than
    // under a single "## CLI Usage" heading.
    expect(content).toContain('deckent init');
    expect(content).toContain('deckent start');
    expect(content).toContain('deckent status');
    expect(content).toContain('deckent doctor');
  });

  // Sprint 150 T-150-021: README MCP section reformatted. Tool count also moved
  // (22 in Sprint 150+). Rewrite in Sprint 151 with live MCP tool count binding.
  it.skip('contains MCP Integration section', () => {
    expect(content).toContain('## MCP Integration');
    expect(content).toContain('MCP Tools (21)');
    expect(content).toContain('MCP Resources (8)');
  });

  // Sprint 150 T-150-021: README Configuration section restructured — plan-tier
  // references (max_plan/pro_plan) moved to docs/reference/config.md per T-150-034.
  // Rewrite in Sprint 151.
  it.skip('contains Configuration section', () => {
    expect(content).toContain('## Configuration');
    expect(content).toContain('max_plan');
    expect(content).toContain('pro_plan');
  });

  it.skip('contains Contributing link', () => {
    expect(content).toContain('CONTRIBUTING.md');
  });

  it.skip('contains License section', () => {
    expect(content).toContain('## License');
    expect(content).toContain('MIT');
  });

  it.skip('contains links to GitHub and website', () => {
    expect(content).toContain('github.com/VerhexIO/deckent');
    // Canonical website is deckent.ai (the old deckent.agency domain is retired).
    expect(content).toContain('deckent.ai');
  });

  it('is written in English (no Turkish headings)', () => {
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Kurulum');
    expect(content).not.toContain('Komutlar');
    expect(content).not.toContain('Lisans');
  });
});
