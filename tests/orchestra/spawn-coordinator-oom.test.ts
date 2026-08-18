/**
 * Sprint 197 task 197-004 — WSL2 OOM mitigation.
 *
 * Pins the tier-based `max_workers` cap layered onto
 * {@link resolveAutoMaxWorkers}. Four canonical scenarios from
 * DIRECTIVES 197 (a/b/c/d) plus inner unit coverage for the tier formula.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same mock pattern as tests/core/host-detector.test.ts — ESM namespace
// objects cannot be spied directly, so vi.mock the underlying modules.
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));
vi.mock('node:os', () => ({
  totalmem: vi.fn(),
  // The module graph under test now also pulls os.homedir/tmpdir (scratch/
  // content-store seams, 2026-08-18 wave) — the mock must keep them defined.
  homedir: vi.fn(() => '/tmp/fake-home'),
  tmpdir: vi.fn(() => '/tmp'),
}));

import { readFileSync } from 'node:fs';
import { totalmem } from 'node:os';

import {
  resolveAutoMaxWorkers,
  tierBasedMaxWorkers,
  _resetSpawnCoordinatorCache,
} from '../../src/orchestra/spawn-coordinator.js';

const readFileSyncMock = readFileSync as unknown as ReturnType<typeof vi.fn>;
const totalmemMock = totalmem as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  readFileSyncMock.mockReset();
  totalmemMock.mockReset();
  _resetSpawnCoordinatorCache();
});

// kB-of-1024 figures that round to the desired GB (matches host-detector
// formula: GB = round(kB * 1024 / 1e9, 1)).
//   12 GB → 11_718_750 kB → 12.0
//   32 GB → 31_250_000 kB → 32.0
const MEMINFO_12GB = 'MemTotal:       11718750 kB';
const MEMINFO_32GB = 'MemTotal:       31250000 kB';

describe('spawn-coordinator — WSL2 OOM tier mitigation (197-004)', () => {
  it('(a) Host 12 GB + 4g worker → 2 workers (default WSL2 scenario)', () => {
    // Per-worker math: floor(12/4) - 1 = 2. Tier (8-16 GB): 2.
    // min(2, 2) = 2 — matches the documented WSL2 default.
    readFileSyncMock.mockImplementation(() => MEMINFO_12GB);
    expect(resolveAutoMaxWorkers(undefined, 4)).toBe(2);
  });

  it('(b) Host 32 GB + 3g worker → 4 workers (tier cap dominates per-worker formula)', () => {
    // Per-worker math: floor(32/3) - 1 = 9. Tier (32 GB+): 4.
    // min(9, 4) = 4 — proves the tier cap is the binding constraint on
    // big hosts.
    readFileSyncMock.mockImplementation(() => MEMINFO_32GB);
    expect(resolveAutoMaxWorkers(undefined, 3)).toBe(4);
  });

  it('(c) Operator override (configured number) wins over tier auto-resolve', () => {
    // Configured wins regardless of detected host RAM — and regardless of
    // which workerMemGB is passed.
    readFileSyncMock.mockImplementation(() => MEMINFO_12GB);
    expect(resolveAutoMaxWorkers(5)).toBe(5);
    expect(resolveAutoMaxWorkers(5, 4)).toBe(5);
    // 'auto' / undefined are NOT treated as a numeric override.
    readFileSyncMock.mockImplementation(() => MEMINFO_12GB);
    expect(resolveAutoMaxWorkers('auto', 4)).toBe(2);
  });

  it('(d) Host detection failure → safe default of 1 worker', () => {
    // /proc/meminfo unreadable AND os.totalmem reports 0 — the coordinator
    // must still return a usable positive number.
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    totalmemMock.mockReturnValue(0);
    expect(resolveAutoMaxWorkers(undefined, 4)).toBe(1);
  });
});

describe('tierBasedMaxWorkers — DIRECTIVES 197 tier table', () => {
  it('returns 1 for hosts <8 GB, 2 for 8-16 GB, 3 for 16-32 GB, 4 for ≥32 GB', () => {
    expect(tierBasedMaxWorkers(4)).toBe(1);
    expect(tierBasedMaxWorkers(7.9)).toBe(1);
    expect(tierBasedMaxWorkers(8)).toBe(2);
    expect(tierBasedMaxWorkers(12)).toBe(2);
    expect(tierBasedMaxWorkers(15.9)).toBe(2);
    expect(tierBasedMaxWorkers(16)).toBe(3);
    expect(tierBasedMaxWorkers(31.9)).toBe(3);
    expect(tierBasedMaxWorkers(32)).toBe(4);
    expect(tierBasedMaxWorkers(128)).toBe(4);
  });

  it('returns 1 for pathological inputs (NaN, ≤0)', () => {
    expect(tierBasedMaxWorkers(0)).toBe(1);
    expect(tierBasedMaxWorkers(-5)).toBe(1);
    expect(tierBasedMaxWorkers(NaN)).toBe(1);
    expect(tierBasedMaxWorkers(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
