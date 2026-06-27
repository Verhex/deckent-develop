// tests/cli/init-image-integration.test.ts
//
// F1-IMG-2 (Task 333-009): hermetic tests for the `deckent init` opt-in
// worker-image build offer (maybeOfferWorkerImageBuild in init.ts).
//
// Fully hermetic: docker-present/absent + image-present/absent + the build
// delegate (handleImageBuild) are all INJECTED seams. No real docker is ever
// spawned; config is read from a tmpdir. Asserts the onboarding offer:
//   - never auto-builds without opt-in,
//   - honest-skips (init continues) when docker is absent,
//   - respects non-interactive / --yes / --no-image (no prompt, no build),
//   - delegates to handleImageBuild with the resolved tag + provider build-args.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  maybeOfferWorkerImageBuild,
  type WorkerImageOfferSeams,
} from '../../src/cli/commands/init.js';
import type { ImageBuildOptions } from '../../src/cli/commands/image.js';

// ─── tmpdir fixtures ─────────────────────────────────────────────────────────

const roots: string[] = [];
function track(root: string): string {
  roots.push(root);
  return root;
}

/** Tmpdir with .deckent/config.json holding the given config (or no config). */
function withConfig(config?: Record<string, unknown>): string {
  const root = track(mkdtempSync(join(tmpdir(), 'img2-init-')));
  if (config) {
    const deckentDir = join(root, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    writeFileSync(join(deckentDir, 'config.json'), JSON.stringify(config, null, 2));
  }
  return root;
}

afterEach(() => {
  for (const r of roots.splice(0)) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  vi.restoreAllMocks();
});

// ─── Seam factory ────────────────────────────────────────────────────────────

interface SeamSpies {
  seams: WorkerImageOfferSeams;
  isDockerAvailable: ReturnType<typeof vi.fn>;
  isWorkerImagePresent: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  buildImage: ReturnType<typeof vi.fn>;
  buildCalls: ImageBuildOptions[];
}

function makeSeams(opts: {
  dockerAvailable: boolean;
  imagePresent: boolean;
  confirm: boolean;
  buildExitCode?: number;
}): SeamSpies {
  const buildCalls: ImageBuildOptions[] = [];
  const isDockerAvailable = vi.fn(async () => opts.dockerAvailable);
  const isWorkerImagePresent = vi.fn(async () => opts.imagePresent);
  const confirm = vi.fn(async () => opts.confirm);
  const buildImage = vi.fn(async (o: ImageBuildOptions) => {
    buildCalls.push(o);
    return opts.buildExitCode ?? 0;
  });
  return {
    seams: { isDockerAvailable, isWorkerImagePresent, confirm, buildImage },
    isDockerAvailable,
    isWorkerImagePresent,
    confirm,
    buildImage,
    buildCalls,
  };
}

// ─── opt-out paths: no prompt, no build ──────────────────────────────────────

describe('maybeOfferWorkerImageBuild — opt-out paths never prompt or build', () => {
  it('--no-image → opted-out, nothing probed/built', async () => {
    const root = withConfig({ worker_provider: 'claude' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: true });
    const outcome = await maybeOfferWorkerImageBuild(root, { noImage: true }, s.seams);
    expect(outcome).toBe('opted-out');
    expect(s.isDockerAvailable).not.toHaveBeenCalled();
    expect(s.confirm).not.toHaveBeenCalled();
    expect(s.buildImage).not.toHaveBeenCalled();
  });

  it('non-interactive (no TTY / CI) → opted-out, no build', async () => {
    const root = withConfig({ worker_provider: 'claude' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: true });
    const outcome = await maybeOfferWorkerImageBuild(root, { nonInteractive: true }, s.seams);
    expect(outcome).toBe('opted-out');
    expect(s.buildImage).not.toHaveBeenCalled();
  });

  it('--yes (CI auto flag) → opted-out, never auto-builds', async () => {
    const root = withConfig({ worker_provider: 'claude' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: true });
    const outcome = await maybeOfferWorkerImageBuild(root, { yes: true }, s.seams);
    expect(outcome).toBe('opted-out');
    expect(s.buildImage).not.toHaveBeenCalled();
  });
});

// ─── docker absent: honest skip, init continues ──────────────────────────────

describe('maybeOfferWorkerImageBuild — docker absent', () => {
  it('honest-skips with an actionable message and never builds', async () => {
    const root = withConfig({ worker_provider: 'claude' });
    const s = makeSeams({ dockerAvailable: false, imagePresent: false, confirm: true });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const outcome = await maybeOfferWorkerImageBuild(root, {}, s.seams);

    expect(outcome).toBe('docker-absent');
    expect(s.buildImage).not.toHaveBeenCalled();
    expect(s.confirm).not.toHaveBeenCalled();
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(printed).toContain('Docker not found');
    expect(printed).toContain('deckent image build');
  });
});

// ─── image already present: silent skip ──────────────────────────────────────

describe('maybeOfferWorkerImageBuild — image already present', () => {
  it('returns image-present and does not prompt or build', async () => {
    const root = withConfig({ worker_provider: 'claude' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: true, confirm: true });
    const outcome = await maybeOfferWorkerImageBuild(root, {}, s.seams);
    expect(outcome).toBe('image-present');
    expect(s.confirm).not.toHaveBeenCalled();
    expect(s.buildImage).not.toHaveBeenCalled();
  });
});

// ─── docker present + image absent: the opt-in build path ────────────────────

describe('maybeOfferWorkerImageBuild — docker present, image absent, opt-in', () => {
  it('confirm → delegates to handleImageBuild with the resolved (config) tag', async () => {
    const root = withConfig({ worker_provider: 'claude', worker_image: 'deckent-worker:test' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: true });

    const outcome = await maybeOfferWorkerImageBuild(root, {}, s.seams);

    expect(outcome).toBe('built');
    expect(s.confirm).toHaveBeenCalledTimes(1);
    expect(s.buildImage).toHaveBeenCalledTimes(1);
    expect(s.buildCalls[0]?.tag).toBe('deckent-worker:test');
  });

  it('falls back to DEFAULT_WORKER_IMAGE tag when no worker_image configured', async () => {
    const root = withConfig({ worker_provider: 'claude' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: true });
    await maybeOfferWorkerImageBuild(root, {}, s.seams);
    expect(s.buildCalls[0]?.tag).toBe('deckent-worker:latest');
  });

  it('derives codex/gemini build-args from the project config', async () => {
    const root = withConfig({ worker_provider: 'codex', brain_provider: 'gemini' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: true });
    await maybeOfferWorkerImageBuild(root, {}, s.seams);
    expect(s.buildCalls[0]?.withCodex).toBe(true);
    expect(s.buildCalls[0]?.withGemini).toBe(true);
  });

  it('explicit image override wins over config', async () => {
    const root = withConfig({ worker_provider: 'claude', worker_image: 'from-config:1' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: true });
    await maybeOfferWorkerImageBuild(root, { image: 'override:9' }, s.seams);
    expect(s.buildCalls[0]?.tag).toBe('override:9');
  });

  it('decline → no build, returns declined', async () => {
    const root = withConfig({ worker_provider: 'claude' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: false });
    const outcome = await maybeOfferWorkerImageBuild(root, {}, s.seams);
    expect(outcome).toBe('declined');
    expect(s.buildImage).not.toHaveBeenCalled();
  });

  it('build failure (non-zero exit) → build-failed', async () => {
    const root = withConfig({ worker_provider: 'claude' });
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: true, buildExitCode: 1 });
    const outcome = await maybeOfferWorkerImageBuild(root, {}, s.seams);
    expect(outcome).toBe('build-failed');
    expect(s.buildImage).toHaveBeenCalledTimes(1);
  });

  it('works with no config file at all (defaults, claude-only build-args)', async () => {
    const root = withConfig(); // no .deckent/config.json
    const s = makeSeams({ dockerAvailable: true, imagePresent: false, confirm: true });
    const outcome = await maybeOfferWorkerImageBuild(root, {}, s.seams);
    expect(outcome).toBe('built');
    expect(s.buildCalls[0]?.tag).toBe('deckent-worker:latest');
    expect(s.buildCalls[0]?.withCodex).toBe(false);
    expect(s.buildCalls[0]?.withGemini).toBe(false);
  });
});
