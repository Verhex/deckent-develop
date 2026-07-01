import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join, win32 } from 'node:path';
import { homedir } from 'node:os';

import {
  resolveDeckentHome,
  resolveBrainHome,
  deckentPath,
  brainPath,
} from '../../src/core/state-paths.js';

const DECKENT_HOME_ENV = 'DECKENT_HOME';
const BRAIN_HOME_ENV = 'BRAIN_HOME';

// vi.mock is hoisted above imports — vi.hoisted lets the factory below
// reference this constant without a temporal-dead-zone error.
const { FAKE_HOME } = vi.hoisted(() => ({ FAKE_HOME: '/fake/home/alperen' }));

// os.homedir() must never resolve to the real developer home in this suite
// (ADR-D-002 C1 hermeticity) — mocked once for the whole file.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(() => FAKE_HOME) };
});

beforeEach(() => {
  delete process.env[DECKENT_HOME_ENV];
  delete process.env[BRAIN_HOME_ENV];
  vi.mocked(homedir).mockReturnValue(FAKE_HOME);
});

afterEach(() => {
  delete process.env[DECKENT_HOME_ENV];
  delete process.env[BRAIN_HOME_ENV];
});

describe('resolveDeckentHome', () => {
  it('falls back to os.homedir()/.deckent when no env and no projectRoot (global-install fallback)', () => {
    expect(resolveDeckentHome()).toBe(join(FAKE_HOME, '.deckent'));
  });

  it('resolves to <projectRoot>/.deckent when projectRoot is given and no env override (current convention)', () => {
    expect(resolveDeckentHome('/workspace/my-project')).toBe(join('/workspace/my-project', '.deckent'));
  });

  it('DECKENT_HOME env override beats projectRoot', () => {
    process.env[DECKENT_HOME_ENV] = '/custom/deckent-home';
    expect(resolveDeckentHome('/workspace/my-project')).toBe('/custom/deckent-home');
  });

  it('DECKENT_HOME env override beats the global-install fallback when no projectRoot given', () => {
    process.env[DECKENT_HOME_ENV] = '/custom/deckent-home';
    expect(resolveDeckentHome()).toBe('/custom/deckent-home');
  });

  it('treats an empty-string DECKENT_HOME as unset (falls through to the next precedence tier)', () => {
    process.env[DECKENT_HOME_ENV] = '';
    expect(resolveDeckentHome('/workspace/my-project')).toBe(join('/workspace/my-project', '.deckent'));
  });
});

describe('resolveBrainHome', () => {
  it('falls back to os.homedir()/.brain when no env and no projectRoot (global-install fallback)', () => {
    expect(resolveBrainHome()).toBe(join(FAKE_HOME, '.brain'));
  });

  it('resolves to <projectRoot>/.brain when projectRoot is given and no env override (current convention)', () => {
    expect(resolveBrainHome('/workspace/my-project')).toBe(join('/workspace/my-project', '.brain'));
  });

  it('BRAIN_HOME env override beats projectRoot', () => {
    process.env[BRAIN_HOME_ENV] = '/custom/brain-home';
    expect(resolveBrainHome('/workspace/my-project')).toBe('/custom/brain-home');
  });

  it('BRAIN_HOME env override beats the global-install fallback when no projectRoot given', () => {
    process.env[BRAIN_HOME_ENV] = '/custom/brain-home';
    expect(resolveBrainHome()).toBe('/custom/brain-home');
  });

  it('DECKENT_HOME and BRAIN_HOME are independent overrides', () => {
    process.env[DECKENT_HOME_ENV] = '/custom/deckent-home';
    expect(resolveBrainHome('/workspace/my-project')).toBe(join('/workspace/my-project', '.brain'));
  });
});

describe('deckentPath', () => {
  it('joins segments onto the resolved deckent home (project-local branch)', () => {
    expect(deckentPath('/workspace/my-project', 'config.json')).toBe(
      join('/workspace/my-project', '.deckent', 'config.json'),
    );
  });

  it('joins nested segments onto the resolved deckent home (env-override branch)', () => {
    process.env[DECKENT_HOME_ENV] = '/custom/deckent-home';
    expect(
      deckentPath('/workspace/my-project', 'runtime', 'decisions', 'decision-1.json'),
    ).toBe(join('/custom/deckent-home', 'runtime', 'decisions', 'decision-1.json'));
  });

  it('joins segments onto the global-install fallback when no projectRoot given', () => {
    expect(deckentPath(undefined, 'config.json')).toBe(join(FAKE_HOME, '.deckent', 'config.json'));
  });

  it('returns the bare resolved home when no segments are given', () => {
    expect(deckentPath('/workspace/my-project')).toBe(join('/workspace/my-project', '.deckent'));
  });
});

describe('brainPath', () => {
  it('joins segments onto the resolved brain home (project-local branch)', () => {
    expect(brainPath('/workspace/my-project', 'memory.db')).toBe(
      join('/workspace/my-project', '.brain', 'memory.db'),
    );
  });

  it('joins segments onto the resolved brain home (env-override branch)', () => {
    process.env[BRAIN_HOME_ENV] = '/custom/brain-home';
    expect(brainPath('/workspace/my-project', 'exports', 'summary.md')).toBe(
      join('/custom/brain-home', 'exports', 'summary.md'),
    );
  });

  it('joins segments onto the global-install fallback when no projectRoot given', () => {
    expect(brainPath(undefined, 'memory.db')).toBe(join(FAKE_HOME, '.brain', 'memory.db'));
  });
});

describe('env is read at call time, not module-load time', () => {
  it('picks up a DECKENT_HOME set AFTER the module was already imported', () => {
    expect(resolveDeckentHome('/workspace/my-project')).toBe(join('/workspace/my-project', '.deckent'));

    process.env[DECKENT_HOME_ENV] = '/late-set/deckent-home';
    expect(resolveDeckentHome('/workspace/my-project')).toBe('/late-set/deckent-home');

    delete process.env[DECKENT_HOME_ENV];
    expect(resolveDeckentHome('/workspace/my-project')).toBe(join('/workspace/my-project', '.deckent'));
  });

  it('picks up a BRAIN_HOME set AFTER the module was already imported', () => {
    expect(resolveBrainHome()).toBe(join(FAKE_HOME, '.brain'));

    process.env[BRAIN_HOME_ENV] = '/late-set/brain-home';
    expect(resolveBrainHome()).toBe('/late-set/brain-home');
  });
});

describe('Windows-style path join (no hardcoded separator)', () => {
  // node:path's `join` is platform-selected by Node itself (win32 vs posix)
  // based on process.platform — the resolver never branches on OS, it just
  // calls `join` from 'node:path' and trusts Node to pick the right backend.
  // To prove no '/' is ever hardcoded, this mocks 'node:path' so `join`
  // resolves to `path.win32.join` — exactly what happens automatically on
  // real Windows — and asserts segments come out correctly backslash-joined.
  // Uses an explicit projectRoot throughout so it never depends on the
  // (separately mocked) os.homedir() surviving vi.resetModules().
  afterEach(() => {
    vi.doUnmock('node:path');
    vi.resetModules();
  });

  it('delegates to path.win32.join when that is what node:path resolves to', async () => {
    vi.resetModules();
    vi.doMock('node:path', async () => {
      const actual = await vi.importActual<typeof import('node:path')>('node:path');
      return { ...actual, join: actual.win32.join };
    });
    delete process.env[DECKENT_HOME_ENV];
    delete process.env[BRAIN_HOME_ENV];

    const { deckentPath: winDeckentPath, brainPath: winBrainPath } = await import(
      '../../src/core/state-paths.js'
    );

    const winRoot = 'C:\\Users\\alperen\\project';
    expect(winDeckentPath(winRoot, 'config.json')).toBe(
      win32.join(winRoot, '.deckent', 'config.json'),
    );
    expect(winBrainPath(winRoot, 'exports', 'summary.md')).toBe(
      win32.join(winRoot, '.brain', 'exports', 'summary.md'),
    );
    expect(winDeckentPath(winRoot, 'config.json')).toContain('\\');
  });
});
