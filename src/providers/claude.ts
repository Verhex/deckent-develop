import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelType } from '../core/types.js';
import { CLAUDE_MODELS } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions, ProviderAvailabilityDetail } from '../core/provider.js';
import { ProviderError, resolveBinaryPath, parseSemverFromOutput } from '../core/provider.js';
import {
  spawnWorker,
  killWorker,
  listWorkers,
  ensureSession,
  isSessionActive,
  cleanupPromptFile,
} from '../orchestra/tmux.js';
import { TASKS_DIR } from '../core/constants.js';
import { getActiveWorkerIds } from '../core/active-workers.js';
import {
  SubprocessSpawnBackend,
  CLAUDE_SUBPROCESS_CONFIG,
} from './subprocess.js';

// ─── Types ──────────────────────────────────────────────────────────

export type ClaudeBackend = 'tmux' | 'subprocess' | 'mcp';

export interface ClaudeAdapterOptions {
  /** Execution backend: 'tmux' (default), 'subprocess' (headless), 'mcp' (future) */
  claude_backend?: ClaudeBackend;
}

/**
 * Compact 3-state provider availability result.
 * Returned by `adapter.detect()` — simpler than {@link ProviderAvailabilityDetail}
 * and intended for callers that only care about binary + auth + overall readiness
 * (e.g. `deckent doctor --providers` output, `deckent chat` provider auto-detect).
 */
export interface ProviderDetectResult {
  /** Whether the CLI binary is installed and callable */
  binary: boolean;
  /** Parsed version string when available, e.g. "1.0.45" */
  version?: string;
  /** Whether auth credentials are configured (session/api_key/login) */
  auth: boolean;
  /**
   * Overall readiness:
   * - `true` — binary + auth both present (full availability)
   * - `'partial'` — binary present but auth missing (actionable hint state)
   * - `false` — binary not found (CLI missing)
   */
  ready: true | false | 'partial';
}

// ─── Constants ───────────────────────────────────────────────────────

const SUPPORTED_MODELS: readonly ModelType[] = [...CLAUDE_MODELS];

/**
 * Informative error message for MCP backend — includes sprint context,
 * alternatives, and roadmap reference so callers know what to do instead.
 */
const MCP_NOT_IMPLEMENTED_MESSAGE =
  'MCP backend is not yet implemented (deferred past Sprint 048). ' +
  "Alternatives: set claude_backend to 'tmux' (default) or 'subprocess'. " +
  'Roadmap: see DECKENT-MASTER-BLUEPRINT.md for planned MCP integration.';

// ─── ClaudeAdapter ───────────────────────────────────────────────────

/**
 * ClaudeAdapter — ProviderAdapter implementation backed by tmux + Claude CLI.
 *
 * Wraps tmux.ts functions (spawnWorker, killWorker, listWorkers, isSessionActive)
 * and exposes them through the ProviderAdapter interface.
 *
 * Supports three backends via `claude_backend` config:
 * - 'tmux' (default): uses tmux sessions for worker management
 * - 'subprocess': headless child_process.spawn via SubprocessSpawnBackend
 * - 'mcp': future — throws ProviderError if selected
 */
export class ClaudeAdapter implements ProviderAdapter {
  readonly name = 'claude-tmux';
  readonly supportedModels: readonly ModelType[] = SUPPORTED_MODELS;

  private readonly projectDir: string;
  private readonly backend: ClaudeBackend;
  private subprocessBackend: SubprocessSpawnBackend | null = null;

  constructor(projectDir: string, opts?: ClaudeAdapterOptions) {
    this.projectDir = projectDir;
    this.backend = opts?.claude_backend ?? 'tmux';

    if (this.backend === 'subprocess') {
      this.subprocessBackend = new SubprocessSpawnBackend(projectDir, {
        providerConfig: CLAUDE_SUBPROCESS_CONFIG,
      });
    }
  }

  /**
   * Get the active backend name.
   */
  getBackend(): ClaudeBackend {
    return this.backend;
  }

  /**
   * Spawn a worker using the configured backend.
   * Throws ProviderError if backend is 'mcp' (not yet implemented).
   */
  spawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts?: ProviderSpawnOptions,
  ): void {
    if (this.backend === 'mcp') {
      throw new ProviderError(MCP_NOT_IMPLEMENTED_MESSAGE, 'claude');
    }

    if (this.backend === 'subprocess' && this.subprocessBackend) {
      this.subprocessBackend.spawn(taskId, model, prompt, opts);
      return;
    }

    // tmux backend (default)
    const dir = opts?.projectDir ?? this.projectDir;
    ensureSession();
    spawnWorker(taskId, model, prompt, dir, {
      allowedTools: opts?.allowedTools,
      autoApprove: opts?.autoApprove,
    });
  }

  /**
   * Kill a running worker and clean up.
   */
  kill(taskId: string): void {
    if (this.backend === 'subprocess' && this.subprocessBackend) {
      this.subprocessBackend.kill(taskId);
      return;
    }

    // tmux backend (default)
    killWorker(taskId);
    this._cleanupOrphanedPromptFiles();
  }

  /**
   * Clean up orphaned `.prompt-*.txt` tmpfiles left behind by spawnWorker.
   * Called automatically after kill() to prevent file accumulation.
   *
   * Sprint 168 C0e (BUG-HH eradication): selective filter via
   * `getActiveWorkerIds()` — prompt files belonging to active workers are
   * PROTECTED and never deleted. Only orphan prompts (no live `.hb` referencing
   * their taskId) are removed.
   *
   * Filter pattern matches Docker spawn naming
   * `.prompt-{taskId}-{promptId}[-fix].txt` (spawn-backend-docker.ts:226-230).
   * Tmux backend uses random-hex filenames (no embedded taskId, see
   * tmux.ts:60 writePromptFile) — the selective filter will not match those,
   * so legacy tmux orphan prompts are still cleaned via the fall-through
   * branch. See ADR-048 Consequences (Negative) for cross-backend asymmetry
   * documentation.
   *
   * @param activeTaskIds Optional explicit list of active task IDs. When
   *   omitted, falls back to `getActiveWorkerIds(this.projectDir)` which
   *   reads `.tasks/*.hb` heartbeats.
   */
  private _cleanupOrphanedPromptFiles(activeTaskIds?: string[]): void {
    const tasksDir = join(this.projectDir, TASKS_DIR);
    if (!existsSync(tasksDir)) return;
    const active = activeTaskIds ?? getActiveWorkerIds(this.projectDir);
    try {
      const files = readdirSync(tasksDir);
      for (const file of files) {
        if (file.startsWith('.prompt-') && file.endsWith('.txt')) {
          // Selective filter: protect prompts whose filename embeds an active taskId.
          // Docker pattern: `.prompt-{taskId}-{promptId}[-fix].txt` → match via `-${id}-`.
          if (active.some(id => file.includes(`-${id}-`))) continue;
          cleanupPromptFile(join(tasksDir, file));
        }
      }
    } catch {
      // ignore — tasks dir may be inaccessible
    }
  }

  /**
   * List currently active worker task IDs.
   */
  listWorkers(): string[] {
    if (this.backend === 'subprocess' && this.subprocessBackend) {
      return this.subprocessBackend.listWorkers();
    }
    return listWorkers();
  }

  /**
   * Check whether this adapter is available in the current environment.
   * Returns false immediately for MCP backend (not yet implemented).
   * For tmux/subprocess: runs `claude --version` and checks exit code.
   */
  async isAvailable(): Promise<boolean> {
    if (this.backend === 'mcp') {
      return false;
    }

    try {
      const result = spawnSync('claude', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
        shell: process.platform === 'win32',
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  // ─── diagnoseAvailability() ────────────────────────────────────────

  /**
   * Three-layer probe: binary detection → version parsing → session check.
   * Claude CLI uses OAuth/session auth managed by the CLI itself — we treat
   * a working `claude --version` as session-OK (the CLI handles login state).
   * MCP backend always returns unavailable (not yet implemented).
   */
  async diagnoseAvailability(): Promise<ProviderAvailabilityDetail> {
    if (this.backend === 'mcp') {
      return {
        name: 'claude',
        binaryFound: false,
        versionStatus: 'missing',
        authMethod: 'none',
        authStatus: 'missing',
        available: false,
        partial: false,
        models: [...SUPPORTED_MODELS] as ModelType[],
        reason: 'MCP backend selected but not yet implemented',
        hints: ['Switch claude_backend to "tmux" or "subprocess"'],
      };
    }

    let binaryFound = false;
    let versionRaw: string | undefined;
    try {
      const result = spawnSync('claude', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
        shell: process.platform === 'win32',
      });
      if (result.status === 0 && result.stdout) {
        versionRaw = result.stdout.trim();
        binaryFound = true;
      }
    } catch {
      // spawn failure
    }
    const binaryPath = binaryFound ? resolveBinaryPath('claude') : undefined;
    const version = parseSemverFromOutput(versionRaw) ?? versionRaw;
    const versionStatus: ProviderAvailabilityDetail['versionStatus'] = !binaryFound
      ? 'missing'
      : version
        ? 'ok'
        : 'unknown';

    // Claude CLI manages OAuth/session internally — binary presence implies
    // a usable session-or-prompts-for-one flow. Caller should still run
    // `claude config get account` for stricter auth probing (doctor --check-auth).
    const available = binaryFound;
    const partial = false;
    const authMethod: ProviderAvailabilityDetail['authMethod'] = binaryFound ? 'session' : 'none';
    const authStatus: ProviderAvailabilityDetail['authStatus'] = binaryFound ? 'ok' : 'missing';

    let reason: string;
    const hints: string[] = [];
    if (!binaryFound) {
      reason = 'Claude CLI not found in PATH';
      hints.push('Install: npm i -g @anthropic-ai/claude-code');
    } else {
      reason = `Claude CLI ${version ?? 'installed'} — session auth managed by CLI`;
    }

    return {
      name: 'claude',
      binaryFound,
      binaryPath,
      version,
      versionStatus,
      authMethod,
      authStatus,
      available,
      partial,
      models: [...SUPPORTED_MODELS] as ModelType[],
      reason,
      hints,
    };
  }

  // ─── detect() ──────────────────────────────────────────────────────

  /**
   * Compact 3-state availability probe — wraps {@link diagnoseAvailability}
   * and projects the rich detail onto `{binary, version, auth, ready}`.
   *
   * Claude CLI manages OAuth/session internally so binary presence implies
   * `ready: true` (no separate `'partial'` state). MCP backend always
   * returns `ready: false`.
   */
  async detect(): Promise<ProviderDetectResult> {
    const detail = await this.diagnoseAvailability();
    const ready: true | false | 'partial' = detail.available
      ? true
      : detail.partial
        ? 'partial'
        : false;
    return {
      binary: detail.binaryFound,
      version: detail.version,
      auth: detail.authStatus === 'ok',
      ready,
    };
  }

  /**
   * Build the shell command string that Claude CLI would use.
   * Command format varies by backend:
   * - tmux: `claude -p - --model ${model} [opts] < ${promptPath}`
   * - subprocess: `claude -p "${prompt}" --dangerously-skip-permissions --model ${model}`
   */
  buildCommand(
    model: ModelType,
    promptPath: string,
    opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    if (this.backend === 'subprocess') {
      let cmd = `claude -p "${promptPath}" --dangerously-skip-permissions --model ${model}`;
      if (opts?.allowedTools) {
        cmd += ` --allowedTools '${opts.allowedTools}'`;
      }
      return cmd;
    }

    // tmux backend (default)
    let cmd = `claude -p - --model ${model}`;
    if (opts?.allowedTools) {
      cmd += ` --allowedTools '${opts.allowedTools}'`;
    }
    if (opts?.autoApprove) {
      cmd += ' --dangerously-skip-permissions';
    }
    cmd += ` < ${promptPath}`;
    return cmd;
  }

  /**
   * Check whether the tmux session is active.
   * Only meaningful for tmux backend.
   */
  isSessionActive(): boolean {
    if (this.backend === 'subprocess') {
      return true; // subprocess doesn't need tmux session
    }
    return isSessionActive();
  }

  /**
   * Unwrap Claude CLI `--output-format json` envelope.
   * Shape: `{type:"result", subtype:"success", result:"<inner-json-string>", usage:{...}}`
   * Returns inner string if recognised; otherwise raw unchanged.
   */
  parseAgentResponse(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) return raw;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        parsed !== null
        && typeof parsed === 'object'
        && (parsed as { type?: unknown }).type === 'result'
        && typeof (parsed as { result?: unknown }).result === 'string'
      ) {
        return (parsed as { result: string }).result;
      }
    } catch {
      // Not JSON envelope — fall through to raw
    }
    return raw;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Create a ClaudeAdapter instance for the given project directory.
 */
export function createClaudeAdapter(
  projectDir: string,
  opts?: ClaudeAdapterOptions,
): ClaudeAdapter {
  return new ClaudeAdapter(projectDir, opts);
}

// ─── Prompt Cache Wire (Sprint 196 — Task 196-003 / WP-5) ────────────
//
// Sprint 195 195-002-fix observed `cacheReadTokens: 85000` — a 9× cost save
// driven by Anthropic prompt caching kicking in incidentally on the static
// prompt boilerplate. This block exposes the cache surface as a designed
// capability rather than a side effect:
//
//   - {@link CACHE_CONTROL_EPHEMERAL} — the cache_control marker constant
//     callers attach to Anthropic API messages instead of hand-writing the
//     object shape.
//   - {@link parseCacheUsage} — reads cache_read/creation token counts out of
//     the Claude CLI `--output-format json` envelope so the orchestrator can
//     fill `tokenUsage.cacheReadTokens` from real measurements (paired with
//     Task 196-005's WP-4 orchestrator-side token fill).
//   - {@link attachCacheControlToMessages} — pure helper for API-mode wiring;
//     marks the system message (or first content block) as ephemeral-cached.
//
// We deliberately keep these as pure helpers (no SDK dependency, no spawn
// surface change) so the same module can be exercised by unit tests and
// imported by any consumer that ends up calling the Anthropic SDK directly.

/**
 * Anthropic prompt-cache marker.
 * Mark a system message or content block with this object to enable ephemeral
 * (5-minute) prompt caching.
 *
 * Example:
 * ```ts
 * { type: 'text', text: FROZEN_PROMPT, cache_control: CACHE_CONTROL_EPHEMERAL }
 * ```
 */
export const CACHE_CONTROL_EPHEMERAL = { type: 'ephemeral' } as const;

export interface CacheUsageInfo {
  /** Tokens read from prompt cache (a cache hit). 0 when no cache was used. */
  cacheReadTokens: number;
  /** Tokens written to the prompt cache on this call (cache creation). 0 when no creation. */
  cacheCreationTokens: number;
}

/**
 * Parse cache usage telemetry from a Claude CLI JSON envelope or Anthropic
 * SDK message response.
 *
 * Accepts:
 *   - Claude CLI `--output-format json` envelope:
 *     `{ type: "result", usage: { cache_read_input_tokens, cache_creation_input_tokens } }`
 *   - Raw Anthropic API message response shape:
 *     `{ usage: { cache_read_input_tokens, cache_creation_input_tokens } }`
 *   - String input → JSON-parsed first, then both shapes attempted.
 *
 * Returns `{ cacheReadTokens: 0, cacheCreationTokens: 0 }` for malformed input,
 * missing fields, or initial workers where caching has not yet engaged.
 */
export function parseCacheUsage(raw: unknown): CacheUsageInfo {
  let payload: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) {
      return { cacheReadTokens: 0, cacheCreationTokens: 0 };
    }
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return { cacheReadTokens: 0, cacheCreationTokens: 0 };
    }
  }
  if (payload === null || typeof payload !== 'object') {
    return { cacheReadTokens: 0, cacheCreationTokens: 0 };
  }
  const obj = payload as { usage?: unknown };
  const usage = obj.usage;
  if (usage === null || typeof usage !== 'object') {
    return { cacheReadTokens: 0, cacheCreationTokens: 0 };
  }
  const u = usage as Record<string, unknown>;
  const readVal = u['cache_read_input_tokens'];
  const createVal = u['cache_creation_input_tokens'];
  const cacheReadTokens = typeof readVal === 'number' && Number.isFinite(readVal) && readVal >= 0
    ? Math.floor(readVal)
    : 0;
  const cacheCreationTokens = typeof createVal === 'number' && Number.isFinite(createVal) && createVal >= 0
    ? Math.floor(createVal)
    : 0;
  return { cacheReadTokens, cacheCreationTokens };
}

/**
 * Minimal Anthropic message-shape we care about for cache control.
 * Mirrors the public SDK type without importing the SDK at runtime.
 */
export interface AnthropicMessageLike {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; cache_control?: unknown }>;
}

export interface AttachCacheControlOptions {
  /** Target index inside the content array to mark. Defaults to last block. */
  targetIndex?: number;
}

/**
 * Pure helper: mark the first system message (or the largest text block on
 * the first user message when no system role is present) with
 * `cache_control: { type: 'ephemeral' }`. Idempotent — re-applying produces
 * the same shape.
 *
 * Returns a new array; never mutates input.
 *
 * Sprint 196 196-003 (WP-5): wired by future API-mode adapters. Today the
 * Claude CLI subscription path uses prompt-content hashing for cache hits;
 * this helper is the on-ramp for direct-SDK usage where the caller controls
 * the messages array.
 */
export function attachCacheControlToMessages(
  messages: ReadonlyArray<AnthropicMessageLike>,
  opts: AttachCacheControlOptions = {},
): AnthropicMessageLike[] {
  if (messages.length === 0) return [];

  const result: AnthropicMessageLike[] = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : m.content.map((b) => ({ ...b })),
  }));

  const systemIdx = result.findIndex((m) => m.role === 'system');
  const targetMsgIdx = systemIdx >= 0 ? systemIdx : 0;
  const target = result[targetMsgIdx]!;

  // Normalize string content → content-block array so we can attach the marker.
  if (typeof target.content === 'string') {
    target.content = [{ type: 'text', text: target.content }];
  }

  const blocks = target.content;
  if (blocks.length === 0) return result;
  const idx = opts.targetIndex ?? blocks.length - 1;
  const block = blocks[idx];
  if (block) {
    block.cache_control = { type: CACHE_CONTROL_EPHEMERAL.type };
  }
  return result;
}
