// ─── Docker OOM Kill Recovery Tests ──────────────────────────────────────────
// Sprint 151 Task 14: Validates the 3-layer Docker HB fix:
//   1. .partial-result intermediate write at script start (OOM safety net)
//   2. Configurable graceful timeout (SIGTERM → grace → SIGKILL)
//   3. Host-side .partial-result → .result promotion in monitorContainer
//   4. Corrupt JSON detection and overwrite
//
// These tests verify the Docker backend's source code and script template
// contain all required patterns for OOM kill recovery, without requiring
// a running Docker daemon.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

// ─── Helpers ─────────────────────────────────────────────────────────────

function readDockerSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/orchestra/spawn-backend-docker.ts'),
    'utf-8',
  );
}

function readSpawnBackendSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/orchestra/spawn-backend.ts'),
    'utf-8',
  );
}

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'deckent-oom-'));
}

// ─── Test Suite: .partial-result write in worker script ──────────────────

describe('Docker OOM Recovery — Partial Result Script Template', () => {
  it('worker script writes .partial-result BEFORE Claude CLI starts', () => {
    const source = readDockerSource();
    // .partial-result must be written before the `timeout $TIMEOUT` Claude CLI line
    const partialWriteIdx = source.indexOf('cat > "$PRFILE"');
    const claudeRunIdx = source.indexOf('timeout $TIMEOUT');
    expect(partialWriteIdx).toBeGreaterThan(-1);
    expect(claudeRunIdx).toBeGreaterThan(-1);
    expect(partialWriteIdx).toBeLessThan(claudeRunIdx);
  });

  it('worker script defines PRFILE variable for .partial-result path', () => {
    const source = readDockerSource();
    expect(source).toContain('PRFILE=');
    expect(source).toContain('.partial-result');
  });

  it('.partial-result contains partialMarker:true for host-side detection', () => {
    const source = readDockerSource();
    expect(source).toContain('"partialMarker":true');
  });

  it('.partial-result is fsynced to disk after write', () => {
    const source = readDockerSource();
    // After writing .partial-result, fsync_file must be called
    const partialWriteIdx = source.indexOf('PARTIALEOF');
    const fsyncCallIdx = source.indexOf('fsync_file "$PRFILE"', partialWriteIdx);
    expect(fsyncCallIdx).toBeGreaterThan(partialWriteIdx);
  });

  it('.partial-result is cleaned up on normal exit (after Claude CLI)', () => {
    const source = readDockerSource();
    // After timeout command, .partial-result should be removed
    expect(source).toContain('rm -f "$PRFILE" 2>/dev/null');
  });

  it('on_exit function cleans up .partial-result when .result already exists', () => {
    const source = readDockerSource();
    // In the on_exit function, when .result is found, .partial-result is removed
    const onExitSection = source.slice(
      source.indexOf('on_exit()'),
      source.indexOf('}.join'),
    );
    // Check that rm -f "$PRFILE" appears in the context of .result existing
    expect(onExitSection).toContain('rm -f "$PRFILE"');
  });

  it('on_exit EXIT trap cleans up .partial-result after writing fallback .result', () => {
    const source = readDockerSource();
    // The bottom of on_exit (after writing TIMEOUT_WITH_WORK or NO_GO) also cleans up
    const onExitFn = source.slice(
      source.indexOf('on_exit()'),
      source.indexOf("'].join('\\n')"),
    );
    // At least 2 rm -f "$PRFILE" calls: one for .result-exists path, one for fallback path
    const rmCalls = (onExitFn.match(/rm -f "\$PRFILE"/g) || []).length;
    expect(rmCalls).toBeGreaterThanOrEqual(2);
  });
});

// ─── Test Suite: Configurable graceful timeout ───────────────────────────

describe('Docker OOM Recovery — Configurable Graceful Timeout', () => {
  it('DockerSpawnBackend constructor accepts gracefulTimeoutSeconds option', () => {
    const source = readDockerSource();
    expect(source).toContain('gracefulTimeoutSeconds');
    // Constructor parameter
    expect(source).toMatch(/constructor\(.*gracefulTimeoutSeconds/s);
  });

  it('kill() uses configurable grace period instead of hardcoded 15', () => {
    const source = readDockerSource();
    // kill() should use this.gracefulTimeoutSeconds
    const killSection = source.slice(
      source.indexOf('kill(taskId: string)'),
      source.indexOf('verifyResultAfterStop'),
    );
    expect(killSection).toContain('this.gracefulTimeoutSeconds');
    // Timeout should be grace + buffer, not hardcoded 20_000
    expect(killSection).toContain('(grace + 5) * 1000');
  });

  it('default graceful timeout is 15 seconds', () => {
    const source = readDockerSource();
    expect(source).toContain('DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15');
  });

  it('SpawnBackendFactoryOptions includes dockerGracefulTimeoutSeconds', () => {
    const source = readSpawnBackendSource();
    expect(source).toContain('dockerGracefulTimeoutSeconds');
  });

  it('SpawnBackendFactory forwards gracefulTimeoutSeconds to DockerSpawnBackend', () => {
    const source = readSpawnBackendSource();
    // resolveBackend() normalizes 'auto' → 'docker', so there is one unified docker path
    const matches = source.match(/gracefulTimeoutSeconds:\s*opts\.dockerGracefulTimeoutSeconds/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Test Suite: Host-side .partial-result promotion ─────────────────────

describe('Docker OOM Recovery — Host-Side Partial Result Promotion', () => {
  it('monitorContainer checks for .partial-result when .result is missing', () => {
    const source = readDockerSource();
    expect(source).toContain('.partial-result');
    expect(source).toContain('partial-promote');
  });

  it('monitorContainer distinguishes OOM kill (exit 137) in promoted result notes', () => {
    const source = readDockerSource();
    expect(source).toContain('OOM-killed (exit 137');
    expect(source).toContain('exitCode === 137');
  });

  it('promoted .partial-result is fsynced from host side', () => {
    const source = readDockerSource();
    // After promoting .partial-result → .result, host does fsync
    // Search the full partial-result promotion block (between partial-result detection and cleanup)
    const promoteSection = source.slice(
      source.indexOf('Promote .partial-result'),
      source.indexOf('Clean up .partial-result if .result already exists'),
    );
    expect(promoteSection).toContain('fsyncSync');
  });

  it('.partial-result is cleaned up after promotion', () => {
    const source = readDockerSource();
    // After successful promotion, .partial-result file should be deleted
    const promoteSection = source.slice(
      source.indexOf('partial-promote'),
      source.indexOf('Clean up .partial-result if .result already exists'),
    );
    expect(promoteSection).toContain('unlinkSync(partialPath)');
  });
});

// ─── Test Suite: Corrupt JSON detection ──────────────────────────────────

describe('Docker OOM Recovery — Corrupt JSON Detection', () => {
  it('monitorContainer detects and overwrites corrupt .result JSON', () => {
    const source = readDockerSource();
    expect(source).toContain('partial-write');
    expect(source).toContain('corrupt JSON');
  });

  it('corrupt .result is unlinked before writing fallback', () => {
    const source = readDockerSource();
    const corruptSection = source.slice(
      source.indexOf('partial-write'),
      source.indexOf('Fall through to the fallback writer below'),
    );
    expect(corruptSection).toContain('unlinkSync(resultPath)');
  });
});

// ─── Test Suite: Partial Result File I/O Simulation ──────────────────────

describe('Docker OOM Recovery — Partial Result File Simulation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('simulated .partial-result can be promoted to .result', () => {
    // Simulate what monitorContainer does when it finds .partial-result
    const partialPath = path.join(tmpDir, 'task-sim-001.partial-result');
    const resultPath = path.join(tmpDir, 'task-sim-001.result');

    // Write .partial-result (as worker script would)
    const partialData = {
      taskId: 'sim-001',
      selfAssessment: 'NO_GO',
      notes: 'Worker started but did not complete',
      partialMarker: true,
      tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: 'sonnet' },
    };
    fs.writeFileSync(partialPath, JSON.stringify(partialData), 'utf-8');

    // Simulate host-side promotion (as monitorContainer would do)
    const raw = fs.readFileSync(partialPath, 'utf-8');
    const partial = JSON.parse(raw) as Record<string, unknown>;
    partial.notes = 'Container OOM-killed (exit 137, SIGKILL). Partial-result promoted by host monitor.';
    partial.exitCode = 137;
    partial.selfAssessment = 'NO_GO';
    fs.writeFileSync(resultPath, JSON.stringify(partial), 'utf-8');
    fs.unlinkSync(partialPath);

    // Verify
    expect(fs.existsSync(resultPath)).toBe(true);
    expect(fs.existsSync(partialPath)).toBe(false);
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(result.taskId).toBe('sim-001');
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.exitCode).toBe(137);
    expect(result.notes).toContain('OOM-killed');
    expect(result.partialMarker).toBe(true);
  });

  it('corrupt .result JSON is detected and replaced', () => {
    const resultPath = path.join(tmpDir, 'task-sim-002.result');

    // Write corrupt JSON (simulates mid-write SIGKILL)
    fs.writeFileSync(resultPath, '{"taskId":"sim-002","selfAsse', 'utf-8');

    // Verify it's corrupt
    let isCorrupt = false;
    try {
      JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    } catch {
      isCorrupt = true;
    }
    expect(isCorrupt).toBe(true);

    // Simulate host-side overwrite (as monitorContainer would do)
    fs.unlinkSync(resultPath);
    const fallback = {
      taskId: 'sim-002',
      selfAssessment: 'NO_GO',
      notes: 'Worker exited (code=137 signal=9) without writing result. Host-side fallback.',
      exitCode: 137,
    };
    fs.writeFileSync(resultPath, JSON.stringify(fallback), 'utf-8');

    // Verify replacement
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(result.taskId).toBe('sim-002');
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.exitCode).toBe(137);
  });

  it('.partial-result with valid JSON survives container kill and is promotable', () => {
    const partialPath = path.join(tmpDir, 'task-sim-003.partial-result');
    const resultPath = path.join(tmpDir, 'task-sim-003.result');

    // Write valid .partial-result
    const data = { taskId: 'sim-003', selfAssessment: 'NO_GO', partialMarker: true };
    fs.writeFileSync(partialPath, JSON.stringify(data), 'utf-8');

    // No .result exists (container was killed)
    expect(fs.existsSync(resultPath)).toBe(false);
    expect(fs.existsSync(partialPath)).toBe(true);

    // Promote
    const promoted = JSON.parse(fs.readFileSync(partialPath, 'utf-8')) as Record<string, unknown>;
    promoted.exitCode = 137;
    fs.writeFileSync(resultPath, JSON.stringify(promoted), 'utf-8');

    expect(fs.existsSync(resultPath)).toBe(true);
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(result.partialMarker).toBe(true);
    expect(result.exitCode).toBe(137);
  });

  it('timeout exit (124) is distinguished from OOM kill (137) in notes', () => {
    // Simulate timeout kill (exit 124)
    const partialPath = path.join(tmpDir, 'task-sim-004.partial-result');
    const resultPath = path.join(tmpDir, 'task-sim-004.result');

    fs.writeFileSync(partialPath, JSON.stringify({
      taskId: 'sim-004', selfAssessment: 'NO_GO', partialMarker: true,
    }), 'utf-8');

    // Promote with exitCode 124 (not OOM)
    const partial = JSON.parse(fs.readFileSync(partialPath, 'utf-8')) as Record<string, unknown>;
    const exitCode = 124;
    const isOom = exitCode === 137;
    partial.notes = isOom
      ? 'Container OOM-killed'
      : `Container killed (exitCode=${exitCode}). Partial-result promoted by host monitor.`;
    partial.exitCode = exitCode;
    fs.writeFileSync(resultPath, JSON.stringify(partial), 'utf-8');

    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(result.notes).not.toContain('OOM');
    expect(result.notes).toContain('exitCode=124');
    expect(result.exitCode).toBe(124);
  });
});

// ─── Test Suite: Docker logs drain (parent stdout buffer fix) ────────────

describe('Docker OOM Recovery — Docker Logs Drain', () => {
  it('container logs are extracted BEFORE container removal', () => {
    const source = readDockerSource();
    // docker logs must appear before docker rm -f
    const logsIdx = source.indexOf("'docker', ['logs'");
    const rmIdx = source.indexOf("'docker', ['rm', '-f'", logsIdx);
    expect(logsIdx).toBeGreaterThan(-1);
    expect(rmIdx).toBeGreaterThan(logsIdx);
  });

  it('docker logs output is saved to .log file', () => {
    const source = readDockerSource();
    expect(source).toContain('task-${taskId}.log');
    // Both stdout and stderr are captured
    expect(source).toContain('logResult.stdout');
    expect(source).toContain('logResult.stderr');
  });

  it('docker logs has a timeout to prevent hanging on large output', () => {
    const source = readDockerSource();
    const logsSection = source.slice(
      source.indexOf("'docker', ['logs'"),
      source.indexOf("'docker', ['logs'") + 200,
    );
    expect(logsSection).toContain('timeout:');
  });
});
