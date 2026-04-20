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

  it('contains at least 21 ADRs', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    const adrMatches = content.match(/^## adr-\d+:/gm);
    expect(adrMatches).not.toBeNull();
    expect(adrMatches!.length).toBeGreaterThanOrEqual(21);
  });

  it('ADR headers include sequential numbers from 001 to 021', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    for (let i = 1; i <= 21; i++) {
      const padded = String(i).padStart(3, '0');
      expect(content).toContain(`adr-${padded}`);
    }
  });

  it('each ADR has Decision and Context fields', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    const adrBlocks = content.split(/^## adr-\d+:/m).slice(1);
    expect(adrBlocks.length).toBeGreaterThan(0);
    for (const block of adrBlocks) {
      const hasDecision = /Decision/.test(block);
      const hasContext = /Context/.test(block);
      expect(hasDecision, `Missing Decision in block: ${block.slice(0, 80)}`).toBe(true);
      expect(hasContext, `Missing Context in block: ${block.slice(0, 80)}`).toBe(true);
    }
  });

  it('ADR-014 covers .deck secret file system', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('adr-014');
  });

  it('ADR-015 covers TaskRouter', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('adr-015');
    expect(content).toContain('TaskRouter');
  });

  it('ADR-016 covers Connector module', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('adr-016');
    expect(content).toContain('Connector');
  });

  it('ADR-017 covers MCP-native provider adapters', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('adr-017');
    expect(content).toContain('MCP');
  });

  it('ADR-018 covers multi-environment config', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('adr-018');
  });

  it('ADR-019 covers language-agnostic worker verify', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('adr-019');
  });

  it('ADR-020 covers rich sprint output', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('adr-020');
  });

  it('ADR-021 covers Kraken ASCII brand identity', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('adr-021');
    expect(content).toContain('Kraken');
  });
});
