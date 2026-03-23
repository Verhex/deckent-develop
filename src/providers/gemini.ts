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
import type { ModelType, GeminiModel, UsageMetrics } from '../core/types.js';
import { PROVIDER_MODEL_MAP } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../core/provider.js';
import { ProviderError } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';

// ─── Constants ───────────────────────────────────────────────────────

const GEMINI_MODELS: readonly GeminiModel[] = [...PROVIDER_MODEL_MAP.gemini] as GeminiModel[];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Auth header name per official Google AI docs */
export const GEMINI_AUTH_HEADER = 'x-goog-api-key';

const SAFE_USAGE_DEFAULT: UsageMetrics = {
  fiveHourPercent: 0,
  weeklyPercent: 0,
  measuredAt: new Date().toISOString(),
};

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
 * GeminiAdapter — ProviderAdapter implementation for Google Gemini API.
 *
 * Since Gemini has no standard CLI, this adapter spawns a Node.js subprocess
 * that calls the Google AI API via the built-in fetch API.
 * Auth via x-goog-api-key header per official Google AI docs.
 * Requires GOOGLE_API_KEY environment variable.
 */
export class GeminiAdapter implements ProviderAdapter {
  readonly name = 'gemini';
  readonly supportedModels: readonly ModelType[] = GEMINI_MODELS;

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
        `Unsupported model "${model}" for Gemini provider. Supported: ${GEMINI_MODELS.join(', ')}`,
        this.name,
      );
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ProviderError(
        'GOOGLE_API_KEY environment variable is not set',
        this.name,
      );
    }

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    ensureDir(tasksDir);

    const logPath = join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');

    // Build the inline Node.js script that calls the Gemini API
    // Auth via x-goog-api-key header (per official docs — avoids key in URL/logs)
    const apiUrl = `${GEMINI_API_BASE}/${model}:generateContent`;
    const script = this.buildApiScript(apiUrl, apiKey, prompt);

    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['pipe', logFd, logFd],
      env: { ...process.env },
    };

    const child = spawn('node', ['-e', script], spawnOpts);
    closeSync(logFd);

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
        this.killWithSignal(taskId, 'SIGKILL');
      }, timeout);
    }

    this.workers.set(taskId, entry);

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

  // ─── checkUsage() ──────────────────────────────────────────────────

  async checkUsage(): Promise<UsageMetrics> {
    // Google AI API does not expose a simple quota endpoint via CLI.
    // Return neutral defaults; actual quota tracking is external.
    return {
      ...SAFE_USAGE_DEFAULT,
      measuredAt: new Date().toISOString(),
    };
  }

  // ─── isAvailable() ─────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    return this.getApiKey() !== undefined;
  }

  // ─── buildCommand() ────────────────────────────────────────────────

  buildCommand(
    model: ModelType,
    promptPath: string,
    _opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    const apiKey = this.getApiKey() ?? '<GOOGLE_API_KEY>';
    const url = `${GEMINI_API_BASE}/${model}:generateContent`;
    return `curl -s -X POST "${url}" -H "Content-Type: application/json" -H "${GEMINI_AUTH_HEADER}: ${apiKey}" -d @${promptPath}`;
  }

  /**
   * Build a curl command for the streaming endpoint.
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
   * Gemini uses node -e with an inline API script (no CLI binary).
   */
  buildPlannerCommand(prompt: string, model: ModelType): { command: string; args: string[] } {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ProviderError(
        'GOOGLE_API_KEY environment variable is not set',
        this.name,
      );
    }
    const apiUrl = `${GEMINI_API_BASE}/${model}:generateContent`;
    const script = this.buildApiScript(apiUrl, apiKey, prompt);
    return { command: 'node', args: ['-e', script] };
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

  // ─── Internal helpers ──────────────────────────────────────────────

  /**
   * Build inline Node.js script that calls the Gemini REST API via fetch.
   * Auth is sent via x-goog-api-key header per official Google AI docs.
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

  private isSupportedModel(model: ModelType): model is GeminiModel {
    return (GEMINI_MODELS as readonly string[]).includes(model);
  }

  getApiKey(): string | undefined {
    return process.env.GOOGLE_API_KEY;
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
      currentAction: 'Gemini API worker running',
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
}

// ─── Helpers ─────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
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
