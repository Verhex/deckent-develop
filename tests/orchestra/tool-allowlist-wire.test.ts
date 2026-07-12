// born-664 / 559 (task 427-014) — ALLOW-WIRE: task-scoped worker tool-surface
// reduction wired into the worker prompt, flag-gated.
//
// Task-13's PURE selector (src/core/tool-allowlist.ts computeToolAllowlist) is
// surfaced to the worker via a new prompt block. The wiring mirrors born-670a
// (toolInventory) / born-670b (verifyCommands) EXACTLY: prompt-god-template is a
// pure compiler that renders a caller-resolved SprintContext.toolAllowlist; the
// config.tools.allowlist_enabled read (default OFF), the live tool universe, and
// the per-task compute all live at the call site (task-builder, out of this task's
// scope).
//
// Pins:
//   (1) buildToolAllowlistBlock pure helper — absent/empty → '' (byte-for-byte
//       today); populated → the narrowed surface + honest `toolEscalation:` hatch.
//   (2) flag-OFF (no ctx.toolAllowlist): the compiled prompt carries NO tool
//       block and NO 'tool-allowlist' segment — every prompt pin holds.
//   (3) flag-ON (ctx.toolAllowlist = computeToolAllowlist(...)): the block is
//       present, its segment is tagged T2 === classifyTier('tool-allowlist')
//       (so it can never poison the shared cache prefix), and it lists the
//       granted tools.
//   (4) BIT-EŞ: the flag-ON prompt with ONLY the 'tool-allowlist' segment removed
//       is byte-identical to the flag-OFF prompt.

import { describe, it, expect } from 'vitest';
import {
  buildTaskPrompt,
  buildTaskPromptSegmented,
  buildToolAllowlistBlock,
} from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import { classifyTier, SEGMENT_SEPARATOR } from '../../src/orchestra/prompt-segmentation.js';
import { computeToolAllowlist } from '../../src/core/tool-allowlist.js';
import type { ToolAllowlistResult } from '../../src/core/tool-allowlist.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '427-014',
    title: 'Test task',
    description: 'A test task for prompt generation',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    type: 'code-development',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/prompt-god-template.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-427',
    assignedAgent: 'bug-fixer',
    assignedSkills: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'bug-fixer',
    agentPrompt: '# Bug Fixer Agent\nFind root causes.',
    skillPrompts: [],
    effort: 'high',
    ...overrides,
  };
}

/** A representative narrowed allowlist for a code task (edit+execute + base read/search/plan). */
function makeAllowlist(): ToolAllowlistResult {
  return computeToolAllowlist({
    taskType: 'code-development',
    scope: { filesWrite: ['src/orchestra/prompt-god-template.ts'] },
  });
}

// ─── (1) buildToolAllowlistBlock — pure helper ─────────────────────────────
describe('427-014 ALLOW-WIRE: buildToolAllowlistBlock — pure helper', () => {
  it('returns "" when the allowlist is absent (flag-off default)', () => {
    expect(buildToolAllowlistBlock(undefined)).toBe('');
  });

  it('returns "" when the allowlist grants no tools (never a stranded empty header)', () => {
    const empty: ToolAllowlistResult = {
      allowed: [],
      escalatable: ['Bash', 'Edit'],
      allowedGroups: [],
      rationale: 'none',
    };
    expect(buildToolAllowlistBlock(empty)).toBe('');
  });

  it('renders the narrowed surface: header, granted tool names, of-N count, escape hatch', () => {
    const allowlist = makeAllowlist();
    const block = buildToolAllowlistBlock(allowlist);

    expect(block).toContain('## Tool Surface (narrowed for this task)');
    // Every granted tool is named (back-ticked).
    for (const tool of allowlist.allowed) {
      expect(block).toContain(`\`${tool}\``);
    }
    // The "N of TOTAL" narrowing is stated with the real numbers.
    const total = allowlist.allowed.length + allowlist.escalatable.length;
    expect(block).toContain(`${allowlist.allowed.length} tool(s)`);
    expect(block).toContain(`of ${total} available`);
    // Honest escape hatch — a notes line, never a "call <tool>" instruction.
    expect(block).toContain('`toolEscalation:`');
    expect(block).not.toMatch(/call\s+\w+_task|invoke the .* tool/i);
  });

  it('a code task actually narrows the surface (edit+execute+base, no web/connector/mcp)', () => {
    const allowlist = makeAllowlist();
    expect(allowlist.allowed).toContain('Read');
    expect(allowlist.allowed).toContain('Edit');
    expect(allowlist.allowed).toContain('Bash');
    // default-denied surface is NOT granted
    expect(allowlist.allowed).not.toContain('WebFetch');
    expect(allowlist.allowed).not.toContain('deckent_start');
    expect(allowlist.allowed.length).toBeLessThan(
      allowlist.allowed.length + allowlist.escalatable.length,
    );
  });
});

// ─── (2) flag-OFF: byte-for-byte today ─────────────────────────────────────
describe('427-014 ALLOW-WIRE: flag-off — no block, no segment (byte-identical)', () => {
  it('the compiled prompt carries no tool-allowlist block when ctx.toolAllowlist is absent', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    expect(prompt).not.toContain('## Tool Surface (narrowed for this task)');
  });

  it('no segment is tagged with the tool-allowlist kind when the flag is off', () => {
    const { segments } = buildTaskPromptSegmented(makeTask(), makeCtx());
    expect(segments.some(s => s.kind === 'tool-allowlist')).toBe(false);
  });
});

// ─── (3) flag-ON: narrowed surface, correct tier ───────────────────────────
describe('427-014 ALLOW-WIRE: flag-on — narrowed surface injected', () => {
  it('injects the tool-allowlist block listing the granted tools', () => {
    const allowlist = makeAllowlist();
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx({ toolAllowlist: allowlist }));

    expect(prompt).toContain('## Tool Surface (narrowed for this task)');
    for (const tool of allowlist.allowed) {
      expect(prompt).toContain(`\`${tool}\``);
    }
  });

  it('emits exactly one tool-allowlist segment, tagged T2 per the classifyTier SSOT', () => {
    const { segments } = buildTaskPromptSegmented(makeTask(), makeCtx({ toolAllowlist: makeAllowlist() }));

    const toolSegs = segments.filter(s => s.kind === 'tool-allowlist');
    expect(toolSegs).toHaveLength(1);
    // The unregistered kind must classify to the volatile tier so it never lands
    // in the shared T0/T1 cache prefix — and the emitted tag must agree with it.
    expect(classifyTier('tool-allowlist')).toBe('T2');
    expect(toolSegs[0].tier).toBe('T2');
    expect(toolSegs[0].tier).toBe(classifyTier(toolSegs[0].kind));
  });
});

// ─── (4) BIT-EŞ: on minus the block === off ────────────────────────────────
describe('427-014 ALLOW-WIRE: flag-on differs from flag-off ONLY by the tool block', () => {
  it('removing the tool-allowlist segment from the flag-on prompt reproduces the flag-off prompt', () => {
    const task = makeTask();
    const off = buildTaskPromptSegmented(task, makeCtx());
    const on = buildTaskPromptSegmented(task, makeCtx({ toolAllowlist: makeAllowlist() }));

    const onWithoutToolBlock = on.segments
      .filter(s => s.kind !== 'tool-allowlist')
      .map(s => s.content)
      .join(SEGMENT_SEPARATOR);

    expect(onWithoutToolBlock).toBe(off.prompt);
  });
});
