import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
// Memory V2: decisions are now in exports/decisions.md (auto-generated from SQLite DB)
const DECISIONS_PATH = join(ROOT, '.brain', 'exports', 'decisions.md');

describe('decisions.md — ADR format and content (Memory V2 export)', () => {
  it('decisions.md export exists', () => {
    expect(existsSync(DECISIONS_PATH)).toBe(true);
  });

  // New taxonomy (2026-06-30 redesign): ids are `adr-g-NNN` (Global/Constitution) or
  // `adr-d-NNN` (Dogfooding/Dev), NOT the old sequential `adr-NNN` 1..21 scheme. Crosswalk:
  // .analysis/adr-review-crosswalk.md. Header-count replaces the old fixed-21 pin so the test
  // doesn't need bumping every time an ADR is added — it still catches wholesale loss/format drift.
  const ID_HEADER_RE = /^## adr-(?:g|d)-\d{3}:/gm;
  const ANY_HEADER_RE = /^## adr-\S+:/gm;

  it('contains ADR headers in the new adr-g-NNN / adr-d-NNN taxonomy', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    const anyHeaders = content.match(ANY_HEADER_RE) ?? [];
    const idHeaders = content.match(ID_HEADER_RE) ?? [];
    expect(anyHeaders.length).toBeGreaterThan(0);
    // every header conforms to the new id pattern — no stray/old-format (`adr-NNN`) headers
    expect(idHeaders.length).toBe(anyHeaders.length);
    // sanity floor guarding against wholesale ADR loss, without pinning an exact drifting count
    expect(idHeaders.length).toBeGreaterThanOrEqual(40);
  });

  it('ADR ids are class-prefixed, zero-padded 3-digit numbers (adr-g-NNN / adr-d-NNN)', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    const ids = [...content.matchAll(/^## adr-(g|d)-(\d{3}):/gm)];
    expect(ids.length).toBeGreaterThan(0);
    for (const [, cls, num] of ids) {
      expect(['g', 'd']).toContain(cls);
      expect(num).toMatch(/^\d{3}$/);
    }
  });

  it('each ADR has Decision content and an explicit Status field', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    const adrBlocks = content.split(/^## adr-\S+:/m).slice(1);
    expect(adrBlocks.length).toBeGreaterThan(0);
    for (const block of adrBlocks) {
      const hasDecision = /Decision/.test(block);
      const hasStatus = /\*\*Status:\*\*/.test(block);
      expect(hasDecision, `Missing Decision in block: ${block.slice(0, 80)}`).toBe(true);
      expect(hasStatus, `Missing Status in block: ${block.slice(0, 80)}`).toBe(true);
    }
  });

  // Topic pins below are remapped from the old ADR-014..021 numbers to their successor id per
  // .analysis/adr-review-crosswalk.md (lines 31-38), keeping the original keyword content-grep so
  // the topic coverage itself is still verified (not just an id lookup).

  it('.deck secret file system topic (old ADR-014) covers adr-g-005', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('## adr-g-005:');
    expect(content).toContain('.deck');
  });

  it('TaskRouter topic (old ADR-015) covers adr-g-006', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('## adr-g-006:');
    expect(content).toContain('TaskRouter');
  });

  it('Connector module topic (old ADR-016) covers adr-g-007', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('## adr-g-007:');
    expect(content).toContain('Connector');
  });

  it('MCP-native provider adapters topic (old ADR-017) covers adr-g-008', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('## adr-g-008:');
    expect(content).toContain('MCP');
  });

  it('multi-environment config topic (old ADR-018) covers adr-g-004', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('## adr-g-004:');
    // ADR-018 was merged into ADR-G-004 — the absorption record is the content-grep pin.
    expect(content).toContain('ADR-018');
  });

  it('language-agnostic worker verify topic (old ADR-019) covers adr-g-009', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('## adr-g-009:');
    expect(content).toContain('ADR-019');
  });

  it('rich sprint output topic (old ADR-020) covers adr-g-010', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('## adr-g-010:');
    expect(content).toContain('ADR-020');
  });

  it('Kraken ASCII brand identity topic (old ADR-021) covers adr-g-010', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('## adr-g-010:');
    expect(content).toContain('Kraken');
  });
});
