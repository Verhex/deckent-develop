// Task 270-008 — F1-IMG part 2: doctor worker-image readiness line + --fix-image
// consent-based rebuild (ADR-063).
//
// Verifies that Task 270-007's checkWorkerImage report is surfaced in the doctor
// output, and that the rebuild is gated by BOTH the --fix-image flag (`enabled`)
// AND an interactive confirmation — never run otherwise.
//
// Hermetic: no real docker, no network, no real spawn/readline. The confirm fn
// and the async spawn are INJECTED; formatters are pure.

import { describe, it, expect, vi } from 'vitest';
import {
  formatWorkerImageLines,
  maybeFixWorkerImage,
  formatHumanDoctor,
} from '../../src/cli/commands/doctor.js';
import type { HumanDoctorInput } from '../../src/cli/commands/doctor.js';
import type {
  WorkerImageReport,
  SpawnImpl,
  SpawnedProcessLike,
} from '../../src/core/worker-image-check.js';

// ─── fixtures ────────────────────────────────────────────────────────

function makeReport(over: Partial<WorkerImageReport> = {}): WorkerImageReport {
  return {
    state: 'stale',
    missingClis: ['codex'],
    missingCaCerts: false,
    suggestedBuildCmd: 'docker build -f Dockerfile.worker --build-arg INSTALL_CODEX=true -t deckent-worker:latest .',
    ...over,
  };
}

interface SpawnRecord {
  command?: string;
  args?: string[];
  calls: number;
}

/**
 * Injectable spawn that records the invocation and fires `close` with `code` on
 * the next microtask (after runImageBuild registers its listeners). stdout/stderr
 * are null — runImageBuild guards with optional chaining.
 */
function recordingSpawn(code: number, record: SpawnRecord): SpawnImpl {
  return (command: string, args: string[]): SpawnedProcessLike => {
    record.command = command;
    record.args = args;
    record.calls += 1;
    const listeners: Record<string, (...a: unknown[]) => void> = {};
    const child = {
      stdout: null,
      stderr: null,
      on(event: string, listener: (...a: unknown[]) => void) {
        listeners[event] = listener;
        return child;
      },
    };
    queueMicrotask(() => listeners['close']?.(code, null));
    return child as unknown as SpawnedProcessLike;
  };
}

// ─── formatWorkerImageLines ──────────────────────────────────────────

describe('formatWorkerImageLines', () => {
  it('renders a single [PASS] line when the image is ready (no warnings)', () => {
    const lines = formatWorkerImageLines(makeReport({ state: 'ready', missingClis: [], missingCaCerts: false }));
    const joined = lines.join('\n');
    expect(joined).toContain('[PASS]');
    expect(joined).toContain('Worker image ready');
    expect(joined).not.toContain('[WARN]');
    expect(joined).not.toContain('docker build');
  });

  it('renders a [WARN] line with the suggested build command when missing', () => {
    const report = makeReport({ state: 'missing', missingClis: ['claude', 'codex'], missingCaCerts: true });
    const joined = formatWorkerImageLines(report).join('\n');
    expect(joined).toContain('[WARN]');
    expect(joined).toContain('missing');
    expect(joined).toContain(report.suggestedBuildCmd);
    // hint points users at the consent-based fix flow
    expect(joined).toContain('--fix-image');
  });

  it('lists missing CLIs and ca-certificates for a stale image', () => {
    const joined = formatWorkerImageLines(
      makeReport({ state: 'stale', missingClis: ['gemini'], missingCaCerts: true }),
    ).join('\n');
    expect(joined).toContain('gemini');
    expect(joined).toContain('ca-certificates');
  });

  it('localizes the WARN lines to Turkish when lang=tr', () => {
    const joined = formatWorkerImageLines(makeReport({ state: 'stale', missingCaCerts: true }), 'tr').join('\n');
    expect(joined).toContain('yeniden derleme gerekli');
    expect(joined).toContain('ca-certificates eksik');
  });
});

// ─── formatHumanDoctor forwarding ────────────────────────────────────

describe('formatHumanDoctor — workerImage forwarding', () => {
  const baseInput: HumanDoctorInput = {
    result: {
      ok: true,
      checks: [
        { name: 'Platform', passed: true, message: 'Linux', required: false },
        { name: 'Node.js', passed: true, message: 'v22.1.0', required: true },
      ],
    },
    providers: [],
    brainLines: 100,
    brainBudget: 600,
    lastSprintId: 'sprint-270',
    debtItems: { total: 0, critical: 0 },
    projectRoot: '/mock/root',
  };

  it('includes the Worker Image section when a report is supplied', () => {
    const output = formatHumanDoctor({ ...baseInput, workerImage: makeReport({ state: 'missing' }) });
    expect(output).toContain('Worker Image:');
    expect(output).toContain('[WARN]');
    expect(output).toContain('docker build -f Dockerfile.worker');
  });

  it('omits the Worker Image section entirely when no report is supplied (no regression)', () => {
    const output = formatHumanDoctor(baseInput);
    expect(output).not.toContain('Worker Image:');
  });
});

// ─── maybeFixWorkerImage — consent + spawn gating ────────────────────

describe('maybeFixWorkerImage — ADR-063 consent gating', () => {
  it('builds (spawn called) when --fix-image is on, image not ready, and user confirms', async () => {
    const record: SpawnRecord = { calls: 0 };
    const confirmFn = vi.fn(async () => true);
    const outcome = await maybeFixWorkerImage(makeReport({ state: 'stale' }), {
      enabled: true,
      confirmFn,
      spawnImpl: recordingSpawn(0, record),
    });
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(record.calls).toBe(1);
    expect(record.command).toBe('docker');
    expect(record.args?.[0]).toBe('build');
    expect(record.args).toContain('Dockerfile.worker');
    expect(outcome).toBe('built');
  });

  it('does NOT spawn when the user declines the confirmation', async () => {
    const record: SpawnRecord = { calls: 0 };
    const confirmFn = vi.fn(async () => false);
    const outcome = await maybeFixWorkerImage(makeReport({ state: 'stale' }), {
      enabled: true,
      confirmFn,
      spawnImpl: recordingSpawn(0, record),
    });
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(record.calls).toBe(0);
    expect(outcome).toBe('declined');
  });

  it('does NOT prompt or spawn when --fix-image is absent (enabled=false)', async () => {
    const record: SpawnRecord = { calls: 0 };
    const confirmFn = vi.fn(async () => true);
    const outcome = await maybeFixWorkerImage(makeReport({ state: 'missing' }), {
      enabled: false,
      confirmFn,
      spawnImpl: recordingSpawn(0, record),
    });
    expect(confirmFn).not.toHaveBeenCalled();
    expect(record.calls).toBe(0);
    expect(outcome).toBe('disabled');
  });

  it('does nothing when the image is already ready (no build even if enabled)', async () => {
    const record: SpawnRecord = { calls: 0 };
    const confirmFn = vi.fn(async () => true);
    const outcome = await maybeFixWorkerImage(
      makeReport({ state: 'ready', missingClis: [], missingCaCerts: false }),
      { enabled: true, confirmFn, spawnImpl: recordingSpawn(0, record) },
    );
    expect(confirmFn).not.toHaveBeenCalled();
    expect(record.calls).toBe(0);
    expect(outcome).toBe('already-ready');
  });

  it('reports build-failed when the build process exits non-zero', async () => {
    const record: SpawnRecord = { calls: 0 };
    const outcome = await maybeFixWorkerImage(makeReport({ state: 'stale' }), {
      enabled: true,
      confirmFn: async () => true,
      spawnImpl: recordingSpawn(1, record),
    });
    expect(record.calls).toBe(1);
    expect(outcome).toBe('build-failed');
  });

  it('declines (no spawn) under tr locale as well', async () => {
    const record: SpawnRecord = { calls: 0 };
    const outcome = await maybeFixWorkerImage(makeReport({ state: 'stale' }), {
      enabled: true,
      confirmFn: async () => false,
      spawnImpl: recordingSpawn(0, record),
      lang: 'tr',
    });
    expect(record.calls).toBe(0);
    expect(outcome).toBe('declined');
  });
});
