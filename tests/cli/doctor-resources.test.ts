import { describe, it, expect } from 'vitest';
import {
  formatWorkerResourcesLines,
  type WorkerResourcesInfo,
} from '../../src/cli/commands/doctor.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build a WorkerResourcesInfo with controllable hostTotalBytes. */
function makeInfo(overrides: Partial<WorkerResourcesInfo> = {}): WorkerResourcesInfo {
  return {
    memoryLimit: '4g',
    memorySwap: '6g',
    maxWorkers: 6,
    hostTotalBytes: 16 * 1024 ** 3, // 16 GB
    ...overrides,
  };
}

const GB = 1024 ** 3;

// ─── tests ────────────────────────────────────────────────────────────────────

describe('formatWorkerResourcesLines', () => {
  it('renders the header line', () => {
    const lines = formatWorkerResourcesLines(makeInfo());
    expect(lines[0]).toBe('Worker Resources:');
  });

  it('includes memory limit, swap and max workers in limits line', () => {
    const lines = formatWorkerResourcesLines(makeInfo({ memoryLimit: '4g', memorySwap: '6g', maxWorkers: 5 }));
    const limitsLine = lines.find(l => l.includes('Memory:'));
    expect(limitsLine).toBeDefined();
    expect(limitsLine).toContain('4g');
    expect(limitsLine).toContain('6g');
    expect(limitsLine).toContain('5');
  });

  it('calculates RAM ceiling correctly (6 workers × 4g = 24 GB)', () => {
    const lines = formatWorkerResourcesLines(makeInfo({
      memoryLimit: '4g',
      maxWorkers: 6,
      hostTotalBytes: 64 * GB,
    }));
    const ceilingLine = lines.find(l => l.includes('RAM ceiling:') || l.includes('RAM tavan'));
    expect(ceilingLine).toBeDefined();
    expect(ceilingLine).toContain('24.0GB');
  });

  it('shows warning when RAM ceiling exceeds 60% of host', () => {
    // 6 × 4g = 24 GB ceiling; host = 32 GB → 75% > 60%
    const lines = formatWorkerResourcesLines(makeInfo({
      memoryLimit: '4g',
      maxWorkers: 6,
      hostTotalBytes: 32 * GB,
    }));
    const warnLine = lines.find(l => l.includes('[WARN]'));
    expect(warnLine).toBeDefined();
    expect(warnLine).toContain('75%');
  });

  it('does NOT show warning when RAM ceiling is under 60% of host', () => {
    // 2 × 4g = 8 GB ceiling; host = 64 GB → 12.5% < 60%
    const lines = formatWorkerResourcesLines(makeInfo({
      memoryLimit: '4g',
      maxWorkers: 2,
      hostTotalBytes: 64 * GB,
    }));
    const warnLine = lines.find(l => l.includes('[WARN]'));
    expect(warnLine).toBeUndefined();
  });

  it('shows resource_monitor enabled line with interval', () => {
    const lines = formatWorkerResourcesLines(makeInfo({
      resourceMonitor: { enabled: true, interval_ms: 3000 },
    }));
    const monLine = lines.find(l => l.includes('Resource monitor:') || l.includes('Kaynak izleme:'));
    expect(monLine).toBeDefined();
    expect(monLine).toContain('3000');
  });

  it('shows resource_monitor disabled line when enabled=false', () => {
    const lines = formatWorkerResourcesLines(makeInfo({
      resourceMonitor: { enabled: false },
    }));
    const monLine = lines.find(l => l.includes('Resource monitor:') || l.includes('Kaynak izleme:'));
    expect(monLine).toBeDefined();
    expect(monLine).toContain('disabled');
  });

  it('omits resource_monitor line when resourceMonitor is undefined', () => {
    const lines = formatWorkerResourcesLines(makeInfo({ resourceMonitor: undefined }));
    const monLine = lines.find(l => l.includes('Resource monitor:') || l.includes('Kaynak izleme:'));
    expect(monLine).toBeUndefined();
  });

  it('renders Turkish translation (tr lang)', () => {
    const lines = formatWorkerResourcesLines(makeInfo(), 'tr');
    expect(lines[0]).toBe('Worker Kaynakları:');
  });

  it('Turkish warn line uses correct percent format', () => {
    // 6 × 4g = 24 GB; host = 32 GB → 75% > 60%
    const lines = formatWorkerResourcesLines(makeInfo({
      memoryLimit: '4g',
      maxWorkers: 6,
      hostTotalBytes: 32 * GB,
    }), 'tr');
    const warnLine = lines.find(l => l.includes('WARN'));
    expect(warnLine).toBeDefined();
    expect(warnLine).toContain('75');
  });

  it('handles zero hostTotalBytes gracefully (no warn, pct=0)', () => {
    const lines = formatWorkerResourcesLines(makeInfo({ hostTotalBytes: 0 }));
    const ceilingLine = lines.find(l => l.includes('RAM ceiling:') || l.includes('RAM tavan'));
    expect(ceilingLine).toContain('0%');
    const warnLine = lines.find(l => l.includes('[WARN]'));
    expect(warnLine).toBeUndefined();
  });

  it('uses default interval_ms=5000 when not specified in resource_monitor', () => {
    const lines = formatWorkerResourcesLines(makeInfo({
      resourceMonitor: { enabled: true },
    }));
    const monLine = lines.find(l => l.includes('5000'));
    expect(monLine).toBeDefined();
  });
});
