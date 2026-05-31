#!/usr/bin/env node
// clean-clone-smoke.mjs — Verify deckent works from a clean HEAD snapshot.
// Usage:
//   node scripts/clean-clone-smoke.mjs            # archive HEAD → tmp, full pipeline
//   node scripts/clean-clone-smoke.mjs --keep     # keep tmp dir after run
//   node scripts/clean-clone-smoke.mjs --skip-install   # reuse existing node_modules
//   node scripts/clean-clone-smoke.mjs --source=cwd     # run pipeline in-place

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8', ...opts });
}

export async function runStep(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, status: 'PASS', durationMs: Date.now() - t0, detail: detail ?? '' };
  } catch (err) {
    const msg = err instanceof Error ? (err.message || String(err)) : String(err);
    return { name, status: 'FAIL', durationMs: Date.now() - t0, error: msg.slice(0, 600) };
  }
}

function archiveHead(repoRoot, destDir) {
  // git archive emits a tar of tracked files at HEAD — clean snapshot, no .git, no untracked.
  sh(`git -C "${repoRoot}" archive --format=tar HEAD | tar -x -C "${destDir}"`, { shell: '/bin/bash' });
  if (!existsSync(join(destDir, 'package.json'))) {
    throw new Error('archive missing package.json');
  }
  return readdirSync(destDir).length;
}

export async function runSmoke(opts = {}) {
  const source = opts.source ?? 'archive';
  const skipInstall = opts.skipInstall ?? false;
  const log = opts.log ?? (() => {});

  let workDir;
  let tmpRoot = null;
  if (source === 'cwd') {
    workDir = opts.cwd ?? REPO_ROOT;
  } else {
    tmpRoot = opts.tmpDir ?? mkdtempSync(join(tmpdir(), 'deckent-smoke-'));
    workDir = tmpRoot;
  }

  const steps = [];
  const push = (s) => { steps.push(s); log(`${s.status} ${s.name} (${s.durationMs}ms)`); };

  if (source !== 'cwd') {
    push(await runStep('archive', () => `${archiveHead(REPO_ROOT, workDir)} top-level entries`));
    if (steps[steps.length - 1].status === 'FAIL') {
      return finish(steps, workDir, tmpRoot, opts.keep);
    }
  }

  if (!skipInstall) {
    push(await runStep('npm ci', () => {
      sh('npm ci --no-audit --no-fund --ignore-scripts', { cwd: workDir, timeout: 600_000 });
      return existsSync(join(workDir, 'node_modules')) ? 'node_modules present' : 'no node_modules';
    }));
    if (steps[steps.length - 1].status === 'FAIL') return finish(steps, workDir, tmpRoot, opts.keep);
  }

  push(await runStep('tsc --noEmit', () => {
    sh('npx tsc --noEmit', { cwd: workDir, timeout: 300_000 });
    return 'no type errors';
  }));
  if (steps[steps.length - 1].status === 'FAIL') return finish(steps, workDir, tmpRoot, opts.keep);

  push(await runStep('npm run build', () => {
    sh('npm run build', { cwd: workDir, timeout: 300_000 });
    const distEntry = join(workDir, 'dist', 'cli', 'entry.js');
    if (!existsSync(distEntry)) throw new Error('dist/cli/entry.js missing after build');
    return 'dist/cli/entry.js produced';
  }));
  if (steps[steps.length - 1].status === 'FAIL') return finish(steps, workDir, tmpRoot, opts.keep);

  push(await runStep('cli --version', () => {
    const out = sh('node dist/cli/entry.js --version', { cwd: workDir, timeout: 30_000 }).trim();
    if (!/\d+\.\d+/.test(out)) throw new Error(`unexpected --version output: ${out}`);
    return out;
  }));

  push(await runStep('cli --help', () => {
    const out = sh('node dist/cli/entry.js --help', { cwd: workDir, timeout: 30_000 });
    if (!/Usage|Commands|Options/i.test(out)) throw new Error('--help output missing Usage/Commands');
    return `${out.split('\n').length} lines`;
  }));

  push(await runStep('init builtins', () => {
    const initTarget = join(workDir, '.smoke-init-target');
    if (!existsSync(initTarget)) {
      sh(`mkdir -p "${initTarget}"`, { shell: '/bin/bash' });
    }
    sh(`node dist/cli/entry.js init "${initTarget}"`, { cwd: workDir, timeout: 60_000 });
    const agents = join(initTarget, '.deckent', 'agents');
    const skills = join(initTarget, '.deckent', 'skills');
    if (!existsSync(agents)) throw new Error('.deckent/agents missing after init');
    if (!existsSync(skills)) throw new Error('.deckent/skills missing after init');
    const agentCount = readdirSync(agents).length;
    const skillCount = readdirSync(skills).length;
    if (agentCount < 1 || skillCount < 1) {
      throw new Error(`builtins empty: ${agentCount} agents, ${skillCount} skills`);
    }
    return `${agentCount} agents, ${skillCount} skills`;
  }));

  return finish(steps, workDir, tmpRoot, opts.keep);
}

function finish(steps, workDir, tmpRoot, keep) {
  const pass = steps.filter((s) => s.status === 'PASS').length;
  const fail = steps.filter((s) => s.status === 'FAIL').length;
  const result = { steps, summary: { pass, fail, total: steps.length }, ok: fail === 0, workDir };
  if (tmpRoot && !keep) {
    try { rmSync(tmpRoot, { recursive: true, force: true }); result.cleanedUp = true; }
    catch (err) { result.cleanupError = err instanceof Error ? err.message : String(err); }
  } else if (tmpRoot) {
    result.cleanedUp = false;
  }
  return result;
}

function parseArgs(argv) {
  const opts = { keep: false, skipInstall: false, source: 'archive' };
  for (const a of argv.slice(2)) {
    if (a === '--keep') opts.keep = true;
    else if (a === '--skip-install') opts.skipInstall = true;
    else if (a.startsWith('--source=')) opts.source = a.slice('--source='.length);
  }
  return opts;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  const opts = parseArgs(process.argv);
  const report = await runSmoke({ ...opts, log: (msg) => process.stderr.write(`[smoke] ${msg}\n`) });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(report.ok ? 0 : 1);
}
