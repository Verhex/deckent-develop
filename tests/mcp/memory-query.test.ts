import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { searchMemory } from '../../src/core/memory-query.js';

/**
 * Tests for the MCP memory_query tool logic.
 *
 * Instead of testing through the full MCP server (which requires SDK setup),
 * we test the core searchMemory function that powers the tool — the MCP handler
 * is a thin wrapper around existsSync check + searchMemory + formatting.
 */

// ── Helpers ─────────────────────────────────────────────────────

let testDir: string;
let dbPath: string;
let store: MemoryStore;

function seedEntries(entries: Array<{
  id: string; type: string; title: string; content: string;
  tags?: string[]; sprint_id?: string; sprint_num?: number;
  summary?: string; status?: string; source?: 'system' | 'brain' | 'worker' | 'user' | 'import';
}>): void {
  for (const e of entries) {
    store.insert({
      id: e.id,
      type: e.type,
      title: e.title,
      content: e.content,
      tags: e.tags,
      sprint_id: e.sprint_id,
      sprint_num: e.sprint_num,
      summary: e.summary,
      status: e.status,
      source: e.source,
    });
  }
}

// ── Tests ───────────────────────────────────────────────────────

describe('MCP memory_query — searchMemory', () => {
  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-memquery-'));
    mkdirSync(join(testDir, '.brain'), { recursive: true });
    dbPath = join(testDir, '.brain', 'memory.db');
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns empty results for query with no matches', () => {
    seedEntries([
      { id: 'adr-001', type: 'adr', title: 'TypeScript', content: 'Use TypeScript' },
    ]);

    const results = searchMemory(store, { text: 'nonexistent-xyz' });
    expect(results).toHaveLength(0);
  });

  it('finds entries by text query', () => {
    seedEntries([
      { id: 'adr-001', type: 'adr', title: 'TypeScript ESM', content: 'Use TypeScript with ESM modules' },
      { id: 'mem-001', type: 'memory', title: 'Docker Fix', content: 'Fixed docker heartbeat issue' },
    ]);

    const results = searchMemory(store, { text: 'TypeScript' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.entry.title).toContain('TypeScript');
  });

  it('filters by type array', () => {
    seedEntries([
      { id: 'adr-001', type: 'adr', title: 'ADR Entry', content: 'ADR about Docker decisions' },
      { id: 'mem-001', type: 'memory', title: 'Memory Entry', content: 'Memory about Docker learning' },
      { id: 'debt-001', type: 'debt', title: 'Debt Entry', content: 'Docker tech debt item' },
    ]);

    const results = searchMemory(store, { text: 'Docker', type: ['adr'] });
    expect(results.length).toBe(1);
    expect(results[0]!.entry.type).toBe('adr');
  });

  it('filters by status array', () => {
    seedEntries([
      { id: 'adr-001', type: 'adr', title: 'Accepted ADR', content: 'Docker backend', status: 'accepted' },
      { id: 'adr-002', type: 'adr', title: 'Deprecated ADR', content: 'Docker sync approach', status: 'deprecated' },
    ]);

    const results = searchMemory(store, { text: 'Docker', status: ['accepted'] });
    expect(results.length).toBe(1);
    expect(results[0]!.entry.status).toBe('accepted');
  });

  it('filters by sprint_range min', () => {
    seedEntries([
      { id: 'mem-001', type: 'memory', title: 'Old Learning', content: 'Docker old learning', sprint_num: 100, sprint_id: 'sprint-100' },
      { id: 'mem-002', type: 'memory', title: 'Recent Learning', content: 'Docker recent learning', sprint_num: 140, sprint_id: 'sprint-140' },
    ]);

    const results = searchMemory(store, { text: 'Docker', sprint_range: { min: 130 } });
    expect(results.length).toBe(1);
    expect(results[0]!.entry.sprint_num).toBe(140);
  });

  it('uses AND mode requiring all tokens', () => {
    seedEntries([
      { id: 'adr-001', type: 'adr', title: 'TypeScript ESM', content: 'TypeScript with ESM modules' },
      { id: 'adr-002', type: 'adr', title: 'Docker Config', content: 'Docker container configuration' },
    ]);

    const results = searchMemory(store, { text: 'TypeScript ESM', mode: 'and' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Should find TypeScript ESM entry but not Docker
    const titles = results.map(r => r.entry.title);
    expect(titles).toContain('TypeScript ESM');
    expect(titles).not.toContain('Docker Config');
  });

  it('uses OR mode (default) for broader recall', () => {
    seedEntries([
      { id: 'adr-001', type: 'adr', title: 'TypeScript Config', content: 'TypeScript configuration rules' },
      { id: 'adr-002', type: 'adr', title: 'ESM Modules', content: 'ESM module import rules' },
    ]);

    const results = searchMemory(store, { text: 'TypeScript ESM', mode: 'or' });
    // OR mode should find both entries
    expect(results.length).toBe(2);
  });

  it('respects limit parameter', () => {
    seedEntries(
      Array.from({ length: 10 }, (_, i) => ({
        id: `mem-${String(i).padStart(3, '0')}`,
        type: 'memory',
        title: `Docker Item ${i}`,
        content: `Docker learning number ${i}`,
      })),
    );

    const results = searchMemory(store, { text: 'Docker', limit: 3 });
    expect(results.length).toBe(3);
  });

  it('returns relevance score for FTS results', () => {
    seedEntries([
      { id: 'adr-001', type: 'adr', title: 'TypeScript ESM', content: 'Use TypeScript with ESM modules everywhere' },
    ]);

    const results = searchMemory(store, { text: 'TypeScript' });
    expect(results.length).toBe(1);
    expect(results[0]!.relevance).toBeGreaterThan(0);
  });

  it('returns snippet with highlight markers for FTS results', () => {
    seedEntries([
      { id: 'adr-001', type: 'adr', title: 'TypeScript ESM', content: 'Use TypeScript with ESM modules for all source files in the project' },
    ]);

    const results = searchMemory(store, { text: 'TypeScript' });
    expect(results.length).toBe(1);
    // Snippets use >>> and <<< as highlight markers
    if (results[0]!.snippet) {
      expect(results[0]!.snippet).toMatch(/>>>|<<</);
    }
  });

  it('performs structured search when no text is provided', () => {
    seedEntries([
      { id: 'adr-001', type: 'adr', title: 'ADR 1', content: 'Content 1', sprint_num: 140 },
      { id: 'mem-001', type: 'memory', title: 'Mem 1', content: 'Content 2', sprint_num: 139 },
    ]);

    // No text — structured search, filter by type
    const results = searchMemory(store, { type: ['adr'] });
    expect(results.length).toBe(1);
    expect(results[0]!.entry.type).toBe('adr');
    expect(results[0]!.relevance).toBe(0); // Structured search has 0 relevance
  });

  it('handles Turkish text through normalized columns', () => {
    seedEntries([
      { id: 'mem-001', type: 'memory', title: 'Brain İçe Aktarım Kuralı', content: 'Brain merkezi import kuralı: core dışından import yasak' },
    ]);

    // Search with ASCII-folded version should still find Turkish content
    const results = searchMemory(store, { text: 'brain import' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.entry.id).toBe('mem-001');
  });

  it('excludes soft-deleted entries by default', () => {
    seedEntries([
      { id: 'mem-001', type: 'memory', title: 'Active Entry', content: 'Docker active learning' },
      { id: 'mem-002', type: 'memory', title: 'Deleted Entry', content: 'Docker deleted learning' },
    ]);

    // Soft-delete one entry
    store.softDelete('mem-002', 'test');

    const results = searchMemory(store, { text: 'Docker' });
    expect(results.length).toBe(1);
    expect(results[0]!.entry.id).toBe('mem-001');
  });

  it('filters by tags_contain', () => {
    seedEntries([
      { id: 'mem-001', type: 'memory', title: 'Tagged Entry', content: 'Docker tagged learning', tags: ['docker', 'backend'] },
      { id: 'mem-002', type: 'memory', title: 'Untagged Entry', content: 'Docker untagged learning' },
    ]);

    // Structured search (no text) with tags filter
    const results = searchMemory(store, { type: ['memory'], tags_contain: ['docker'] });
    expect(results.length).toBe(1);
    expect(results[0]!.entry.id).toBe('mem-001');
  });
});
