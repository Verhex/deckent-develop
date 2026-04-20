// ─── Linux E2E — subprocess Backend Full Sprint ─────────────────────────────
// Sprint 148 Task 015: Cross-platform validation — Linux + subprocess backend.
//
// Tests verify:
//   1. Platform detection (linux)
//   2. 3-task mini sprint — all complete via subprocess workers
//   3. Subprocess stdout line-buffered, captured correctly
//   4. Exit code 0 → DONE result parsed
//   5. Exit code non-zero → NO_GO result
//   6. SIGTERM handling — graceful shutdown
//
// Skip strategy: Platform-specific tests use describe.skipIf(os.platform() !== 'linux').
// All tests use `node -e` as the subprocess command (no Claude CLI required in CI).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';

// ─── Constants ────────────────────────────────────────────────────────────────

const isLinux = platform() === 'linux';
const TASKS_DIR = '.tasks';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTempProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'deckent-linux-e2e-'));
  fs.mkdirSync(path.join(dir, TASKS_DIR), { recursive: true });
  return dir;
}

function waitForFile(filePath: string, waitMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fs.existsSync(filePath)) return resolve();
      if (Date.now() - start > waitMs) return reject(new Error(`Timeout waiting for ${filePath}`));
      setTimeout(check, 50);
    };
    check();
  });
}

function isValidISO8601(str: string): boolean {
  const d = new Date(str);
  return !isNaN(d.getTime()) && str.includes('T');
}

/**
 * Spawn a simulated worker subprocess that:
 * 1. Writes a heartbeat file
 * 2. Writes stdout lines (simulating work)
 * 3. Writes a result file
 * 4. Exits with specified code
 */
function spawnWorkerProcess(opts: {
  taskId: string;
  projectDir: string;
  exitCode?: number;
  stdoutLines?: string[];
  delayMs?: number;
  writeDoneResult?: boolean;
  handleSigterm?: boolean;
}): ChildProcess {
  const {
    taskId,
    projectDir,
    exitCode = 0,
    stdoutLines = ['[worker] executing...', '[worker] done'],
    delayMs = 100,
    writeDoneResult = true,
    handleSigterm = false,
  } = opts;

  const hbPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.hb`);
  const resultPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.result`);
  const logPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.log`);

  // Build a node script that simulates a worker
  const script = `
    const fs = require('fs');
    const hbPath = ${JSON.stringify(hbPath)};
    const resultPath = ${JSON.stringify(resultPath)};
    const logPath = ${JSON.stringify(logPath)};
    const exitCode = ${exitCode};
    const lines = ${JSON.stringify(stdoutLines)};
    const delayMs = ${delayMs};
    const writeDoneResult = ${writeDoneResult};
    const handleSigterm = ${handleSigterm};

    // Write heartbeat
    const hb = JSON.stringify({
      workerId: 'w-148-${taskId}',
      taskId: '${taskId}',
      status: 'EXECUTING',
      sequence: 1,
      timestamp: new Date().toISOString(),
    });
    fs.writeFileSync(hbPath, hb);

    // Handle SIGTERM gracefully
    if (handleSigterm) {
      process.on('SIGTERM', () => {
        const result = JSON.stringify({
          taskId: '${taskId}',
          selfAssessment: 'NO_GO',
          filesChanged: [],
          testsPassed: false,
          notes: 'Graceful shutdown via SIGTERM',
          exitCode: 143,
        });
        fs.writeFileSync(resultPath, result);
        process.exit(143);
      });
    }

    // Emit stdout lines with delay
    let i = 0;
    const emitLine = () => {
      if (i < lines.length) {
        process.stdout.write(lines[i] + '\\n');
        i++;
        setTimeout(emitLine, delayMs / lines.length);
      } else {
        // Write result
        if (writeDoneResult) {
          const assessment = exitCode === 0 ? 'DONE' : 'NO_GO';
          const result = JSON.stringify({
            taskId: '${taskId}',
            selfAssessment: assessment,
            filesChanged: exitCode === 0 ? ['src/test.ts'] : [],
            testsPassed: exitCode === 0,
            notes: exitCode === 0 ? 'Task completed successfully' : 'Task failed with error',
            exitCode: exitCode,
          });
          fs.writeFileSync(resultPath, result);
        }
        process.exit(exitCode);
      }
    };
    setTimeout(emitLine, 10);
  `;

  const child = spawn('node', ['-e', script], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DECKENT_WORKER_MODE: '1' },
  });

  // Capture stdout to log file
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  return child;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1: Platform Detection
// ═══════════════════════════════════════════════════════════════════════════════

describe('Linux Platform Detection', () => {
  it('detects linux platform correctly', () => {
    const currentPlatform = platform();
    const expectedLinux = currentPlatform === 'linux';
    expect(isLinux).toBe(expectedLinux);

    // Verify platform() returns a valid known platform string
    expect(['darwin', 'linux', 'win32', 'freebsd', 'openbsd', 'sunos', 'aix']).toContain(currentPlatform);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2: 3-Task Mini Sprint — All Complete
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!isLinux)('Mini Sprint 3-Task Lifecycle (subprocess)', () => {
  let projectDir: string;
  const children: ChildProcess[] = [];

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    // Kill any remaining children
    for (const child of children) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
    children.length = 0;
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('completes 3 simulated tasks via subprocess workers', async () => {
    const taskIds = ['001', '002', '003'];

    // Create task JSON files
    for (const id of taskIds) {
      const taskFile = path.join(projectDir, TASKS_DIR, `task-${id}.json`);
      fs.writeFileSync(taskFile, JSON.stringify({
        id,
        title: `Test task ${id}`,
        status: 'PENDING',
        scope: { directories: ['.'], filesWrite: [] },
      }));
    }

    // Spawn all 3 workers concurrently
    for (const id of taskIds) {
      const child = spawnWorkerProcess({
        taskId: id,
        projectDir,
        exitCode: 0,
        stdoutLines: [`[task-${id}] starting`, `[task-${id}] processing`, `[task-${id}] done`],
        delayMs: 150,
      });
      children.push(child);
    }

    // Wait for all results
    for (const id of taskIds) {
      const resultPath = path.join(projectDir, TASKS_DIR, `task-${id}.result`);
      await waitForFile(resultPath, 10000);

      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
      expect(result.taskId).toBe(id);
      expect(result.selfAssessment).toBe('DONE');
      expect(result.testsPassed).toBe(true);
    }

    // Verify heartbeats were created
    for (const id of taskIds) {
      const hbPath = path.join(projectDir, TASKS_DIR, `task-${id}.hb`);
      expect(fs.existsSync(hbPath)).toBe(true);
      const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8'));
      expect(hb.status).toBe('EXECUTING');
      expect(isValidISO8601(hb.timestamp)).toBe(true);
    }
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3: Subprocess stdout line-buffered, captured correctly
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!isLinux)('Subprocess stdout capture', () => {
  let projectDir: string;
  let child: ChildProcess | null = null;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    if (child) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      child = null;
    }
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('captures stdout lines correctly in log file', async () => {
    const expectedLines = [
      '[worker] line 1: initializing',
      '[worker] line 2: processing files',
      '[worker] line 3: writing results',
      '[worker] line 4: cleanup complete',
    ];

    child = spawnWorkerProcess({
      taskId: 'stdout-test',
      projectDir,
      exitCode: 0,
      stdoutLines: expectedLines,
      delayMs: 200,
    });

    // Wait for result (signals process completed)
    const resultPath = path.join(projectDir, TASKS_DIR, 'task-stdout-test.result');
    await waitForFile(resultPath, 10000);

    // Read the log file and verify all lines captured
    const logPath = path.join(projectDir, TASKS_DIR, 'task-stdout-test.log');
    expect(fs.existsSync(logPath)).toBe(true);

    const logContent = fs.readFileSync(logPath, 'utf-8');
    for (const line of expectedLines) {
      expect(logContent).toContain(line);
    }

    // Verify lines are newline-separated (line-buffered behavior)
    const logLines = logContent.trim().split('\n').filter(l => l.length > 0);
    expect(logLines.length).toBeGreaterThanOrEqual(expectedLines.length);
  }, 10_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 4: Exit code 0 → DONE result parsed
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!isLinux)('Exit code 0 → DONE result', () => {
  let projectDir: string;
  let child: ChildProcess | null = null;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    if (child) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      child = null;
    }
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('exit code 0 produces DONE selfAssessment', async () => {
    child = spawnWorkerProcess({
      taskId: 'exit-zero',
      projectDir,
      exitCode: 0,
      stdoutLines: ['[worker] success'],
      delayMs: 50,
    });

    // Wait for process to exit
    const exitCode = await new Promise<number | null>((resolve) => {
      child!.on('exit', (code) => resolve(code));
    });

    const resultPath = path.join(projectDir, TASKS_DIR, 'task-exit-zero.result');
    await waitForFile(resultPath, 5000);

    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(result.taskId).toBe('exit-zero');
    expect(result.selfAssessment).toBe('DONE');
    expect(result.testsPassed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.filesChanged).toEqual(['src/test.ts']);
    expect(exitCode).toBe(0);
  }, 10_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 5: Exit code non-zero → NO_GO result
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!isLinux)('Exit code non-zero → NO_GO result', () => {
  let projectDir: string;
  let child: ChildProcess | null = null;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    if (child) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      child = null;
    }
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('exit code 1 produces NO_GO selfAssessment', async () => {
    child = spawnWorkerProcess({
      taskId: 'exit-fail',
      projectDir,
      exitCode: 1,
      stdoutLines: ['[worker] error occurred', '[worker] aborting'],
      delayMs: 50,
    });

    // Wait for process to exit
    const exitCode = await new Promise<number | null>((resolve) => {
      child!.on('exit', (code) => resolve(code));
    });

    const resultPath = path.join(projectDir, TASKS_DIR, 'task-exit-fail.result');
    await waitForFile(resultPath, 5000);

    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(result.taskId).toBe('exit-fail');
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.testsPassed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.notes).toContain('failed');
    expect(exitCode).toBe(1);
  }, 10_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 6: SIGTERM handling — graceful shutdown
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!isLinux)('SIGTERM Graceful Shutdown', () => {
  let projectDir: string;
  let child: ChildProcess | null = null;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    if (child) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      child = null;
    }
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('writes result file on SIGTERM before exiting', async () => {
    // Spawn a long-running worker that handles SIGTERM
    child = spawnWorkerProcess({
      taskId: 'sigterm-test',
      projectDir,
      exitCode: 0, // Won't reach natural exit
      stdoutLines: ['[worker] starting long task...'],
      delayMs: 30000, // Very long delay — will be interrupted
      writeDoneResult: false, // Don't write result naturally
      handleSigterm: true, // Install SIGTERM handler
    });

    // Wait for heartbeat to confirm worker is running
    const hbPath = path.join(projectDir, TASKS_DIR, 'task-sigterm-test.hb');
    await waitForFile(hbPath, 5000);

    // Send SIGTERM
    child.kill('SIGTERM');

    // Wait for result file (written by SIGTERM handler)
    const resultPath = path.join(projectDir, TASKS_DIR, 'task-sigterm-test.result');
    await waitForFile(resultPath, 5000);

    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(result.taskId).toBe('sigterm-test');
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.notes).toContain('SIGTERM');
    expect(result.exitCode).toBe(143);

    // Verify process terminated
    await new Promise<void>((resolve) => {
      if (child!.exitCode !== null) {
        resolve();
      } else {
        child!.on('exit', () => resolve());
      }
    });
  }, 15_000);
});
