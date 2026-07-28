// ─── "Broker never given" legacy path is its own observable signal (459-002) ──
//
// 458-002 (A4) gave the "broker PRESENT + DENIED" fail-closed branch a distinct
// debugLog tag (`subprocess:deckbroker-denied`) + a distinct worker-entry
// marker (`deckBrokerDenial` / `getDeckBrokerDenial`). The OTHER negative-ish
// branch — "broker ABSENT altogether" (`opts.deckBroker` never supplied), i.e.
// the pre-broker legacy `opts.env` passthrough — stayed completely silent: no
// debugLog call, no marker. Anyone tailing debugLog/ERRORS.md or inspecting a
// worker entry could not tell "no broker was ever involved" apart from "no
// signal fired for some other reason".
//
// This file is the evidence that the two branches are now SEPARATELY
// observable (459-002, A5):
//   - legacy (no broker at all)      → debugLog('subprocess:deckbroker-legacy', ...)
//                                       + getDeckBrokerLegacy(taskId) === true
//   - fail-closed (broker + denied)  → debugLog('subprocess:deckbroker-denied', ...)
//                                       + getDeckBrokerDenial(taskId) is defined
// and that they are mutually exclusive, AND that the legacy branch's actual
// child-env behavior is byte-for-byte unchanged (opts.env still reinjected
// exactly as before — this task must not touch Batch 2's fail-closed logic or
// the legacy branch's behavior, only make it visible).
//
// Hermeticity: mirrors tests/providers/subprocess-broker-fail-closed.test.ts —
// fresh `mkdtempSync` tmpdir projectDir, mocked `deck-file.js` (no real `.deck`
// read), injected `spawnImpl` seam (no real process spawned, no `spawnSync`),
// git-guard shim dirs cleaned up, touched `process.env` keys snapshotted and
// restored. `debugLog` is mocked directly so the assertion is on the exact
// tag/message the production code passes, independent of the ERRORS.md
// no-op-under-VITEST behavior in core/utils.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { ChildProcess, SpawnOptions, spawn as nodeSpawn } from 'node:child_process';
import type { ModelType } from '../../src/core/types.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import type { SubprocessProviderConfig } from '../../src/providers/subprocess.js';

vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn(() => ({})),
}));

const { debugLogMock } = vi.hoisted(() => ({ debugLogMock: vi.fn() }));
vi.mock('../../src/core/utils.js', () => ({
  debugLog: debugLogMock,
}));

import { loadDeckSecrets } from '../../src/core/deck-file.js';
import { DeckBroker } from '../../src/core/deck-broker.js';
import { LocalSubprocessTestBackend } from '../helpers/local-subprocess-backend-fixture.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const OWN_KEY = 'ANTHROPIC_API_KEY';
const FOREIGN_KEY = 'OPENAI_API_KEY';

const BROKER_SECRET = 'sk-ant-BROKER-GRANT';
/** Handed in via `opts.env` — the legacy passthrough this file proves is unchanged. */
const OPTS_ENV_SECRET = 'sk-ant-OPTSENV-LEGACY';
const AMBIENT_SECRET = 'sk-ant-HOST-AMBIENT';

const TTL_MS = 60_000;

const CLAUDE_TEST_CONFIG: SubprocessProviderConfig = {
  cliCommand: 'claude',
  name: 'claude-subprocess',
  supportedModels: [],
  buildArgs: () => [],
  buildCommandString: () => '',
};

interface SpawnRecord {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
}

function makeFakeChild(): ChildProcess {
  const child = {
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: null,
    stderr: null,
    once: vi.fn(),
    on: vi.fn(),
    kill: vi.fn(),
    unref: vi.fn(),
    pid: 4242,
  };
  child.once.mockReturnValue(child);
  child.on.mockReturnValue(child);
  return child as unknown as ChildProcess;
}

describe('SubprocessSpawnBackend — legacy (no-broker) path is separately observable from fail-closed denial (459-002)', () => {
  let projectDir: string;
  let spawned: SpawnRecord[];
  let spawnImpl: typeof nodeSpawn;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDeckSecrets).mockReturnValue({});

    projectDir = mkdtempSync(join(tmpdir(), 'deckent-459-002-'));
    spawned = [];
    spawnImpl = ((command: string, args: readonly string[], opts: SpawnOptions) => {
      spawned.push({ command, args, env: opts.env ?? {} });
      return makeFakeChild();
    }) as unknown as typeof nodeSpawn;

    savedEnv = {};
    for (const key of [OWN_KEY, FOREIGN_KEY]) {
      savedEnv[key] = process.env[key];
    }
    process.env[OWN_KEY] = AMBIENT_SECRET;
    delete process.env[FOREIGN_KEY];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const dir of spawned.flatMap((record) => gitGuardDirs(record.env))) {
      rmSync(dir, { recursive: true, force: true });
    }
    rmSync(projectDir, { recursive: true, force: true });
  });

  function gitGuardDirs(env: NodeJS.ProcessEnv): string[] {
    const guardRoot = join(tmpdir(), 'deckent-git-guard');
    return (env['PATH'] ?? '').split(delimiter).filter((entry) => entry.startsWith(guardRoot));
  }

  function makeBackend(): LocalSubprocessTestBackend {
    return new LocalSubprocessTestBackend(projectDir, {
      providerConfig: CLAUDE_TEST_CONFIG,
      platform: 'linux',
      spawnImpl,
    });
  }

  function spawnAndCapture(
    taskId: string,
    opts: ProviderSpawnOptions,
  ): { backend: LocalSubprocessTestBackend; env: NodeJS.ProcessEnv } {
    const backend = makeBackend();
    backend.spawn(taskId, 'opus' as ModelType, 'prompt', opts);
    const record = spawned.at(-1);
    expect(record, 'spawn seam was never called').toBeDefined();
    return { backend, env: record!.env };
  }

  function makeBrokerWithOwnSecret(): DeckBroker {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: BROKER_SECRET });
    return new DeckBroker(projectDir, { ttlMs: TTL_MS });
  }

  // ─── Legacy branch: no opts.deckBroker at all ──────────────────────────────

  it('no broker + opts.env present → legacy debugLog tag fires, opts.env is reinjected unchanged, legacy marker set (not denial)', () => {
    const { backend, env } = spawnAndCapture('t-legacy-env', {
      env: { [OWN_KEY]: OPTS_ENV_SECRET },
    });

    // Behavior unchanged: the legacy opts.env passthrough still runs byte-for-byte.
    expect(env[OWN_KEY]).toBe(OPTS_ENV_SECRET);
    expect(env[OWN_KEY]).not.toBe(AMBIENT_SECRET);

    // New observability: a distinct tag, never the denial tag.
    const legacyCalls = debugLogMock.mock.calls.filter((c) => c[0] === 'subprocess:deckbroker-legacy');
    const deniedCalls = debugLogMock.mock.calls.filter((c) => c[0] === 'subprocess:deckbroker-denied');
    expect(legacyCalls).toHaveLength(1);
    expect(deniedCalls).toHaveLength(0);
    expect(String(legacyCalls[0]![1])).toContain('t-legacy-env');
    expect(String(legacyCalls[0]![1])).toContain('claude');

    // New audit marker: legacy set, denial absent.
    expect(backend.getDeckBrokerLegacy('t-legacy-env')).toBe(true);
    expect(backend.getDeckBrokerDenial('t-legacy-env')).toBeUndefined();
  });

  it('no broker + no opts.env → legacy debugLog tag still fires (broker was never supplied), child env carries no credential (unchanged)', () => {
    const { backend, env } = spawnAndCapture('t-legacy-noenv', {});

    // Behavior unchanged: nothing was assigned before this task either.
    expect(env[OWN_KEY]).toBeUndefined();

    const legacyCalls = debugLogMock.mock.calls.filter((c) => c[0] === 'subprocess:deckbroker-legacy');
    const deniedCalls = debugLogMock.mock.calls.filter((c) => c[0] === 'subprocess:deckbroker-denied');
    expect(legacyCalls).toHaveLength(1);
    expect(deniedCalls).toHaveLength(0);

    expect(backend.getDeckBrokerLegacy('t-legacy-noenv')).toBe(true);
    expect(backend.getDeckBrokerDenial('t-legacy-noenv')).toBeUndefined();
  });

  // ─── Fail-closed branch stays intact and mutually exclusive with legacy ────

  it('broker supplied + denied → ORIGINAL denial debugLog tag fires, legacy tag never fires, legacy marker absent', () => {
    const broker = makeBrokerWithOwnSecret();
    // Burn the single-use grant so the next resolve for this taskId is denied.
    broker.resolveForTaskWithReason('t-denied', 'claude');

    const { backend, env } = spawnAndCapture('t-denied', {
      deckBroker: broker,
      env: { [OWN_KEY]: OPTS_ENV_SECRET },
    });

    // Fail-closed behavior (458-002) untouched: no opts.env fallback.
    expect(env[OWN_KEY]).toBeUndefined();

    const legacyCalls = debugLogMock.mock.calls.filter((c) => c[0] === 'subprocess:deckbroker-legacy');
    const deniedCalls = debugLogMock.mock.calls.filter((c) => c[0] === 'subprocess:deckbroker-denied');
    expect(deniedCalls).toHaveLength(1);
    expect(legacyCalls).toHaveLength(0);

    expect(backend.getDeckBrokerDenial('t-denied')?.reason).toBe('already-consumed');
    expect(backend.getDeckBrokerLegacy('t-denied')).toBeUndefined();
  });

  it('broker supplied + granted → neither legacy nor denied signal fires', () => {
    const broker = makeBrokerWithOwnSecret();

    const { backend, env } = spawnAndCapture('t-granted', {
      deckBroker: broker,
      env: { [OWN_KEY]: OPTS_ENV_SECRET },
    });

    expect(env[OWN_KEY]).toBe(BROKER_SECRET);

    const legacyCalls = debugLogMock.mock.calls.filter((c) => c[0] === 'subprocess:deckbroker-legacy');
    const deniedCalls = debugLogMock.mock.calls.filter((c) => c[0] === 'subprocess:deckbroker-denied');
    expect(legacyCalls).toHaveLength(0);
    expect(deniedCalls).toHaveLength(0);

    expect(backend.getDeckBrokerLegacy('t-granted')).toBeUndefined();
    expect(backend.getDeckBrokerDenial('t-granted')).toBeUndefined();
  });
});
