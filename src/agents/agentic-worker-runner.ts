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

import { emitWorkerActivity } from './worker-activity.js';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  createToolExecDispatcher,
  type ToolExecOptions,
} from '../cli/commands/chat-tool-exec.js';
import type { McpToolDispatcher } from '../cli/commands/chat-native.js';
import { wrapDispatcherWithApprovalGate, type ApprovalGateLike } from './agentic-worker-tools.js';
import { OLLAMA_TOOLS } from './agentic-worker-tools.js';
import { isPathInScope, type ScopeLike } from './scope-guard.js';
import {
  writeEvent,
  getCurrentSprintId,
  SCOPE_INSUFFICIENT_CHANNEL,
} from '../orchestra/event-stream.js';
// Spec Pillar 1 (two-path parity, 330-021): the protected worker-safety invariants
// are rendered by the SAME source builders the CLI path uses, so the agentic path
// carries byte-for-byte-identical scope / goNogo / verify-precedence text and a
// CLI-only rule can never be reworded or dropped here. (No circular dep: the
// orchestra/core modules never import agents/*.)
import {
  buildScopeBlock,
  buildDodBlock,
  buildVerifyPrecedenceNote,
} from '../orchestra/prompt-god-template.js';

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
  /**
   * Optional pre-rendered operative-ADR block (the CLI path's `adrBlock`) — the
   * mandatory architectural constraints carrying ADR operative-state. Injected
   * verbatim into the system prompt so the agentic path carries the SAME protected
   * ADR text as the CLI path (Spec Pillar 1 parity, 330-021). Omitted (never faked)
   * when no ADRs apply; the caller renders it the same way for both paths.
   */
  operativeAdrs?: string;
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
  /**
   * WORKER-LIVE-TRACE (ADR-G-025 §4) progress-stream toggle. Default:
   * disabled — flag-off performs ZERO fs I/O and is byte-identical to
   * pre-WLT-EMIT behavior. When enabled, ordered step events are appended to
   * `.tasks/task-{taskId}.progress.jsonl` under `projectRoot`. Distinct from
   * the `.hb` heartbeat file (`agentic-worker-entry.ts`): `.hb` is a
   * last-known-state snapshot, this is the ordered event stream — no
   * duplication.
   */
  liveTrace?: { enabled?: boolean };
  /**
   * born-611 (APR-P0): when supplied AND `enabled`, the tool dispatcher is
   * wrapped with `wrapDispatcherWithApprovalGate` so risky tool-classes
   * (shell-exec/git-mutation/network) pass `gate.guard()` BEFORE dispatch.
   * Omitted/disabled → dispatcher reference is byte-identical (no wrapper).
   * The caller (entry) owns gate construction + external-decision driving —
   * see `worker-approval-env.ts`.
   */
  approvalGate?: { enabled: boolean; gate: ApprovalGateLike; scopeId: string };
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

/**
 * Build the agentic worker system prompt under the SAME protected-set invariants
 * the CLI path guarantees (Spec Pillar 1 — two-path parity, 330-021).
 *
 * deckent has two worker-prompt paths: CLI/Codex/Gemini → `buildTaskPrompt`, and
 * this Ollama agentic path. Any worker-safety invariant guaranteed on path 1 MUST
 * be guaranteed on path 2, or rules leak on the agentic path. The four protected
 * elements are therefore rendered by the SAME source builders the CLI path uses, so
 * they are byte-for-byte diff-equal across both paths and a CLI-only rule can never
 * be reworded or dropped here:
 *   - scope             → {@link buildScopeBlock}        (auditor boundary / filesWrite allow-list)
 *   - goNogo            → {@link buildDodBlock}          (Definition-of-Done / goCriteria)
 *   - verify-precedence → {@link buildVerifyPrecedenceNote} (targeted-tests-only override, T0)
 *   - operative-ADR     → `operativeAdrs` verbatim       (mandatory constraints + operative-state)
 *
 * The agentic-specific guidance (five-tool surface, scope-violation self-correct
 * loop, informational read paths, tech-debt note) is preserved ADDITIVELY on top —
 * existing agentic behavior is unchanged.
 *
 * Exported so the prompt-protected-set parity test can diff it against the CLI
 * source builders (`tests/agents/agentic-prompt-parity.test.ts`).
 *
 * @param operativeAdrs Optional pre-rendered operative-ADR block (== CLI `adrBlock`).
 *   Injected verbatim as a mandatory-constraints section when present; omitted
 *   (never faked) when absent, so the protected ADR text is identical to path 1
 *   whenever the caller supplies it.
 */
export function buildSystemPrompt(
  scope: AgenticRunnerScope,
  goNogo: AgenticRunnerGoNogo,
  operativeAdrs?: string,
): string {
  // PROTECTED elements — rendered by the shared CLI source builders so the two
  // paths carry byte-identical invariant text (genuine parity, not a paraphrase).
  // `emitHostConfigNote=false`: the optional host-config portability note is
  // boilerplate, not a safety invariant — the filesWrite allow-list (the protected
  // part) is always rendered. The parity test builds its source with the same flag.
  const scopeBlock = buildScopeBlock(
    {
      directories: scope.directories,
      filesRead: scope.filesRead ?? [],
      filesWrite: scope.filesWrite,
    },
    [],
    false,
  );
  const dodBlock = buildDodBlock(goNogo);
  const verifyPrecedence = buildVerifyPrecedenceNote();

  const reads = scope.filesRead && scope.filesRead.length > 0
    ? scope.filesRead.join(', ')
    : '(any file under project root)';
  const adrBlock = operativeAdrs && operativeAdrs.trim() ? operativeAdrs.trim() : '';

  const lines: string[] = [
    'You are a deckent agentic worker. You have five tools: read_file, write_file, edit_file, run_bash, task_done.',
    'You MUST end your work by calling task_done with an honest selfAssessment (DONE / GO_WITH_TECH_DEBT / NO_GO).',
  ];

  // operative-ADR (PROTECTED) — mandatory architectural constraints carrying ADR
  // operative-state. Injected verbatim (same text the CLI path carries); absent
  // — not faked — when no ADRs apply.
  if (adrBlock) {
    lines.push('', adrBlock);
  }

  // scope (PROTECTED) — auditor boundary / filesWrite allow-list, shared builder —
  // followed by the agentic-specific runtime-enforcement note (additive).
  lines.push('', scopeBlock);
  lines.push(
    `Read paths (informational): ${reads}`,
    'Any write_file or edit_file targeting a path outside the scope above is rejected with an error string. Read the error and self-correct — do NOT retry the same path.',
  );

  // goNogo (PROTECTED) — Definition-of-Done, shared builder. dodBlock carries its
  // own leading/trailing newline; pushing it as one element keeps it diff-equal.
  lines.push(dodBlock);

  // Tech-debt acceptable (agentic-specific, additive).
  lines.push('## Tech-debt acceptable', goNogo.techDebtAcceptable ?? '(none specified)');

  // verify-precedence (PROTECTED, T0) — targeted-tests-only override note. The
  // agentic loop runs tests via run_bash, so the targeted-mode note always applies.
  lines.push('', verifyPrecedence, '');

  lines.push(
    'Work in small, verifiable steps. Run verification commands (e.g. tsc, vitest, pytest) via run_bash before calling task_done. Be honest in self-assessment.',
  );

  return lines.join('\n');
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

// ─── WORKER-LIVE-TRACE progress-stream (ADR-G-025 §4, WLT-EMIT) ────────────
//
// Per-worker live observability: ordered step events appended to
// `.tasks/task-{taskId}.progress.jsonl` (fail-soft, append-only) while the
// agentic loop runs. Flag-gated via `AgenticRunnerOptions.liveTrace.enabled`
// (default false/undefined) — flag-off performs ZERO fs I/O.

/** Ordered step vocabulary this runner emits (ADR-G-025 §4 subset: this loop
 * has no plan-writing step of its own, so `plan-written` is not applicable
 * here — that belongs to the CLI worker path). */
export const WLT_STEP = {
  START: 'start',
  EDIT_FILE: 'edit-file',
  VERIFY_RUNNING: 'verify-running',
  RESULT: 'result-writing',
} as const;

export type WltStep = (typeof WLT_STEP)[keyof typeof WLT_STEP];

/** One line of `.tasks/task-{taskId}.progress.jsonl` (JSON + trailing `\n`). */
export interface WltProgressEvent {
  ts: string;
  step: WltStep;
  detail: string;
  seq: number;
}

function ensureTasksDir(projectRoot: string): string {
  const dir = join(projectRoot, '.tasks');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Bind a fail-soft progress emitter to one task run. No-ops (zero fs I/O)
 * when `enabled` is false. A write failure (e.g. read-only fs, disk full,
 * `.tasks` blocked by a same-named file) must never interrupt the agentic
 * loop — errors are swallowed.
 */
function createProgressEmitter(
  taskId: string,
  projectRoot: string,
  enabled: boolean,
): (step: WltStep, detail: string) => void {
  let seq = 0;
  return (step, detail) => {
    if (!enabled) return;
    seq += 1;
    const event: WltProgressEvent = { ts: new Date().toISOString(), step, detail, seq };
    // WORKER-LIVE-LOG (#582): each step is also a live activity row on the
    // sprint event stream (same flag; fail-soft inside the emitter).
    emitWorkerActivity(projectRoot, enabled, {
      taskId,
      line: `${step}: ${detail}`,
      kind: 'step',
      detail: { step, seq },
    });
    try {
      const tasksDir = ensureTasksDir(projectRoot);
      appendFileSync(
        join(tasksDir, `task-${taskId}.progress.jsonl`),
        `${JSON.stringify(event)}\n`,
        'utf-8',
      );
    } catch {
      // fail-soft (ADR-G-025 §4) — a progress-stream write failure must
      // never kill the worker loop.
    }
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
    operativeAdrs,
    projectRoot,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    fetchImpl = ((...args) => fetch(...args)) as typeof fetch,
    dispatcher: injectedDispatcher,
    logger = () => undefined,
    liveTrace,
    approvalGate,
  } = opts;

  const baseDispatcher = injectedDispatcher ?? buildDefaultDispatcher(projectRoot);
  // born-611: approval-gate sarımı — flag-off/absent yolunda wrapper YOK,
  // referans bire-bir baseDispatcher (wrapDispatcherWithApprovalGate kontratı).
  const dispatcher = approvalGate
    ? wrapDispatcherWithApprovalGate(baseDispatcher, {
        enabled: approvalGate.enabled,
        gate: approvalGate.gate,
        scopeId: approvalGate.scopeId,
      })
    : baseDispatcher;
  const emitProgress = createProgressEmitter(taskId, projectRoot, liveTrace?.enabled === true);
  emitProgress(WLT_STEP.START, `model=${model} host=${host} maxIterations=${maxIterations}`);

  const messages: OllamaMessage[] = [
    { role: 'system', content: buildSystemPrompt(scope, goNogo, operativeAdrs) },
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
      emitProgress(WLT_STEP.RESULT, `NO_GO api_error: fetch failed (${msg})`);
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
      emitProgress(WLT_STEP.RESULT, `NO_GO api_error: HTTP ${chatRes.status}`);
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
      emitProgress(WLT_STEP.RESULT, `NO_GO api_error: non-JSON body (${msg})`);
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
      emitProgress(WLT_STEP.RESULT, `${sa} (no_tool_calls)`);
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
        emitProgress(WLT_STEP.RESULT, `${validSa} (task_done)`);
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
      const bashCmd = name === 'run_bash' ? String(args['cmd'] ?? args['command'] ?? '') : '';
      const isTestRun = name === 'run_bash' && looksLikeTestCommand(bashCmd);
      if (isTestRun) {
        emitProgress(WLT_STEP.VERIFY_RUNNING, bashCmd.slice(0, 200));
      }

      let result: string;
      try {
        result = await dispatcher.dispatch(name, args);
      } catch (err) {
        result = `[mcp-error] ${name}: ${err instanceof Error ? err.message : String(err)}`;
      }

      // Track filesChanged on POST-DISPATCH success only (advisor #2).
      if ((name === 'write_file' || name === 'edit_file') && !result.startsWith('[mcp-error]')) {
        const targetPath = String(args['path'] ?? '');
        filesChanged.add(targetPath);
        emitProgress(WLT_STEP.EDIT_FILE, `${name} ${targetPath}`);
      }

      // testsPassed sniffer for run_bash.
      if (isTestRun) {
        testsPassed = !bashOutputSuggestsFailure(result);
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
  emitProgress(WLT_STEP.RESULT, `${sa} (max_iterations)`);
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
