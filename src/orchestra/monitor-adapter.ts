// ─── Monitor Adapter Pattern ─────────────────────────────────────────────
// Backend-agnostic worker monitoring: Docker, tmux, subprocess.
// Each adapter wraps platform-specific commands behind a unified interface.
// Factory function selects adapter from ResolvedConfig.spawn_backend.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResolvedConfig } from '../core/config-types.js';

// ─── Interfaces ──────────────────────────────────────────────────────────

export interface WorkerInfo {
  id: string;
  status: string;
  createdAt?: string;
}

export interface ResourceUsage {
  cpu: string;
  memory: string;
  diskIo: string;
}

export interface MonitorAdapter {
  readonly backend: 'docker' | 'tmux' | 'subprocess';
  listActiveWorkers(): Promise<WorkerInfo[]>;
  captureWorkerOutput(workerId: string, lines: number): Promise<string | null>;
  getResourceUsage(workerId: string): Promise<ResourceUsage | null>;
  killWorker(workerId: string): Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function execCommand(cmd: string, args: string[], timeoutMs = 10_000): string | null {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return null;
  return (result.stdout ?? '').trim();
}

// ─── Docker Monitor Adapter ─────────────────────────────────────────────

export class DockerMonitorAdapter implements MonitorAdapter {
  readonly backend = 'docker' as const;

  async listActiveWorkers(): Promise<WorkerInfo[]> {
    const output = execCommand('docker', [
      'ps', '--filter', 'name=deckent-w-',
      '--format', '{{.ID}}\t{{.Status}}\t{{.CreatedAt}}',
    ]);
    if (!output) return [];
    return output.split('\n').filter(Boolean).map((line) => {
      const [id, status, createdAt] = line.split('\t');
      return { id: id ?? '', status: status ?? '', createdAt: createdAt ?? undefined };
    });
  }

  async captureWorkerOutput(workerId: string, lines: number): Promise<string | null> {
    return execCommand('docker', ['logs', '--tail', String(lines), workerId]);
  }

  async getResourceUsage(workerId: string): Promise<ResourceUsage | null> {
    const output = execCommand('docker', [
      'stats', '--no-stream', '--format',
      '{{.CPUPerc}}\t{{.MemUsage}}\t{{.BlockIO}}',
      workerId,
    ]);
    if (!output) return null;
    const [cpu, memory, diskIo] = output.split('\t');
    return {
      cpu: cpu ?? '0%',
      memory: memory ?? '0B',
      diskIo: diskIo ?? '0B / 0B',
    };
  }

  async killWorker(workerId: string): Promise<void> {
    execCommand('docker', ['kill', workerId]);
  }
}

// ─── Tmux Monitor Adapter ───────────────────────────────────────────────

export class TmuxMonitorAdapter implements MonitorAdapter {
  readonly backend = 'tmux' as const;

  async listActiveWorkers(): Promise<WorkerInfo[]> {
    const output = execCommand('tmux', [
      'ls', '-F', '#{session_name}\t#{session_activity}',
    ]);
    if (!output) return [];
    return output
      .split('\n')
      .filter((line) => line.includes('deckent'))
      .map((line) => {
        const [id, activity] = line.split('\t');
        return {
          id: id ?? '',
          status: 'running',
          createdAt: activity ? new Date(Number(activity) * 1000).toISOString() : undefined,
        };
      });
  }

  async captureWorkerOutput(workerId: string, lines: number): Promise<string | null> {
    return execCommand('tmux', [
      'capture-pane', '-t', workerId, '-p', '-S', String(-lines),
    ]);
  }

  async getResourceUsage(_workerId: string): Promise<ResourceUsage | null> {
    // tmux sessions don't expose resource metrics directly
    return null;
  }

  async killWorker(workerId: string): Promise<void> {
    execCommand('tmux', ['kill-session', '-t', workerId]);
  }
}

// ─── Subprocess Monitor Adapter ─────────────────────────────────────────

export class SubprocessMonitorAdapter implements MonitorAdapter {
  readonly backend = 'subprocess' as const;

  private readonly pidDir: string;

  constructor(projectRoot?: string) {
    this.pidDir = join(projectRoot ?? process.cwd(), '.deckent', 'workers');
  }

  async listActiveWorkers(): Promise<WorkerInfo[]> {
    let files: string[];
    try {
      files = readdirSync(this.pidDir).filter((f) => f.endsWith('.pid'));
    } catch {
      return [];
    }

    const workers: WorkerInfo[] = [];
    for (const file of files) {
      const pid = readFileSync(join(this.pidDir, file), 'utf-8').trim();
      const check = execCommand('ps', ['-p', pid, '-o', 'pid=,stat=,lstart=']);
      if (check) {
        const parts = check.trim().split(/\s+/);
        const stat = parts[1] ?? 'unknown';
        const lstart = parts.slice(2).join(' ') || undefined;
        workers.push({
          id: file.replace('.pid', ''),
          status: stat,
          createdAt: lstart,
        });
      }
    }
    return workers;
  }

  async captureWorkerOutput(_workerId: string, _lines: number): Promise<string | null> {
    return '(subprocess backend: stdout not captured — output written to log files)';
  }

  async getResourceUsage(workerId: string): Promise<ResourceUsage | null> {
    let pid: string;
    try {
      pid = readFileSync(join(this.pidDir, `${workerId}.pid`), 'utf-8').trim();
    } catch {
      return null;
    }
    const output = execCommand('ps', ['-p', pid, '-o', '%cpu=,%mem=']);
    if (!output) return null;
    const [cpu, mem] = output.trim().split(/\s+/);
    return {
      cpu: `${cpu ?? '0'}%`,
      memory: `${mem ?? '0'}%`,
      diskIo: 'N/A',
    };
  }

  async killWorker(workerId: string): Promise<void> {
    let pid: string;
    try {
      pid = readFileSync(join(this.pidDir, `${workerId}.pid`), 'utf-8').trim();
    } catch {
      return;
    }
    execCommand('kill', [pid]);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────

export function createMonitorAdapter(config: Pick<ResolvedConfig, 'spawn_backend' | 'projectRoot'>): MonitorAdapter {
  const backend = config.spawn_backend ?? 'auto';
  switch (backend) {
    case 'docker':
      return new DockerMonitorAdapter();
    case 'tmux':
      return new TmuxMonitorAdapter();
    case 'subprocess':
      return new SubprocessMonitorAdapter(config.projectRoot);
    case 'auto':
      // auto defaults to tmux (most common backend)
      return new TmuxMonitorAdapter();
    default:
      throw new Error(`Unknown spawn backend: ${backend as string}`);
  }
}
