import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DOC_PATH = join(process.cwd(), 'docs', 'reference', 'api.md');
const content = readFileSync(DOC_PATH, 'utf-8');

describe('docs/reference/api.md — Memory V2 stale reference check', () => {
  // (a) Stale references must be absent
  it('contains no MEMORY_FILE constant reference', () => {
    expect(content).not.toMatch(/const MEMORY_FILE\s*=/);
  });

  it('contains no DECISIONS_FILE constant reference', () => {
    expect(content).not.toMatch(/const DECISIONS_FILE\s*=/);
  });

  it('contains no DEBT_FILE constant reference', () => {
    expect(content).not.toMatch(/const DEBT_FILE\s*=/);
  });

  it('contains no .brain/MEMORY.md path reference', () => {
    expect(content).not.toContain('.brain/MEMORY.md');
  });

  it('contains no .brain/DEBT.md path reference', () => {
    expect(content).not.toContain('.brain/DEBT.md');
  });

  it('has zero stale Memory V1 references (combined regex)', () => {
    const stalePattern = /MEMORY_FILE|DECISIONS_FILE|DEBT_FILE|\.brain\/MEMORY\.md|\.brain\/DEBT\.md/g;
    const matches = content.match(stalePattern);
    expect(matches).toBeNull();
  });

  // (b) Memory V2 API examples must be present
  it('documents Memory V2 DB-first architecture', () => {
    expect(content).toContain('memory.db');
    expect(content).toContain('Memory V2');
  });

  it('documents searchMemory() FTS5 API', () => {
    expect(content).toContain('searchMemory');
    expect(content).toContain('FTS5');
  });

  it('documents MemoryStore type-specific queries', () => {
    expect(content).toContain("store.getByType('adr')");
    expect(content).toContain("type='memory'");
    expect(content).toContain("type='debt'");
    expect(content).toContain("type='adr'");
  });

  it('documents exports directory as auto-generated views', () => {
    expect(content).toContain('.brain/exports/memory.md');
    expect(content).toContain('.brain/exports/debt.md');
    expect(content).toContain('auto-generated');
  });

  it('documents deckent memory export CLI command', () => {
    expect(content).toContain('deckent memory export');
  });

  // (c) Link target validity — .brain/exports/ directory must exist
  it('.brain/exports/ directory exists on disk', () => {
    const exportsDir = join(process.cwd(), '.brain', 'exports');
    expect(existsSync(exportsDir)).toBe(true);
  });

  it('.brain/exports/memory.md export file exists', () => {
    const memoryExport = join(process.cwd(), '.brain', 'exports', 'memory.md');
    expect(existsSync(memoryExport)).toBe(true);
  });

  it('.brain/exports/debt.md export file exists', () => {
    const debtExport = join(process.cwd(), '.brain', 'exports', 'debt.md');
    expect(existsSync(debtExport)).toBe(true);
  });

  it('MCP resource deckent://memory references exports path', () => {
    expect(content).toContain('deckent://memory');
    expect(content).toContain('exports/memory.md');
  });

  it('MCP resource deckent://debt references exports path', () => {
    expect(content).toContain('deckent://debt');
    expect(content).toContain('exports/debt.md');
  });

  it('HTTP GET /api/memory description references exports path', () => {
    const apiMemorySection = content.slice(content.indexOf('#### `GET /api/memory`'));
    const nextSection = apiMemorySection.indexOf('\n---\n', 1);
    const section = apiMemorySection.slice(0, nextSection > 0 ? nextSection : 500);
    expect(section).toContain('exports/memory.md');
    expect(section).not.toContain('.brain/MEMORY.md');
  });

  it('HTTP GET /api/debt description references exports path', () => {
    const apiDebtSection = content.slice(content.indexOf('#### `GET /api/debt`'));
    const nextSection = apiDebtSection.indexOf('\n---\n', 1);
    const section = apiDebtSection.slice(0, nextSection > 0 ? nextSection : 500);
    expect(section).toContain('exports/debt.md');
    expect(section).not.toContain('.brain/DEBT.md');
  });
});
