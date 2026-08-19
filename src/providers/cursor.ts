import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions as NodeSpawnOptions,
} from 'node:child_process';

import { TASKS_DIR } from '../core/constants.js';
import { modelRegistry } from '../core/model-registry.js';
import type {
  ProviderAdapter,
  ProviderAvailabilityDetail,
  ProviderSpawnOptions,
} from '../core/provider.js';
import {
  buildCliInvocation,
  buildProviderChildEnv,
  parseSemverFromOutput,
  ProviderError,
  resolveBinaryPath,
} from '../core/provider.js';
import type { ModelType } from '../core/types.js';
import { normalizeUsage, type TokenUsage } from '../core/token-usage.js';
import { resolveCrossProviderCredentialKeys } from './cross-provider-keys.js';
import { killProcessGroupWithEscalation } from './subprocess.js';
import type { ProviderDetectResult } from './claude.js';

interface CursorWorkerEntry {
  readonly process: ChildProcess;
  readonly logPath: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

export class CursorAdapter implements ProviderAdapter {
  readonly name = 'cursor';
  readonly executionLandingCapability = 'checkpoint-stop' as const;
  readonly executionCostClass = 'remote' as const;

  get supportedModels(): readonly ModelType[] {
    return modelRegistry.getByProvider('cursor').map((model) => model.id as ModelType);
  }

  private readonly workers = new Map<string, CursorWorkerEntry>();
  private readonly platform: NodeJS.Platform;
  private readonly spawnImpl: typeof spawn;
  private readonly spawnSyncImpl: typeof spawnSync;
  private readonly credentialEnvKeys: readonly string[];
  private readonly defaultTimeoutMs: number;

  constructor(
    private readonly projectDir: string,
    opts?: {
      defaultTimeoutMs?: number;
      platform?: NodeJS.Platform;
      spawnImpl?: typeof spawn;
      spawnSyncImpl?: typeof spawnSync;
      credentialEnvKeys?: readonly string[];
    },
  ) {
    this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 0;
    this.platform = opts?.platform ?? process.platform;
    this.spawnImpl = opts?.spawnImpl ?? spawn;
    this.spawnSyncImpl = opts?.spawnSyncImpl ?? spawnSync;
    this.credentialEnvKeys = Object.freeze([
      ...new Set(opts?.credentialEnvKeys ?? resolveCrossProviderCredentialKeys()),
    ]);
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: ProviderSpawnOptions): void {
    if (!this.supportedModels.includes(model)) {
      throw new ProviderError(`Unsupported model "${model}" for cursor provider`, this.name);
    }
    if (this.workers.has(taskId)) {
      throw new ProviderError(`Worker for task "${taskId}" is already running`, this.name);
    }

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
    const logPath = opts?.logPath ?? join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');
    const args = this.buildArgs(model, prompt, opts);
    const invocation = buildCliInvocation('cursor-agent', args, this.platform);
    const spawnOptions: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['ignore', logFd, logFd],
      env: buildProviderChildEnv(
        { ...process.env, ...(opts?.env ?? {}) },
        this.credentialEnvKeys,
      ),
      shell: invocation.shell,
      detached: this.platform !== 'win32',
    };
    const child = this.spawnImpl(invocation.command, invocation.args, spawnOptions);
    closeSync(logFd);
    const entry: CursorWorkerEntry = { process: child, logPath };
    if (this.defaultTimeoutMs > 0) {
      entry.timeoutHandle = setTimeout(() => this.killWithSignal(taskId, 'SIGKILL'), this.defaultTimeoutMs);
    }
    this.workers.set(taskId, entry);
    child.once('exit', () => {
      const current = this.workers.get(taskId);
      if (current?.timeoutHandle) clearTimeout(current.timeoutHandle);
      this.workers.delete(taskId);
    });
  }

  kill(taskId: string): void {
    this.killWithSignal(taskId, 'SIGTERM');
  }

  listWorkers(): string[] {
    return [...this.workers.keys()];
  }

  async isAvailable(): Promise<boolean> {
    try {
      return this.spawnSyncImpl('cursor-agent', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
        env: buildProviderChildEnv(process.env, this.credentialEnvKeys),
      }).status === 0;
    } catch {
      return false;
    }
  }

  async diagnoseAvailability(): Promise<ProviderAvailabilityDetail> {
    let binaryFound = false;
    let versionRaw: string | undefined;
    try {
      const versionResult = this.spawnSyncImpl('cursor-agent', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
        env: buildProviderChildEnv(process.env, this.credentialEnvKeys),
      });
      binaryFound = versionResult.status === 0;
      versionRaw = binaryFound ? `${versionResult.stdout ?? ''}`.trim() || undefined : undefined;
    } catch {
      // Missing/unexecutable binary is represented below.
    }

    let loggedIn = false;
    if (binaryFound) {
      try {
        const statusResult = this.spawnSyncImpl('cursor-agent', ['status'], {
          encoding: 'utf-8',
          timeout: 5_000,
          env: buildProviderChildEnv(process.env, this.credentialEnvKeys),
        });
        const statusText = `${statusResult.stdout ?? ''}\n${statusResult.stderr ?? ''}`;
        loggedIn = /(?:✓|\b)\s*Logged in as\b/i.test(statusText);
      } catch {
        // Auth remains missing.
      }
    }

    const version = parseSemverFromOutput(versionRaw) ?? versionRaw;
    return {
      name: this.name,
      binaryFound,
      binaryPath: binaryFound ? resolveBinaryPath('cursor-agent') : undefined,
      version,
      versionStatus: binaryFound ? (version ? 'ok' : 'unknown') : 'missing',
      authMethod: loggedIn ? 'session' : 'none',
      authStatus: loggedIn ? 'ok' : 'missing',
      available: binaryFound && loggedIn,
      partial: binaryFound && !loggedIn,
      models: [...this.supportedModels],
      reason: !binaryFound
        ? 'Cursor Agent CLI not found in PATH'
        : loggedIn
          ? `Cursor Agent CLI ${version ?? 'installed'} + session auth active`
          : 'Cursor Agent CLI installed but not logged in',
      hints: !binaryFound
        ? ['Install cursor-agent with the official Cursor installer']
        : loggedIn
          ? []
          : ['Run `cursor-agent login`'],
    };
  }

  async detect(): Promise<ProviderDetectResult> {
    const detail = await this.diagnoseAvailability();
    return {
      binary: detail.binaryFound,
      version: detail.version,
      auth: detail.authStatus === 'ok',
      ready: detail.available ? true : detail.partial ? 'partial' : false,
    };
  }

  extractUsage(rawOutput: string): TokenUsage | null {
    if (typeof rawOutput !== 'string' || rawOutput.trim().length === 0) return null;
    for (const candidate of [rawOutput.trim(), ...rawOutput.split(/\r?\n/).reverse()]) {
      try {
        const envelope = JSON.parse(candidate) as unknown;
        if (!isRecord(envelope) || envelope['type'] !== 'result') continue;
        const usage = isRecord(envelope['usage']) ? envelope['usage'] : undefined;
        const inputTokens = readCount(usage, 'inputTokens');
        const outputTokens = readCount(usage, 'outputTokens');
        if (inputTokens === undefined && outputTokens === undefined) continue;
        const cacheReadTokens = readCount(usage, 'cacheReadTokens') ?? 0;
        const cacheWriteTokens = readCount(usage, 'cacheWriteTokens') ?? 0;
        return normalizeUsage({
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens: cacheWriteTokens,
          cacheWriteTokens,
          totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
        });
      } catch {
        // Try the next JSON/JSONL candidate.
      }
    }
    return null;
  }

  buildCommand(
    model: ModelType,
    promptPath: string,
    opts?: Pick<ProviderSpawnOptions, 'autoApprove'>,
  ): string {
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    const force = opts?.autoApprove ? ' --force' : '';
    return `cursor-agent --mode ask -p --trust --output-format json --model ${apiId}${force} "$(cat ${promptPath})"`;
  }

  private buildArgs(model: ModelType, prompt: string, opts?: ProviderSpawnOptions): string[] {
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    const args = ['--mode', 'ask', '-p', '--trust', '--output-format', 'json', '--model', apiId];
    if (opts?.autoApprove) args.push('--force');
    // SEC-1 (2026-08-19): end-of-options separator — a prompt starting with `-`
    // must never be parsed as a flag (argv smuggling, e.g. an injected --force).
    // cursor-agent honors `--`: real-binary proven with a `-`-prefixed prompt.
    args.push('--', prompt);
    return args;
  }

  private killWithSignal(taskId: string, signal: NodeJS.Signals): void {
    const entry = this.workers.get(taskId);
    if (!entry) throw new ProviderError(`No running worker for task "${taskId}"`, this.name);
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    killProcessGroupWithEscalation(entry.process, signal, this.platform);
    this.workers.delete(taskId);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readCount(object: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = object?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function createCursorAdapter(
  projectDir: string,
  opts?: ConstructorParameters<typeof CursorAdapter>[1],
): CursorAdapter {
  return new CursorAdapter(projectDir, opts);
}
