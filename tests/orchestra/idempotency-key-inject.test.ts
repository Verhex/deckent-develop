// ─── IDEMPOTENCY_KEY Worker Prompt Inject Tests ─────────────────────────────
// Sprint 156 — Task 156-006
//
// Verifies two coupled behaviors:
//   1. DockerSpawnBackend.spawn() injects IDEMPOTENCY_KEY=<16-hex> env var
//      into the docker run argument list.
//   2. buildTaskPrompt() emits a "## Idempotency Key" header containing the
//      literal ${IDEMPOTENCY_KEY} shell placeholder + usage directive so the
//      worker can read the env var at runtime.
//
// Together these ensure: spawn-time the env is set, prompt-time the worker is
// told how to use it (Idempotency-Key header on external API calls).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Capture spawnSync invocations to inspect docker run args ─────────────

interface SpawnSyncCall { cmd: string; args: string[] }
const spawnSyncCalls: SpawnSyncCall[] = [];

vi.mock('node:child_process', () => {
  return {
    spawnSync: vi.fn((cmd: string, args: string[]) => {
      spawnSyncCalls.push({ cmd, args });
      // docker images -q <image> → return non-empty stdout so guard passes
      if (args[0] === 'images') {
        return { status: 0, stdout: 'sha256:abc123', stderr: '' };
      }
      // docker run -d → return container id
      if (args[0] === 'run') {
        return { status: 0, stdout: 'container-id-abcdef\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }),
    // monitorContainer uses node-spawn(); stub a minimal child shape so it
    // doesn't throw when wiring stdout/error listeners.
    spawn: vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    })),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────

import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import { buildTaskPrompt, type SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';

// ─── Test scaffolding ─────────────────────────────────────────────────────

let projectDir: string;

beforeEach(() => {
  spawnSyncCalls.length = 0;
  projectDir = mkdtempSync(join(tmpdir(), 'deckent-idempotency-test-'));
});

afterEach(() => {
  if (projectDir && existsSync(projectDir)) {
    try { rmSync(projectDir, { recursive: true, force: true }); } catch { /* ok */ }
  }
});

// ─── 1. spawn-backend-docker: IDEMPOTENCY_KEY env injection ───────────────

describe('DockerSpawnBackend — IDEMPOTENCY_KEY env injection', () => {
  it('injects IDEMPOTENCY_KEY=<16-hex> env var into docker run args', () => {
    const backend = new DockerSpawnBackend(projectDir, { timeoutSeconds: 600 });
    backend.spawn('test-001', 'sonnet', 'prompt body');

    // Locate the `docker run` invocation in captured calls
    const runCall = spawnSyncCalls.find(
      c => c.cmd === 'docker' && c.args[0] === 'run',
    );
    expect(runCall, 'docker run call must be present').toBeDefined();

    // Find the IDEMPOTENCY_KEY env entry — it's pushed as ['-e', 'IDEMPOTENCY_KEY=<hex>']
    const envEntry = runCall!.args.find(
      a => typeof a === 'string' && a.startsWith('IDEMPOTENCY_KEY='),
    );
    expect(envEntry, 'IDEMPOTENCY_KEY=... env arg must be present').toBeDefined();

    // Format check: IDEMPOTENCY_KEY=<16 hex chars> (randomBytes(8).toString('hex'))
    expect(envEntry).toMatch(/^IDEMPOTENCY_KEY=[0-9a-f]{16}$/);
  });

  it('emits the env var with the -e flag immediately preceding it', () => {
    const backend = new DockerSpawnBackend(projectDir);
    backend.spawn('test-002', 'haiku', 'prompt');

    const runCall = spawnSyncCalls.find(c => c.cmd === 'docker' && c.args[0] === 'run');
    expect(runCall).toBeDefined();

    // The env var must follow a -e flag (docker convention)
    const idx = runCall!.args.findIndex(
      a => typeof a === 'string' && a.startsWith('IDEMPOTENCY_KEY='),
    );
    expect(idx).toBeGreaterThan(0);
    expect(runCall!.args[idx - 1]).toBe('-e');
  });

  it('generates a fresh IDEMPOTENCY_KEY for each spawn call', () => {
    const backend = new DockerSpawnBackend(projectDir);
    backend.spawn('test-003', 'sonnet', 'prompt-a');
    backend.spawn('test-004', 'sonnet', 'prompt-b');

    const runCalls = spawnSyncCalls.filter(c => c.cmd === 'docker' && c.args[0] === 'run');
    expect(runCalls.length).toBe(2);

    const keys = runCalls.map(rc => {
      const e = rc.args.find(a => typeof a === 'string' && a.startsWith('IDEMPOTENCY_KEY='));
      return e?.split('=')[1] ?? '';
    });
    expect(keys[0]).toMatch(/^[0-9a-f]{16}$/);
    expect(keys[1]).toMatch(/^[0-9a-f]{16}$/);
    // Two distinct random keys — collision probability ≈ 2^-64
    expect(keys[0]).not.toBe(keys[1]);
  });
});

// ─── 2. prompt-god-template: Idempotency Key directive in worker prompt ───

describe('buildTaskPrompt — Idempotency Key directive', () => {
  function makeTask(overrides: Partial<Task> = {}): Task {
    return {
      id: '156-006',
      title: 'Test task',
      description: 'Test description',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'unit-test',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
      status: 'PENDING',
      sprintId: 'sprint-156',
      provider: 'claude',
      createdAt: new Date().toISOString(),
      ...overrides,
    } as Task;
  }

  it('emits the "## Idempotency Key" header in the rendered prompt', () => {
    const ctx: SprintContext = { effort: 'medium' };
    const artifact = buildTaskPrompt(makeTask(), ctx);
    expect(artifact.prompt).toContain('## Idempotency Key');
  });

  it('embeds the literal ${IDEMPOTENCY_KEY} shell placeholder', () => {
    const ctx: SprintContext = { effort: 'medium' };
    const artifact = buildTaskPrompt(makeTask(), ctx);
    // Placeholder must remain literal — shell expands it at container runtime.
    expect(artifact.prompt).toContain('${IDEMPOTENCY_KEY}');
  });

  it('includes the Idempotency-Key header usage directive', () => {
    const ctx: SprintContext = { effort: 'medium' };
    const artifact = buildTaskPrompt(makeTask(), ctx);
    expect(artifact.prompt).toContain('Idempotency-Key header');
    expect(artifact.prompt.toLowerCase()).toContain('retries safe');
  });

  it('places the directive after "## Your Task" and before "## What To Do"', () => {
    const ctx: SprintContext = { effort: 'low' };
    const artifact = buildTaskPrompt(makeTask(), ctx);
    const yourTaskIdx = artifact.prompt.indexOf('## Your Task');
    const idempotencyIdx = artifact.prompt.indexOf('## Idempotency Key');
    const whatToDoIdx = artifact.prompt.indexOf('## What To Do');
    expect(yourTaskIdx).toBeGreaterThanOrEqual(0);
    expect(idempotencyIdx).toBeGreaterThan(yourTaskIdx);
    expect(whatToDoIdx).toBeGreaterThan(idempotencyIdx);
  });
});
