import { describe, it, expect, vi, beforeEach } from 'vitest';

// ESM namespaces are non-configurable so `vi.spyOn(fs, 'readFileSync')`
// throws under Node's native ESM loader. The supported pattern in this
// project is `vi.mock` (see tests/security/lock-atomicity.test.ts).
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));
vi.mock('node:os', () => ({
  totalmem: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { totalmem } from 'node:os';

import {
  parseMemTotalKB,
  detectHostMemory,
  suggestMaxWorkers,
  PROC_MEMINFO_PATH,
  DEFAULT_WORKER_MEM_GB,
  MIN_MAX_WORKERS,
  MAX_MAX_WORKERS,
} from '../../src/core/host-detector.js';

// Cast the mocked imports so the tests can drive their behaviour.
const readFileSyncMock = readFileSync as unknown as ReturnType<typeof vi.fn>;
const totalmemMock = totalmem as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  readFileSyncMock.mockReset();
  totalmemMock.mockReset();
});

// ─── parseMemTotalKB ────────────────────────────────────────────────

describe('parseMemTotalKB', () => {
  it('extracts MemTotal kB from a realistic meminfo body', () => {
    const body = [
      'MemTotal:       40123456 kB',
      'MemFree:         1234567 kB',
      'MemAvailable:   30000000 kB',
      'Buffers:          123456 kB',
    ].join('\n');
    expect(parseMemTotalKB(body)).toBe(40123456);
  });

  it('returns null when MemTotal line is absent', () => {
    expect(parseMemTotalKB('MemFree: 100 kB\nBuffers: 50 kB')).toBeNull();
  });

  it('returns null on malformed MemTotal value', () => {
    expect(parseMemTotalKB('MemTotal:       not-a-number kB')).toBeNull();
  });

  it('returns null on zero / negative readings', () => {
    expect(parseMemTotalKB('MemTotal:       0 kB')).toBeNull();
  });
});

// ─── detectHostMemory (/proc/meminfo path) ───────────────────────────

describe('detectHostMemory — /proc/meminfo path', () => {
  it('parses /proc/meminfo and returns totalGB rounded to 1 decimal', () => {
    // 41943040 kB-of-1024-bytes = 42.94967296 GB (decimal) → rounded to 42.9.
    readFileSyncMock.mockImplementation((p: string) => {
      if (p === PROC_MEMINFO_PATH) {
        return 'MemTotal:       41943040 kB\nMemFree: 1 kB';
      }
      throw new Error('unexpected read: ' + String(p));
    });
    const out = detectHostMemory();
    expect(out.source).toBe('meminfo');
    expect(out.totalGB).toBeCloseTo(42.9, 1);
  });

  it('falls back to os.totalmem when /proc/meminfo throws (non-Linux / permission denied)', () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    totalmemMock.mockReturnValue(16 * 1e9);
    const out = detectHostMemory();
    expect(out.source).toBe('os.totalmem');
    expect(out.totalGB).toBe(16);
  });

  it('falls back to os.totalmem when meminfo body has no MemTotal line', () => {
    readFileSyncMock.mockImplementation(() => 'MemFree: 100 kB');
    totalmemMock.mockReturnValue(8 * 1e9);
    const out = detectHostMemory();
    expect(out.source).toBe('os.totalmem');
    expect(out.totalGB).toBe(8);
  });
});

// ─── suggestMaxWorkers ──────────────────────────────────────────────

describe('suggestMaxWorkers', () => {
  it('clamps a 40 GB host to MAX_MAX_WORKERS=16 (raw would be 19)', () => {
    expect(suggestMaxWorkers(40)).toBe(MAX_MAX_WORKERS);
  });

  it('matches the spec example: 32 GB host with 2 GB workers → 15 (under cap)', () => {
    // floor(32 / 2) - 1 = 15, below MAX_MAX_WORKERS
    expect(suggestMaxWorkers(32)).toBe(15);
  });

  it('honours the workerMemGB override', () => {
    // 16 GB host, 4 GB per worker → floor(16/4) - 1 = 3
    expect(suggestMaxWorkers(16, 4)).toBe(3);
  });

  it('clamps below MIN_MAX_WORKERS when host RAM is tiny', () => {
    // 2 GB host → floor(2/2) - 1 = 0 → clamped to MIN_MAX_WORKERS = 1
    expect(suggestMaxWorkers(2)).toBe(MIN_MAX_WORKERS);
    expect(suggestMaxWorkers(0.5)).toBe(MIN_MAX_WORKERS);
  });

  it('clamps above MAX_MAX_WORKERS even on enormous hosts', () => {
    expect(suggestMaxWorkers(1024)).toBe(MAX_MAX_WORKERS);
  });

  it('returns MIN_MAX_WORKERS for pathological inputs (non-finite, zero, negative)', () => {
    expect(suggestMaxWorkers(NaN)).toBe(MIN_MAX_WORKERS);
    expect(suggestMaxWorkers(-5)).toBe(MIN_MAX_WORKERS);
    expect(suggestMaxWorkers(8, 0)).toBe(MIN_MAX_WORKERS);
    expect(suggestMaxWorkers(8, -2)).toBe(MIN_MAX_WORKERS);
  });

  it('exposes a default workerMemGB of 2 GB (Sprint 194 task 194-003 alignment)', () => {
    expect(DEFAULT_WORKER_MEM_GB).toBe(2);
  });
});
