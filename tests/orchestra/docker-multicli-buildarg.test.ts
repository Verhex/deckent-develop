// ─── F1-005 (Sprint 332): Dockerfile.worker multi-CLI build-arg threading ───
//
// F1-005 ships the spawn-side half of the multi-CLI worker image: thread the
// per-worker provider so the build/image selection surfaces the RIGHT
// `--build-arg` (codex/gemini are opt-in CLIs in Dockerfile.worker; claude is the
// lean default), and honest-fail when the requested provider's CLI is not in the
// image — never a silent claude fallback (Yasa #2 + the ADR-076 auth-precedence
// lesson).
//
// The Dockerfile ARG blocks themselves shipped in F1-DF (331-005); this task does
// NOT touch Dockerfile.worker — it is verified read-only here (single-CLI image
// unchanged, default-off).
//
// Hermetic: docker build/run is exercised through the existing injected spawnSync
// seam (mocked). No real image is built or run. The Dockerfile parse check reads
// the committed Dockerfile.worker via vi.importActual (bypasses the node:fs mock)
// and resolves it relative to THIS file (import.meta.url) — never process.cwd().

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

// ─── Mocks (mirror spawn-backend-docker.test.ts) ────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => {
    const stub = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  openSync: vi.fn(() => 0),
  fsyncSync: vi.fn(),
  closeSync: vi.fn(),
  renameSync: vi.fn(),
  rmdirSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/file-lock.js', () => ({
  acquireSpawnLocks: vi.fn(),
  releaseAllSpawnLocks: vi.fn(() => 0),
  releaseStaleSpawnLocksForTask: vi.fn(() => 0),
  SpawnLockError: class extends Error {},
}));

vi.mock('../../src/core/active-workers.js', () => ({
  markPending: vi.fn(),
  markActive: vi.fn(),
  clearPending: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import {
  DockerSpawnBackend,
  workerImageBuildCmdForProvider,
} from '../../src/orchestra/spawn-backend-docker.js';

const mockSpawnSync = vi.mocked(spawnSync);

// ─── Spawn-seam router (mirrors spawn-backend-docker.test.ts) ────────────────

interface SpawnSyncOutcome {
  stdout: string;
  stderr: string;
  status: number;
}

/** Every `docker run` argv captured during a spawn() — proves the worker run path. */
const capturedDockerRunArgs: string[][] = [];
/** Every `docker build` argv captured during a spawn() — proves auto-build (must stay empty: we honest-fail, never auto-build). */
const capturedDockerBuildArgs: string[][] = [];

/**
 * @param imagePresent  `docker images -q` returns a hash (true) or empty (false).
 *                      Empty triggers the F1-005 provider-aware image-not-ready honest-fail.
 */
function installSpawnRouter(imagePresent: boolean): void {
  capturedDockerRunArgs.length = 0;
  capturedDockerBuildArgs.length = 0;
  const fallback: SpawnSyncOutcome = { stdout: '', stderr: '', status: 0 };

  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];

    let outcome: SpawnSyncOutcome = fallback;
    if (cmd === 'sleep') {
      outcome = fallback;
    } else if (cmd === 'docker' && sub === 'images') {
      outcome = { stdout: imagePresent ? 'imghash' : '', stderr: '', status: 0 };
    } else if (cmd === 'docker' && sub === 'build') {
      capturedDockerBuildArgs.push([...argv]);
      outcome = { stdout: 'built', stderr: '', status: 0 };
    } else if (cmd === 'docker' && sub === 'run') {
      capturedDockerRunArgs.push([...argv]);
      outcome = { stdout: 'container-id-x', stderr: '', status: 0 };
    } else if (cmd === 'docker' && sub === 'inspect') {
      outcome = { stdout: 'true|0', stderr: '', status: 0 };
    } else if (cmd === 'claude' && sub === '--version') {
      outcome = { stdout: 'claude 1.0.0 (host auth ok)', stderr: '', status: 0 };
    }

    return {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      status: outcome.status,
      signal: null,
      pid: 1,
      output: ['', outcome.stdout, outcome.stderr],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

/** Run spawn() and return the thrown error message (or '' if it did not throw). */
function spawnExpectMessage(taskId: string, model: string): string {
  try {
    new DockerSpawnBackend('/test/project').spawn(taskId, model as never, 'prompt-body');
    return '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// ─── 1) Pure build-arg threading helper ─────────────────────────────────────
// goCriteria: the assembled docker build invocation passes the correct
// --build-arg for codex/gemini and NONE (default image) for claude.

describe('workerImageBuildCmdForProvider — provider → build-arg threading (F1-005)', () => {
  const IMG = 'deckent-worker:latest';

  it('codex → assembles `--build-arg INSTALL_CODEX=true` against Dockerfile.worker', () => {
    const cmd = workerImageBuildCmdForProvider(IMG, 'codex');
    expect(cmd).toContain('--build-arg INSTALL_CODEX=true');
    expect(cmd).toContain('-f Dockerfile.worker');
    expect(cmd).toContain(`-t ${IMG}`);
    expect(cmd).not.toContain('INSTALL_GEMINI'); // only the requested provider's CLI
  });

  it('gemini → assembles `--build-arg INSTALL_GEMINI=true`', () => {
    const cmd = workerImageBuildCmdForProvider(IMG, 'gemini');
    expect(cmd).toContain('--build-arg INSTALL_GEMINI=true');
    expect(cmd).not.toContain('INSTALL_CODEX');
  });

  it('claude → NONE (default lean image): no `--build-arg`, still targets the image', () => {
    const cmd = workerImageBuildCmdForProvider(IMG, 'claude');
    expect(cmd).not.toContain('--build-arg');
    expect(cmd).toContain('-f Dockerfile.worker');
    expect(cmd).toContain(`-t ${IMG}`);
  });

  it('host-only / unknown provider (e.g. ollama) → lean image, no `--build-arg`', () => {
    // ollama never reaches the docker backend (honest-fail earlier); if it did it
    // must NOT trigger a codex/gemini build-arg.
    expect(workerImageBuildCmdForProvider(IMG, 'ollama')).not.toContain('--build-arg');
  });

  it('honors a custom image tag (multi-tenant / private registry)', () => {
    const cmd = workerImageBuildCmdForProvider('myorg/deckent-worker:v2', 'codex');
    expect(cmd).toContain('--build-arg INSTALL_CODEX=true');
    expect(cmd).toContain('-t myorg/deckent-worker:v2');
  });
});

// ─── 2) Spawn-side honest-fail: requested provider absent from the image ─────
// goCriteria: a requested provider absent from the image → honest error carrying
// the right --build-arg, NO silent claude fallback. Exercised through the injected
// spawnSync seam (docker images -q returns empty).

describe('DockerSpawnBackend: provider-aware image-not-ready honest-fail (F1-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter(/* imagePresent */ false);
  });

  it('codex worker, image absent → throws honest error with `--build-arg INSTALL_CODEX=true`', () => {
    const msg = spawnExpectMessage('mc-codex', 'gpt-5');
    expect(msg).toMatch(/not ready for provider 'codex'/);
    expect(msg).toContain('--build-arg INSTALL_CODEX=true');
  });

  it('codex honest-fail does NOT silently fall back to a claude container (no docker run)', () => {
    spawnExpectMessage('mc-codex-nofallback', 'gpt-5');
    // Never spawned a worker container, and never auto-built — honest-fail only.
    expect(capturedDockerRunArgs.length).toBe(0);
    expect(capturedDockerBuildArgs.length).toBe(0);
  });

  it('gemini worker, image absent → throws honest error with `--build-arg INSTALL_GEMINI=true`', () => {
    const msg = spawnExpectMessage('mc-gemini', 'gemini-2.5-flash');
    expect(msg).toMatch(/not ready for provider 'gemini'/);
    expect(msg).toContain('--build-arg INSTALL_GEMINI=true');
  });

  it('claude worker, image absent → throws WITHOUT any `--build-arg` (NONE / default image)', () => {
    const msg = spawnExpectMessage('mc-claude', 'sonnet');
    expect(msg).toMatch(/not ready for provider 'claude'/);
    expect(msg).not.toContain('--build-arg');
    expect(msg).toContain('-f Dockerfile.worker');
  });
});

// ─── 3) Claude worker with a ready image still uses the lean default image ───
// goCriteria sentinel: a claude worker passes NONE (default image) — it proceeds
// straight to docker run with no build-arg threading and no docker build.

describe('DockerSpawnBackend: claude worker uses the default image unchanged (F1-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter(/* imagePresent */ true);
  });

  it('image present → claude worker runs the default image with NO `--build-arg` and NO docker build', () => {
    new DockerSpawnBackend('/test/project').spawn('mc-claude-ok', 'sonnet' as never, 'prompt-body');
    expect(capturedDockerRunArgs.length).toBe(1);
    expect(capturedDockerBuildArgs.length).toBe(0);
    const argv = capturedDockerRunArgs[0]!;
    expect(argv.some((a) => a.includes('--build-arg'))).toBe(false);
    expect(argv).toContain('deckent-worker:latest');
  });
});

// ─── 4) Dockerfile.worker parses with the new ARG blocks, default-off ────────
// goCriteria: Dockerfile.worker parses with the new ARG blocks default-off
// (single-CLI image unchanged). Read-only verification of the committed file
// (shipped by F1-DF / 331-005; not in this task's write scope).

describe('Dockerfile.worker — multi-CLI ARG blocks default-off (F1-DF, verified)', () => {
  async function readDockerfileWorker(): Promise<string> {
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const path = await vi.importActual<typeof import('node:path')>('node:path');
    const url = await vi.importActual<typeof import('node:url')>('node:url');
    // Resolve relative to THIS test file, not process.cwd() — hermetic on any checkout.
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const dockerfilePath = path.resolve(here, '../../Dockerfile.worker');
    return fs.readFileSync(dockerfilePath, 'utf-8');
  }

  it('declares INSTALL_CODEX / INSTALL_GEMINI ARGs defaulting to false (lean single-CLI image)', async () => {
    const df = await readDockerfileWorker();
    expect(df).toMatch(/ARG\s+INSTALL_CODEX=false/);
    expect(df).toMatch(/ARG\s+INSTALL_GEMINI=false/);
  });

  it('opt-in RUN guards install the provider CLIs only when the build-arg is true', async () => {
    const df = await readDockerfileWorker();
    expect(df).toMatch(/if\s*\[\s*"\$INSTALL_CODEX"\s*=\s*"true"\s*\];?\s*then\s+npm i -g @openai\/codex/);
    expect(df).toMatch(/if\s*\[\s*"\$INSTALL_GEMINI"\s*=\s*"true"\s*\];?\s*then\s+npm i -g @google\/gemini-cli/);
  });

  it('claude CLI stays unconditionally baked in (always-present default)', async () => {
    const df = await readDockerfileWorker();
    expect(df).toMatch(/npm i -g @anthropic-ai\/claude-code/);
  });

  it('keeps ca-certificates in the base (codex Rust CLI TLS uses the system root store)', async () => {
    const df = await readDockerfileWorker();
    expect(df).toContain('ca-certificates');
  });
});
