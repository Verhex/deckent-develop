// ─── Docker HB Shutdown Bug Fix Tests ─────────────────────────────────────
// Tests for the 5-sprint (134-138) Docker exit-137 bug fix.
//
// The bug: Docker container receives SIGTERM via `docker stop`, worker writes
// .result via writeFileSync, but data stays in OS buffer cache. When SIGKILL
// arrives after grace period, .result is lost → false NO_GO / stale heartbeat.
//
// The fix (Sprint 139):
//   A) atomicWriteFileSync: temp file → fsyncSync → renameSync (crash-safe)
//   B) SIGTERM handler: fsyncResultFile() before exit (survives SIGKILL)
//   C) Docker backend: increased grace (10→15s) + post-stop fsync verification
//   D) Worker script: POSIX fsync_file trap on EXIT and TERM signals

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  atomicWriteFileSync,
  writeResult,
  writeHeartbeat,
  createHeartbeat,
  finalizeHeartbeatOnShutdown,
  fsyncResultFile,
} from '../../src/agents/worker.js';
import { AgentStatus } from '../../src/core/types.js';
import type { TaskResult } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';

// ─── Test helpers ─────────────────────────────────────────────────────────

function createTmpProjectRoot(): string {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'deckent-hb-shutdown-'));
  fs.mkdirSync(path.join(root, TASKS_DIR), { recursive: true });
  return root;
}

function createMockResult(taskId: string, selfAssessment: string = 'DONE'): TaskResult {
  return {
    taskId,
    filesChanged: ['src/test.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 90,
    selfAssessment: selfAssessment as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
    notes: 'Test result',
  };
}

function writeTaskJson(projectRoot: string, taskId: string): void {
  const taskPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
  fs.writeFileSync(taskPath, JSON.stringify({
    id: taskId,
    title: 'Test task',
    description: 'test',
    model: 'haiku',
    effort: 'low',
    status: 'CLAIMED',
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/test.ts'] },
  }, null, 2), 'utf-8');
}

// ─── Test suites ──────────────────────────────────────────────────────────

describe('Docker HB Shutdown Bug Fix — atomicWriteFileSync', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTmpProjectRoot();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('writes file atomically — file content is correct after write', () => {
    // Arrange
    const filePath = path.join(projectRoot, 'test-atomic.json');
    const data = JSON.stringify({ key: 'value', nested: { a: 1 } }, null, 2);

    // Act
    atomicWriteFileSync(filePath, data);

    // Assert
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(data);
  });

  it('does not leave .tmp file after successful write', () => {
    // Arrange
    const filePath = path.join(projectRoot, 'test-no-tmp.json');

    // Act
    atomicWriteFileSync(filePath, '{"clean": true}');

    // Assert — .tmp file must not exist
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('overwrites existing file atomically', () => {
    // Arrange
    const filePath = path.join(projectRoot, 'test-overwrite.json');
    fs.writeFileSync(filePath, '{"old": true}', 'utf-8');

    // Act
    atomicWriteFileSync(filePath, '{"new": true}');

    // Assert
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content).toEqual({ new: true });
  });

  it('handles large files (>64KB to exceed typical OS buffer)', () => {
    // Arrange
    const filePath = path.join(projectRoot, 'test-large.json');
    const largeData = JSON.stringify({ data: 'x'.repeat(100_000) });

    // Act
    atomicWriteFileSync(filePath, largeData);

    // Assert
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toBe(largeData);
    expect(written.length).toBeGreaterThan(64_000);
  });
});

describe('Docker HB Shutdown Bug Fix — fsyncResultFile', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTmpProjectRoot();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns true when .result file exists and is fsync-able', () => {
    // Arrange
    const taskId = 'fsync-001';
    const resultPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    fs.writeFileSync(resultPath, '{"taskId":"fsync-001","selfAssessment":"DONE"}', 'utf-8');

    // Act
    const result = fsyncResultFile(projectRoot, taskId);

    // Assert
    expect(result).toBe(true);
  });

  it('returns false when .result file does not exist', () => {
    // Act
    const result = fsyncResultFile(projectRoot, 'nonexistent-task');

    // Assert
    expect(result).toBe(false);
  });

  it('does not corrupt file contents after fsync', () => {
    // Arrange
    const taskId = 'fsync-intact';
    const resultPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    const originalData = '{"taskId":"fsync-intact","selfAssessment":"DONE","notes":"test data"}';
    fs.writeFileSync(resultPath, originalData, 'utf-8');

    // Act
    fsyncResultFile(projectRoot, taskId);

    // Assert — file content must be unchanged
    expect(fs.readFileSync(resultPath, 'utf-8')).toBe(originalData);
  });
});

describe('Docker HB Shutdown Bug Fix — writeResult atomic pattern', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTmpProjectRoot();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('writeResult creates .result file with correct content', () => {
    // Arrange
    const taskId = 'wr-001';
    writeTaskJson(projectRoot, taskId);
    const result = createMockResult(taskId, 'DONE');

    // Act
    writeResult(projectRoot, result);

    // Assert
    const resultPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    expect(fs.existsSync(resultPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(written.taskId).toBe(taskId);
    expect(written.selfAssessment).toBe('DONE');
    expect(written.filesChanged).toEqual(['src/test.ts']);
  });

  it('writeResult does not leave .tmp artifact', () => {
    // Arrange
    const taskId = 'wr-notmp';
    writeTaskJson(projectRoot, taskId);
    const result = createMockResult(taskId);

    // Act
    writeResult(projectRoot, result);

    // Assert — no .tmp file left behind
    const tmpPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result.tmp`);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('writeResult with GO_WITH_TECH_DEBT assessment', () => {
    // Arrange
    const taskId = 'wr-td';
    writeTaskJson(projectRoot, taskId);
    const result = createMockResult(taskId, 'GO_WITH_TECH_DEBT');

    // Act
    writeResult(projectRoot, result);

    // Assert
    const resultPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    const written = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(written.selfAssessment).toBe('GO_WITH_TECH_DEBT');
  });
});

describe('Docker HB Shutdown Bug Fix — finalizeHeartbeatOnShutdown', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTmpProjectRoot();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('finalizes HB as DONE when .result has DONE assessment', () => {
    // Arrange
    const taskId = 'sigterm-done';
    const resultPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    fs.writeFileSync(resultPath, JSON.stringify({
      taskId, selfAssessment: 'DONE',
    }), 'utf-8');

    // Write initial HB
    const hbPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
    fs.writeFileSync(hbPath, JSON.stringify({
      workerId: `docker-${taskId}`, taskId, status: 'EXECUTING',
    }), 'utf-8');

    // Act
    const result = finalizeHeartbeatOnShutdown(projectRoot, taskId);

    // Assert
    expect(result).toBe(true);
    const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8'));
    expect(hb.status).toBe('DONE');
    expect(hb.exitCode).toBe(0);
    expect(hb.note).toContain('fsync');
  });

  it('finalizes HB as DONE when .result has GO_WITH_TECH_DEBT assessment', () => {
    // Arrange
    const taskId = 'sigterm-td';
    const resultPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    fs.writeFileSync(resultPath, JSON.stringify({
      taskId, selfAssessment: 'GO_WITH_TECH_DEBT',
    }), 'utf-8');

    const hbPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
    fs.writeFileSync(hbPath, '{}', 'utf-8');

    // Act
    const result = finalizeHeartbeatOnShutdown(projectRoot, taskId);

    // Assert
    expect(result).toBe(true);
    const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8'));
    expect(hb.status).toBe('DONE');
  });

  it('leaves HB untouched when .result has NO_GO assessment', () => {
    // Arrange
    const taskId = 'sigterm-nogo';
    const resultPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    fs.writeFileSync(resultPath, JSON.stringify({
      taskId, selfAssessment: 'NO_GO',
    }), 'utf-8');

    const hbPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
    const originalHb = JSON.stringify({ workerId: 'old', status: 'EXECUTING' });
    fs.writeFileSync(hbPath, originalHb, 'utf-8');

    // Act
    const result = finalizeHeartbeatOnShutdown(projectRoot, taskId);

    // Assert — should NOT finalize
    expect(result).toBe(false);
    expect(fs.readFileSync(hbPath, 'utf-8')).toBe(originalHb);
  });

  it('leaves HB untouched when .result does not exist', () => {
    // Arrange
    const taskId = 'sigterm-noresult';
    const hbPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
    const originalHb = JSON.stringify({ workerId: 'old', status: 'EXECUTING' });
    fs.writeFileSync(hbPath, originalHb, 'utf-8');

    // Act
    const result = finalizeHeartbeatOnShutdown(projectRoot, taskId);

    // Assert
    expect(result).toBe(false);
    expect(fs.readFileSync(hbPath, 'utf-8')).toBe(originalHb);
  });

  it('leaves HB untouched when .result has invalid JSON', () => {
    // Arrange
    const taskId = 'sigterm-badjson';
    const resultPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    fs.writeFileSync(resultPath, '{ broken json', 'utf-8');

    const hbPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
    const originalHb = JSON.stringify({ workerId: 'old', status: 'EXECUTING' });
    fs.writeFileSync(hbPath, originalHb, 'utf-8');

    // Act
    const result = finalizeHeartbeatOnShutdown(projectRoot, taskId);

    // Assert
    expect(result).toBe(false);
    expect(fs.readFileSync(hbPath, 'utf-8')).toBe(originalHb);
  });

  it('HB .tmp file does not remain after atomic write', () => {
    // Arrange
    const taskId = 'sigterm-notmp';
    const resultPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    fs.writeFileSync(resultPath, JSON.stringify({
      taskId, selfAssessment: 'DONE',
    }), 'utf-8');

    const hbPath = path.join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
    fs.writeFileSync(hbPath, '{}', 'utf-8');

    // Act
    finalizeHeartbeatOnShutdown(projectRoot, taskId);

    // Assert — no .tmp file
    expect(fs.existsSync(`${hbPath}.tmp`)).toBe(false);
  });
});

describe('Docker HB Shutdown Bug Fix — worker script SIGTERM trap', () => {
  it('worker script contains fsync_file function definition', () => {
    // Arrange — import DockerSpawnBackend to verify script generation
    // We test the script content that would be written to .tasks/
    // by checking the spawn-backend-docker module's script template

    // Act — read the source file and verify fsync_file is in the script template
    const sourceContent = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — script must define fsync_file and use it in traps
    expect(sourceContent).toContain('fsync_file()');
    expect(sourceContent).toContain('conv=fsync');
    expect(sourceContent).toContain("trap 'fsync_file");
  });

  it('worker script has both EXIT and TERM signal traps', () => {
    // Arrange
    const sourceContent = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — EXIT trap for crash safety, TERM trap for graceful shutdown
    // Sprint 145: EXIT trap calls on_exit function (not inline string)
    expect(sourceContent).toMatch(/trap\s+on_exit\s+EXIT/);
    expect(sourceContent).toMatch(/trap\s+'.*'\s+TERM/);
  });
});

describe('Docker HB Shutdown Bug Fix — Docker backend graceful stop', () => {
  it('kill() uses configurable grace period (default 15s)', () => {
    // Arrange
    const sourceContent = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — Sprint 151: grace period is configurable, default 15s
    expect(sourceContent).toContain('DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15');
    expect(sourceContent).toContain('`--time=${grace}`');
    // Timeout must be > grace period to avoid race
    expect(sourceContent).toContain('(grace + 5) * 1000');
  });

  it('kill() calls verifyResultAfterStop for post-stop verification', () => {
    // Arrange
    const sourceContent = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — post-stop verification step exists
    expect(sourceContent).toContain('verifyResultAfterStop');
    expect(sourceContent).toContain('post-stop-verify');
  });

  it('monitorContainer fsync result file from host after container exit', () => {
    // Arrange
    const sourceContent = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );

    // Assert — host-side fsync in monitorContainer
    expect(sourceContent).toContain('belt-and-suspenders');
    expect(sourceContent).toContain('fsyncSync');
  });
});
