/**
 * Tests for Bug X fix: exportSummaryMd Active Technical Debt filter
 * ensures resolved debts are excluded from summary export.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { exportSummaryMd } from '../../src/core/memory-export.js';

let store: MemoryStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'debt-filter-test-'));
  store = new MemoryStore(join(tmpDir, 'test.db'));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// Test 1: Resolved debt must NOT appear in summary Active Technical Debt section
describe('exportSummaryMd debt filter', () => {
  it('excludes resolved debts from Active Technical Debt section', () => {
    store.insert({
      id: 'debt-156-011',
      type: 'debt',
      title: 'MCP Disconnect Regression',
      content: 'MCP server disconnects after long-running sprint.',
      source: 'brain',
      status: 'resolved',
      priority: 'critical',
      sprint_id: 'sprint-156',
      sprint_num: 156,
      tags: ['mcp'],
    });

    const md = exportSummaryMd(store);
    // The resolved debt must NOT appear in the active section
    expect(md).not.toContain('MCP Disconnect Regression');
    // The section header must still be present
    expect(md).toContain('## Active Technical Debt');
    // No active debts → placeholder text
    expect(md).toContain('_No active technical debt._');
  });

  // Test 2: Non-resolved debt with status other than 'active' still appears
  it('includes non-resolved debts regardless of exact status value', () => {
    store.insert({
      id: 'debt-open-001',
      type: 'debt',
      title: 'Open Cache Issue',
      content: 'Cache invalidation does not fire on sprint transition.',
      source: 'brain',
      status: 'open',
      priority: 'high',
      sprint_id: 'sprint-160',
      sprint_num: 160,
      tags: ['cache'],
    });
    store.insert({
      id: 'debt-resolved-002',
      type: 'debt',
      title: 'Old Sync IO',
      content: 'Migrated hot paths to async.',
      source: 'brain',
      status: 'resolved',
      priority: 'normal',
      sprint_id: 'sprint-155',
      sprint_num: 155,
      tags: ['io'],
    });

    const md = exportSummaryMd(store);
    // Non-resolved 'open' debt must appear
    expect(md).toContain('Open Cache Issue');
    // Resolved debt must NOT appear
    expect(md).not.toContain('Old Sync IO');
  });
});

// Test 3: DECKENT.md must not reference the legacy .brain/DECISIONS.md path
describe('DECKENT.md reference validity', () => {
  it('does not contain the broken .brain/DECISIONS.md reference', () => {
    const deckentPath = resolve(process.cwd(), 'DECKENT.md');
    const content = readFileSync(deckentPath, 'utf-8');
    // Bug C: This legacy path no longer exists after Memory V2 migration
    expect(content).not.toContain('.brain/DECISIONS.md');
    // The correct path must be present
    expect(content).toContain('.brain/exports/decisions.md');
  });
});
