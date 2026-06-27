// Task 332-006 — doctor wire: B-ZOMBIE stale-daemon hygiene advisory.
//
// 331-007 BUILT checkDaemonHygiene/detectStaleDaemons but left them UN-WIRED into
// `deckent doctor`. This verifies the live wiring: running the `doctor` command
// surfaces the daemon-hygiene advisory section (a stale-daemon list + kill hint,
// or a clean PASS) — purely advisory: it never auto-kills, never throws, and never
// makes doctor exit non-zero.
//
// Hermetic: the stale-daemon SNAPSHOT is injected by mocking core/daemon-hygiene's
// `listDeckentProcesses` (the real `detectStaleDaemons` runs on it via importActual).
// The doctor command's heavy deps (fs / os / child_process / providers / memory-
// store / deck-file / environment / output) are mocked so the command runs without
// touching real host state — mirroring tests/cli/commands/doctor.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue(''),
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
  accessSync: vi.fn(),
  constants: { W_OK: 2 },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    platform: vi.fn().mockReturnValue('linux'),
    totalmem: vi.fn().mockReturnValue(16 * 1024 ** 3),
  };
});

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: 'v22.0.0', stderr: '', pid: 1, signal: null, output: [] }),
  spawn: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  formatDoctorResult: vi.fn().mockReturnValue('Doctor Output'),
  formatCIHealthSection: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/core/provider.js', () => ({
  // All unavailable → runAuthProbes has no targets (no real probe spawn).
  detectAvailableProviders: vi.fn().mockResolvedValue([
    { name: 'claude', available: false, authMethod: 'none', models: [] },
  ]),
  formatDetectedProviders: vi.fn().mockReturnValue('Providers:\n  mock'),
  runProviderDiagnostics: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    totalCount: vi.fn().mockReturnValue(0),
    getByType: vi.fn().mockReturnValue([]),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn().mockReturnValue({}),
  validateDeckFile: vi.fn().mockReturnValue({ valid: true, warnings: [], errors: [] }),
  isDeckFileCommitted: vi.fn().mockReturnValue(false),
  KNOWN_DECK_KEYS: ['DECKENT_CLAUDE_API_KEY'],
}));

vi.mock('../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('vscode'),
}));

// Partial mock: keep the REAL pure detector, inject the process snapshot.
vi.mock('../../src/core/daemon-hygiene.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/daemon-hygiene.js')>();
  return {
    ...actual,
    listDeckentProcesses: vi.fn(),
  };
});

import { listDeckentProcesses } from '../../src/core/daemon-hygiene.js';
import type { ProcessListResult } from '../../src/core/daemon-hygiene.js';
import { print } from '../../src/cli/helpers/output.js';
import { registerDoctor } from '../../src/cli/commands/doctor.js';
import {
  checkDaemonHygiene,
  formatDaemonHygieneLines,
} from '../../src/cli/commands/doctor-checks.js';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Run the real `doctor` command through commander (exitOverride-safe). */
async function runDoctor(args: string[] = []): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerDoctor(program);
  try {
    await program.parseAsync(['node', 'test', 'doctor', ...args]);
  } catch {
    // commander exitOverride throws on exit — irrelevant to these assertions.
  }
}

/** Collected stdout from the mocked `print`. */
function printedOutput(): string {
  return vi.mocked(print).mock.calls.map(c => String(c[0])).join('\n');
}

function snapshot(processes: ProcessListResult['processes']): ProcessListResult {
  return { processes, supported: true, platform: 'linux' };
}

const STALE_MCP = { pid: 12345, command: 'node dist/mcp/server.js', elapsedSec: 7200 }; // 2h old
const CLEAN_PROC = { pid: 1, command: '/sbin/init', elapsedSec: 999999 };

// ─── Command-level wiring (faithful: runs the `doctor` command) ──────

describe('deckent doctor — daemon-hygiene advisory wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('surfaces the stale-daemon advisory section + kill hint for an injected stale snapshot', async () => {
    vi.mocked(listDeckentProcesses).mockResolvedValue(snapshot([STALE_MCP]));

    await runDoctor();

    const output = printedOutput();
    expect(output).toContain('Daemon Hygiene:');
    expect(output).toContain('[WARN]');
    expect(output).toContain('stale deckent daemon');
    expect(output).toContain('PID 12345');
    expect(output).toContain('mcp-server');
    // copy-paste kill hint (advisory — never auto-killed)
    expect(output).toContain('kill 12345');
  });

  it('shows a clean PASS line for an injected clean snapshot (no deckent daemons)', async () => {
    vi.mocked(listDeckentProcesses).mockResolvedValue(snapshot([CLEAN_PROC]));

    await runDoctor();

    const output = printedOutput();
    expect(output).toContain('Daemon Hygiene:');
    expect(output).toContain('[PASS]');
    expect(output).toContain('No stale deckent daemons detected');
    // the daemon WARN advisory line (unique phrase) must be absent on a clean snapshot
    expect(output).not.toContain('never auto-kills');
  });

  it('never makes doctor exit non-zero even when stale daemons are found', async () => {
    vi.mocked(listDeckentProcesses).mockResolvedValue(snapshot([STALE_MCP]));

    await runDoctor();

    // advisory only — required checks pass (mocked tools), so exit code stays clean
    expect(process.exitCode).toBeUndefined();
  });

  it('never throws / never kills when the process lister itself fails', async () => {
    vi.mocked(listDeckentProcesses).mockRejectedValue(new Error('ps exploded'));

    await expect(runDoctor()).resolves.toBeUndefined();

    const output = printedOutput();
    // checkDaemonHygiene swallows the error and still emits the header + a benign note
    expect(output).toContain('Daemon Hygiene:');
    expect(process.exitCode).toBeUndefined();
  });
});

// ─── checkDaemonHygiene seam (injected lister — no spawn) ─────────────

describe('checkDaemonHygiene — injectable lister seam', () => {
  it('flags a long-lived deckent daemon as stale and renders advisory lines', async () => {
    const result = await checkDaemonHygiene({
      lister: async () => snapshot([STALE_MCP]),
    });
    expect(result.staleDaemons).toHaveLength(1);
    expect(result.staleDaemons[0]?.kind).toBe('mcp-server');
    expect(result.lines.join('\n')).toContain('kill 12345');
  });

  it('returns a clean PASS (no stale daemons) for a benign snapshot', async () => {
    const result = await checkDaemonHygiene({
      lister: async () => snapshot([CLEAN_PROC]),
    });
    expect(result.staleDaemons).toHaveLength(0);
    expect(result.lines.join('\n')).toContain('No stale deckent daemons detected');
  });

  it('degrades to a benign PASS note on an unsupported platform (Yasa #2 — honest skip)', async () => {
    const result = await checkDaemonHygiene({
      lister: async () => ({ processes: [], supported: false, platform: 'aix' }),
    });
    expect(result.staleDaemons).toHaveLength(0);
    expect(result.lines.join('\n')).toContain('aix');
  });

  it('never throws — a throwing lister degrades to a benign advisory note', async () => {
    const result = await checkDaemonHygiene({
      lister: async () => { throw new Error('boom'); },
    });
    expect(result.staleDaemons).toHaveLength(0);
    expect(result.lines[0]).toBe('Daemon Hygiene:');
  });

  it('localizes the advisory to Turkish when lang=tr', async () => {
    const result = await checkDaemonHygiene({
      lang: 'tr',
      lister: async () => snapshot([STALE_MCP]),
    });
    expect(result.lines.join('\n')).toContain('eskimiş deckent daemon');
  });
});

// ─── formatDaemonHygieneLines pure formatter (anchors the rendered shape) ─

describe('formatDaemonHygieneLines', () => {
  it('renders a single PASS line for an empty stale list', () => {
    const lines = formatDaemonHygieneLines([]);
    expect(lines[0]).toBe('Daemon Hygiene:');
    expect(lines[1]).toContain('[PASS]');
  });

  it('renders a WARN count, a per-daemon entry, and a kill hint when stale daemons exist', () => {
    const lines = formatDaemonHygieneLines([
      { pid: 999, kind: 'bot', command: 'deckent bot', elapsedSec: 4000, reason: 'bot' },
    ]);
    const joined = lines.join('\n');
    expect(joined).toContain('[WARN]');
    expect(joined).toContain('PID 999');
    expect(joined).toContain('kill 999');
    expect(joined).toContain('taskkill /F /PID 999'); // Windows hint (Yasa #2 — cross-platform)
  });
});
