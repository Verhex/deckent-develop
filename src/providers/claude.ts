import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelType } from '../core/types.js';
import { modelRegistry } from '../core/model-registry.js';
import { PROVIDER_PACKAGES } from '../core/provider-packages.js';
import type { ProviderAdapter, ProviderSpawnOptions, ProviderAvailabilityDetail } from '../core/provider.js';
import { ProviderError, resolveBinaryPath, parseSemverFromOutput } from '../core/provider.js';
import {
  spawnWorker,
  killWorker,
  listWorkers,
  ensureSession,
  isSessionActive,
  archiveOrphanPromptFile,
} from '../orchestra/tmux.js';
import { TASKS_DIR } from '../core/constants.js';
import { getActiveWorkerIds } from '../core/active-workers.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';
import {
  SubprocessSpawnBackend,
  CLAUDE_SUBPROCESS_CONFIG,
} from './subprocess.js';
import { normalizeUsage, type TokenUsage } from '../core/token-usage.js';
import {
  assertCanonicalModelApiId,
  type ReachabilityOutcome,
  type ReachabilityProbeObservation,
} from '../core/provider-truth.js';

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

/**
 * Live registry lookup for Claude-provider models.
 *
 * Sprint 230 Task 230-002: replaced the static `CLAUDE_MODELS` snapshot so
 * models added at runtime via `bootstrapFromCatalog()` (models.dev) flow
 * through to `supportedModels` + `diagnoseAvailability().models` without
 * a process restart.
 */
function getSupportedClaudeModels(): readonly ModelType[] {
  return modelRegistry.getByProvider('claude').map(m => m.id) as readonly ModelType[];
}

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
  /** Live registry view — recomputed on every access so models.dev additions surface immediately. */
  get supportedModels(): readonly ModelType[] {
    return getSupportedClaudeModels();
  }

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
      reasoningEffort: opts?.reasoningEffort,
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
   * Called automatically after kill() to keep `.tasks/` free of accumulated
   * prompt files.
   *
   * F0.3 (training-trace preservation): orphan prompts are ARCHIVED (moved to
   * `.tasks/archive/_orphaned/`), NOT deleted — the (prompt → result) pair is the
   * training-trace unit, and unlinking the prompt here (before the sprint-end
   * archivePromptFiles() runs) previously destroyed the prompt half systematically.
   * Archiving also makes the selective-filter below fail SAFE: if a still-running
   * worker's prompt is misclassified as orphan (stale `.hb`), it is preserved, not lost.
   *
   * Sprint 168 C0e (BUG-HH eradication): selective filter via
   * `getActiveWorkerIds()` — prompt files belonging to active workers are
   * PROTECTED and never touched. Only orphan prompts (no live `.hb` referencing
   * their taskId) are archived.
   *
   * Filter pattern matches Docker spawn naming
   * `.prompt-{taskId}-{promptId}[-fix].txt` (spawn-backend-docker.ts:226-230).
   * Sprint 170 P0-3 closed the tmux/Docker asymmetry: tmux worker prompts now
   * embed taskId the same way (`.prompt-{taskId}-{hash}.txt`, see tmux.ts
   * writePromptFile), so this selective filter protects them too. Only the
   * Auditor prompt (spawned without a taskId, tmux.ts writePromptFile(dir,
   * 'auditor')) keeps the legacy hex-only name and is cleaned via the
   * fall-through branch. See ADR-048 Consequences (Negative) for the
   * cross-backend asymmetry history.
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
          archiveOrphanPromptFile(join(tasksDir, file), tasksDir);
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
        models: [...getSupportedClaudeModels()] as ModelType[],
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
      hints.push(`Install: npm i -g ${PROVIDER_PACKAGES.claude.npmPkg}`);
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
      models: [...getSupportedClaudeModels()] as ModelType[],
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
    opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove' | 'reasoningEffort' | 'excludeDynamicPromptSections'>,
  ): string {
    // Sprint 237: pass the real model name (apiId, e.g. claude-opus-4-8) to the
    // CLI, NOT the short alias ('opus') — so the worker runs the EXACT current
    // version (no 4-6/4-8 confusion) and logs show it. apiId is live from
    // models.dev via bootstrapFromCatalog (parametric, no hardcode).
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    // F1-RE: native reasoning-effort flag (`--effort low|medium|high|xhigh|max`),
    // opt-in + validated against the claude effort vocabulary. Distinct from
    // task-effort (work size). undefined → CLI keeps its own default (no flag).
    const effort = resolveReasoningEffort('claude', opts?.reasoningEffort);
    if (this.backend === 'subprocess') {
      let cmd = `claude -p "${promptPath}" --dangerously-skip-permissions --model ${apiId}`;
      if (opts?.allowedTools) {
        cmd += ` --allowedTools '${opts.allowedTools}'`;
      }
      if (effort) {
        cmd += ` --effort ${effort}`;
      }
      // F3.1: prefix-stable system prompt (per-machine sections → first user message).
      if (opts?.excludeDynamicPromptSections) {
        cmd += ' --exclude-dynamic-system-prompt-sections';
      }
      return cmd;
    }

    // tmux backend (default)
    let cmd = `claude -p - --model ${apiId}`;
    if (opts?.allowedTools) {
      cmd += ` --allowedTools '${opts.allowedTools}'`;
    }
    if (opts?.autoApprove) {
      cmd += ' --dangerously-skip-permissions';
    }
    if (effort) {
      cmd += ` --effort ${effort}`;
    }
    // F3.1: prefix-stable system prompt (per-machine sections → first user message).
    if (opts?.excludeDynamicPromptSections) {
      cmd += ' --exclude-dynamic-system-prompt-sections';
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

  // ─── extractUsage() ────────────────────────────────────────────────

  /**
   * Extract REAL per-run token usage from Claude CLI `--output-format json`
   * stdout (capture, not re-count) — the Worker Output Contract Class-A source.
   *
   * `CLAUDE_SUBPROCESS_CONFIG.usageEmitArgs` makes the worker emit the envelope
   * into `.tasks/task-{id}.log`:
   *   `{ type:"result", usage:{ input_tokens, output_tokens,
   *      cache_read_input_tokens, cache_creation_input_tokens } }`
   * (proof-of-function, Sprint 328: the agent tool-loop — and its `.result`
   * write — is unaffected by json output; only stdout serialization changes).
   *
   * The worker log fd captures BOTH stdout and stderr, so the envelope may be
   * preceded by other lines — we scan every parseable JSON payload (whole string
   * + each line) and keep the last one carrying usage (a single envelope in
   * practice; last-wins is idempotent — mirrors codex.extractUsage). Anthropic's
   * native field names are mapped onto the provider-agnostic {@link TokenUsage}
   * via {@link normalizeUsage}; `cache_creation_input_tokens` maps to BOTH
   * `cacheCreationTokens` and `cacheWriteTokens` (the cross-provider cache-write
   * name, per the token-usage.ts provider matrix).
   *
   * Returns `null` when no usage is present — the orchestrator then falls back to
   * tokenizer estimation (`source: 'tokenizer-fallback'`).
   */
  extractUsage(rawOutput: string): TokenUsage | null {
    if (typeof rawOutput !== 'string') return null;
    const trimmed = rawOutput.trim();
    if (trimmed.length === 0) return null;

    // Collect every parseable JSON payload: the whole string (single envelope,
    // possibly pretty-printed) plus each JSON-looking line (mixed stdout+stderr).
    const candidates: unknown[] = [];
    const whole = tryParseJson(trimmed);
    if (whole !== undefined) candidates.push(whole);
    for (const line of rawOutput.split(/\r?\n/)) {
      const t = line.trim();
      if (t.length < 2 || t[0] !== '{') continue;
      const parsed = tryParseJson(t);
      if (parsed !== undefined) candidates.push(parsed);
    }

    let found: TokenUsage | null = null;
    for (const candidate of candidates) {
      const usage = claudeUsageFromEnvelope(candidate);
      if (usage) found = usage; // last recognizable usage wins
    }
    return found;
  }
}

// ─── Token-usage parsing helpers ──────────────────────────────────────

/** Parse JSON, returning `undefined` (never throwing) on malformed input. */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unwrapClaudeEvent(candidate: unknown): Record<string, unknown> | null {
  const record = asRecord(candidate);
  if (!record) return null;
  const directType = record.type;
  if (directType === 'system' || directType === 'assistant' || directType === 'result') {
    return record;
  }
  const content = asRecord(record.content);
  if (!content) return null;
  const contentType = content.type;
  return contentType === 'system' || contentType === 'assistant' || contentType === 'result'
    ? content
    : null;
}

function collectClaudeEvents(rawOutput: string): Record<string, unknown>[] {
  const trimmed = rawOutput.trim();
  if (trimmed.length === 0) return [];

  const whole = tryParseJson(trimmed);
  const candidates: unknown[] = whole === undefined
    ? rawOutput.split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => line.startsWith('{'))
      .map(line => tryParseJson(line))
      .filter((value): value is unknown => value !== undefined)
    : Array.isArray(whole) ? whole : [whole];

  return candidates
    .map(unwrapClaudeEvent)
    .filter((event): event is Record<string, unknown> => event !== null);
}

function singleCanonicalValue(values: readonly unknown[]): string | null {
  const strings = values.filter((value): value is string => (
    typeof value === 'string' && value.length > 0
  ));
  const unique = [...new Set(strings)];
  if (unique.length !== 1) return null;
  const value = unique[0];
  if (value === undefined) return null;
  try {
    assertCanonicalModelApiId(value);
    return value;
  } catch {
    return null;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function claudeFailureOutcome(result: Record<string, unknown>): ReachabilityOutcome {
  const status = result.api_error_status;
  if (status === 401 || status === 403) return 'auth-rejected';
  if (status === 429) return 'rate-limited';

  const subtype = typeof result.subtype === 'string' ? result.subtype.toLowerCase() : '';
  if (subtype.includes('rate') && subtype.includes('limit')) return 'rate-limited';
  if (subtype.includes('auth')) return 'auth-rejected';
  if (subtype.includes('timeout')) return 'timeout';
  return result.is_error === true ? 'transport-error' : 'invalid-response';
}

/**
 * Convert Claude CLI JSON/JSONL output into a sanitized reachability observation.
 *
 * This parser deliberately has no requested-model argument: called-model truth
 * comes only from agreeing provider-native init + assistant envelopes. The
 * returned references are hashes; prompt/output/session/account/request-id
 * values never cross this boundary.
 */
export function parseClaudeReachabilityObservation(
  rawOutput: string,
): ReachabilityProbeObservation {
  const evidenceRef = `provider-log:${sha256(typeof rawOutput === 'string' ? rawOutput : '')}`;
  if (typeof rawOutput !== 'string') {
    return {
      outcome: 'invalid-response',
      calledProvider: null,
      calledModel: null,
      providerRequestRefHash: null,
      latencyMs: null,
      evidenceRefs: [evidenceRef],
    };
  }

  const events = collectClaudeEvents(rawOutput);
  const terminalResults = events.filter(event => event.type === 'result');
  const result = terminalResults.length === 1 ? terminalResults[0] : null;
  if (!result) {
    return {
      outcome: 'invalid-response',
      calledProvider: null,
      calledModel: null,
      providerRequestRefHash: null,
      latencyMs: null,
      evidenceRefs: [evidenceRef],
    };
  }

  const initModel = singleCanonicalValue(events
    .filter(event => event.type === 'system' && event.subtype === 'init')
    .map(event => event.model));
  const assistantEvents = events.filter(event => event.type === 'assistant');
  const assistantModel = singleCanonicalValue(assistantEvents.map(event => asRecord(event.message)?.model));
  const calledModel = initModel !== null && initModel === assistantModel ? initModel : null;
  const requestIds = [...new Set(assistantEvents
    .map(event => event.request_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0))]
    .sort();
  const providerRequestRefHash = requestIds.length > 0
    ? sha256(JSON.stringify(requestIds))
    : null;
  const latency = readNonNegInt(result, 'duration_api_ms');
  const latencyMs = latency ?? null;

  const succeeded = result.subtype === 'success' && result.is_error === false;
  const modelUsage = asRecord(result.modelUsage);
  const primaryUsagePresent = calledModel !== null
    && modelUsage !== null
    && Object.prototype.hasOwnProperty.call(modelUsage, calledModel);
  if (!succeeded || calledModel === null || providerRequestRefHash === null || !primaryUsagePresent) {
    return {
      outcome: succeeded ? 'invalid-response' : claudeFailureOutcome(result),
      calledProvider: calledModel === null ? null : 'claude',
      calledModel,
      providerRequestRefHash,
      latencyMs,
      evidenceRefs: [evidenceRef],
    };
  }

  return {
    outcome: 'succeeded',
    calledProvider: 'claude',
    calledModel,
    providerRequestRefHash,
    latencyMs,
    evidenceRefs: [evidenceRef],
  };
}

/** Read a non-negative finite number from `obj[key]`, else undefined. */
function readNonNegInt(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/**
 * Sum the per-model `outputTokens` reported under a Claude CLI envelope's
 * `modelUsage` map — the camelCase, nested telemetry block
 * (`{ "claude-opus-4-8": { inputTokens, outputTokens, costUSD } }`).
 *
 * Opus `--output-format json` runs intermittently OMIT the top-level
 * `usage.output_tokens` while still reporting the real generated-token count
 * here (observed Sprint 330, tasks 330-019/330-020). Reading it as a fallback
 * keeps capture FAITHFUL — `modelUsage[*].outputTokens` is a real field the
 * envelope itself reports, never a fabricated number. Returns `undefined` when
 * no `modelUsage` entry carries a usable output count, so the caller can keep
 * `undefined` as the honest "no output reported anywhere" signal.
 */
function modelUsageOutputTokens(envelope: Record<string, unknown>): number | undefined {
  const modelUsage = envelope.modelUsage;
  if (modelUsage === null || typeof modelUsage !== 'object') return undefined;
  let sum = 0;
  let sawOutput = false;
  for (const entry of Object.values(modelUsage as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object') continue;
    const out = readNonNegInt(entry as Record<string, unknown>, 'outputTokens');
    if (out !== undefined) {
      sum += out;
      sawOutput = true;
    }
  }
  return sawOutput ? sum : undefined;
}

/**
 * Pull a normalized {@link TokenUsage} out of one Claude CLI JSON envelope
 * candidate, recognizing the `usage` object's Anthropic field names. Returns
 * null when the payload carries no usage numbers (empty/absent `usage`).
 *
 * Output-token capture is robust to the opus envelope quirk where the top-level
 * `usage.output_tokens` is absent: the count is recovered from the nested
 * `modelUsage` block via {@link modelUsageOutputTokens} (see Sprint 330
 * 330-019/330-020). Top-level `output_tokens` stays the primary source — the
 * `modelUsage` fallback only engages when the top-level field is genuinely not
 * a number (absent/null), never overriding a real top-level value and never
 * fabricating output when neither source reports it.
 */
function claudeUsageFromEnvelope(payload: unknown): TokenUsage | null {
  if (payload === null || typeof payload !== 'object') return null;
  const envelope = payload as Record<string, unknown>;
  const usageRaw = envelope.usage;
  if (usageRaw === null || typeof usageRaw !== 'object') return null;
  const usage = usageRaw as Record<string, unknown>;

  const inputTokens = readNonNegInt(usage, 'input_tokens');
  const outputTokens =
    readNonNegInt(usage, 'output_tokens') ?? modelUsageOutputTokens(envelope);
  if (inputTokens === undefined && outputTokens === undefined) return null;

  const cacheRead = readNonNegInt(usage, 'cache_read_input_tokens');
  const cacheCreation = readNonNegInt(usage, 'cache_creation_input_tokens');

  return normalizeUsage({
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    ...(cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {}),
    // Anthropic cache_creation = cross-provider cache-write (token-usage.ts matrix).
    ...(cacheCreation !== undefined
      ? { cacheCreationTokens: cacheCreation, cacheWriteTokens: cacheCreation }
      : {}),
  });
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
