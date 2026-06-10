/**
 * Tests for explicit ADR reference forcing in selectRelevantAdrs.
 * Sprint 273 — Task 273-011
 *
 * Regression for sprint 271-004: task description explicitly names ADR-012 but
 * selectRelevantAdrs (topN=3) was omitting it in favour of a high-score ADR-037.
 */
import { describe, it, expect } from 'vitest';
import {
  selectRelevantAdrs,
  extractExplicitAdrRefs,
} from '../../src/orchestra/adr-selector.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeAdr(id: string, title: string, content: string, sprintNum = 100): MemoryEntryV2 {
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
    sprint_num: sprintNum,
    lang: 'en',
    decay_exempt: true,
    metadata: '{}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    title,
  };
}

function makeTask(title: string, description: string, dirs: string[] = []) {
  return {
    title,
    description,
    scope: { directories: dirs, filesRead: [], filesWrite: [] },
  };
}

// Pool: adr-012 is generic (low relevance to orchestration topics),
// adr-037 has strong keyword match and preset bonus for security/orchestration.
const POOL: MemoryEntryV2[] = [
  makeAdr('adr-001', 'TypeScript + ESM', 'TypeScript ESM module system for all source files.', 1),
  makeAdr('adr-008', 'Brain Merkezi Import', 'Brain is the only importer of orchestra modules.', 8),
  makeAdr('adr-010', 'Tek Runtime Dependency', 'commander.js is the only runtime dependency.', 10),
  makeAdr('adr-012', 'register<Name>(program) Pattern', 'All CLI commands use register<Name>(program) pattern. ADR-012 defines the canonical CLI registration contract.', 12),
  makeAdr('adr-015', 'TaskRouter Module', 'TaskRouter implements 6-level routing for sprint task assignment.', 44),
  makeAdr('adr-037', 'Brain-Auditor-Worker Authority Matrix — RBAC', 'RBAC protocol. Security boundaries. Permission enforcement. Authority matrix for brain auditor worker roles. Scope enforcement sprint routing brain authority.', 139),
];

// ═══ extractExplicitAdrRefs ═══════════════════════════════════════════

describe('extractExplicitAdrRefs', () => {
  it('extracts standard ADR-NNN references', () => {
    const refs = extractExplicitAdrRefs('Uses register pattern ADR-012 for CLI registration');
    expect(refs).toContain('adr-012');
  });

  it('is case-insensitive (adr-012 and ADR-012 both match)', () => {
    const upper = extractExplicitAdrRefs('See ADR-012 and ADR-037');
    const lower = extractExplicitAdrRefs('See adr-012 and adr-037');
    expect(upper).toEqual(expect.arrayContaining(['adr-012', 'adr-037']));
    expect(lower).toEqual(expect.arrayContaining(['adr-012', 'adr-037']));
  });

  it('handles ADR without dash (ADR012)', () => {
    const refs = extractExplicitAdrRefs('register pattern ADR012 is the standard');
    expect(refs).toContain('adr-012');
  });

  it('deduplicates repeated references', () => {
    const refs = extractExplicitAdrRefs('ADR-012 should follow ADR-012 pattern');
    expect(refs.filter(r => r === 'adr-012').length).toBe(1);
  });

  it('returns empty array when no ADR refs present', () => {
    expect(extractExplicitAdrRefs('no references here at all')).toEqual([]);
    expect(extractExplicitAdrRefs('')).toEqual([]);
  });

  it('extracts multiple distinct references', () => {
    const refs = extractExplicitAdrRefs('ADR-008 and ADR-015 both apply here');
    expect(refs).toContain('adr-008');
    expect(refs).toContain('adr-015');
    expect(refs.length).toBe(2);
  });
});

// ═══ selectRelevantAdrs — explicit-ref forcing ════════════════════════

describe('selectRelevantAdrs — explicit ADR reference forcing', () => {
  // Test 1 — Regression: sprint 271-004 scenario
  // "register pattern ADR-012" in description; pool has adr-012 (low keywords) + adr-037 (high keywords).
  // With topN=3, adr-037 would normally score much higher and push adr-012 out.
  // Fix: adr-012 must appear because it is explicitly referenced.
  it('forces adr-012 into result when description explicitly mentions ADR-012 (271-004 regression)', () => {
    const task = makeTask(
      'CLI Command Registration Fix',
      'Fix the register pattern. See register pattern **ADR-012** for the canonical CLI registration contract.',
      ['src/cli/'],
    );

    const results = selectRelevantAdrs(task, POOL, 3, 146);
    const ids = results.map(r => r.adrId);

    // adr-012 MUST be present even though adr-037 has much stronger keyword/scope score
    expect(ids).toContain('adr-012');
  });

  // Test 2 — Explicit ref appears FIRST in results
  it('places explicitly referenced ADR at the front of results', () => {
    const task = makeTask(
      'CLI Registration',
      'Follows ADR-012 register pattern for CLI commands.',
      ['src/cli/'],
    );

    const results = selectRelevantAdrs(task, POOL, 3, 146);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.adrId).toBe('adr-012');
  });

  // Test 3 — Explicit ref has 'explicit-ref' in matchReasons
  it("marks forced ADR with 'explicit-ref' in matchReasons", () => {
    const task = makeTask(
      'Fix pattern',
      'Must follow ADR-008 brain import rules.',
      ['src/orchestra/'],
    );

    const results = selectRelevantAdrs(task, POOL, 3, 146);
    const adr008 = results.find(r => r.adrId === 'adr-008');

    expect(adr008).toBeDefined();
    expect(adr008!.matchReasons).toContain('explicit-ref');
  });

  // Test 4 — Non-existent ADR reference is silently ignored (no error, no phantom entry)
  it('silently ignores reference to non-existent ADR-999', () => {
    const task = makeTask(
      'Some task',
      'See ADR-999 for guidance — but this does not exist.',
      [],
    );

    // Should not throw
    const results = selectRelevantAdrs(task, POOL, 3, 146);

    // No phantom entry for adr-999
    const phantom = results.find(r => r.adrId === 'adr-999' || r.adrId.includes('999'));
    expect(phantom).toBeUndefined();
  });

  // Test 5 — Multiple explicit references are all forced in
  it('forces multiple explicitly referenced ADRs into results', () => {
    const task = makeTask(
      'Multi-ADR task',
      'This task references both ADR-001 and ADR-012 directly.',
      [],
    );

    const results = selectRelevantAdrs(task, POOL, 3, 146);
    const ids = results.map(r => r.adrId);

    expect(ids).toContain('adr-001');
    expect(ids).toContain('adr-012');
  });

  // Test 6 — When explicit refs already in scored set, no duplication
  it('deduplicates: explicit ref appears only once even if scoring would include it', () => {
    // adr-008 has strong keyword match for "orchestra brain import" so scoring would pick it too
    const task = makeTask(
      'Brain import ADR-008 fix',
      'Fix brain import rules per ADR-008 brain merkezi import pattern.',
      ['src/orchestra/'],
    );

    const results = selectRelevantAdrs(task, POOL, 5, 146);
    const ids = results.map(r => r.adrId);

    // adr-008 must appear exactly once
    expect(ids.filter(id => id === 'adr-008').length).toBe(1);
  });

  // Test 7 — Overflow: explicit refs > topN → all explicit refs returned (total may exceed topN)
  it('returns all explicit refs even when their count exceeds topN', () => {
    const task = makeTask(
      'Multi-ref task',
      'References ADR-001 and ADR-012. Both must be included.',
      [],
    );

    // topN=1, but 2 explicit refs
    const results = selectRelevantAdrs(task, POOL, 1, 146);
    const ids = results.map(r => r.adrId);

    expect(ids).toContain('adr-001');
    expect(ids).toContain('adr-012');
    // Total is at least 2 (the 2 forced), even though topN=1
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  // Test 8 — No explicit refs → backward-compatible scoring behavior unchanged
  it('behaves identically to original scoring when no explicit refs present', () => {
    const task = makeTask(
      'Sprint planner routing refactor',
      'Refactor sprint planner task-router logic in orchestra.',
      ['src/orchestra/'],
    );

    const results = selectRelevantAdrs(task, POOL, 3, 146);

    // Results should still be scored correctly without any forced entries
    const ids = results.map(r => r.adrId);
    expect(results.length).toBeLessThanOrEqual(3);
    // ADR-008 and ADR-015 are strong matches for orchestration work
    expect(ids).toContain('adr-008');
    expect(ids).toContain('adr-015');
    // No 'explicit-ref' reasons — none were explicitly referenced
    for (const r of results) {
      expect(r.matchReasons).not.toContain('explicit-ref');
    }
  });

  // Test 9 — Case-insensitive: lowercase "adr-012" in description forces inclusion
  it('forces ADR when referenced in lowercase (adr-012)', () => {
    const task = makeTask(
      'CLI fix',
      'Uses the adr-012 register pattern for all new commands.',
      [],
    );

    const results = selectRelevantAdrs(task, POOL, 3, 146);
    const ids = results.map(r => r.adrId);

    expect(ids).toContain('adr-012');
    const forced = results.find(r => r.adrId === 'adr-012');
    expect(forced!.matchReasons).toContain('explicit-ref');
  });
});
