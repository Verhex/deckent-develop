import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';
import {
  checkCodexHostReadiness,
  checkCodexDockerReadiness,
  getCodexModelArgEvidence,
  assessCodexSpawnReadiness,
} from '../../src/orchestra/codex-spawn-readiness.js';
import { DEFAULT_WORKER_IMAGE, type SpawnImpl, type SpawnedProcessLike } from '../../src/core/worker-image-check.js';
import { CODEX_USAGE_EMIT_ARGS } from '../../src/providers/codex.js';

// ─── Hermetic fake spawn helpers (no real `codex`/`docker` binary, no network) ─

interface CannedResult {
  code?: number | null;
  stdout?: string;
  error?: Error;
}

function emit(child: EventEmitter & SpawnedProcessLike, r: CannedResult): void {
  process.nextTick(() => {
    if (r.error) {
      child.emit('error', r.error);
      return;
    }
    child.emit('close', r.code ?? 0, null);
  });
}

function makeChild(result: CannedResult): EventEmitter & SpawnedProcessLike {
  const child = new EventEmitter() as EventEmitter & SpawnedProcessLike;
  child.stdout = Readable.from([result.stdout ?? '']);
  child.stderr = Readable.from(['']);
  emit(child, result);
  return child;
}

/** Routes `codex --version` vs `codex auth status` calls to canned results. */
function makeCodexHostSpawn(routes: { version?: CannedResult; auth?: CannedResult }): ReturnType<typeof vi.fn<SpawnImpl>> {
  return vi.fn<SpawnImpl>((_command, args) => {
    const result = args[0] === '--version' ? routes.version ?? {} : routes.auth ?? {};
    return makeChild(result);
  });
}

/** Routes `docker image inspect` vs `docker run` calls to canned results (mirrors worker-image-check.test.ts). */
function makeDockerSpawn(routes: { inspect?: CannedResult; run?: CannedResult }): ReturnType<typeof vi.fn<SpawnImpl>> {
  return vi.fn<SpawnImpl>((_command, args) => {
    const result: CannedResult = args[0] === 'image' ? routes.inspect ?? {} : routes.run ?? {};
    return makeChild(result);
  });
}

function probeOutput(opts: { codexOk?: boolean; caCerts?: boolean }): string {
  const lines: string[] = [];
  lines.push(opts.codexOk === false ? 'CLI:codex:missing' : 'CLI:codex:ok');
  lines.push(opts.caCerts === false ? 'CACERTS:missing' : 'CACERTS:ok');
  return lines.join('\n') + '\n';
}

// ─── checkCodexHostReadiness — 3 injected scenarios ─────────────────────────

describe('checkCodexHostReadiness', () => {
  it('scenario: cli-missing → not ready, authMode none', async () => {
    const spawnImpl = makeCodexHostSpawn({ version: { code: 1, stdout: '' } });
    const result = await checkCodexHostReadiness({ spawnImpl, env: {} });

    expect(result.cliFound).toBe(false);
    expect(result.authMode).toBe('none');
    expect(result.ready).toBe(false);
    expect(result.reason).toMatch(/not found on host/i);
    // auth probe must not be attempted once the CLI itself is missing
    expect(spawnImpl).toHaveBeenCalledTimes(1);
  });

  it('scenario: cli-ok, auth-missing (no env key, no active session) → not ready', async () => {
    const spawnImpl = makeCodexHostSpawn({
      version: { code: 0, stdout: 'codex-cli 0.138.0\n' },
      auth: { code: 0, stdout: 'not authenticated\n' },
    });
    const result = await checkCodexHostReadiness({ spawnImpl, env: {} });

    expect(result.cliFound).toBe(true);
    expect(result.authMode).toBe('none');
    expect(result.ready).toBe(false);
    expect(result.reason).toMatch(/no authentication configured/i);
  });

  it('scenario: cli-ok + env api key → ready without probing auth status', async () => {
    const spawnImpl = makeCodexHostSpawn({ version: { code: 0, stdout: 'codex-cli 0.138.0\n' } });
    const result = await checkCodexHostReadiness({ spawnImpl, env: { OPENAI_API_KEY: 'sk-test' } });

    expect(result.cliFound).toBe(true);
    expect(result.authMode).toBe('api_key');
    expect(result.ready).toBe(true);
    expect(result.version).toBe('0.138.0');
    // auth status probe skipped — env key already resolved auth
    expect(spawnImpl).toHaveBeenCalledTimes(1);
  });

  it('scenario: cli-ok + subscription auth (no env key) → ready', async () => {
    const spawnImpl = makeCodexHostSpawn({
      version: { code: 0, stdout: 'codex-cli 0.138.0\n' },
      // lowercase 'logged in' matches the exact substring providers/codex.ts's
      // detectAuthMode() checks for real `codex auth status` output.
      auth: { code: 0, stdout: 'logged in with ChatGPT subscription\n' },
    });
    const result = await checkCodexHostReadiness({ spawnImpl, env: {} });

    expect(result.authMode).toBe('subscription');
    expect(result.ready).toBe(true);
  });

  it('treats a codex spawn error (binary not installed) as cli-missing', async () => {
    const spawnImpl = vi.fn<SpawnImpl>(() => makeChild({ error: new Error('spawn codex ENOENT') }));
    const result = await checkCodexHostReadiness({ spawnImpl, env: {} });

    expect(result.cliFound).toBe(false);
    expect(result.ready).toBe(false);
  });
});

// ─── checkCodexDockerReadiness — docker-image detection, seamed ────────────

describe('checkCodexDockerReadiness', () => {
  it("image missing → backendRequired 'subprocess'", async () => {
    const spawnImpl = makeDockerSpawn({ inspect: { code: 1 } });
    const result = await checkCodexDockerReadiness({ spawnImpl });

    expect(result.state).toBe('missing');
    expect(result.codexCliPresent).toBe(false);
    expect(result.backendRequired).toBe('subprocess');
    expect(result.reason).toMatch(/not found locally/i);
    expect(result.suggestedBuildCmd).toContain('INSTALL_CODEX=true');
  });

  it("image ready with codex CLI + ca-certs → no backendRequired", async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ codexOk: true, caCerts: true }) },
    });
    const result = await checkCodexDockerReadiness({ spawnImpl });

    expect(result.state).toBe('ready');
    expect(result.codexCliPresent).toBe(true);
    expect(result.missingCaCerts).toBe(false);
    expect(result.backendRequired).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("image present but codex CLI missing → backendRequired 'subprocess'", async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ codexOk: false, caCerts: true }) },
    });
    const result = await checkCodexDockerReadiness({ spawnImpl });

    expect(result.state).toBe('stale');
    expect(result.codexCliPresent).toBe(false);
    expect(result.backendRequired).toBe('subprocess');
    expect(result.reason).toMatch(/missing the codex CLI/i);
  });

  it("image present with codex CLI but missing ca-certificates → backendRequired 'subprocess'", async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ codexOk: true, caCerts: false }) },
    });
    const result = await checkCodexDockerReadiness({ spawnImpl });

    expect(result.state).toBe('stale');
    expect(result.codexCliPresent).toBe(true);
    expect(result.missingCaCerts).toBe(true);
    expect(result.backendRequired).toBe('subprocess');
    expect(result.reason).toMatch(/ca-certificates/i);
  });

  it('honors a custom image tag', async () => {
    const spawnImpl = makeDockerSpawn({ inspect: { code: 1 } });
    const result = await checkCodexDockerReadiness({ image: 'myorg/worker:v2', spawnImpl });

    expect(result.image).toBe('myorg/worker:v2');
    expect(spawnImpl).toHaveBeenCalledWith('docker', ['image', 'inspect', 'myorg/worker:v2'], { shell: false });
  });

  it('defaults to DEFAULT_WORKER_IMAGE when none is given', async () => {
    const spawnImpl = makeDockerSpawn({ inspect: { code: 1 } });
    const result = await checkCodexDockerReadiness({ spawnImpl });

    expect(result.image).toBe(DEFAULT_WORKER_IMAGE);
  });
});

// ─── getCodexModelArgEvidence — DISK-VERIFY the real providers/codex.ts arg-table ─

describe('getCodexModelArgEvidence', () => {
  it('never spawns a real codex process (pure, buildCommand only)', () => {
    const evidence = getCodexModelArgEvidence('gpt-5.5', { projectDir: '/tmp/codex-readiness-test' });
    expect(evidence.model).toBe('gpt-5.5');
    expect(typeof evidence.spawnCommand).toBe('string');
  });

  it('proves the canonical API ID passes to --model unchanged', () => {
    const evidence = getCodexModelArgEvidence('gpt-5.5', { projectDir: '/tmp/codex-readiness-test' });

    expect(evidence.wireModel).toBe('gpt-5.5');
    expect(evidence.spawnCommand).toContain('--model gpt-5.5');
  });

  it('proves the prompt-feed format: prompt is fed via `$(cat <promptPath>)`, not inline', () => {
    const evidence = getCodexModelArgEvidence('gpt-5.5', {
      projectDir: '/tmp/codex-readiness-test',
      promptPath: '/tmp/codex-readiness-test/.tasks/task-x.prompt',
    });

    expect(evidence.spawnCommand).toContain('$(cat /tmp/codex-readiness-test/.tasks/task-x.prompt)');
    expect(evidence.spawnCommand.startsWith('codex exec --full-auto')).toBe(true);
  });

  it('proves the output-format flag: CODEX_USAGE_EMIT_ARGS is --json (structured JSONL stream)', () => {
    const evidence = getCodexModelArgEvidence('gpt-5.5');
    expect(evidence.usageEmitArgs).toEqual(CODEX_USAGE_EMIT_ARGS);
    expect(evidence.usageEmitArgs).toEqual(['--json']);
  });

  it('a model with no registry apiId override falls back to the raw id unchanged', () => {
    const evidence = getCodexModelArgEvidence('gpt-4.1', { projectDir: '/tmp/codex-readiness-test' });
    expect(evidence.wireModel).toBe('gpt-4.1');
    expect(evidence.spawnCommand).toContain('--model gpt-4.1');
  });
});

// ─── assessCodexSpawnReadiness — composed suggestion, no real spawn ────────

describe('assessCodexSpawnReadiness', () => {
  it('composes host + docker + model-arg evidence into one report, all deps injected', async () => {
    const hostSpawnImpl = makeCodexHostSpawn({
      version: { code: 0, stdout: 'codex-cli 0.138.0\n' },
    });
    const dockerSpawnImpl = makeDockerSpawn({ inspect: { code: 1 } });

    const report = await assessCodexSpawnReadiness({
      hostSpawnImpl,
      dockerSpawnImpl,
      env: { OPENAI_API_KEY: 'sk-test' },
    });

    expect(report.host.ready).toBe(true);
    expect(report.docker.state).toBe('missing');
    expect(report.backendRequired).toBe('subprocess');
    expect(report.reason).toBe(report.docker.reason);
    expect(report.modelArgEvidence).toHaveLength(1);
    expect(report.modelArgEvidence[0]?.model).toBe('gpt-5.5');
    expect(report.modelArgEvidence[0]?.wireModel).toBe('gpt-5.5');

    // neither the real `codex` nor real `docker` binaries were ever invoked
    expect(hostSpawnImpl).toHaveBeenCalled();
    expect(dockerSpawnImpl).toHaveBeenCalled();
  });

  it('omits backendRequired/reason entirely when the docker image is fully ready', async () => {
    const hostSpawnImpl = makeCodexHostSpawn({ version: { code: 1 } });
    const dockerSpawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ codexOk: true, caCerts: true }) },
    });

    const report = await assessCodexSpawnReadiness({ hostSpawnImpl, dockerSpawnImpl, env: {} });

    expect(report.backendRequired).toBeUndefined();
    expect(report.reason).toBeUndefined();
  });

  it('supports a caller-specified model list for arg evidence', async () => {
    const hostSpawnImpl = makeCodexHostSpawn({ version: { code: 1 } });
    const dockerSpawnImpl = makeDockerSpawn({ inspect: { code: 1 } });

    const report = await assessCodexSpawnReadiness({
      hostSpawnImpl,
      dockerSpawnImpl,
      env: {},
      models: ['gpt-5.5', 'gpt-5-mini'],
    });

    expect(report.modelArgEvidence.map((e) => e.model)).toEqual(['gpt-5.5', 'gpt-5-mini']);
  });
});
