import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions as NodeSpawnOptions,
} from 'node:child_process';
import {
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import type { ModelType, GeminiModel } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions, ProviderAvailabilityDetail } from '../core/provider.js';
import { PROVIDER_PACKAGES } from '../core/provider-packages.js';
import { ProviderError, resolveBinaryPath, parseSemverFromOutput } from '../core/provider.js';
import type { ProviderDetectResult } from './claude.js';
import { TASKS_DIR } from '../core/constants.js';
import type { ModelTier } from '../core/model-equivalence.js';
import { getModelForProviderTier } from '../core/model-equivalence.js';
import { modelRegistry } from '../core/model-registry.js';
import { normalizeUsage, type TokenUsage } from '../core/token-usage.js';

// ─── Constants ───────────────────────────────────────────────────────

/**
 * Live registry lookup for Gemini-provider models.
 *
 * Sprint 230 Task 230-002: replaced the module-load snapshot so models added
 * at runtime via `bootstrapFromCatalog()` (models.dev) become spawnable
 * without restarting the process.
 */
function getGeminiModels(): readonly GeminiModel[] {
  return modelRegistry.getByProvider('gemini').map(m => m.id as GeminiModel);
}

/**
 * Build the environment for a spawned Gemini worker process.
 *
 * Sprint 248 (Provider Parity):
 *   - When `apiKey` is set, inject `GOOGLE_API_KEY`; otherwise leave it unset so
 *     the CLI falls back to its OAuth/subscription session.
 *   - Strip every `GEMINI_CLI_IDE_*` variable. When deckent runs inside an IDE
 *     (Gemini CLI IDE integration sets `GEMINI_CLI_IDE_SERVER_PORT`,
 *     `GEMINI_CLI_IDE_WORKSPACE_PATH`, `GEMINI_CLI_IDE_AUTH_TOKEN`), a spawned
 *     worker inheriting them binds to the parent IDE session and aborts with a
 *     "Directory mismatch / IDE workspace" error. A headless worker must not
 *     attach to the IDE companion, so these are removed from its env.
 *
 * @internal exported for regression coverage
 */
export function buildGeminiSpawnEnv(apiKey?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GEMINI_CLI_IDE_')) {
      delete env[key];
    }
  }
  if (apiKey) {
    env['GOOGLE_API_KEY'] = apiKey;
  }
  // Non-interactive guard: prevents the CLI from dropping into an interactive
  // `gemini login` OAuth flow when auth fails (e.g. 429 RESOURCE_EXHAUSTED).
  // With this flag set, the CLI must fail fast (exit non-zero) instead of hanging.
  env['GEMINI_NONINTERACTIVE'] = '1';
  return env;
}

/**
 * Tier-based model mapping for Gemini CLI.
 * @deprecated Derived from model-equivalence.ts — use adapter.getModelForTier() instead.
 * Kept for backward compatibility with existing imports.
 */
export const GEMINI_TIER_MODELS = {
  get premium_plus() { return (modelRegistry.getByProviderAndTier('gemini', 'premium_plus')?.id ?? getModelForProviderTier('gemini', 'premium') ?? 'gemini-2.5-pro') as GeminiModel; },
  get premium() { return (getModelForProviderTier('gemini', 'premium') ?? 'gemini-2.5-pro') as GeminiModel; },
  get standard() { return (getModelForProviderTier('gemini', 'standard') ?? 'gemini-2.5-flash') as GeminiModel; },
  get economy() { return (getModelForProviderTier('gemini', 'economy') ?? 'gemini-2.0-flash') as GeminiModel; },
};

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Auth header name per official Google AI docs (used by REST API fallback) */
export const GEMINI_AUTH_HEADER = 'x-goog-api-key';

// Fast-fail guards: kill the child immediately when these patterns appear in output.
// Prevents the gemini CLI from hanging for the full worker timeout when it drops into
// an interactive login flow (unrecoverable) or hits quota exhaustion (429 / RESOURCE_EXHAUSTED).
/** Login/auth prompt pattern — kill immediately (interactive mode = unrecoverable headless) */
export const LOGIN_FAST_FAIL = /gemini\s+login|please\s+(run\s+)?.*login|please\s+authenticate|authentication\s+required|login\s+required/i;
/** Quota/rate-limit pattern — kill after 2 hits (allow CLI's own single retry) */
export const QUOTA_FAST_FAIL = /429|RESOURCE_EXHAUSTED|No\s+capacity/i;

// ─── Gemini CLI Output Parser ────────────────────────────────────────

/**
 * Parse stdout from `gemini -p ... --output-format json` or `--output-format stream-json`.
 * The Gemini CLI returns structured JSON with the response text and optional usage stats.
 *
 * For `stream-json` format, output is newline-delimited JSON (NDJSON) where each line
 * is a separate JSON object with partial response chunks. This function concatenates
 * all chunks into a single response.
 */
export function parseGeminiOutput(stdout: string): {
  response: string;
  stats?: { inputTokens: number; outputTokens: number };
} {
  if (!stdout.trim()) {
    return { response: '' };
  }

  // Try stream-json (NDJSON) format first: multiple JSON lines
  const lines = stdout.trim().split('\n').filter(l => l.trim());
  if (lines.length > 1) {
    const streamResult = tryParseStreamJson(lines);
    if (streamResult) return streamResult;
  }

  try {
    const parsed = JSON.parse(stdout);

    // Gemini CLI --output-format json typically returns { response, candidates, usageMetadata }
    const response =
      parsed?.response ??
      parsed?.candidates?.[0]?.content?.parts?.[0]?.text ??
      (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));

    let stats: { inputTokens: number; outputTokens: number } | undefined;
    const usage = parsed?.usageMetadata;
    if (usage && typeof usage.promptTokenCount === 'number' && typeof usage.candidatesTokenCount === 'number') {
      stats = {
        inputTokens: usage.promptTokenCount,
        outputTokens: usage.candidatesTokenCount,
      };
    }

    return { response, stats };
  } catch {
    // If not valid JSON, treat the entire stdout as plain text response
    return { response: stdout.trim() };
  }
}

/**
 * Try to parse NDJSON (stream-json) output from Gemini CLI.
 * Each line is a JSON chunk with partial text and optional usage metadata.
 * Returns null if the lines are not valid NDJSON.
 */
function tryParseStreamJson(
  lines: string[],
): { response: string; stats?: { inputTokens: number; outputTokens: number } } | null {
  const chunks: string[] = [];
  let lastUsage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      // Extract text from each chunk
      const text =
        parsed?.response ??
        parsed?.candidates?.[0]?.content?.parts?.[0]?.text ??
        (typeof parsed === 'string' ? parsed : undefined);
      if (text) chunks.push(text);

      // Keep last usage metadata (final chunk typically has totals)
      if (parsed?.usageMetadata) {
        lastUsage = parsed.usageMetadata;
      }
    } catch {
      // Not valid JSON line — this is not NDJSON format
      return null;
    }
  }

  let stats: { inputTokens: number; outputTokens: number } | undefined;
  if (
    lastUsage &&
    typeof lastUsage.promptTokenCount === 'number' &&
    typeof lastUsage.candidatesTokenCount === 'number'
  ) {
    stats = {
      inputTokens: lastUsage.promptTokenCount,
      outputTokens: lastUsage.candidatesTokenCount,
    };
  }

  return { response: chunks.join(''), stats };
}

// ─── Worker Entry ────────────────────────────────────────────────────

interface GeminiWorkerEntry {
  taskId: string;
  process: ChildProcess;
  logPath: string;
  model: GeminiModel;
  spawnedAt: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── GeminiAdapter ───────────────────────────────────────────────────

/**
 * GeminiAdapter — ProviderAdapter implementation for Google Gemini CLI.
 *
 * Uses the `gemini` CLI binary with `-p` flag for headless/non-interactive mode
 * and `--output-format json` for structured output parsing.
 *
 * Requires: `gemini` CLI installed + GOOGLE_API_KEY or DECKENT_GOOGLE_API_KEY env variable.
 */
export class GeminiAdapter implements ProviderAdapter {
  readonly name = 'gemini';
  /** Live registry view — recomputed on every access so models.dev additions surface immediately. */
  get supportedModels(): readonly ModelType[] {
    return getGeminiModels() as readonly ModelType[];
  }

  private readonly projectDir: string;
  private readonly workers = new Map<string, GeminiWorkerEntry>();

  /** Default timeout in ms before a worker is killed automatically (0 = no timeout) */
  protected defaultTimeoutMs: number;

  constructor(projectDir: string, opts?: { defaultTimeoutMs?: number }) {
    this.projectDir = projectDir;
    this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 0;
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

    if (!this.isSupportedModel(model)) {
      throw new ProviderError(
        `Unsupported model "${model}" for Gemini provider. Supported: ${getGeminiModels().join(', ')}`,
        this.name,
      );
    }

    // Sprint 248 (Provider Parity): an API key is no longer mandatory — the
    // Gemini CLI also authenticates via an OAuth/subscription session. When a
    // key is present we inject it; when absent the CLI uses its logged-in
    // session. (Previously this threw, making OAuth-only users unusable.)
    const apiKey = this.getApiKey();

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    ensureDir(tasksDir);

    const logPath = join(tasksDir, `task-${taskId}.log`);

    // Build args for the Gemini CLI
    const args = this.buildArgs(model, prompt);

    // Use pipe stdio so we can monitor stdout/stderr for fast-fail patterns
    // (login prompts, 429, RESOURCE_EXHAUSTED). An fd-based approach would make
    // child.stdout/stderr null, preventing real-time monitoring.
    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildGeminiSpawnEnv(apiKey),
    };

    const child = spawn('gemini', args, spawnOpts);

    // Write heartbeat
    this.writeHeartbeat(taskId, dir, 'EXECUTING');

    const entry: GeminiWorkerEntry = {
      taskId,
      process: child,
      logPath,
      model: model as GeminiModel,
      spawnedAt: new Date().toISOString(),
    };

    // Set up timeout if configured
    const timeout = this.defaultTimeoutMs;
    if (timeout > 0) {
      entry.timeoutHandle = setTimeout(() => {
        if (this.workers.has(taskId)) this.killWithSignal(taskId, 'SIGKILL');
      }, timeout);
    }

    this.workers.set(taskId, entry);

    // Fast-fail guard: watch stdout/stderr for login prompts and quota exhaustion.
    // Kills the child within seconds instead of waiting for the full worker timeout.
    let quotaHits = 0;
    const checkFastFail = (chunk: Buffer | string): void => {
      const text = chunk.toString();
      try { appendFileSync(logPath, text, 'utf-8'); } catch { /* non-fatal */ }
      if (LOGIN_FAST_FAIL.test(text)) {
        if (this.workers.has(taskId)) this.killWithSignal(taskId, 'SIGKILL');
        return;
      }
      if (QUOTA_FAST_FAIL.test(text)) {
        quotaHits++;
        if (quotaHits >= 2 && this.workers.has(taskId)) {
          this.killWithSignal(taskId, 'SIGKILL');
        }
      }
    };
    child.stdout?.on('data', checkFastFail);
    child.stderr?.on('data', checkFastFail);

    // Cleanup on exit
    child.once('exit', () => {
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
    // Check 1: gemini CLI must be installed
    if (!this.isCliInstalled()) {
      return false;
    }
    // Check 2: API key must be set
    return this.getApiKey() !== undefined;
  }

  // ─── diagnoseAvailability() ────────────────────────────────────────

  /**
   * Three-layer probe: binary detection → version parsing → auth check.
   * Returns rich detail used by `deckent doctor --providers`.
   *
   * Partial state: binary installed but GOOGLE_API_KEY missing — produces
   * actionable hint instead of silent false.
   */
  async diagnoseAvailability(): Promise<ProviderAvailabilityDetail> {
    let binaryFound = false;
    let versionRaw: string | undefined;
    try {
      const result = spawnSync('gemini', ['--version'], { encoding: 'utf-8', timeout: 5000 });
      if (result.status === 0 && result.stdout) {
        versionRaw = result.stdout.trim();
        binaryFound = true;
      }
    } catch {
      // spawn failure — binary not callable
    }
    // Best-effort binary path resolution — runs only when binary is callable.
    const binaryPath = binaryFound ? resolveBinaryPath('gemini') : undefined;
    const version = parseSemverFromOutput(versionRaw) ?? versionRaw;
    const versionStatus: ProviderAvailabilityDetail['versionStatus'] = !binaryFound
      ? 'missing'
      : version
        ? 'ok'
        : 'unknown';

    const apiKey = this.getApiKey();
    const hasAuth = apiKey !== undefined && apiKey.length > 0;
    const authMethod: ProviderAvailabilityDetail['authMethod'] = hasAuth ? 'api_key' : 'none';
    const authStatus: ProviderAvailabilityDetail['authStatus'] = hasAuth ? 'ok' : 'missing';
    const available = binaryFound && hasAuth;
    const partial = binaryFound && !hasAuth;

    let reason: string;
    const hints: string[] = [];
    if (!binaryFound) {
      reason = 'Gemini CLI not found in PATH';
      hints.push(`Install: npm i -g ${PROVIDER_PACKAGES.gemini.npmPkg}`);
    } else if (!hasAuth) {
      reason = 'Gemini CLI installed but GOOGLE_API_KEY / DECKENT_GOOGLE_API_KEY not set';
      hints.push('Set GOOGLE_API_KEY environment variable');
      hints.push('Alternatively, add DECKENT_GOOGLE_API_KEY to .deck file');
    } else {
      reason = `Gemini CLI ${version ?? 'installed'} + API key configured`;
    }

    return {
      name: 'gemini',
      binaryFound,
      binaryPath,
      version,
      versionStatus,
      authMethod,
      authStatus,
      available,
      partial,
      models: [...getGeminiModels()] as ModelType[],
      reason,
      hints,
    };
  }

  // ─── detect() ──────────────────────────────────────────────────────

  /**
   * Compact 3-state availability probe — wraps {@link diagnoseAvailability}
   * and projects the rich detail onto `{binary, version, auth, ready}`.
   *
   * Gemini auth = `GOOGLE_API_KEY` / `DECKENT_GOOGLE_API_KEY`. Binary OK
   * without an API key → `ready: 'partial'`.
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

  // ─── buildArgs() ───────────────────────────────────────────────────

  /**
   * Build CLI arguments for `gemini` binary invocation.
   * Uses `-p` flag for headless/non-interactive mode.
   * Uses `-m` short flag (Gemini CLI docs: `-m gemini-2.5-flash`).
   *
   * Sprint 248 (Provider Parity), two corrections that make a real worker:
   *   - `--approval-mode yolo` (was `plan`): `plan` is **read-only** — the CLI
   *     refuses every edit/write tool, so a worker could never modify files or
   *     emit `.tasks/task-XXX.result`. `yolo` auto-approves all tools, which a
   *     non-interactive worker requires (it is the Gemini equivalent of the
   *     Codex `--full-auto` sandbox the codex adapter uses).
   *   - `--skip-trust`: a headless run in a directory the CLI has not
   *     interactively "trusted" otherwise aborts with a trust prompt
   *     (`GEMINI_CLI_TRUST_WORKSPACE`). `--skip-trust` trusts the workspace for
   *     this session so the worker can start unattended.
   */
  buildArgs(model: ModelType, prompt: string): string[] {
    return ['-p', prompt, '--output-format', 'json', '-m', model, '--approval-mode', 'yolo', '--skip-trust'];
  }

  // ─── buildCommand() ────────────────────────────────────────────────

  buildCommand(
    model: ModelType,
    promptPath: string,
    opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    // Sprint 252: use the apiId wire model, and gate the full-autonomy flags on
    // `autoApprove` — mirrors the claude adapter (which gates
    // `--dangerously-skip-permissions` the same way). A worker spawn passes
    // autoApprove → `--approval-mode yolo` (auto-approve edit/write; `plan` is
    // read-only and can't write `.result`) + `--skip-trust` (headless). A
    // non-worker caller (e.g. planner, default opts) gets the SAFE default
    // approval mode — yolo is NOT emitted unconditionally (security review,
    // Agent/Subprocess Permission Bypass). Host workers share the same
    // full-autonomy posture as codex `--full-auto`; the container sandbox
    // (PSL-1 ProviderCommandSpec, P2) is the structural mitigation.
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    const base = `gemini -p "$(cat ${promptPath})" --output-format json -m ${apiId}`;
    return opts?.autoApprove
      ? `${base} --approval-mode yolo --skip-trust`
      : `${base} --approval-mode default`;
  }

  /**
   * Build a curl command for the streaming endpoint (REST API fallback).
   */
  buildStreamCommand(
    model: ModelType,
    promptPath: string,
  ): string {
    const apiKey = this.getApiKey() ?? '<GOOGLE_API_KEY>';
    const url = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`;
    return `curl -s --no-buffer -X POST "${url}" -H "Content-Type: application/json" -H "${GEMINI_AUTH_HEADER}: ${apiKey}" -d @${promptPath}`;
  }

  // ─── buildPlannerCommand() ─────────────────────────────────────────

  /**
   * Build CLI command + args for planner invocations.
   * Uses the Gemini CLI binary with -p flag.
   */
  buildPlannerCommand(prompt: string, model: ModelType): { command: string; args: string[] } {
    return {
      command: 'gemini',
      args: this.buildArgs(model, prompt),
    };
  }

  // ─── validateApiKey() ───────────────────────────────────────────────

  /**
   * Basic validation of GOOGLE_API_KEY format.
   * Google AI API keys are typically 39 characters starting with "AIza".
   */
  validateApiKey(): { valid: boolean; reason: string } {
    const key = this.getApiKey();
    if (!key) {
      return { valid: false, reason: 'GOOGLE_API_KEY is not set' };
    }
    if (key.length < 10) {
      return { valid: false, reason: 'API key is too short' };
    }
    if (!key.startsWith('AIza') && key.length < 30) {
      return { valid: false, reason: 'API key does not match expected Google AI format (AIza...)' };
    }
    return { valid: true, reason: 'API key format looks valid' };
  }

  // ─── getModelForTier() ─────────────────────────────────────────────

  /**
   * Get the recommended Gemini model for a given capability tier.
   * Delegates to model-equivalence.ts as the single source of truth.
   */
  getModelForTier(tier: ModelTier): GeminiModel {
    return (getModelForProviderTier('gemini', tier) ?? 'gemini-2.5-flash') as GeminiModel;
  }

  // ─── getCliVersion() ──────────────────────────────────────────────

  /**
   * Get the installed Gemini CLI version string.
   * Returns undefined if the CLI is not installed or version cannot be determined.
   */
  getCliVersion(): string | undefined {
    try {
      const result = spawnSync('gemini', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (result.status === 0 && result.stdout) {
        return result.stdout.trim();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────

  /**
   * Build inline Node.js script that calls the Gemini REST API via fetch.
   * Auth is sent via x-goog-api-key header per official Google AI docs.
   * @deprecated Use buildArgs() + Gemini CLI instead. Kept for REST API fallback.
   */
  buildApiScript(apiUrl: string, apiKey: string, prompt: string): string {
    // Escape prompt for embedding in a JS string literal
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');

    return [
      `const body = JSON.stringify({`,
      `  contents: [{ parts: [{ text: '${escapedPrompt}' }] }],`,
      `  generationConfig: { maxOutputTokens: 65536 }`,
      `});`,
      `fetch('${apiUrl}', {`,
      `  method: 'POST',`,
      `  headers: {`,
      `    'Content-Type': 'application/json',`,
      `    '${GEMINI_AUTH_HEADER}': '${apiKey}'`,
      `  },`,
      `  body`,
      `}).then(r => r.json()).then(d => {`,
      `  const text = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(d);`,
      `  process.stdout.write(text);`,
      `}).catch(e => { process.stderr.write(e.message); process.exit(1); });`,
    ].join('\n');
  }

  /**
   * Build inline Node.js script that calls the Gemini streaming API via SSE.
   * Uses streamGenerateContent?alt=sse endpoint per official docs.
   * @deprecated Use Gemini CLI instead. Kept for REST API fallback.
   */
  buildStreamingApiScript(model: string, apiKey: string, prompt: string): string {
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');

    const streamUrl = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`;

    return [
      `const body = JSON.stringify({`,
      `  contents: [{ parts: [{ text: '${escapedPrompt}' }] }],`,
      `  generationConfig: { maxOutputTokens: 65536 }`,
      `});`,
      `fetch('${streamUrl}', {`,
      `  method: 'POST',`,
      `  headers: {`,
      `    'Content-Type': 'application/json',`,
      `    '${GEMINI_AUTH_HEADER}': '${apiKey}'`,
      `  },`,
      `  body`,
      `}).then(async r => {`,
      `  const reader = r.body.getReader();`,
      `  const decoder = new TextDecoder();`,
      `  let buf = '';`,
      `  while (true) {`,
      `    const { done, value } = await reader.read();`,
      `    if (done) break;`,
      `    buf += decoder.decode(value, { stream: true });`,
      `    const lines = buf.split('\\n');`,
      `    buf = lines.pop();`,
      `    for (const line of lines) {`,
      `      if (line.startsWith('data: ')) {`,
      `        try {`,
      `          const d = JSON.parse(line.slice(6));`,
      `          const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;`,
      `          if (text) process.stdout.write(text);`,
      `        } catch {}`,
      `      }`,
      `    }`,
      `  }`,
      `}).catch(e => { process.stderr.write(e.message); process.exit(1); });`,
    ].join('\n');
  }

  /**
   * Check if the `gemini` CLI binary is installed and accessible.
   */
  isCliInstalled(): boolean {
    try {
      const result = spawnSync('gemini', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  private isSupportedModel(model: ModelType): model is GeminiModel {
    // Sprint 230 Task 230-002: live registry lookup (provider === 'gemini')
    // replaces module-load `GEMINI_MODELS` snapshot so models.dev additions
    // pass at spawn time.
    return modelRegistry.get(model)?.provider === 'gemini';
  }

  getApiKey(): string | undefined {
    return process.env.DECKENT_GOOGLE_API_KEY ?? process.env.GOOGLE_API_KEY;
  }

  /**
   * Get the streaming endpoint URL for a given model.
   */
  getStreamingEndpoint(model: string): string {
    return `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`;
  }

  /**
   * Get the standard (non-streaming) endpoint URL for a given model.
   */
  getEndpoint(model: string): string {
    return `${GEMINI_API_BASE}/${model}:generateContent`;
  }

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

  protected writeHeartbeat(taskId: string, dir: string, status: string): void {
    const hbPath = join(dir, TASKS_DIR, `task-${taskId}.hb`);
    const hb = {
      workerId: `gemini-${taskId}`,
      taskId,
      status,
      currentAction: 'Gemini CLI worker running',
      timestamp: new Date().toISOString(),
      filesChangedCount: 0,
      sequence: 0,
    };
    try {
      writeFileSync(hbPath, JSON.stringify(hb, null, 2), 'utf-8');
    } catch {
      // Non-fatal: heartbeat write failure should not stop the worker
    }
  }

  // ─── Accessors (for testing/subclassing) ───────────────────────────

  getWorkerEntry(taskId: string): GeminiWorkerEntry | undefined {
    return this.workers.get(taskId);
  }

  getLogPath(taskId: string): string {
    return join(this.projectDir, TASKS_DIR, `task-${taskId}.log`);
  }

  getProjectDir(): string {
    return this.projectDir;
  }

  /**
   * Unwrap Gemini CLI `--output-format json` envelope (and NDJSON stream-json).
   * Shapes:
   *   - JSON: `{response:"<text>", candidates:[{content:{parts:[{text:"..."}]}}], usageMetadata:{...}}`
   *   - NDJSON: newline-delimited, final line typically `{response:"..."}` or final candidate chunk
   * Falls back to existing parseGeminiOutput helper, returning the `.response` field.
   */
  parseAgentResponse(raw: string): string {
    const parsed = parseGeminiOutput(raw);
    return parsed.response || raw;
  }

  // ─── extractUsage() ────────────────────────────────────────────────

  /**
   * Extract real token usage from Gemini CLI stdout (capture, not re-count).
   *
   * `gemini -p … --output-format json` (see {@link buildArgs}) emits a usage
   * envelope on every run. Two native shapes are handled:
   *   - JSON: a single object `{ response, candidates, usageMetadata:{…} }`.
   *   - stream-json (NDJSON): newline-delimited chunks; the final chunk carries
   *     the cumulative `usageMetadata`.
   *
   * Gemini's `usageMetadata` is normalized to the provider-agnostic
   * {@link TokenUsage} (Provider matrix, token-usage.ts):
   *   - `promptTokenCount`        → `inputTokens`
   *   - `candidatesTokenCount`    → `outputTokens`
   *   - `cachedContentTokenCount` → `cacheReadTokens`
   *   - `thoughtsTokenCount`      → `reasoningTokens`  (reasoning = thoughts; sparse)
   *   - `totalTokenCount`         → `totalTokens`      (Gemini total is additive and
   *      already includes thoughts, so it is passed through for accurate accounting
   *      rather than recomputed as input+output)
   *
   * Collects every parseable payload (whole string + each NDJSON line); the LAST
   * recognizable usage wins (the final stream chunk holds the cumulative totals).
   * Returns null when `rawOutput` carries no usage — the orchestrator then falls
   * back to external tokenizer counting (`source: 'tokenizer-fallback'`).
   */
  extractUsage(rawOutput: string): TokenUsage | null {
    if (typeof rawOutput !== 'string') return null;
    const trimmed = rawOutput.trim();
    if (trimmed.length === 0) return null;

    // Collect every parseable JSON payload: the whole string (single, possibly
    // pretty-printed object) plus each JSON line (NDJSON stream). A one-line
    // object is simply seen twice — harmless, last-wins is idempotent.
    const candidates: unknown[] = [];
    const whole = tryParseJson(trimmed);
    if (whole !== undefined) candidates.push(whole);
    for (const line of rawOutput.split(/\r?\n/)) {
      const t = line.trim();
      if (t.length < 2 || (t[0] !== '{' && t[0] !== '[')) continue;
      const parsed = tryParseJson(t);
      if (parsed !== undefined) candidates.push(parsed);
    }

    let found: TokenUsage | null = null;
    for (const candidate of candidates) {
      const usage = extractGeminiUsageFromPayload(candidate);
      if (usage) found = usage; // cumulative totals — last recognizable usage wins
    }
    return found;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
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

/** Narrow to a plain object (not null, not array). */
function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Read a non-negative finite number from an object key, else undefined. */
function readNum(obj: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!obj) return undefined;
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/**
 * Pull a {@link TokenUsage} out of one candidate JSON payload, recognizing the
 * Gemini `usageMetadata` envelope (also accepted nested under `response.usageMetadata`
 * for callers that pass the full CLI object). Returns null when the payload carries
 * no recognizable prompt/candidates token numbers (an empty `usageMetadata: {}` → null).
 */
function extractGeminiUsageFromPayload(payload: unknown): TokenUsage | null {
  const obj = asObject(payload);
  if (!obj) return null;

  const usage = asObject(obj['usageMetadata']) ?? asObject(asObject(obj['response'])?.['usageMetadata']);
  if (!usage) return null;

  const promptTokens = readNum(usage, 'promptTokenCount');
  const candidatesTokens = readNum(usage, 'candidatesTokenCount');
  // Require at least one real input/output count — an empty usageMetadata is not usage.
  if (promptTokens === undefined && candidatesTokens === undefined) return null;

  const reasoningTokens = readNum(usage, 'thoughtsTokenCount');
  const totalTokens = readNum(usage, 'totalTokenCount');

  return normalizeUsage({
    inputTokens: promptTokens ?? 0,
    outputTokens: candidatesTokens ?? 0,
    cacheReadTokens: readNum(usage, 'cachedContentTokenCount') ?? 0,
    // Sparse fields — only present when Gemini reported them (reasoning = thoughts).
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  });
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Create a GeminiAdapter instance for the given project directory.
 */
export function createGeminiAdapter(
  projectDir: string,
  opts?: { defaultTimeoutMs?: number },
): GeminiAdapter {
  return new GeminiAdapter(projectDir, opts);
}
