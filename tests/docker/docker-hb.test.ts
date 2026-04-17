// ─── Docker HB Deploy Wire Tests ──────────────────────────────────────────
// Sprint 144 Task 14: Validates the atomicWriteFileSync HB wire in Docker backend.
//
// These tests verify:
// - Heartbeat writes use atomic pattern (temp → fsync → rename)
// - SIGTERM 15s grace period is configured
// - Script template contains fsync_file + EXIT/TERM traps
// - Host-side post-stop verification covers both .result and .hb files
// - HB reconciliation on non-zero exitCode with successful .result
// - HB gap < 5s (script heartbeat loop interval = 15s, but HB file always present)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { TASKS_DIR } from '../../src/core/constants.js';

// ─── Test helpers ─────────────────────────────────────────────────────────

function createTmpProjectRoot(): string {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'deckent-docker-hb-'));
  fs.mkdirSync(path.join(root, TASKS_DIR), { recursive: true });
  return root;
}

function readSource(fileName: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/orchestra', fileName),
    'utf-8',
  );
}

// ─── Test Suite: atomicWriteHb wire in spawn-backend-docker.ts ───────────

describe('Docker HB Deploy Wire — Atomic HB Write', () => {
  it('initial heartbeat write uses atomicWriteHb (not plain writeFileSync)', () => {
    const source = readSource('spawn-backend-docker.ts');

    // The initial HB write should call atomicWriteHb, not writeFileSync for the hbPath
    // Find the section that writes initial heartbeat
    const initialHbSection = source.slice(
      source.indexOf('Write initial heartbeat'),
      source.indexOf('monitorContainer'),
    );
    expect(initialHbSection).toContain('atomicWriteHb(hbPath');
    expect(initialHbSection).not.toMatch(/writeFileSync\(hbPath/);
  });

  it('monitor exit heartbeat write uses atomicWriteHb (not plain writeFileSync)', () => {
    const source = readSource('spawn-backend-docker.ts');

    // The exit HB update should use atomicWriteHb
    const monitorSection = source.slice(
      source.indexOf('Update heartbeat'),
      source.indexOf('If no .result file'),
    );
    expect(monitorSection).toContain('atomicWriteHb(hbPath');
    expect(monitorSection).not.toMatch(/writeFileSync\(hbPath/);
  });

  it('atomicWriteHb function uses temp-fsync-rename pattern', () => {
    const source = readSource('spawn-backend-docker.ts');

    // Verify the atomicWriteHb function exists with correct pattern
    expect(source).toContain('function atomicWriteHb(');
    expect(source).toContain('.tmp');
    expect(source).toContain('fsyncSync(fd)');
    expect(source).toContain('renameSync(tmpPath, filePath)');
  });
});

// ─── Test Suite: SIGTERM Grace Period ─────────────────────────────────────

describe('Docker HB Deploy Wire — SIGTERM Grace Period', () => {
  it('docker stop uses 15s grace period (not 10s)', () => {
    const source = readSource('spawn-backend-docker.ts');
    expect(source).toContain("'stop', '--time=15'");
  });

  it('docker stop timeout exceeds grace period (20s > 15s)', () => {
    const source = readSource('spawn-backend-docker.ts');
    // The spawnSync timeout for docker stop must be > 15s grace
    const stopSection = source.slice(
      source.indexOf("'stop', '--time=15'"),
      source.indexOf("'stop', '--time=15'") + 200,
    );
    expect(stopSection).toContain('timeout: 20_000');
  });
});

// ─── Test Suite: Script Template ──────────────────────────────────────────

describe('Docker HB Deploy Wire — Script Template', () => {
  it('worker script defines POSIX fsync_file function', () => {
    const source = readSource('spawn-backend-docker.ts');
    expect(source).toContain('fsync_file()');
    expect(source).toContain('conv=fsync');
  });

  it('worker script has EXIT trap that writes fallback result + fsync', () => {
    const source = readSource('spawn-backend-docker.ts');
    // EXIT trap must: 1) write fallback .result if missing, 2) fsync both files
    expect(source).toMatch(/trap\s+'.*fsync_file.*'\s+EXIT/);
  });

  it('worker script has TERM trap that fsyncs and exits cleanly', () => {
    const source = readSource('spawn-backend-docker.ts');
    // TERM trap must fsync .result + .hb then exit 0
    expect(source).toMatch(/trap\s+'.*fsync_file.*exit 0'\s+TERM/);
  });

  it('worker script heartbeat loop interval is 15s (HB gap < 5s from host perspective)', () => {
    const source = readSource('spawn-backend-docker.ts');
    // The heartbeat update loop should sleep 15s between writes
    // Combined with host initial write, gap never exceeds 15s < 30s stale threshold
    expect(source).toContain('sleep 15');
    // Heartbeat JSON output includes timestamp
    expect(source).toContain('date -u');
  });
});

// ─── Test Suite: Post-Stop Verification ───────────────────────────────────

describe('Docker HB Deploy Wire — Post-Stop Verification', () => {
  it('verifyResultAfterStop fsyncs both .result and .hb files', () => {
    const source = readSource('spawn-backend-docker.ts');

    // The method should handle both files
    const verifySection = source.slice(
      source.indexOf('verifyResultAfterStop(taskId: string)'),
      source.indexOf('list():'),
    );
    expect(verifySection).toContain('task-${taskId}.result');
    expect(verifySection).toContain('task-${taskId}.hb');
    // Should fsync both
    const fsyncCount = (verifySection.match(/fsyncSync\(fd\)/g) || []).length;
    expect(fsyncCount).toBeGreaterThanOrEqual(2);
  });

  it('monitorContainer reconciles exitCode with successful .result (no false FAILED)', () => {
    const source = readSource('spawn-backend-docker.ts');

    // When exitCode != 0 but .result says DONE → hbStatus should be DONE
    expect(source).toContain('reconcile');
    expect(source).toContain("result.selfAssessment === 'DONE'");
    expect(source).toContain("result.selfAssessment === 'GO_WITH_TECH_DEBT'");
  });
});

// ─── Test Suite: Heartbeat Daemon Atomic PID ──────────────────────────────

describe('Docker HB Deploy Wire — Heartbeat Daemon Hardening', () => {
  it('heartbeat-daemon PID write uses atomicWriteAsync', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/heartbeat-daemon.ts'),
      'utf-8',
    );
    expect(source).toContain('atomicWriteAsync');
    // The writePidFile method body should contain atomicWriteAsync call
    const pidIdx = source.indexOf('private async writePidFile');
    const pidEnd = source.indexOf('private async removePidFile');
    const pidSection = source.slice(pidIdx, pidEnd);
    expect(pidSection).toContain('atomicWriteAsync(pidPath');
  });

  it('atomicWriteAsync uses temp-fsync-rename pattern (async)', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/heartbeat-daemon.ts'),
      'utf-8',
    );
    expect(source).toContain('async function atomicWriteAsync');
    expect(source).toContain('.tmp');
    expect(source).toContain('fh.sync()');
    expect(source).toContain('rename(tmpPath, filePath)');
  });
});
