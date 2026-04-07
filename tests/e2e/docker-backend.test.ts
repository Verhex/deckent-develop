// ─── Docker Backend Integration Tests ─────────────────────────────────────
// Tests DockerSpawnBackend with a real container when Docker is available.
// All tests skip gracefully when Docker is not installed/running.
//
// Design note:
//   Workers run `claude CLI` which exits quickly in test env (not logged in).
//   We verify observable outcomes: .hb file contents, list() state, kill() behavior.
//   We do NOT assert on container "running" state since it's racing with claude exit.

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DockerSpawnBackend, isDockerAvailable } from '../../src/orchestra/spawn-backend-docker.js';

const PROJECT_ROOT = process.cwd();
const TEST_TASKS_DIR = path.join(PROJECT_ROOT, '.tasks');

// Docker tests require BOTH: Docker daemon running AND deckent-worker image built
function isDockerReady(): boolean {
  if (!isDockerAvailable()) return false;
  const result = spawnSync('docker', ['images', '-q', 'deckent-worker:latest'], {
    encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  return (result.stdout?.trim().length ?? 0) > 0;
}
const dockerAvailable = isDockerReady();

/**
 * Check if a container exists (running or exited — before monitorContainer cleanup).
 */
function containerExistsAnyState(containerName: string): boolean {
  const result = spawnSync('docker', ['inspect', '--format', '{{.Id}}', containerName], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function forceRemoveContainer(name: string): void {
  spawnSync('docker', ['rm', '-f', name], {
    encoding: 'utf-8',
    timeout: 10_000,
    stdio: 'pipe',
  });
}

function cleanupTaskFiles(taskId: string): void {
  const files = [
    path.join(TEST_TASKS_DIR, `task-${taskId}.hb`),
    path.join(TEST_TASKS_DIR, `task-${taskId}.result`),
    path.join(TEST_TASKS_DIR, `task-${taskId}.timeout`),
  ];
  for (const p of files) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ok */ }
  }
}

describe('Docker Backend Integration', () => {
  let backend: DockerSpawnBackend;
  const testTaskId = `test-docker-${process.pid}`;
  const containerName = `deckent-w-${testTaskId}`;

  beforeEach(() => {
    backend = new DockerSpawnBackend(PROJECT_ROOT);
    forceRemoveContainer(containerName);
    cleanupTaskFiles(testTaskId);
  });

  afterEach(() => {
    forceRemoveContainer(containerName);
    forceRemoveContainer(`${containerName}-b`);
    // Cleanup ALL test-docker artifacts (any PID, any suffix)
    try {
      const files = fs.readdirSync(TEST_TASKS_DIR);
      for (const f of files) {
        if (f.startsWith('task-test-docker-') || f.startsWith('.prompt-')) {
          try { fs.unlinkSync(path.join(TEST_TASKS_DIR, f)); } catch { /* ok */ }
        }
      }
    } catch { /* ok */ }
  });

  // ─── Test 1: isAvailable() matches sync isDockerAvailable() ─────────────

  it('isAvailable() matches isDockerAvailable() sync result', async () => {
    // Arrange
    const syncResult = isDockerAvailable();

    // Act
    const asyncResult = await backend.isAvailable();

    // Assert — both APIs must agree on Docker availability
    expect(asyncResult).toBe(syncResult);
  });

  // ─── Test 2: spawn() writes heartbeat with backend: docker ───────────────

  it.skipIf(!dockerAvailable)('spawn() writes heartbeat file with backend: docker', () => {
    // Arrange
    const hbPath = path.join(TEST_TASKS_DIR, `task-${testTaskId}.hb`);
    expect(fs.existsSync(hbPath)).toBe(false); // pre-condition: no stale file

    // Act — .hb is written synchronously inside spawn() before returning
    backend.spawn(testTaskId, 'haiku', 'integration test placeholder', {
      projectDir: PROJECT_ROOT,
    });

    // Assert — .hb must exist immediately
    expect(fs.existsSync(hbPath)).toBe(true);

    const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8')) as Record<string, unknown>;
    expect(hb.backend).toBe('docker');
    expect(hb.workerId).toBe(`docker-${testTaskId}`);
    expect(hb.taskId).toBe(testTaskId);
    expect(hb.status).toBe('EXECUTING');
    // containerId is a 12-char short ID written after `docker run -d` returns
    expect(typeof hb.containerId).toBe('string');
    expect((hb.containerId as string).length).toBeGreaterThan(0);
    expect(typeof hb.timestamp).toBe('string');
  });

  // ─── Test 3: spawn() registers taskId in list() ──────────────────────────

  it.skipIf(!dockerAvailable)('spawn() registers taskId in list()', () => {
    // Arrange
    expect(backend.list()).not.toContain(testTaskId);

    // Act
    backend.spawn(testTaskId, 'haiku', 'register test', {
      projectDir: PROJECT_ROOT,
    });

    // Assert — list() must reflect the new taskId immediately
    expect(backend.list()).toContain(testTaskId);
  });

  // ─── Test 4: spawn() starts a real Docker container ─────────────────────
  // Container may exit quickly (claude exits fast without auth) but must START.
  // We verify via containerId captured in .hb — if containerId is present,
  // docker successfully created and started the container.

  it.skipIf(!dockerAvailable)('spawn() starts a real Docker container (containerId in heartbeat)', () => {
    // Arrange
    const hbPath = path.join(TEST_TASKS_DIR, `task-${testTaskId}.hb`);

    // Act
    backend.spawn(testTaskId, 'haiku', 'container start test', {
      projectDir: PROJECT_ROOT,
    });

    // Assert — containerId is written only when docker run -d succeeds
    expect(fs.existsSync(hbPath)).toBe(true);
    const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8')) as Record<string, unknown>;

    // A non-empty containerId proves a real container was created
    const containerId = hb.containerId as string;
    expect(containerId).toBeTruthy();
    expect(containerId.length).toBeGreaterThanOrEqual(8);

    // No .timeout marker = container started successfully (not start_failed)
    const timeoutPath = path.join(TEST_TASKS_DIR, `task-${testTaskId}.timeout`);
    if (fs.existsSync(timeoutPath)) {
      const timeoutContent = fs.readFileSync(timeoutPath, 'utf-8');
      expect(timeoutContent).not.toBe('container_start_failed');
    }
  });

  // ─── Test 5: kill() deregisters taskId from list() ───────────────────────

  it.skipIf(!dockerAvailable)('kill() deregisters taskId from list()', () => {
    // Arrange — spawn to register the task
    backend.spawn(testTaskId, 'haiku', 'kill test', {
      projectDir: PROJECT_ROOT,
    });
    expect(backend.list()).toContain(testTaskId);

    // Act
    backend.kill(testTaskId);

    // Assert — deregistered immediately after kill()
    expect(backend.list()).not.toContain(testTaskId);
  });

  // ─── Test 6: Container cleanup after natural exit ─────────────────────────
  // After claude exits and monitorContainer() fires, the container must be removed.
  // monitorContainer uses `docker wait` + `docker rm -f`.
  // Poll for up to 10s for container to disappear from docker.

  it.skipIf(!dockerAvailable)('container is removed after natural exit via monitorContainer', async () => {
    // Arrange — capture containerId to verify cleanup of that specific container
    const hbPath = path.join(TEST_TASKS_DIR, `task-${testTaskId}.hb`);

    // Act — spawn (claude exits quickly in test env)
    backend.spawn(testTaskId, 'haiku', 'cleanup test', {
      projectDir: PROJECT_ROOT,
    });

    // Get the container that was started
    const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8')) as Record<string, unknown>;
    const containerId = hb.containerId as string;
    expect(containerId).toBeTruthy();

    // Poll: monitorContainer() must remove the container via `docker rm -f`
    let containerGone = false;
    for (let i = 0; i < 20; i++) {
      await waitMs(500);
      if (!containerExistsAnyState(containerName)) {
        containerGone = true;
        break;
      }
    }

    // Assert — container must be fully removed within 10s
    expect(containerGone).toBe(true);
    // Wait for monitorContainer callback microtask to call containers.delete(taskId)
    // docker rm -f fires before delete(), but there may be a brief async delay
    await waitMs(200);
    expect(backend.list()).not.toContain(testTaskId);
  }, 15_000);

  // ─── Test 7: list() tracks multiple concurrent spawns ─────────────────────

  it.skipIf(!dockerAvailable)('list() tracks multiple concurrent task IDs', () => {
    const taskId2 = `${testTaskId}-b`;
    const containerName2 = `deckent-w-${taskId2}`;

    try {
      // Arrange — start with empty list
      expect(backend.list().length).toBe(0);

      // Act — spawn two tasks
      backend.spawn(testTaskId, 'haiku', 'multi test 1', { projectDir: PROJECT_ROOT });
      backend.spawn(taskId2, 'haiku', 'multi test 2', { projectDir: PROJECT_ROOT });

      // Assert — both registered
      const active = backend.list();
      expect(active).toContain(testTaskId);
      expect(active).toContain(taskId2);

      // Kill one, other remains
      backend.kill(testTaskId);
      expect(backend.list()).not.toContain(testTaskId);
      expect(backend.list()).toContain(taskId2);
    } finally {
      backend.kill(taskId2);
      forceRemoveContainer(containerName2);
      cleanupTaskFiles(taskId2);
    }
  });

  // Final cleanup — monitorContainer writes .hb/.timeout asynchronously AFTER afterEach runs
  afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      const files = fs.readdirSync(TEST_TASKS_DIR);
      for (const f of files) {
        if (f.startsWith('task-test-docker-') || f.startsWith('.prompt-')) {
          try { fs.unlinkSync(path.join(TEST_TASKS_DIR, f)); } catch { /* ok */ }
        }
      }
    } catch { /* ok */ }
  });
});
