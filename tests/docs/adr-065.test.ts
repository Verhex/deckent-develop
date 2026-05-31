import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/065-develop-product-repo-split.md');
const ARCH_PATH = join(process.cwd(), 'docs/architecture/architecture.md');

describe('ADR-065: develop/product repo split', () => {
  it('ADR file exists', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
  });

  it('has MADR structure (Context, Decision, Consequences sections)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
  });

  it('contains at least 3 references to the repo-split decision', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const matches = (content.match(/deckent-develop|product repo|deckent.*ürün/gi) ?? []).length;
    expect(matches).toBeGreaterThanOrEqual(3);
  });

  it('documents the audit-report immutable policy', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('docs/audits/');
    expect(content.toLowerCase()).toContain('immutable');
    expect(content).toContain('.deckent/docs.json');
  });

  it('has accepted status', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('**Status:** accepted');
  });

  it('architecture.md references ADR-065', () => {
    const content = readFileSync(ARCH_PATH, 'utf-8');
    expect(content).toContain('065-develop-product-repo-split');
  });
});
