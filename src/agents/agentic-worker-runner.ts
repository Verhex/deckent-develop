// ═══ agentic-worker-runner — native Ollama tool-calling loop (T-233-001) ═══
//
// Core agentic worker harness for F1-013 (AS-2 Faz 1). Drives a real local
// model (validated: qwen3.6:27b) through deckent's `read_file/write_file/
// edit_file/run_bash/task_done` tool surface via Ollama's native tool-calling
// `/api/chat` endpoint. Scope-enforced on writes (ADR-037), structured result
// returned for Brain to evaluate. Provider-agnostic loop core (HTTP-only) so
// AS-2 Faz 2 can plug in OpenAI-compatible adapters (GLM/Groq/OpenRouter)
// without touching this file.
//
// Architecture (spec §3.1.1):
//   • The loop logic lives here — pure-ish, dependency-injected (fetchImpl,
//     dispatcher, logger) for hermetic testing.
//   • The subprocess entry (`agentic-worker-entry.ts`, T-233-002) reads the
//     task JSON, constructs this runner with real deps, writes the
//     `.tasks/task-{id}.result`. **This module DOES NOT write `.result`.**
//   • Tool executors are reused from `chat-tool-exec.ts` (DO NOT modify).
//     We translate Ollama tool names (`read_file`) into the chat-tool-exec
//     names (`deckent_read_file`) when calling the dispatcher.
//
// Termination conditions (spec §6):
//   1. Model emits `task_done` → use its selfAssessment/notes.
//   2. Model returns no `tool_calls` (content-only turn) →
//      filesChanged>0 → DONE; else NO_GO.
//   3. `maxIterations` reached → filesChanged>0 → GO_WITH_TECH_DEBT; else NO_GO.
//   4. Ollama API error / unreachable → NO_GO + reason.

import {
  createToolExecDispatcher,
  type ToolExecOptions,
} from '../cli/commands/chat-tool-exec.js';
import type { McpToolDispatcher } from '../cli/commands/chat-native.js';
import { OLLAMA_TOOLS } from './agentic-worker-tools.js';
import { isPathInScope, type ScopeLike } from './scope-guard.js';
import {
  writeEvent,
  getCurrentSprintId,
  SCOPE_INSUFFICIENT_CHANNEL,
} from '../orchestra/event-stream.js';

// ─── Public types ───────────────────────────────────────────────────────────

/** Default cap on outer `/api/chat` calls (spec §6 — config-surfaced via opts). */
export const DEFAULT_MAX_ITERATIONS = 25;

export type SelfAssessment = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';

export interface AgenticRunnerScope extends ScopeLike {
  /** Optional read-allow list (informational; reads are unrestricted at runtime). */
  filesRead?: string[];
}

export interface AgenticRunnerGoNogo {
  goCriteria: string;
  noGoCriteria: string;
  techDebtAcceptable?: string;
}

export interface AgenticRunnerOptions {
  taskId: string;
  /** Ollama apiId (e.g. `qwen3.6:27b`) — passed through to `/api/chat`. */
  model: string;
  /** Ollama base URL, no trailing slash (e.g. `http://localhost:11434`). */
  host: string;
  /** Task instructions surfaced to the model as the first user turn. */
  prompt: string;
  scope: AgenticRunnerScope;
  goNogo: AgenticRunnerGoNogo;
  /** Project root — resolves relative paths; also the `cwd` for tool execution. */
  projectRoot: string;
  /** Default 25; spec §6 config-surfaced cap. */
  maxIterations?: number;
  /** Inject a `fetch` impl for tests. Default uses global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Optional dispatcher override. When set, the runner uses it directly with
   * native Ollama tool names (`read_file`, `write_file`, …). When unset, the
   * runner builds a `createToolExecDispatcher` and maps names → `deckent_*`.
   * Either way, scope-guard wraps the call BEFORE dispatch.
   */
  dispatcher?: McpToolDispatcher;
  /** Optional log sink. Default: silent. */
  logger?: (line: string) => void;
}

/**
 * Token-usage shape returned by the runner. Filled from Ollama `/api/chat`'s
 * top-level `eval_count` (output tokens) and `prompt_eval_count` (input tokens),
 * summed across every loop turn. Provider is hard-coded to `ollama` because the
 * loop core only speaks Ollama's native tool-calling endpoint; AS-2 Faz 2 will
 * widen this when openai-compatible adapters land.
 */
export interface AgenticTokenUsage {
  inputTokens: number;
  outputTokens: number;
  provider: 'ollama';
  /** Local inference has no per-call cost. Kept for downstream uniformity. */
  cost: number;
}

export interface AgenticRunnerResult {
  taskId: string;
  /** Project-relative paths of files actually written or edited. */
  filesChanged: string[];
  /** Derived from `run_bash` exit when a test command was run; `undefined` if no test ran. */
  testsPassed?: boolean;
  selfAssessment: SelfAssessment;
  notes: string;
  /** Number of `/api/chat` calls made before termination. */
  iterations: number;
  /** Terminal reason for observability. */
  terminationReason:
    | 'task_done'
    | 'no_tool_calls'
    | 'max_iterations'
    | 'api_error';
  /**
   * Tokens consumed across all `/api/chat` turns. Always set by
   * `runAgenticWorker` (every return path); optional only to permit
   * incomplete test mocks that pre-date T-234-002.
   */
  tokenUsage?: AgenticTokenUsage;
}

// ─── Internal message types (Ollama /api/chat shape) ────────────────────────

interface OllamaToolCall {
  id?: string;
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OllamaChatResponse {
  message?: {
    role: 'assistant';
    content?: string;
    tool_calls?: OllamaToolCall[];
  };
  /** Top-level fields per Ollama /api/chat — present when `done:true`. */
  eval_count?: number;
  prompt_eval_count?: number;
}

// ─── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(
  scope: AgenticRunnerScope,
  goNogo: AgenticRunnerGoNogo,
): string {
  const filesWrite = scope.filesWrite.length > 0 ? scope.filesWrite.join(', ') : '(none)';
  const dirs = scope.directories.length > 0 ? scope.directories.join(', ') : '(none)';
  const reads = scope.filesRead && scope.filesRead.length > 0 ? scope.filesRead.join(', ') : '(any file under project root)';
  // Advisor sharpening #3: include scope verbatim so the model doesn't burn
  // iterations proposing out-of-scope paths.
  return [
    'You are a deckent agentic worker. You have five tools: read_file, write_file, edit_file, run_bash, task_done.',
    'You MUST end your work by calling task_done with an honest selfAssessment (DONE / GO_WITH_TECH_DEBT / NO_GO).',
    '',
    '## Task Scope (HARD-ENFORCED on writes/edits)',
    `- Allowed write files: ${filesWrite}`,
    `- Allowed write directories: ${dirs}`,
    `- Read paths (informational): ${reads}`,
    'Any write_file or edit_file targeting a path outside the above is rejected with an error string. Read the error and self-correct — do NOT retry the same path.',
    '',
    '## Definition of Done (goCriteria)',
    goNogo.goCriteria,
    '',
    '## NO-GO if',
    goNogo.noGoCriteria,
    '',
    '## Tech-debt acceptable',
    goNogo.techDebtAcceptable ?? '(none specified)',
    '',
    'Work in small, verifiable steps. Run verification commands (e.g. tsc, vitest, pytest) via run_bash before calling task_done. Be honest in self-assessment.',
  ].join('\n');
}

// ─── Tool argument parsing (advisor #1) ─────────────────────────────────────

function parseToolArgs(raw: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw;
  return {};
}

// ─── Test-command sniffer (testsPassed derivation, spec §3.1.1) ─────────────

const TEST_CMD_PATTERNS = [
  /\bvitest\b/i,
  /\bnpm\s+(test|t)\b/i,
  /\bpnpm\s+(test|t)\b/i,
  /\byarn\s+(test|t)\b/i,
  /\bpytest\b/i,
  /\bcargo\s+test\b/i,
  /\bgo\s+test\b/i,
];

function looksLikeTestCommand(cmd: string): boolean {
  return TEST_CMD_PATTERNS.some(re => re.test(cmd));
}

function bashOutputSuggestsFailure(output: string): boolean {
  // chat-tool-exec's defaultBashRun appends `[exit N]` for N!=0.
  return /\[exit\s+\d+\]\s*$/.test(output.trim());
}

// ─── Dispatcher building & scope-wrapping ───────────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  read_file: 'deckent_read_file',
  write_file: 'deckent_write_file',
  edit_file: 'deckent_edit_file',
  run_bash: 'deckent_bash',
};

function buildDefaultDispatcher(projectRoot: string): McpToolDispatcher {
  // Auto-approve confirm — the runner ENFORCES scope before dispatch, so the
  // confirm hook is not the security boundary here.
  const opts: ToolExecOptions = { cwd: projectRoot, confirm: async () => true };
  const inner = createToolExecDispatcher(opts);
  return {
    async dispatch(name, args) {
      const mapped = TOOL_NAME_MAP[name];
      if (!mapped) return `[mcp-error] unknown tool: ${name}`;
      return inner.dispatch(mapped, args);
    },
  };
}

// ─── Runner ─────────────────────────────────────────────────────────────────

/**
 * Drive a local Ollama model through the agentic tool-calling loop.
 *
 * Loop body (spec §3.1.1):
 *   1. POST `${host}/api/chat` with `{ model, messages, tools, stream:false }`.
 *   2. Parse `message.tool_calls`. If empty → content-only turn → terminate.
 *   3. For each tool call:
 *      • `task_done` → terminate with caller-supplied assessment.
 *      • `write_file` / `edit_file` → scope-guard. Out-of-scope returns an
 *        error STRING to the model (no dispatch).
 *      • Otherwise dispatch via the runner's dispatcher (chat-tool-exec
 *        adapter by default; injectable for tests).
 *      • Append `{role:'tool', content: result, tool_call_id?}` so the model
 *        sees the outcome and can self-correct.
 *   4. Tally `filesChanged` (post-dispatch success only, advisor #2).
 *   5. Tally `testsPassed` from any run_bash that looks like a test runner.
 *   6. Loop up to `maxIterations`; terminate per spec §6.
 */
export async function runAgenticWorker(
  opts: AgenticRunnerOptions,
): Promise<AgenticRunnerResult> {
  const {
    taskId,
    model,
    host,
    prompt,
    scope,
    goNogo,
    projectRoot,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    fetchImpl = ((...args) => fetch(...args)) as typeof fetch,
    dispatcher: injectedDispatcher,
    logger = () => undefined,
  } = opts;

  const dispatcher = injectedDispatcher ?? buildDefaultDispatcher(projectRoot);

  const messages: OllamaMessage[] = [
    { role: 'system', content: buildSystemPrompt(scope, goNogo) },
    { role: 'user', content: prompt },
  ];

  const filesChanged = new Set<string>();
  let testsPassed: boolean | undefined;
  let iterations = 0;
  // Token accounting: summed across every /api/chat turn. Ollama returns
  // prompt_eval_count (input) and eval_count (output) at the top level when
  // `done:true`. Provider hard-coded `ollama`; cost=0 (local inference).
  let inputTokens = 0;
  let outputTokens = 0;
  const tokenUsage = (): AgenticTokenUsage => ({
    inputTokens,
    outputTokens,
    provider: 'ollama',
    cost: 0,
  });

  // ─── Outer loop ───
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;

    let chatRes: Response;
    try {
      chatRes = await fetchImpl(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, tools: OLLAMA_TOOLS, stream: false }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger(`[agentic-runner] /api/chat fetch failed: ${msg}`);
      return {
        taskId,
        filesChanged: [...filesChanged],
        testsPassed,
        selfAssessment: 'NO_GO',
        notes: `Ollama /api/chat unreachable: ${msg}`,
        iterations,
        terminationReason: 'api_error',
        tokenUsage: tokenUsage(),
      };
    }

    if (!chatRes.ok) {
      const body = await chatRes.text().catch(() => '');
      logger(`[agentic-runner] /api/chat returned ${chatRes.status}: ${body}`);
      return {
        taskId,
        filesChanged: [...filesChanged],
        testsPassed,
        selfAssessment: 'NO_GO',
        notes: `Ollama /api/chat returned ${chatRes.status}: ${body.slice(0, 500)}`,
        iterations,
        terminationReason: 'api_error',
        tokenUsage: tokenUsage(),
      };
    }

    let parsed: OllamaChatResponse;
    try {
      parsed = (await chatRes.json()) as OllamaChatResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        taskId,
        filesChanged: [...filesChanged],
        testsPassed,
        selfAssessment: 'NO_GO',
        notes: `Ollama /api/chat returned non-JSON body: ${msg}`,
        iterations,
        terminationReason: 'api_error',
        tokenUsage: tokenUsage(),
      };
    }

    // Accumulate token counts from this turn (Ollama omits them on stream
    // chunks; on `stream:false` they appear once `done:true`).
    if (typeof parsed.prompt_eval_count === 'number' && Number.isFinite(parsed.prompt_eval_count)) {
      inputTokens += parsed.prompt_eval_count;
    }
    if (typeof parsed.eval_count === 'number' && Number.isFinite(parsed.eval_count)) {
      outputTokens += parsed.eval_count;
    }

    const assistantContent = parsed.message?.content ?? '';
    const toolCalls = parsed.message?.tool_calls ?? [];

    // Echo the assistant turn into history so the model sees its own prior
    // tool_calls when generating the next round.
    messages.push({
      role: 'assistant',
      content: assistantContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    // Spec §6 termination #2: no tool_calls → content-only → terminal.
    if (toolCalls.length === 0) {
      const sa: SelfAssessment = filesChanged.size > 0 ? 'DONE' : 'NO_GO';
      const note = filesChanged.size > 0
        ? `Model finished with content-only turn after ${filesChanged.size} file change(s). Assistant: ${assistantContent.slice(0, 300)}`
        : `Model returned no tool calls and no files were changed. Assistant: ${assistantContent.slice(0, 300)}`;
      return {
        taskId,
        filesChanged: [...filesChanged],
        testsPassed,
        selfAssessment: sa,
        notes: note,
        iterations,
        terminationReason: 'no_tool_calls',
        tokenUsage: tokenUsage(),
      };
    }

    // ─── Inner loop: execute each tool call ───
    for (const call of toolCalls) {
      const name = call.function?.name ?? '';
      const args = parseToolArgs(call.function?.arguments);
      const callId = call.id ?? `call-${iter}-${name}`;

      // Termination #1: task_done.
      if (name === 'task_done') {
        const rawSa = String(args['selfAssessment'] ?? '').toUpperCase();
        const saValid = rawSa === 'DONE' || rawSa === 'GO_WITH_TECH_DEBT' || rawSa === 'NO_GO';
        // Phase-1c: when the model calls task_done WITHOUT a valid selfAssessment,
        // don't punish demonstrably-done work as NO_GO. If files were changed, the
        // honest default is GO_WITH_TECH_DEBT (work landed, self-assessment unclear);
        // only an empty-handed task_done defaults to NO_GO. Mirrors the no_tool_calls
        // (filesChanged>0 → done) + maxIterations (filesChanged>0 → GO_WITH_TECH_DEBT) paths.
        const validSa: SelfAssessment = saValid
          ? (rawSa as SelfAssessment)
          : (filesChanged.size > 0 ? 'GO_WITH_TECH_DEBT' : 'NO_GO');
        const rawNote = args['notes'];
        const note = typeof rawNote === 'string' && rawNote.trim()
          ? rawNote
          : saValid
            ? 'task_done called without notes'
            : `task_done called without a valid selfAssessment; defaulted to ${validSa} (${filesChanged.size} file change(s))`;
        logger(`[agentic-runner] task_done: ${validSa}`);
        return {
          taskId,
          filesChanged: [...filesChanged],
          testsPassed,
          selfAssessment: validSa,
          notes: note,
          iterations,
          terminationReason: 'task_done',
          tokenUsage: tokenUsage(),
        };
      }

      // Scope-guard for write/edit (hard-reject, spec §6 decision).
      if (name === 'write_file' || name === 'edit_file') {
        const targetPath = String(args['path'] ?? '');
        if (!isPathInScope(targetPath, scope, projectRoot)) {
          const errMsg = `[scope-violation] ${name}: path "${targetPath}" is outside the assigned task scope. Allowed files: ${scope.filesWrite.join(', ') || '(none)'} ; Allowed directories: ${scope.directories.join(', ') || '(none)'}. Choose a path inside the scope or call task_done with NO_GO if no in-scope path is suitable.`;
          const scopeSprintId = getCurrentSprintId(projectRoot);
          if (scopeSprintId) {
            writeEvent(projectRoot, scopeSprintId, 'worker', 'brain', SCOPE_INSUFFICIENT_CHANNEL, {
              taskId,
              attemptedPath: targetPath,
              reason: errMsg,
              goCriteria: goNogo.goCriteria,
              currentScope: { filesWrite: scope.filesWrite, directories: scope.directories },
            });
          }
          messages.push({
            role: 'tool',
            content: errMsg,
            tool_call_id: callId,
            name,
          });
          logger(`[agentic-runner] scope rejection: ${targetPath}`);
          continue;
        }
      }

      // Dispatch.
      let result: string;
      try {
        result = await dispatcher.dispatch(name, args);
      } catch (err) {
        result = `[mcp-error] ${name}: ${err instanceof Error ? err.message : String(err)}`;
      }

      // Track filesChanged on POST-DISPATCH success only (advisor #2).
      if ((name === 'write_file' || name === 'edit_file') && !result.startsWith('[mcp-error]')) {
        filesChanged.add(String(args['path'] ?? ''));
      }

      // testsPassed sniffer for run_bash.
      if (name === 'run_bash') {
        const cmd = String(args['cmd'] ?? args['command'] ?? '');
        if (looksLikeTestCommand(cmd)) {
          testsPassed = !bashOutputSuggestsFailure(result);
        }
      }

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: callId,
        name,
      });
    }
  }

  // Spec §6 termination #3: max iterations reached.
  const sa: SelfAssessment = filesChanged.size > 0 ? 'GO_WITH_TECH_DEBT' : 'NO_GO';
  const note = filesChanged.size > 0
    ? `Reached maxIterations=${maxIterations} after ${filesChanged.size} file change(s) without task_done — task incomplete.`
    : `Reached maxIterations=${maxIterations} with no file changes and no task_done — model did not converge.`;
  return {
    taskId,
    filesChanged: [...filesChanged],
    testsPassed,
    selfAssessment: sa,
    notes: note,
    iterations,
    terminationReason: 'max_iterations',
    tokenUsage: tokenUsage(),
  };
}
