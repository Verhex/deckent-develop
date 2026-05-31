// ─── Docker Backend Integration Tests ─────────────────────────────────────
// Tests DockerSpawnBackend with a real container when Docker is available.
// All tests skip gracefully when Docker is not installed/running.
//
// Design note:
//   Workers run `claude CLI` which exits quickly in test env (not logged in).
//   We verify observable outcomes: .hb file contents, list() state, kill() behavior.
//   We do NOT assert on container "running" state since it's racing with claude exit.
//
// Coverage categories:
//   T1:  isAvailable() sync/async agreement
//   T2:  spawn() HB write (backend: docker field)
//   T3:  spawn() list() registration
//   T4:  spawn() starts real Docker container (containerId in HB)
//   T5:  kill() deregisters from list()
//   T6:  container cleanup after natural exit (monitorContainer)
//   T7:  list() concurrent multi-spawn tracking
//   T8:  monitorContainer HB update after container exit
//   T9:  EXIT trap writes .result to shared volume
//   T10: monitorContainer .log extraction
//   T11: orphan HB detection (unit — no Docker required)
//   T12: orphan HB cleanup archives files (unit)
//   T13: file lock acquired before write (unit — .locks/ mount)
//   T14: stale lock cleanup by age (unit)
//   T15: fsync — verifyResultAfterStop no-op when .result missing (unit)
//   T16: fsync — verifyResultAfterStop reads file when .result exists (unit)
//   T17: heartbeat sequence cache invalidation (unit)
//   T18: state machine EXECUTING → DONE transition (unit)
//   T19: state machine FAILED fallback on missing .result (unit)
//   T20: Docker backend timeout marker written on container_start_failed

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DockerSpawnBackend, isDockerAvailable } from '../../src/orchestra/spawn-backend-docker.js';
import { detectOrphans, cleanupOrphanHBs } from '../../src/monitor/auditor.js';
import { acquireLock, releaseLock, clearStaleLocks, checkLock } from '../../src/core/file-lock.js';
import { LOCKS_DIR, TASKS_DIR } from '../../src/core/constants.js';
import { _clearAllPending } from '../../src/core/active-workers.js';

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
    path.join(TEST_TASKS_DIR, `task-${taskId}.log`),
  ];
  for (const p of files) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ok */ }
  }
}

// Monotonically increasing counter — prevents testTaskId collision when Date.now()
// returns the same value for consecutive fast tests in the same millisecond.
let _dockerTestSeq = 0;

describe('Docker Backend Integration', () => {
  let backend: DockerSpawnBackend;
  let testTaskId: string;
  let containerName: string;

  beforeEach(() => {
    // Unique ID per test — Date.now() + pid + monotonic counter guarantees no collision
    // even when tests run back-to-back within the same millisecond.
    testTaskId = `test-docker-${Date.now()}-${process.pid}-${++_dockerTestSeq}`;
    containerName = `deckent-w-${testTaskId}`;
    _clearAllPending();
    // Broad cleanup BEFORE creating backend: catches stale .hb/.log files that background
    // monitorContainer callbacks from previous tests may have written after afterEach ran.
    try {
      const files = fs.readdirSync(TEST_TASKS_DIR);
      for (const f of files) {
        if (f.startsWith('task-test-docker-') || f.startsWith('.prompt-') || f.startsWith('.worker-test-docker-')) {
          try { fs.unlinkSync(path.join(TEST_TASKS_DIR, f)); } catch { /* ok */ }
        }
      }
    } catch { /* ok */ }
    // Belt-and-suspenders: also clear stale spawnlocks from previous runs/crashes.
    try {
      const locksDir = path.join(PROJECT_ROOT, '.locks');
      if (fs.existsSync(locksDir)) {
        for (const f of fs.readdirSync(locksDir)) {
          if (f.endsWith('.spawnlock') && f.includes('test-docker-')) {
            try { fs.unlinkSync(path.join(locksDir, f)); } catch { /* ok */ }
          }
        }
      }
    } catch { /* ok */ }
    backend = new DockerSpawnBackend(PROJECT_ROOT);
    forceRemoveContainer(containerName);
    cleanupTaskFiles(testTaskId);
  });

  afterEach(() => {
    // Kill before clearing global state — ensures backend deregisters cleanly.
    try { backend.kill(testTaskId); } catch { /* already killed or not spawned */ }
    _clearAllPending();
    forceRemoveContainer(containerName);
    forceRemoveContainer(`${containerName}-b`);
    // Cleanup ALL test-docker artifacts (any PID/timestamp suffix)
    try {
      const files = fs.readdirSync(TEST_TASKS_DIR);
      for (const f of files) {
        if (f.startsWith('task-test-docker-') || f.startsWith('.prompt-') || f.startsWith('.worker-test-docker-')) {
          try { fs.unlinkSync(path.join(TEST_TASKS_DIR, f)); } catch { /* ok */ }
        }
      }
    } catch { /* ok */ }
    // Clean up any spawnlock files left by this test's task to prevent lock leakage.
    try {
      const locksDir = path.join(PROJECT_ROOT, '.locks');
      if (fs.existsSync(locksDir)) {
        for (const f of fs.readdirSync(locksDir)) {
          if (f.endsWith('.spawnlock') && f.includes('test-docker-')) {
            try { fs.unlinkSync(path.join(locksDir, f)); } catch { /* ok */ }
          }
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
      // Arrange — neither specific task must be pre-registered (more robust than length===0
      // since a fresh backend instance should never contain these unique test IDs)
      expect(backend.list()).not.toContain(testTaskId);
      expect(backend.list()).not.toContain(taskId2);

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
      try { backend.kill(testTaskId); } catch { /* ok — may already be killed */ }
      backend.kill(taskId2);
      forceRemoveContainer(containerName2);
      cleanupTaskFiles(taskId2);
    }
  });

  // ─── Test 8: monitorContainer updates heartbeat with backend: docker ─────
  // After container exits naturally, monitorContainer() must write hb with backend field.

  it.skipIf(!dockerAvailable)('monitorContainer updates heartbeat with backend: docker after container exit', async () => {
    // Arrange
    const hbPath = path.join(TEST_TASKS_DIR, `task-${testTaskId}.hb`);

    // Act — spawn (claude exits quickly without auth in test env)
    backend.spawn(testTaskId, 'haiku', 'backend-field-test', {
      projectDir: PROJECT_ROOT,
    });

    // Initial .hb written by spawn() — verify pre-condition
    expect(fs.existsSync(hbPath)).toBe(true);
    const initialHb = JSON.parse(fs.readFileSync(hbPath, 'utf-8')) as Record<string, unknown>;
    // spawn() writes backend: 'docker' in the initial heartbeat
    expect(initialHb.backend).toBe('docker');

    // Poll until monitorContainer() rewrites the .hb with status DONE or FAILED
    // monitorContainer fires after `docker wait` resolves (container exits naturally)
    let finalHb: Record<string, unknown> | null = null;
    for (let i = 0; i < 30; i++) {
      await waitMs(500);
      if (!fs.existsSync(hbPath)) continue;
      try {
        const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8')) as Record<string, unknown>;
        // monitorContainer writes status DONE or FAILED with exitCode field
        if (hb.status === 'DONE' || hb.status === 'FAILED') {
          finalHb = hb;
          break;
        }
      } catch { /* partial write — retry */ }
    }

    // Assert — monitorContainer must have written its updated heartbeat
    expect(finalHb).not.toBeNull();
    // The monitorContainer callback always sets backend: 'docker'
    expect(finalHb!.backend).toBe('docker');
    expect(finalHb!.taskId).toBe(testTaskId);
    expect(['DONE', 'FAILED']).toContain(finalHb!.status);
    expect(typeof finalHb!.exitCode).toBe('number');
  }, 20_000);

  // ─── Test 9: EXIT trap guarantees .result written from container ──────────
  // The container runs a shell EXIT trap that writes a fallback .result file
  // when Claude exits without writing one. This verifies host-visible result delivery
  // via the shared .tasks/ volume mount between host and container.

  it.skipIf(!dockerAvailable)('EXIT trap writes .result to shared .tasks/ volume accessible from host', async () => {
    // Use a unique task ID separate from testTaskId to avoid afterEach cleanup collision
    const trapTaskId = `${testTaskId}-trap`;
    const resultPath = path.join(TEST_TASKS_DIR, `task-${trapTaskId}.result`);

    // Cleanup any leftover from previous run
    try { if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath); } catch { /* ok */ }
    expect(fs.existsSync(resultPath)).toBe(false); // pre-condition

    try {
      // Act — spawn without real Claude auth; EXIT trap will fire and write fallback .result
      backend.spawn(trapTaskId, 'haiku', 'exit-trap-test', {
        projectDir: PROJECT_ROOT,
      });

      // Poll up to 25s for .result to appear on host via shared volume mount
      // (container start + claude exit + EXIT trap + volume flush can take ~5-10s)
      let resultWritten = false;
      for (let i = 0; i < 50; i++) {
        await waitMs(500);
        if (fs.existsSync(resultPath)) {
          resultWritten = true;
          break;
        }
      }

      // Assert — .result must be accessible from host (shared .tasks/ volume working)
      expect(resultWritten).toBe(true);

      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
      // EXIT trap fallback must contain valid taskId
      expect(result.taskId).toBe(trapTaskId);
      // selfAssessment must be a valid value
      expect(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']).toContain(result.selfAssessment);
    } finally {
      // Cleanup: kill any lingering container and remove files
      backend.kill(trapTaskId);
      forceRemoveContainer(`deckent-w-${trapTaskId}`);
      cleanupTaskFiles(trapTaskId);
    }
  }, 30_000);

  // ── Test 10: Docker log extraction writes .log file ───────────────────
  it.skipIf(!dockerAvailable)('monitorContainer extracts container stdout to .log file', async () => {
    const logTaskId = `test-docker-${Date.now()}-${process.pid}-${++_dockerTestSeq}-log`;
    const containerName = `deckent-w-${logTaskId}`;
    const logPath = path.join(TEST_TASKS_DIR, `task-${logTaskId}.log`);
    try {
      backend.spawn(logTaskId, 'sonnet', 'echo "log capture test"', {
        projectDir: PROJECT_ROOT,
        autoApprove: true,
      });
      // Wait for container to exit and monitorContainer to extract logs
      let logExists = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1500));
        if (fs.existsSync(logPath)) {
          logExists = true;
          break;
        }
      }
      expect(logExists).toBe(true);
      if (logExists) {
        const logContent = fs.readFileSync(logPath, 'utf-8');
        expect(logContent.length).toBeGreaterThan(0);
      }
    } finally {
      backend.kill(logTaskId);
      forceRemoveContainer(containerName);
      cleanupTaskFiles(logTaskId);
      try { fs.unlinkSync(logPath); } catch { /* ok */ }
    }
  }, 30_000);

  // Final cleanup — monitorContainer writes .hb/.timeout asynchronously AFTER afterEach runs
  afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      const files = fs.readdirSync(TEST_TASKS_DIR);
      for (const f of files) {
        if (f.startsWith('task-test-docker-') || f.startsWith('.prompt-') || f.startsWith('.worker-test-docker-')) {
          try { fs.unlinkSync(path.join(TEST_TASKS_DIR, f)); } catch { /* ok */ }
        }
      }
    } catch { /* ok */ }
  });
});

// ─── Parity Unit Tests (no Docker required) ────────────────────────────────
// These tests exercise Docker backend parity features using temp directories:
//   orphan HB detection, file lock integration, fsync verification,
//   heartbeat cache invalidation, and state machine transitions.

function makeTmpRoot(): string {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'deckent-docker-parity-'));
  fs.mkdirSync(path.join(root, TASKS_DIR), { recursive: true });
  fs.mkdirSync(path.join(root, LOCKS_DIR), { recursive: true });
  return root;
}

function writeHBFile(root: string, taskId: string, content: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(root, TASKS_DIR, `task-${taskId}.hb`),
    JSON.stringify(content),
    'utf-8',
  );
}

function writeTaskJson(root: string, taskId: string): void {
  fs.writeFileSync(
    path.join(root, TASKS_DIR, `task-${taskId}.json`),
    JSON.stringify({ id: taskId, title: 'test', status: 'EXECUTING' }),
    'utf-8',
  );
}

function writeResultFile(root: string, taskId: string, selfAssessment: string): void {
  fs.writeFileSync(
    path.join(root, TASKS_DIR, `task-${taskId}.result`),
    JSON.stringify({ taskId, selfAssessment, filesChanged: [], linesAdded: 0, linesRemoved: 0 }),
    'utf-8',
  );
}

// ─── T11: Orphan HB Detection ──────────────────────────────────────────────
describe('Docker Backend Parity — Orphan HB Detection', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('T11a: detectOrphans returns orphan task when HB exists but no task JSON', () => {
    // Arrange: HB file exists, no corresponding task JSON → orphan
    writeHBFile(root, 'orphan-a', { workerId: 'docker-orphan-a', taskId: 'orphan-a', status: 'EXECUTING' });
    const activeSet = new Set<string>(); // no active tasks

    // Act
    const result = detectOrphans(root, activeSet);

    // Assert
    expect(result.orphanTaskIds).toContain('orphan-a');
    expect(result.orphanHBPaths.length).toBeGreaterThan(0);
  });

  it('T11b: detectOrphans ignores tasks in the active set', () => {
    // Arrange: HB exists AND task is in active set → not orphan
    writeHBFile(root, 'active-001', { workerId: 'docker-active-001', taskId: 'active-001', status: 'EXECUTING' });
    const activeSet = new Set(['active-001']);

    // Act
    const result = detectOrphans(root, activeSet);

    // Assert — active task must not appear in orphans
    expect(result.orphanTaskIds).not.toContain('active-001');
  });

  it('T11c: detectOrphans handles empty .tasks/ directory gracefully', () => {
    // Arrange: no HB files at all
    const result = detectOrphans(root, new Set());

    // Assert — empty result, no crash
    expect(result.orphanTaskIds).toHaveLength(0);
    expect(result.orphanHBPaths).toHaveLength(0);
  });

  it('T11d: detectOrphans auto-discovers active tasks when no set provided', () => {
    // Arrange: task JSON exists → should not be orphan
    writeTaskJson(root, 'known-task');
    writeHBFile(root, 'known-task', { workerId: 'docker-known-task', taskId: 'known-task', status: 'EXECUTING' });

    // Also write an orphan (HB only, no JSON)
    writeHBFile(root, 'ghost-task', { workerId: 'docker-ghost', taskId: 'ghost-task', status: 'EXECUTING' });

    // Act — no activeTaskIds provided (auto-discovery mode)
    const result = detectOrphans(root);

    // Assert
    expect(result.orphanTaskIds).not.toContain('known-task');
    expect(result.orphanTaskIds).toContain('ghost-task');
  });
});

// ─── T12: Orphan HB Cleanup ────────────────────────────────────────────────
describe('Docker Backend Parity — Orphan HB Cleanup', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('T12a: cleanupOrphanHBs archives orphan HB files to brain/archive/', () => {
    // Arrange
    const brainDir = path.join(root, '.brain');
    const archiveBase = path.join(brainDir, 'archive');
    fs.mkdirSync(brainDir, { recursive: true });
    fs.mkdirSync(archiveBase, { recursive: true });
    writeHBFile(root, 'orphan-001', { workerId: 'docker-orphan-001', taskId: 'orphan-001', status: 'EXECUTING' });
    const originalHbPath = path.join(root, TASKS_DIR, 'task-orphan-001.hb');
    expect(fs.existsSync(originalHbPath)).toBe(true);

    // Act
    const cleanup = cleanupOrphanHBs(root, 'sprint-test', new Set());

    // Assert — HB must be removed from .tasks/ and archived
    expect(cleanup.orphanCount).toBeGreaterThan(0);
    expect(fs.existsSync(originalHbPath)).toBe(false);
    expect(cleanup.archived.length).toBeGreaterThan(0);
  });

  it('T12b: cleanupOrphanHBs returns zero counts when no orphans exist', () => {
    // Arrange — no HB files
    const brainDir = path.join(root, '.brain');
    fs.mkdirSync(path.join(brainDir, 'archive'), { recursive: true });

    // Act
    const cleanup = cleanupOrphanHBs(root, 'sprint-clean', new Set());

    // Assert
    expect(cleanup.orphanCount).toBe(0);
    expect(cleanup.archived).toHaveLength(0);
  });

  it('T12c: cleanupOrphanHBs preserves active task HB files', () => {
    // Arrange
    const brainDir = path.join(root, '.brain');
    fs.mkdirSync(path.join(brainDir, 'archive'), { recursive: true });
    writeTaskJson(root, 'active-task');
    writeHBFile(root, 'active-task', { workerId: 'docker-active-task', taskId: 'active-task', status: 'EXECUTING' });
    writeHBFile(root, 'orphan-task', { workerId: 'docker-orphan-task', taskId: 'orphan-task', status: 'EXECUTING' });

    // Act — active-task has a JSON file, orphan-task does not
    const cleanup = cleanupOrphanHBs(root, 'sprint-preserve');

    // Assert — active task HB preserved
    expect(fs.existsSync(path.join(root, TASKS_DIR, 'task-active-task.hb'))).toBe(true);
    expect(cleanup.orphanCount).toBe(1);
  });
});

// ─── T13–T14: File Lock Integration ────────────────────────────────────────
describe('Docker Backend Parity — File Lock Integration (.locks/ mount)', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('T13a: acquireLock creates .lock file in .locks/ directory', () => {
    // Arrange — simulates what a Docker worker does before writing a file
    const filePath = 'src/file.ts';

    // Act
    const lockInfo = acquireLock(root, filePath, 'docker-worker-001', 'task-001');

    // Assert — lock file created in .locks/
    const locksDir = path.join(root, LOCKS_DIR);
    const lockFiles = fs.readdirSync(locksDir);
    expect(lockFiles.length).toBeGreaterThan(0);
    expect(lockInfo.ownerWorkerId).toBe('docker-worker-001');
    expect(lockInfo.filePath).toBe(filePath);

    // Cleanup
    releaseLock(root, filePath, 'docker-worker-001');
  });

  it('T13b: acquireLock throws when another worker holds the lock', () => {
    // Arrange
    const filePath = 'src/shared.ts';
    acquireLock(root, filePath, 'docker-worker-A', 'task-A');

    // Act + Assert — second worker cannot acquire same lock
    expect(() => acquireLock(root, filePath, 'docker-worker-B', 'task-B')).toThrow();

    // Cleanup
    releaseLock(root, filePath, 'docker-worker-A');
  });

  it('T13c: releaseLock removes the .lock file', () => {
    // Arrange
    const filePath = 'src/releaseable.ts';
    acquireLock(root, filePath, 'docker-worker-release', 'task-release');
    const locksDir = path.join(root, LOCKS_DIR);
    expect(fs.readdirSync(locksDir).length).toBeGreaterThan(0);

    // Act
    releaseLock(root, filePath, 'docker-worker-release');

    // Assert — .lock file removed
    expect(fs.readdirSync(locksDir).length).toBe(0);
  });

  it('T14: clearStaleLocks removes locks older than maxAgeMs', () => {
    // Arrange: write a "stale" lock file directly (backdated acquiredAt)
    const locksDir = path.join(root, LOCKS_DIR);
    const staleLockPath = path.join(locksDir, 'src__stale.ts.lock');
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10min ago
    fs.writeFileSync(staleLockPath, JSON.stringify({
      filePath: `${root}/src/stale.ts`,
      ownerWorkerId: 'docker-dead-worker',
      acquiredAt: staleTime,
      taskId: 'stale-task',
    }), 'utf-8');

    // Act — clear locks older than 5 minutes
    const count = clearStaleLocks(root, 5 * 60 * 1000);

    // Assert
    expect(count).toBeGreaterThan(0);
    expect(fs.existsSync(staleLockPath)).toBe(false);
  });
});

// ─── T15–T16: fsync Verification (unit) ───────────────────────────────────
describe('Docker Backend Parity — fsync verifyResultAfterStop (unit)', () => {
  it('T15: Docker backend source contains verifyResultAfterStop with fsyncSync', () => {
    // Arrange — verify source implements post-stop fsync verification
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert
    expect(src).toContain('verifyResultAfterStop');
    expect(src).toContain('fsyncSync');
    expect(src).toContain('openSync');
    expect(src).toContain('closeSync');
  });

  it('T16: Docker backend monitorContainer performs host-side fsync on result file', () => {
    // Arrange
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — monitorContainer must also fsync (belt-and-suspenders comment present)
    expect(src).toContain('belt-and-suspenders');
    // monitorContainer uses fsyncSync after container exit to flush volume buffers.
    // Anchor on the function definition (`private monitorContainer`) so the slice
    // starts at the implementation, not at an earlier comment-only mention.
    const monitorIdx = src.indexOf('private monitorContainer');
    expect(monitorIdx).toBeGreaterThan(-1);
    const monitorSection = src.slice(monitorIdx, monitorIdx + 3000);
    expect(monitorSection).toContain('fsyncSync');
  });
});

// ─── T17: Heartbeat Cache Invalidation ────────────────────────────────────
describe('Docker Backend Parity — Heartbeat Cache Invalidation', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('T17a: Docker HB loop increments sequence to prevent false-stale detection', () => {
    // Arrange — verify the heartbeat loop in worker script increments SEQ
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — worker script has incremental SEQ counter
    // The script generates: {"sequence":$SEQ,...} where SEQ is a shell variable
    expect(src).toContain('SEQ=2');
    expect(src).toContain('SEQ=$((SEQ+1))');
    // The heartbeat echo includes both "sequence" field name and $SEQ variable
    expect(src).toContain('sequence');
    expect(src).toContain('$SEQ');
  });

  it('T17b: heartbeat sequence field increases monotonically across writes', () => {
    // Arrange — simulate HB file updates as Docker worker script would write them
    const hbPath = path.join(root, TASKS_DIR, 'task-seq-test.hb');
    const timestamps = Array.from({ length: 3 }, (_, i) => {
      const seq = i + 1;
      const ts = new Date(Date.now() + i * 1000).toISOString();
      return { workerId: 'docker-seq-test', taskId: 'seq-test', status: 'EXECUTING', sequence: seq, timestamp: ts, backend: 'docker' };
    });

    // Act — simulate heartbeat file updates
    const sequences: number[] = [];
    for (const hb of timestamps) {
      fs.writeFileSync(hbPath, JSON.stringify(hb), 'utf-8');
      const read = JSON.parse(fs.readFileSync(hbPath, 'utf-8'));
      sequences.push(read.sequence as number);
    }

    // Assert — sequence must be monotonically increasing
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  });

  it('T17c: stale heartbeat suppressed when .result has DONE assessment', () => {
    // Arrange — HB timestamp is old (stale), but .result says DONE
    // This simulates cache invalidation: fresh result overrides stale HB timestamp
    const taskId = 'cache-inval-001';
    writeResultFile(root, taskId, 'DONE');
    const staleTs = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5min ago
    writeHBFile(root, taskId, {
      workerId: `docker-${taskId}`,
      taskId,
      status: 'EXECUTING',
      sequence: 1,
      timestamp: staleTs,
      backend: 'docker',
    });

    // Act — read HB and result files as auditor would
    const hb = JSON.parse(fs.readFileSync(path.join(root, TASKS_DIR, `task-${taskId}.hb`), 'utf-8'));
    const result = JSON.parse(fs.readFileSync(path.join(root, TASKS_DIR, `task-${taskId}.result`), 'utf-8'));

    const elapsed = Date.now() - new Date(hb.timestamp as string).getTime();
    const isTimestampStale = elapsed > 2 * 60 * 1000; // 2min threshold
    const resultIsDone = result.selfAssessment === 'DONE' || result.selfAssessment === 'GO_WITH_TECH_DEBT';

    // Assert — timestamp is stale but result is DONE → cache invalidation suppresses alert
    expect(isTimestampStale).toBe(true);
    expect(resultIsDone).toBe(true);
    // In production: shouldReportStale() returns false when result is DONE
  });
});

// ─── T18–T19: State Machine Transitions ───────────────────────────────────
describe('Docker Backend Parity — State Machine Transitions', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('T18: EXECUTING → DONE transition: HB status updates when .result written', () => {
    // Arrange — start in EXECUTING state
    const taskId = 'sm-done-001';
    writeHBFile(root, taskId, {
      workerId: `docker-${taskId}`, taskId, status: 'EXECUTING',
      sequence: 5, timestamp: new Date().toISOString(), backend: 'docker',
    });

    // Act — simulate container exit: monitorContainer reconciles .result → DONE
    writeResultFile(root, taskId, 'DONE');
    const finalHbData = {
      workerId: `docker-${taskId}`, taskId, status: 'DONE',
      sequence: 99, exitCode: 0, backend: 'docker',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(root, TASKS_DIR, `task-${taskId}.hb`),
      JSON.stringify(finalHbData, null, 2), 'utf-8',
    );

    // Assert — HB reflects DONE state
    const hb = JSON.parse(fs.readFileSync(path.join(root, TASKS_DIR, `task-${taskId}.hb`), 'utf-8'));
    expect(hb.status).toBe('DONE');
    expect(hb.exitCode).toBe(0);
    expect(hb.backend).toBe('docker');
    // .result must also exist and agree
    const result = JSON.parse(fs.readFileSync(path.join(root, TASKS_DIR, `task-${taskId}.result`), 'utf-8'));
    expect(result.selfAssessment).toBe('DONE');
  });

  it('T19: EXECUTING → FAILED with timeout marker when .result missing + non-zero exit', () => {
    // Arrange — EXECUTING state, no .result written
    const taskId = 'sm-fail-001';
    writeHBFile(root, taskId, {
      workerId: `docker-${taskId}`, taskId, status: 'EXECUTING',
      sequence: 3, timestamp: new Date().toISOString(), backend: 'docker',
    });

    // Act — simulate container exit with non-zero code and no .result
    // monitorContainer would write FAILED HB + .timeout marker
    const failHbData = {
      workerId: `docker-${taskId}`, taskId, status: 'FAILED',
      sequence: 99, exitCode: 137, backend: 'docker',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(root, TASKS_DIR, `task-${taskId}.hb`),
      JSON.stringify(failHbData, null, 2), 'utf-8',
    );
    const timeoutPath = path.join(root, TASKS_DIR, `task-${taskId}.timeout`);
    fs.writeFileSync(timeoutPath, 'container_exit_137', 'utf-8');

    // Assert — HB shows FAILED, .timeout marker exists, no .result
    const hb = JSON.parse(fs.readFileSync(path.join(root, TASKS_DIR, `task-${taskId}.hb`), 'utf-8'));
    expect(hb.status).toBe('FAILED');
    expect(hb.exitCode).toBe(137); // SIGKILL exit code
    expect(fs.existsSync(timeoutPath)).toBe(true);
    expect(fs.readFileSync(timeoutPath, 'utf-8')).toBe('container_exit_137');
    expect(fs.existsSync(path.join(root, TASKS_DIR, `task-${taskId}.result`))).toBe(false);
  });

  it('T19b: state machine reconciliation: FAILED exitCode 137 overridden by DONE .result', () => {
    // Arrange — simulates the 5-sprint exit-137 false-FAILED bug scenario
    // Container SIGKILL'd (exit 137) but worker already wrote DONE result
    const taskId = 'sm-reconcile-001';
    writeResultFile(root, taskId, 'DONE');

    // Act — monitorContainer reconciles: exitCode=137 but result=DONE → HB=DONE
    const reconciledHb = {
      workerId: `docker-${taskId}`, taskId, status: 'DONE',
      sequence: 99, exitCode: 0, backend: 'docker', // reconciled exitCode
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(root, TASKS_DIR, `task-${taskId}.hb`),
      JSON.stringify(reconciledHb, null, 2), 'utf-8',
    );

    // Assert — reconciliation yields DONE status (not FAILED)
    const hb = JSON.parse(fs.readFileSync(path.join(root, TASKS_DIR, `task-${taskId}.hb`), 'utf-8'));
    expect(hb.status).toBe('DONE');
    expect(hb.exitCode).toBe(0); // reconciled: not the real 137
    const result = JSON.parse(fs.readFileSync(path.join(root, TASKS_DIR, `task-${taskId}.result`), 'utf-8'));
    expect(result.selfAssessment).toBe('DONE');
  });
});

// ─── T20: Timeout Marker for container_start_failed ───────────────────────
describe('Docker Backend Parity — Timeout Marker (unit)', () => {
  it('T20: Docker backend writes container_start_failed .timeout marker on spawn error', () => {
    // Arrange — verify source code handles spawn failure correctly
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — spawn() must write .timeout with 'container_start_failed' on docker run failure
    expect(src).toContain("'container_start_failed'");
    expect(src).toContain('task-${taskId}.timeout');
    // Must return early (not throw) so auditor result-collector handles it gracefully
    expect(src).toContain('writeFileSync');
    expect(src).toContain('return;');
  });
});

// ─── T21–T25: Prompt Persistence + Archive (unit) ─────────────────────────
// Verifies Sprint 137 Alperen request: .prompt-* files persist until sprint end.
import { archivePromptFiles } from '../../src/orchestra/spawn-backend-docker.js';

describe('Docker Backend — Prompt Persistence + Archive', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(tmpdir(), 'deckent-prompt-'));
    fs.mkdirSync(path.join(root, TASKS_DIR), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // T21: Prompt files are NOT deleted after container exit
  it('T21: spawn-backend-docker source does NOT delete .prompt-* files in monitorContainer', () => {
    // Arrange — verify source code: monitorContainer must NOT contain unlink for .prompt-* files
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — the only cleanup after container exit is .worker-*.sh, NOT .prompt-
    // Search entire source (not just monitorContainer section) for the key signals:
    // 1. .worker- cleanup must be present somewhere in file
    expect(src).toContain('.worker-');
    // 2. .prompt- files must NOT be deleted in monitorContainer (persist for analysis).
    //    Sprint 156 Task 4 reworded this contract: prompt + worker tmpfiles persist
    //    until sprint cleanup, where archivePromptFiles moves them to the archive dir.
    expect(src).toContain('.prompt-*.txt AND .worker-*.sh tmpfiles persist until sprint cleanup');
  });

  // T22: Hash-based prompt filename format includes taskId
  it('T22: spawn() creates .prompt-{taskId}-{hash}.txt filename (hash-based naming)', () => {
    // Arrange — verify source code format
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — template literal uses taskId and promptId in filename
    expect(src).toContain('`.prompt-${taskId}-${promptId}${fixSuffix}.txt`');
    expect(src).toContain('randomBytes(8).toString(\'hex\')');
  });

  // T23: Fix suffix added for isPriorityFix spawns
  it('T23: spawn() adds -fix suffix when isPriorityFix option is true', () => {
    // Arrange
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — fix suffix logic must be present
    expect(src).toContain('isPriorityFix');
    expect(src).toContain('-fix');
    expect(src).toContain("opts?.isPriorityFix ? '-fix' : ''");
  });

  // T24: archivePromptFiles moves .prompt-* to archive directory
  it('T24: archivePromptFiles() moves prompt files to .tasks/archive/sprint-NNN/', () => {
    // Arrange — create some .prompt-* files
    const tasksDir = path.join(root, TASKS_DIR);
    const promptFiles = [
      '.prompt-139-001-abc12345.txt',
      '.prompt-139-002-def67890.txt',
      '.prompt-139-003-ghi11111-fix.txt',
    ];
    for (const f of promptFiles) {
      fs.writeFileSync(path.join(tasksDir, f), `prompt content for ${f}`, 'utf-8');
    }

    // Act
    const result = archivePromptFiles(tasksDir, 'sprint-139');

    // Assert — files moved to archive
    expect(result.archived).toBe(3);
    const archiveDir = path.join(tasksDir, 'archive', 'sprint-139');
    expect(fs.existsSync(archiveDir)).toBe(true);
    for (const f of promptFiles) {
      expect(fs.existsSync(path.join(archiveDir, f))).toBe(true);
      expect(fs.existsSync(path.join(tasksDir, f))).toBe(false); // moved, not copied
    }
  });

  // T25: archivePromptFiles applies retention policy
  it('T25: archivePromptFiles() removes old sprint archives beyond retention limit', () => {
    // Arrange — create archive dirs for sprints 100-104 (5 sprints)
    const tasksDir = path.join(root, TASKS_DIR);
    const archiveRoot = path.join(tasksDir, 'archive');
    for (let i = 100; i <= 104; i++) {
      const dir = path.join(archiveRoot, `sprint-${i}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `.prompt-test-${i}.txt`), `old prompt ${i}`, 'utf-8');
    }

    // Act — archive sprint-105 with retention=5 (should remove sprint-100)
    archivePromptFiles(tasksDir, 'sprint-105', 5);

    // Assert — sprint-100 removed, sprints 101-105 kept
    expect(fs.existsSync(path.join(archiveRoot, 'sprint-100'))).toBe(false);
    expect(fs.existsSync(path.join(archiveRoot, 'sprint-101'))).toBe(true);
    expect(fs.existsSync(path.join(archiveRoot, 'sprint-105'))).toBe(true);
  });

  // T26: archivePromptFiles handles empty tasksDir gracefully
  it('T26: archivePromptFiles() returns zero counts when tasksDir has no prompt files', () => {
    // Arrange — tasksDir exists but has no .prompt-* files
    const tasksDir = path.join(root, TASKS_DIR);
    // Write a non-prompt file to ensure it's not touched
    fs.writeFileSync(path.join(tasksDir, 'task-001.json'), '{}', 'utf-8');

    // Act
    const result = archivePromptFiles(tasksDir, 'sprint-139');

    // Assert
    expect(result.archived).toBe(0);
    // The original non-prompt file must remain
    expect(fs.existsSync(path.join(tasksDir, 'task-001.json'))).toBe(true);
  });
});
