// tests/cli/image-build.test.ts
//
// F1-IMG-2: hermetic tests for `deckent image build`.
//
// Every test injects a fake SpawnImpl (no real docker) and a tmpdir package
// root containing a fake assets/Dockerfile.worker (no dependency on the real
// repo layout, no process.cwd() reliance). Covers:
//   - `--dry-run` resolves the packaged Dockerfile path + prints the plan,
//     NEVER spawning docker.
//   - the real build invokes the seam with `--tag` and the resolved `-f` path.
//   - docker absent (spawn ENOENT) → honest, actionable, non-zero (no silent 0).
//   - packaged Dockerfile missing → honest-fail, non-zero, no spawn.
//   - provider flags → INSTALL_* build-args; default tag = deckent-worker:latest.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { handleImageBuild } from '../../src/cli/commands/image.js';
import { DEFAULT_WORKER_IMAGE } from '../../src/core/worker-image-check.js';
import type { SpawnImpl, SpawnedProcessLike } from '../../src/core/worker-image-check.js';

// ─── Spawn seam fakes ───────────────────────────────────────────────────────────

interface SpawnRecord {
  calls: Array<{ command: string; args: string[] }>;
}

function emptyRecord(): SpawnRecord {
  return { calls: [] };
}

function fakeChild(register: (listeners: Record<string, (...a: unknown[]) => void>) => void): SpawnedProcessLike {
  const listeners: Record<string, (...a: unknown[]) => void> = {};
  const child: SpawnedProcessLike = {
    stdout: null,
    stderr: null,
    on(event: string, listener: (...a: unknown[]) => void) {
      listeners[event] = listener;
      return child;
    },
  };
  register(listeners);
  return child;
}

/** Spawn that records the call and resolves with the given exit code. */
function closeSpawn(exitCode: number, rec: SpawnRecord): SpawnImpl {
  return (command: string, args: string[]): SpawnedProcessLike => {
    rec.calls.push({ command, args });
    return fakeChild((listeners) => {
      queueMicrotask(() => listeners['close']?.(exitCode, null));
    });
  };
}

/** Spawn that records the call and fires an 'error' (docker binary absent). */
function errorSpawn(err: Error, rec: SpawnRecord): SpawnImpl {
  return (command: string, args: string[]): SpawnedProcessLike => {
    rec.calls.push({ command, args });
    return fakeChild((listeners) => {
      queueMicrotask(() => listeners['error']?.(err));
    });
  };
}

function enoent(): NodeJS.ErrnoException {
  const e = new Error('spawn docker ENOENT') as NodeJS.ErrnoException;
  e.code = 'ENOENT';
  return e;
}

// ─── tmpdir package-root fixtures ────────────────────────────────────────────────

const roots: string[] = [];

/** Create a tmpdir package root WITH a fake assets/Dockerfile.worker. */
function rootWithDockerfile(): string {
  const root = mkdtempSync(join(tmpdir(), 'img-build-'));
  const assets = join(root, 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'Dockerfile.worker'), 'FROM node:24-trixie-slim\n');
  roots.push(root);
  return root;
}

/** Create an EMPTY tmpdir package root (no Dockerfile anywhere). */
function rootWithoutDockerfile(): string {
  const root = mkdtempSync(join(tmpdir(), 'img-build-empty-'));
  roots.push(root);
  return root;
}

// ─── stdout/stderr capture ───────────────────────────────────────────────────────

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── Tests: --dry-run ─────────────────────────────────────────────────────────────

describe('handleImageBuild — --dry-run', () => {
  it('resolves the packaged assets/Dockerfile.worker path and prints the build plan WITHOUT spawning', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    const code = await handleImageBuild({ dryRun: true, root }, closeSpawn(0, rec));

    expect(code).toBe(0);
    expect(rec.calls).toHaveLength(0); // no docker spawn in dry-run

    const out = stdout.join('');
    const expectedDockerfile = join(root, 'assets', 'Dockerfile.worker');
    expect(out).toContain(expectedDockerfile);      // resolved Dockerfile path
    expect(out).toContain('docker build');          // planned build command
    expect(out).toContain('-f');
    expect(out).toContain(DEFAULT_WORKER_IMAGE);     // image tag
  });

  it('dry-run echoes a custom --tag in both the plan and the tag line', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    const code = await handleImageBuild({ dryRun: true, tag: 'acme/worker:9', root }, closeSpawn(0, rec));

    expect(code).toBe(0);
    expect(rec.calls).toHaveLength(0);
    expect(stdout.join('')).toContain('acme/worker:9');
  });

  it('dry-run does NOT use process.cwd() — the resolved path is rooted at the injected package root', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    await handleImageBuild({ dryRun: true, root }, closeSpawn(0, rec));

    const out = stdout.join('');
    // Path is anchored under the injected root, never the test runner's cwd.
    expect(out).toContain(root);
    expect(out).not.toContain(`${process.cwd()}/Dockerfile.worker`);
  });
});

// ─── Tests: real build via the injected seam ──────────────────────────────────────

describe('handleImageBuild — real build (injected seam)', () => {
  it('invokes docker build with the resolved -f Dockerfile path and the --tag', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    const code = await handleImageBuild({ tag: 'my-worker:v9', root }, closeSpawn(0, rec));

    expect(code).toBe(0);
    expect(rec.calls).toHaveLength(1);

    const { command, args } = rec.calls[0]!;
    expect(command).toBe('docker');
    expect(args[0]).toBe('build');

    const fIdx = args.indexOf('-f');
    expect(fIdx).toBeGreaterThan(-1);
    expect(args[fIdx + 1]).toBe(join(root, 'assets', 'Dockerfile.worker'));

    const tIdx = args.indexOf('-t');
    expect(tIdx).toBeGreaterThan(-1);
    expect(args[tIdx + 1]).toBe('my-worker:v9');
  });

  it('uses the Dockerfile directory (assets) as the build context — never cwd', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    await handleImageBuild({ root }, closeSpawn(0, rec));

    const { args } = rec.calls[0]!;
    const context = args[args.length - 1]; // context is the final positional arg
    expect(context).toBe(dirname(join(root, 'assets', 'Dockerfile.worker')));
    expect(context).toBe(join(root, 'assets'));
  });

  it('defaults the tag to deckent-worker:latest when none is given', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    await handleImageBuild({ root }, closeSpawn(0, rec));

    expect(rec.calls[0]!.args.join(' ')).toContain(DEFAULT_WORKER_IMAGE);
  });

  it('--image is a back-compat alias for --tag (upgrade/init callers)', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    await handleImageBuild({ image: 'legacy:tag', root }, closeSpawn(0, rec));

    expect(rec.calls[0]!.args.join(' ')).toContain('legacy:tag');
  });

  it('--tag wins over the deprecated --image alias', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    await handleImageBuild({ tag: 'win:1', image: 'lose:2', root }, closeSpawn(0, rec));

    const joined = rec.calls[0]!.args.join(' ');
    expect(joined).toContain('win:1');
    expect(joined).not.toContain('lose:2');
  });

  it('a non-zero docker exit is propagated (build failure)', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    const code = await handleImageBuild({ root }, closeSpawn(1, rec));

    expect(code).toBe(1);
  });
});

// ─── Tests: provider build-args ───────────────────────────────────────────────────

describe('handleImageBuild — provider build-args', () => {
  it('--with-codex / --with-gemini / --with-ollama add their INSTALL_* build-args', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    await handleImageBuild(
      { withCodex: true, withGemini: true, withOllama: true, root },
      closeSpawn(0, rec),
    );

    const joined = rec.calls[0]!.args.join(' ');
    expect(joined).toContain('INSTALL_CODEX=true');
    expect(joined).toContain('INSTALL_GEMINI=true');
    expect(joined).toContain('INSTALL_OLLAMA=true');
  });

  it('no provider flags → no INSTALL_* build-args', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    await handleImageBuild({ root }, closeSpawn(0, rec));

    const joined = rec.calls[0]!.args.join(' ');
    expect(joined).not.toContain('INSTALL_CODEX');
    expect(joined).not.toContain('INSTALL_GEMINI');
    expect(joined).not.toContain('INSTALL_OLLAMA');
  });
});

// ─── Tests: honest-fail paths ─────────────────────────────────────────────────────

describe('handleImageBuild — honest-fail when docker is unavailable', () => {
  it('docker absent (ENOENT) → non-zero exit and an actionable stderr message (never a silent 0)', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    const code = await handleImageBuild({ root }, errorSpawn(enoent(), rec));

    expect(code).not.toBe(0);
    const err = stderr.join('');
    expect(err.toLowerCase()).toContain('docker');
    expect(err.toLowerCase()).toMatch(/not found|path/); // actionable hint
  });

  it('a generic spawn launch error is also surfaced (non-zero, no silent success)', async () => {
    const root = rootWithDockerfile();
    const rec = emptyRecord();

    const code = await handleImageBuild({ root }, errorSpawn(new Error('boom'), rec));

    expect(code).not.toBe(0);
    expect(stderr.join('').toLowerCase()).toContain('docker');
  });
});

describe('handleImageBuild — honest-fail when the packaged Dockerfile is missing', () => {
  it('missing Dockerfile → non-zero, actionable message, and NO docker spawn', async () => {
    const root = rootWithoutDockerfile();
    const rec = emptyRecord();

    const code = await handleImageBuild({ root }, closeSpawn(0, rec));

    expect(code).not.toBe(0);
    expect(rec.calls).toHaveLength(0); // never tried to build
    expect(stderr.join('')).toContain('Dockerfile.worker');
  });

  it('dry-run on a missing Dockerfile still prints the resolved path, flagged NOT FOUND', async () => {
    const root = rootWithoutDockerfile();
    const rec = emptyRecord();

    const code = await handleImageBuild({ dryRun: true, root }, closeSpawn(0, rec));

    // dry-run never spawns; it reports the expected (canonical) path honestly.
    expect(code).toBe(0);
    expect(rec.calls).toHaveLength(0);
    const out = stdout.join('');
    expect(out).toContain(join(root, 'assets', 'Dockerfile.worker'));
    expect(out).toContain('NOT FOUND');
  });
});
