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
