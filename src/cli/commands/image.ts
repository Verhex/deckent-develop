// src/cli/commands/image.ts
//
// `deckent image build` standalone CLI command — F1-IMG-2.
//
// Builds the deckent-worker Docker image from the Dockerfile.worker that ships
// INSIDE the npm package (F1-DF, 331-005). The Dockerfile path is resolved from
// this module's own location (import.meta.url), NEVER from process.cwd() — the
// user may run `deckent image build` from any working directory and must still
// hit the packaged Dockerfile. Honest-fail (clear, actionable, non-zero) when
// docker is absent or the packaged Dockerfile cannot be found — never a silent
// success.
//
// ADR-001: ESM .js imports + Node 24+.
// ADR-010: Node built-ins only (node:child_process, node:url, node:path, node:fs).
// ADR-012: registerImage(program) registration pattern (wired in src/cli/index.ts).

import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { DEFAULT_WORKER_IMAGE } from '../../core/worker-image-check.js';
import type { SpawnImpl } from '../../core/worker-image-check.js';

export type { SpawnImpl };

/** runBuild() return sentinel: the docker binary could not be launched (absent / not on PATH). */
const DOCKER_UNAVAILABLE = -2;

// ─── Options ──────────────────────────────────────────────────────────────────

export interface ImageBuildOptions {
  /** Install Codex CLI in the image (INSTALL_CODEX=true build-arg). */
  withCodex?: boolean;
  /** Install Gemini CLI in the image (INSTALL_GEMINI=true build-arg). */
  withGemini?: boolean;
  /** Install Ollama CLI in the image (INSTALL_OLLAMA=true build-arg). */
  withOllama?: boolean;
  /** Install Cursor CLI in the image (INSTALL_CURSOR=true build-arg). */
  withCursor?: boolean;
  /** Image tag to build. CLI `--tag`. Falls back to {@link image} then {@link DEFAULT_WORKER_IMAGE}. */
  tag?: string;
  /**
   * @deprecated Back-compat alias for {@link tag}. Retained so the programmatic
   * callers (upgrade.ts / init-steps.ts) keep compiling; `--tag` is the
   * documented CLI surface.
   */
  image?: string;
  /**
   * Print the resolved Dockerfile path + planned build command + image tag and
   * return WITHOUT spawning docker. CLI `--dry-run`.
   */
  dryRun?: boolean;
  /**
   * Package-root override. When omitted, the root is resolved from this
   * module's own location (import.meta.url) — never from process.cwd(). Tests
   * inject a tmpdir root so they stay hermetic.
   */
  root?: string;
  /** Language override (en|tr). */
  lang?: string;
}

// ─── Packaged Dockerfile resolution (cross-platform, never cwd) ─────────────────

/**
 * Resolve the package root that contains the shipped Dockerfile.worker.
 *
 * This module compiles to `{root}/dist/cli/commands/image.js` (npm install) or
 * runs from `{root}/src/cli/commands/image.ts` (dev / vitest). Both layouts are
 * exactly three directories below the package root, so the same `..` walk works
 * for both. Crucially this does NOT use process.cwd(): `deckent image build`
 * must find the packaged Dockerfile regardless of where the user invokes it.
 */
function resolvePackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', '..');
}

interface ResolvedDockerfile {
  /** Absolute path to the Dockerfile (canonical assets/ path even when absent). */
  path: string;
  /** True when the resolved Dockerfile actually exists on disk. */
  exists: boolean;
}

/**
 * Resolve the packaged Dockerfile.worker for a given package root.
 *
 * Prefers `assets/Dockerfile.worker` (the F1-DF canonical copy with the full
 * INSTALL_CODEX/GEMINI/OLLAMA + ca-certificates build-arg surface) and falls
 * back to a legacy root `Dockerfile.worker` for older package layouts. Returns
 * the first that exists; when neither does, returns the canonical assets path
 * with `exists:false` so the caller can honest-fail with a concrete path.
 */
function resolvePackagedDockerfile(root: string): ResolvedDockerfile {
  const assetsPath = join(root, 'assets', 'Dockerfile.worker');
  if (existsSync(assetsPath)) return { path: assetsPath, exists: true };
  const rootPath = join(root, 'Dockerfile.worker');
  if (existsSync(rootPath)) return { path: rootPath, exists: true };
  return { path: assetsPath, exists: false };
}

/**
 * Build the `docker build …` argument vector as an ARRAY (never a split string)
 * so a Dockerfile path or context that contains spaces — common on native
 * Windows, e.g. `C:\Users\John Doe\…` — survives intact (ADR Law-2: every
 * environment). claude is always baked in; codex/gemini/ollama are opt-in
 * build-args matching Dockerfile.worker.
 */
function buildDockerBuildArgs(
  dockerfilePath: string,
  context: string,
  tag: string,
  opts: Pick<ImageBuildOptions, 'withCodex' | 'withGemini' | 'withOllama' | 'withCursor'>,
): string[] {
  const args = ['build', '-f', dockerfilePath];
  if (opts.withCodex) args.push('--build-arg', 'INSTALL_CODEX=true');
  if (opts.withGemini) args.push('--build-arg', 'INSTALL_GEMINI=true');
  if (opts.withOllama) args.push('--build-arg', 'INSTALL_OLLAMA=true');
  if (opts.withCursor) args.push('--build-arg', 'INSTALL_CURSOR=true');
  args.push('-t', tag, context);
  return args;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Run (or, with `--dry-run`, plan) the worker image build.
 *
 * Resolves the packaged Dockerfile (cross-platform, cwd-independent), composes
 * the build-arg vector from the provider flags, and either prints the plan
 * (`dryRun`) or spawns `docker build` via the injected seam (`shell:false`).
 *
 * Returns the docker exit code (0 = success). Honest-fail paths:
 *   - packaged Dockerfile not found → non-zero, actionable message, NO spawn.
 *   - docker binary absent / not on PATH → non-zero, actionable message.
 *
 * Pass `spawnImpl` to inject a mock for hermetic tests.
 */
export async function handleImageBuild(
  opts: ImageBuildOptions,
  spawnImpl?: SpawnImpl,
): Promise<number> {
  const lang = getLanguage(opts.lang);

  const requestedTag = opts.tag?.trim() || opts.image?.trim();
  const tag = requestedTag && requestedTag.length > 0 ? requestedTag : DEFAULT_WORKER_IMAGE;

  const root = opts.root ?? resolvePackageRoot();
  const { path: dockerfilePath, exists } = resolvePackagedDockerfile(root);
  const context = dirname(dockerfilePath);
  const args = buildDockerBuildArgs(dockerfilePath, context, tag, opts);
  const planStr = `docker ${args.join(' ')}`;

  if (opts.dryRun) {
    print(getMessage('image.dry_run_dockerfile', lang, {
      path: dockerfilePath,
      status: exists ? '' : getMessage('image.dry_run_not_found', lang),
    }));
    print(getMessage('image.dry_run_build', lang, { cmd: planStr }));
    print(getMessage('image.dry_run_tag', lang, { tag }));
    return 0;
  }

  if (!exists) {
    // Honest-fail: do NOT spawn a build that docker would reject with an opaque
    // "unable to prepare context" error. Surface the concrete expected path.
    printError(
      new Error(
        getMessage('image.dockerfile_missing', lang, { path: dockerfilePath }),
      ),
    );
    return 1;
  }

  print(getMessage('image.build_running', lang, { cmd: planStr }));

  const code = await runBuild(args, lang, spawnImpl);

  if (code === 0) {
    print(getMessage('image.build_done', lang));
  } else if (code === DOCKER_UNAVAILABLE) {
    // The actionable "docker unavailable" message was already printed in runBuild.
    // Normalise to a clean non-zero exit for callers (init/upgrade fold + CLI).
    return 1;
  } else {
    print(getMessage('image.build_failed', lang, { code: String(code) }));
  }

  return code;
}

// ─── Spawn helper (mirrors core/worker-image-check.ts runDocker — shell:false) ──

/**
 * Spawn `docker` with the given argument vector and stream its stdout/stderr to
 * the terminal. `shell:false` (no shell interpolation — the args are passed as a
 * vector). Resolves the process exit code, or {@link DOCKER_UNAVAILABLE} when the
 * docker binary itself could not be launched (honest-fail, message printed).
 */
function runBuild(args: string[], lang: string, spawnImpl?: SpawnImpl): Promise<number> {
  const spawn: SpawnImpl = spawnImpl ?? ((c, a, o) => nodeSpawn(c, a, o));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    const child = spawn('docker', args, { shell: false });
    child.stdout?.on('data', (chunk: string | Buffer) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk: string | Buffer) => process.stderr.write(chunk));
    child.on('error', (err: Error) => {
      // Honest-fail: never a silent success. Distinguish "docker not installed"
      // (ENOENT) from other launch failures so the message is actionable.
      const isMissing = (err as NodeJS.ErrnoException).code === 'ENOENT';
      const detail = isMissing
        ? getMessage('image.docker_unavailable', lang)
        : getMessage('image.docker_launch_failed', lang, { error: err.message });
      printError(new Error(getMessage('image.build_launch_error', lang, { detail })));
      finish(DOCKER_UNAVAILABLE);
    });
    child.on('close', (code) => finish(code ?? -1));
  });
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerImage(program: Command): void {
  const cmd = program
    .command('image')
    .description(getMessage('cli.image.desc', getLanguage(undefined)));

  cmd
    .command('build')
    .description(getMessage('cli.image.build.desc', getLanguage(undefined)))
    .option('--tag <tag>', getMessage('cli.image.build.opt_tag', getLanguage(undefined), { default: DEFAULT_WORKER_IMAGE }))
    .option('--dry-run', getMessage('cli.image.build.opt_dry_run', getLanguage(undefined)))
    .option('--with-codex', getMessage('cli.image.build.opt_with_codex', getLanguage(undefined)))
    .option('--with-gemini', getMessage('cli.image.build.opt_with_gemini', getLanguage(undefined)))
    .option('--with-ollama', getMessage('cli.image.build.opt_with_ollama', getLanguage(undefined)))
    .option('--with-cursor', getMessage('cli.image.build.opt_with_cursor', getLanguage(undefined)))
    .option('--image <tag>', getMessage('cli.image.build.opt_image', getLanguage(undefined)))
    .option('--lang <code>', getMessage('cli.image.build.opt_lang', getLanguage(undefined)))
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
