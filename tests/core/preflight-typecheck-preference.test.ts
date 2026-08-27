// Regression pin — owner admission 2026-08-27.
//
// sprint-693/694 RUN_FAILED root cause: the pre-flight build gate ran the
// script-resolved `npm run build` (whose clean step mutates dist/) and
// self-deadlocked on the active-execution clean guard while the run-flow was
// starting. The fix (plugin-hooks runTscCheck) prefers the dedicated
// `typecheck` command — a no-artifact verification — over any build command.
// These tests pin that preference so a future refactor cannot silently regress
// the gate back onto a dist-mutating build.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

import { spawnSync } from 'node:child_process';
import { runTscCheck } from '../../src/core/plugin-hooks.js';

const roots: string[] = [];

function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-tsc-preference-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

function spawnedCommand(): string {
  const calls = vi.mocked(spawnSync).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const [cmd, args] = calls[calls.length - 1]! as [string, string[]];
  return [cmd, ...(args ?? [])].join(' ');
}

beforeEach(() => {
  vi.mocked(spawnSync).mockClear();
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('runTscCheck typecheck preference (sprint-693 clean-guard deadlock pin)', () => {
  it('prefers the dedicated typecheck script over a dist-mutating build script', () => {
    const root = makeProject({
      'package.json': JSON.stringify({
        name: 'fixture',
        scripts: {
          build: 'node scripts/clean.mjs && tsc',
          typecheck: 'tsc --noEmit',
        },
      }),
      'tsconfig.json': '{}',
      'src/index.ts': 'export {};\n',
    });

    const result = runTscCheck(root);

    expect(result.passed).toBe(true);
    const command = spawnedCommand();
    expect(command).toBe('npm run typecheck');
    expect(command).not.toContain('build');
  });

  it('rewrites the legacy bare `npx tsc` fallback to --noEmit when no typecheck exists', () => {
    // A TypeScript project without package scripts resolves the STACK_COMMANDS
    // fallbacks (typecheck `npx tsc --noEmit`) — never bare `npx tsc`, which
    // would emit dist artifacts from a verification gate.
    const root = makeProject({
      'package.json': JSON.stringify({ name: 'fixture' }),
      'tsconfig.json': '{}',
      'src/index.ts': 'export {};\n',
    });

    const result = runTscCheck(root);

    expect(result.passed).toBe(true);
    expect(spawnedCommand()).toContain('--noEmit');
  });

  it('falls back to the build command only when no typecheck command resolves', () => {
    const root = makeProject({
      'package.json': JSON.stringify({
        name: 'fixture',
        scripts: { build: 'esbuild src/index.js' },
      }),
      'src/index.js': 'export {};\n',
    });

    const result = runTscCheck(root);

    expect(result.passed).toBe(true);
    expect(spawnedCommand()).toBe('npm run build');
  });

  it('skips honestly when the stack has neither typecheck nor build', () => {
    const root = makeProject({ 'main.py': 'print("hi")\n' });

    const result = runTscCheck(root);

    expect(result.passed).toBe(true);
    expect(result.output).toContain('skipped');
    expect(vi.mocked(spawnSync)).not.toHaveBeenCalled();
  });
});
