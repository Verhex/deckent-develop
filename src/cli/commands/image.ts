// src/cli/commands/image.ts
//
// `deckent image build` CLI command — F1-IMG-2 (Sprint 301).
// Wraps buildSuggestedImageCmd from core/worker-image-check.ts and
// executes the resulting docker build command via async spawn (no spawnSync,
// no consent gate — direct build on user request).
//
// ADR-012: registerImage(program) pattern.
// ADR-001: ESM .js imports.
// ADR-010: Node built-ins only (node:child_process).

import { spawn as nodeSpawn } from 'node:child_process';
import type { Command } from 'commander';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import {
  buildSuggestedImageCmd,
  DEFAULT_WORKER_IMAGE,
} from '../../core/worker-image-check.js';
import type { SpawnImpl } from '../../core/worker-image-check.js';

export type { SpawnImpl };

// ─── Options ──────────────────────────────────────────────────────────────────

export interface ImageBuildOptions {
  withCodex?: boolean;
  withGemini?: boolean;
  withOllama?: boolean;
  image?: string;
  root?: string;
  lang?: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Run the worker image build. Composes providers from option flags, delegates
 * command construction to buildSuggestedImageCmd (codex/gemini), and appends
 * INSTALL_OLLAMA manually (worker-image-check.ts does not handle ollama yet).
 * Streams docker stdout/stderr to the terminal. Returns the process exit code.
 *
 * Pass `spawnImpl` to inject a mock for hermetic tests.
 */
export async function handleImageBuild(
  opts: ImageBuildOptions,
  spawnImpl?: SpawnImpl,
): Promise<number> {
  const lang = getLanguage(opts.lang);
  const image = opts.image && opts.image.trim().length > 0 ? opts.image : DEFAULT_WORKER_IMAGE;

  const providers: string[] = [];
  if (opts.withCodex) providers.push('codex');
  if (opts.withGemini) providers.push('gemini');

  let buildCmd = buildSuggestedImageCmd(image, providers);

  if (opts.withOllama) {
    // buildSuggestedImageCmd does not handle ollama — insert the build-arg before -t
    buildCmd = buildCmd.replace(' -t ', ' --build-arg INSTALL_OLLAMA=true -t ');
  }

  print(getMessage('doctor.image_fix_running', lang, { cmd: buildCmd }));

  const code = await runBuild(buildCmd, spawnImpl);

  if (code === 0) {
    print(getMessage('doctor.image_fix_done', lang));
  } else {
    print(getMessage('doctor.image_fix_failed', lang, { code: String(code) }));
  }

  return code;
}

// ─── Spawn helper (mirrors doctor.ts:runImageBuild) ───────────────────────────

function runBuild(buildCmd: string, spawnImpl?: SpawnImpl): Promise<number> {
  const parts = buildCmd.split(/\s+/).filter(Boolean);
  const command = parts[0] ?? 'docker';
  const args = parts.slice(1);
  const spawn: SpawnImpl = spawnImpl ?? ((c, a, o) => nodeSpawn(c, a, o));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    const child = spawn(command, args, { shell: false });
    child.stdout?.on('data', (chunk: string | Buffer) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk: string | Buffer) => process.stderr.write(chunk));
    child.on('error', () => finish(-1));
    child.on('close', (code) => finish(code ?? -1));
  });
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerImage(program: Command): void {
  const cmd = program
    .command('image')
    .description('Worker Docker image management');

  cmd
    .command('build')
    .description('Build the deckent-worker Docker image (direct build, no confirmation required)')
    .option('--with-codex', 'Install Codex CLI (INSTALL_CODEX=true build-arg)')
    .option('--with-gemini', 'Install Gemini CLI (INSTALL_GEMINI=true build-arg)')
    .option('--with-ollama', 'Install Ollama CLI (INSTALL_OLLAMA=true build-arg)')
    .option('--image <tag>', `Docker image tag to build (default: ${DEFAULT_WORKER_IMAGE})`)
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (opts: ImageBuildOptions) => {
      try {
        const code = await handleImageBuild(opts);
        if (code !== 0) process.exitCode = 1;
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}
