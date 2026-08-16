import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import type {
  LocalLlmAccelerationBackend,
  LocalLlmAccelerationConfig,
  LocalLlmFlashAttention,
  LocalLlmGpuLayers,
  LocalLlmLaunchConfig,
} from '../../core/config-types.js';
import { ErrorRegistry } from '../../core/errors.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print } from '../helpers/output.js';

const PROVIDER_NAME = 'local-llm';
const PID_FILE = join('.deckent', 'runtime', 'local-llm.pid');

interface LocalLlmProviderConfig {
  baseUrl?: string;
  endpoint?: string;
}

interface LocalLlmConfigSource {
  local_llm?: Partial<LocalLlmLaunchConfig>;
  providers?: Record<string, LocalLlmProviderConfig | undefined>;
}

export interface LocalLlmStatus {
  endpoint: string;
  healthy: boolean;
  models: Array<{ id: string; ownedBy?: string }>;
  error?: string;
}

type SpawnFn = typeof spawn;
type FetchFn = typeof globalThis.fetch;

export interface LocalLlmCommandDeps {
  loadConfigFn?: (root: string) => Promise<unknown>;
  resolveProjectRootFn?: () => string;
  spawnFn?: SpawnFn;
  fetchFn?: FetchFn;
  writePidFn?: (path: string, pid: number) => Promise<void>;
  readPidFn?: (path: string) => Promise<number>;
  removePidFn?: (path: string) => Promise<void>;
  killFn?: (pid: number) => void;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  printFn?: (value: string) => void;
}

function localLlmConfigError(message: string): Error {
  return ErrorRegistry.createError('DECKENT_E092', { message });
}

function localLlmPidError(message: string): Error {
  return ErrorRegistry.createError('DECKENT_E093', { message });
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw localLlmConfigError(`LOCAL_LLM_CONFIG_MISSING:${field}`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw localLlmConfigError(`LOCAL_LLM_CONFIG_INVALID:${field}`);
  }
  return value;
}

function requiredNonEmptyStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw localLlmConfigError(`LOCAL_LLM_CONFIG_INVALID:${field}`);
  }
  const entries = value.map((entry) => requiredString(entry, field));
  return [...new Set(entries)];
}

const ACCELERATION_BACKENDS = new Set<LocalLlmAccelerationBackend>(['auto', 'cpu', 'cuda', 'vulkan', 'metal']);
const FLASH_ATTENTION_POLICIES = new Set<LocalLlmFlashAttention>(['auto', 'on', 'off']);

function resolveGpuLayers(value: unknown, field: string): LocalLlmGpuLayers {
  if (value === 'auto' || value === 'all') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  throw localLlmConfigError(`LOCAL_LLM_CONFIG_INVALID:${field}`);
}

function resolveLocalLlmAcceleration(value: unknown): LocalLlmAccelerationConfig | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw localLlmConfigError('LOCAL_LLM_CONFIG_INVALID:acceleration');
  }
  const source = value as Partial<LocalLlmAccelerationConfig>;
  if (typeof source.backend !== 'string' || !ACCELERATION_BACKENDS.has(source.backend as LocalLlmAccelerationBackend)) {
    throw localLlmConfigError('LOCAL_LLM_CONFIG_INVALID:acceleration.backend');
  }
  const backend = source.backend as LocalLlmAccelerationBackend;
  const backendLibrary = source.backendLibrary === undefined
    ? undefined
    : requiredString(source.backendLibrary, 'acceleration.backendLibrary');
  const runtimeLibraryDirectories = source.runtimeLibraryDirectories === undefined
    ? undefined
    : requiredNonEmptyStringArray(source.runtimeLibraryDirectories, 'acceleration.runtimeLibraryDirectories');
  const device = source.device === undefined
    ? undefined
    : requiredString(source.device, 'acceleration.device');
  const gpuLayers = source.gpuLayers === undefined
    ? undefined
    : resolveGpuLayers(source.gpuLayers, 'acceleration.gpuLayers');
  const flashAttention = source.flashAttention === undefined
    ? undefined
    : source.flashAttention;
  if (flashAttention !== undefined && !FLASH_ATTENTION_POLICIES.has(flashAttention)) {
    throw localLlmConfigError('LOCAL_LLM_CONFIG_INVALID:acceleration.flashAttention');
  }

  if (backend === 'cpu') {
    if (backendLibrary !== undefined || device !== undefined || (gpuLayers !== undefined && gpuLayers !== 0)) {
      throw localLlmConfigError('LOCAL_LLM_CONFIG_INVALID:acceleration.cpu_conflict');
    }
  } else if (backend === 'cuda' || backend === 'vulkan') {
    if (backendLibrary === undefined) throw localLlmConfigError('LOCAL_LLM_CONFIG_MISSING:acceleration.backendLibrary');
    if (runtimeLibraryDirectories === undefined) {
      throw localLlmConfigError('LOCAL_LLM_CONFIG_MISSING:acceleration.runtimeLibraryDirectories');
    }
    if (device === undefined) throw localLlmConfigError('LOCAL_LLM_CONFIG_MISSING:acceleration.device');
    if (gpuLayers === undefined || gpuLayers === 0) {
      throw localLlmConfigError('LOCAL_LLM_CONFIG_MISSING:acceleration.gpuLayers');
    }
  } else if (backend === 'metal') {
    if (device === undefined) throw localLlmConfigError('LOCAL_LLM_CONFIG_MISSING:acceleration.device');
    if (gpuLayers === undefined || gpuLayers === 0) {
      throw localLlmConfigError('LOCAL_LLM_CONFIG_MISSING:acceleration.gpuLayers');
    }
  }

  return {
    backend,
    ...(backendLibrary === undefined ? {} : { backendLibrary }),
    ...(runtimeLibraryDirectories === undefined ? {} : { runtimeLibraryDirectories }),
    ...(device === undefined ? {} : { device }),
    ...(gpuLayers === undefined ? {} : { gpuLayers }),
    ...(flashAttention === undefined ? {} : { flashAttention }),
  };
}

/** A local model server must never become remotely reachable through configuration drift. */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

/** Pure config boundary: endpoint, host, port and artifact all originate in resolved config. */
export function resolveLocalLlmLaunchConfig(config: unknown): LocalLlmLaunchConfig {
  const source = config as LocalLlmConfigSource;
  const local = source.local_llm ?? {};
  const provider = source.providers?.[PROVIDER_NAME];
  const endpoint = requiredString(local.endpoint ?? provider?.baseUrl ?? provider?.endpoint, 'endpoint');
  const parsedEndpoint = new URL(endpoint);
  const host = requiredString(local.host ?? parsedEndpoint.hostname, 'host');
  if (!isLoopbackHost(host)) {
    throw localLlmConfigError('LOCAL_LLM_CONFIG_INVALID:host_not_loopback');
  }
  const endpointPort = parsedEndpoint.port.length > 0 ? Number(parsedEndpoint.port) : undefined;
  const port = requiredPositiveInteger(local.port ?? endpointPort, 'port');

  return {
    serverBinary: requiredString(local.serverBinary, 'serverBinary'),
    modelArtifact: requiredString(local.modelArtifact, 'modelArtifact'),
    endpoint,
    host,
    port,
    contextSize: requiredPositiveInteger(local.contextSize, 'contextSize'),
    modelAlias: requiredString(local.modelAlias, 'modelAlias'),
    acceleration: resolveLocalLlmAcceleration(local.acceleration),
  };
}

/** Pure launch projection, kept separate from process creation for hermetic tests. */
export function buildLocalLlmLaunch(
  config: LocalLlmLaunchConfig,
  platform: NodeJS.Platform,
  parentEnv: NodeJS.ProcessEnv,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const libraryDirectory = dirname(config.serverBinary);
  const libraryVariable = platform === 'darwin'
    ? 'DYLD_LIBRARY_PATH'
    : platform === 'win32'
      ? 'PATH'
      : 'LD_LIBRARY_PATH';
  const inherited = parentEnv[libraryVariable];
  const acceleration = config.acceleration;
  const runtimeDirectories = [
    libraryDirectory,
    ...(acceleration?.runtimeLibraryDirectories ?? []),
  ].filter((entry, index, entries) => entries.indexOf(entry) === index);
  const pathDelimiter = platform === 'win32' ? ';' : ':';
  const accelerationArgs: string[] = [];
  if (acceleration?.backend === 'cpu') {
    accelerationArgs.push('--device', 'none', '--gpu-layers', '0');
  } else if (acceleration !== undefined) {
    if (acceleration.device !== undefined) accelerationArgs.push('--device', acceleration.device);
    if (acceleration.gpuLayers !== undefined) {
      accelerationArgs.push('--gpu-layers', String(acceleration.gpuLayers));
    }
  }
  if (acceleration?.flashAttention !== undefined) {
    accelerationArgs.push('--flash-attn', acceleration.flashAttention);
  }

  return {
    command: config.serverBinary,
    args: [
      '--model', config.modelArtifact,
      '--host', config.host,
      '--port', String(config.port),
      '--ctx-size', String(config.contextSize),
      ...accelerationArgs,
      '--jinja',
      '--alias', config.modelAlias,
    ],
    env: {
      ...parentEnv,
      [libraryVariable]: inherited
        ? `${runtimeDirectories.join(pathDelimiter)}${pathDelimiter}${inherited}`
        : runtimeDirectories.join(pathDelimiter),
      ...(acceleration?.backendLibrary === undefined
        ? {}
        : { GGML_BACKEND_PATH: acceleration.backendLibrary }),
    },
  };
}

function defaultWritePid(path: string, pid: number): Promise<void> {
  return mkdir(dirname(path), { recursive: true })
    .then(() => writeFile(path, `${pid}\n`, { encoding: 'utf8', mode: 0o600 }));
}

async function defaultReadPid(path: string): Promise<number> {
  const value = Number((await readFile(path, 'utf8')).trim());
  if (!Number.isSafeInteger(value) || value <= 0) throw localLlmPidError('LOCAL_LLM_PID_INVALID');
  return value;
}

async function loadLaunchConfig(deps: LocalLlmCommandDeps): Promise<{ root: string; config: LocalLlmLaunchConfig }> {
  const root = (deps.resolveProjectRootFn ?? resolveProjectRoot)();
  const resolved = await (deps.loadConfigFn ?? loadConfig)(root);
  return { root, config: resolveLocalLlmLaunchConfig(resolved) };
}

export async function startLocalLlm(deps: LocalLlmCommandDeps = {}): Promise<number> {
  const { root, config } = await loadLaunchConfig(deps);
  const launch = buildLocalLlmLaunch(config, deps.platform ?? process.platform, deps.env ?? process.env);
  const child: ChildProcess = (deps.spawnFn ?? spawn)(launch.command, launch.args, {
    env: launch.env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (child.pid === undefined) throw localLlmPidError('LOCAL_LLM_PID_MISSING');
  child.unref();
  await (deps.writePidFn ?? defaultWritePid)(join(root, PID_FILE), child.pid);
  (deps.printFn ?? print)(JSON.stringify({ running: true, pid: child.pid, endpoint: config.endpoint }));
  return child.pid;
}

export async function getLocalLlmStatus(deps: LocalLlmCommandDeps = {}): Promise<LocalLlmStatus> {
  const { config } = await loadLaunchConfig(deps);
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const base = config.endpoint.replace(/\/$/, '');
  const healthUrl = new URL('/health', config.endpoint).toString();
  try {
    const [healthResponse, modelsResponse] = await Promise.all([
      fetchFn(healthUrl),
      fetchFn(`${base}/models`),
    ]);
    const body = modelsResponse.ok
      ? await modelsResponse.json() as { data?: Array<{ id?: unknown; owned_by?: unknown }> }
      : {};
    const models = Array.isArray(body.data)
      ? body.data.flatMap((model) => typeof model.id === 'string'
        ? [{ id: model.id, ...(typeof model.owned_by === 'string' ? { ownedBy: model.owned_by } : {}) }]
        : [])
      : [];
    return { endpoint: config.endpoint, healthy: healthResponse.ok && modelsResponse.ok, models };
  } catch (error) {
    return {
      endpoint: config.endpoint,
      healthy: false,
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function stopLocalLlm(deps: LocalLlmCommandDeps = {}): Promise<number> {
  const root = (deps.resolveProjectRootFn ?? resolveProjectRoot)();
  const pidPath = join(root, PID_FILE);
  const pid = await (deps.readPidFn ?? defaultReadPid)(pidPath);
  (deps.killFn ?? ((target) => process.kill(target, 'SIGTERM')))(pid);
  await (deps.removePidFn ?? ((path) => rm(path, { force: true })))(pidPath);
  (deps.printFn ?? print)(JSON.stringify({ running: false, pid }));
  return pid;
}

export function registerLocalLlm(program: Command): void {
  const command = program.command(PROVIDER_NAME);
  command.command('start').action(async () => {
    await startLocalLlm();
  });
  command.command('status').action(async () => {
    print(JSON.stringify(await getLocalLlmStatus()));
  });
  command.command('stop').action(async () => {
    await stopLocalLlm();
  });
}
