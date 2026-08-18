// ─── 522-011 · Skill catalog S4 — worker-prompt byte parity ─────────────────
//
// Proof obligation for design slice S4
// (follow-up-works/skill-catalog-authority-design-2026-08-11.md §7 S4):
//
//   "an identical worker prompt is produced for an unchanged catalog
//    (byte-comparison against the current path); the `project-conventions`
//    fallback and the assigned-skill credit-removal behaviour are preserved"
//
// So this file does NOT re-implement either path. It runs BOTH — the current
// reader (`resolveSkillPrompts`, which reads `.deckent/skills/<id>/SKILL.md`
// directly) and the migrated reader (`resolveSkillPromptBodies`, a projection
// over `SkillPoolManager.resolveBody`) — over the SAME on-disk tree, and
// compares the bytes they hand to the prompt assembler, plus the bytes
// `buildSkillBlock` actually renders from them.
//
// Hermetic: a fresh `mkdtemp` project per test. `node:fs` is deliberately NOT
// mocked here — the whole point is that two real readers see one real tree — and
// nothing outside the temp root is read or written. The catalog's builtin layer
// is gated on `<root>/.deckent/config.json`, which these fixtures never create,
// so the checkout's own `src/core/builtins/skills/` never enters the catalog and
// the result cannot drift with it.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveSkillPrompts } from '../../src/orchestra/result-collector.js';
import { buildSkillBlock } from '../../src/orchestra/prompt-god-template.js';
import {
  resolveSkillPromptBodies,
  toSkillPrompts,
  heldSkillResolutions,
} from '../../src/core/skill-loading.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';

// ─── Fixture tree ───────────────────────────────────────────────────────────

const createdRoots: string[] = [];

afterEach(() => {
  while (createdRoots.length > 0) {
    const root = createdRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-skill-parity-'));
  createdRoots.push(root);
  mkdirSync(join(root, '.deckent', 'skills'), { recursive: true });
  return root;
}

/** Install a skill directory: a manifest plus zero or more body files. */
function installSkill(
  root: string,
  id: string,
  files: Record<string, string>,
  overrides: Partial<SkillDefinition> = {},
): void {
  const dir = join(root, '.deckent', 'skills', id);
  mkdirSync(dir, { recursive: true });
  const definition = createSkillDefinition({ id, name: id, ...overrides });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(definition, null, 2), 'utf-8');
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf-8');
  }
}

/**
 * A task carrying only the fields the reader touches. `resolveSkillPrompts`
 * MUTATES `assignedSkills` (that is the credit-removal behaviour under test), so
 * every call gets its own object.
 */
type ReaderTask = Parameters<typeof resolveSkillPrompts>[1];

function makeTask(assignedSkills: string[], id = 'parity-1'): ReaderTask {
  return { id, assignedSkills } as unknown as ReaderTask;
}

/** Byte-level equality — `toEqual` on strings would pass on a normalised copy. */
function expectSameBytes(actual: string, expected: string, label: string): void {
  const a = Buffer.from(actual, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  expect(a.length, `${label}: byte length`).toBe(b.length);
  expect(a.equals(b), `${label}: byte content`).toBe(true);
}

// Bodies chosen so a normalising reader cannot pass: CRLF, a body with NO
// trailing newline, leading whitespace, non-ASCII, and a `---` line that a
// front-matter-stripping reader would eat.
const ALPHA_BODY = '# Alpha\r\n\r\nCRLF içerik — ünïcode ✅\r\nson satır\n';
const BETA_BODY = '  # Beta\n\n---\ntrailing-newline yok, boşlukla başlar';
const GAMMA_BODY = '# Gamma\n\n\tTab-indented 🚀\n\n\n';

describe('522-011 S4 — worker prompt byte parity across the skill body migration', () => {
  it('produces byte-identical prompts, in request order, for an unchanged catalog', async () => {
    const root = makeProject();
    installSkill(root, 'alpha', { 'SKILL.md': ALPHA_BODY });
    installSkill(root, 'beta', { 'SKILL.md': BETA_BODY });
    installSkill(root, 'gamma', { 'SKILL.md': GAMMA_BODY });

    // Request order is NOT catalog order: the catalog sorts by id, the prompt
    // must follow the assignment. A reader that leaked catalog order would
    // reorder the skill block — drift even with identical bytes.
    const assigned = ['gamma', 'alpha', 'beta'];

    const currentPath = await resolveSkillPrompts(root, makeTask([...assigned]));
    const migrated = toSkillPrompts(resolveSkillPromptBodies(root, [...assigned]));

    expect(currentPath.map((p) => p.name)).toEqual(assigned);
    expect(migrated.map((p) => p.name)).toEqual(currentPath.map((p) => p.name));
    expect(migrated).toHaveLength(3);

    for (const [index, expected] of currentPath.entries()) {
      expectSameBytes(migrated[index]!.content, expected.content, `skill ${expected.name}`);
    }

    // The assembled worker-prompt section itself — the surface the provider bills.
    const currentNames: string[] = [];
    const migratedNames: string[] = [];
    const currentBlock = buildSkillBlock(currentPath, currentNames);
    const migratedBlock = buildSkillBlock(migrated, migratedNames);

    expect(currentBlock.length).toBeGreaterThan(0);
    expectSameBytes(migratedBlock, currentBlock, 'worker prompt skill block');
    expect(migratedNames).toEqual(currentNames);
  });

  it('carries the declared entrypoint and its digest, so the prompt is auditable', () => {
    const root = makeProject();
    installSkill(root, 'alpha', { 'SKILL.md': ALPHA_BODY });

    const [resolution] = resolveSkillPromptBodies(root, ['alpha']);
    expect(resolution?.ok).toBe(true);
    if (!resolution?.ok) return;
    expect(resolution.entrypointPath).toBe('SKILL.md');
    expect(resolution.layer).toBe('project');
    expect(resolution.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expectSameBytes(resolution.content, ALPHA_BODY, 'entrypoint bytes');
  });

  it('preserves credit-removal: a manifest whose body is missing is held, not injected', async () => {
    const root = makeProject();
    installSkill(root, 'alpha', { 'SKILL.md': ALPHA_BODY });
    installSkill(root, 'ghost', {}); // manifest present, SKILL.md never written

    const assigned = ['alpha', 'ghost'];
    const currentTask = makeTask([...assigned]);
    const currentPath = await resolveSkillPrompts(root, currentTask);
    const resolutions = resolveSkillPromptBodies(root, [...assigned]);
    const migrated = toSkillPrompts(resolutions);

    // Same prompt on both paths: the unreadable skill is absent from each.
    expect(currentPath.map((p) => p.name)).toEqual(['alpha']);
    expect(migrated.map((p) => p.name)).toEqual(['alpha']);
    expectSameBytes(buildSkillBlock(migrated, []), buildSkillBlock(currentPath, []), 'skill block');

    // The current path signals the drop by mutating the task; the migrated path
    // signals it as a typed, content-free HOLD the call site acts on. Same
    // decision, now with a reason code instead of a swallowed exception.
    expect(currentTask.assignedSkills).toEqual(['alpha']);
    const held = heldSkillResolutions(resolutions);
    expect(held.map((h) => h.skillId)).toEqual(['ghost']);
    expect(held[0]!.reasonCode).toBe('missing-file');
    expect(held[0]).not.toHaveProperty('content');
  });

  it('skips a legacy project-conventions assignment tolerantly — generation is retired', async () => {
    const root = makeProject();
    installSkill(root, 'project-conventions', {}); // body missing

    const currentPath = await resolveSkillPrompts(root, makeTask(['project-conventions']));
    const resolutions = resolveSkillPromptBodies(root, ['project-conventions']);

    // CATALOG-STATS-AUTHORITY-001 (2026-08-17): project-conventions is no
    // longer a skill — its content ships as the deterministic project-context
    // prompt segment (task-builder → prompt-god-template). The prompt route
    // now SKIPS a legacy assignment tolerantly: no regeneration, no phantom
    // stats credit, no injected prompt.
    expect(currentPath).toHaveLength(0);

    // The body reader stays a reader: it refuses with the typed reason.
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]!.ok).toBe(false);
    expect(heldSkillResolutions(resolutions)[0]!.reasonCode).toBe('missing-file');
  });

  it('resolves the DECLARED entrypoint — the S3 fix the old reader could not see', () => {
    const root = makeProject();
    // A skill whose real body is GUIDE.md, with a stale SKILL.md still on disk.
    installSkill(
      root,
      'guided',
      { 'GUIDE.md': '# Guided\n\nthe real body\n', 'SKILL.md': '# Guided\n\nSTALE\n' },
      { entrypoint: 'GUIDE.md' },
    );

    const [resolution] = resolveSkillPromptBodies(root, ['guided']);
    expect(resolution?.ok).toBe(true);
    if (!resolution?.ok) return;
    expect(resolution.entrypointPath).toBe('GUIDE.md');
    expect(resolution.content).toContain('the real body');
    expect(resolution.content).not.toContain('STALE');
  });

  it('refuses an id with no catalog record instead of reading a stray file', async () => {
    const root = makeProject();
    // A directory with a body but NO manifest: invisible to the catalog. The
    // pre-migration reader injected it (this test pinned that as the one
    // intended behaviour DIFFERENCE); with the 522-011 switch landed, the
    // production route shares the catalog contract — a stray unregistered
    // directory can no longer inject into a worker prompt, and the assignment
    // is credit-removed exactly like any other held body.
    const strayDir = join(root, '.deckent', 'skills', 'stray');
    mkdirSync(strayDir, { recursive: true });
    writeFileSync(join(strayDir, 'SKILL.md'), '# Stray\n', 'utf-8');

    const strayTask = makeTask(['stray']);
    const currentPath = await resolveSkillPrompts(root, strayTask);
    expect(currentPath).toEqual([]);
    expect(strayTask.assignedSkills).toEqual([]);

    const resolutions = resolveSkillPromptBodies(root, ['stray']);
    expect(resolutions[0]!.ok).toBe(false);
    expect(heldSkillResolutions(resolutions)[0]!.reasonCode).toBe('unknown-skill');
  });

  it('returns nothing for an empty assignment, without touching the catalog', () => {
    const root = makeProject();
    expect(resolveSkillPromptBodies(root, [])).toEqual([]);
    expect(toSkillPrompts([])).toEqual([]);
  });
});
