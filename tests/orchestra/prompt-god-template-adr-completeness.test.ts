import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '182-008',
    title: 'ADR completeness test',
    description: 'Verify that selected ADR content is rendered in full with no truncation cap',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: ['src/core/config.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-182',
    assignedAgent: 'architect',
    assignedSkills: [],
    ...overrides,
  };
}

/**
 * Build a deterministic ADR body of at least `minChars` characters with
 * core-relevant keywords so the relevance scorer keeps it in the top-N.
 */
function makeAdrContent(seed: string, minChars: number): string {
  const preamble = `**Context:** core config and types in src/core/ for ${seed}.\n\n**Decision:** apply ${seed} pattern.\n\n`;
  const body: string[] = [];
  let i = 1;
  while ((preamble + body.join('\n')).length < minChars) {
    body.push(`Line ${i}: core config types memory provider model ${seed} discussion paragraph.`);
    i++;
  }
  return preamble + body.join('\n');
}

function makeAdr(id: string, title: string, content: string, sprintNum = 50): MemoryEntryV2 {
  return {
    id,
    title,
    content,
    type: 'adr',
    status: 'accepted',
    sprint_id: `sprint-${sprintNum}`,
    sprint_num: sprintNum,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    decay_exempt: false,
  } as MemoryEntryV2;
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect Agent\nYou design systems.',
    skillPrompts: [],
    allAdrs: [],
    effort: 'normal',
    ...overrides,
  };
}

// ─── Tests (Sprint 182 PQ-2 — F3) ──────────────────────────────────────

describe('buildTaskPrompt — ADR completeness (F3, Sprint 182 PQ-2)', () => {
  // T1: 12K-char ADR → output contains the full content (length ≥ 12K)
  it('renders a 12K-char ADR in full (no length-based summary fallback)', () => {
    const longContent = makeAdrContent('adr-001', 12000);
    expect(longContent.length).toBeGreaterThanOrEqual(12000);

    // Capture a deterministic last-line marker so we know the tail survived.
    const lines = longContent.trim().split('\n');
    const lastLine = lines[lines.length - 1]!;

    const ctx = makeCtx({
      allAdrs: [
        makeAdr('adr-001', 'TypeScript + ESM core configuration', longContent, 1),
      ],
    });
    // PCOMP-W4: full-body completeness is the GOVERNING-tier guarantee — pin the
    // ADR via an explicit ref in the task text (scoring-only ADRs render condensed).
    const result = buildTaskPrompt(makeTask({ description: 'Verify per ADR-001 that the governing ADR content is rendered in full with no truncation cap' }), ctx);

    expect(result.metadata.adrIds).toContain('adr-001');
    expect(result.prompt).toContain(longContent);
    expect(result.prompt).toContain(lastLine);
    // The ADR section must have actually swallowed the full ADR body, not a
    // condensed summary. Use a generous floor that exceeds any reasonable
    // summary length but stays below the full content for safety.
    expect(result.prompt.length).toBeGreaterThanOrEqual(12000);
  });

  // T2: Output must NOT contain the old truncation marker
  it('does not emit the "(ADR content truncated for prompt size)" marker', () => {
    const longContent = makeAdrContent('adr-002', 15000);

    const ctx = makeCtx({
      allAdrs: [
        makeAdr('adr-001', 'TypeScript + ESM', makeAdrContent('adr-001', 8000), 1),
        makeAdr('adr-002', 'Node16 Resolution', longContent, 1),
      ],
    });
    const result = buildTaskPrompt(makeTask(), ctx);

    expect(result.prompt).not.toContain('(ADR content truncated for prompt size)');
    expect(result.prompt).not.toContain('(ADR content truncated');
    expect(result.prompt).not.toContain('truncated for prompt');
  });

  // T3: 3 ADRs × 8K each → full ~24K rendered, all bodies present
  it('renders all 3 selected ADRs × 8K chars in full (~24K combined)', () => {
    const adr1 = makeAdrContent('adr-001', 8000);
    const adr2 = makeAdrContent('adr-002', 8000);
    const adr8 = makeAdrContent('adr-008', 8000);

    const ctx = makeCtx({
      allAdrs: [
        makeAdr('adr-001', 'TypeScript + ESM', adr1, 1),
        makeAdr('adr-002', 'Node16 Resolution', adr2, 1),
        makeAdr('adr-008', 'Brain Merkezi Import', adr8, 50),
      ],
    });
    // PCOMP-W4: all three are pinned as governing (explicit refs) — the
    // completeness guarantee under tiered injection applies to Tier-1.
    const result = buildTaskPrompt(makeTask({ description: 'Implements ADR-001 + ADR-002 + ADR-008 in full' }), ctx);

    expect(result.metadata.adrIds).toHaveLength(3);
    expect(result.metadata.adrIds).toEqual(expect.arrayContaining(['adr-001', 'adr-002', 'adr-008']));
    expect(result.prompt).toContain(adr1);
    expect(result.prompt).toContain(adr2);
    expect(result.prompt).toContain(adr8);
    // Combined ADR section alone is ~24K — entire prompt must exceed that.
    expect(result.prompt.length).toBeGreaterThanOrEqual(24000);
  });
});
