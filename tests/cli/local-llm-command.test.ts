import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache, loadConfig } from '../../src/core/config.js';
import {
  buildLocalLlmLaunch,
  getLocalLlmStatus,
  registerLocalLlm,
  resolveLocalLlmLaunchConfig,
  startLocalLlm,
  stopLocalLlm,
} from '../../src/cli/commands/local-llm.js';

const config = {
  local_llm: {
    serverBinary: '/opt/llamacpp/bin/llama-server',
    modelArtifact: '/models/configured-model.gguf',
    contextSize: 131_072,
    modelAlias: 'configured-qwen',
  },
  providers: {
    'local-llm': { baseUrl: 'http://127.0.0.9:19090/v1' },
  },
};

const cudaAcceleration = {
  backend: 'cuda' as const,
  backendLibrary: '/opt/llamacpp/cuda/libggml-cuda.so',
  runtimeLibraryDirectories: ['/opt/llamacpp/cuda', '/usr/lib/wsl/lib'],
  device: 'CUDA0',
  gpuLayers: 'all' as const,
  flashAttention: 'on' as const,
};

const temporaryRoots: string[] = [];

afterEach(async () => {
  clearConfigCache();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fakeChild(pid = 4242) {
  const child = new EventEmitter() as EventEmitter & { pid: number; unref: ReturnType<typeof vi.fn> };
  child.pid = pid;
  child.unref = vi.fn();
  return child;
}

describe('local-llm command', () => {
  it('preserves owner-authored local_llm launch authority through real loadConfig', async () => {
    const root = await mkdtemp(`${tmpdir()}/deckent-local-llm-config-`);
    temporaryRoots.push(root);
    await mkdir(`${root}/.deckent`, { recursive: true });
    await writeFile(`${root}/.deckent/config.json`, JSON.stringify({
      local_llm: {
        ...config.local_llm,
        endpoint: 'http://127.0.0.9:19090/v1',
        host: '127.0.0.9',
        port: 19090,
        acceleration: cudaAcceleration,
      },
    }));

    const resolved = await loadConfig(root, { force: true });
    expect(resolveLocalLlmLaunchConfig(resolved)).toMatchObject({
      endpoint: 'http://127.0.0.9:19090/v1',
      modelArtifact: '/models/configured-model.gguf',
      modelAlias: 'configured-qwen',
      acceleration: cudaAcceleration,
    });
  });

  it('derives endpoint, host, and port from resolved config', () => {
    expect(resolveLocalLlmLaunchConfig(config)).toMatchObject({
      endpoint: 'http://127.0.0.9:19090/v1',
      host: '127.0.0.9',
      port: 19090,
      modelArtifact: '/models/configured-model.gguf',
    });
  });

  it('rejects a non-loopback bind host from resolved config', () => {
    expect(() => resolveLocalLlmLaunchConfig({
      ...config,
      local_llm: { ...config.local_llm, host: '0.0.0.0' },
    })).toThrow('LOCAL_LLM_CONFIG_INVALID:host_not_loopback');
  });

  it('builds the direct llama.cpp argv and configures its shared-library directory', async () => {
    const spawnFn = vi.fn(() => fakeChild()) as never;
    const writePidFn = vi.fn(async () => undefined);
    await startLocalLlm({
      loadConfigFn: async () => config,
      resolveProjectRootFn: () => '/project',
      spawnFn,
      writePidFn,
      env: { LD_LIBRARY_PATH: '/existing' },
      platform: 'linux',
      printFn: vi.fn(),
    });

    expect(spawnFn).toHaveBeenCalledOnce();
    const [command, args, options] = spawnFn.mock.calls[0]!;
    expect(command).toBe(config.local_llm.serverBinary);
    expect(command).not.toMatch(/ollama(?:\.exe)?$/i);
    expect(args).toEqual([
      '--model', config.local_llm.modelArtifact,
      '--host', '127.0.0.9',
      '--port', '19090',
      '--ctx-size', '131072',
      '--jinja',
      '--alias', config.local_llm.modelAlias,
    ]);
    expect(options).toMatchObject({ detached: true, stdio: 'ignore' });
    expect(options.env.LD_LIBRARY_PATH).toBe(`${dirname(config.local_llm.serverBinary)}:/existing`);
    expect(writePidFn).toHaveBeenCalledWith('/project/.deckent/runtime/local-llm.pid', 4242);
  });

  it('reports health and identity from the model listing route without authorization', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/health')) return new Response('{}', { status: 200 });
      return new Response(JSON.stringify({ data: [{ id: 'configured-qwen', owned_by: 'llamacpp' }] }), { status: 200 });
    });
    const status = await getLocalLlmStatus({ loadConfigFn: async () => config, resolveProjectRootFn: () => '/project', fetchFn });

    expect(status).toEqual({
      endpoint: 'http://127.0.0.9:19090/v1',
      healthy: true,
      models: [{ id: 'configured-qwen', ownedBy: 'llamacpp' }],
    });
    expect(fetchFn).toHaveBeenCalledWith('http://127.0.0.9:19090/health');
    expect(fetchFn).toHaveBeenCalledWith('http://127.0.0.9:19090/v1/models');
    expect(fetchFn.mock.calls.every((call) => call.length === 1)).toBe(true);
  });

  it('stops the persisted server process and removes its pid file', async () => {
    const killFn = vi.fn();
    const removePidFn = vi.fn(async () => undefined);
    await expect(stopLocalLlm({
      resolveProjectRootFn: () => '/project',
      readPidFn: async () => 4242,
      killFn,
      removePidFn,
      printFn: vi.fn(),
    })).resolves.toBe(4242);
    expect(killFn).toHaveBeenCalledWith(4242);
    expect(removePidFn).toHaveBeenCalledWith('/project/.deckent/runtime/local-llm.pid');
  });

  it('registers start, status, and stop under local-llm', () => {
    const program = new Command();
    registerLocalLlm(program);
    const local = program.commands.find((entry) => entry.name() === 'local-llm');
    expect(local?.commands.map((entry) => entry.name())).toEqual(['start', 'status', 'stop']);
  });

  it('projects platform-specific library path variables without changing argv', () => {
    const resolved = resolveLocalLlmLaunchConfig(config);
    expect(buildLocalLlmLaunch(resolved, 'darwin', {}).env.DYLD_LIBRARY_PATH).toBe('/opt/llamacpp/bin');
    expect(buildLocalLlmLaunch(resolved, 'win32', { PATH: 'C:\\Windows' }).env.PATH)
      .toBe('/opt/llamacpp/bin;C:\\Windows');
  });

  it('projects an explicit CUDA backend, full layer offload, and ordered runtime libraries', () => {
    const resolved = resolveLocalLlmLaunchConfig({
      ...config,
      local_llm: { ...config.local_llm, acceleration: cudaAcceleration },
    });
    const launch = buildLocalLlmLaunch(resolved, 'linux', { LD_LIBRARY_PATH: '/existing' });

    expect(launch.args).toEqual([
      '--model', config.local_llm.modelArtifact,
      '--host', '127.0.0.9',
      '--port', '19090',
      '--ctx-size', '131072',
      '--device', 'CUDA0',
      '--gpu-layers', 'all',
      '--flash-attn', 'on',
      '--jinja',
      '--alias', config.local_llm.modelAlias,
    ]);
    expect(launch.env.GGML_BACKEND_PATH).toBe('/opt/llamacpp/cuda/libggml-cuda.so');
    expect(launch.env.LD_LIBRARY_PATH)
      .toBe('/opt/llamacpp/bin:/opt/llamacpp/cuda:/usr/lib/wsl/lib:/existing');
  });

  it('uses target-platform loader variables and delimiters for explicit backends', () => {
    const resolved = resolveLocalLlmLaunchConfig({
      ...config,
      local_llm: { ...config.local_llm, acceleration: cudaAcceleration },
    });
    expect(buildLocalLlmLaunch(resolved, 'darwin', { DYLD_LIBRARY_PATH: '/existing' }).env.DYLD_LIBRARY_PATH)
      .toBe('/opt/llamacpp/bin:/opt/llamacpp/cuda:/usr/lib/wsl/lib:/existing');
    expect(buildLocalLlmLaunch(resolved, 'win32', { PATH: 'C:\\Windows' }).env.PATH)
      .toBe('/opt/llamacpp/bin;/opt/llamacpp/cuda;/usr/lib/wsl/lib;C:\\Windows');
  });

  it('makes CPU placement explicit without changing the portable default', () => {
    const portable = buildLocalLlmLaunch(resolveLocalLlmLaunchConfig(config), 'linux', {});
    expect(portable.args).not.toContain('--device');
    expect(portable.args).not.toContain('--gpu-layers');

    const cpu = buildLocalLlmLaunch(resolveLocalLlmLaunchConfig({
      ...config,
      local_llm: { ...config.local_llm, acceleration: { backend: 'cpu' } },
    }), 'linux', {});
    expect(cpu.args).toContain('--device');
    expect(cpu.args).toContain('none');
    expect(cpu.args).toContain('--gpu-layers');
    expect(cpu.args).toContain('0');
    expect(cpu.env.GGML_BACKEND_PATH).toBeUndefined();
  });

  it.each([
    [{ backend: 'cuda', device: 'CUDA0', gpuLayers: 'all' }, 'LOCAL_LLM_CONFIG_MISSING:acceleration.backendLibrary'],
    [{ backend: 'cuda', backendLibrary: '/cuda.so', device: 'CUDA0', gpuLayers: 'all' }, 'LOCAL_LLM_CONFIG_MISSING:acceleration.runtimeLibraryDirectories'],
    [{ ...cudaAcceleration, device: '' }, 'LOCAL_LLM_CONFIG_MISSING:acceleration.device'],
    [{ ...cudaAcceleration, gpuLayers: 0 }, 'LOCAL_LLM_CONFIG_MISSING:acceleration.gpuLayers'],
    [{ backend: 'cpu', device: 'CUDA0' }, 'LOCAL_LLM_CONFIG_INVALID:acceleration.cpu_conflict'],
    [{ backend: 'cuda', ...cudaAcceleration, flashAttention: 'sometimes' }, 'LOCAL_LLM_CONFIG_INVALID:acceleration.flashAttention'],
  ])('rejects malformed or contradictory acceleration policy %#', (acceleration, reason) => {
    expect(() => resolveLocalLlmLaunchConfig({
      ...config,
      local_llm: { ...config.local_llm, acceleration },
    })).toThrow(reason);
  });
});
