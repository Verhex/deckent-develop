import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SpawnSafetyError,
  safeSpawn,
  safeSpawnSync,
} from '../../src/core/spawn-safety.js';

// SH_C_ALLOWED forbids parens/quotes, so `node -e "..."` inline scripts are
// rejected by design (they'd be rejected for a real unsafe payload too).
// Safe-path tests instead spawn a real script FILE — its path is a plain
// alnum/slash/dot argument, which is exactly the shape the whitelist allows.
let scriptDir: string;

beforeEach(() => {
  scriptDir = mkdtempSync(join(tmpdir(), 'spawn-safety-wire-'));
});

afterEach(() => {
  rmSync(scriptDir, { recursive: true, force: true });
});

function writeScript(name: string, body: string): string {
  const path = join(scriptDir, name);
  writeFileSync(path, body, 'utf8');
  return path;
}

// ─── safeSpawnSync — unsafe invocations are rejected before any process runs ──

describe('safeSpawnSync — rejects unsafe invocations', () => {
  it('rejects a non-whitelisted binary (rm) without spawning it', () => {
    expect(() => safeSpawnSync('rm', ['-rf', '/'])).toThrow(SpawnSafetyError);
    try {
      safeSpawnSync('rm', ['-rf', '/']);
    } catch (err) {
      expect(err).toBeInstanceOf(SpawnSafetyError);
      const e = err as SpawnSafetyError;
      expect(e.code).toBe('BIN_NOT_WHITELISTED');
      expect(e.bin).toBe('rm');
    }
  });

  it('rejects a whitelisted binary with an injected arg', () => {
    expect(() =>
      safeSpawnSync('npx', ['vitest', 'run; rm -rf /']),
    ).toThrow(SpawnSafetyError);
    try {
      safeSpawnSync('npx', ['vitest', 'run; rm -rf /']);
    } catch (err) {
      const e = err as SpawnSafetyError;
      expect(e.code).toBe('ARG_INJECTION');
      expect(e.badArg).toBe('run; rm -rf /');
    }
  });

  it('rejects sh -c injection attempts (sh is not whitelisted)', () => {
    expect(() =>
      safeSpawnSync('sh', ['-c', 'echo hi && rm -rf /']),
    ).toThrow(SpawnSafetyError);
  });

  it('honors a custom binWhitelist/argRegex override via the 4th param', () => {
    expect(() =>
      safeSpawnSync('rm', ['-rf', '/'], undefined, {
        binWhitelist: ['node'],
      }),
    ).toThrow(SpawnSafetyError);
  });
});

// ─── safeSpawn — unsafe invocations are rejected before any process runs ──────

describe('safeSpawn — rejects unsafe invocations', () => {
  it('rejects a non-whitelisted binary (rm) without spawning it', () => {
    expect(() => safeSpawn('rm', ['-rf', '/'])).toThrow(SpawnSafetyError);
  });

  it('rejects a whitelisted binary with a backtick-injected arg', () => {
    expect(() => safeSpawn('node', ['`whoami`'])).toThrow(SpawnSafetyError);
  });

  it('throws synchronously — no ChildProcess is ever created for unsafe input', () => {
    // If validation ran after spawn (or not at all), this would return a
    // ChildProcess instead of throwing.
    let result: unknown;
    expect(() => {
      result = safeSpawn('rm', ['-rf', '/']);
    }).toThrow(SpawnSafetyError);
    expect(result).toBeUndefined();
  });
});

// ─── safe invocations pass through with unchanged spawn semantics ─────────────

describe('safeSpawnSync — safe invocations behave exactly like spawnSync', () => {
  it('runs a real whitelisted process and returns real stdout', () => {
    const script = writeScript(
      'stdout-ok.js',
      'process.stdout.write("safe-spawn-sync-ok");',
    );
    const result = safeSpawnSync('node', [script], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('safe-spawn-sync-ok');
  });

  it('propagates a non-zero exit code like plain spawnSync would', () => {
    const script = writeScript('exit-7.js', 'process.exit(7);');
    const result = safeSpawnSync('node', [script], { encoding: 'utf8' });
    expect(result.status).toBe(7);
  });

  it('passes options through unchanged (cwd/env honored)', () => {
    const script = writeScript(
      'env-echo.js',
      'process.stdout.write(process.env.SPAWN_SAFETY_WIRE_TEST || "");',
    );
    const result = safeSpawnSync('node', [script], {
      encoding: 'utf8',
      env: { ...process.env, SPAWN_SAFETY_WIRE_TEST: 'wired' },
    });
    expect(result.stdout).toBe('wired');
  });
});

describe('safeSpawn — safe invocations behave exactly like spawn', () => {
  it('runs a real whitelisted process and streams real stdout', async () => {
    const script = writeScript(
      'stdout-async-ok.js',
      'process.stdout.write("safe-spawn-async-ok");',
    );
    const child = safeSpawn('node', [script], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = await new Promise<string>((resolve, reject) => {
      let out = '';
      child.stdout?.on('data', (chunk) => {
        out += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', () => resolve(out));
    });

    expect(stdout).toBe('safe-spawn-async-ok');
  });
});

// ─── Drop-in adoption shape — importable + directly callable at a call-site ───

describe('safeSpawn / safeSpawnSync — drop-in call-site shape', () => {
  it('safeSpawnSync accepts (bin, args) with no options, mirroring assertSpawnSafe(bin, args)', () => {
    const result = safeSpawnSync('node', ['--version']);
    expect(result.status).toBe(0);
  });

  it('is a plain function value that can be imported and invoked like child_process.spawnSync', () => {
    expect(typeof safeSpawnSync).toBe('function');
    expect(typeof safeSpawn).toBe('function');
  });
});
