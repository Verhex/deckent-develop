// ─── DeckBroker fail-closed proof — child env carries NO credential (459-001) ──
//
// Batch-2 (458-002 A4) made `SubprocessSpawnBackend.spawn()` fail CLOSED on a
// DeckBroker denial: the legacy `opts.env` credential re-inject is never taken,
// so the spawned child gets no credential for that provider at all. This file is
// the EVIDENCE for that behaviour, for each of the three closed-union denial
// reasons (`expired`, `already-consumed`, `no-secret`).
//
// What is actually asserted (and why it is not a weaker proxy):
//   - The assertion target is the REAL child environment — `spawnOpts.env`, the
//     3rd argument the backend hands to its spawn seam — NOT "resolveForTask
//     returned null". A broker-level assertion would prove the broker denied and
//     nothing about what the child process ended up holding.
//   - Every denial case supplies a POPULATED `opts.env` carrying the provider's
//     credential AND leaves an ambient `process.env` credential in place. That is
//     the whole point: the pre-batch-2 code would have re-injected `opts.env`, so
//     a test that omitted it could pass against a leaking implementation.
//   - The secret VALUES are searched for across the entire serialized child env,
//     not just under their canonical key, so a leak under any other name fails.
//   - A `granted` control case proves the credential DOES arrive on the happy
//     path — without it, "no credential in the child env" could be vacuously true
//     for a backend that never injects anything.
//
// Hermeticity: `projectDir` is a fresh `mkdtempSync` tmpdir (the backend's real
// heartbeat/log writes land there and are removed in afterEach); the git-guard
// shim dir the spawn path materializes under the OS tmpdir is read back out of
// the child PATH and removed too. `deck-file.js` is mocked so no `.deck` is ever
// read from disk. The spawn seam is injected (`spawnImpl`), so no real process is
// launched and `spawnSync` is never used. Touched `process.env` keys are
// snapshotted and restored.

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

import { loadDeckSecrets } from '../../src/core/deck-file.js';
import { DeckBroker, type DeckBrokerDenialReason } from '../../src/core/deck-broker.js';
import { LocalSubprocessTestBackend } from '../helpers/local-subprocess-backend-fixture.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** This worker's OWN provider: `claude` → ANTHROPIC_API_KEY. */
const OWN_KEY = 'ANTHROPIC_API_KEY';
/** A DIFFERENT provider configured in the same `.deck` → must never cross-leak. */
const FOREIGN_KEY = 'OPENAI_API_KEY';

const BROKER_SECRET = 'sk-ant-BROKER-GRANT';
const FOREIGN_SECRET = 'sk-oai-FOREIGN-NEVER';
/** Handed in via `opts.env` — the legacy re-inject a denial must NOT take. */
const OPTS_ENV_SECRET = 'sk-ant-OPTSENV-FALLBACK';
/** Present in the host env — the cross-provider scrub must drop it regardless. */
const AMBIENT_SECRET = 'sk-ant-HOST-AMBIENT';

const TTL_MS = 60_000;
const T0 = Date.UTC(2026, 6, 25, 12, 0, 0);

const CLAUDE_TEST_CONFIG: SubprocessProviderConfig = {
  cliCommand: 'claude',
  name: 'claude-subprocess',
  supportedModels: [],
  buildArgs: () => [],
  buildCommandString: () => '',
};

/** One observed spawn — the child env is the evidence this file is about. */
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

// ─── Harness ─────────────────────────────────────────────────────────────────

describe('SubprocessSpawnBackend — DeckBroker denial fails CLOSED in the real child env (459-001)', () => {
  let projectDir: string;
  let spawned: SpawnRecord[];
  let spawnImpl: typeof nodeSpawn;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDeckSecrets).mockReturnValue({});

    projectDir = mkdtempSync(join(tmpdir(), 'deckent-459-001-'));
    spawned = [];
    spawnImpl = ((command: string, args: readonly string[], opts: SpawnOptions) => {
      spawned.push({ command, args, env: opts.env ?? {} });
      return makeFakeChild();
    }) as unknown as typeof nodeSpawn;

    savedEnv = {};
    for (const key of [OWN_KEY, FOREIGN_KEY]) {
      savedEnv[key] = process.env[key];
    }
    // The host ambient credential the cross-provider scrub is expected to drop.
    process.env[OWN_KEY] = AMBIENT_SECRET;
    delete process.env[FOREIGN_KEY];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // The spawn path materializes a POSIX git-guard shim under the OS tmpdir and
    // points the child PATH at it — clean every one this test created.
    for (const dir of spawned.flatMap((record) => gitGuardDirs(record.env))) {
      rmSync(dir, { recursive: true, force: true });
    }
    rmSync(projectDir, { recursive: true, force: true });
  });

  /** PATH entries the backend prepended for the git-guard shim (tmpdir-scoped). */
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

  /**
   * Spawn one worker through the production code path and return the env the
   * child would actually have received, plus the typed denial the backend
   * recorded for it (secondary evidence — the env assertion is the primary one).
   */
  function spawnAndCaptureChildEnv(
    taskId: string,
    opts: ProviderSpawnOptions,
  ): { env: NodeJS.ProcessEnv; denialReason: DeckBrokerDenialReason | undefined } {
    const backend = makeBackend();
    backend.spawn(taskId, 'opus' as ModelType, 'prompt', opts);
    const record = spawned.at(-1);
    expect(record, 'spawn seam was never called').toBeDefined();
    return {
      env: record!.env,
      denialReason: backend.getDeckBrokerDenial(taskId)?.reason,
    };
  }

  /** A broker over a `.deck` holding this worker's own credential + a foreign one. */
  function makeBrokerWithBothSecrets(now?: () => Date): DeckBroker {
    vi.mocked(loadDeckSecrets).mockReturnValue({
      DECKENT_CLAUDE_API_KEY: BROKER_SECRET,
      DECKENT_OPENAI_API_KEY: FOREIGN_SECRET,
    });
    return new DeckBroker(projectDir, { ttlMs: TTL_MS, ...(now ? { now } : {}) });
  }

  // ─── Control: the granted path DOES deliver the credential ─────────────────
  //
  // Without this, every "key is absent" assertion below could hold for a backend
  // that simply never injects anything — the fail-closed proof would be vacuous.

  it('CONTROL granted → child env carries the BROKER credential (not opts.env, not the host ambient one)', () => {
    const broker = makeBrokerWithBothSecrets();

    const { env, denialReason } = spawnAndCaptureChildEnv('t-granted', {
      deckBroker: broker,
      env: { [OWN_KEY]: OPTS_ENV_SECRET },
    });

    expect(denialReason).toBeUndefined();
    expect(env[OWN_KEY]).toBe(BROKER_SECRET);
    expect(env[OWN_KEY]).not.toBe(OPTS_ENV_SECRET);
    expect(env[OWN_KEY]).not.toBe(AMBIENT_SECRET);
    // The other provider's `.deck` secret is task-scoped away even when granted.
    expect(env[FOREIGN_KEY]).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain(FOREIGN_SECRET);
  });

  // ─── The three denial reasons ──────────────────────────────────────────────

  /**
   * Each case returns a broker already in the denying state for `taskId`, so the
   * spawn below exercises exactly one closed-union `DeckBrokerDenialReason`.
   */
  const DENIAL_CASES: ReadonlyArray<{
    reason: DeckBrokerDenialReason;
    taskId: string;
    /** Secret this worker's own provider is expected to be denied. */
    ownSecret: string | undefined;
    makeBroker: (self: {
      makeBrokerWithBothSecrets: (now?: () => Date) => DeckBroker;
      projectDir: string;
    }) => DeckBroker;
  }> = [
    {
      reason: 'expired',
      taskId: 't-expired',
      ownSecret: BROKER_SECRET,
      makeBroker: (self) => {
        // Injected clock: minted at T0, read back past the TTL window at spawn.
        let nowMs = T0;
        const broker = self.makeBrokerWithBothSecrets(() => new Date(nowMs));
        nowMs = T0 + TTL_MS + 1;
        return broker;
      },
    },
    {
      reason: 'already-consumed',
      taskId: 't-consumed',
      ownSecret: BROKER_SECRET,
      makeBroker: (self) => {
        const broker = self.makeBrokerWithBothSecrets();
        // Burn this exact taskId's single-use grant before spawn() ever runs.
        const first = broker.resolveForTaskWithReason('t-consumed', 'claude');
        expect(first.state).toBe('granted');
        return broker;
      },
    },
    {
      reason: 'no-secret',
      taskId: 't-nosecret',
      ownSecret: undefined,
      makeBroker: (self) => {
        // `.deck` holds ONLY the FOREIGN provider's credential: `claude` has no
        // secret to resolve, and the foreign one must not stand in for it.
        vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_OPENAI_API_KEY: FOREIGN_SECRET });
        return new DeckBroker(self.projectDir, { ttlMs: TTL_MS });
      },
    },
  ];

  for (const testCase of DENIAL_CASES) {
    it(`denied "${testCase.reason}" → child env has NO ${OWN_KEY}, even though opts.env supplies one`, () => {
      const broker = testCase.makeBroker({ makeBrokerWithBothSecrets, projectDir });

      const { env, denialReason } = spawnAndCaptureChildEnv(testCase.taskId, {
        deckBroker: broker,
        // The legacy re-inject path a denial must refuse to take.
        env: { [OWN_KEY]: OPTS_ENV_SECRET },
      });

      // Primary evidence: the credential key is absent from the REAL child env.
      expect(env[OWN_KEY]).toBeUndefined();
      expect(OWN_KEY in env).toBe(false);

      // No value-level leak under any other key, from any of the three sources.
      const serialized = JSON.stringify(env);
      expect(serialized).not.toContain(OPTS_ENV_SECRET);
      expect(serialized).not.toContain(AMBIENT_SECRET);
      if (testCase.ownSecret) expect(serialized).not.toContain(testCase.ownSecret);

      // No cross-provider leak either.
      expect(env[FOREIGN_KEY]).toBeUndefined();
      expect(serialized).not.toContain(FOREIGN_SECRET);

      // Secondary evidence: the backend recorded the exact typed reason.
      expect(denialReason).toBe(testCase.reason);

      // Fail-closed is not fail-hard: the worker still spawned, with a usable env.
      expect(spawned).toHaveLength(1);
      expect(env['PATH']).toBeTruthy();
      expect(env['LANG']).toBeTruthy();
    });
  }

  it('every denial reason in the closed union is covered by this file', () => {
    const covered = DENIAL_CASES.map((c) => c.reason).sort();
    // Adding a 4th `DeckBrokerDenialReason` must break here, not silently ship
    // an unproven fail-closed path.
    const declared: DeckBrokerDenialReason[] = ['already-consumed', 'expired', 'no-secret'];
    expect(covered).toEqual(declared);
  });

  it('a denied spawn never leaks the .deck project path into the child env', () => {
    const broker = makeBrokerWithBothSecrets();
    broker.resolveForTaskWithReason('t-nopath', 'claude');

    const { env, denialReason } = spawnAndCaptureChildEnv('t-nopath', {
      deckBroker: broker,
      env: { [OWN_KEY]: OPTS_ENV_SECRET },
    });

    expect(denialReason).toBe('already-consumed');
    expect(JSON.stringify(env)).not.toContain(projectDir);
    expect(JSON.stringify(env)).not.toContain('.deck');
  });
});
