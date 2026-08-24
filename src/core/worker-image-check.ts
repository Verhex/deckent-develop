// ─── Worker Image Readiness Check (F1-IMG, Sprint 270) ──────────────────────
//
// Detection half of F1-IMG: answer "is the deckent-worker docker image ready to
// run the configured providers?" without building or mutating anything. The
// report this produces is rendered by doctor and (with consent, ADR-063) drives
// a `--fix-image` rebuild suggestion — both wired in later tasks. This module is
// detection-only and network-free.
//
// What "ready" means, derived from Dockerfile.worker:
//   - the image exists locally (`docker image inspect`);
//   - every required provider's CLI is on PATH inside the image
//     (claude is always baked in; codex/gemini are opt-in build args); and
//   - ca-certificates is present — the codex Rust CLI's TLS client uses the
//     SYSTEM root CA store and fails without it (Sprint 252 PSL-1 case).
//
// ADR-008: core/ must not import orchestra/. spawn-backend-docker owns the
// runtime DEFAULT_IMAGE; we intentionally re-declare the same literal here
// rather than import across the layer boundary.

import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import { getProviderCommandSpec } from './provider-command-spec.js';

/** Default worker image tag — kept in sync with spawn-backend-docker's DEFAULT_IMAGE. */
export const DEFAULT_WORKER_IMAGE = 'deckent-worker:latest';

/** Readiness verdict for the worker image. */
export type WorkerImageState = 'ready' | 'missing' | 'stale';

export interface WorkerImageReport {
  /**
   * - 'ready'   → image exists with every required CLI + ca-certificates.
   * - 'missing' → image not present locally (or docker itself unavailable).
   * - 'stale'   → image present but missing a required CLI or ca-certificates
   *               (a rebuild is needed).
   */
  state: WorkerImageState;
  /** Required provider CLI binaries absent from the image (e.g. ['codex']). */
  missingClis: string[];
  /** True when the image lacks ca-certificates (or it could not be confirmed). */
  missingCaCerts: boolean;
  /** Real `docker build` command (with the right build-args) that yields a ready image. */
  suggestedBuildCmd: string;
}

/** Minimal child shape used by {@link checkWorkerImage} — mockable in tests. */
export interface SpawnedProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

/** Injectable async spawn (defaults to node:child_process spawn). */
export type SpawnImpl = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => SpawnedProcessLike;

export interface CheckWorkerImageOptions {
  /** Image tag to inspect (default {@link DEFAULT_WORKER_IMAGE}). */
  image?: string;
  /** Providers the worker fleet must support (e.g. ['claude','codex']). */
  requiredProviders: string[];
  /** Injectable spawn for hermetic tests. */
  spawnImpl?: SpawnImpl;
}

function collectStream(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (stream === null) return Promise.resolve('');
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

interface DockerRunResult {
  /** Process exit code, or -1 when the spawn itself errored (docker unavailable). */
  code: number;
  stdout: string;
  stderr: string;
}

function runDocker(spawnImpl: SpawnImpl, args: string[]): Promise<DockerRunResult> {
  return new Promise((resolve) => {
    const child = spawnImpl('docker', args, { shell: false });
    const stdoutP = collectStream(child.stdout);
    const stderrP = collectStream(child.stderr);
    let settled = false;
    child.on('error', () => {
      if (settled) return;
      settled = true;
      resolve({ code: -1, stdout: '', stderr: 'docker spawn failed' });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      void Promise.all([stdoutP, stderrP]).then(([stdout, stderr]) => {
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  });
}

/**
 * Provider binaries to probe inside the image. Providers with a command spec
 * map to their container CLI (claude→claude, codex→codex, gemini→gemini);
 * host-only providers (ollama, …) have no spec and therefore no in-image CLI to
 * check, so they are skipped. Order-stable, de-duplicated.
 */
function binariesFor(requiredProviders: string[]): string[] {
  const seen = new Set<string>();
  const binaries: string[] = [];
  for (const provider of requiredProviders) {
    const binary = getProviderCommandSpec(provider)?.binary;
    if (binary && !seen.has(binary)) {
      seen.add(binary);
      binaries.push(binary);
    }
  }
  return binaries;
}

/**
 * Shell probe run inside the image: emits one `CLI:<bin>:ok|missing` line per
 * binary and one `CACERTS:ok|missing` line. ca-certificates is signalled by the
 * cert dir existing AND the update-ca-certificates tool being installed — a
 * sufficient, cheap proxy for "the package is present" (documented in F1-IMG).
 */
function buildProbeScript(binaries: string[]): string {
  const parts: string[] = [];
  if (binaries.length > 0) {
    parts.push(
      `for c in ${binaries.join(' ')}; do ` +
        'if command -v "$c" >/dev/null 2>&1; then echo "CLI:$c:ok"; else echo "CLI:$c:missing"; fi; ' +
        'done',
    );
  }
  parts.push(
    'if [ -d /etc/ssl/certs ] && command -v update-ca-certificates >/dev/null 2>&1; ' +
      'then echo "CACERTS:ok"; else echo "CACERTS:missing"; fi',
  );
  return parts.join('; ');
}

/**
 * Build the real `docker build` command that produces a ready image for the
 * required providers. claude is always baked in (no build-arg); codex/gemini are
 * opt-in build args matching Dockerfile.worker.
 */
export function buildSuggestedImageCmd(image: string, requiredProviders: string[]): string {
  const args = ['docker', 'build', '-f', 'Dockerfile.worker'];
  if (requiredProviders.includes('codex')) args.push('--build-arg', 'INSTALL_CODEX=true');
  if (requiredProviders.includes('gemini')) args.push('--build-arg', 'INSTALL_GEMINI=true');
  if (requiredProviders.includes('cursor')) args.push('--build-arg', 'INSTALL_CURSOR=true');
  args.push('-t', image, '.');
  return args.join(' ');
}

/**
 * Inspect the worker image and report readiness. Pure detection — never builds
 * or pulls. Pass `spawnImpl` to keep tests hermetic (no real docker, no network).
 */
export async function checkWorkerImage(opts: CheckWorkerImageOptions): Promise<WorkerImageReport> {
  const image = opts.image && opts.image.trim().length > 0 ? opts.image : DEFAULT_WORKER_IMAGE;
  const spawnImpl: SpawnImpl = opts.spawnImpl ?? ((command, args, options) => nodeSpawn(command, args, options));
  const binaries = binariesFor(opts.requiredProviders);
  const suggestedBuildCmd = buildSuggestedImageCmd(image, opts.requiredProviders);

  // 1) Does the image exist locally?
  const inspect = await runDocker(spawnImpl, ['image', 'inspect', image]);
  if (inspect.code !== 0) {
    return {
      state: 'missing',
      missingClis: [...binaries],
      missingCaCerts: true,
      suggestedBuildCmd,
    };
  }

  // 2) Image exists — probe its CLIs + ca-certificates.
  const probe = await runDocker(spawnImpl, ['run', '--rm', image, 'sh', '-c', buildProbeScript(binaries)]);
  if (probe.code !== 0) {
    // Image present but the probe could not confirm its contents — treat as
    // not-ready (conservative) rather than falsely reporting 'ready'.
    return {
      state: 'stale',
      missingClis: [...binaries],
      missingCaCerts: true,
      suggestedBuildCmd,
    };
  }

  const missingClis = binaries.filter((bin) => !probe.stdout.includes(`CLI:${bin}:ok`));
  const missingCaCerts = !probe.stdout.includes('CACERTS:ok');
  const state: WorkerImageState = missingClis.length === 0 && !missingCaCerts ? 'ready' : 'stale';

  return { state, missingClis, missingCaCerts, suggestedBuildCmd };
}
