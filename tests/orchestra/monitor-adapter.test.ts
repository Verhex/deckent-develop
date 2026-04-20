import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import {
  createMonitorAdapter,
  DockerMonitorAdapter,
  TmuxMonitorAdapter,
  SubprocessMonitorAdapter,
} from '../../src/orchestra/monitor-adapter.js';
import type { WorkerInfo, ResourceUsage, MonitorAdapter } from '../../src/orchestra/monitor-adapter.js';

// ─── Mock spawnSync ──────────────────────────────────────────────────────

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof child_process>('node:child_process');
  return { ...actual, spawnSync: vi.fn() };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof fs>('node:fs');
  return { ...actual, readdirSync: vi.fn(actual.readdirSync), readFileSync: vi.fn(actual.readFileSync) };
});

const mockSpawnSync = vi.mocked(child_process.spawnSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

function mockExec(stdout: string, status = 0) {
  mockSpawnSync.mockReturnValueOnce({
    status,
    stdout,
    stderr: '',
    pid: 0,
    output: [null, stdout, ''],
    signal: null,
  });
}

function mockExecFail() {
  mockSpawnSync.mockReturnValueOnce({
    status: 1,
    stdout: '',
    stderr: 'error',
    pid: 0,
    output: [null, '', 'error'],
    signal: null,
  });
}

// ─── Factory Tests ───────────────────────────────────────────────────────

describe('createMonitorAdapter', () => {
  it('returns DockerMonitorAdapter for docker backend', () => {
    const adapter = createMonitorAdapter({ spawn_backend: 'docker', projectRoot: '/tmp' });
    expect(adapter).toBeInstanceOf(DockerMonitorAdapter);
    expect(adapter.backend).toBe('docker');
  });

  it('returns TmuxMonitorAdapter for tmux backend', () => {
    const adapter = createMonitorAdapter({ spawn_backend: 'tmux', projectRoot: '/tmp' });
    expect(adapter).toBeInstanceOf(TmuxMonitorAdapter);
    expect(adapter.backend).toBe('tmux');
  });

  it('returns SubprocessMonitorAdapter for subprocess backend', () => {
    const adapter = createMonitorAdapter({ spawn_backend: 'subprocess', projectRoot: '/tmp' });
    expect(adapter).toBeInstanceOf(SubprocessMonitorAdapter);
    expect(adapter.backend).toBe('subprocess');
  });

  it('throws for unknown backend', () => {
    expect(() =>
      createMonitorAdapter({ spawn_backend: 'unknown' as 'docker', projectRoot: '/tmp' }),
    ).toThrow('Unknown spawn backend: unknown');
  });

  it('defaults to tmux for auto backend', () => {
    const adapter = createMonitorAdapter({ spawn_backend: 'auto', projectRoot: '/tmp' });
    expect(adapter).toBeInstanceOf(TmuxMonitorAdapter);
  });
});

// ─── Docker Adapter Contract Tests ───────────────────────────────────────

describe('DockerMonitorAdapter', () => {
  let adapter: MonitorAdapter;

  beforeEach(() => {
    adapter = new DockerMonitorAdapter();
    vi.clearAllMocks();
  });

  it('listActiveWorkers parses docker ps output', async () => {
    mockExec('abc123\tUp 5 minutes\t2026-04-20 10:00:00 +0000 UTC');
    const workers = await adapter.listActiveWorkers();
    expect(workers).toEqual([
      { id: 'abc123', status: 'Up 5 minutes', createdAt: '2026-04-20 10:00:00 +0000 UTC' },
    ]);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['ps', '--filter', 'name=deckent-w-', '--format', '{{.ID}}\t{{.Status}}\t{{.CreatedAt}}'],
      expect.any(Object),
    );
  });

  it('listActiveWorkers returns empty on failure', async () => {
    mockExecFail();
    const workers = await adapter.listActiveWorkers();
    expect(workers).toEqual([]);
  });

  it('captureWorkerOutput calls docker logs', async () => {
    mockExec('line1\nline2\nline3');
    const output = await adapter.captureWorkerOutput('abc123', 3);
    expect(output).toBe('line1\nline2\nline3');
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['logs', '--tail', '3', 'abc123'],
      expect.any(Object),
    );
  });

  it('getResourceUsage parses docker stats', async () => {
    mockExec('12.5%\t256MiB / 2GiB\t1.2MB / 500kB');
    const usage = await adapter.getResourceUsage('abc123');
    expect(usage).toEqual({
      cpu: '12.5%',
      memory: '256MiB / 2GiB',
      diskIo: '1.2MB / 500kB',
    });
  });

  it('getResourceUsage returns null on failure', async () => {
    mockExecFail();
    const usage = await adapter.getResourceUsage('abc123');
    expect(usage).toBeNull();
  });

  it('killWorker calls docker kill', async () => {
    mockExec('');
    await adapter.killWorker('abc123');
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['kill', 'abc123'],
      expect.any(Object),
    );
  });
});

// ─── Tmux Adapter Contract Tests ─────────────────────────────────────────

describe('TmuxMonitorAdapter', () => {
  let adapter: MonitorAdapter;

  beforeEach(() => {
    adapter = new TmuxMonitorAdapter();
    vi.clearAllMocks();
  });

  it('listActiveWorkers parses tmux ls output', async () => {
    mockExec('deckent-sprint\t1713600000');
    const workers = await adapter.listActiveWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0]!.id).toBe('deckent-sprint');
    expect(workers[0]!.status).toBe('running');
  });

  it('listActiveWorkers filters non-deckent sessions', async () => {
    mockExec('my-session\t1713600000\ndeckent-w-001\t1713600000');
    const workers = await adapter.listActiveWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0]!.id).toBe('deckent-w-001');
  });

  it('captureWorkerOutput calls tmux capture-pane', async () => {
    mockExec('captured pane content');
    const output = await adapter.captureWorkerOutput('deckent-w-001', 50);
    expect(output).toBe('captured pane content');
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'tmux',
      ['capture-pane', '-t', 'deckent-w-001', '-p', '-S', '-50'],
      expect.any(Object),
    );
  });

  it('getResourceUsage returns null (tmux limitation)', async () => {
    const usage = await adapter.getResourceUsage('deckent-w-001');
    expect(usage).toBeNull();
  });

  it('killWorker calls tmux kill-session', async () => {
    mockExec('');
    await adapter.killWorker('deckent-w-001');
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'tmux',
      ['kill-session', '-t', 'deckent-w-001'],
      expect.any(Object),
    );
  });
});

// ─── Subprocess Adapter Contract Tests ───────────────────────────────────

describe('SubprocessMonitorAdapter', () => {
  let adapter: SubprocessMonitorAdapter;

  beforeEach(() => {
    adapter = new SubprocessMonitorAdapter('/tmp/test-project');
    vi.clearAllMocks();
  });

  it('listActiveWorkers reads .pid files and checks ps', async () => {
    mockReaddirSync.mockReturnValueOnce(['w-001.pid', 'w-002.pid'] as unknown as fs.Dirent[]);
    mockReadFileSync.mockReturnValueOnce('12345');
    mockExec(' 12345  S  Mon Apr 20 10:00:00 2026');
    mockReadFileSync.mockReturnValueOnce('67890');
    mockExecFail(); // second process not running

    const workers = await adapter.listActiveWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0]!.id).toBe('w-001');
  });

  it('listActiveWorkers returns empty when pidDir missing', async () => {
    mockReaddirSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    const workers = await adapter.listActiveWorkers();
    expect(workers).toEqual([]);
  });

  it('captureWorkerOutput returns placeholder string', async () => {
    const output = await adapter.captureWorkerOutput('w-001', 50);
    expect(output).toContain('subprocess backend: stdout not captured');
  });

  it('getResourceUsage reads pid and calls ps', async () => {
    mockReadFileSync.mockReturnValueOnce('12345');
    mockExec(' 5.2  3.1');
    const usage = await adapter.getResourceUsage('w-001');
    expect(usage).toEqual({
      cpu: '5.2%',
      memory: '3.1%',
      diskIo: 'N/A',
    });
  });

  it('getResourceUsage returns null when pid file missing', async () => {
    mockReadFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    const usage = await adapter.getResourceUsage('w-001');
    expect(usage).toBeNull();
  });

  it('killWorker reads pid and sends kill signal', async () => {
    mockReadFileSync.mockReturnValueOnce('12345');
    mockExec('');
    await adapter.killWorker('w-001');
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'kill',
      ['12345'],
      expect.any(Object),
    );
  });

  it('killWorker does nothing when pid file missing', async () => {
    mockReadFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    await adapter.killWorker('w-missing');
    // Should not throw
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});
