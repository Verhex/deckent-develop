/**
 * born-674 (task 428-002, W674B) — `buildWorkerPrompt` (task-builder.ts)
 * populates `SprintContext.toolAllowlist` via `computeToolAllowlist` (427-013's
 * pure core, core/tool-allowlist.ts) ONLY when the project-level
 * `tools.allowlist_enabled` config flag is true.
 *
 * Flag-off (default, absent block, or explicit false) must render
 * byte-identical-pinned legacy output — no `## Tool Surface` block, exactly
 * like the pre-674 prompt. Flag-on renders the narrowed-surface block built by
 * `buildToolAllowlistBlock` (427-014, prompt-god-template.ts).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, ModelType } from '../../src/core/types.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { buildTaskPrompt, buildTaskPromptSegmented, buildToolAllowlistBlock } from "../../src/orchestra/prompt-god-template.js";
import type { SprintContext } from "../../src/orchestra/prompt-god-template.js";
import { classifyTier, SEGMENT_SEPARATOR } from "../../src/orchestra/prompt-segmentation.js";
import { computeToolAllowlist } from "../../src/core/tool-allowlist.js";
import type { ToolAllowlistResult } from "../../src/core/tool-allowlist.js";
import type { Task as Task__wire_030 } from "../../src/core/task-types.js";
import { TaskStatus as TaskStatus__wire_030 } from "../../src/core/task-types.js";

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'sonnet' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    type: 'code-development',
    sprintId: 'sprint-428',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    ...overrides,
  } as Task;
}

const TOOL_SURFACE_HEADER = '## Tool Surface (narrowed for this task)';

function writeProjectConfig(root: string, config: unknown): void {
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify(config), 'utf-8');
}

describe('allowlist-flag-wire (born-674 / 428-002)', () => {
  let root = '';

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = '';
  });

  it('renders byte-identical legacy output (no Tool Surface block) when no config file exists', () => {
    root = mkdtempSync(join(tmpdir(), 'allowlist-noconfig-'));
    const task = makeTask('428-201');

    const prompt = buildWorkerPrompt(task, undefined, undefined, root);

    expect(prompt).not.toContain(TOOL_SURFACE_HEADER);
  });

  it('fails soft without tier guidance when the task model is absent from the registry', () => {
    root = mkdtempSync(join(tmpdir(), 'allowlist-unknown-model-'));
    const task = makeTask('428-208', { model: 'fixture-only-model' as ModelType });

    expect(() => buildWorkerPrompt(task, undefined, undefined, root)).not.toThrow();
    const prompt = buildWorkerPrompt(task, undefined, undefined, root);
    expect(prompt).not.toContain('Economy-tier discipline:');
  });

  it('keeps tier guidance enabled for a canonical economy model', () => {
    root = mkdtempSync(join(tmpdir(), 'allowlist-canonical-model-'));
    const task = makeTask('428-209', { model: 'gpt-5.6-luna' });

    const prompt = buildWorkerPrompt(task, undefined, undefined, root);

    expect(prompt).toContain('Economy-tier discipline:');
  });

  it('stays off (no Tool Surface block) when the config file has no tools block', () => {
    root = mkdtempSync(join(tmpdir(), 'allowlist-noblock-'));
    writeProjectConfig(root, { mode: 'default' });
    const task = makeTask('428-202');

    const prompt = buildWorkerPrompt(task, undefined, undefined, root);

    expect(prompt).not.toContain(TOOL_SURFACE_HEADER);
  });

  it('stays off (no Tool Surface block) when allowlist_enabled is explicitly false', () => {
    root = mkdtempSync(join(tmpdir(), 'allowlist-off-'));
    writeProjectConfig(root, { tools: { allowlist_enabled: false } });
    const task = makeTask('428-203');

    const prompt = buildWorkerPrompt(task, undefined, undefined, root);

    expect(prompt).not.toContain(TOOL_SURFACE_HEADER);
  });

  it('fails soft to off (no throw, no block) when the config file is malformed JSON', () => {
    root = mkdtempSync(join(tmpdir(), 'allowlist-malformed-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'config.json'), '{ not valid json', 'utf-8');
    const task = makeTask('428-204');

    expect(() => buildWorkerPrompt(task, undefined, undefined, root)).not.toThrow();
    const prompt = buildWorkerPrompt(task, undefined, undefined, root);
    expect(prompt).not.toContain(TOOL_SURFACE_HEADER);
  });

  it('renders a narrowed Tool Surface block when allowlist_enabled is true', () => {
    root = mkdtempSync(join(tmpdir(), 'allowlist-on-'));
    writeProjectConfig(root, { tools: { allowlist_enabled: true } });
    const task = makeTask('428-205', {
      type: 'code-development',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
    });

    const prompt = buildWorkerPrompt(task, undefined, undefined, root);

    expect(prompt).toContain(TOOL_SURFACE_HEADER);
    // code-development + a writable path grants the `edit` group — Write is in it.
    expect(prompt).toContain('`Write`');
    expect(prompt).toContain('toolEscalation:');
  });

  it('omits the edit group (no Write) when the task declares no writable paths, even flag-on', () => {
    root = mkdtempSync(join(tmpdir(), 'allowlist-noedit-'));
    writeProjectConfig(root, { tools: { allowlist_enabled: true } });
    const task = makeTask('428-206', {
      type: 'audit',
      scope: { directories: ['src/'], filesRead: ['src/'], filesWrite: [] },
    });

    const prompt = buildWorkerPrompt(task, undefined, undefined, root);

    expect(prompt).toContain(TOOL_SURFACE_HEADER);
    expect(prompt).not.toContain('`Write`');
  });

  it('defaults taskType to generic (never throws) when task.type is undefined, flag-on', () => {
    root = mkdtempSync(join(tmpdir(), 'allowlist-notype-'));
    writeProjectConfig(root, { tools: { allowlist_enabled: true } });
    const task = makeTask('428-207', { type: undefined });

    expect(() => buildWorkerPrompt(task, undefined, undefined, root)).not.toThrow();
    const prompt = buildWorkerPrompt(task, undefined, undefined, root);
    expect(prompt).toContain(TOOL_SURFACE_HEADER);
  });
});

// WIRE-030: physically merged from tests/orchestra/tool-allowlist-wire.test.ts.
{
function makeTask(overrides: Partial<Task__wire_030> = {}): Task__wire_030 {
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
        status: TaskStatus__wire_030.PENDING,
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
        expect(allowlist.allowed.length).toBeLessThan(allowlist.allowed.length + allowlist.escalatable.length);
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
}
