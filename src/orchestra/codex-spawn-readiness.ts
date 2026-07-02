// ─── Codex Spawn Readiness (F1-CODEX-READY, Sprint 360 Task 360-005) ────────
//
// Advisory-only live-readiness audit for the Codex worker spawn path. Answers
// three questions without ever performing a real codex spawn:
//   (a) is the HOST ready to run `codex` (CLI on PATH + auth configured)?
//   (b) is the docker WORKER IMAGE ready to run `codex` (CLI baked in +
//       ca-certificates present — codex's Rust TLS client needs the system
//       root CA store)? If not, the caller must fall back to the subprocess
//       backend for codex tasks.
//   (c) what evidence proves the real spawn path passes the gpt-5.5/gpt-5
//       model param and structured-output flag correctly?
//
// This module produces a SUGGESTION for the route/plan side — it never
// touches spawn or provider code, and never spawns a real codex process.
// Docker-image detection reuses the existing injectable probe seam
// (checkWorkerImage, src/core/worker-image-check.ts) rather than
// reimplementing it; model-arg evidence reuses CodexAdapter's own public,
// no-spawn methods (buildCommand) rather than re-deriving the mapping.

import { spawn as nodeSpawn } from 'node:child_process';
import type { OpenAIModel } from '../core/types.js';
import { parseSemverFromOutput } from '../core/provider.js';
import { modelRegistry } from '../core/model-registry.js';
import {
  checkWorkerImage,
  DEFAULT_WORKER_IMAGE,
  type SpawnImpl,
  type SpawnedProcessLike,
  type WorkerImageState,
} from '../core/worker-image-check.js';
import { CodexAdapter, CODEX_USAGE_EMIT_ARGS } from '../providers/codex.js';
import type { CodexAuthMode } from '../providers/codex.js';

// ─── Host readiness ──────────────────────────────────────────────────────

export interface CodexHostReadiness {
  /** Whether `codex --version` succeeded (CLI is on PATH). */
  cliFound: boolean;
  /** Parsed semver, or raw version output when it doesn't parse as semver. */
  version?: string;
  /** 'api_key' (env var) | 'subscription' (`codex auth status`) | 'none'. */
  authMode: CodexAuthMode;
  /** cliFound && authMode !== 'none'. */
  ready: boolean;
  /** Human-readable summary of the verdict above. */
  reason: string;
}

export interface CheckCodexHostReadinessOptions {
  /** Injectable async spawn — defaults to node:child_process spawn. */
  spawnImpl?: SpawnImpl;
  /** Injectable environment for API-key detection — defaults to process.env. */
  env?: NodeJS.ProcessEnv;
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

interface CodexRunResult {
  /** Exit code, or -1 when the spawn itself errored (codex not installed). */
  code: number;
  stdout: string;
}

function runCodex(spawnImpl: SpawnImpl, args: string[]): Promise<CodexRunResult> {
  return new Promise((resolve) => {
    const child: SpawnedProcessLike = spawnImpl('codex', args, { shell: false });
    const stdoutP = collectStream(child.stdout);
    let settled = false;
    child.on('error', () => {
      if (settled) return;
      settled = true;
      resolve({ code: -1, stdout: '' });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      void stdoutP.then((stdout) => resolve({ code: code ?? -1, stdout }));
    });
  });
}

/**
 * Async, fully-injectable host readiness probe for the Codex CLI. Mirrors the
 * signal `CodexAdapter.diagnoseAvailability()` reports (binary + auth), but
 * uses an injectable async spawn (never `spawnSync`) so tests stay hermetic —
 * `diagnoseAvailability()` itself uses `spawnSync` and isn't injectable, so it
 * can't be reused here without a real `codex` binary in CI.
 */
export async function checkCodexHostReadiness(
  opts?: CheckCodexHostReadinessOptions,
): Promise<CodexHostReadiness> {
  const spawnImpl: SpawnImpl = opts?.spawnImpl ?? ((command, args, options) => nodeSpawn(command, args, options));
  const env = opts?.env ?? process.env;

  const versionResult = await runCodex(spawnImpl, ['--version']);
  const cliFound = versionResult.code === 0;
  const trimmedVersion = versionResult.stdout.trim();
  const version = cliFound
    ? (parseSemverFromOutput(versionResult.stdout) ?? (trimmedVersion.length > 0 ? trimmedVersion : undefined))
    : undefined;

  let authMode: CodexAuthMode = 'none';
  if (!cliFound) {
    authMode = 'none';
  } else if (env['OPENAI_API_KEY'] ?? env['DECKENT_OPENAI_API_KEY']) {
    authMode = 'api_key';
  } else {
    const authResult = await runCodex(spawnImpl, ['auth', 'status']);
    if (authResult.code === 0 && authResult.stdout.includes('logged in')) {
      authMode = 'subscription';
    }
  }

  const ready = cliFound && authMode !== 'none';
  const reason = !cliFound
    ? 'Codex CLI not found on host (codex --version failed)'
    : authMode === 'none'
      ? 'Codex CLI found but no authentication configured (no OPENAI_API_KEY/DECKENT_OPENAI_API_KEY, no active `codex auth status` session)'
      : `Codex CLI ${version ?? '(unknown version)'} ready on host (auth: ${authMode})`;

  return { cliFound, ...(version !== undefined ? { version } : {}), authMode, ready, reason };
}

// ─── Docker-image readiness ──────────────────────────────────────────────

export interface CodexDockerReadiness {
  /** Image tag inspected. */
  image: string;
  /** 'ready' | 'missing' | 'stale' — see checkWorkerImage (core/worker-image-check.ts). */
  state: WorkerImageState;
  /** Whether the codex CLI binary was confirmed present inside the image. */
  codexCliPresent: boolean;
  /** True when the image lacks ca-certificates (breaks codex's Rust TLS client). */
  missingCaCerts: boolean;
  /** Set to 'subprocess' whenever the docker image is not codex-ready. */
  backendRequired?: 'subprocess';
  /** Explains the backendRequired verdict (undefined when the image is ready). */
  reason?: string;
  /** Real `docker build` command that would produce a codex-ready image. */
  suggestedBuildCmd: string;
}

export interface CheckCodexDockerReadinessOptions {
  /** Image tag to inspect (default: DEFAULT_WORKER_IMAGE from core/worker-image-check.ts). */
  image?: string;
  /** Injectable async spawn — forwarded to checkWorkerImage for hermetic tests. */
  spawnImpl?: SpawnImpl;
}

/**
 * Codex-scoped view over the existing docker worker-image probe seam
 * (checkWorkerImage). Detection-only — never builds or pulls an image.
 */
export async function checkCodexDockerReadiness(
  opts?: CheckCodexDockerReadinessOptions,
): Promise<CodexDockerReadiness> {
  const image = opts?.image && opts.image.trim().length > 0 ? opts.image : DEFAULT_WORKER_IMAGE;
  const report = await checkWorkerImage({
    image,
    requiredProviders: ['codex'],
    ...(opts?.spawnImpl ? { spawnImpl: opts.spawnImpl } : {}),
  });

  const codexCliPresent = !report.missingClis.includes('codex');
  const ready = report.state === 'ready';

  let reason: string | undefined;
  if (report.state === 'missing') {
    reason = `Docker worker image "${image}" not found locally — codex tasks need a rebuild (${report.suggestedBuildCmd}) or the subprocess backend`;
  } else if (!codexCliPresent) {
    reason = `Docker worker image "${image}" is missing the codex CLI — rebuild with --build-arg INSTALL_CODEX=true or use the subprocess backend`;
  } else if (report.missingCaCerts) {
    reason = `Docker worker image "${image}" lacks ca-certificates — the codex Rust CLI's TLS client fails without the system root CA store; rebuild or use the subprocess backend`;
  }

  return {
    image,
    state: report.state,
    codexCliPresent,
    missingCaCerts: report.missingCaCerts,
    ...(ready ? {} : { backendRequired: 'subprocess' as const, reason: reason as string }),
    suggestedBuildCmd: report.suggestedBuildCmd,
  };
}

// ─── Model-arg evidence (no spawn) ────────────────────────────────────────

export interface CodexModelArgEvidence {
  /** deckent-facing model id, e.g. 'gpt-5'. */
  model: OpenAIModel;
  /** Wire model id actually sent to the CLI (modelRegistry apiId), e.g. 'gpt-5.5'. */
  wireModel: string;
  /** Real `CodexAdapter.buildCommand()` output — proves the --model param mapping. */
  spawnCommand: string;
  /** CODEX_USAGE_EMIT_ARGS — appended at live spawn time; proves the output-format flag. */
  usageEmitArgs: readonly string[];
}

/**
 * Pure, no-spawn evidence of how the real spawn path (`CodexAdapter.spawn()`
 * -> private `buildArgs()`) passes the model param and output-format flag.
 * `buildCommand()` is the public method that mirrors `buildArgs()`'s apiId
 * mapping (see its own doc comment: "same fix as buildArgs") so it is used
 * here as the disk-verifiable proxy instead of reaching into private state.
 */
export function getCodexModelArgEvidence(
  model: OpenAIModel,
  opts?: { projectDir?: string; promptPath?: string },
): CodexModelArgEvidence {
  const adapter = new CodexAdapter(opts?.projectDir ?? process.cwd());
  const promptPath = opts?.promptPath ?? '<prompt-path>';
  const spawnCommand = adapter.buildCommand(model, promptPath);
  const wireModel = modelRegistry.get(model)?.apiId ?? model;
  return { model, wireModel, spawnCommand, usageEmitArgs: CODEX_USAGE_EMIT_ARGS };
}

// ─── Combined report ───────────────────────────────────────────────────────

export interface CodexSpawnReadinessReport {
  host: CodexHostReadiness;
  docker: CodexDockerReadiness;
  /** Mirrors docker.backendRequired — surfaced at top level for callers that only need this. */
  backendRequired?: 'subprocess';
  /** Mirrors docker.reason when backendRequired is set. */
  reason?: string;
  modelArgEvidence: CodexModelArgEvidence[];
}

export interface AssessCodexSpawnReadinessOptions {
  hostSpawnImpl?: SpawnImpl;
  dockerSpawnImpl?: SpawnImpl;
  dockerImage?: string;
  env?: NodeJS.ProcessEnv;
  /** Models to generate arg evidence for — default: the codex premium model (gpt-5). */
  models?: OpenAIModel[];
  projectDir?: string;
}

/**
 * Single suggestion entrypoint for the route/plan side: composes host
 * readiness, docker-image readiness, and model-arg evidence into one report.
 * Never spawns a real codex process and never mutates spawn/route state.
 */
export async function assessCodexSpawnReadiness(
  opts?: AssessCodexSpawnReadinessOptions,
): Promise<CodexSpawnReadinessReport> {
  const models = opts?.models ?? (['gpt-5'] as OpenAIModel[]);

  const [host, docker] = await Promise.all([
    checkCodexHostReadiness({
      ...(opts?.hostSpawnImpl ? { spawnImpl: opts.hostSpawnImpl } : {}),
      ...(opts?.env ? { env: opts.env } : {}),
    }),
    checkCodexDockerReadiness({
      ...(opts?.dockerImage ? { image: opts.dockerImage } : {}),
      ...(opts?.dockerSpawnImpl ? { spawnImpl: opts.dockerSpawnImpl } : {}),
    }),
  ]);

  const modelArgEvidence = models.map((model) =>
    getCodexModelArgEvidence(model, opts?.projectDir ? { projectDir: opts.projectDir } : undefined),
  );

  return {
    host,
    docker,
    ...(docker.backendRequired ? { backendRequired: docker.backendRequired, reason: docker.reason as string } : {}),
    modelArgEvidence,
  };
}
