import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  disposeCiWorkspace,
  spawnCiVitest,
} from '../../scripts/ci-sim-workspace.mjs';
import {
  createHostProcessGroupAdapter,
  executeOwnedCandidate,
} from '../../scripts/hermeticity/owned-execution.mjs';

const IDENTITY_DIGEST = 'd'.repeat(64);
let sandbox: string | undefined;
let sandboxDir: string | undefined;
let tmpDir: string | undefined;

afterEach(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  if (sandboxDir) rmSync(sandboxDir, { recursive: true, force: true });
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  sandbox = undefined;
  sandboxDir = undefined;
  tmpDir = undefined;
});

function candidate() {
  return {
    command: process.execPath,
    args: ['--version'],
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? '' },
  };
}

function childFixture(pid = 41) {
  return Object.assign(new EventEmitter(), {
    pid,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
}

function binding(adapterId = 'fixture-adapter') {
  return {
    runNonce: 'run-owned-001',
    identityDigest: IDENTITY_DIGEST,
    adapterId,
    resourceType: 'linux-namespace',
    resourceId: 'fixture-resource',
  };
}

describe('owned containment execution', () => {
  it('does not spawn without a claim-bound prepared resource', async () => {
    const spawn = vi.fn();
    const preparedResource = {
      state: 'PREPARED',
      verified: true,
      adapterId: 'fixture-adapter',
      resourceType: 'linux-namespace',
      resourceId: 'fixture-resource',
      identityDigest: IDENTITY_DIGEST,
      spawn,
      terminateAndVerify: vi.fn(),
    };

    const absent = await executeOwnedCandidate({ candidate: candidate() });
    const drifted = await executeOwnedCandidate({
      candidate: candidate(),
      preparedResource,
      binding: binding('other-adapter'),
    });

    expect(absent.code).toBe('E_CONTAINMENT_HOLD_PREPARED_RESOURCE_REQUIRED');
    expect(drifted.code).toBe('E_CONTAINMENT_HOLD_EXECUTION_BINDING_INVALID');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('releases an ambiguously born resource when the child handle is malformed', async () => {
    const terminateAndVerify = vi.fn(async () => ({
      status: 'PROVEN',
      terminationVerified: true,
      adapterIdentityVerified: true,
    }));
    const malformedChild = { pid: 41 };
    const result = await executeOwnedCandidate({
      candidate: candidate(),
      binding: binding(),
      preparedResource: {
        state: 'PREPARED',
        verified: true,
        adapterId: 'fixture-adapter',
        resourceType: 'linux-namespace',
        resourceId: 'fixture-resource',
        identityDigest: IDENTITY_DIGEST,
        spawn: () => malformedChild,
        terminateAndVerify,
      },
    });

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_CANDIDATE_BIRTH_UNKNOWN',
      candidateBirth: 'UNKNOWN',
      finality: {
        status: 'PROVEN',
        terminationVerified: true,
        adapterIdentityVerified: true,
      },
    });
    expect(terminateAndVerify).toHaveBeenCalledWith(malformedChild, 1_000);
  });

  it('settles only after explicit tree finality and adapter identity proof', async () => {
    const child = childFixture();
    const order: string[] = [];
    const preparedResource = {
      state: 'PREPARED',
      verified: true,
      adapterId: 'fixture-adapter',
      resourceType: 'linux-namespace',
      resourceId: 'fixture-resource',
      identityDigest: IDENTITY_DIGEST,
      spawn: vi.fn(() => {
        order.push('spawn');
        queueMicrotask(() => {
          child.stdout.emit('data', Buffer.from('bounded-output'));
          child.emit('close', 0, null);
        });
        return child;
      }),
      terminateAndVerify: vi.fn(async () => {
        order.push('release');
        return {
          status: 'PROVEN',
          terminationVerified: true,
          adapterIdentityVerified: true,
        };
      }),
    };

    const result = await executeOwnedCandidate({
      candidate: candidate(),
      preparedResource,
      binding: binding(),
      limits: { wallMs: 100, stdoutBytes: 32, stderrBytes: 32 },
      onCandidateBirth: async () => {
        order.push('running');
      },
      onCompletion: async () => {
        order.push('completion');
      },
    });

    expect(result).toMatchObject({
      state: 'SETTLED',
      retain: false,
      outcome: { code: 0, signal: null },
      finality: {
        status: 'PROVEN',
        terminationVerified: true,
        adapterIdentityVerified: true,
      },
      output: {
        stdout: {
          text: 'bounded-output',
          capturedBytes: 14,
          observedBytes: 14,
          truncated: false,
        },
      },
    });
    expect(preparedResource.spawn).toHaveBeenCalledTimes(1);
    expect(preparedResource.terminateAndVerify).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['spawn', 'running', 'completion', 'release']);
  });

  it('bounds output, terminates on overflow and never exposes the discarded bytes', async () => {
    const child = childFixture();
    const preparedResource = {
      state: 'PREPARED',
      verified: true,
      adapterId: 'fixture-adapter',
      resourceType: 'linux-namespace',
      resourceId: 'fixture-resource',
      identityDigest: IDENTITY_DIGEST,
      spawn: () => {
        queueMicrotask(() => {
          child.stdout.emit('data', Buffer.from('0123456789-forged-receipt'));
          child.emit('close', 0, null);
        });
        return child;
      },
      terminateAndVerify: vi.fn(async () => ({
        status: 'PROVEN',
        terminationVerified: true,
        adapterIdentityVerified: true,
      })),
    };

    const result = await executeOwnedCandidate({
      candidate: candidate(),
      preparedResource,
      binding: binding(),
      limits: { wallMs: 100, stdoutBytes: 10, stderrBytes: 10 },
    });

    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OUTPUT_LIMIT',
      finality: { status: 'PROVEN' },
      output: {
        stdout: {
          text: '0123456789',
          capturedBytes: 10,
          observedBytes: 25,
          truncated: true,
        },
      },
    });
    expect(result.output.stdout.text).not.toContain('forged-receipt');
    expect(preparedResource.terminateAndVerify).toHaveBeenCalledTimes(1);
  });

  it('retains the run when finality or adapter identity is not proven', async () => {
    for (const finality of [
      {
        status: 'UNKNOWN',
        terminationVerified: false,
        adapterIdentityVerified: true,
      },
      {
        status: 'PROVEN',
        terminationVerified: true,
        adapterIdentityVerified: false,
      },
    ]) {
      const child = childFixture();
      const result = await executeOwnedCandidate({
        candidate: candidate(),
        binding: binding(),
        preparedResource: {
          state: 'PREPARED',
          verified: true,
          adapterId: 'fixture-adapter',
          resourceType: 'linux-namespace',
          resourceId: 'fixture-resource',
          identityDigest: IDENTITY_DIGEST,
          spawn: () => {
            queueMicrotask(() => child.emit('close', 0, null));
            return child;
          },
          terminateAndVerify: async () => finality,
        },
        limits: { wallMs: 100 },
      });
      expect(result).toMatchObject({
        state: 'HOLD',
        code: 'E_CONTAINMENT_HOLD_FINALITY_UNKNOWN',
        retain: true,
        finality: { status: 'UNKNOWN' },
      });
    }
  });

  it('never treats raw PID/process-group control as a strong execution adapter', () => {
    const spawnProcess = vi.fn();
    expect(createHostProcessGroupAdapter({
      platform: 'linux',
      spawnProcess,
    })).toMatchObject({
      supported: false,
      resourceType: 'process-group',
      code: 'E_CONTAINMENT_HOLD_TRUSTED_PROCESS_OWNER_REQUIRED',
    });
    expect(createHostProcessGroupAdapter({ platform: 'win32' })).toMatchObject({
      supported: false,
      resourceType: 'win32-job',
      code: 'E_CONTAINMENT_HOLD_WIN32_JOB_ADAPTER_REQUIRED',
    });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('re-reads v3 manifest authority before legacy spawn despite mutable object downgrade', async () => {
    sandbox = mkdtempSync(join(tmpdir(), 'containment-spawn-gate-'));
    const workspaceDir = join(sandbox, 'worktree');
    const manifestPath = join(sandbox, 'manifest.json');
    mkdirSync(workspaceDir);
    writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 3,
      runNonce: 'manifest-v3-run',
      rootDir: sandbox,
      workspaceDir,
      ownerPid: process.pid,
      state: 'ready',
      revision: 1,
      containment: {
        mode: 'enforce',
        candidateBirthAuthorized: false,
        resourceReleased: false,
        prepareIntent: null,
        finality: { status: 'UNPROVEN' },
      },
    }));
    const mutableWorkspace = {
      runNonce: 'manifest-v3-run',
      rootDir: sandbox,
      workspaceDir,
      homeDir: join(sandbox, 'home'),
      manifestPath,
      containmentMode: 'enforce',
    };
    mutableWorkspace.containmentMode = 'audit-unenforced';
    const onChild = vi.fn();

    await expect(spawnCiVitest(mutableWorkspace, [], { onChild }))
      .rejects.toThrow('E_CI_SIM_CONTAINMENT_LEGACY_RUNNER_FORBIDDEN');
    expect(onChild).not.toHaveBeenCalled();
    expect(existsSync(`${manifestPath}.child-claim`)).toBe(false);
  });

  it('rebinds cleanup to manifest A and never follows mutable workspace target B', async () => {
    const rootDir = '/tmp';
    sandboxDir = mkdtempSync(join(
      tmpdir(),
      'deckent-ci-sim-e9671acd244849c57167c658fa2f9697-',
    ));
    const authorityBase = sandboxDir;
    const authorityWorkspace = join(authorityBase, 'worktree');
    const manifestPath = join(authorityBase, 'manifest.json');
    mkdirSync(authorityWorkspace);
    writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 2,
      runNonce: 'cleanup-authority-a',
      rootDir,
      workspaceDir: authorityWorkspace,
      ownerPid: process.pid,
      state: 'ready',
    }));

    tmpDir = mkdtempSync(join(tmpdir(), 'containment-clean-target-b-'));
    const mutableTarget = tmpDir;
    const targetWorkspace = join(mutableTarget, 'worktree');
    const targetMarker = join(mutableTarget, 'must-remain.txt');
    mkdirSync(targetWorkspace);
    writeFileSync(targetMarker, 'target-b');

    const cleanupErrors = await disposeCiWorkspace({
      manifestPath,
      runNonce: 'cleanup-authority-a',
      rootDir: mutableTarget,
      baseDir: mutableTarget,
      workspaceDir: targetWorkspace,
      homeDir: join(mutableTarget, 'home'),
    });

    expect(cleanupErrors).toEqual([
      expect.stringContaining('E_CI_SIM_CLEANUP'),
    ]);
    expect(existsSync(targetMarker)).toBe(true);
    expect(existsSync(targetWorkspace)).toBe(true);
  });
});
