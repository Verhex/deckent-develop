// tests/orchestra/worker-core-backend-capability.test.ts
// MASTER 3356 — worker-core delivery is a backend capability, not a provider guess.
//
// Externalizing the core REMOVES it from the compiled prompt. Only the docker
// backend builds the provider system-prompt argv that carries it
// (`--system-prompt-file` for claude, `model_instructions_file=` for codex), so
// deciding without the backend strips the worker's execution contract wherever
// docker is not the runner. `spawn_backend: 'auto'` resolves to `subprocess` on
// Windows and on any host whose docker daemon is unreachable, which makes that
// silent loss a live default-path defect rather than a latent one.
//
// These pins are the fail-closed contract: the core leaves the prompt only when
// a delivering backend is named.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import {
  SubprocessBackend,
  TmuxBackend,
  spawnBackendKindDeliversWorkerCore,
  _resetDockerProbeForTests,
} from '../../src/orchestra/spawn-backend.js';
import type { Task } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-core-capability-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  _resetDockerProbeForTests(null);
  vi.restoreAllMocks();
});

function makeTask(backend?: string): Task {
  return {
    id: '3356-core',
    title: 'core delivery',
    description: 'worker core delivery capability',
    type: 'code-development',
    status: TaskStatus.PENDING,
    priority: 'HIGH',
    model: 'claude-opus-4-8',
    effort: 'medium',
    provider: 'claude',
    dependencies: [],
    sprintId: 'sprint-3356',
    scope: { directories: ['src'], filesRead: [], filesWrite: ['src/a.ts'] },
    goNogo: { goCriteria: 'x', noGoCriteria: 'y', techDebtAcceptable: 'none' },
    ...(backend !== undefined ? { backend } : {}),
  } as unknown as Task;
}

const CORE_FLAGS = { prompt: { worker_core_system_prompt: true, codex_core_channel: true } };

/** A phrase the inline core carries and nothing else in the prompt does. */
function hasInlineCore(prompt: string): boolean {
  return /Think Before Coding|Simplicity First|Surgical Changes/i.test(prompt);
}

describe('worker core delivery is gated on backend capability', () => {
  it('keeps the core inline for a backend that cannot deliver it', () => {
    const root = makeRoot();
    const prompt = buildWorkerPrompt(
      makeTask(), undefined, [], root, CORE_FLAGS as never,
      undefined, undefined, 'subprocess',
    );
    expect(hasInlineCore(prompt)).toBe(true);
  });

  it('externalizes the core only for a delivering backend', () => {
    const root = makeRoot();
    const prompt = buildWorkerPrompt(
      makeTask(), undefined, [], root, CORE_FLAGS as never,
      undefined, undefined, 'docker',
    );
    expect(hasInlineCore(prompt)).toBe(false);
  });

  it('fails closed when the backend is unknown to the compiler', () => {
    const root = makeRoot();
    const prompt = buildWorkerPrompt(
      makeTask(), undefined, [], root, CORE_FLAGS as never,
    );
    expect(hasInlineCore(prompt)).toBe(true);
  });

  it('keeps the core inline on tmux, which ignores the system-prompt channel', () => {
    const root = makeRoot();
    const prompt = buildWorkerPrompt(
      makeTask(), undefined, [], root, CORE_FLAGS as never,
      undefined, undefined, 'tmux',
    );
    expect(hasInlineCore(prompt)).toBe(true);
  });

  it('resolves auto through the same probe the spawner uses', () => {
    _resetDockerProbeForTests(true);
    expect(spawnBackendKindDeliversWorkerCore('auto')).toBe(
      process.platform === 'win32' ? false : true,
    );
    // A docker-less host silently falls back to subprocess, so auto must stop
    // delivering the core there — this is the exact live-default defect.
    _resetDockerProbeForTests(false);
    expect(spawnBackendKindDeliversWorkerCore('auto')).toBe(false);
  });

  it('declares the capability on the non-delivering backend instances', () => {
    const root = makeRoot();
    // Instantiated through the same factory the spawner uses. Docker is covered
    // by the pure resolver above rather than here, so the pin never depends on a
    // reachable docker daemon.
    expect(new SubprocessBackend(root).canDeliverWorkerCore).toBe(false);
    expect(new TmuxBackend(root).canDeliverWorkerCore).toBe(false);
  });
});
