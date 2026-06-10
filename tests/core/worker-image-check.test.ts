import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';
import {
  checkWorkerImage,
  buildSuggestedImageCmd,
  DEFAULT_WORKER_IMAGE,
  type SpawnImpl,
  type SpawnedProcessLike,
} from '../../src/core/worker-image-check.js';

// ─── Hermetic docker mock ───────────────────────────────────────────────────
// Routes by docker subcommand: `image inspect` (args[0]==='image') vs
// `run` (args[0]==='run'). No real docker, no network — spawn is fully faked.

interface CannedResult {
  code?: number | null;
  stdout?: string;
  stderr?: string;
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

/** Build a fake spawn that returns `inspect` for `docker image inspect`, `run` for `docker run`. */
function makeDockerSpawn(routes: { inspect?: CannedResult; run?: CannedResult }): ReturnType<typeof vi.fn<SpawnImpl>> {
  return vi.fn<SpawnImpl>((_command, args) => {
    const child = new EventEmitter() as EventEmitter & SpawnedProcessLike;
    const result: CannedResult = args[0] === 'image' ? routes.inspect ?? {} : routes.run ?? {};
    child.stdout = Readable.from([result.stdout ?? '']);
    child.stderr = Readable.from([result.stderr ?? '']);
    emit(child, result);
    return child;
  });
}

/** Probe stdout helper: build the `CLI:<bin>:ok` / `CACERTS:ok` lines an image would print. */
function probeOutput(opts: { okClis?: string[]; missingClis?: string[]; caCerts?: boolean }): string {
  const lines: string[] = [];
  for (const c of opts.okClis ?? []) lines.push(`CLI:${c}:ok`);
  for (const c of opts.missingClis ?? []) lines.push(`CLI:${c}:missing`);
  lines.push(opts.caCerts === false ? 'CACERTS:missing' : 'CACERTS:ok');
  return lines.join('\n') + '\n';
}

describe('checkWorkerImage', () => {
  it("reports 'missing' when docker image inspect fails (image not built)", async () => {
    const spawnImpl = makeDockerSpawn({ inspect: { code: 1, stderr: 'No such image: deckent-worker:latest' } });
    const report = await checkWorkerImage({ requiredProviders: ['claude', 'codex'], spawnImpl });

    expect(report.state).toBe('missing');
    expect(report.missingClis).toEqual(['claude', 'codex']);
    expect(report.missingCaCerts).toBe(true);
    // run probe must NOT be attempted once the image is known absent
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(spawnImpl).toHaveBeenCalledWith('docker', ['image', 'inspect', DEFAULT_WORKER_IMAGE], { shell: false });
  });

  it("reports 'ready' when image exists with all CLIs and ca-certificates", async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: '[{"Id":"sha256:abc"}]' },
      run: { code: 0, stdout: probeOutput({ okClis: ['claude', 'codex'], caCerts: true }) },
    });
    const report = await checkWorkerImage({ requiredProviders: ['claude', 'codex'], spawnImpl });

    expect(report.state).toBe('ready');
    expect(report.missingClis).toEqual([]);
    expect(report.missingCaCerts).toBe(false);
    expect(spawnImpl).toHaveBeenCalledTimes(2);
  });

  it("reports 'stale' when a required CLI is missing from the image", async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ okClis: ['claude'], missingClis: ['codex'], caCerts: true }) },
    });
    const report = await checkWorkerImage({ requiredProviders: ['claude', 'codex'], spawnImpl });

    expect(report.state).toBe('stale');
    expect(report.missingClis).toEqual(['codex']);
    expect(report.missingCaCerts).toBe(false);
  });

  it("reports 'stale' when ca-certificates are absent (codex TLS would fail)", async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ okClis: ['claude', 'codex'], caCerts: false }) },
    });
    const report = await checkWorkerImage({ requiredProviders: ['claude', 'codex'], spawnImpl });

    expect(report.state).toBe('stale');
    expect(report.missingClis).toEqual([]);
    expect(report.missingCaCerts).toBe(true);
  });

  it("reports 'stale' conservatively when the in-image probe fails entirely", async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 127, stderr: 'sh: not found' },
    });
    const report = await checkWorkerImage({ requiredProviders: ['claude', 'codex'], spawnImpl });

    expect(report.state).toBe('stale');
    expect(report.missingClis).toEqual(['claude', 'codex']);
    expect(report.missingCaCerts).toBe(true);
  });

  it('suggestedBuildCmd carries INSTALL_CODEX + INSTALL_GEMINI build-args when both required', async () => {
    const spawnImpl = makeDockerSpawn({ inspect: { code: 1 } });
    const report = await checkWorkerImage({ requiredProviders: ['claude', 'codex', 'gemini'], spawnImpl });

    expect(report.suggestedBuildCmd).toBe(
      'docker build -f Dockerfile.worker --build-arg INSTALL_CODEX=true --build-arg INSTALL_GEMINI=true -t deckent-worker:latest .',
    );
  });

  it('suggestedBuildCmd omits build-args for a claude-only fleet', async () => {
    const spawnImpl = makeDockerSpawn({ inspect: { code: 1 } });
    const report = await checkWorkerImage({ requiredProviders: ['claude'], spawnImpl });

    expect(report.suggestedBuildCmd).toBe('docker build -f Dockerfile.worker -t deckent-worker:latest .');
    expect(report.suggestedBuildCmd).not.toContain('--build-arg');
  });

  it('honors a custom image tag in inspect args and suggestedBuildCmd', async () => {
    const spawnImpl = makeDockerSpawn({ inspect: { code: 1 } });
    const report = await checkWorkerImage({ image: 'myorg/worker:v2', requiredProviders: ['codex'], spawnImpl });

    expect(spawnImpl).toHaveBeenCalledWith('docker', ['image', 'inspect', 'myorg/worker:v2'], { shell: false });
    expect(report.suggestedBuildCmd).toBe(
      'docker build -f Dockerfile.worker --build-arg INSTALL_CODEX=true -t myorg/worker:v2 .',
    );
  });

  it('skips host-only providers (ollama) — no container CLI is probed for them', async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ okClis: ['claude'], caCerts: true }) },
    });
    const report = await checkWorkerImage({ requiredProviders: ['claude', 'ollama'], spawnImpl });

    expect(report.state).toBe('ready');
    expect(report.missingClis).toEqual([]);
    // probe script must reference claude but never the host-only ollama
    const probeArgs = spawnImpl.mock.calls[1][1];
    const probeScript = probeArgs[probeArgs.length - 1];
    expect(probeScript).toContain('claude');
    expect(probeScript).not.toContain('ollama');
  });

  it('uses the default image tag when none is provided', async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ okClis: ['claude'], caCerts: true }) },
    });
    await checkWorkerImage({ requiredProviders: ['claude'], spawnImpl });

    expect(spawnImpl).toHaveBeenCalledWith('docker', ['image', 'inspect', DEFAULT_WORKER_IMAGE], { shell: false });
    expect(spawnImpl.mock.calls[1][1]).toContain(DEFAULT_WORKER_IMAGE);
  });

  it("treats a docker spawn error (docker unavailable) as 'missing'", async () => {
    const spawnImpl = makeDockerSpawn({ inspect: { error: new Error('spawn docker ENOENT') } });
    const report = await checkWorkerImage({ requiredProviders: ['claude'], spawnImpl });

    expect(report.state).toBe('missing');
    expect(report.missingCaCerts).toBe(true);
  });

  it('handles an empty/host-only requiredProviders list (ca-certs only gates readiness)', async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ caCerts: true }) },
    });
    const report = await checkWorkerImage({ requiredProviders: [], spawnImpl });

    expect(report.state).toBe('ready');
    expect(report.missingClis).toEqual([]);
    expect(report.missingCaCerts).toBe(false);
    // with no binaries, the probe still runs the ca-cert check (no `for c in ;` syntax bug)
    const probeArgs = spawnImpl.mock.calls[1][1];
    const probeScript = probeArgs[probeArgs.length - 1];
    expect(probeScript).toContain('CACERTS');
    expect(probeScript).not.toContain('for c in ;');
  });

  it('uses async spawn with shell:false for the run probe (no shell injection surface)', async () => {
    const spawnImpl = makeDockerSpawn({
      inspect: { code: 0, stdout: 'ok' },
      run: { code: 0, stdout: probeOutput({ okClis: ['claude'], caCerts: true }) },
    });
    await checkWorkerImage({ requiredProviders: ['claude'], spawnImpl });

    const [runCmd, runArgs, runOpts] = spawnImpl.mock.calls[1];
    expect(runCmd).toBe('docker');
    expect(runArgs.slice(0, 3)).toEqual(['run', '--rm', DEFAULT_WORKER_IMAGE]);
    expect(runArgs[3]).toBe('sh');
    expect(runArgs[4]).toBe('-c');
    expect(runOpts).toEqual({ shell: false });
  });
});

describe('buildSuggestedImageCmd', () => {
  it('emits build-args only for opt-in providers, claude needs none', () => {
    expect(buildSuggestedImageCmd('img:1', ['claude'])).toBe('docker build -f Dockerfile.worker -t img:1 .');
    expect(buildSuggestedImageCmd('img:1', ['gemini'])).toBe(
      'docker build -f Dockerfile.worker --build-arg INSTALL_GEMINI=true -t img:1 .',
    );
  });
});
