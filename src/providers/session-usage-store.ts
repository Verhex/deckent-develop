// ═══ Session Usage Store ═════════════════════════════════════════════════════
// Sprint 334 Task 334-001 (P0 TOKEN-REAL-CAPTURE): read a provider's NATIVE
// per-session usage store and return the REAL summed token usage for a worker's
// session — the ground truth the heuristic estimator only approximated.
//
// Why this exists: `result-collector.estimateTokenUsage` synthesizes usage from
// line counts (cacheRead = input×4, output = linesAdded×15, cacheCreation =
// undefined). Across 61 sprint results that heuristic matched those exact ratios
// AND missed `cache_creation_input_tokens` 61/61 — and cacheCreation is the
// limit-dominant cost. The REAL per-turn usage lives in the provider's session
// store; for `claude` that is the Claude Code transcript jsonl under
// `~/.claude/projects/{slugified-cwd}/*.jsonl`, where each turn carries
// `message.usage{input_tokens, output_tokens, cache_read_input_tokens,
// cache_creation_input_tokens}`.
//
// Design contracts:
//   - PURE + side-effect-isolated: all disk access is read-only and tolerant —
//     a missing dir/file/corrupt line yields `null`/skip, never throws.
//   - INJECTABLE sessionRoot: tests ALWAYS pass a tmpdir sessionRoot, so the real
//     `~/.claude` is NEVER read in tests.
//   - PROVIDER SEAM (Law #2): `codex`/`gemini` return `null` with a documented
//     TODO(phase2) — their native stores plug in here later, same signature.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderName, TokenUsage } from '../core/task-types.js';

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * Spawn-time correlation window (epoch ms). `startMs` is the spawn lower bound;
 * an absent `endMs` means no upper bound (the newest session at/after `startMs`).
 */
export interface SpawnWindow {
  startMs: number;
  endMs?: number;
}

/**
 * Query for {@link readNativeUsage}. Every path seam is injectable so hermetic
 * tests can run entirely against a tmpdir.
 */
export interface NativeUsageQuery {
  /** Absolute project root (the worker's cwd) — used to derive the default sessionRoot slug. */
  projectRoot: string;
  /** Task id (`NNN-NNN`) — reserved for future per-task correlation; not required for claude. */
  taskId: string;
  /**
   * Exact session id (the jsonl basename without extension) when it was captured
   * from the `--output-format json` envelope at spawn. Most precise match.
   */
  sessionId?: string;
  /**
   * Spawn-time window used to correlate the newest matching jsonl when `sessionId`
   * is absent (newest file whose mtime falls inside the window).
   */
  spawnWindow?: SpawnWindow;
  /**
   * Override the directory holding the provider's session jsonl files. Defaults to
   * the slugified-cwd path under `~/.claude/projects`. ALWAYS set this in tests so
   * the real `~/.claude` is never touched.
   */
  sessionRoot?: string;
}

// ─── Slug ────────────────────────────────────────────────────────────────────

/**
 * Claude Code stores each project's transcripts under
 * `~/.claude/projects/{slug}` where `slug` is the absolute cwd with every
 * non-alphanumeric char replaced by `-` (e.g. `/workspace` → `-workspace`).
 */
export function slugifyProjectPath(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9]/g, '-');
}

function defaultClaudeSessionRoot(projectRoot: string): string {
  return join(homedir(), '.claude', 'projects', slugifyProjectPath(projectRoot));
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Non-negative finite number or 0 — usage fields are token counts. */
function nonNeg(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

interface SummedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  turns: number;
}

/**
 * SUM every turn's `message.usage` in a single session jsonl file into the 4
 * token fields. Returns `null` when the file is unreadable or carries no usage.
 * Tolerant: corrupt/usage-less lines are skipped, never thrown.
 */
function sumSessionUsage(filePath: string): SummedUsage | null {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let turns = 0;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Fast pre-filter — avoid JSON.parse on irrelevant lines.
    if (!trimmed || !trimmed.includes('"usage"')) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;

    const message = (parsed as Record<string, unknown>)['message'];
    if (!message || typeof message !== 'object') continue;
    const usage = (message as Record<string, unknown>)['usage'];
    if (!usage || typeof usage !== 'object') continue;

    const u = usage as Record<string, unknown>;
    inputTokens += nonNeg(u['input_tokens']);
    outputTokens += nonNeg(u['output_tokens']);
    cacheReadTokens += nonNeg(u['cache_read_input_tokens']);
    cacheCreationTokens += nonNeg(u['cache_creation_input_tokens']);
    turns++;
  }

  return turns > 0
    ? { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, turns }
    : null;
}

/**
 * Resolve which session jsonl belongs to this worker:
 *   1. exact `{sessionId}.jsonl` when captured from the spawn envelope, else
 *   2. the newest `*.jsonl` whose mtime falls inside `spawnWindow`, else
 *   3. the newest `*.jsonl` overall (cwd is already implied by sessionRoot).
 * Returns `null` when the directory is absent/empty.
 */
function resolveSessionFile(query: NativeUsageQuery, sessionRoot: string): string | null {
  if (query.sessionId) {
    const direct = join(sessionRoot, `${query.sessionId}.jsonl`);
    try {
      if (statSync(direct).isFile()) return direct;
    } catch {
      // Fall through to window/newest correlation.
    }
  }

  let entries: string[];
  try {
    entries = readdirSync(sessionRoot).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;

  const window = query.spawnWindow;
  // An absent endMs means "no upper bound" — the window's purpose is the spawn
  // LOWER bound (don't pick a session older than this spawn). Capping the upper
  // edge at read-time "now" would wrongly exclude a just-written session whose
  // filesystem mtime is sub-millisecond ahead of the wall clock.
  const endMs = window?.endMs ?? Infinity;

  let best: { path: string; mtimeMs: number } | null = null;
  for (const name of entries) {
    const path = join(sessionRoot, name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch {
      continue;
    }
    if (window && (mtimeMs < window.startMs || mtimeMs > endMs)) continue;
    if (!best || mtimeMs > best.mtimeMs) best = { path, mtimeMs };
  }
  return best ? best.path : null;
}

// ─── Public reader ───────────────────────────────────────────────────────────

/**
 * Read the REAL summed token usage for a worker's session from the provider's
 * NATIVE per-session store, or `null` when no real source exists.
 *
 * For `provider === 'claude'`: resolve the session jsonl under `sessionRoot`
 * (default = slugified-cwd under `~/.claude/projects`, override-able for tests),
 * SUM all turns' `message.usage` into the 4 fields, and tag `source:
 * 'session-store'`. This is the ONLY source that carries real
 * `cacheCreationTokens`.
 *
 * For `codex`/`gemini`: returns `null` — TODO(phase2) seam (their native usage
 * stores plug in here later behind the same signature; Law #2). Returning `null`
 * lets the caller fall back honestly to the heuristic estimate.
 */
export function readNativeUsage(
  provider: ProviderName,
  query: NativeUsageQuery,
): TokenUsage | null {
  if (provider !== 'claude') {
    // TODO(phase2): codex → its `~/.codex` session logs, gemini → its transcript
    // store. Until those readers land, return null honestly so the caller falls
    // back to the heuristic estimate (provider seam — Yasa #2).
    return null;
  }

  const sessionRoot = query.sessionRoot ?? defaultClaudeSessionRoot(query.projectRoot);
  const file = resolveSessionFile(query, sessionRoot);
  if (!file) return null;

  const summed = sumSessionUsage(file);
  if (!summed) return null;

  return {
    inputTokens: summed.inputTokens,
    outputTokens: summed.outputTokens,
    cacheReadTokens: summed.cacheReadTokens,
    cacheCreationTokens: summed.cacheCreationTokens,
    provider: 'claude',
    source: 'session-store',
  };
}
