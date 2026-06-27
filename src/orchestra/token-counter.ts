// ═══ Token Counter ═══════════════════════════════════════════════════
// Sprint 196 Task 196-005 (WP-4): orchestrator-side token-usage fill.
//
// Workers can no longer be trusted to self-report accurate token counts —
// Sprint 195 195-002-fix observed a 5.6x discrepancy between worker
// `estimatedTokens: 3.9K` and actual `inputTokens: 22K`. This module owns
// the canonical extraction + merge logic so the orchestrator can override
// worker self-reports with measured values from the Claude CLI JSON
// envelope or the Anthropic SDK message response.
//
// Pure module: no side effects at function level, no SDK dependency, no
// spawn surface. The single side-effect helper {@link tryLoadCliLogTokens}
// reads from disk but tolerates missing files (returns null instead of
// throwing). All functions return null/undefined for malformed input
// rather than throwing — callers fall back to worker self-report.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS_DIR } from '../core/constants.js';
import type { ProviderName, TokenUsage } from '../core/task-types.js';
import type { ProviderAdapter } from '../core/provider.js';
import { readNativeUsage, type NativeUsageQuery } from '../providers/session-usage-store.js';

// ─── Internal helpers ───────────────────────────────────────────────

function coerceTokens(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function parseIfString(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function readUsageObject(payload: unknown): Record<string, unknown> | null {
  if (payload === null || typeof payload !== 'object') return null;
  const usage = (payload as { usage?: unknown }).usage;
  if (usage === null || typeof usage !== 'object') return null;
  return usage as Record<string, unknown>;
}

// ─── Public extractors ──────────────────────────────────────────────

/**
 * Parse the Claude CLI `--output-format json` envelope and return a
 * {@link TokenUsage} object. The envelope shape (per Claude CLI 1.x):
 *
 * ```json
 * {
 *   "type": "result",
 *   "subtype": "success",
 *   "result": "<inner-json-string>",
 *   "usage": {
 *     "input_tokens": 15420,
 *     "output_tokens": 3200,
 *     "cache_read_input_tokens": 89000,
 *     "cache_creation_input_tokens": 1024
 *   },
 *   "model": "claude-opus-4-7"
 * }
 * ```
 *
 * Returns `null` for malformed input, missing usage fields, or non-JSON
 * payloads. Callers fall back to worker self-report or heuristic
 * estimation. Provider is hard-coded to `'claude'` (the only CLI source
 * this extractor knows how to parse).
 *
 * @param raw — Claude CLI stdout string, the parsed envelope object, or
 *   any value (returns null on shape mismatch).
 */
export function extractTokenUsageFromClaudeCli(raw: unknown): TokenUsage | null {
  const payload = parseIfString(raw);
  if (payload === null && typeof raw === 'string') return null;
  const usage = readUsageObject(payload === null ? raw : payload);
  if (!usage) return null;

  const inputTokens = coerceTokens(usage['input_tokens']);
  const outputTokens = coerceTokens(usage['output_tokens']);
  if (inputTokens === null && outputTokens === null) return null;

  const cacheReadTokens = coerceTokens(usage['cache_read_input_tokens']) ?? 0;
  const modelRaw = (payload === null ? raw : payload) as { model?: unknown };
  const model = typeof modelRaw?.model === 'string' ? modelRaw.model : undefined;

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    cacheReadTokens,
    provider: 'claude',
    ...(model ? { model: model as TokenUsage['model'] } : {}),
  };
}

/**
 * Parse an Anthropic SDK `messages.create()` response and return a
 * {@link TokenUsage} object. SDK response shape:
 *
 * ```ts
 * {
 *   id: 'msg_...',
 *   model: 'claude-opus-4-7',
 *   usage: {
 *     input_tokens: 15420,
 *     output_tokens: 3200,
 *     cache_read_input_tokens: 89000,
 *     cache_creation_input_tokens: 1024,
 *   },
 *   ...
 * }
 * ```
 *
 * Returns `null` for malformed input. Provider hard-coded to `'claude'`.
 * Honors `response.model` when present (the SDK reports the exact model
 * that served the request, which may differ from the requested alias).
 */
export function extractTokenUsageFromAnthropicResponse(response: unknown): TokenUsage | null {
  if (response === null || typeof response !== 'object') return null;
  const usage = readUsageObject(response);
  if (!usage) return null;

  const inputTokens = coerceTokens(usage['input_tokens']);
  const outputTokens = coerceTokens(usage['output_tokens']);
  if (inputTokens === null && outputTokens === null) return null;

  const cacheReadTokens = coerceTokens(usage['cache_read_input_tokens']) ?? 0;
  const modelRaw = (response as { model?: unknown }).model;
  const model = typeof modelRaw === 'string' ? modelRaw : undefined;

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    cacheReadTokens,
    provider: 'claude',
    ...(model ? { model: model as TokenUsage['model'] } : {}),
  };
}

// ─── Merge ──────────────────────────────────────────────────────────

/**
 * Merge a worker-reported `TokenUsage` claim with an orchestrator-measured
 * value. Measured counts win — the worker self-report is preserved only
 * for fields the measurement does not provide (typically `provider` and
 * `model` when the CLI envelope omits them).
 *
 * Returns `undefined` when both inputs are falsy so existing heuristic
 * fallback logic in `result-collector.enrichResultTokenUsage` can still
 * fire. Returns the non-null input verbatim when the other is missing.
 */
export function mergeWithWorkerClaim(
  workerReported: TokenUsage | undefined,
  measured: TokenUsage | null,
): TokenUsage | undefined {
  if (!measured) return workerReported;
  if (!workerReported) return measured;

  return {
    inputTokens: measured.inputTokens,
    outputTokens: measured.outputTokens,
    cacheReadTokens: measured.cacheReadTokens ?? workerReported.cacheReadTokens ?? 0,
    provider: measured.provider ?? workerReported.provider,
    model: measured.model ?? workerReported.model,
  };
}

// ─── Disk side-effect helper ────────────────────────────────────────

/**
 * Attempt to load a measured `TokenUsage` from a side-channel log file
 * left by the spawn backend. Looks for `.tasks/task-{id}.cli-output.json`
 * first (preferred, written by spawn-backend-docker.ts on graceful exit),
 * then falls back to `.tasks/task-{id}.log` (stdout dump, may contain the
 * JSON envelope as the last line).
 *
 * Returns `null` when no file is found, the file is unparsable, or the
 * extractor cannot pull usage tokens out of the contents. Read-only,
 * isolated, safe to call on every result-collect cycle.
 */
/**
 * Provider-AGNOSTIC token capture: read the worker's saved output log and ask
 * the task's provider ADAPTER to extract usage from its own native format.
 *
 * Unlike {@link tryLoadCliLogTokens} (Claude-CLI-specific — `extractTokenUsageFromClaudeCli`),
 * this works for EVERY provider whose adapter implements `extractUsage`
 * (ollama / codex / gemini / openai-compatible / bedrock), closing the gap where
 * non-Claude workers always reported 0/0 tokens. The adapter is INJECTED (the
 * caller resolves it via providerRegistry) so this module needs no runtime
 * dependency on the provider layer (type-only import → no import cycle).
 *
 * Returns the legacy {@link TokenUsage} shape (input/output/cacheRead) or null
 * when the adapter reports nothing usable.
 */
export function tryExtractUsageViaAdapter(
  projectRoot: string,
  taskId: string,
  adapter: ProviderAdapter | undefined,
): TokenUsage | null {
  if (!adapter?.extractUsage) return null;
  const candidates = [
    join(projectRoot, TASKS_DIR, `task-${taskId}.cli-output.json`),
    join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    let content: string;
    try {
      content = readFileSync(path, 'utf-8');
    } catch {
      continue;
    }
    const usage = adapter.extractUsage(content);
    if (usage && ((usage.inputTokens ?? 0) > 0 || (usage.outputTokens ?? 0) > 0)) {
      return {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
      };
    }
  }
  return null;
}

export function tryLoadCliLogTokens(projectRoot: string, taskId: string): TokenUsage | null {
  const candidates = [
    join(projectRoot, TASKS_DIR, `task-${taskId}.cli-output.json`),
    join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    let content: string;
    try {
      content = readFileSync(path, 'utf-8');
    } catch {
      continue;
    }
    const direct = extractTokenUsageFromClaudeCli(content);
    if (direct) return direct;

    // Logs may contain mixed output: try the last JSON-looking line.
    const lines = content.split('\n').reverse();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      const parsed = extractTokenUsageFromClaudeCli(trimmed);
      if (parsed) return parsed;
    }
  }
  return null;
}

// ─── Provenance-tagged resolver ─────────────────────────────────────
// Sprint 334 Task 334-001 (P0 TOKEN-REAL-CAPTURE).

/**
 * Resolve the most authoritative {@link TokenUsage} for a worker and tag its
 * provenance via {@link TokenUsage.source}. Resolution order (most → least real):
 *
 *   1. **session-store** — the provider's NATIVE per-session usage
 *      ({@link readNativeUsage}). The ONLY source that carries real
 *      `cacheCreationTokens` (the limit-dominant cost the heuristic missed
 *      entirely). Returned verbatim — it already self-tags `source:
 *      'session-store'`.
 *   2. **envelope** — the Claude CLI `--output-format json` side-channel
 *      ({@link tryLoadCliLogTokens}). Tagged `source: 'envelope'`.
 *   3. **estimate** — the caller's heuristic fallback, passed in. The heuristic
 *      (`result-collector.estimateTokenUsage`) is injected rather than imported
 *      so this module stays pure and free of an import cycle (result-collector
 *      imports this module). Tagged `source: 'estimate'` — an honest self-label,
 *      NOT a measurement.
 *
 * `fallbackEstimate` is returned (source-tagged) only when no real source
 * exists, so the estimate path stays byte-equivalent to today EXCEPT the new
 * honest `source` tag. Pure: the only disk reads are the tolerant, read-only
 * helpers above.
 */
export function resolveTokenUsage(
  provider: ProviderName,
  query: NativeUsageQuery,
  fallbackEstimate: TokenUsage,
): TokenUsage {
  const native = readNativeUsage(provider, query);
  if (native) return native; // already source: 'session-store'

  const envelope = tryLoadCliLogTokens(query.projectRoot, query.taskId);
  if (envelope) return { ...envelope, source: 'envelope' };

  return { ...fallbackEstimate, source: 'estimate' };
}
