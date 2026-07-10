import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeServeDaemonMeta } from '../../api/serve-daemon-meta.js';
import type { ConnectionProfile } from '../src/shared/desktop-api.js';
import {
  decideConnectionAction,
  pollHealth,
  resolveTokens,
  spawnDaemon,
  type SpawnedChildLike,
} from '../src/main/daemon-lifecycle.js';
import { readServeDaemonMeta } from '../src/main/daemon-meta-client.js';

class FakeChildProcess extends EventEmitter implements SpawnedChildLike {
  pid = 4242;
  unref = vi.fn();
}

function makeProfile(projectPath: string, overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    label: 'test-profile',
    kind: 'local',
    projectPath,
    host: '127.0.0.1',
    port: 4317,
    autoStart: true,
    orphanShutdownOnQuit: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeResponse(status: number, jsonBody: unknown) {
  return { status, json: async () => jsonBody } as Response;
}

let projectPath: string;

beforeEach(() => {
  projectPath = mkdtempSync(join(tmpdir(), 'deckent-desktop-daemon-lifecycle-'));
});

afterEach(() => {
  rmSync(projectPath, { recursive: true, force: true });
});

describe('decideConnectionAction', () => {
  it('spawns when no handshake meta exists', async () => {
    const profile = makeProfile(projectPath);
    const action = await decideConnectionAction(profile, {});
    expect(action).toBe('spawn');
  });

  it('spawns and clears stale meta when the recorded pid is dead', async () => {
    writeServeDaemonMeta(projectPath, {
      host: '127.0.0.1',
      port: 4317,
      projectRoot: projectPath,
      terminalEnabled: false,
    });
    const profile = makeProfile(projectPath);

    const action = await decideConnectionAction(profile, { isAlive: () => false });

    expect(action).toBe('spawn');
    expect(readServeDaemonMeta(projectPath)).toBeNull();
  });

  it('spawns and clears stale meta when the pid was reused by a different process', async () => {
    writeServeDaemonMeta(projectPath, {
      host: '127.0.0.1',
      port: 4317,
      projectRoot: projectPath,
      terminalEnabled: false,
    });
    const profile = makeProfile(projectPath);

    const action = await decideConnectionAction(profile, {
      isAlive: () => true,
      startToken: () => 'a-completely-different-start-token',
    });

    expect(action).toBe('spawn');
    expect(readServeDaemonMeta(projectPath)).toBeNull();
  });

  it('spawns when /health reports a different projectRoot', async () => {
    writeServeDaemonMeta(projectPath, {
      host: '127.0.0.1',
      port: 4317,
      projectRoot: projectPath,
      terminalEnabled: false,
    });
    const profile = makeProfile(projectPath);
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { projectRoot: '/some/other/project' }));

    const action = await decideConnectionAction(profile, { fetchImpl });

    expect(action).toBe('spawn');
  });

  it('spawns when the /health check times out', async () => {
    writeServeDaemonMeta(projectPath, {
      host: '127.0.0.1',
      port: 4317,
      projectRoot: projectPath,
      terminalEnabled: false,
    });
    const profile = makeProfile(projectPath);
    const fetchImpl = vi.fn().mockReturnValue(new Promise<Response>(() => {}));

    const action = await decideConnectionAction(profile, { fetchImpl, healthCheckTimeoutMs: 20 });

    expect(action).toBe('spawn');
  });

  it('adopts when the pid is live/owned and /health confirms the same projectRoot', async () => {
    writeServeDaemonMeta(projectPath, {
      host: '127.0.0.1',
      port: 4317,
      projectRoot: projectPath,
      terminalEnabled: false,
    });
    const profile = makeProfile(projectPath);
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { projectRoot: projectPath }));

    const action = await decideConnectionAction(profile, { fetchImpl });

    expect(action).toBe('adopt');
  });
});

describe('spawnDaemon', () => {
  it('spawns detached with the generated token in env and resolves on the spawn event', async () => {
    let capturedChild: FakeChildProcess | undefined;
    const spawnImpl = vi.fn((_cmd: string, _args: string[], _opts: SpawnOptions): SpawnedChildLike => {
      capturedChild = new FakeChildProcess();
      queueMicrotask(() => capturedChild!.emit('spawn'));
      return capturedChild;
    });
    const profile = makeProfile(projectPath, { port: 5555 });

    const result = await spawnDaemon(profile, { spawnImpl, deckentBin: 'deckent' });

    expect(result.status).toBe('spawning');
    expect(result.pid).toBe(4242);
    expect(result.apiToken).toMatch(/^[0-9a-f]{64}$/);

    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnImpl.mock.calls[0]!;
    expect(cmd).toBe('deckent');
    expect(args).toEqual(['serve', '--port', '5555']);
    expect(opts).toMatchObject({
      cwd: projectPath,
      detached: true,
      // Advisor finding (consult #7): piped stdio on a detached+unref'd child
      // with no consumer = unbounded buffer + post-quit EPIPE crash of the
      // daemon orphanShutdownOnQuit is meant to keep alive → all-ignore.
      stdio: 'ignore',
    });
    expect((opts as { env: Record<string, string> }).env.DECKENT_API_TOKEN).toBe(result.apiToken);
    expect(capturedChild!.unref).toHaveBeenCalledTimes(1);
  });

  it('resolves with an error status when the child emits an error event', async () => {
    const spawnImpl = vi.fn((): SpawnedChildLike => {
      const child = new FakeChildProcess();
      queueMicrotask(() => child.emit('error', new Error('spawn ENOENT')));
      return child;
    });
    const profile = makeProfile(projectPath);

    const result = await spawnDaemon(profile, { spawnImpl });

    expect(result.status).toBe('error');
    expect(result.errorKey).toBe('desktop.daemon.spawn_failed');
    expect(result.errorVars?.message).toBe('spawn ENOENT');
  });
});

describe('pollHealth', () => {
  it('resolves connected immediately when /health already returns 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, {}));

    const result = await pollHealth('127.0.0.1', 4317, 1000, { fetchImpl });

    expect(result).toEqual({ status: 'connected' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries with backoff until /health becomes ready', async () => {
    let attempt = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      attempt += 1;
      if (attempt < 3) throw new Error('ECONNREFUSED');
      return fakeResponse(200, {});
    });

    const result = await pollHealth('127.0.0.1', 4317, 5000, { fetchImpl });

    expect(result).toEqual({ status: 'connected' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('gives up with an error status once timeoutMs elapses', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await pollHealth('127.0.0.1', 4317, 30, { fetchImpl });

    expect(result).toEqual({ status: 'error', errorKey: 'desktop.daemon.health_timeout' });
  });
});

describe('resolveTokens', () => {
  it('reads apiToken and terminalToken from the handshake meta', () => {
    writeServeDaemonMeta(projectPath, {
      host: '127.0.0.1',
      port: 4317,
      projectRoot: projectPath,
      apiToken: 'the-api-token',
      terminalToken: 'the-terminal-token',
      terminalEnabled: true,
    });

    const tokens = resolveTokens(projectPath);

    expect(tokens).toEqual({ apiToken: 'the-api-token', terminalToken: 'the-terminal-token' });
  });

  it('returns an empty object when no meta exists', () => {
    const tokens = resolveTokens(projectPath);
    expect(tokens).toEqual({});
  });
});
