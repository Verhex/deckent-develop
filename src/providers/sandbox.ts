import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import type { ModelType } from '../core/types.js';
import type { ProviderSpawnOptions } from '../core/provider.js';
import { ProviderError } from '../core/provider.js';
import {
  SubprocessSpawnBackend,
  type SubprocessProviderConfig,
} from './subprocess.js';

// ─── SandboxOptions ──────────────────────────────────────────────────
export interface SandboxOptions {
  /** Maximum memory in MB for worker processes (default: 512) */
  memoryLimitMb?: number;
  /** Directories the worker is allowed to read/write (scope enforcement) */
  allowedDirs?: string[];
  /** Disable network access (best-effort via env/flag) */
  blockNetwork?: boolean;
  /** Adapter-owned provider/cost classification; omitted keeps remote Claude. */
  providerConfig?: SubprocessProviderConfig;
}

// ─── SandboxSpawnBackend ─────────────────────────────────────────────
/**
 * SandboxSpawnBackend extends SubprocessSpawnBackend with extra security layers:
 * 1. Memory limit via NODE_OPTIONS --max-old-space-size
 * 2. Scope enforcement — workers outside allowedDirs throw before spawn
 * 3. Optional network restriction via environment variables
 *
 * Activated with `--sandbox` flag on `deckent start`.
 */
export class SandboxSpawnBackend extends SubprocessSpawnBackend {
  override readonly name = 'claude-sandbox';

  private readonly memoryLimitMb: number;
  private readonly allowedDirs: string[];
  private readonly blockNetwork: boolean;

  constructor(projectDir: string, sandboxOpts?: SandboxOptions) {
    super(projectDir, { providerConfig: sandboxOpts?.providerConfig });
    this.memoryLimitMb = sandboxOpts?.memoryLimitMb ?? 512;
    this.allowedDirs = (sandboxOpts?.allowedDirs ?? [projectDir]).map((d) =>
      resolve(d),
    );
    this.blockNetwork = sandboxOpts?.blockNetwork ?? false;
  }

  // ─── spawn() ───────────────────────────────────────────────────────

  override spawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts?: ProviderSpawnOptions,
  ): void {
    const dir = opts?.projectDir ?? this.getProjectDir();

    // Scope enforcement: verify working directory is within allowedDirs
    this.enforceScope(dir);

    // Overlay only sandbox constraints and caller-authorized provider env.
    // The parent constructs the scrubbed host environment; passing a
    // process.env-derived map here would re-introduce foreign provider keys.
    super.spawn(taskId, model, prompt, {
      ...opts,
      env: this.buildEnv(opts?.env ?? {}),
    });
  }

  // ─── isAvailable() ─────────────────────────────────────────────────

  override async isAvailable(): Promise<boolean> {
    // Sandbox requires subprocess availability plus OS-level constraints check
    const baseAvailable = await super.isAvailable();
    if (!baseAvailable) return false;

    // Check that we can at least set memory limits via spawn options
    return new Promise((resolve) => {
      const child = spawn('node', ['--max-old-space-size=128', '-e', 'process.exit(0)'], {
        stdio: 'pipe',
        timeout: 3_000,
      });
      child.once('exit', (code) => resolve(code === 0));
      child.once('error', () => resolve(false));
    });
  }

  // ─── enforceScope() ────────────────────────────────────────────────

  /**
   * Verify that the given directory is within the allowedDirs list.
   * Throws ProviderError if the path is outside all allowed directories.
   */
  enforceScope(dir: string): void {
    const resolved = safeResolve(dir);
    const allowed = this.allowedDirs.some((allowedDir) =>
      resolved.startsWith(allowedDir + '/') || resolved === allowedDir,
    );
    if (!allowed) {
      throw new ProviderError(
        `Sandbox scope violation: "${dir}" is outside allowed directories [${this.allowedDirs.join(', ')}]`,
        this.name,
      );
    }
  }

  /**
   * Build environment variables with sandbox constraints applied.
   */
  buildEnv(base?: NodeJS.ProcessEnv): Record<string, string> {
    const env: Record<string, string> = {};
    const source = base ?? process.env;

    for (const [k, v] of Object.entries(source)) {
      if (v !== undefined) env[k] = v;
    }

    // Memory limit via NODE_OPTIONS
    const existing = env['NODE_OPTIONS'] ?? '';
    const memFlag = `--max-old-space-size=${this.memoryLimitMb}`;
    env['NODE_OPTIONS'] = existing ? `${existing} ${memFlag}` : memFlag;

    // Network block via proxy env vars (best-effort)
    if (this.blockNetwork) {
      env['http_proxy'] = 'http://127.0.0.1:0';
      env['https_proxy'] = 'http://127.0.0.1:0';
      env['HTTP_PROXY'] = 'http://127.0.0.1:0';
      env['HTTPS_PROXY'] = 'http://127.0.0.1:0';
      env['no_proxy'] = '';
    }

    return env;
  }

  // ─── Accessors ─────────────────────────────────────────────────────

  getMemoryLimitMb(): number {
    return this.memoryLimitMb;
  }

  getAllowedDirs(): string[] {
    return [...this.allowedDirs];
  }

  isNetworkBlocked(): boolean {
    return this.blockNetwork;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function safeResolve(dir: string): string {
  try {
    // Use realpath if the path exists; otherwise use resolve
    return existsSync(dir) ? realpathSync(dir) : resolve(dir);
  } catch {
    return resolve(dir);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createSandboxBackend(
  projectDir: string,
  opts?: SandboxOptions,
): SandboxSpawnBackend {
  return new SandboxSpawnBackend(projectDir, opts);
}
