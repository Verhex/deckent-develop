import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const DECISIONS_PATH = join(ROOT, '.brain', 'DECISIONS.md');

describe('DECISIONS.md — ADR format and content', () => {
  it('DECISIONS.md exists', () => {
    expect(existsSync(DECISIONS_PATH)).toBe(true);
  });

  it('contains at least 21 ADRs', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    const adrMatches = content.match(/^## ADR-\d+:/gm);
    expect(adrMatches).not.toBeNull();
    expect(adrMatches!.length).toBeGreaterThanOrEqual(21);
  });

  it('ADR headers are sequentially numbered from 001 to 021', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    for (let i = 1; i <= 21; i++) {
      const padded = String(i).padStart(3, '0');
      expect(content).toContain(`## ADR-${padded}:`);
    }
  });

  it('each ADR has Context, Decision and Consequence sections', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    // Split by ADR headings
    const adrBlocks = content.split(/^## ADR-\d+:/m).slice(1);
    for (const block of adrBlocks) {
      const hasContext = /\*\*Context\*\*|Context:/.test(block);
      const hasDecision = /\*\*Decision\*\*|Decision:/.test(block);
      const hasConsequence = /Consequence/.test(block);
      expect(hasContext, `Missing Context in block: ${block.slice(0, 80)}`).toBe(true);
      expect(hasDecision, `Missing Decision in block: ${block.slice(0, 80)}`).toBe(true);
      expect(hasConsequence, `Missing Consequence in block: ${block.slice(0, 80)}`).toBe(true);
    }
  });

  it('ADR-014 covers .deck secret file system', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('ADR-014');
    expect(content).toContain('.deck');
    expect(content).toContain('DECKENT_');
    expect(content).toContain('.gitignore');
  });

  it('ADR-015 covers TaskRouter with 6-level routing', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('ADR-015');
    expect(content).toContain('TaskRouter');
    expect(content).toContain('fallback');
  });

  it('ADR-016 covers Connector module provider lifecycle', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('ADR-016');
    expect(content).toContain('Connector');
    expect(content).toContain('health check');
  });

  it('ADR-017 covers MCP-native provider adapters', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('ADR-017');
    expect(content).toContain('codex exec');
    expect(content).toContain('gemini');
  });

  it('ADR-018 covers multi-environment config generation', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('ADR-018');
    expect(content).toContain('--all-envs');
    expect(content).toContain('config.toml');
  });

  it('ADR-019 covers language-agnostic worker verify', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('ADR-019');
    expect(content).toContain('STACK_COMMANDS');
    expect(content).toContain('pytest');
  });

  it('ADR-020 covers rich sprint output with 7 sections', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('ADR-020');
    expect(content).toContain('NO_COLOR');
    expect(content).toContain('7');
  });

  it('ADR-021 covers Kraken ASCII brand identity', () => {
    const content = readFileSync(DECISIONS_PATH, 'utf-8');
    expect(content).toContain('ADR-021');
    expect(content).toContain('Kraken');
    expect(content).toContain('splash');
  });
});
