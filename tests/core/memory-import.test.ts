import { describe, it, expect } from 'vitest';
import {
  parseDecisionsMd,
  parseMemoryMd,
  parseDebtMd,
  extractKeywords,
} from '../../src/core/memory-import.js';

// ─── Test Data ──────────────────────────────────────────────────

const decisionsContent = `# Architecture Decision Records

## ADR-001: TypeScript + ESM

**Status:** accepted

**Decision:** Use TypeScript with ESM.
**Context:** Modern standard.
**Consequence:** All imports use .js extensions.

## ADR-005: Synchronous I/O

**Status:** deprecated

> **Note:** Sprint 132 deprecated this.

**Decision:** Wave 2 modules use sync I/O.
`;

const memoryContent = `## Sprint sprint-139 Learnings
- Docker HB Core Fix: atomicWriteFileSync + SIGTERM fsync handler
- Chain Dependency: Kahn's algorithm topological

## Sprint sprint-138 Learnings
- ADR Governance: MADR v3 hibrit format
`;

const memoryContentAlt = `## Sprint 140 Learnings
- Self analysis complete

## Sprint 141 Learnings
- Cost guard implemented
`;

const debtContent = `# Technical Debt

| ID | Description | OriginTaskId | OriginSprintId | Priority | SprintsOpen | Resolved | ResolvedInSprintId | CreatedAt |
|----|-------------|------|--------|----------|------|----------|----------|---------|
| D-001 | MCP disconnect | T-140-001 | sprint-140 | CRITICAL | 1 | false | - | 2026-04-15 |
| D-002 | Old debt | T-130-005 | sprint-130 | NORMAL | 10 | true | sprint-139 | 2026-03-01 |
`;

// ─── extractKeywords ────────────────────────────────────────────

describe('extractKeywords', () => {
  // memory-import's parse path uses { maxResults: 15, minLength: 4 } — these opts
  // preserve the historical "> 3 chars + max 15" behavior on the canonical SSOT.
  const MEM_OPTS = { maxResults: 15, minLength: 4 } as const;

  it('extracts words > 3 chars (minLength: 4), lowercased, unique', () => {
    const kw = extractKeywords('Docker HB Core Fix atomicWriteFileSync', MEM_OPTS);
    expect(kw).toContain('docker');
    expect(kw).toContain('core');
    expect(kw).toContain('atomicwritefilesync');
    // "HB" is 2 chars, "Fix" is 3 chars — excluded by minLength: 4
    expect(kw).not.toContain('hb');
    expect(kw).not.toContain('fix');
  });

  it('removes common stop words', () => {
    const kw = extractKeywords('This is the best way with from that', MEM_OPTS);
    expect(kw).not.toContain('this');
    expect(kw).not.toContain('the');
    expect(kw).not.toContain('with');
    expect(kw).not.toContain('from');
    expect(kw).not.toContain('that');
    expect(kw).toContain('best');
  });

  it('removes Turkish stop words', () => {
    const kw = extractKeywords('için olan ile birlikte yapılır', MEM_OPTS);
    expect(kw).not.toContain('için');
    expect(kw).not.toContain('olan');
    expect(kw).not.toContain('ile');
    expect(kw).toContain('birlikte');
    expect(kw).toContain('yapılır');
  });

  it('limits to max 15 keywords (maxResults: 15)', () => {
    const text = Array.from({ length: 30 }, (_, i) => `keyword${i}`).join(' ');
    const kw = extractKeywords(text, MEM_OPTS);
    expect(kw.length).toBeLessThanOrEqual(15);
  });

  it('returns empty array for empty string', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('deduplicates keywords', () => {
    const kw = extractKeywords('docker Docker DOCKER docker', MEM_OPTS);
    const dockerCount = kw.filter((w) => w === 'docker').length;
    expect(dockerCount).toBe(1);
  });

  // ─── Canonical default contract (R4-KEYWORDS SSOT) ──────────────
  // Default (no opts): minLength 2, uncapped, EN+TR superset stopwords.
  // This is the surface agent-selector/task-analyzer rely on.

  it('default minLength is 2 — keeps 2/3-char tokens that minLength:4 would drop', () => {
    const kw = extractKeywords('Docker HB Core Fix atomicWriteFileSync');
    expect(kw).toContain('hb'); // 2 chars — kept by default minLength 2
    expect(kw).toContain('fix'); // 3 chars — kept (and "fix" is NOT a base stopword)
    expect(kw).toContain('docker');
  });

  it('default is uncapped — returns more than 15 keywords when present', () => {
    const text = Array.from({ length: 30 }, (_, i) => `keyword${i}`).join(' ');
    const kw = extractKeywords(text);
    expect(kw.length).toBe(30);
  });

  it('default still filters the EN+TR base stopwords', () => {
    const kw = extractKeywords('the docker için pipeline');
    expect(kw).not.toContain('the');
    expect(kw).not.toContain('için');
    expect(kw).toContain('docker');
    expect(kw).toContain('pipeline');
  });

  it('extraStopwords are unioned with the base set (consumer-specific filter)', () => {
    const base = extractKeywords('deploy the service'); // "deploy" kept by default
    expect(base).toContain('deploy');
    const withExtra = extractKeywords('deploy the service', { extraStopwords: ['deploy'] });
    expect(withExtra).not.toContain('deploy'); // now filtered via extraStopwords
    expect(withExtra).toContain('service');
  });
});

// ─── parseDecisionsMd ───────────────────────────────────────────

describe('parseDecisionsMd', () => {
  it('parses 2 ADRs with correct id, title, status, content', () => {
    const entries = parseDecisionsMd(decisionsContent);
    expect(entries).toHaveLength(2);

    const adr1 = entries[0];
    expect(adr1.id).toBe('adr-001');
    expect(adr1.title).toBe('TypeScript + ESM');
    expect(adr1.type).toBe('adr');
    expect(adr1.status).toBe('accepted');
    expect(adr1.source).toBe('import');

    const adr2 = entries[1];
    expect(adr2.id).toBe('adr-005');
    expect(adr2.title).toBe('Synchronous I/O');
    expect(adr2.status).toBe('deprecated');
  });

  it('handles accepted and deprecated statuses', () => {
    const entries = parseDecisionsMd(decisionsContent);
    expect(entries[0].status).toBe('accepted');
    expect(entries[0].decay_exempt).toBe(true);

    expect(entries[1].status).toBe('deprecated');
    expect(entries[1].decay_exempt).toBe(false);
  });

  it('content does not include the header line itself', () => {
    const entries = parseDecisionsMd(decisionsContent);
    const adr1 = entries[0];
    expect(adr1.content).not.toContain('## ADR-001');
    expect(adr1.content).toContain('**Decision:** Use TypeScript with ESM.');
    expect(adr1.content).toContain('**Status:** accepted');
  });

  it('generates tags from title + content keywords', () => {
    const entries = parseDecisionsMd(decisionsContent);
    const tags = entries[0].tags!;
    expect(tags).toBeDefined();
    expect(tags.length).toBeGreaterThan(0);
    expect(tags).toContain('typescript');
  });

  it('returns empty array for content without ADRs', () => {
    expect(parseDecisionsMd('# No ADRs here')).toEqual([]);
    expect(parseDecisionsMd('')).toEqual([]);
  });
});

// ─── parseMemoryMd ──────────────────────────────────────────────

describe('parseMemoryMd', () => {
  it('parses 2 sprint sections with correct sprint_id, sprint_num', () => {
    const entries = parseMemoryMd(memoryContent);
    expect(entries).toHaveLength(2);

    expect(entries[0].id).toBe('mem-139');
    expect(entries[0].sprint_id).toBe('sprint-139');
    expect(entries[0].sprint_num).toBe(139);
    expect(entries[0].type).toBe('memory');
    expect(entries[0].source).toBe('import');

    expect(entries[1].id).toBe('mem-138');
    expect(entries[1].sprint_id).toBe('sprint-138');
    expect(entries[1].sprint_num).toBe(138);
  });

  it('content includes bullet points', () => {
    const entries = parseMemoryMd(memoryContent);
    expect(entries[0].content).toContain('- Docker HB Core Fix');
    expect(entries[0].content).toContain('- Chain Dependency');
  });

  it('handles both "Sprint sprint-NNN" and "Sprint NNN" header formats', () => {
    const entries = parseMemoryMd(memoryContentAlt);
    expect(entries).toHaveLength(2);

    expect(entries[0].id).toBe('mem-140');
    expect(entries[0].sprint_id).toBe('sprint-140');
    expect(entries[0].sprint_num).toBe(140);

    expect(entries[1].id).toBe('mem-141');
    expect(entries[1].sprint_id).toBe('sprint-141');
    expect(entries[1].sprint_num).toBe(141);
  });

  it('returns empty array for content without sprint sections', () => {
    expect(parseMemoryMd('# No sprints here')).toEqual([]);
    expect(parseMemoryMd('')).toEqual([]);
  });

  it('generates tags from content keywords', () => {
    const entries = parseMemoryMd(memoryContent);
    const tags = entries[0].tags!;
    expect(tags).toBeDefined();
    expect(tags.length).toBeGreaterThan(0);
    expect(tags).toContain('docker');
  });
});

// ─── parseDebtMd ────────────────────────────────────────────────

describe('parseDebtMd', () => {
  it('parses 2 debt rows from pipe table', () => {
    const entries = parseDebtMd(debtContent);
    expect(entries).toHaveLength(2);

    expect(entries[0].id).toBe('debt-D-001');
    expect(entries[0].title).toBe('MCP disconnect');
    expect(entries[0].type).toBe('debt');
    expect(entries[0].source).toBe('import');

    expect(entries[1].id).toBe('debt-D-002');
    expect(entries[1].title).toBe('Old debt');
  });

  it('maps resolved vs active status correctly', () => {
    const entries = parseDebtMd(debtContent);
    expect(entries[0].status).toBe('active');
    expect(entries[1].status).toBe('resolved');
  });

  it('converts priority to lowercase', () => {
    const entries = parseDebtMd(debtContent);
    expect(entries[0].priority).toBe('critical');
    expect(entries[1].priority).toBe('normal');
  });

  it('metadata contains origin fields', () => {
    const entries = parseDebtMd(debtContent);
    const meta0 = entries[0].metadata!;
    expect(meta0.originTaskId).toBe('T-140-001');
    expect(meta0.originSprintId).toBe('sprint-140');
    expect(meta0.sprintsOpen).toBe(1);
    expect(meta0.resolved).toBe(false);
    expect(meta0.createdAt).toBe('2026-04-15');

    const meta1 = entries[1].metadata!;
    expect(meta1.originTaskId).toBe('T-130-005');
    expect(meta1.resolved).toBe(true);
    expect(meta1.resolvedInSprintId).toBe('sprint-139');
  });

  it('sets sprint_id from originSprintId column', () => {
    const entries = parseDebtMd(debtContent);
    expect(entries[0].sprint_id).toBe('sprint-140');
    expect(entries[1].sprint_id).toBe('sprint-130');
  });

  it('returns empty array for content without table', () => {
    expect(parseDebtMd('# No table')).toEqual([]);
    expect(parseDebtMd('')).toEqual([]);
  });
});
