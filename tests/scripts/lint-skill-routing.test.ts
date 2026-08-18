// Tests for scripts/lint-skill-routing-eligibility.mjs — the D10 resolver-bypass
// gate (row 9034, sprint task 561-002).
//
// The gate's whole value is that it FAILS on a synthetic violation and PASSES on
// a clean tree, so both directions are exercised against tmpdir fixtures, and the
// real repository is asserted to exit 0 — a gate nobody can satisfy is not a gate.
//
// Hermetic: fixtures are built in `mkdtempSync` roots and removed afterwards; the
// script is driven with async `spawn` (never spawnSync).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runGate,
  scanFileForBypass,
  stripComments,
  REQUIRED_REJECTION_REASONS,
  ADAPTER_RELATIVE_PATH,
} from '../../scripts/lint-skill-routing-eligibility.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'lint-skill-routing-eligibility.mjs');

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** An adapter stub that declares the full typed rejection vocabulary. */
function adapterStub(reasons: readonly string[] = REQUIRED_REJECTION_REASONS): string {
  return [
    "import { snapshotSkillCatalog } from '../core/skill-pool.js';",
    'export type SkillRoutingRejectionReason =',
    ...reasons.map((reason) => `  | '${reason}'`),
    ';',
    'export function selectRoutableSkills(root: string) {',
    '  return snapshotSkillCatalog(root).entries;',
    '}',
    '',
  ].join('\n');
}

function makeFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-routing-gate-'));
  created.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(root, ...relativePath.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }
  return root;
}

function runScript(args: readonly string[]): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('error', rejectPromise);
    child.on('close', (code) => { resolvePromise({ code: code ?? -1, out, err }); });
  });
}

describe('lint-skill-routing-eligibility gate', () => {
  it('passes a clean routing surface', async () => {
    const root = makeFixture({
      [ADAPTER_RELATIVE_PATH]: adapterStub(),
      'src/orchestra/sprint-planner.ts':
        "const pool = new SkillPoolManager(root).loadSkills();\nawait routeTasksV3ForPlan(tasks, root, cfg, { pools: { skills: pool } });\n",
    });

    expect(runGate(root)).toMatchObject({ ok: true, findings: [] });

    const run = await runScript(['--root', root]);
    expect(run.code).toBe(0);
    expect(run.out).toContain('CLEAN');
  });

  it('fails a synthetic resolver bypass outside the adapter', async () => {
    const root = makeFixture({
      [ADAPTER_RELATIVE_PATH]: adapterStub(),
      'src/orchestra/rogue-selector.ts':
        "import { validateSkillProfile } from '../core/routing/capability-vector.js';\n" +
        'export function pick(skill: { profile?: unknown }) {\n' +
        '  const validation = validateSkillProfile(skill.profile);\n' +
        '  if (!validation.ok) return null;\n' +
        '  return validation.value;\n' +
        '}\n',
    });

    const gate = runGate(root);
    expect(gate.ok).toBe(false);
    expect(gate.findings.every((f) => f.type === 'resolver-bypass')).toBe(true);
    expect(gate.findings.map((f) => f.file)).toContain('src/orchestra/rogue-selector.ts');
    expect(gate.findings.map((f) => f.symbol)).toContain('validateSkillProfile');

    const run = await runScript(['--root', root]);
    expect(run.code).toBe(1);
    expect(run.err).toContain('resolver-bypass');
    expect(run.err).toContain('rogue-selector.ts');
  });

  it('fails a nested routing-surface module that resolves the catalog itself', async () => {
    const root = makeFixture({
      [ADAPTER_RELATIVE_PATH]: adapterStub(),
      'src/orchestra/managed-docs/skill-picker.ts':
        'export function pick(root: string) {\n  return resolveSkillCatalog(root).entries;\n}\n',
    });

    const gate = runGate(root);
    expect(gate.ok).toBe(false);
    expect(gate.findings.map((f) => f.file)).toContain('src/orchestra/managed-docs/skill-picker.ts');
    expect(gate.findings.map((f) => f.symbol)).toContain('resolveSkillCatalog');
  });

  it('fails when the adapter narrows the typed rejection vocabulary', async () => {
    const root = makeFixture({
      [ADAPTER_RELATIVE_PATH]: adapterStub(['profile-missing', 'disabled']),
      'src/orchestra/other.ts': 'export const noop = 0;\n',
    });

    const gate = runGate(root);
    expect(gate.ok).toBe(false);
    expect(gate.findings.map((f) => f.type)).toEqual([
      'missing-typed-rejection',
      'missing-typed-rejection',
      'missing-typed-rejection',
    ]);
    expect(gate.findings.map((f) => f.symbol).sort()).toEqual([
      'invalid-profile',
      'quarantined',
      'retired',
    ]);

    const run = await runScript(['--root', root]);
    expect(run.code).toBe(1);
    expect(run.err).toContain('missing-typed-rejection');
  });

  it('never fails on a prose mention inside a comment', () => {
    const source = [
      '// historical note: validateSkillProfile(profile) used to live here',
      '/* snapshotSkillCatalog(root) was the old call site',
      '   spanning two lines */',
      'export const noop = 0;',
    ].join('\n');

    expect(scanFileForBypass('src/orchestra/notes.ts', source)).toEqual([]);
    // Line positions survive comment stripping, so reported lines stay truthful.
    expect(stripComments(source).split('\n')).toHaveLength(4);
  });

  it('reports an infrastructure error (exit 2) when the routing surface is absent', async () => {
    const root = makeFixture({ 'README.md': '# empty tree\n' });
    const run = await runScript(['--root', root]);
    expect(run.code).toBe(2);
    expect(run.err).toContain('infrastructure error');
  });

  it('exits 0 on the real repository', async () => {
    expect(runGate(REPO_ROOT).ok).toBe(true);
    const run = await runScript(['--root', REPO_ROOT]);
    expect(run.code).toBe(0);
    expect(run.out).toContain('CLEAN');
  });
});
