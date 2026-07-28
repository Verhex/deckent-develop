import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runStep, runSmoke } from '../../scripts/clean-clone-smoke.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/clean-clone-smoke.mjs');
const CLEAN_PATH = resolve(REPO_ROOT, 'scripts/clean.mjs');
const PACKAGE_PATH = resolve(REPO_ROOT, 'package.json');
const DOC_PATH = resolve(REPO_ROOT, 'docs/development/smoke-verify.md');

describe('runStep', () => {
  it('PASS path: returns status PASS, captures duration and optional detail', async () => {
    const step = await runStep('noop', () => 'all good');
    expect(step.name).toBe('noop');
    expect(step.status).toBe('PASS');
    expect(step.detail).toBe('all good');
    expect(typeof step.durationMs).toBe('number');
    expect(step.durationMs).toBeGreaterThanOrEqual(0);
    expect(step.error).toBeUndefined();
  });

  it('PASS path: tolerates undefined return without throwing', async () => {
    const step = await runStep('void', () => undefined);
    expect(step.status).toBe('PASS');
    expect(step.detail).toBe('');
  });

  it('FAIL path: thrown error becomes status FAIL with captured message', async () => {
    const step = await runStep('boom', () => {
      throw new Error('intentional failure xyz');
    });
    expect(step.status).toBe('FAIL');
    expect(step.error).toContain('intentional failure xyz');
    expect(step.detail).toBeUndefined();
  });

  it('FAIL path: truncates very long error messages to keep reports readable', async () => {
    const long = 'x'.repeat(2000);
    const step = await runStep('long', () => { throw new Error(long); });
    expect(step.status).toBe('FAIL');
    // 600-char cap per the implementation contract.
    expect(step.error!.length).toBeLessThanOrEqual(600);
  });
});

describe('runSmoke fail-propagation (no install)', () => {
  it('aborts after archive step fails when given an unreachable source dir', async () => {
    // source=cwd with a non-existent cwd causes the first non-archive step to fail
    // (we skip archive in cwd mode; skipInstall avoids npm ci; tsc must be the first hard fail).
    const report = await runSmoke({
      source: 'cwd',
      cwd: '/nonexistent-dir-clean-clone-smoke-test',
      skipInstall: true,
    });
    expect(report.ok).toBe(false);
    expect(report.summary.fail).toBeGreaterThanOrEqual(1);
    // Pipeline must short-circuit — not all 5 post-install steps should have run.
    const ran = report.steps.map((s) => s.name);
    expect(ran).toContain('tsc --noEmit');
    expect(report.steps.find((s) => s.name === 'tsc --noEmit')!.status).toBe('FAIL');
    // Subsequent steps must NOT appear once a hard step fails.
    expect(ran).not.toContain('npm run build');
    expect(ran).not.toContain('cli --version');
  });
});

describe('script artifact', () => {
  it('script file exists and stays within reasonable size budget', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
    const lines = readFileSync(SCRIPT_PATH, 'utf-8').split('\n').length;
    // Task budget: ~120 LoC target, ≤180 LoC ceiling (includes flags, comments, exports).
    expect(lines).toBeLessThanOrEqual(180);
  });

  it('exposes the documented public surface (runStep + runSmoke)', async () => {
    const mod = await import('../../scripts/clean-clone-smoke.mjs');
    expect(typeof mod.runStep).toBe('function');
    expect(typeof mod.runSmoke).toBe('function');
  });

  it('keeps clone-smoke build behind the active-execution clean admission', () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    const cleanSource = readFileSync(CLEAN_PATH, 'utf-8');

    expect(packageJson.scripts?.build).toMatch(/^npm run clean(?:\s|&&)/);
    expect(packageJson.scripts?.clean).toBe('node scripts/clean.mjs');
    expect(cleanSource).toContain('inspectActiveExecutions');
    expect(cleanSource).toContain("join(projectRoot, '.tasks')");
    expect(cleanSource).toContain("'runtime', 'invocations.db'");
    expect(cleanSource).toContain("'runtime', 'jobs'");
    expect(cleanSource).toContain("'runtime', 'run-flow-store'");
    expect(cleanSource).toContain("'autonomous', 'autonomous.db'");
    expect(cleanSource).toContain('foldRunFlowEvents');
    expect(cleanSource).toContain('E_CLEAN_ACTIVE_EXECUTION_HOLD');
  });
});

describe('documentation', () => {
  it('smoke-verify.md exists and documents the pipeline + flags', () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    expect(statSync(DOC_PATH).size).toBeGreaterThan(200);
    const doc = readFileSync(DOC_PATH, 'utf-8');
    // Pipeline step names from the script
    for (const step of ['archive', 'npm ci', 'tsc --noEmit', 'npm run build', 'cli --version', 'cli --help', 'init builtins']) {
      expect(doc).toContain(step);
    }
    // Flags
    expect(doc).toContain('--keep');
    expect(doc).toContain('--source=cwd');
  });
});
