import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import {
  exportSummaryMd,
  exportDecisionsMd,
  exportMemoryMd,
  exportDebtMd,
} from '../../src/core/memory-export.js';

let store: MemoryStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memexport-test-'));
  const dbPath = join(tmpDir, 'export-test.db');
  store = new MemoryStore(dbPath);

  // Seed: 2 ADRs (one accepted, one deprecated)
  store.insert({
    id: 'ADR-001',
    type: 'adr',
    title: 'TypeScript ESM',
    content:
      '**Status:** accepted\n\n**Decision:** Use TypeScript with ESM.\n**Context:** Modern standard.\n**Consequence:** All imports use .js extensions.',
    source: 'system',
    status: 'accepted',
    priority: 'normal',
    sprint_id: 'sprint-130',
    sprint_num: 130,
    decay_exempt: true,
    tags: ['typescript', 'esm'],
  });

  store.insert({
    id: 'ADR-005',
    type: 'adr',
    title: 'Synchronous I/O',
    content:
      '**Status:** deprecated\n\n**Decision:** Wave 2 modules use sync I/O.\n**Context:** tmux commands <100ms.\n**Consequence:** All functions synchronous.',
    source: 'system',
    status: 'deprecated',
    priority: 'normal',
    sprint_id: 'sprint-132',
    sprint_num: 132,
    decay_exempt: true,
    tags: ['io', 'sync'],
  });

  // Seed: 2 memory entries (sprint 138, 139)
  store.insert({
    id: 'mem-138-001',
    type: 'memory',
    title: 'ADR Governance Integration',
    content: 'MADR v3 hybrid format adopted. Worker prompt ADR injection implemented.',
    source: 'brain',
    summary: 'ADR governance user-facing feature shipped',
    status: 'active',
    priority: 'normal',
    sprint_id: 'sprint-138',
    sprint_num: 138,
    tags: ['adr', 'governance'],
  });

  store.insert({
    id: 'mem-139-001',
    type: 'memory',
    title: 'Docker HB Fix',
    content: 'atomicWriteFileSync + SIGTERM fsync handler + 15s grace period.',
    source: 'brain',
    summary: 'Docker heartbeat core fix for 5-sprint P0 bug',
    status: 'active',
    priority: 'normal',
    sprint_id: 'sprint-139',
    sprint_num: 139,
    tags: ['docker', 'heartbeat'],
  });

  // Seed: 1 debt entry (active, critical)
  store.insert({
    id: 'debt-001',
    type: 'debt',
    title: 'MCP disconnect fix',
    content: 'MCP server disconnects after ~80min due to fire-and-forget runSprint blocking event loop.',
    source: 'brain',
    status: 'active',
    priority: 'critical',
    sprint_id: 'sprint-139',
    sprint_num: 139,
    tags: ['mcp', 'disconnect'],
  });

  // Seed: 1 pattern (active)
  store.insert({
    id: 'pat-001',
    type: 'pattern',
    title: 'Docker Container Lifecycle',
    content: 'Docker containers require SIGTERM with grace period before SIGKILL.',
    source: 'brain',
    status: 'active',
    priority: 'normal',
    sprint_id: 'sprint-139',
    sprint_num: 139,
    tags: ['docker', 'lifecycle'],
  });
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── exportSummaryMd ───────────────────────────────────────────────────

describe('exportSummaryMd', () => {
  it('contains ADR IDs, titles, and status', () => {
    const md = exportSummaryMd(store);
    expect(md).toContain('ADR-001');
    expect(md).toContain('TypeScript ESM');
    expect(md).toContain('accepted');
    expect(md).toContain('ADR-005');
    expect(md).toContain('Synchronous I/O');
    expect(md).toContain('deprecated');
  });

  it('is under 5000 chars', () => {
    const md = exportSummaryMd(store);
    expect(md.length).toBeLessThan(5000);
  });

  it('contains recent learnings', () => {
    const md = exportSummaryMd(store);
    expect(md).toContain('Docker HB Fix');
    expect(md).toContain('ADR Governance Integration');
  });

  it('contains active debt', () => {
    const md = exportSummaryMd(store);
    expect(md).toContain('MCP disconnect fix');
    expect(md).toContain('CRITICAL');
  });

  it('contains active patterns', () => {
    const md = exportSummaryMd(store);
    expect(md).toContain('Docker Container Lifecycle');
  });

  it('contains total entry count and generation marker', () => {
    const md = exportSummaryMd(store);
    // 6 entries total (2 adr + 2 memory + 1 debt + 1 pattern)
    expect(md).toContain('Total entries: 6');
    expect(md).toContain('Generated:');
  });

  it('has Brain Summary header', () => {
    const md = exportSummaryMd(store);
    expect(md).toMatch(/^# Brain Summary \(auto-generated\)/);
  });

  it('handles empty store gracefully', () => {
    const emptyTmp = mkdtempSync(join(tmpdir(), 'memexport-empty-'));
    const emptyStore = new MemoryStore(join(emptyTmp, 'empty.db'));
    try {
      const md = exportSummaryMd(emptyStore);
      expect(md).toContain('# Brain Summary (auto-generated)');
      expect(md).toContain('Total entries: 0');
      expect(md.length).toBeLessThan(5000);
    } finally {
      emptyStore.close();
      rmSync(emptyTmp, { recursive: true, force: true });
    }
  });
});

// ── exportDecisionsMd ─────────────────────────────────────────────────

describe('exportDecisionsMd', () => {
  it('has proper ## ADR-NNN: Title format with **Status:**', () => {
    const md = exportDecisionsMd(store);
    expect(md).toMatch(/## ADR-001: TypeScript ESM/);
    expect(md).toMatch(/\*\*Status:\*\* accepted/);
    expect(md).toMatch(/## ADR-005: Synchronous I\/O/);
    expect(md).toMatch(/\*\*Status:\*\* deprecated/);
  });

  it('includes full content of each ADR', () => {
    const md = exportDecisionsMd(store);
    expect(md).toContain('All imports use .js extensions.');
    expect(md).toContain('tmux commands <100ms.');
  });

  it('has auto-generated header', () => {
    const md = exportDecisionsMd(store);
    expect(md).toMatch(/^# Architecture Decision Records \(auto-generated\)/);
  });

  it('separates ADRs with horizontal rule', () => {
    const md = exportDecisionsMd(store);
    expect(md).toContain('---');
  });

  it('orders ADRs by ID', () => {
    const md = exportDecisionsMd(store);
    const idx001 = md.indexOf('ADR-001');
    const idx005 = md.indexOf('ADR-005');
    expect(idx001).toBeLessThan(idx005);
  });

  it('returns header-only for empty store', () => {
    const emptyTmp = mkdtempSync(join(tmpdir(), 'memexport-empty2-'));
    const emptyStore = new MemoryStore(join(emptyTmp, 'empty.db'));
    try {
      const md = exportDecisionsMd(emptyStore);
      expect(md).toContain('# Architecture Decision Records (auto-generated)');
      expect(md).not.toContain('## ADR-');
    } finally {
      emptyStore.close();
      rmSync(emptyTmp, { recursive: true, force: true });
    }
  });
});

// ── exportMemoryMd ────────────────────────────────────────────────────

describe('exportMemoryMd', () => {
  it('groups by sprint', () => {
    const md = exportMemoryMd(store);
    expect(md).toMatch(/## Sprint sprint-139 Learnings/);
    expect(md).toMatch(/## Sprint sprint-138 Learnings/);
  });

  it('contains learning titles and content', () => {
    const md = exportMemoryMd(store);
    expect(md).toContain('Docker HB Fix');
    expect(md).toContain('atomicWriteFileSync');
    expect(md).toContain('ADR Governance Integration');
    expect(md).toContain('MADR v3');
  });

  it('does not emit trailing whitespace from stored memory content', () => {
    store.insert({
      id: 'mem-140-trailing',
      type: 'memory',
      title: 'Trailing content',
      content: 'Preserve meaning but normalize each line.   \nSecond line.   ',
      source: 'brain',
      status: 'active',
      sprint_id: 'sprint-140',
      sprint_num: 140,
    });

    const md = exportMemoryMd(store);

    expect(md).toContain('Preserve meaning but normalize each line.\nSecond line.');
    expect(md.split('\n').some(line => /[ \t]+$/u.test(line))).toBe(false);
  });

  it('orders sprints descending (newest first)', () => {
    const md = exportMemoryMd(store);
    const idx139 = md.indexOf('sprint-139');
    const idx138 = md.indexOf('sprint-138');
    expect(idx139).toBeLessThan(idx138);
  });

  it('has auto-generated header', () => {
    const md = exportMemoryMd(store);
    expect(md).toMatch(/^# Sprint Learnings \(auto-generated\)/);
  });

  it('returns header-only for empty store', () => {
    const emptyTmp = mkdtempSync(join(tmpdir(), 'memexport-empty3-'));
    const emptyStore = new MemoryStore(join(emptyTmp, 'empty.db'));
    try {
      const md = exportMemoryMd(emptyStore);
      expect(md).toContain('# Sprint Learnings (auto-generated)');
    } finally {
      emptyStore.close();
      rmSync(emptyTmp, { recursive: true, force: true });
    }
  });
});

// ── exportDebtMd ──────────────────────────────────────────────────────

describe('exportDebtMd', () => {
  it('contains active debt with priority', () => {
    const md = exportDebtMd(store);
    expect(md).toContain('MCP disconnect fix');
    expect(md).toContain('critical');
  });

  it('has Active Technical Debt section', () => {
    const md = exportDebtMd(store);
    expect(md).toContain('## Active Technical Debt');
  });

  it('has markdown table format with headers', () => {
    const md = exportDebtMd(store);
    expect(md).toContain('| ID |');
    expect(md).toContain('| Title |');
    expect(md).toContain('| Priority |');
  });

  it('has auto-generated header', () => {
    const md = exportDebtMd(store);
    expect(md).toMatch(/^# Technical Debt \(auto-generated\)/);
  });

  it('shows resolved debt section when present', () => {
    // Add a resolved debt entry
    store.insert({
      id: 'debt-resolved-001',
      type: 'debt',
      title: 'Old sync I/O issue',
      content: 'Migrated hot paths to async.',
      source: 'brain',
      status: 'resolved',
      priority: 'high',
      sprint_id: 'sprint-137',
      sprint_num: 137,
      tags: ['io'],
    });
    const md = exportDebtMd(store);
    expect(md).toContain('## Resolved Technical Debt');
    expect(md).toContain('Old sync I/O issue');
  });

  it('returns header with empty tables for empty store', () => {
    const emptyTmp = mkdtempSync(join(tmpdir(), 'memexport-empty4-'));
    const emptyStore = new MemoryStore(join(emptyTmp, 'empty.db'));
    try {
      const md = exportDebtMd(emptyStore);
      expect(md).toContain('# Technical Debt (auto-generated)');
    } finally {
      emptyStore.close();
      rmSync(emptyTmp, { recursive: true, force: true });
    }
  });
});
