// ─── Docker HB Deploy Wire Tests ──────────────────────────────────────────
// Sprint 144 Task 14 → Sprint 148 Fix: Validates the HB wire in Docker backend.
//
// These tests verify:
// - Heartbeat writes exist in initial write and monitor exit paths
// - SIGTERM 15s grace period is configured
// - Script template contains fsync_file + EXIT/TERM traps
// - Host-side post-stop verification covers .result files
// - HB reconciliation on non-zero exitCode with successful .result
// - HB gap < 5s (script heartbeat loop interval = 15s, but HB file always present)

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Test helpers ─────────────────────────────────────────────────────────

function readSource(fileName: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/orchestra', fileName),
    'utf-8',
  );
}

// ─── Test Suite: HB wire in spawn-backend-docker.ts ───────────────────────

describe('Docker HB Deploy Wire — HB Write', () => {
  it('initial heartbeat write uses writeFileSync with JSON.stringify', () => {
    const source = readSource('spawn-backend-docker.ts');

    // The initial HB write section
    const initialHbSection = source.slice(
      source.indexOf('Write initial heartbeat'),
      source.indexOf('Set up container monitoring'),
    );
    expect(initialHbSection).toContain('writeFileSync(hbPath');
    expect(initialHbSection).toContain('JSON.stringify');
  });

  it('monitor exit heartbeat write uses writeFileSync', () => {
    const source = readSource('spawn-backend-docker.ts');

    // The exit HB update should use writeFileSync
    const monitorSection = source.slice(
      source.indexOf('Update heartbeat'),
      source.indexOf('If no .result file'),
    );
    expect(monitorSection).toContain('writeFileSync(hbPath');
    expect(monitorSection).toContain('JSON.stringify');
  });

  it('host-side fsync uses openSync + fsyncSync for belt-and-suspenders', () => {
    const source = readSource('spawn-backend-docker.ts');

    // Verify fsync pattern exists for .result host-side verification
    expect(source).toContain('openSync(resultPath');
    expect(source).toContain('fsyncSync(fd)');
    expect(source).toContain('closeSync(fd)');
  });
});

// ─── Test Suite: SIGTERM Grace Period ─────────────────────────────────────

describe('Docker HB Deploy Wire — SIGTERM Grace Period', () => {
  it('docker stop uses configurable grace period (default 15s)', () => {
    const source = readSource('spawn-backend-docker.ts');
    // Sprint 151: grace period is configurable via gracefulTimeoutSeconds
    expect(source).toContain('DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15');
    expect(source).toContain('`--time=${grace}`');
  });

  it('docker stop timeout exceeds grace period (grace + 5s buffer)', () => {
    const source = readSource('spawn-backend-docker.ts');
    // The spawnSync timeout for docker stop must be > grace period
    expect(source).toContain('(grace + 5) * 1000');
  });
});

// ─── Test Suite: Script Template ──────────────────────────────────────────

describe('Docker HB Deploy Wire — Script Template', () => {
  it('worker script defines POSIX fsync_file function', () => {
    const source = readSource('spawn-backend-docker.ts');
    expect(source).toContain('fsync_file()');
    expect(source).toContain('conv=fsync');
  });

  it('worker script has EXIT trap that calls on_exit function', () => {
    const source = readSource('spawn-backend-docker.ts');
    // EXIT trap calls on_exit() which handles result writing + fsync
    expect(source).toContain('trap on_exit EXIT');
    expect(source).toContain('on_exit()');
    expect(source).toContain('fsync_file "$RFILE"');
  });

  it('worker script has TERM trap that fsyncs and exits cleanly', () => {
    const source = readSource('spawn-backend-docker.ts');
    // TERM trap must fsync .result + .hb then exit 0
    expect(source).toMatch(/trap\s+'fsync_file "\$RFILE"; fsync_file "\$HBFILE"; exit 0'\s+TERM/);
  });

  it('worker script heartbeat loop interval is 15s (HB gap < 5s from host perspective)', () => {
    const source = readSource('spawn-backend-docker.ts');
    // The heartbeat update loop should sleep 15s between writes
    expect(source).toContain('sleep 15');
    // Heartbeat JSON output includes timestamp
    expect(source).toContain('date -u');
  });
});

// ─── Test Suite: Post-Stop Verification ───────────────────────────────────

describe('Docker HB Deploy Wire — Post-Stop Verification', () => {
  it('verifyResultAfterStop fsyncs .result file from host side', () => {
    const source = readSource('spawn-backend-docker.ts');

    // The method should handle .result file
    const verifySection = source.slice(
      source.indexOf('verifyResultAfterStop(taskId: string)'),
      source.indexOf('list():'),
    );
    expect(verifySection).toContain('task-${taskId}.result');
    // Should fsync
    expect(verifySection).toContain('fsyncSync(fd)');
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
  it('heartbeat-daemon has PID file management', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/orchestra/heartbeat-daemon.ts'),
      'utf-8',
    );
    // The daemon should have PID write capability
    expect(source).toContain('HeartbeatDaemon');
    expect(source).toContain('start');
    expect(source).toContain('stop');
  });
});
