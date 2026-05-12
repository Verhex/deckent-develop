import { describe, it, expect } from 'vitest';

import {
  ADAPTER_BIN_WHITELIST,
  SH_C_ALLOWED,
  SpawnSafetyError,
  assertSpawnSafe,
  isSpawnSafe,
} from '../../src/core/spawn-safety.js';

// ─── ADAPTER_BIN_WHITELIST ───────────────────────────────────────────────

describe('ADAPTER_BIN_WHITELIST', () => {
  it('contains the expected default binaries', () => {
    expect(ADAPTER_BIN_WHITELIST).toEqual([
      'node',
      'npx',
      'vitest',
      'tsc',
      'python',
      'python3',
      'go',
      'cargo',
      'java',
      'dotnet',
    ]);
  });

  it('is frozen — mutation attempts throw in strict mode and have no effect', () => {
    expect(Object.isFrozen(ADAPTER_BIN_WHITELIST)).toBe(true);
    expect(() => {
      (ADAPTER_BIN_WHITELIST as unknown as string[]).push('rm');
    }).toThrow();
    expect(ADAPTER_BIN_WHITELIST).not.toContain('rm');
  });
});

// ─── SH_C_ALLOWED ────────────────────────────────────────────────────────

describe('SH_C_ALLOWED', () => {
  it('matches alphanumerics, underscore, hyphen, dot, slash, whitespace, equals', () => {
    expect(SH_C_ALLOWED.test('vitest')).toBe(true);
    expect(SH_C_ALLOWED.test('run --reporter=json')).toBe(true);
    expect(SH_C_ALLOWED.test('tests/core/spawn-safety.test.ts')).toBe(true);
    expect(SH_C_ALLOWED.test('NODE_ENV=production node script.js')).toBe(true);
  });

  it('rejects shell metacharacters', () => {
    expect(SH_C_ALLOWED.test('a; b')).toBe(false);
    expect(SH_C_ALLOWED.test('a && b')).toBe(false);
    expect(SH_C_ALLOWED.test('a | b')).toBe(false);
    expect(SH_C_ALLOWED.test('a `b`')).toBe(false);
    expect(SH_C_ALLOWED.test('a $b')).toBe(false);
    expect(SH_C_ALLOWED.test('a $(b)')).toBe(false);
    expect(SH_C_ALLOWED.test('a < b')).toBe(false);
    expect(SH_C_ALLOWED.test('a > b')).toBe(false);
    expect(SH_C_ALLOWED.test("a'b")).toBe(false);
    expect(SH_C_ALLOWED.test('a"b')).toBe(false);
    expect(SH_C_ALLOWED.test('a*b')).toBe(false);
    expect(SH_C_ALLOWED.test('a(b)')).toBe(false);
    expect(SH_C_ALLOWED.test('a{b}')).toBe(false);
  });

  it('classifies newline/CR as whitespace per spec — \\s in JS regex includes \\n/\\r/\\t', () => {
    // Per spec regex /^[A-Za-z0-9_\-\.\/\s\=]+$/, \s matches all whitespace
    // including newlines. This is a known limitation of the primitive: for
    // direct spawn() with array args (not `sh -c`), newlines are data, not
    // command separators, so this is acceptable. Callers passing args to
    // `sh -c` MUST do additional newline validation themselves.
    expect(SH_C_ALLOWED.test('a\nb')).toBe(true);
    expect(SH_C_ALLOWED.test('a\rb')).toBe(true);
    expect(SH_C_ALLOWED.test('a\tb')).toBe(true);
  });
});

// ─── assertSpawnSafe — bin whitelist ─────────────────────────────────────

describe('assertSpawnSafe — bin whitelist', () => {
  it('accepts a bare whitelisted binary', () => {
    expect(() => assertSpawnSafe('npx', ['vitest', 'run'])).not.toThrow();
  });

  it('accepts an absolute-path whitelisted binary via basename', () => {
    expect(() => assertSpawnSafe('/usr/local/bin/node', ['script.js'])).not.toThrow();
  });

  it('rejects a non-whitelisted binary such as rm', () => {
    expect(() => assertSpawnSafe('rm', ['-rf', '/'])).toThrow(SpawnSafetyError);
    try {
      assertSpawnSafe('rm', ['-rf', '/']);
    } catch (err) {
      expect(err).toBeInstanceOf(SpawnSafetyError);
      const e = err as SpawnSafetyError;
      expect(e.code).toBe('BIN_NOT_WHITELISTED');
      expect(e.bin).toBe('rm');
    }
  });

  it('rejects sh / bash because they are not whitelisted', () => {
    expect(() => assertSpawnSafe('sh', ['-c', 'echo hi'])).toThrow(SpawnSafetyError);
    expect(() => assertSpawnSafe('bash', ['-c', 'echo hi'])).toThrow(SpawnSafetyError);
  });

  it('accepts every entry in ADAPTER_BIN_WHITELIST with a minimal arg', () => {
    for (const bin of ADAPTER_BIN_WHITELIST) {
      expect(() => assertSpawnSafe(bin, ['--version'])).not.toThrow();
    }
  });
});

// ─── assertSpawnSafe — arg injection ─────────────────────────────────────

describe('assertSpawnSafe — arg injection', () => {
  it('rejects a semicolon-injected arg', () => {
    expect(() => assertSpawnSafe('npx', ['vitest', 'run; rm -rf /'])).toThrow(
      SpawnSafetyError,
    );
    try {
      assertSpawnSafe('npx', ['vitest', 'run; rm -rf /']);
    } catch (err) {
      expect(err).toBeInstanceOf(SpawnSafetyError);
      const e = err as SpawnSafetyError;
      expect(e.code).toBe('ARG_INJECTION');
      expect(e.bin).toBe('npx');
      expect(e.badArg).toBe('run; rm -rf /');
    }
  });

  it('rejects standalone shell-separator args', () => {
    expect(() => assertSpawnSafe('npx', ['vitest', ';', 'rm'])).toThrow(
      SpawnSafetyError,
    );
  });

  it('rejects backtick / dollar / pipe / redirect injection attempts', () => {
    expect(() => assertSpawnSafe('node', ['`whoami`'])).toThrow(SpawnSafetyError);
    expect(() => assertSpawnSafe('node', ['$(whoami)'])).toThrow(SpawnSafetyError);
    expect(() => assertSpawnSafe('node', ['a|b'])).toThrow(SpawnSafetyError);
    expect(() => assertSpawnSafe('node', ['a&&b'])).toThrow(SpawnSafetyError);
    expect(() => assertSpawnSafe('node', ['a>b'])).toThrow(SpawnSafetyError);
    expect(() => assertSpawnSafe('node', ['a<b'])).toThrow(SpawnSafetyError);
  });

  it('accepts complex but safe vitest invocation', () => {
    expect(() =>
      assertSpawnSafe('npx', [
        'vitest',
        'run',
        '--reporter=json',
        'tests/core/spawn-safety.test.ts',
      ]),
    ).not.toThrow();
  });

  it('accepts an empty args array', () => {
    expect(() => assertSpawnSafe('node', [])).not.toThrow();
  });

  it('accepts empty-string args (no injection vector)', () => {
    expect(() => assertSpawnSafe('node', ['', 'script.js'])).not.toThrow();
  });
});

// ─── assertSpawnSafe — invalid input ─────────────────────────────────────

describe('assertSpawnSafe — invalid input', () => {
  it('rejects non-string bin', () => {
    expect(() =>
      assertSpawnSafe(undefined as unknown as string, []),
    ).toThrow(SpawnSafetyError);
    expect(() => assertSpawnSafe('', [])).toThrow(SpawnSafetyError);
    expect(() => assertSpawnSafe(42 as unknown as string, [])).toThrow(
      SpawnSafetyError,
    );
  });

  it('rejects non-array args', () => {
    expect(() =>
      assertSpawnSafe('node', 'script.js' as unknown as string[]),
    ).toThrow(SpawnSafetyError);
  });

  it('rejects non-string args entries', () => {
    expect(() =>
      assertSpawnSafe('node', [42 as unknown as string]),
    ).toThrow(SpawnSafetyError);
    try {
      assertSpawnSafe('node', [42 as unknown as string]);
    } catch (err) {
      const e = err as SpawnSafetyError;
      expect(e.code).toBe('INVALID_INPUT');
    }
  });
});

// ─── assertSpawnSafe — option overrides ──────────────────────────────────

describe('assertSpawnSafe — option overrides', () => {
  it('honors a custom binWhitelist', () => {
    expect(() =>
      assertSpawnSafe('docker', ['info'], { binWhitelist: ['docker'] }),
    ).not.toThrow();
    expect(() =>
      assertSpawnSafe('node', ['script.js'], { binWhitelist: ['docker'] }),
    ).toThrow(SpawnSafetyError);
  });

  it('honors a custom argRegex', () => {
    const permissive = /^.+$/;
    expect(() =>
      assertSpawnSafe('node', ['a; b'], { argRegex: permissive }),
    ).not.toThrow();
  });
});

// ─── isSpawnSafe boolean variant ─────────────────────────────────────────

describe('isSpawnSafe', () => {
  it('returns true for safe invocations', () => {
    expect(isSpawnSafe('npx', ['vitest', 'run'])).toBe(true);
  });

  it('returns false for whitelist violations', () => {
    expect(isSpawnSafe('rm', ['-rf', '/'])).toBe(false);
  });

  it('returns false for arg-injection attempts', () => {
    expect(isSpawnSafe('npx', ['vitest', 'run; rm -rf /'])).toBe(false);
  });

  it('returns false for invalid inputs', () => {
    expect(isSpawnSafe('', [])).toBe(false);
    expect(isSpawnSafe('node', 'oops' as unknown as string[])).toBe(false);
  });
});

// ─── SpawnSafetyError shape ──────────────────────────────────────────────

describe('SpawnSafetyError', () => {
  it('exposes code / bin / badArg fields', () => {
    const err = new SpawnSafetyError('ARG_INJECTION', 'bad', 'npx', '; rm');
    expect(err.name).toBe('SpawnSafetyError');
    expect(err.code).toBe('ARG_INJECTION');
    expect(err.bin).toBe('npx');
    expect(err.badArg).toBe('; rm');
    expect(err).toBeInstanceOf(Error);
  });
});
