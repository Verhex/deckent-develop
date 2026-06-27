import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';
import {
  detectStaleDaemons,
  listDeckentProcesses,
  parseEtimeToSeconds,
  parseUnixPsOutput,
  parseWindowsPsOutput,
  DEFAULT_MIN_AGE_SEC,
  type ProcessInfo,
  type SpawnImpl,
  type SpawnedProcessLike,
} from '../../src/core/daemon-hygiene.js';
import {
  formatDaemonHygieneLines,
  checkDaemonHygiene,
} from '../../src/cli/commands/doctor-checks.js';

// ─── Hermetic spawn mock ─────────────────────────────────────────────────────
// No real `ps` / `powershell` — the child is fully faked (EventEmitter + Readable).

interface CannedResult {
  code?: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

function makeSpawn(result: CannedResult): ReturnType<typeof vi.fn<SpawnImpl>> {
  return vi.fn<SpawnImpl>(() => {
    const child = new EventEmitter() as EventEmitter & SpawnedProcessLike;
    child.stdout = Readable.from([result.stdout ?? '']);
    child.stderr = Readable.from([result.stderr ?? '']);
    child.kill = () => true;
    process.nextTick(() => {
      if (result.error) {
        child.emit('error', result.error);
        return;
      }
      child.emit('close', result.code ?? 0, null);
    });
    return child;
  });
}

const OLD = DEFAULT_MIN_AGE_SEC * 2; // comfortably "long-lived"
const FRESH = 5; // seconds — definitely not a zombie

// ─── detectStaleDaemons (PURE) ───────────────────────────────────────────────

describe('detectStaleDaemons', () => {
  it('flags a fabricated stale dist/mcp/server.js daemon', () => {
    const snapshot: ProcessInfo[] = [
      { pid: 4242, command: 'node /workspace/dist/mcp/server.js', elapsedSec: OLD },
    ];
    const stale = detectStaleDaemons(snapshot);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ pid: 4242, kind: 'mcp-server', reason: 'mcp/server.js' });
    expect(stale[0]?.elapsedSec).toBe(OLD);
  });

  it('ignores a FRESH deckent mcp server (younger than the age threshold)', () => {
    const snapshot: ProcessInfo[] = [
      { pid: 1, command: 'node /workspace/dist/mcp/server.js', elapsedSec: FRESH },
    ];
    expect(detectStaleDaemons(snapshot)).toEqual([]);
  });

  it('ignores non-deckent processes even when they carry a daemon-kind word', () => {
    const snapshot: ProcessInfo[] = [
      { pid: 10, command: 'myserver serve --port 8080', elapsedSec: OLD }, // 'serve' but not deckent-owned
      { pid: 11, command: 'postgres: background writer', elapsedSec: OLD },
      { pid: 12, command: 'node /opt/otherapp/index.js', elapsedSec: OLD },
    ];
    expect(detectStaleDaemons(snapshot)).toEqual([]);
  });

  it('ignores deckent-owned NON-daemon commands (e.g. `deckent doctor`)', () => {
    const snapshot: ProcessInfo[] = [
      { pid: 20, command: 'node /workspace/dist/cli/entry.js doctor', elapsedSec: OLD },
      { pid: 21, command: 'node /workspace/dist/cli/entry.js status', elapsedSec: OLD },
    ];
    expect(detectStaleDaemons(snapshot)).toEqual([]);
  });

  it('classifies bot / serve / watch deckent daemons', () => {
    const snapshot: ProcessInfo[] = [
      { pid: 31, command: 'node /workspace/dist/cli/entry.js bot', elapsedSec: OLD },
      { pid: 32, command: 'deckent serve --port 3000', elapsedSec: OLD },
      { pid: 33, command: 'deckent watch', elapsedSec: OLD },
    ];
    const stale = detectStaleDaemons(snapshot);
    expect(stale.map((d) => d.kind)).toEqual(['bot', 'serve', 'watch']);
    expect(stale.map((d) => d.pid)).toEqual([31, 32, 33]);
  });

  it('normalizes Windows backslash paths so dist\\mcp\\server.js matches', () => {
    const snapshot: ProcessInfo[] = [
      { pid: 40, command: 'node C:\\app\\dist\\mcp\\server.js', elapsedSec: OLD },
    ];
    const stale = detectStaleDaemons(snapshot);
    expect(stale).toHaveLength(1);
    expect(stale[0]?.kind).toBe('mcp-server');
  });

  it('respects a custom minAgeSec threshold', () => {
    const snapshot: ProcessInfo[] = [
      { pid: 50, command: 'node /workspace/dist/mcp/server.js', elapsedSec: 120 },
    ];
    expect(detectStaleDaemons(snapshot, { minAgeSec: 60 })).toHaveLength(1);
    expect(detectStaleDaemons(snapshot, { minAgeSec: 300 })).toHaveLength(0);
  });

  it('respects custom ownerMarkers', () => {
    const snapshot: ProcessInfo[] = [
      { pid: 60, command: 'acme-daemon serve --port 80', elapsedSec: OLD },
    ];
    expect(detectStaleDaemons(snapshot)).toEqual([]); // not owned by default markers
    expect(detectStaleDaemons(snapshot, { ownerMarkers: ['acme-daemon'] })).toHaveLength(1);
  });

  it('returns multiple stale daemons in snapshot order', () => {
    const snapshot: ProcessInfo[] = [
      { pid: 70, command: 'node /workspace/dist/mcp/server.js', elapsedSec: OLD },
      { pid: 71, command: 'node /workspace/dist/cli/entry.js doctor', elapsedSec: OLD }, // skipped
      { pid: 72, command: 'deckent bot', elapsedSec: OLD },
    ];
    expect(detectStaleDaemons(snapshot).map((d) => d.pid)).toEqual([70, 72]);
  });
});

// ─── parsing helpers ─────────────────────────────────────────────────────────

describe('parseEtimeToSeconds', () => {
  it.each([
    ['30', 30],
    ['05:00', 300],
    ['01:02:03', 3_723],
    ['2-03:04:05', 2 * 86_400 + 3 * 3_600 + 4 * 60 + 5],
    ['', 0],
    ['garbage', 0],
  ])('parses "%s" → %i seconds', (etime, expected) => {
    expect(parseEtimeToSeconds(etime)).toBe(expected);
  });
});

describe('parseUnixPsOutput', () => {
  it('parses `pid etime command` lines and skips garbage', () => {
    const out = [
      '  4242 01:00:00 node /workspace/dist/mcp/server.js',
      '   100    05:00 deckent bot',
      'header garbage line',
      '',
    ].join('\n');
    const procs = parseUnixPsOutput(out);
    expect(procs).toEqual([
      { pid: 4242, elapsedSec: 3_600, command: 'node /workspace/dist/mcp/server.js' },
      { pid: 100, elapsedSec: 300, command: 'deckent bot' },
    ]);
  });
});

describe('parseWindowsPsOutput', () => {
  it('parses `pid|sec|command` lines and skips empty-command lines', () => {
    const out = [
      '4242|3600|node C:\\app\\dist\\mcp\\server.js',
      '100|300|deckent.exe bot',
      '7|7|', // empty command → skipped
      'bad line',
    ].join('\n');
    const procs = parseWindowsPsOutput(out);
    expect(procs).toEqual([
      { pid: 4242, elapsedSec: 3_600, command: 'node C:\\app\\dist\\mcp\\server.js' },
      { pid: 100, elapsedSec: 300, command: 'deckent.exe bot' },
    ]);
  });
});

// ─── listDeckentProcesses (THIN seam, fully faked spawn) ──────────────────────

describe('listDeckentProcesses', () => {
  it('uses `ps` on linux and parses the snapshot', async () => {
    const spawnImpl = makeSpawn({ code: 0, stdout: '4242 01:00:00 node /workspace/dist/mcp/server.js\n' });
    const result = await listDeckentProcesses({ platform: 'linux', spawnImpl });

    expect(result.supported).toBe(true);
    expect(result.platform).toBe('linux');
    expect(result.processes).toEqual([
      { pid: 4242, elapsedSec: 3_600, command: 'node /workspace/dist/mcp/server.js' },
    ]);
    expect(spawnImpl).toHaveBeenCalledWith('ps', ['-axww', '-o', 'pid=,etime=,command='], { shell: false });
  });

  it('uses `ps` on darwin too', async () => {
    const spawnImpl = makeSpawn({ code: 0, stdout: '100 05:00 deckent bot\n' });
    const result = await listDeckentProcesses({ platform: 'darwin', spawnImpl });
    expect(result.supported).toBe(true);
    expect(result.processes).toHaveLength(1);
    expect(spawnImpl).toHaveBeenCalledWith('ps', expect.any(Array), { shell: false });
  });

  it('uses `powershell` on win32 and parses the snapshot', async () => {
    const spawnImpl = makeSpawn({ code: 0, stdout: '4242|3600|node C:\\app\\dist\\mcp\\server.js\n' });
    const result = await listDeckentProcesses({ platform: 'win32', spawnImpl });

    expect(result.supported).toBe(true);
    expect(result.platform).toBe('win32');
    expect(result.processes).toEqual([
      { pid: 4242, elapsedSec: 3_600, command: 'node C:\\app\\dist\\mcp\\server.js' },
    ]);
    expect(spawnImpl).toHaveBeenCalledWith('powershell', expect.arrayContaining(['-NoProfile', '-Command']), { shell: false });
  });

  it('returns an honest empty result (supported:false) on an unsupported platform', async () => {
    const spawnImpl = makeSpawn({ code: 0, stdout: 'should not be used' });
    const result = await listDeckentProcesses({ platform: 'sunos' as NodeJS.Platform, spawnImpl });

    expect(result.supported).toBe(false);
    expect(result.processes).toEqual([]);
    expect(result.error).toContain('unsupported platform');
    expect(spawnImpl).not.toHaveBeenCalled(); // never spawns on an unsupported platform
  });

  it('degrades to empty (supported:true + error) when the lister tool exits non-zero', async () => {
    const spawnImpl = makeSpawn({ code: 1, stderr: 'ps: boom' });
    const result = await listDeckentProcesses({ platform: 'linux', spawnImpl });
    expect(result.supported).toBe(true);
    expect(result.processes).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('degrades to empty when the spawn itself errors (binary missing)', async () => {
    const spawnImpl = makeSpawn({ error: new Error('ENOENT') });
    const result = await listDeckentProcesses({ platform: 'linux', spawnImpl });
    expect(result.supported).toBe(true);
    expect(result.processes).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

// ─── doctor-checks advisory rendering (i18n, never-kill, never-throw) ──────────

describe('formatDaemonHygieneLines', () => {
  it('renders a single PASS line when nothing is stale', () => {
    const lines = formatDaemonHygieneLines([]);
    expect(lines[0]).toBe('Daemon Hygiene:');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('[PASS]');
    expect(lines[1]).toContain('No stale deckent daemons');
  });

  it('renders WARN + per-daemon entry + a cross-platform kill hint', () => {
    const lines = formatDaemonHygieneLines([
      { pid: 4242, kind: 'mcp-server', command: 'node dist/mcp/server.js', elapsedSec: 3_660, reason: 'mcp/server.js' },
    ]);
    const text = lines.join('\n');
    expect(text).toContain('[WARN]');
    expect(text).toContain('1 stale deckent daemon');
    expect(text).toContain('PID 4242');
    expect(text).toContain('mcp-server');
    expect(text).toContain('1h 1m'); // 3660s formatted
    expect(text).toContain('kill 4242'); // unix copy-paste hint
    expect(text).toContain('taskkill /F /PID 4242'); // windows hint
  });

  it('localizes the header for tr', () => {
    expect(formatDaemonHygieneLines([], 'tr')[0]).toBe('Daemon Hijyeni:');
  });
});

describe('checkDaemonHygiene (advisory)', () => {
  it('flags stale daemons returned by an injected lister', async () => {
    const lister = async () => ({
      supported: true as const,
      platform: 'linux',
      processes: [
        { pid: 4242, command: 'node /workspace/dist/mcp/server.js', elapsedSec: OLD },
        { pid: 9, command: 'node /workspace/dist/cli/entry.js doctor', elapsedSec: OLD }, // ignored
      ],
    });
    const result = await checkDaemonHygiene({ lister });
    expect(result.staleDaemons.map((d) => d.pid)).toEqual([4242]);
    expect(result.lines.join('\n')).toContain('[WARN]');
  });

  it('emits a PASS line (no stale) when the snapshot is clean', async () => {
    const lister = async () => ({ supported: true as const, platform: 'linux', processes: [] });
    const result = await checkDaemonHygiene({ lister });
    expect(result.staleDaemons).toEqual([]);
    expect(result.lines.join('\n')).toContain('[PASS]');
  });

  it('degrades to a benign PASS note on an unsupported platform — never fails', async () => {
    const lister = async () => ({ supported: false as const, platform: 'sunos', processes: [], error: 'unsupported platform: sunos' });
    const result = await checkDaemonHygiene({ lister });
    expect(result.staleDaemons).toEqual([]);
    const text = result.lines.join('\n');
    expect(text).toContain('[PASS]');
    expect(text).toContain('sunos');
  });

  it('NEVER throws when the lister rejects — degrades to a PASS note', async () => {
    const lister = async (): Promise<never> => {
      throw new Error('lister exploded');
    };
    const result = await checkDaemonHygiene({ lister });
    expect(result.staleDaemons).toEqual([]);
    expect(result.lines.join('\n')).toContain('[PASS]');
  });

  it('honors minAgeSec passthrough', async () => {
    const lister = async () => ({
      supported: true as const,
      platform: 'linux',
      processes: [{ pid: 50, command: 'node /workspace/dist/mcp/server.js', elapsedSec: 120 }],
    });
    expect((await checkDaemonHygiene({ lister, minAgeSec: 60 })).staleDaemons).toHaveLength(1);
    expect((await checkDaemonHygiene({ lister, minAgeSec: 300 })).staleDaemons).toHaveLength(0);
  });
});
