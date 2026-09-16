#!/usr/bin/env node
// smoke-init-noninteractive.mjs — RC2C / born-652 proof-of-function (413-001).
//
// `deckent init --yes` used to NOT be non-interactive at all (language/plan/
// project-name prompts still opened), and a piped/redirected stdin that ran
// dry mid-flow hung forever then silently exited 0 once the event loop
// drained — writing NOTHING to disk and printing no outcome block. This is
// the single most critical hole in the 412-001 outcome contract (it only
// fires if the flow reaches its end).
//
// Runs the REAL `registerInit` (src/cli/commands/init.ts, current source —
// NOT dist/, see note below) via `vite-node` — the same dev-tool vitest uses
// internally, already a project devDependency — inside a minimal commander
// program that mirrors exactly how src/cli/index.ts's buildProgram() wires
// `registerInit(program)`, without pulling in the other ~40 unrelated
// commands (REPL/chat-providers/etc.) init has nothing to do with.
//
// Why not dist/cli/entry.js (this project's usual smoke-script target)? The
// operating rule for this sprint forbids `npm run build` while a sprint is
// live (ESM cache + worker auth-loss) — running the CURRENT source directly
// is the only way this proof can reflect this task's actual code change
// rather than a stale prebuilt binary. `vite-node` resolves this project's
// `.js`-suffixed relative imports against their real `.ts` source exactly
// like vitest does, so this is genuine, unmodified production code — not a
// reimplementation or a mock.
//
// Three proofs, each in its own isolated tmp project directory:
//   1. `deckent init --yes` (+ `--no-install`, see SAFETY note) on a PATH with
//      no provider CLI reachable → completes fully unattended, zero prompts,
//      SETUP_INCOMPLETE (exit 2), `.deckent/config.json` written with the
//      documented mode=balanced/language=en defaults.
//   2. `deckent init` with stdin=/dev/null and NO --yes → FAILED (exit 1),
//      the honest non-interactive message, NOTHING written to disk — the
//      silent-exit-0 bug this task fixes never recurs.
//   3. `deckent init --yes --no-install` on the host's REAL (unmodified) PATH
//      — whatever provider CLIs are actually installed — still prints the
//      412-001 outcome block and opens zero prompts (contract holds either
//      way, not just in the artificially-stripped case).
//
// SAFETY (--no-install): with zero provider CLIs on PATH and `--yes` alone,
// `deckent init` would detect claude/codex/gemini as "missing tools" and (per
// provisioner.ts, mode='yes') attempt REAL `npm install -g <pkg>` calls —
// exactly the kind of host-mutating action this project's own worker rules
// forbid running automatically. `--no-install` (resolveProvisionMode: "wins
// over --yes") keeps this smoke script to hint-only, zero real installs,
// while still fully exercising this task's fix (zero prompts, honest
// outcome, defaults, file writes).
//
// Run directly: node scripts/smoke-init-noninteractive.mjs

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir, platform as osPlatform } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VITE_NODE_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'vite-node');
const INIT_MODULE_SPECIFIER = pathToFileURL(join(REPO_ROOT, 'src', 'cli', 'commands', 'init.ts')).href;

const RUN_TIMEOUT_MS = 45_000;

// ─── Driver: a minimal, real (unmocked) commander program ──────────────────
// Mirrors src/cli/index.ts's `registerInit(program)` wiring exactly, without
// the other ~40 unrelated command registrations.

function driverSource() {
  return `
import { Command } from 'commander';
import { registerInit } from ${JSON.stringify(INIT_MODULE_SPECIFIER)};

const program = new Command();
program.exitOverride();
registerInit(program);
program.parseAsync(['node', 'deckent', 'init', ...process.argv.slice(2)])
  .catch(() => { /* commander exitOverride — parse errors only, not init's own outcome handling */ });
`;
}

/**
 * Run `deckent init <args>` (real source, via vite-node) with cwd=`projectRoot`
 * and the given env. stdin is always /dev/null-equivalent (`stdio: 'ignore'`)
 * — none of the three scenarios below needs real prompt answers piped in.
 */
function runInit(projectRoot, args, env) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [VITE_NODE_BIN, '--root', REPO_ROOT, DRIVER_PATH, ...args], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf-8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8'); });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, RUN_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, stdout, stderr, timedOut });
    });
  });
}

/**
 * Build an env whose PATH resolves `node` (so the doctor's own `spawnSync('node', …)`
 * check keeps working) but NOT `claude`/`codex`/`gemini`/`npm` — the isolated-PATH
 * proof needs zero provider CLIs reachable, deterministically, regardless of what
 * happens to be installed on the host running this smoke script.
 */
function buildIsolatedProviderEnv() {
  const isolatedBinDir = mkdtempSync(join(tmpdir(), 'deckent-isolated-bin-'));
  symlinkSync(process.execPath, join(isolatedBinDir, 'node'));
  const env = { ...process.env };
  env.PATH = [isolatedBinDir, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  // Strip provider auth env vars too — a leaked API key must not make a
  // provider "available" and undermine the isolated-PATH proof.
  for (const key of [
    'ANTHROPIC_API_KEY', 'DECKENT_CLAUDE_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DECKENT_GOOGLE_API_KEY',
  ]) {
    delete env[key];
  }
  return { env, cleanup: () => rmSync(isolatedBinDir, { recursive: true, force: true }) };
}

function makeProjectRoot(label) {
  return mkdtempSync(join(tmpdir(), `deckent-init-smoke-${label}-`));
}

// Known literal prompt strings this task's fix must NEVER print on the --yes
// path (promptSelect prints `? ${question}`; promptText prints `${question}: `).
const LANGUAGE_PROMPT_MARKER = '? Select language';
const PLAN_PROMPT_MARKER = 'Select your plan';
const PROJECT_NAME_PROMPT_MARKER = 'Project name:';

function printsNoPrompts(stdout) {
  return !stdout.includes(LANGUAGE_PROMPT_MARKER)
    && !stdout.includes(PLAN_PROMPT_MARKER)
    && !stdout.includes(PROJECT_NAME_PROMPT_MARKER);
}

let DRIVER_PATH;

export async function runSmoke() {
  const failures = [];
  const check = (label, cond) => { if (!cond) failures.push(label); };

  const driverDir = mkdtempSync(join(tmpdir(), 'deckent-init-smoke-driver-'));
  DRIVER_PATH = join(driverDir, 'driver.mjs');
  writeFileSync(DRIVER_PATH, driverSource(), 'utf-8');

  try {
    // ─── Scenario 1: --yes on an isolated (zero-provider) PATH ──────────────
    if (osPlatform() === 'win32') {
      // Honest skip, not a silent fake pass — PATH isolation here assumes POSIX
      // directory layout (Law #2: unsupported platform fails honestly).
      check('scenario1: SKIPPED on win32 (POSIX-only PATH isolation) — not a failure', true);
    } else {
      const projectRoot1 = makeProjectRoot('yes-isolated');
      const { env: isolatedEnv, cleanup } = buildIsolatedProviderEnv();
      try {
        const result = await runInit(projectRoot1, ['--yes', '--no-install'], isolatedEnv);

        check('scenario1: did not hang (async-spawn completes within timeout)', !result.timedOut);
        check('scenario1: exits with code 2 (SETUP_INCOMPLETE — no provider CLI reachable)', result.code === 2);
        check('scenario1: prints the SETUP_INCOMPLETE outcome token', result.stdout.includes('SETUP_INCOMPLETE'));
        check('scenario1: opens ZERO prompts on the --yes path', printsNoPrompts(result.stdout));

        const configPath = join(projectRoot1, '.deckent', 'config.json');
        check('scenario1: .deckent/config.json was written', existsSync(configPath));
        if (existsSync(configPath)) {
          const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
          check('scenario1: config.json mode="balanced" (documented --yes default)', cfg.mode === 'balanced');
          check('scenario1: config.json language="en" (documented --yes default)', cfg.language === 'en');
          check('scenario1: config.json projectName=basename(cwd)', cfg.projectName === projectRoot1.split(/[\\/]/).pop());
        }
      } finally {
        cleanup();
        rmSync(projectRoot1, { recursive: true, force: true });
      }
    }

    // ─── Scenario 2: stdin=/dev/null, no --yes → honest FAILED, nothing written ──
    {
      const projectRoot2 = makeProjectRoot('noninteractive-no-yes');
      try {
        const result = await runInit(projectRoot2, [], process.env);

        check('scenario2: did not hang (the historical bug hung/silently exited 0)', !result.timedOut);
        check('scenario2: exits non-zero (silent exit 0 is DEAD)', result.code !== 0);
        check('scenario2: exits with code 1 (FAILED)', result.code === 1);
        check('scenario2: prints the FAILED outcome token', result.stdout.includes('FAILED'));
        check(
          'scenario2: prints the honest non-interactive-environment message',
          result.stdout.includes('Non-interactive environment detected'),
        );
        check('scenario2: opens ZERO prompts', printsNoPrompts(result.stdout));
        check('scenario2: NOTHING written to disk (.deckent/ never created)', !existsSync(join(projectRoot2, '.deckent')));
      } finally {
        rmSync(projectRoot2, { recursive: true, force: true });
      }
    }

    // ─── Scenario 3: --yes on the host's REAL, unmodified PATH ──────────────
    {
      const projectRoot3 = makeProjectRoot('yes-real-path');
      try {
        const result = await runInit(projectRoot3, ['--yes', '--no-install'], process.env);

        check('scenario3: did not hang', !result.timedOut);
        check(
          'scenario3: exits with a defined outcome code (0=READY or 2=SETUP_INCOMPLETE)',
          result.code === 0 || result.code === 2,
        );
        check(
          'scenario3: prints a 412-001 outcome block (Setup outcome: READY|SETUP_INCOMPLETE|FAILED)',
          /Setup outcome: (READY|SETUP_INCOMPLETE|FAILED)/.test(result.stdout),
        );
        check('scenario3: opens ZERO prompts on the --yes path', printsNoPrompts(result.stdout));
      } finally {
        rmSync(projectRoot3, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(driverDir, { recursive: true, force: true });
  }

  return { pass: failures.length === 0, failures };
}

// ─── Main ───────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSmoke()
    .then((result) => {
      if (result.pass) {
        process.stdout.write('SMOKE OK\n');
        process.exit(0);
      } else {
        process.stderr.write(`SMOKE FAIL:\n${result.failures.map((f) => `  - ${f}`).join('\n')}\n`);
        process.exit(1);
      }
    })
    .catch((err) => {
      process.stderr.write(`SMOKE FAIL: ${err instanceof Error ? err.stack || err.message : String(err)}\n`);
      process.exit(1);
    });
}
