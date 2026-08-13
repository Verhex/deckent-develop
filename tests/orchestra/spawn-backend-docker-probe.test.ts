import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DockerSpawnBackend,
  type DockerReachabilityProbeCommandRunner,
} from '../../src/orchestra/spawn-backend-docker.js';
import type { BoundedReachabilityProbeRequest } from '../../src/core/provider-evidence-probe-contract.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'docker-probe-'));
  roots.push(value);
  return value;
}

function runtimeRunner(): (command: string, args: readonly string[]) => Promise<{ status: number; stdout: string; stderr: string }> {
  return async (_command, args) => args[0] === 'image'
    ? { status: 0, stdout: `sha256:${'a'.repeat(64)}\n`, stderr: '' }
    : { status: 0, stdout: '/usr/local/bin/claude\n', stderr: '' };
}

async function requestFor(backend: DockerSpawnBackend): Promise<BoundedReachabilityProbeRequest> {
  const runtime = await backend.inspectExactCrossVerifyRuntime('claude', 'claude-fable-5');
  if (runtime.state !== 'ready') throw new Error('test runtime must be ready');
  return {
    provider: 'claude',
    model: 'claude-fable-5',
    executionProfileRef: runtime.executionProfileRef as BoundedReachabilityProbeRequest['executionProfileRef'],
    promptBytes: new TextEncoder().encode('secret probe prompt'),
    timeoutMs: 37,
    maxOutputTokens: 19,
  };
}

function authenticatedHome(dir: string): string {
  const home = join(dir, 'home');
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', '.credentials.json'), '{}');
  return home;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('DockerSpawnBackend bounded reachability probe', () => {
  it('returns a frozen sanitized completion and keeps prompt/auth details out of it', async () => {
    const dir = root();
    let received: Parameters<DockerReachabilityProbeCommandRunner>[0] | undefined;
    const backend = new DockerSpawnBackend(dir, {
      homeDir: authenticatedHome(dir),
      crossVerifyRuntimeCommandRunner: runtimeRunner(),
      reachabilityProbeCommandRunner: async input => {
        received = input;
        return { status: 0, stdout: 'ok', stderr: '' };
      },
    });
    const observation = await backend.invokeBoundedReachabilityProbe(await requestFor(backend));
    expect(observation).toEqual({ outcome: 'completed', providerRequestRef: null, outputBytes: 2, latencyMs: expect.any(Number) });
    expect(Object.isFrozen(observation)).toBe(true);
    expect(JSON.stringify(observation)).not.toContain('secret probe prompt');
    expect(JSON.stringify(observation)).not.toContain('docker');
    expect(received?.stdin).toEqual(new TextEncoder().encode('secret probe prompt'));
    expect(received?.timeoutMs).toBe(37);
    expect(received?.outputCeiling).toBe(19);
    expect(received?.args).not.toContain('--network');
    // `-i` MUST be present so the prompt bytes reach the provider CLI's stdin;
    // without it the CLI exits "no prompt" and the probe misreads a dead
    // container for an unreachable backend (bulgu #10, measured live).
    expect(received?.args).toContain('-i');
  });

  it('classifies a dead Docker daemon as backend-unreachable', async () => {
    const dir = root();
    const backend = new DockerSpawnBackend(dir, {
      homeDir: authenticatedHome(dir), crossVerifyRuntimeCommandRunner: runtimeRunner(),
      reachabilityProbeCommandRunner: async () => ({ status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon' }),
    });
    await expect(backend.invokeBoundedReachabilityProbe(await requestFor(backend)))
      .resolves.toMatchObject({ outcome: 'transport-error', errorCode: 'backend_unreachable' });
  });

  it('preserves the request ceilings for the injected containment runner', async () => {
    const dir = root();
    const calls: Parameters<DockerReachabilityProbeCommandRunner>[0][] = [];
    const backend = new DockerSpawnBackend(dir, {
      homeDir: authenticatedHome(dir), crossVerifyRuntimeCommandRunner: runtimeRunner(),
      reachabilityProbeCommandRunner: async input => {
        calls.push(input);
        return { status: null, stdout: '', stderr: 'probe timeout' };
      },
    });
    await expect(backend.invokeBoundedReachabilityProbe(await requestFor(backend)))
      .resolves.toMatchObject({ outcome: 'timed-out' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ timeoutMs: 37, outputCeiling: 19 });
  });

  it('reports absent isolated credentials as unavailable rather than unreachable', async () => {
    const dir = root();
    const backend = new DockerSpawnBackend(dir, {
      homeDir: join(dir, 'empty-home'), crossVerifyRuntimeCommandRunner: runtimeRunner(),
      reachabilityProbeCommandRunner: async () => { throw new Error('must not run'); },
    });
    await expect(backend.invokeBoundedReachabilityProbe(await requestFor(backend)))
      .resolves.toMatchObject({ outcome: 'transport-error', errorCode: 'credential_unavailable', retryable: false });
  });

  it.each(['darwin', 'linux', 'win32'] as const)('accepts the %s Docker adapter platform', async platform => {
    const dir = root();
    const backend = new DockerSpawnBackend(dir, {
      platform, homeDir: authenticatedHome(dir), crossVerifyRuntimeCommandRunner: runtimeRunner(),
      reachabilityProbeCommandRunner: async () => ({ status: 0, stdout: '', stderr: '' }),
    });
    await expect(backend.invokeBoundedReachabilityProbe(await requestFor(backend)))
      .resolves.toMatchObject({ outcome: 'completed' });
  });

  it('honestly reports an unsupported adapter platform', async () => {
    const dir = root();
    const backend = new DockerSpawnBackend(dir, {
      platform: 'freebsd', homeDir: authenticatedHome(dir), crossVerifyRuntimeCommandRunner: runtimeRunner(),
    });
    await expect(backend.invokeBoundedReachabilityProbe({
      provider: 'claude', model: 'claude-fable-5', executionProfileRef: 'docker-execution-profile:x' as BoundedReachabilityProbeRequest['executionProfileRef'],
      promptBytes: new Uint8Array([1]), timeoutMs: 1, maxOutputTokens: 1,
    })).resolves.toMatchObject({ outcome: 'transport-error', errorCode: 'backend_unsupported' });
  });
});
