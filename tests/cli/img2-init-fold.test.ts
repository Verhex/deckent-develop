// tests/cli/img2-init-fold.test.ts
//
// F1-IMG-2: hermetic tests for init/upgrade fold.
// Tests maybeProvisionDockerImage (init-steps.ts) and
// reprovisionWorkerImageAfterUpgrade (upgrade.ts).
// No real docker, no real filesystem writes outside tmpdir.

import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  maybeProvisionDockerImage,
} from '../../src/cli/commands/init-steps.js';
import {
  reprovisionWorkerImageAfterUpgrade,
} from '../../src/cli/commands/upgrade.js';
import type { SpawnImpl, SpawnedProcessLike } from '../../src/core/worker-image-check.js';

// ─── Docker mock helpers ───────────────────────────────────────────────────────
//
// Pattern mirrors tests/core/worker-image-check.test.ts for consistency.
// Routes by docker sub-command: 'image inspect' vs 'run' vs 'build'.

interface CannedResult {
  code?: number | null;
  stdout?: string;
  stderr?: string;
}

function emitResult(child: EventEmitter, result: CannedResult): void {
  process.nextTick(() => {
    child.emit('close', result.code ?? 0, null);
  });
}

type DockerRoute = 'inspect' | 'run' | 'build';

function routeFor(args: string[]): DockerRoute {
  if (args[0] === 'image') return 'inspect';
  if (args[0] === 'run') return 'run';
  return 'build';
}

/** Probe output for an image that has all known CLIs and ca-certificates. */
const PROBE_OK = 'CLI:claude:ok\nCLI:codex:ok\nCLI:gemini:ok\nCACERTS:ok\n';

interface SpawnRecord {
  calls: Array<{ command: string; args: string[]; route: DockerRoute }>;
}

type InspectBehaviour = 'present' | 'absent';

/**
 * Build a fake SpawnImpl suitable for checkWorkerImage + handleImageBuild.
 *
 * - docker image inspect: exits 0 (present) or 1 (absent) based on `inspect`.
 * - docker run (probe): exits 0 with CACERTS:ok (all CLIs present).
 * - docker build: exits 0.
 *
 * Records all spawn calls for test assertions.
 */
function makeSpawn(inspect: InspectBehaviour, record: SpawnRecord): SpawnImpl {
  return vi.fn<SpawnImpl>((_command, args) => {
    const route = routeFor(args);
    record.calls.push({ command: _command, args, route });

    const child = new EventEmitter() as EventEmitter & SpawnedProcessLike;

    let stdoutContent = '';
    if (route === 'run') stdoutContent = PROBE_OK;

    child.stdout = Readable.from([stdoutContent]);
    child.stderr = Readable.from(['']);

    const exitCode = route === 'inspect' && inspect === 'absent' ? 1 : 0;
    emitResult(child, { code: exitCode });

    return child;
  });
}

function emptyRecord(): SpawnRecord {
  return { calls: [] };
}

/** Create a temp dir with a .deckent/config.json containing the given config. */
function withConfig(config: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'img2-test-'));
  const deckentDir = join(root, '.deckent');
  mkdirSync(deckentDir, { recursive: true });
  writeFileSync(join(deckentDir, 'config.json'), JSON.stringify(config, null, 2));
  return root;
}

const roots: string[] = [];
function track(root: string): string {
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const r of roots.splice(0)) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── maybeProvisionDockerImage ────────────────────────────────────────────────

describe('maybeProvisionDockerImage — non-docker backend', () => {
  it('returns undefined without spawning anything when spawn_backend is subprocess', async () => {
    const root = track(withConfig({ spawn_backend: 'subprocess', worker_provider: 'claude' }));
    const rec = emptyRecord();
    const result = await maybeProvisionDockerImage(root, { spawnImpl: makeSpawn('absent', rec) });
    expect(result).toBeUndefined();
    expect(rec.calls).toHaveLength(0);
  });

  it('returns undefined without spawning when config file is absent', async () => {
    const root = track(mkdtempSync(join(tmpdir(), 'img2-noconfig-')));
    const rec = emptyRecord();
    const result = await maybeProvisionDockerImage(root, { spawnImpl: makeSpawn('absent', rec) });
    expect(result).toBeUndefined();
    expect(rec.calls).toHaveLength(0);
  });
});

describe('maybeProvisionDockerImage — docker backend, image present', () => {
  it('returns undefined and does NOT build when image is already ready', async () => {
    const root = track(withConfig({ spawn_backend: 'docker', worker_provider: 'claude' }));
    const rec = emptyRecord();
    const result = await maybeProvisionDockerImage(root, { spawnImpl: makeSpawn('present', rec) });
    expect(result).toBeUndefined();
    const buildCalls = rec.calls.filter(c => c.route === 'build');
    expect(buildCalls).toHaveLength(0);
  });
});

describe('maybeProvisionDockerImage — docker backend, image missing', () => {
  it('calls handleImageBuild (spawns docker build) when image is absent', async () => {
    const root = track(withConfig({ spawn_backend: 'docker', worker_provider: 'claude' }));
    const rec = emptyRecord();
    const result = await maybeProvisionDockerImage(root, { spawnImpl: makeSpawn('absent', rec) });

    const buildCalls = rec.calls.filter(c => c.route === 'build');
    expect(buildCalls.length).toBeGreaterThanOrEqual(1);
    expect(result).toBe(0);
  });

  it('passes the custom image tag to docker build when worker_image is configured', async () => {
    const root = track(withConfig({
      spawn_backend: 'docker',
      worker_provider: 'claude',
      worker_image: 'my-worker:v3',
    }));
    const rec = emptyRecord();
    await maybeProvisionDockerImage(root, { spawnImpl: makeSpawn('absent', rec) });

    const buildCall = rec.calls.find(c => c.route === 'build');
    expect(buildCall).toBeDefined();
    expect(buildCall!.args.join(' ')).toContain('my-worker:v3');
  });
});

// ─── reprovisionWorkerImageAfterUpgrade ──────────────────────────────────────

describe('reprovisionWorkerImageAfterUpgrade — non-docker backend', () => {
  it('returns undefined and spawns nothing when spawn_backend is not docker', async () => {
    const root = track(withConfig({ spawn_backend: 'subprocess', worker_provider: 'claude' }));
    const rec = emptyRecord();
    const result = await reprovisionWorkerImageAfterUpgrade(root, { spawnImpl: makeSpawn('absent', rec) });
    expect(result).toBeUndefined();
    expect(rec.calls).toHaveLength(0);
  });

  it('returns undefined when config file is absent', async () => {
    const root = track(mkdtempSync(join(tmpdir(), 'img2-upgrade-noconfig-')));
    const rec = emptyRecord();
    const result = await reprovisionWorkerImageAfterUpgrade(root, { spawnImpl: makeSpawn('absent', rec) });
    expect(result).toBeUndefined();
    expect(rec.calls).toHaveLength(0);
  });
});

describe('reprovisionWorkerImageAfterUpgrade — docker backend, image present', () => {
  it('returns undefined without building when image is still ready after upgrade', async () => {
    const root = track(withConfig({ spawn_backend: 'docker', worker_provider: 'claude' }));
    const rec = emptyRecord();
    const result = await reprovisionWorkerImageAfterUpgrade(root, { spawnImpl: makeSpawn('present', rec) });
    expect(result).toBeUndefined();
    const buildCalls = rec.calls.filter(c => c.route === 'build');
    expect(buildCalls).toHaveLength(0);
  });
});

describe('reprovisionWorkerImageAfterUpgrade — docker backend, image stale/missing (provider changed)', () => {
  it('calls handleImageBuild to re-provision when image is missing after upgrade', async () => {
    const root = track(withConfig({
      spawn_backend: 'docker',
      worker_provider: 'claude',
      brain_provider: 'claude',
    }));
    const rec = emptyRecord();
    const result = await reprovisionWorkerImageAfterUpgrade(root, { spawnImpl: makeSpawn('absent', rec) });

    const buildCalls = rec.calls.filter(c => c.route === 'build');
    expect(buildCalls.length).toBeGreaterThanOrEqual(1);
    expect(result).toBe(0);
  });

  it('includes codex build-arg when worker_provider is codex', async () => {
    const root = track(withConfig({
      spawn_backend: 'docker',
      worker_provider: 'codex',
      brain_provider: 'claude',
    }));
    const rec = emptyRecord();
    await reprovisionWorkerImageAfterUpgrade(root, { spawnImpl: makeSpawn('absent', rec) });

    const buildCall = rec.calls.find(c => c.route === 'build');
    expect(buildCall).toBeDefined();
    expect(buildCall!.args.join(' ')).toContain('INSTALL_CODEX=true');
  });
});
