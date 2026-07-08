// ─── PROMPT-W1 tests (Sprint 303 / 303-006) ────────────────────────────────
// Covers four prompt-composition fixes:
//   (a) ADR scope-gating          — adr-selector.buildAdrPromptSection(scopeGated)
//   (b) persona/task verify-precedence — prompt-god-template.buildVerifyPrecedenceNote
//   (c) paren-aware DoD checklist parser — prompt-god-template.buildDodChecklist
//   (d) conditional boilerplate (idempotency / host-config) — conditionalBoilerplate
//
// Hermetic: no filesystem, no Date.now, no spawn. All fixtures are in-memory.

import { describe, it, expect } from 'vitest';
import {
  buildAdrPromptSection,
  type AdrRelevance,
} from '../../src/orchestra/adr-selector.js';
import {
  buildTaskPrompt,
  buildDodChecklist,
  buildVerifyPrecedenceNote,
  conditionalBoilerplate,
  type SprintContext,
} from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '303-006',
    title: 'PROMPT-W1 test task',
    description: 'A task for prompt-composition verification.',
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
    sprintId: 'sprint-303',
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

function makeAdr(
  id: string,
  title: string,
  content: string,
  summary: string | null = null,
  sprintNum = 146,
): MemoryEntryV2 {
  return {
    id,
    title,
    content,
    summary,
    type: 'adr',
    status: 'accepted',
    sprint_id: `sprint-${sprintNum}`,
    sprint_num: sprintNum,
    tags: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    decay_exempt: false,
  } as unknown as MemoryEntryV2;
}

function relevance(adrId: string, title: string, matchReasons: string[]): AdrRelevance {
  return { adrId, title, score: 0.9, matchReasons };
}

// ═══ (a) ADR scope-gating ═══════════════════════════════════════════════

describe('PROMPT-W1 (a) — buildAdrPromptSection scope-gating', () => {
  const BODY_SENTINEL = 'AMENDMENT_LOG_BODY_SENTINEL';
  const ADR_CONTENT = `**Decision:** Brain is the sole importer of tmux, auditor, worker.

${BODY_SENTINEL} — long amendment history follows here with many revisions.`;
  const adrs = [makeAdr('adr-008', 'Brain Central Import', ADR_CONTENT, 'Brain one-way dependency rule.')];

  it('condenses a NON-scope-intersecting ADR to head+summary+pointer (no body) when scopeGated', () => {
    const rel = [relevance('adr-008', 'Brain Central Import', ['preset-match'])]; // no scope-path-match
    const section = buildAdrPromptSection(rel, 'full', adrs, 'full', /* scopeGated */ true);

    expect(section).toContain('## adr-008: Brain Central Import');
    expect(section).toContain('**Active constraint:**');
    expect(section).toContain('[background constraint — full: .brain/memory.db adr-008]');
    // The amendment-log body is dropped.
    expect(section).not.toContain(BODY_SENTINEL);
  });

  it('keeps the FULL body for a scope-INTERSECTING ADR even when scopeGated', () => {
    const rel = [relevance('adr-008', 'Brain Central Import', ['scope-path-match', 'preset-match'])];
    const section = buildAdrPromptSection(rel, 'full', adrs, 'full', true);

    expect(section).toContain(BODY_SENTINEL);
    expect(section).not.toContain('[full: .brain/memory.db adr-008]');
  });

  it('keeps the FULL body when scopeGated is false (default — backward-safe)', () => {
    const rel = [relevance('adr-008', 'Brain Central Import', ['preset-match'])];
    const section = buildAdrPromptSection(rel, 'full', adrs); // default scopeGated=false

    expect(section).toContain(BODY_SENTINEL);
    expect(section).not.toContain('[full: .brain/memory.db adr-008]');
  });

  it('wires via task.type: code-development condenses a non-scope ADR; no-type keeps it full', () => {
    // adr-008 is explicitly referenced (force-included) and its content avoids
    // every src/core scope keyword → no scope-path-match → eligible to condense.
    const adr = makeAdr('adr-008', 'Brain Central Import', ADR_CONTENT, 'Brain one-way dependency rule.');
    const baseTask = makeTask({
      description: 'Implement the change described by ADR-008.',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/x.ts'] },
    });
    const ctx = makeCtx({ allAdrs: [adr] });

    const codeDev = buildTaskPrompt(makeTask({ ...baseTask, type: 'code-development' }), ctx);
    expect(codeDev.metadata.adrIds).toContain('adr-008');
    expect(codeDev.prompt).toContain('[background constraint — full: .brain/memory.db adr-008]');
    expect(codeDev.prompt).not.toContain(BODY_SENTINEL);
    // G5 (enforcement-tier render): the ADR heading splits binding vs advisory-context,
    // so a marked "[background constraint — …]" ADR is no longer framed as a hard NO_GO gate.
    expect(codeDev.prompt).toContain('are BINDING for THIS task');
    expect(codeDev.prompt).toContain('ADVISORY CONTEXT');

    const noType = buildTaskPrompt(baseTask, ctx);
    expect(noType.metadata.adrIds).toContain('adr-008');
    expect(noType.prompt).toContain(BODY_SENTINEL);
    expect(noType.prompt).not.toContain('[full: .brain/memory.db adr-008]');
  });
});

// ═══ (b) persona/task verify-precedence ═════════════════════════════════

describe('PROMPT-W1 (b) — persona/task verify-precedence', () => {
  it('emits a verify-precedence note for a targeted (code) task', () => {
    expect(buildVerifyPrecedenceNote('targeted')).toContain('single authority');
    expect(buildVerifyPrecedenceNote('doc')).toBe('');
  });

  it('a bug-fixer persona + targeted task gets the precedence note in the prompt', () => {
    const task = makeTask({
      title: 'Refactor threshold logic',
      description: 'Replace threshold with ternary in src/orchestra/foo.ts.',
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/foo.ts'] },
      assignedAgent: 'bug-fixer',
    });
    const ctx = makeCtx({
      agentId: 'bug-fixer',
      agentPrompt: '# Bug Fixer\nAlways run the FULL test suite and write a regression test.',
    });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('CRITICAL VERIFY STEPS (DO NOT SKIP)');
    expect(prompt).toContain('Verify-precedence (this task overrides your persona)');
    expect(prompt).toContain('defer to the targeted-only guidance');
  });

  it('a doc-only task does NOT get the precedence note', () => {
    const task = makeTask({
      title: 'Write a doc',
      description: 'Create docs/guide.md',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
      assignedAgent: 'doc-writer',
    });
    const { prompt } = buildTaskPrompt(task, makeCtx({ agentId: 'doc-writer' }));

    expect(prompt).toContain('doc-only task — DO NOT run the test suite');
    expect(prompt).not.toContain('Verify-precedence (this task overrides your persona)');
  });
});

// ═══ (c) paren-aware DoD checklist parser ═══════════════════════════════

describe('PROMPT-W1 (c) — buildDodChecklist paren-aware parser', () => {
  function checklistItemCount(text: string): number {
    return (text.match(/^- \[ \] /gm) ?? []).length;
  }

  it('does NOT split on a `;` nested inside parentheses', () => {
    const out = buildDodChecklist('Run tests (unit; e2e); build green');
    // 2 clauses, NOT 3 (naive /[;\n]+/ split would have produced 3).
    expect(checklistItemCount(out)).toBe(2);
    expect(out).toContain('- [ ] Run tests (unit; e2e)');
    expect(out).toContain('- [ ] build green');
    expect(out).toContain('all 2/2 ticked → DONE');
  });

  it('preserves an internal newline inside parentheses (does not split it)', () => {
    const out = buildDodChecklist('Step one (line a\nline b); step two');
    expect(checklistItemCount(out)).toBe(2);
    expect(out).toContain('line a\nline b');
  });

  it('still splits on a top-level newline and top-level `;`', () => {
    expect(checklistItemCount(buildDodChecklist('a\nb'))).toBe(2);
    expect(checklistItemCount(buildDodChecklist('a; b; c'))).toBe(3);
  });

  it('falls back to the clause-free rubric when goCriteria is empty', () => {
    expect(buildDodChecklist('')).toContain('Assess yourself honestly');
    expect(buildDodChecklist(undefined)).toContain('Assess yourself honestly');
  });
});

// ═══ (d) conditional boilerplate (idempotency / host-config) ════════════

describe('PROMPT-W1 (d) — conditionalBoilerplate gating', () => {
  it('pure-refactor task drops idempotency + host-config', () => {
    const decision = conditionalBoilerplate(makeTask({ type: 'refactor' }));
    expect(decision).toEqual({ idempotency: false, hostConfig: false });
  });

  // F1.2 opt-in flip: idempotency is emitted ONLY for API-relevant work, not on by
  // default. A non-API code task (src/orchestra scope) drops both blocks.
  it('non-API code task drops idempotency + host-config (F1.2 opt-in flip)', () => {
    const decision = conditionalBoilerplate(makeTask({ type: 'code-development' }));
    expect(decision).toEqual({ idempotency: false, hostConfig: false });
  });

  // F1.2 positive case: a task touching an outbound-call layer (providers/) keeps
  // the Idempotency Key note.
  it('API-touching scope (src/providers) keeps idempotency', () => {
    const decision = conditionalBoilerplate(
      makeTask({
        type: 'code-development',
        scope: { directories: ['src/providers/'], filesRead: [], filesWrite: ['src/providers/claude.ts'] },
      }),
    );
    expect(decision.idempotency).toBe(true);
  });

  // F1.2 positive case (text signal): API-relevant scope-less task via description.
  it('API-relevant description (webhook) keeps idempotency even with generic scope', () => {
    const decision = conditionalBoilerplate(
      makeTask({ type: 'code-development', description: 'Handle the inbound Stripe webhook payload' }),
    );
    expect(decision.idempotency).toBe(true);
  });

  it('host-facing scope (CI workflow) keeps the host-config note', () => {
    const decision = conditionalBoilerplate(
      makeTask({
        type: 'code-development',
        scope: { directories: ['.github/workflows/'], filesRead: [], filesWrite: ['.github/workflows/ci.yml'] },
      }),
    );
    expect(decision.hostConfig).toBe(true);
  });

  it('no-type non-API task drops idempotency (F1.2 opt-in flip)', () => {
    const decision = conditionalBoilerplate(makeTask());
    expect(decision.idempotency).toBe(false);
  });

  it('refactor task prompt omits the Idempotency Key section AND host-config note', () => {
    const { prompt } = buildTaskPrompt(makeTask({ type: 'refactor' }), makeCtx());
    expect(prompt).not.toContain('## Idempotency Key');
    expect(prompt).not.toContain('NEVER hard-code your container working directory');
  });

  it('non-API task prompt omits the Idempotency Key section (F1.2)', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    expect(prompt).not.toContain('## Idempotency Key');
  });

  it('API-touching task prompt keeps the Idempotency Key section (F1.2)', () => {
    const { prompt } = buildTaskPrompt(
      makeTask({ scope: { directories: ['src/connectors/'], filesRead: [], filesWrite: ['src/connectors/telegram.ts'] } }),
      makeCtx(),
    );
    expect(prompt).toContain('## Idempotency Key');
  });

  it('host-facing task prompt keeps the host-config portability note', () => {
    const task = makeTask({
      scope: { directories: ['.github/workflows/'], filesRead: [], filesWrite: ['.github/workflows/ci.yml'] },
    });
    const { prompt } = buildTaskPrompt(task, makeCtx());
    expect(prompt).toContain('NEVER hard-code your container working directory');
  });
});
