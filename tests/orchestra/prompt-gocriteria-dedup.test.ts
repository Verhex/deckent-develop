// ─── goCriteria repeat-merge tests (443-004, U4) ───────────────────────────
// A5 measurement: each goCriteria theme surfaced ~4.5x across a composed prompt
// because `task.description` (unstripped by sprint-planner.ts) echoes the raw
// "### goNogo" sub-block that directives-builder.ts's writer appends, and that
// SAME text renders again via buildDodBlock (authoritative GO/NO-GO section) and
// buildDodChecklist (operational reminder). This suite pins the fix:
// `dedupeDescriptionGoNogoEcho` strips the redundant description echo whenever
// buildDodBlock is guaranteed to render the same content, so each unique
// criterion clause appears at most twice in the composed prompt — never zero.
//
// Hermetic: no filesystem, no Date.now, no spawn. All fixtures are in-memory.

import { describe, it, expect } from 'vitest';
import {
  buildTaskPrompt,
  dedupeDescriptionGoNogoEcho,
  type SprintContext,
} from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────

/** Mirrors directives-builder.ts's `buildTaskBlock` writer format exactly. */
function embedGoNogoBlock(desc: string, goCriteria: string, nogo: string): string {
  return `${desc}\n\n### goNogo\n- goCriteria: ${goCriteria}\n- nogo: ${nogo}`;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '443-004',
    title: 'goCriteria repeat-merge test task',
    description: 'A task for goCriteria dedup verification.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/foo.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-443',
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'generic',
    skillPrompts: [],
    allAdrs: [],
    effort: 'normal',
    ...overrides,
  };
}

/** Count non-overlapping occurrences of an exact substring. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  return haystack.split(needle).length - 1;
}

// ─── dedupeDescriptionGoNogoEcho (unit) ────────────────────────────────────

describe('dedupeDescriptionGoNogoEcho', () => {
  it('strips the ### goNogo sub-block when goCriteria is set', () => {
    const desc = embedGoNogoBlock('Do the thing.', 'Clause A; Clause B', 'Clause C');
    const out = dedupeDescriptionGoNogoEcho(desc, 'Clause A; Clause B (derived)');
    expect(out).toBe('Do the thing.');
    expect(out).not.toContain('### goNogo');
    expect(out).not.toContain('Clause A');
  });

  it('leaves description unchanged when goCriteria is unset (nothing else renders the block)', () => {
    const desc = embedGoNogoBlock('Do the thing.', 'Clause A', 'Clause B');
    const out = dedupeDescriptionGoNogoEcho(desc, undefined);
    expect(out).toBe(desc);
  });

  it('leaves description unchanged when no ### goNogo heading is present', () => {
    const desc = 'Plain description with no embedded block.';
    const out = dedupeDescriptionGoNogoEcho(desc, 'Some criterion');
    expect(out).toBe(desc);
  });
});

// ─── Fixture corpus: occurrence-count guardrail ────────────────────────────

describe('goCriteria occurrence count across the composed prompt (fixture corpus)', () => {
  const corpus: Array<{ name: string; goCriteria: string[]; noGoCriteria: string[] }> = [
    {
      name: 'single-clause task',
      goCriteria: ['tsc --noEmit passes cleanly'],
      noGoCriteria: ['Build fails'],
    },
    {
      name: 'multi-clause task (mirrors 443-004 itself)',
      goCriteria: [
        'repeat-site map recorded in the plan file',
        'occurrence count per unique criterion stays at most two',
        'zero unique-criterion loss across the fixture corpus',
        'vitest tests/orchestra/prompt-gocriteria-dedup.test.ts green',
      ],
      noGoCriteria: ['any unique criterion text is absent from the composed prompt'],
    },
    {
      name: 'task with no explicit noGoCriteria clause',
      goCriteria: ['targeted tests pass', 'no scope violations reported'],
      noGoCriteria: [],
    },
  ];

  for (const fixture of corpus) {
    it(`"${fixture.name}": each unique clause appears 1-2x, never 0 or 3+`, () => {
      const goCriteria = fixture.goCriteria.join('; ');
      const noGoCriteria = fixture.noGoCriteria.join('; ');
      const description = embedGoNogoBlock(
        'A/an fixture task exercising the goCriteria repeat-merge dedup path.',
        goCriteria,
        noGoCriteria,
      );
      const task = makeTask({
        description,
        goNogo: { goCriteria, noGoCriteria, techDebtAcceptable: 'None' },
      });
      const { prompt } = buildTaskPrompt(task, makeCtx());

      // Sanity: the raw description echo must be gone (dedup fired).
      expect(prompt).not.toContain('### goNogo');

      for (const clause of [...fixture.goCriteria, ...fixture.noGoCriteria]) {
        const count = countOccurrences(prompt, clause);
        expect(count, `clause "${clause}" occurrence count`).toBeGreaterThanOrEqual(1);
        expect(count, `clause "${clause}" occurrence count`).toBeLessThanOrEqual(2);
      }
    });
  }

  it('before/after: with the raw description echo left in place, a clause would occur 3x (proves the fix is load-bearing)', () => {
    const goCriteria = 'a unique unmerged clause marker';
    const description = embedGoNogoBlock('Fixture body.', goCriteria, 'no-go marker');
    const task = makeTask({
      description,
      goNogo: { goCriteria, noGoCriteria: 'no-go marker', techDebtAcceptable: 'None' },
    });

    // "Before" simulation: render with the echo NOT stripped (bypass the dedup helper
    // to reconstruct what the pre-443-004 template would have emitted).
    const undedupedDescription = description; // raw, unstripped
    const before = `${undedupedDescription}\n\n## Definition of Done (goCriteria — your work is judged against this)\n${goCriteria}\n- [ ] ${goCriteria}`;
    expect(countOccurrences(before, goCriteria)).toBe(3);

    // "After": the real compiler output.
    const { prompt: after } = buildTaskPrompt(task, makeCtx());
    expect(countOccurrences(after, goCriteria)).toBe(2);
  });
});

// ─── Regression guard: no accidental stripping for ordinary tasks ─────────

describe('regression: tasks without an embedded ### goNogo block are unaffected', () => {
  it('renders task.description byte-identical when no goNogo sub-block is present', () => {
    const task = makeTask({ description: 'A test task for prompt generation' });
    const { prompt } = buildTaskPrompt(task, makeCtx());
    expect(prompt).toContain('A test task for prompt generation');
  });
});
