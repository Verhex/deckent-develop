import { describe, it, expect, vi, afterEach } from 'vitest';
import * as cp from 'node:child_process';
import {
  runTargetedTests,
  runFullVitest,
} from '../../src/core/plugin-hooks.js';
import { captureVitestBaseline } from '../../src/orchestra/baseline-tracker.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

function spawnOk(stdout = 'Tests  1 passed (1)'): ReturnType<typeof cp.spawnSync> {
  return { status: 0, stdout, stderr: '', pid: 1, output: [], signal: null } as unknown as ReturnType<typeof cp.spawnSync>;
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, writable: true, configurable: true });
}

describe('DEP0190 shell:true win32-only conditional', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true, configurable: true });
  });

  it('runTargetedTests passes shell=false on linux/darwin', () => {
    setPlatform('linux');
    vi.mocked(cp.spawnSync).mockReturnValue(spawnOk());

    runTargetedTests('/tmp/proj', ['tests/foo.test.ts']);

    const calls = vi.mocked(cp.spawnSync).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const opts = calls[0]?.[2] as { shell?: boolean } | undefined;
    expect(opts?.shell).toBe(false);
  });

  it('runFullVitest passes shell=false on linux/darwin', () => {
    setPlatform('darwin');
    vi.mocked(cp.spawnSync).mockReturnValue(spawnOk());

    runFullVitest('/tmp/proj');

    const calls = vi.mocked(cp.spawnSync).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const opts = calls[0]?.[2] as { shell?: boolean } | undefined;
    expect(opts?.shell).toBe(false);
  });

  it('captureVitestBaseline passes shell=true on win32', () => {
    setPlatform('win32');
    vi.mocked(cp.spawnSync).mockReturnValue(spawnOk());

    captureVitestBaseline('/tmp/proj');

    const calls = vi.mocked(cp.spawnSync).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const opts = calls[0]?.[2] as { shell?: boolean } | undefined;
    expect(opts?.shell).toBe(true);
  });
});
