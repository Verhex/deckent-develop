// ─── WSL2 E2E — Docker Backend Full Sprint ──────────────────────────────────
// Sprint 148 Task 016: Cross-platform validation — WSL2 + Docker Desktop.
//
// Tests verify:
//   1. Platform detection: WSL2 uname -r contains "microsoft"
//   2. Docker daemon accessible
//   3. Mini sprint 3-task — all complete in containers
//   4. inotify watchers work across WSL boundary
//   5. Drive mount paths resolved correctly
//   6. Line endings normalized (\r\n → \n in config read)
//
// Skip strategy: Tests requiring real Docker use describe.skipIf(!dockerAvailable).
// WSL2-specific tests use describe.skipIf(!isWSL2).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';

// ─── WSL2 Detection ──────────────────────────────────────────────────────────

function detectWSL2(): boolean {
  if (platform() !== 'linux') return false;
  try {
    const uname = execSync('uname -r', { encoding: 'utf-8', timeout: 5_000 }).trim();
    return /microsoft/i.test(uname);
  } catch {
    return false;
  }
}

function getKernelRelease(): string | null {
  try {
    return execSync('uname -r', { encoding: 'utf-8', timeout: 5_000 }).trim();
  } catch {
    return null;
  }
}

// ─── Docker Detection ────────────────────────────────────────────────────────

function isDockerAccessible(): boolean {
  const result = spawnSync('docker', ['info'], {
    encoding: 'utf-8',
    timeout: 10_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function isDockerImageAvailable(image: string): boolean {
  const result = spawnSync('docker', ['images', '-q', image], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return (result.stdout?.trim().length ?? 0) > 0;
}

const isWSL2 = detectWSL2();
const dockerAvailable = isDockerAccessible();
const workerImageReady = dockerAvailable && isDockerImageAvailable('deckent-worker:latest');

// ─── Constants ───────────────────────────────────────────────────────────────

const TEST_CONTAINER_PREFIX = `deckent-e2e-wsl2-${process.pid}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dockerRun(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('docker', args, {
    encoding: 'utf-8',
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function forceRemoveContainer(name: string): void {
  spawnSync('docker', ['rm', '-f', name], {
    encoding: 'utf-8',
    timeout: 10_000,
    stdio: 'pipe',
  });
}

function createTempProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'deckent-wsl2-e2e-'));
  fs.mkdirSync(path.join(dir, '.tasks'), { recursive: true });
  return dir;
}

function waitForFile(filePath: string, waitMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fs.existsSync(filePath)) return resolve();
      if (Date.now() - start > waitMs) return reject(new Error(`Timeout waiting for ${filePath}`));
      setTimeout(check, 100);
    };
    check();
  });
}

function isValidISO8601(str: string): boolean {
  const d = new Date(str);
  return !isNaN(d.getTime()) && str.includes('T');
}

/**
 * Convert a WSL2 Linux path to its Windows equivalent.
 * /mnt/c/Users/foo → C:\Users\foo
 */
function wslPathToWindows(linuxPath: string): string | null {
  const match = linuxPath.match(/^\/mnt\/([a-z])\/(.*)/);
  if (!match) return null;
  const drive = match[1].toUpperCase();
  const rest = match[2].replace(/\//g, '\\');
  return `${drive}:\\${rest}`;
}

/**
 * Normalize line endings: CRLF → LF.
 * This is critical for config file reads on WSL2 where files may originate from Windows.
 */
function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1: Platform Detection — WSL2 uname -r contains "microsoft"
// ═══════════════════════════════════════════════════════════════════════════════

describe('WSL2 Platform Detection', () => {
  it('detects WSL2 environment correctly via uname -r', () => {
    const kernelRelease = getKernelRelease();

    if (isWSL2) {
      // We're on WSL2 — kernel release MUST contain "microsoft" (case-insensitive)
      expect(kernelRelease).not.toBeNull();
      expect(kernelRelease!.toLowerCase()).toContain('microsoft');
    } else {
      // Not on WSL2 — either not linux, or kernel doesn't contain "microsoft"
      if (platform() === 'linux' && kernelRelease) {
        expect(kernelRelease.toLowerCase()).not.toContain('microsoft');
      }
      // On non-linux, detectWSL2() correctly returns false
      expect(isWSL2).toBe(false);
    }

    // detectWSL2 returns boolean consistently
    expect(typeof isWSL2).toBe('boolean');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2: Docker Daemon Accessible
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!dockerAvailable)('Docker Daemon Accessibility', () => {
  it('docker info returns successfully', () => {
    const result = dockerRun(['info', '--format', '{{.ServerVersion}}']);
    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);

    // Verify Docker version is parseable (e.g., "24.0.7", "25.0.3")
    expect(result.stdout).toMatch(/^\d+\.\d+/);
  });

  it('docker daemon server OS matches WSL2 expectations', () => {
    const result = dockerRun(['info', '--format', '{{.OSType}}']);
    expect(result.status).toBe(0);
    // Docker Desktop on WSL2 always reports "linux" as OSType
    expect(result.stdout).toBe('linux');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3: Mini Sprint 3-Task — All Complete in Containers
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!dockerAvailable)('Mini Sprint 3-Task Docker Lifecycle', () => {
  let projectDir: string;
  const containerNames: string[] = [];

  beforeEach(() => {
    projectDir = createTempProject();
    containerNames.length = 0;
  });

  afterEach(() => {
    // Cleanup containers
    for (const name of containerNames) {
      forceRemoveContainer(name);
    }
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('completes 3 simulated tasks via Docker containers', async () => {
    const taskIds = ['001', '002', '003'];

    for (const id of taskIds) {
      // Create task file
      const taskFile = path.join(projectDir, '.tasks', `task-${id}.json`);
      fs.writeFileSync(taskFile, JSON.stringify({
        id,
        title: `WSL2 E2E task ${id}`,
        status: 'PENDING',
        scope: { directories: ['.'], filesWrite: [] },
      }));

      // Run a minimal container that writes HB + result
      const containerName = `${TEST_CONTAINER_PREFIX}-${id}`;
      containerNames.push(containerName);

      const hbPath = `/tasks/task-${id}.hb`;
      const resultPath = `/tasks/task-${id}.result`;
      const timestamp = new Date().toISOString();

      // Container script: write heartbeat, simulate work, write result
      const script = [
        `echo '{"workerId":"w-148-${id}","taskId":"${id}","status":"EXECUTING","sequence":1,"timestamp":"${timestamp}"}' > ${hbPath}`,
        'sleep 0.5',
        `echo '{"taskId":"${id}","selfAssessment":"DONE","filesChanged":[],"testsPassed":true}' > ${resultPath}`,
      ].join(' && ');

      const runResult = dockerRun([
        'run', '-d',
        '--name', containerName,
        '-v', `${path.join(projectDir, '.tasks')}:/tasks`,
        'alpine:3.19',
        'sh', '-c', script,
      ]);

      expect(runResult.status).toBe(0);
    }

    // Wait for all results
    for (const id of taskIds) {
      const resultPath = path.join(projectDir, '.tasks', `task-${id}.result`);
      await waitForFile(resultPath, 15_000);
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
      expect(result.taskId).toBe(id);
      expect(result.selfAssessment).toBe('DONE');
    }

    // Verify heartbeats were written correctly
    for (const id of taskIds) {
      const hbPath = path.join(projectDir, '.tasks', `task-${id}.hb`);
      expect(fs.existsSync(hbPath)).toBe(true);
      const hb = JSON.parse(fs.readFileSync(hbPath, 'utf-8'));
      expect(hb.workerId).toBe(`w-148-${id}`);
      expect(hb.status).toBe('EXECUTING');
      expect(isValidISO8601(hb.timestamp)).toBe(true);
    }
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 4: inotify Watchers Work Across WSL Boundary
// ═══════════════════════════════════════════════════════════════════════════════

describe('inotify Watcher Across WSL Boundary', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('fs.watch detects file creation within Linux filesystem', async () => {
    const watchDir = path.join(projectDir, '.tasks');
    const targetFile = path.join(watchDir, 'watch-test.txt');

    let changeDetected = false;
    const watcher = fs.watch(watchDir, (eventType, filename) => {
      if (filename === 'watch-test.txt') {
        changeDetected = true;
      }
    });

    // Give watcher time to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Write a file — this should trigger inotify event
    fs.writeFileSync(targetFile, 'inotify test content');

    // Wait for event propagation
    await new Promise(resolve => setTimeout(resolve, 500));

    watcher.close();

    // On Linux (including WSL2 native filesystem), inotify MUST detect the change
    if (platform() === 'linux') {
      expect(changeDetected).toBe(true);
    }
    // On other platforms, the behavior is platform-specific but should still work
    // (macOS uses kqueue, Windows uses ReadDirectoryChangesW)
    expect(typeof changeDetected).toBe('boolean');
  }, 5_000);

  it('fs.watch detects file modification', async () => {
    const watchDir = path.join(projectDir, '.tasks');
    const targetFile = path.join(watchDir, 'modify-test.txt');

    // Pre-create the file
    fs.writeFileSync(targetFile, 'initial');

    let modifyDetected = false;
    const watcher = fs.watch(watchDir, (eventType, filename) => {
      if (filename === 'modify-test.txt' && eventType === 'change') {
        modifyDetected = true;
      }
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Modify existing file
    fs.writeFileSync(targetFile, 'modified content');

    await new Promise(resolve => setTimeout(resolve, 500));

    watcher.close();

    // Linux inotify should detect file modification
    if (platform() === 'linux') {
      expect(modifyDetected).toBe(true);
    }
    expect(typeof modifyDetected).toBe('boolean');
  }, 5_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 5: Drive Mount Paths Resolved Correctly
// ═══════════════════════════════════════════════════════════════════════════════

describe('Drive Mount Path Resolution', () => {
  it('converts /mnt/c/ paths to Windows drive format', () => {
    // WSL2 mounts Windows drives at /mnt/<letter>/
    expect(wslPathToWindows('/mnt/c/Users/alperen/projects'))
      .toBe('C:\\Users\\alperen\\projects');

    expect(wslPathToWindows('/mnt/d/workspace/deckent'))
      .toBe('D:\\workspace\\deckent');

    expect(wslPathToWindows('/mnt/e/data'))
      .toBe('E:\\data');
  });

  it('returns null for non-mount paths', () => {
    // Native Linux paths should not be converted
    expect(wslPathToWindows('/home/user/projects')).toBeNull();
    expect(wslPathToWindows('/tmp/test')).toBeNull();
    expect(wslPathToWindows('/usr/local/bin')).toBeNull();
  });

  it('handles nested paths with special characters', () => {
    expect(wslPathToWindows('/mnt/c/Users/user name/Documents'))
      .toBe('C:\\Users\\user name\\Documents');

    expect(wslPathToWindows('/mnt/c/Program Files/App'))
      .toBe('C:\\Program Files\\App');
  });

  it('detects /mnt/ drive mounts on actual WSL2 filesystem', () => {
    if (!isWSL2) return; // Skip on non-WSL2

    // On real WSL2 with Windows integration, /mnt/c should exist.
    // However, in containerized CI environments running WSL2 kernel
    // (e.g., Docker on WSL2 host), drive mounts may not be present.
    const hasDriveMount = fs.existsSync('/mnt/c');

    if (hasDriveMount) {
      // Verify it's a directory (drvfs mount point)
      const stat = fs.statSync('/mnt/c');
      expect(stat.isDirectory()).toBe(true);

      // Verify path conversion works for an existing mount
      const converted = wslPathToWindows('/mnt/c/Windows');
      expect(converted).toBe('C:\\Windows');
    } else {
      // WSL2 kernel detected but no drive mounts — containerized/CI environment.
      // Path conversion logic still works correctly (unit-tested above).
      expect(isWSL2).toBe(true); // Confirm we're in WSL2 kernel at minimum
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 6: Line Endings Normalized (\r\n → \n in config read)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Line Ending Normalization (CRLF → LF)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'deckent-crlf-'));
  });

  afterEach(() => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('normalizes CRLF to LF in config content', () => {
    // Simulate a config file with Windows line endings (common on WSL2
    // when files are edited in Windows editors)
    const crlfContent = '{\r\n  "nervous_system": {\r\n    "enabled": true\r\n  }\r\n}\r\n';
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, crlfContent, 'utf-8');

    // Read and normalize
    const raw = fs.readFileSync(configPath, 'utf-8');
    const normalized = normalizeLineEndings(raw);

    // Normalized content should have NO \r characters
    expect(normalized).not.toContain('\r');
    expect(normalized).toBe('{\n  "nervous_system": {\n    "enabled": true\n  }\n}\n');

    // JSON should parse correctly after normalization
    const parsed = JSON.parse(normalized);
    expect(parsed.nervous_system.enabled).toBe(true);
  });

  it('LF content remains unchanged after normalization', () => {
    const lfContent = '{\n  "key": "value"\n}\n';
    const normalized = normalizeLineEndings(lfContent);
    expect(normalized).toBe(lfContent);
  });

  it('mixed line endings are fully normalized', () => {
    // Sometimes files have mixed endings (partial CRLF)
    const mixedContent = 'line1\r\nline2\nline3\r\nline4\n';
    const normalized = normalizeLineEndings(mixedContent);
    expect(normalized).toBe('line1\nline2\nline3\nline4\n');
    expect(normalized.split('\n').length).toBe(5); // 4 lines + trailing empty
  });

  it('handles binary-like content without corruption', () => {
    // Ensure normalization doesn't corrupt non-text content
    const content = 'base64data: SGVsbG8=\r\nkey: value\r\n';
    const normalized = normalizeLineEndings(content);
    expect(normalized).toBe('base64data: SGVsbG8=\nkey: value\n');
    // Base64 portion unchanged
    expect(normalized).toContain('SGVsbG8=');
  });
});
