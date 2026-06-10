// tests/cli/resources-command.test.ts
//
// Hermetic unit tests for `deckent resources` (Sprint 271 T-004).
// Tests cover: command registration, pure render functions, --json shape,
// docker-unavailable path, --log with log content.
// All I/O uses tmpdir; no real docker spawned.

// Mock createResourceMonitor so the action tests don't spawn docker processes.
vi.mock('../../src/orchestra/resource-monitor.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    createResourceMonitor: vi.fn().mockReturnValue({
      sampleOnce: vi.fn().mockResolvedValue([]),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  registerResources,
  renderSnapshotTable,
  renderLogSummary,
  renderConfigLine,
  type ResourcesRawConfig,
} from '../../src/cli/commands/resources.js';
import { createResourceMonitor } from '../../src/orchestra/resource-monitor.js';
import type { ResourceSample } from '../../src/orchestra/resource-monitor.js';
import { summarizeByTask, summarizeSprint } from '../../src/orchestra/resource-report.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function mkRoot(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-resources-test-'));
}

/** Capture stdout lines written by print() */
function captureOutput(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  return fn().then(() => {
    spy.mockRestore();
    return chunks.join('');
  }).catch((err) => {
    spy.mockRestore();
    throw err;
  });
}

async function runCli(args: string[], root?: string): Promise<string> {
  const origCwd = process.cwd();
  if (root) process.chdir(root);
  const program = new Command();
  program.exitOverride();
  registerResources(program);
  return captureOutput(() => program.parseAsync(['node', 'deckent', ...args])).finally(() => {
    if (root) process.chdir(origCwd);
  });
}

// ─── Sample data ─────────────────────────────────────────────────────────

const SAMPLE_A: ResourceSample = {
  ts: '2026-06-10T00:00:00.000Z',
  container: 'deckent-w-001',
  taskId: '001',
  memUsageBytes: 512 * 1024 * 1024,  // 512 MB
  memLimitBytes: 4 * 1024 * 1024 * 1024, // 4 GB
  memPerc: 12.5,
  cpuPerc: 5.3,
  netIO: '1MB / 2MB',
  blockIO: '0B / 0B',
};

const SAMPLE_B: ResourceSample = {
  ts: '2026-06-10T00:00:00.000Z',
  container: 'deckent-w-002',
  taskId: '002',
  memUsageBytes: 1024 * 1024 * 1024,  // 1 GB
  memLimitBytes: 4 * 1024 * 1024 * 1024,
  memPerc: 25.0,
  cpuPerc: 15.7,
  netIO: '5MB / 3MB',
  blockIO: '0B / 0B',
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('registerResources', () => {
  it('registers a "resources" command', () => {
    const program = new Command();
    registerResources(program);
    const names = program.commands.map(c => c.name());
    expect(names).toContain('resources');
  });

  it('command has a description', () => {
    const program = new Command();
    registerResources(program);
    const cmd = program.commands.find(c => c.name() === 'resources');
    expect(cmd?.description()).toBeTruthy();
  });
});

// ─── renderSnapshotTable ─────────────────────────────────────────────────

describe('renderSnapshotTable', () => {
  it('returns no_containers message for empty samples', () => {
    const result = renderSnapshotTable([], 'en');
    expect(result).toContain('No deckent worker containers running');
  });

  it('returns Turkish no_containers message for tr lang', () => {
    const result = renderSnapshotTable([], 'tr');
    expect(result).toContain('container');
  });

  it('renders container and task columns', () => {
    const result = renderSnapshotTable([SAMPLE_A], 'en');
    expect(result).toContain('deckent-w-001');
    expect(result).toContain('001');
  });

  it('renders memory usage and percentage', () => {
    const result = renderSnapshotTable([SAMPLE_A], 'en');
    expect(result).toContain('512.00 MB');
    expect(result).toContain('12.5%');
  });

  it('renders CPU percentage', () => {
    const result = renderSnapshotTable([SAMPLE_A], 'en');
    expect(result).toContain('5.3%');
  });

  it('renders multiple containers', () => {
    const result = renderSnapshotTable([SAMPLE_A, SAMPLE_B], 'en');
    expect(result).toContain('deckent-w-001');
    expect(result).toContain('deckent-w-002');
  });

  it('includes table headers', () => {
    const result = renderSnapshotTable([SAMPLE_A], 'en');
    expect(result).toContain('Container');
    expect(result).toContain('Task');
    expect(result).toContain('Mem Usage');
    expect(result).toContain('CPU%');
  });
});

// ─── renderLogSummary ─────────────────────────────────────────────────────

describe('renderLogSummary', () => {
  it('returns log_empty message for empty summaries', () => {
    const sprint = summarizeSprint([]);
    const result = renderLogSummary([], sprint, 'en');
    expect(result).toContain('Resource log is empty');
  });

  it('renders task summary row', () => {
    const summaries = summarizeByTask([SAMPLE_A, SAMPLE_B]);
    const sprint = summarizeSprint([SAMPLE_A, SAMPLE_B]);
    const result = renderLogSummary(summaries, sprint, 'en');
    expect(result).toContain('001');
    expect(result).toContain('002');
  });

  it('renders sprint peak line', () => {
    const summaries = summarizeByTask([SAMPLE_A, SAMPLE_B]);
    const sprint = summarizeSprint([SAMPLE_A, SAMPLE_B]);
    const result = renderLogSummary(summaries, sprint, 'en');
    expect(result).toContain('Sprint concurrent peak');
    expect(result).toContain('2 containers');
  });

  it('renders peak mem and cpu columns', () => {
    const summaries = summarizeByTask([SAMPLE_A]);
    const sprint = summarizeSprint([SAMPLE_A]);
    const result = renderLogSummary(summaries, sprint, 'en');
    expect(result).toContain('Peak Mem');
    expect(result).toContain('Peak CPU%');
  });
});

// ─── renderConfigLine ─────────────────────────────────────────────────────

describe('renderConfigLine', () => {
  it('uses defaults when config is empty', () => {
    const result = renderConfigLine({}, 'en');
    expect(result).toContain('4g');
    expect(result).toContain('6g');
    expect(result).toContain('max_workers=4');
  });

  it('uses config values when present', () => {
    const cfg: ResourcesRawConfig = {
      worker_memory_limit: '2g',
      worker_memory_swap: '3g',
      max_workers: 6,
    };
    const result = renderConfigLine(cfg, 'en');
    expect(result).toContain('2g');
    expect(result).toContain('3g');
    expect(result).toContain('max_workers=6');
  });

  it('computes correct RAM ceiling', () => {
    const cfg: ResourcesRawConfig = {
      worker_memory_limit: '2g',
      max_workers: 3,
    };
    const result = renderConfigLine(cfg, 'en');
    // 3 × 2g = 6g = 6.00 GB
    expect(result).toContain('6.00 GB');
  });
});

// ─── --json shape ────────────────────────────────────────────────────────

describe('deckent resources --json', () => {
  let root: string;

  beforeEach(() => {
    root = mkRoot();
    // Return two sample containers
    vi.mocked(createResourceMonitor).mockReturnValue({
      sampleOnce: vi.fn().mockResolvedValue([SAMPLE_A, SAMPLE_B]),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.mocked(createResourceMonitor).mockReturnValue({
      sampleOnce: vi.fn().mockResolvedValue([]),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('outputs valid JSON with samples and config keys', async () => {
    const output = await runCli(['resources', '--json'], root);
    const parsed = JSON.parse(output) as { samples: unknown[]; config: Record<string, unknown> };
    expect(Array.isArray(parsed.samples)).toBe(true);
    expect(parsed.samples).toHaveLength(2);
    expect(parsed.config).toHaveProperty('worker_memory_limit');
    expect(parsed.config).toHaveProperty('worker_memory_swap');
    expect(parsed.config).toHaveProperty('max_workers');
    expect(parsed.config).toHaveProperty('ram_ceiling_bytes');
  });
});

// ─── docker-unavailable path ──────────────────────────────────────────────

describe('deckent resources (docker unavailable)', () => {
  let root: string;

  beforeEach(() => {
    root = mkRoot();
    // Simulate docker unavailable: sampleOnce returns empty array
    vi.mocked(createResourceMonitor).mockReturnValue({
      sampleOnce: vi.fn().mockResolvedValue([]),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('shows no_containers message when docker returns empty', async () => {
    const output = await runCli(['resources'], root);
    expect(output).toContain('No deckent worker containers running');
  });

  it('shows config line even when no containers', async () => {
    const output = await runCli(['resources'], root);
    expect(output).toContain('Config:');
  });
});

// ─── --log mode ───────────────────────────────────────────────────────────

describe('deckent resources --log', () => {
  let root: string;

  beforeEach(() => {
    root = mkRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('shows log_not_found message when log file is missing', async () => {
    const output = await runCli(['resources', '--log', '/tmp/nonexistent-12345.jsonl'], root);
    expect(output).toContain('Resource log not found');
  });

  it('renders log summary table from JSONL file', async () => {
    const logDir = join(root, '.deckent');
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, 'resource-log.jsonl');
    writeFileSync(logPath, [
      JSON.stringify(SAMPLE_A),
      JSON.stringify(SAMPLE_B),
    ].join('\n') + '\n', 'utf-8');

    const output = await runCli(['resources', '--log', logPath], root);
    expect(output).toContain('Resource Log Summary');
    expect(output).toContain('001');
    expect(output).toContain('002');
  });

  it('renders --log --json with summaries and sprintSummary keys', async () => {
    const logDir = join(root, '.deckent');
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, 'resource-log.jsonl');
    writeFileSync(logPath, JSON.stringify(SAMPLE_A) + '\n', 'utf-8');

    const output = await runCli(['resources', '--log', logPath, '--json'], root);
    const parsed = JSON.parse(output) as { summaries: unknown[]; sprintSummary: unknown };
    expect(Array.isArray(parsed.summaries)).toBe(true);
    expect(parsed.sprintSummary).toBeDefined();
  });
});
