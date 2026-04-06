import {
  spawn,
  type ChildProcess,
  type SpawnOptions as NodeSpawnOptions,
} from 'node:child_process';
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  openSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';
import type { ModelType } from '../core/types.js';
import { CLAUDE_MODELS } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../core/provider.js';
import { ProviderError } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';

// ─── SubprocessProviderConfig ───────────────────────────────────────
/**
 * Configuration for a CLI-based provider used by SubprocessSpawnBackend.
 * Allows decoupling from any specific CLI tool (e.g. claude, codex).
 */
export interface SubprocessProviderConfig {
  /** CLI executable name (e.g. 'claude', 'codex') */
  readonly cliCommand: string;
  /** Human-readable name for this subprocess backend */
  readonly name: string;
  /** Models this provider supports */
  readonly supportedModels: readonly ModelType[];
  /**
   * Build CLI arguments for spawning a worker.
   * @param model   The model to use
   * @param opts    Spawn options (allowedTools, autoApprove)
   * @returns Array of CLI arguments
   */
  buildArgs(model: ModelType, opts?: ProviderSpawnOptions): string[];
  /**
   * Build the full shell command string for dry-run / display.
   * @param model       The model to use
   * @param promptPath  Path to the prompt file (stdin redirection)
   * @param opts        Spawn options
   * @returns Shell command string
   */
  buildCommandString(model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>): string;
}

/**
 * Default provider config for Claude CLI. Used when no config is provided.
 */
export const CLAUDE_SUBPROCESS_CONFIG: SubprocessProviderConfig = {
  cliCommand: 'claude',
  name: 'claude-subprocess',
  supportedModels: [...CLAUDE_MODELS],
  buildArgs(model: ModelType, opts?: ProviderSpawnOptions): string[] {
    const args = ['-p', '-', '--model', model];
    if (opts?.allowedTools) {
      args.push('--allowedTools', opts.allowedTools);
    }
    if (opts?.autoApprove) {
      args.push('--dangerously-skip-permissions');
    }
    return args;
  },
  buildCommandString(model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>): string {
    let cmd = `claude -p - --model ${model}`;
    if (opts?.allowedTools) {
      cmd += ` --allowedTools '${opts.allowedTools}'`;
    }
    if (opts?.autoApprove) {
      cmd += ' --dangerously-skip-permissions';
    }
    cmd += ` < ${promptPath}`;
    return cmd;
  },
};

// ─── SubprocessWorkerEntry ────────────────────────────────────────────
interface SubprocessWorkerEntry {
  taskId: string;
  process: ChildProcess;
  logPath: string;
  spawnedAt: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── SubprocessSpawnBackend ───────────────────────────────────────────
/**
 * SubprocessSpawnBackend — runs workers as child_process.spawn instances
 * without requiring tmux. Each worker runs in an isolated child process with
 * stdout/stderr redirected to a log file at .tasks/task-{id}.log.
 *
 * This backend is the foundation for Windows (non-WSL2) support.
 */
export class SubprocessSpawnBackend implements ProviderAdapter {
  readonly name: string;
  readonly supportedModels: readonly ModelType[];

  private readonly projectDir: string;
  private readonly workers = new Map<string, SubprocessWorkerEntry>();
  private readonly providerConfig: SubprocessProviderConfig;

  /** Default timeout in ms before a worker is killed automatically (0 = no timeout) */
  protected defaultTimeoutMs: number;

  constructor(projectDir: string, opts?: { defaultTimeoutMs?: number; providerConfig?: SubprocessProviderConfig }) {
    this.projectDir = projectDir;
    this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 0;
    this.providerConfig = opts?.providerConfig ?? CLAUDE_SUBPROCESS_CONFIG;
    this.name = this.providerConfig.name;
    this.supportedModels = this.providerConfig.supportedModels;
  }

  // ─── spawn() ───────────────────────────────────────────────────────

  spawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts?: ProviderSpawnOptions,
  ): void {
    if (this.workers.has(taskId)) {
      throw new ProviderError(
        `Worker for task "${taskId}" is already running`,
        this.name,
      );
    }

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    ensureDir(tasksDir);

    const logPath = join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');

    const args = this.providerConfig.buildArgs(model, opts);
    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['pipe', logFd, logFd],
      // BUG-19: Set UTF-8 encoding environment for Windows
      env: {
        ...process.env,
        LANG: process.env['LANG'] ?? 'en_US.UTF-8',
        PYTHONIOENCODING: 'utf-8',
      },
      // Windows: shell:true needed to resolve .cmd/.ps1 wrappers (e.g. claude.cmd)
      shell: process.platform === 'win32',
    };

    const child = spawn(this.providerConfig.cliCommand, args, spawnOpts);
    // BUG-26: DON'T close logFd here — keep open until child exits
    // On Windows with shell:true, closing FD before child inherits causes empty logs

    // Write initial heartbeat
    this.writeHeartbeat(taskId, dir, 'EXECUTING', 0);

    // BUG-23: Periodic heartbeat update (every 15 seconds)
    let hbSequence = 0;
    const hbInterval = setInterval(() => {
      hbSequence++;
      this.writeHeartbeat(taskId, dir, 'EXECUTING', hbSequence);
    }, 15_000);

    const entry: SubprocessWorkerEntry = {
      taskId,
      process: child,
      logPath,
      spawnedAt: new Date().toISOString(),
    };

    // Set up timeout if configured
    const timeout = this.defaultTimeoutMs;
    if (timeout > 0) {
      entry.timeoutHandle = setTimeout(() => {
        this.killWithSignal(taskId, 'SIGKILL');
      }, timeout);
    }

    this.workers.set(taskId, entry);

    // Send prompt via stdin
    if (child.stdin) {
      child.stdin.write(prompt, 'utf-8');
      child.stdin.end();
    }

    // Cleanup on exit
    child.once('exit', (code) => {
      // Stop periodic heartbeat
      clearInterval(hbInterval);

      // BUG-26: Close log file descriptor now that child is done
      try { closeSync(logFd); } catch { /* already closed */ }

      // BUG-24: Write fallback result if worker didn't create one
      const resultPath = join(dir, TASKS_DIR, `task-${taskId}.result`);
      if (!existsSync(resultPath)) {
        try {
          const fallback = {
            taskId,
            filesChanged: [] as string[],
            linesAdded: 0,
            linesRemoved: 0,
            testsPassed: code === 0,
            selfAssessment: code === 0 ? 'GO_WITH_TECH_DEBT' : 'NO_GO',
            notes: `Subprocess worker exited with code ${code ?? 'unknown'}. No explicit result file written by worker.`,
          };
          writeFileSync(resultPath, JSON.stringify(fallback, null, 2), 'utf-8');
        } catch { /* non-fatal */ }
      }

      // Write final heartbeat with DONE status
      this.writeHeartbeat(taskId, dir, code === 0 ? 'DONE' : 'FAILED', hbSequence + 1);

      const w = this.workers.get(taskId);
      if (w?.timeoutHandle) clearTimeout(w.timeoutHandle);
      this.workers.delete(taskId);
    });
  }

  // ─── kill() ────────────────────────────────────────────────────────

  kill(taskId: string): void {
    this.killWithSignal(taskId, 'SIGTERM');
  }

  // ─── listWorkers() ─────────────────────────────────────────────────

  listWorkers(): string[] {
    return Array.from(this.workers.keys());
  }

  // ─── isAvailable() ─────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(this.providerConfig.cliCommand, ['--version'], {
        stdio: 'pipe',
        timeout: 5_000,
        shell: process.platform === 'win32',
      });
      child.once('exit', (code) => resolve(code === 0));
      child.once('error', () => resolve(false));
    });
  }

  // ─── buildCommand() ────────────────────────────────────────────────

  buildCommand(
    model: ModelType,
    promptPath: string,
    opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    return this.providerConfig.buildCommandString(model, promptPath, opts);
  }

  // ─── Internal helpers ──────────────────────────────────────────────

  private killWithSignal(taskId: string, signal: NodeJS.Signals): void {
    const entry = this.workers.get(taskId);
    if (!entry) {
      throw new ProviderError(
        `No running worker for task "${taskId}"`,
        this.name,
      );
    }
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    entry.process.kill(signal);
    this.workers.delete(taskId);
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────

  protected writeHeartbeat(taskId: string, dir: string, status: string, sequence = 0): void {
    const hbPath = join(dir, TASKS_DIR, `task-${taskId}.hb`);
    const hb = {
      workerId: `subprocess-${taskId}`,
      taskId,
      status,
      currentAction: status === 'DONE' ? 'Task completed' : status === 'FAILED' ? 'Task failed' : 'Subprocess worker running',
      timestamp: new Date().toISOString(),
      filesChangedCount: 0,
      sequence,
    };
    try {
      writeFileSync(hbPath, JSON.stringify(hb, null, 2), 'utf-8');
    } catch {
      // Non-fatal: heartbeat write failure should not stop the worker
    }
  }

  // ─── Accessors (for testing/subclassing) ───────────────────────────

  getWorkerEntry(taskId: string): SubprocessWorkerEntry | undefined {
    return this.workers.get(taskId);
  }

  getLogPath(taskId: string): string {
    return join(this.projectDir, TASKS_DIR, `task-${taskId}.log`);
  }

  getProjectDir(): string {
    return this.projectDir;
  }

  getProviderConfig(): SubprocessProviderConfig {
    return this.providerConfig;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createSubprocessBackend(
  projectDir: string,
  opts?: { defaultTimeoutMs?: number; providerConfig?: SubprocessProviderConfig },
): SubprocessSpawnBackend {
  return new SubprocessSpawnBackend(projectDir, opts);
}
