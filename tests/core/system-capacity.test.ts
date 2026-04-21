import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectSystemCapacity, suggestMaxWorkers, suggestSpawnBackend } from '../../src/core/system-capacity.js';
import type { SystemCapacity } from '../../src/core/system-capacity.js';

// ─── suggestMaxWorkers ─────────────────────────────────────────────

describe('suggestMaxWorkers', () => {
  it('returns 1 for systems with less than 4GB RAM', () => {
    const cap: SystemCapacity = { totalRamGB: 3.5, freeRamGB: 2, cpuCores: 4, dockerAvailable: false, platform: 'linux' };
    expect(suggestMaxWorkers(cap)).toBe(1);
  });

  it('returns 2 for systems with 4-8GB RAM', () => {
    const cap: SystemCapacity = { totalRamGB: 6, freeRamGB: 3, cpuCores: 4, dockerAvailable: false, platform: 'linux' };
    expect(suggestMaxWorkers(cap)).toBe(2);
  });

  it('returns 3 for systems with 8-16GB RAM and <8 cores', () => {
    const cap: SystemCapacity = { totalRamGB: 12, freeRamGB: 8, cpuCores: 4, dockerAvailable: false, platform: 'linux' };
    expect(suggestMaxWorkers(cap)).toBe(3);
  });

  it('returns 4 for systems with 8-16GB RAM and >=8 cores', () => {
    const cap: SystemCapacity = { totalRamGB: 12, freeRamGB: 8, cpuCores: 8, dockerAvailable: false, platform: 'linux' };
    expect(suggestMaxWorkers(cap)).toBe(4);
  });

  it('scales with cores for >16GB RAM, capped at 8', () => {
    const cap: SystemCapacity = { totalRamGB: 32, freeRamGB: 20, cpuCores: 16, dockerAvailable: false, platform: 'linux' };
    expect(suggestMaxWorkers(cap)).toBe(8);
  });

  it('returns at least 2 for >16GB even with few cores', () => {
    const cap: SystemCapacity = { totalRamGB: 32, freeRamGB: 20, cpuCores: 2, dockerAvailable: false, platform: 'linux' };
    expect(suggestMaxWorkers(cap)).toBe(2);
  });

  it('handles edge case: exactly 4GB', () => {
    const cap: SystemCapacity = { totalRamGB: 4, freeRamGB: 2, cpuCores: 2, dockerAvailable: false, platform: 'linux' };
    expect(suggestMaxWorkers(cap)).toBe(2);
  });

  it('handles edge case: exactly 8GB', () => {
    const cap: SystemCapacity = { totalRamGB: 8, freeRamGB: 4, cpuCores: 4, dockerAvailable: false, platform: 'linux' };
    expect(suggestMaxWorkers(cap)).toBe(3);
  });
});

// ─── suggestSpawnBackend ───────────────────────────────────────────

describe('suggestSpawnBackend', () => {
  it('returns subprocess for Windows', () => {
    const cap: SystemCapacity = { totalRamGB: 32, freeRamGB: 16, cpuCores: 8, dockerAvailable: true, platform: 'win32' };
    expect(suggestSpawnBackend(cap)).toBe('subprocess');
  });

  it('returns docker when Docker is available on Linux', () => {
    const cap: SystemCapacity = { totalRamGB: 16, freeRamGB: 8, cpuCores: 8, dockerAvailable: true, platform: 'linux' };
    expect(suggestSpawnBackend(cap)).toBe('docker');
  });

  it('returns docker when Docker is available on macOS', () => {
    const cap: SystemCapacity = { totalRamGB: 16, freeRamGB: 8, cpuCores: 8, dockerAvailable: true, platform: 'darwin' };
    expect(suggestSpawnBackend(cap)).toBe('docker');
  });

  it('returns subprocess when Docker is not available on Linux', () => {
    const cap: SystemCapacity = { totalRamGB: 16, freeRamGB: 8, cpuCores: 8, dockerAvailable: false, platform: 'linux' };
    expect(suggestSpawnBackend(cap)).toBe('subprocess');
  });
});

// ─── detectSystemCapacity ──────────────────────────────────────────

describe('detectSystemCapacity', () => {
  it('returns a valid SystemCapacity object', () => {
    const cap = detectSystemCapacity();
    expect(cap.totalRamGB).toBeGreaterThan(0);
    expect(cap.cpuCores).toBeGreaterThan(0);
    expect(typeof cap.dockerAvailable).toBe('boolean');
    expect(typeof cap.platform).toBe('string');
    expect(cap.freeRamGB).toBeLessThanOrEqual(cap.totalRamGB);
  });
});
