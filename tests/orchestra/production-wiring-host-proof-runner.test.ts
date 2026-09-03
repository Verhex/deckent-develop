import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProductionWiringHostProofProgram } from '../../src/core/production-wiring-host-proof.js';
import { canonicalProjectRoot } from '../../src/core/task-result-settlement.js';
import {
  PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
  parseProductionWiringHostProofRunReceipt,
  runProductionWiringHostProof,
  runProductionWiringHostProofCommand,
  type ProductionWiringHostProofCommandResult,
} from '../../src/orchestra/production-wiring-host-proof-runner.js';

const roots: string[] = [];
const imageId = `sha256:${'a'.repeat(64)}` as const;
const digestBytes = (bytes: Uint8Array): `sha256:${string}` => (
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`
);
const registeredAssets = [
  { path: 'scripts/production-wiring-host-proof-harness.mjs', role: 'trusted-harness' as const },
  { path: 'scripts/lint-closure-dispositions.mjs', role: 'config-authority' as const },
  { path: 'scripts/closure-ledger/canonical.mjs', role: 'config-authority' as const },
  { path: 'scripts/master-plan-integrity.mjs', role: 'config-authority' as const },
  { path: 'scripts/approval-identity.mjs', role: 'config-authority' as const },
  { path: 'src/core/closure-classification-schema.json', role: 'config-authority' as const },
];

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function commandResult(overrides: Partial<ProductionWiringHostProofCommandResult> = {}):
ProductionWiringHostProofCommandResult {
  return {
    status: 0,
    signal: null,
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    error: false,
    overflow: false,
    timedOut: false,
    cancelled: false,
    ...overrides,
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'deckent-host-proof-runner-'));
  roots.push(root);
  const harnessPath = registeredAssets[0].path;
  const verifierAssets = registeredAssets.map(asset => {
    const bytes = Buffer.from(`fixture:${asset.path}\n`, 'utf8');
    const absolute = join(root, asset.path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
    return { ...asset, sha256: digestBytes(bytes) };
  });
  chmodSync(join(root, harnessPath), 0o555);
  const targets = [
    { kind: 'producer' as const, targetId: 'closure-os.append-only-ledger' },
    { kind: 'canonical-consumer' as const, targetId: 'closure-os.authority-gate' },
    { kind: 'affected-ingress' as const, targetId: 'closure-os.ledger-file-ingress' },
    { kind: 'enablement-authority' as const, targetId: 'closure-os.reviewed-trust-anchor' },
    { kind: 'proof-target' as const, targetId: 'closure-os.chain-identity-lifecycle-authority' },
  ];
  const timeoutMs = 10_000;
  const outputLimitBytes = 64 * 1024;
  const request = canonicalJson({
    adapterId: 'deckent-closure-os-authority-gate-v1',
    assets: verifierAssets,
    kind: 'deckent-production-wiring-host-proof-request-v1',
    outputLimitBytes,
    timeoutMs,
    version: 1,
  });
  const common = {
    observationGroupId: 'deckent:closure-os-authority-gate',
    harnessPath,
    verifierAssetPaths: registeredAssets.map(asset => asset.path),
    args: [request],
    cwd: '.',
    timeoutMs,
    outputLimitBytes,
    expectation: {
      kind: 'adapter-structured-outcome' as const,
      schemaId: 'deckent.host-proof.closure-os-authority-gate.v1',
      outcome: 'observed' as const,
    },
  };
  const program = createProductionWiringHostProofProgram({
    network: 'forbidden',
    verifierAssets,
    platforms: [
      {
        platform: 'linux', state: 'supported',
        runnerAdapterId: PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
        probes: targets.map(target => ({ target, ...common })),
      },
      { platform: 'wsl2-linux', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' },
    ],
  });
  const rootSha = createHash('sha256')
    .update(canonicalProjectRoot(realpathSync(root))).digest('hex');
  const attemptBinding = {
    projectRootSha256: rootSha,
    projectId: 'project',
    taskId: 'task',
    attemptId: '123e4567-e89b-42d3-a456-426614174999',
    generation: 1,
    acceptedResultChainDigest: `sha256:${'b'.repeat(64)}` as const,
    effectLandingReceiptDigest: `sha256:${'c'.repeat(64)}` as const,
    effectLandingChainDigest: `sha256:${'d'.repeat(64)}` as const,
  };
  const structured = Buffer.from(JSON.stringify({
    kind: 'deckent-production-wiring-host-proof-outcome',
    observationGroupId: common.observationGroupId,
    outcome: 'observed',
    schemaId: common.expectation.schemaId,
    targetKeys: targets.map(target => `${target.kind}:${target.targetId}`).sort(),
    version: 1,
  }), 'utf8');
  return {
    root,
    harnessPath,
    targets,
    verifierAssets,
    common,
    request,
    program,
    attemptBinding,
    structured,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('production wiring host proof runner', () => {
  it('runs one hardened image-id-pinned container per observation group and stores hashes only', async () => {
    const data = fixture();
    const calls: { args: readonly string[] }[] = [];
    const runner = vi.fn(async (input: { args: readonly string[] }) => {
      calls.push(input);
      if (input.args[0] === 'image') return commandResult({ stdout: Buffer.from(`${imageId}\n`) });
      if (input.args[0] === 'container' && input.args[1] === 'inspect') {
        return commandResult({ status: 1, stderr: Buffer.from('Error: No such object: proof') });
      }
      if (input.args[0] === 'run') return commandResult({ stdout: data.structured });
      return commandResult({ stdout: Buffer.from('removed\n') });
    });

    const outcome = await runProductionWiringHostProof({
      program: data.program,
      attemptBinding: data.attemptBinding,
      taskWriteScope: { directories: ['product/'], filesWrite: ['product/feature.ts'] },
    }, {
      projectRoot: data.root,
      image: 'mutable-tag:latest',
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
      now: () => '2026-09-02T12:00:00.000Z',
    });

    expect(outcome).toMatchObject({ state: 'observed' });
    if (outcome.state !== 'observed') return;
    expect(parseProductionWiringHostProofRunReceipt(structuredClone(outcome.receipt)))
      .toEqual(outcome.receipt);
    const runCalls = calls.filter(call => call.args[0] === 'run');
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.args).toEqual(expect.arrayContaining([
      '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--pull', 'never', imageId,
    ]));
    expect(runCalls[0]?.args).not.toContain('mutable-tag:latest');
    expect(outcome.receipt.targetObservations).toHaveLength(data.targets.length);
    expect(JSON.stringify(outcome.receipt)).not.toContain(
      Buffer.from(data.structured).toString('utf8'),
    );
    expect(calls.at(-1)?.args.slice(0, 2)).toEqual(['container', 'inspect']);
  });

  it('holds before execution when verifier assets overlap worker write authority', async () => {
    const data = fixture();
    const runner = vi.fn(async () => commandResult({ stdout: Buffer.from(`${imageId}\n`) }));
    await expect(runProductionWiringHostProof({
      program: data.program,
      attemptBinding: data.attemptBinding,
      taskWriteScope: { directories: [], filesWrite: [data.harnessPath] },
    }, {
      projectRoot: data.root,
      image: imageId,
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'verifier-asset-write-scope-overlap' });
    expect(runner).toHaveBeenCalledOnce(); // image identity read only; provider proof never starts
  });

  it('rejects a planner-designated arbitrary repository harness before Docker execution', async () => {
    const data = fixture();
    const arbitraryPath = 'scripts/arbitrary-proof-harness.mjs';
    const arbitraryBytes = Buffer.from('#!/usr/bin/env node\n', 'utf8');
    writeFileSync(join(data.root, arbitraryPath), arbitraryBytes);
    chmodSync(join(data.root, arbitraryPath), 0o555);
    const program = createProductionWiringHostProofProgram({
      network: 'forbidden',
      verifierAssets: [{
        path: arbitraryPath,
        sha256: digestBytes(arbitraryBytes),
        role: 'trusted-harness',
      }],
      platforms: [{
        platform: 'linux',
        state: 'supported',
        runnerAdapterId: PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
        probes: data.targets.map(target => ({
          target,
          observationGroupId: 'deckent:closure-os-authority-gate',
          harnessPath: arbitraryPath,
          verifierAssetPaths: [arbitraryPath],
          args: ['{}'],
          cwd: '.',
          timeoutMs: 10_000,
          outputLimitBytes: 64 * 1024,
          expectation: {
            kind: 'adapter-structured-outcome',
            schemaId: 'deckent.host-proof.closure-os-authority-gate.v1',
            outcome: 'observed',
          },
        })),
      },
      { platform: 'wsl2-linux', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' }],
    });
    const runner = vi.fn();
    await expect(runProductionWiringHostProof({
      program,
      attemptBinding: data.attemptBinding,
      taskWriteScope: { directories: [], filesWrite: [] },
    }, {
      projectRoot: data.root,
      image: imageId,
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'host-proof-harness-unregistered' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('rejects a registered harness path when the planner forges its adapter request', async () => {
    const data = fixture();
    const parsedRequest = JSON.parse(data.request) as Record<string, unknown>;
    const forgedRequest = canonicalJson({ ...parsedRequest, adapterId: 'planner-self-assertion-v1' });
    const program = createProductionWiringHostProofProgram({
      network: 'forbidden',
      verifierAssets: data.verifierAssets,
      platforms: [{
        platform: 'linux',
        state: 'supported',
        runnerAdapterId: PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
        probes: data.targets.map(target => ({ ...data.common, target, args: [forgedRequest] })),
      },
      { platform: 'wsl2-linux', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' }],
    });
    const runner = vi.fn();
    await expect(runProductionWiringHostProof({
      program,
      attemptBinding: data.attemptBinding,
      taskWriteScope: { directories: [], filesWrite: [] },
    }, {
      projectRoot: data.root,
      image: imageId,
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'host-proof-harness-unregistered' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('holds on a changed verifier asset and never accepts the structured output', async () => {
    const data = fixture();
    const runner = vi.fn(async (input: { args: readonly string[] }) => {
      if (input.args[0] === 'image') return commandResult({ stdout: Buffer.from(`${imageId}\n`) });
      if (input.args[0] === 'container' && input.args[1] === 'inspect') {
        return commandResult({ status: 1, stderr: Buffer.from('Error: No such container: proof') });
      }
      if (input.args[0] === 'run') {
        chmodSync(join(data.root, data.harnessPath), 0o755);
        writeFileSync(join(data.root, data.harnessPath), '#!/bin/true\n');
        return commandResult({ stdout: data.structured });
      }
      return commandResult();
    });
    await expect(runProductionWiringHostProof({
      program: data.program,
      attemptBinding: data.attemptBinding,
      taskWriteScope: { directories: [], filesWrite: [] },
    }, {
      projectRoot: data.root,
      image: imageId,
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'verifier-asset-changed' });
  });

  it('cleans and proves container absence after timeout before returning HOLD', async () => {
    const data = fixture();
    const calls: readonly string[][] = [];
    const runner = vi.fn(async (input: { args: readonly string[] }) => {
      (calls as string[][]).push([...input.args]);
      if (input.args[0] === 'image') return commandResult({ stdout: Buffer.from(`${imageId}\n`) });
      if (input.args[0] === 'container' && input.args[1] === 'inspect') {
        return commandResult({ status: 1, stderr: Buffer.from('Error: No such object: proof') });
      }
      if (input.args[0] === 'run') return commandResult({ timedOut: true, error: true });
      return commandResult();
    });
    await expect(runProductionWiringHostProof({
      program: data.program,
      attemptBinding: data.attemptBinding,
      taskWriteScope: { directories: [], filesWrite: [] },
    }, {
      projectRoot: data.root,
      image: imageId,
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'host-proof-timeout' });
    expect(calls.some(args => args.slice(0, 3).join(' ') === 'container rm --force')).toBe(true);
    expect(calls.at(-1)?.slice(0, 2)).toEqual(['container', 'inspect']);
  });

  it('cleans and proves container absence after cancellation before returning HOLD', async () => {
    const data = fixture();
    const controller = new AbortController();
    const calls: readonly string[][] = [];
    const runner = vi.fn(async (input: { args: readonly string[] }) => {
      (calls as string[][]).push([...input.args]);
      if (input.args[0] === 'image') return commandResult({ stdout: Buffer.from(`${imageId}\n`) });
      if (input.args[0] === 'container' && input.args[1] === 'inspect') {
        return commandResult({ status: 1, stderr: Buffer.from('Error: No such object: proof') });
      }
      if (input.args[0] === 'run') {
        controller.abort();
        return commandResult({ cancelled: true, error: true });
      }
      return commandResult();
    });
    await expect(runProductionWiringHostProof({
      program: data.program,
      attemptBinding: data.attemptBinding,
      taskWriteScope: { directories: [], filesWrite: [] },
      signal: controller.signal,
    }, {
      projectRoot: data.root,
      image: imageId,
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'host-proof-cancelled' });
    expect(calls.some(args => args.slice(0, 3).join(' ') === 'container rm --force')).toBe(true);
    expect(calls.at(-1)?.slice(0, 2)).toEqual(['container', 'inspect']);
  });

  it('never reports a timed-out proof as contained when release absence cannot be proven', async () => {
    const data = fixture();
    let inspectCount = 0;
    const runner = vi.fn(async (input: { args: readonly string[] }) => {
      if (input.args[0] === 'image') return commandResult({ stdout: Buffer.from(`${imageId}\n`) });
      if (input.args[0] === 'container' && input.args[1] === 'inspect') {
        inspectCount += 1;
        return inspectCount === 1
          ? commandResult({ status: 1, stderr: Buffer.from('Error: No such object: proof') })
          : commandResult({ stdout: Buffer.from('{}') });
      }
      if (input.args[0] === 'run') return commandResult({ timedOut: true, error: true });
      return commandResult();
    });
    await expect(runProductionWiringHostProof({
      program: data.program,
      attemptBinding: data.attemptBinding,
      taskWriteScope: { directories: [], filesWrite: [] },
    }, {
      projectRoot: data.root,
      image: imageId,
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
    })).resolves.toEqual({
      state: 'hold', reasonCode: 'proof-container-release-unconfirmed',
    });
  });

  it('rejects bounded-output overflow even when the process exits zero', async () => {
    const data = fixture();
    const runner = vi.fn(async (input: { args: readonly string[] }) => {
      if (input.args[0] === 'image') return commandResult({ stdout: Buffer.from(`${imageId}\n`) });
      if (input.args[0] === 'container' && input.args[1] === 'inspect') {
        return commandResult({ status: 1, stderr: Buffer.from('Error: No such object: proof') });
      }
      if (input.args[0] === 'run') {
        return commandResult({ stdout: data.structured, overflow: true, error: true });
      }
      return commandResult();
    });
    await expect(runProductionWiringHostProof({
      program: data.program,
      attemptBinding: data.attemptBinding,
      taskWriteScope: { directories: [], filesWrite: [] },
    }, {
      projectRoot: data.root,
      image: imageId,
      platform: 'linux',
      isWsl2: false,
      dockerExecutable: '/test/docker',
      commandRunner: runner,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'host-proof-output-overflow' });
  });

  it('passes no ambient environment to the actual shell-free command boundary', async () => {
    const executable = ['/usr/bin/env', '/bin/env'].find(path => {
      try { return realpathSync(path).length > 0; } catch { return false; }
    });
    if (!executable) return;
    const result = await runProductionWiringHostProofCommand({
      executable,
      args: [],
      timeoutMs: 5_000,
      stdoutCeiling: 4_096,
      stderrCeiling: 4_096,
    });
    expect(result).toMatchObject({ status: 0, error: false, overflow: false });
    expect(Buffer.from(result.stdout).toString('utf8')).toBe('');
  });

  it('escalates an actual SIGTERM-resistant process tree to a bounded terminal result', async () => {
    const result = await runProductionWiringHostProofCommand({
      executable: process.execPath,
      args: ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
      timeoutMs: 50,
      stdoutCeiling: 4_096,
      stderrCeiling: 4_096,
    });
    expect(result.timedOut).toBe(true);
    expect(result.error).toBe(true);
    expect(result.status).toBeNull();
    expect(result.signal).toBe('SIGKILL');
  }, 10_000);
});
