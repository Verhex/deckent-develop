// ─── Resource Monitor ──────────────────────────────────────────────────────
// Periodically samples running docker containers via `docker stats --no-stream`
// and appends ResourceSample entries as JSONL to logPath.
// Fail-safe: errors per tick are logged and never propagate; sprint is unaffected.

import { appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { debugLog } from '../core/utils.js';
import { parseMemoryString } from './spawn-backend-docker.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ResourceSample {
  ts: string;
  container: string;
  taskId: string;
  memUsageBytes: number;
  memLimitBytes: number;
  memPerc: number;
  cpuPerc: number;
  netIO: string;
  blockIO: string;
}

export interface ResourceMonitorOpts {
  /** Sampling interval in ms. Default: 5000. Minimum: 1000. */
  intervalMs?: number;
  /** Path to JSONL log file (append-only). */
  logPath: string;
  /** Injectable spawn implementation for testing. */
  spawnImpl?: (cmd: string, args: string[]) => ChildProcess;
  /** Container name prefix filter. Default: 'deckent-w-'. */
  filterPrefix?: string;
}

export interface ResourceMonitor {
  start(): void;
  stop(): Promise<void>;
  sampleOnce(): Promise<ResourceSample[]>;
}

// ─── Raw docker stats JSON shape ─────────────────────────────────────────

interface DockerStatRaw {
  Name?: string;
  MemUsage?: string;
  MemPerc?: string;
  CPUPerc?: string;
  NetIO?: string;
  BlockIO?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_FILTER_PREFIX = 'deckent-w-';

/**
 * Normalize docker stats memory string (e.g. "512MiB", "4GiB", "1.5kB", "0B")
 * to a form that parseMemoryString understands (e.g. "512m", "4g", "1.5k", "0b").
 * Returns null when the string is empty or unparseable.
 */
function normalizeDockerMemStr(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Replace binary-prefix variants: MiB→m, GiB→g, KiB→k, TiB→t, B→b
  // Docker outputs "512MiB" or "512MB" — both treated as base-2 equivalent
  return trimmed
    .replace(/[Tt]i[Bb]$/i, 't')
    .replace(/[Gg]i[Bb]$/i, 'g')
    .replace(/[Mm]i[Bb]$/i, 'm')
    .replace(/[Kk]i[Bb]$/i, 'k')
    .replace(/[Mm][Bb]$/i, 'm')
    .replace(/[Kk][Bb]$/i, 'k')
    .replace(/[Gg][Bb]$/i, 'g')
    .replace(/[Tt][Bb]$/i, 't')
    .replace(/[Bb]$/i, 'b')
    || null;
}

/** Parse "512MiB / 4GiB" → [usageBytes, limitBytes]. Returns [0, 0] on failure. */
function parseMemUsage(raw: string | undefined): [number, number] {
  if (!raw) return [0, 0];
  const parts = raw.split('/');
  if (parts.length < 2) return [0, 0];
  const usageStr = normalizeDockerMemStr(parts[0]!.trim());
  const limitStr = normalizeDockerMemStr(parts[1]!.trim());
  const usage = parseMemoryString(usageStr) ?? 0;
  const limit = parseMemoryString(limitStr) ?? 0;
  return [usage, limit];
}

/** Parse percentage string "12.50%" → 12.5. Returns 0 on failure. */
function parsePerc(raw: string | undefined): number {
  if (!raw) return 0;
  const num = Number.parseFloat(raw.replace('%', ''));
  return Number.isFinite(num) ? num : 0;
}

/** Derive taskId from container name by stripping filterPrefix. */
function deriveTaskId(containerName: string, filterPrefix: string): string {
  return containerName.startsWith(filterPrefix)
    ? containerName.slice(filterPrefix.length)
    : containerName;
}

/** Run docker stats and collect stdout as a string. Never throws. */
function runDockerStats(spawnImpl: (cmd: string, args: string[]) => ChildProcess): Promise<string> {
  return new Promise((resolve) => {
    let stdout = '';
    let proc: ChildProcess;
    try {
      proc = spawnImpl('docker', ['stats', '--no-stream', '--format', '{{json .}}']);
    } catch {
      resolve('');
      return;
    }

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });

    proc.on('error', () => {
      resolve('');
    });

    proc.on('close', () => {
      resolve(stdout);
    });
  });
}

// ─── Factory ─────────────────────────────────────────────────────────────

export function createResourceMonitor(opts: ResourceMonitorOpts): ResourceMonitor {
  const intervalMs = Math.max(opts.intervalMs ?? DEFAULT_INTERVAL_MS, 1_000);
  const filterPrefix = opts.filterPrefix ?? DEFAULT_FILTER_PREFIX;
  const spawnImpl = opts.spawnImpl ?? ((cmd, args) => spawn(cmd, args));

  let timer: ReturnType<typeof setInterval> | null = null;
  let pendingTick: Promise<void> | null = null;

  async function sampleOnce(): Promise<ResourceSample[]> {
    const rawOutput = await runDockerStats(spawnImpl);
    const samples: ResourceSample[] = [];
    const ts = new Date().toISOString();

    for (const line of rawOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: DockerStatRaw;
      try {
        parsed = JSON.parse(trimmed) as DockerStatRaw;
      } catch {
        continue;
      }

      const name = parsed.Name ?? '';
      if (!name.startsWith(filterPrefix)) continue;

      const [memUsageBytes, memLimitBytes] = parseMemUsage(parsed.MemUsage);
      samples.push({
        ts,
        container: name,
        taskId: deriveTaskId(name, filterPrefix),
        memUsageBytes,
        memLimitBytes,
        memPerc: parsePerc(parsed.MemPerc),
        cpuPerc: parsePerc(parsed.CPUPerc),
        netIO: parsed.NetIO ?? '',
        blockIO: parsed.BlockIO ?? '',
      });
    }

    return samples;
  }

  function runTick(): Promise<void> {
    return sampleOnce().then((samples) => {
      for (const sample of samples) {
        try {
          appendFileSync(opts.logPath, JSON.stringify(sample) + '\n', 'utf-8');
        } catch (err) {
          debugLog('resource-monitor:append', err);
        }
      }
    }).catch((err) => {
      debugLog('resource-monitor:tick', err);
    });
  }

  function start(): void {
    if (timer !== null) return;
    timer = setInterval(() => {
      pendingTick = runTick().finally(() => {
        pendingTick = null;
      });
    }, intervalMs);
  }

  async function stop(): Promise<void> {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (pendingTick !== null) {
      await pendingTick;
    }
  }

  return { start, stop, sampleOnce };
}
