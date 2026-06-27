// SPAWN-1 (task 332-003) — Node DEP0190 `shell:true`+args-array Windows fix.
//
// `shell:true` together with an args ARRAY is the exact Node DEP0190 deprecation
// condition AND concatenates the args into one command string (the ADR-006
// command-injection surface). This suite locks the fix at BOTH live call-sites:
//   - src/core/provider.ts  → detectCliVersion (the `deckent doctor` provider probe)
//   - src/providers/subprocess.ts → SubprocessSpawnBackend.spawn / .isAvailable (worker spawn)
//
// Every assertion runs through an INJECTED platform + spawn seam, so the suite is
// fully hermetic — it never launches a real process. The win32 branch must route
// through `cmd.exe /c <cli> <args…>` with `shell:false` (Node escapes the discrete
// array; cmd.exe resolves the .cmd/.ps1 wrapper via PATHEXT), and the POSIX branch
// must stay byte-for-byte identical to the pre-fix direct invocation.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCliInvocation, detectCliVersion } from '../../src/core/provider.js';
import { SubprocessSpawnBackend } from '../../src/providers/subprocess.js';

// ─── Fakes ───────────────────────────────────────────────────────────

/** A spawnSync stub returning a successful version probe. */
function spawnSyncOk(stdout = '1.2.3\n') {
  return vi.fn(() => ({ status: 0, stdout, stderr: '', pid: 1, output: [], signal: null }));
}

/** Async-spawn child stub with a capturable exit callback so spawn() cleanup runs. */
function makeChild() {
  let exitCb: ((code: number) => void) | undefined;
  const child = {
    stdin: { write: vi.fn(), end: vi.fn() },
    once: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'exit') exitCb = cb;
      return child;
    }),
    kill: vi.fn(),
    pid: 4242,
    triggerExit: (code: number) => exitCb?.(code),
  };
  return child;
}

// ─── buildCliInvocation (pure helper) ────────────────────────────────

describe('buildCliInvocation', () => {
  it('win32 → cmd.exe /c wrapper, discrete args, shell:false (no concat, PATHEXT resolves .cmd)', () => {
    const inv = buildCliInvocation('claude', ['--version'], 'win32');
    expect(inv.command).toBe('cmd.exe');
    // args stay a DISCRETE escaped array — the bare CLI name is its own entry so
    // cmd.exe resolves claude.cmd via PATHEXT (no ENOENT regression).
    expect(inv.args).toEqual(['/c', 'claude', '--version']);
    expect(inv.shell).toBe(false);
  });

  it('posix → direct invocation, shell:false, byte-for-byte unchanged', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const inv = buildCliInvocation('claude', ['--version'], platform);
      expect(inv.command).toBe('claude');
      expect(inv.args).toEqual(['--version']);
      expect(inv.shell).toBe(false);
    }
  });

  it('never returns shell:true on any platform', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      // widen the `false` literal to boolean so the guard reads as a runtime check
      const shell: boolean = buildCliInvocation('x', ['y'], platform).shell;
      expect(shell).toBe(false);
    }
  });
});

// ─── Site 1: provider.ts detectCliVersion ────────────────────────────

describe('detectCliVersion — DEP0190/ADR-006 safe (provider probe)', () => {
  it('win32 → spawnSync gets cmd.exe + discrete /c array, shell:false (NOT shell:true+array)', () => {
    const spawnSyncImpl = spawnSyncOk();
    const version = detectCliVersion('claude', ['--version'], {
      platform: 'win32',
      spawnSyncImpl: spawnSyncImpl as never,
    });
    expect(version).toBe('1.2.3');

    const [command, args, options] = spawnSyncImpl.mock.calls[0]!;
    expect(command).toBe('cmd.exe');
    expect(args).toEqual(['/c', 'claude', '--version']);
    expect(Array.isArray(args)).toBe(true); // discrete array, not a concatenated string
    expect((options as { shell?: boolean }).shell).toBe(false);
    expect((options as { shell?: boolean }).shell).not.toBe(true);
    expect((options as { encoding?: string }).encoding).toBe('utf-8');
  });

  it('posix → spawnSync gets the bare binary + args, shell:false (byte-for-byte)', () => {
    const spawnSyncImpl = spawnSyncOk('2.0.0');
    const version = detectCliVersion('codex', ['--version'], {
      platform: 'linux',
      spawnSyncImpl: spawnSyncImpl as never,
    });
    expect(version).toBe('2.0.0');

    const [command, args, options] = spawnSyncImpl.mock.calls[0]!;
    expect(command).toBe('codex');
    expect(args).toEqual(['--version']);
    expect((options as { shell?: boolean }).shell).toBe(false);
  });

  it('swallows spawn errors → undefined (no throw to the doctor caller)', () => {
    const throwing = vi.fn(() => {
      throw new Error('ENOENT');
    });
    const version = detectCliVersion('missing', ['--version'], {
      platform: 'win32',
      spawnSyncImpl: throwing as never,
    });
    expect(version).toBeUndefined();
  });
});

// ─── Site 2: subprocess.ts worker spawn + availability probe ──────────

describe('SubprocessSpawnBackend — DEP0190/ADR-006 safe (worker spawn)', () => {
  const tmps: string[] = [];
  function freshDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'spawn-dep0190-'));
    tmps.push(dir);
    return dir;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tmps.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  it('win32 spawn → cmd.exe /c <cli> wrapper, discrete args, shell:false', () => {
    const child = makeChild();
    const spawnImpl = vi.fn(() => child);
    const backend = new SubprocessSpawnBackend(freshDir(), {
      platform: 'win32',
      spawnImpl: spawnImpl as never,
    });
    backend.spawn('t-win', 'opus', 'prompt');

    const [command, args, options] = spawnImpl.mock.calls[0]!;
    expect(command).toBe('cmd.exe');
    expect((args as string[])[0]).toBe('/c');
    expect((args as string[])[1]).toBe('claude'); // wrapper name resolved by cmd.exe/PATHEXT
    expect(Array.isArray(args)).toBe(true); // discrete escaped array, not concatenated
    expect((options as { shell?: boolean }).shell).toBe(false);
    expect((options as { shell?: boolean }).shell).not.toBe(true);

    child.triggerExit(0); // run cleanup (clear interval, close log fd)
  });

  it('posix spawn → bare "claude" command, shell:false, args unchanged (byte-for-byte)', () => {
    const child = makeChild();
    const spawnImpl = vi.fn(() => child);
    const backend = new SubprocessSpawnBackend(freshDir(), {
      platform: 'linux',
      spawnImpl: spawnImpl as never,
    });
    backend.spawn('t-nix', 'opus', 'prompt');

    const [command, args, options] = spawnImpl.mock.calls[0]!;
    expect(command).toBe('claude');
    expect((args as string[])[0]).not.toBe('/c'); // no cmd.exe wrapper on posix
    expect((args as string[])).toContain('claude-opus-4-8');
    expect((options as { shell?: boolean }).shell).toBe(false);

    child.triggerExit(0);
  });

  it('win32 isAvailable → cmd.exe /c <cli> --version, shell:false', async () => {
    const child = {
      once: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'exit') cb(0);
        return child;
      }),
    };
    const spawnImpl = vi.fn(() => child);
    const backend = new SubprocessSpawnBackend(freshDir(), {
      platform: 'win32',
      spawnImpl: spawnImpl as never,
    });
    const available = await backend.isAvailable();
    expect(available).toBe(true);

    const [command, args, options] = spawnImpl.mock.calls[0]!;
    expect(command).toBe('cmd.exe');
    expect(args).toEqual(['/c', 'claude', '--version']);
    expect((options as { shell?: boolean }).shell).toBe(false);
    expect((options as { shell?: boolean }).shell).not.toBe(true);
  });

  it('posix isAvailable → bare binary probe, shell:false', async () => {
    const child = {
      once: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'exit') cb(0);
        return child;
      }),
    };
    const spawnImpl = vi.fn(() => child);
    const backend = new SubprocessSpawnBackend(freshDir(), {
      platform: 'darwin',
      spawnImpl: spawnImpl as never,
    });
    await backend.isAvailable();

    const [command, args, options] = spawnImpl.mock.calls[0]!;
    expect(command).toBe('claude');
    expect(args).toEqual(['--version']);
    expect((options as { shell?: boolean }).shell).toBe(false);
  });
});
