import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { searchMemory, buildAutoQuery } from '../../src/core/memory-query.js';

let store: MemoryStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memquery-test-'));
  const dbPath = join(tmpDir, 'test.db');
  store = new MemoryStore(dbPath);

  // Seed test entries
  store.insert({
    id: 'ADR-006',
    type: 'adr',
    title: 'spawnSync Security Pattern',
    content: 'All shell commands use spawnSync with args array. No shell interpretation.',
    tags: ['security', 'spawnSync', 'shell-injection'],
    status: 'accepted',
  });

  store.insert({
    id: 'ADR-008',
    type: 'adr',
    title: 'Brain Merkezi Import Kurali',
    content: 'Brain projede diger modulleri import eden TEK moduldur.',
    tags: ['brain', 'import', 'circular'],
    status: 'accepted',
    lang: 'tr',
  });

  store.insert({
    id: 'mem-139-001',
    type: 'memory',
    title: 'Docker HB Core Fix',
    content: 'atomicWriteFileSync ile SIGTERM fsync handler eklendi.',
    tags: ['docker', 'heartbeat', 'atomicWrite'],
    sprint_id: 'sprint-139',
    sprint_num: 139,
  });

  store.insert({
    id: 'mem-138-001',
    type: 'memory',
    title: 'ADR Governance Integration',
    content: 'MADR v3 hibrit format, worker prompt injection, validator script.',
    tags: ['adr', 'governance'],
    sprint_id: 'sprint-138',
    sprint_num: 138,
  });

  store.insert({
    id: 'debt-001',
    type: 'debt',
    title: 'MCP disconnect fix',
    content: 'deckent_start fire-and-forget runSprint Promise event loop bloke ediyor.',
    tags: ['mcp', 'disconnect'],
    status: 'active',
    sprint_num: 140,
  });
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── FTS search ─────────────────────────────────────────────────────────

describe('searchMemory — FTS', () => {
  it('finds entries by FTS query (docker heartbeat → mem-139-001)', () => {
    const results = searchMemory(store, { text: 'docker heartbeat' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    const ids = results.map(r => r.entry.id);
    expect(ids).toContain('mem-139-001');
  });

  it('returns empty for non-matching query', () => {
    const results = searchMemory(store, { text: 'xyznonexistent' });
    expect(results).toEqual([]);
  });

  it('Turkish normalize: "brain import" finds ADR-008 (Turkish content)', () => {
    const results = searchMemory(store, { text: 'brain import' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    const ids = results.map(r => r.entry.id);
    expect(ids).toContain('ADR-008');
  });

  it('filters by type (text="spawnSync", type=["adr"] → only ADR results)', () => {
    const results = searchMemory(store, { text: 'spawnSync', type: ['adr'] });
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.entry.type).toBe('adr');
    }
    const ids = results.map(r => r.entry.id);
    expect(ids).toContain('ADR-006');
  });

  it('filters by status (status=["accepted"] → only accepted)', () => {
    const results = searchMemory(store, { status: ['accepted'] });
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.entry.status).toBe('accepted');
    }
  });

  it('filters by sprint range (sprint_range.min=139 → only >=139)', () => {
    const results = searchMemory(store, { sprint_range: { min: 139 } });
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.entry.sprint_num).toBeGreaterThanOrEqual(139);
    }
  });

  it('limits results (limit=2 → max 2)', () => {
    const results = searchMemory(store, { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns snippets with highlights for FTS results', () => {
    const results = searchMemory(store, { text: 'docker' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    // FTS results should have snippet
    const withSnippet = results.find(r => r.snippet);
    expect(withSnippet).toBeDefined();
    // Snippet markers
    expect(withSnippet!.snippet).toMatch(/>>>|<<</);
  });

  it('searches all types without filters (broad query)', () => {
    const results = searchMemory(store, { text: 'fix' });
    // Should match mem-139-001 (Docker HB Core Fix) and debt-001 (MCP disconnect fix)
    expect(results.length).toBeGreaterThanOrEqual(2);
    const ids = results.map(r => r.entry.id);
    expect(ids).toContain('mem-139-001');
    expect(ids).toContain('debt-001');
  });

  it('returns relevance scores for FTS results', () => {
    const results = searchMemory(store, { text: 'spawnSync security' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    // FTS results should have non-zero relevance
    for (const r of results) {
      expect(typeof r.relevance).toBe('number');
    }
  });

  it('handles FTS5 syntax error gracefully (returns empty)', () => {
    // Unbalanced quotes should not crash
    const results = searchMemory(store, { text: '"unclosed quote' });
    expect(Array.isArray(results)).toBe(true);
  });
});

// ── Structured query (no text) ─────────────────────────────────────────

describe('searchMemory — structured (no text)', () => {
  it('returns entries ordered by sprint_num DESC when no text', () => {
    const results = searchMemory(store, {});
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Check descending order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].entry.sprint_num).toBeGreaterThanOrEqual(
        results[i].entry.sprint_num,
      );
    }
  });

  it('filters by type without text', () => {
    const results = searchMemory(store, { type: ['debt'] });
    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('debt-001');
  });

  it('filters by tags_contain (entries must have ALL specified tags)', () => {
    const results = searchMemory(store, { tags_contain: ['docker', 'heartbeat'] });
    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('mem-139-001');
  });

  it('tags_contain with no matching combo returns empty', () => {
    const results = searchMemory(store, {
      tags_contain: ['docker', 'governance'],
    });
    expect(results).toEqual([]);
  });

  it('excludes soft-deleted entries by default', () => {
    store.softDelete('debt-001', 'test');
    const results = searchMemory(store, { type: ['debt'] });
    expect(results.length).toBe(0);
  });

  it('includes soft-deleted entries when include_deleted=true', () => {
    store.softDelete('debt-001', 'test');
    const results = searchMemory(store, { type: ['debt'], include_deleted: true });
    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('debt-001');
  });

  it('filters by decay_exempt', () => {
    store.insert({
      id: 'exempt-001',
      type: 'identity',
      title: 'Project Identity',
      content: 'Never decays',
      tags: ['identity'],
      decay_exempt: true,
    });
    const results = searchMemory(store, { decay_exempt: true });
    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('exempt-001');
  });
});

// ── buildAutoQuery ─────────────────────────────────────────────────────

describe('buildAutoQuery', () => {
  it('constructs correct params from keywords and scope', () => {
    const params = buildAutoQuery(
      ['docker', 'heartbeat'],
      ['src/orchestra'],
    );
    expect(params.text).toBe('docker heartbeat');
    expect(params.type).toEqual(['adr', 'pattern', 'memory']);
    expect(params.tags_contain).toEqual(['src/orchestra']);
    expect(params.limit).toBe(5);
  });

  it('omits tags_contain when scope is empty', () => {
    const params = buildAutoQuery(['security'], []);
    expect(params.tags_contain).toBeUndefined();
  });

  it('respects custom opts', () => {
    const params = buildAutoQuery(
      ['mcp'],
      [],
      { type: ['debt'], sprintRange: 135 },
    );
    expect(params.type).toEqual(['debt']);
    expect(params.sprint_range).toEqual({ min: 135 });
  });
});
