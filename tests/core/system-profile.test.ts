import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';

vi.mock('node:os');

import { getSystemProfile, calcRecommendedMaxWorkers } from '../../src/core/system-profile.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe('calcRecommendedMaxWorkers', () => {
  it('returns correct value for normal conditions (8192MB free, 8 cores)', () => {
    // 8192 / 400 = 20, cpuCores-1 = 7, min(20,7,30) = 7
    expect(calcRecommendedMaxWorkers(8192, 8)).toBe(7);
  });

  it('caps at 30 for high free RAM and many CPU cores', () => {
    // 65536 / 400 = 163, cpuCores-1 = 63, min(163,63,30) = 30
    expect(calcRecommendedMaxWorkers(65536, 64)).toBe(30);
  });

  it('returns 1 minimum for very low free RAM (50MB)', () => {
    // 50 / 400 = 0, max(1, 0) = 1
    expect(calcRecommendedMaxWorkers(50, 8)).toBe(1);
  });

  it('handles low free RAM (2GB = 2048 MB)', () => {
    // 2048 / 400 = 5, cpuCores-1 = 7, min(5,7,30) = 5
    expect(calcRecommendedMaxWorkers(2048, 8)).toBe(5);
  });

  it('handles high CPU (32 cores) with moderate RAM (8GB)', () => {
    // 8192 / 400 = 20, cpuCores-1 = 31, min(20,31,30) = 20
    expect(calcRecommendedMaxWorkers(8192, 32)).toBe(20);
  });

  it('returns 1 for single-core machine', () => {
    // cpuCores-1 = 0, max(1, 0) = 1
    expect(calcRecommendedMaxWorkers(8192, 1)).toBe(1);
  });

  it('applies 30 cap regardless of RAM amount', () => {
    // Massive RAM: 1000000 / 400 = 2500, cpuCores-1 = 127, min(2500,127,30) = 30
    expect(calcRecommendedMaxWorkers(1_000_000, 128)).toBe(30);
  });

  it('handles exactly 400MB free (boundary)', () => {
    // 400 / 400 = 1, cpuCores-1 = 7, min(1,7,30) = 1
    expect(calcRecommendedMaxWorkers(400, 8)).toBe(1);
  });

  it('handles 16GB free with 4 cores', () => {
    // 16384 / 400 = 40, cpuCores-1 = 3, min(40,3,30) = 3
    expect(calcRecommendedMaxWorkers(16384, 4)).toBe(3);
  });

  it('handles 2-core machine with enough RAM', () => {
    // 4096 / 400 = 10, cpuCores-1 = 1, min(10,1,30) = 1
    expect(calcRecommendedMaxWorkers(4096, 2)).toBe(1);
  });
});

describe('getSystemProfile', () => {
  const mockCpus = vi.mocked(os.cpus);
  const mockTotalmem = vi.mocked(os.totalmem);
  const mockFreemem = vi.mocked(os.freemem);

  const makeCpuList = (n: number) =>
    new Array(n).fill({ model: 'test', speed: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct profile for 8-core, 16GB total, 8GB free', () => {
    mockCpus.mockReturnValue(makeCpuList(8));
    mockTotalmem.mockReturnValue(16 * GB);
    mockFreemem.mockReturnValue(8 * GB);

    const profile = getSystemProfile();

    expect(profile.cpuCores).toBe(8);
    expect(profile.totalMemMB).toBe(16384);
    expect(profile.freeMemMB).toBe(8192);
    // freeMemMB = 8192, cpuCores-1 = 7 → 7
    expect(profile.recommendedMaxWorkers).toBe(7);
  });

  it('returns correct profile for low RAM (2GB free)', () => {
    mockCpus.mockReturnValue(makeCpuList(4));
    mockTotalmem.mockReturnValue(4 * GB);
    mockFreemem.mockReturnValue(2 * GB);

    const profile = getSystemProfile();

    expect(profile.cpuCores).toBe(4);
    expect(profile.totalMemMB).toBe(4096);
    expect(profile.freeMemMB).toBe(2048);
    // freeMemMB = 2048, cpuCores-1 = 3 → 3
    expect(profile.recommendedMaxWorkers).toBe(3);
  });

  it('caps recommendedMaxWorkers at 30 for high-end machine', () => {
    mockCpus.mockReturnValue(makeCpuList(64));
    mockTotalmem.mockReturnValue(128 * GB);
    mockFreemem.mockReturnValue(64 * GB);

    const profile = getSystemProfile();

    expect(profile.recommendedMaxWorkers).toBe(30);
  });

  it('returns minimum 1 worker for very low free RAM (50MB)', () => {
    mockCpus.mockReturnValue(makeCpuList(8));
    mockTotalmem.mockReturnValue(1 * GB);
    mockFreemem.mockReturnValue(50 * MB);

    const profile = getSystemProfile();

    expect(profile.recommendedMaxWorkers).toBe(1);
  });

  it('profile has all required fields', () => {
    mockCpus.mockReturnValue(makeCpuList(4));
    mockTotalmem.mockReturnValue(8 * GB);
    mockFreemem.mockReturnValue(4 * GB);

    const profile = getSystemProfile();

    expect(profile).toHaveProperty('cpuCores');
    expect(profile).toHaveProperty('totalMemMB');
    expect(profile).toHaveProperty('freeMemMB');
    expect(profile).toHaveProperty('recommendedMaxWorkers');
  });

  it('returns minimum 1 worker for single-core machine', () => {
    mockCpus.mockReturnValue(makeCpuList(1));
    mockTotalmem.mockReturnValue(16 * GB);
    mockFreemem.mockReturnValue(8 * GB);

    const profile = getSystemProfile();

    expect(profile.cpuCores).toBe(1);
    expect(profile.recommendedMaxWorkers).toBe(1);
  });

  it('uses os API to gather system data', () => {
    mockCpus.mockReturnValue(makeCpuList(4));
    mockTotalmem.mockReturnValue(8 * GB);
    mockFreemem.mockReturnValue(4 * GB);

    getSystemProfile();

    expect(mockCpus).toHaveBeenCalledOnce();
    expect(mockTotalmem).toHaveBeenCalledOnce();
    expect(mockFreemem).toHaveBeenCalledOnce();
  });
});
