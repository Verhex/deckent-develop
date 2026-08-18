// ─── deckent resources CLI Command (Sprint 271 T-004) ─────────────────────
// ADR-012: register<Name>(program) pattern
// Shows live docker worker resource snapshot (default) or analyzes a JSONL
// resource log (--log). All user-facing strings via getMessage (en+tr).
// ADR-010: no new runtime dependencies — only node:fs, node:path.

import type { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createResourceMonitor, type ResourceSample } from '../../orchestra/resource-monitor.js';
import {
  parseResourceLog,
  summarizeByTask,
  summarizeSprint,
  formatBytes,
  type TaskResourceSummary,
  type SprintResourceSummary,
} from '../../orchestra/resource-report.js';
import {
  DEFAULT_WORKER_MEMORY_LIMIT,
  DEFAULT_WORKER_MEMORY_SWAP,
  parseMemoryString,
} from '../../orchestra/spawn-backend-docker.js';
import { print } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { PROJECT_CONFIG_PATH, RESOURCE_LOG_FILE } from '../../core/constants.js';

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_LOG_PATH = RESOURCE_LOG_FILE;
const DEFAULT_MAX_WORKERS = 4;

// ─── Config ───────────────────────────────────────────────────────────────

/** Raw shape of fields we need from .deckent/config.json */
export interface ResourcesRawConfig {
  worker_memory_limit?: string;
  worker_memory_swap?: string;
  max_workers?: number | 'auto' | string;
  resource_monitor?: { enabled?: boolean; log_path?: string };
}

export function loadResourcesRawConfig(root: string): ResourcesRawConfig {
  try {
    const configPath = join(root, PROJECT_CONFIG_PATH);
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8')) as ResourcesRawConfig;
    }
  } catch { /* fallback to empty */ }
  return {};
}

// ─── Pure render functions (exported for testing) ─────────────────────────

/**
 * Render a table of live ResourceSample entries.
 * Returns the 'no containers' message when samples is empty.
 */
export function renderSnapshotTable(samples: ResourceSample[], lang: string): string {
  if (samples.length === 0) {
    return getMessage('resources.no_containers', lang);
  }

  const h = {
    container: getMessage('resources.table_header_container', lang),
    task:      getMessage('resources.table_header_task', lang),
    memUsage:  getMessage('resources.table_header_mem_usage', lang),
    memLimit:  getMessage('resources.table_header_mem_limit', lang),
    memPct:    getMessage('resources.table_header_mem_pct', lang),
    cpuPct:    getMessage('resources.table_header_cpu_pct', lang),
  };

  const cW  = Math.max(h.container.length, ...samples.map(s => s.container.length));
  const tW  = Math.max(h.task.length, ...samples.map(s => s.taskId.length));
  const muW = Math.max(h.memUsage.length, 10);
  const mlW = Math.max(h.memLimit.length, 10);
  const mpW = Math.max(h.memPct.length, 6);
  const cpW = Math.max(h.cpuPct.length, 6);

  const row = (c: string, t: string, mu: string, ml: string, mp: string, cp: string): string =>
    `  ${c.padEnd(cW)}  ${t.padEnd(tW)}  ${mu.padEnd(muW)}  ${ml.padEnd(mlW)}  ${mp.padStart(mpW)}  ${cp.padStart(cpW)}`;

  const lines: string[] = [
    row(h.container, h.task, h.memUsage, h.memLimit, h.memPct, h.cpuPct),
    row('─'.repeat(cW), '─'.repeat(tW), '─'.repeat(muW), '─'.repeat(mlW), '─'.repeat(mpW), '─'.repeat(cpW)),
    ...samples.map(s => row(
      s.container,
      s.taskId,
      formatBytes(s.memUsageBytes),
      formatBytes(s.memLimitBytes),
      `${s.memPerc.toFixed(1)}%`,
      `${s.cpuPerc.toFixed(1)}%`,
    )),
  ];

  return lines.join('\n');
}

/**
 * Render per-task peak/avg summary and sprint concurrent peak.
 * Returns the 'log empty' message when summaries is empty.
 */
export function renderLogSummary(
  summaries: TaskResourceSummary[],
  sprint: SprintResourceSummary,
  lang: string,
): string {
  if (summaries.length === 0) {
    return getMessage('resources.log_empty', lang);
  }

  const h = {
    task:     getMessage('resources.log_header_task', lang),
    peakMem:  getMessage('resources.log_header_peak_mem', lang),
    avgMem:   getMessage('resources.log_header_avg_mem', lang),
    peakCpu:  getMessage('resources.log_header_peak_cpu', lang),
    duration: getMessage('resources.log_header_duration', lang),
  };

  const tW  = Math.max(h.task.length, ...summaries.map(s => s.taskId.length));
  const pmW = Math.max(h.peakMem.length, 10);
  const amW = Math.max(h.avgMem.length, 10);
  const pcW = Math.max(h.peakCpu.length, 7);
  const dW  = Math.max(h.duration.length, 8);

  const row = (t: string, pm: string, am: string, pc: string, d: string): string =>
    `  ${t.padEnd(tW)}  ${pm.padEnd(pmW)}  ${am.padEnd(amW)}  ${pc.padStart(pcW)}  ${d.padStart(dW)}`;

  const lines: string[] = [
    row(h.task, h.peakMem, h.avgMem, h.peakCpu, h.duration),
    row('─'.repeat(tW), '─'.repeat(pmW), '─'.repeat(amW), '─'.repeat(pcW), '─'.repeat(dW)),
    ...summaries.map(s => row(
      s.taskId,
      formatBytes(s.peakMemBytes),
      formatBytes(s.avgMemBytes),
      `${s.peakCpuPerc.toFixed(1)}%`,
      `${(s.durationMs / 1000).toFixed(1)}s`,
    )),
    '',
    getMessage('resources.sprint_peak', lang, {
      peak: formatBytes(sprint.peakConcurrentMemBytes),
      containers: String(sprint.totalContainers),
    }),
  ];

  return lines.join('\n');
}

/**
 * Render the config summary line: memory_limit/swap, max_workers, RAM ceiling.
 */
export function renderConfigLine(cfg: ResourcesRawConfig, lang: string): string {
  const memLimit  = cfg.worker_memory_limit ?? DEFAULT_WORKER_MEMORY_LIMIT;
  const memSwap   = cfg.worker_memory_swap ?? DEFAULT_WORKER_MEMORY_SWAP;
  const maxWorkers = typeof cfg.max_workers === 'number' ? cfg.max_workers : DEFAULT_MAX_WORKERS;
  const limitBytes = parseMemoryString(memLimit) ?? 0;
  const ceiling = formatBytes(limitBytes * maxWorkers);

  return getMessage('resources.config_line', lang, {
    limit: memLimit,
    swap: memSwap,
    workers: String(maxWorkers),
    ceiling,
  });
}

// ─── Command Registration ─────────────────────────────────────────────────

export function registerResources(program: Command): void {
  program
    .command('resources')
    .description(getMessage('cli.resources.desc', getLanguage(undefined)))
    .option('--log [path]', 'Show resource log summary (defaults to config log_path or .deckent/settings/resource-log.jsonl)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { log?: string | boolean; json?: boolean }) => {
      const root = process.cwd();
      const lang = getLangFromConfig(root);
      const cfg  = loadResourcesRawConfig(root);
      /** `--json` keeps stdout to one document; notices belong on stderr. */
      const notice = (line: string): void => {
        if (opts.json) process.stderr.write(`${line}\n`);
        else print(line);
      };

      // ── --log mode ─────────────────────────────────────────────────────
      if (opts.log !== undefined) {
        const rawPath = typeof opts.log === 'string'
          ? opts.log
          : (cfg.resource_monitor?.log_path ?? DEFAULT_LOG_PATH);
        // Resolve relative to project root
        const logPath = rawPath.startsWith('/') ? rawPath : join(root, rawPath);

        if (!existsSync(logPath)) {
          notice(getMessage('resources.log_not_found', lang, { path: logPath }));
          return;
        }

        let content: string;
        try {
          content = readFileSync(logPath, 'utf-8');
        } catch {
          notice(getMessage('resources.log_not_found', lang, { path: logPath }));
          return;
        }

        const samples   = parseResourceLog(content);
        const summaries = summarizeByTask(samples);
        const sprintSum = summarizeSprint(samples);

        if (opts.json) {
          print(JSON.stringify({ summaries, sprintSummary: sprintSum }, null, 2));
          return;
        }

        print(`\n  ${getMessage('resources.log_title', lang)}\n`);
        print(renderLogSummary(summaries, sprintSum, lang));
        print('');
        return;
      }

      // ── Live snapshot mode ──────────────────────────────────────────────
      const monitor = createResourceMonitor({
        logPath: join(root, DEFAULT_LOG_PATH),
      });

      let samples: ResourceSample[];
      try {
        samples = await monitor.sampleOnce();
      } catch {
        // sampleOnce does not normally throw, but guard anyway. Under --json the
        // notice goes to stderr and the empty snapshot still reaches stdout as one
        // document (same shape as a successful, sample-less snapshot).
        notice(getMessage('resources.docker_unavailable', lang));
        if (!opts.json) return;
        samples = [];
      }

      if (opts.json) {
        const memLimit   = cfg.worker_memory_limit ?? DEFAULT_WORKER_MEMORY_LIMIT;
        const maxWorkers = typeof cfg.max_workers === 'number' ? cfg.max_workers : DEFAULT_MAX_WORKERS;
        const limitBytes = parseMemoryString(memLimit) ?? 0;
        print(JSON.stringify({
          samples,
          config: {
            worker_memory_limit: memLimit,
            worker_memory_swap:  cfg.worker_memory_swap ?? DEFAULT_WORKER_MEMORY_SWAP,
            max_workers: maxWorkers,
            ram_ceiling_bytes: limitBytes * maxWorkers,
          },
        }, null, 2));
        return;
      }

      print(`\n  ${getMessage('resources.snapshot_title', lang)}\n`);
      if (samples.length === 0) {
        print(getMessage('resources.no_containers', lang));
      } else {
        print(renderSnapshotTable(samples, lang));
      }
      print('');
      print(renderConfigLine(cfg, lang));
      print('');
    });
}
