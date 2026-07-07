// ═══ Chat Command (Sprint 190 T-190-004) ════════════════════════════
// Path B — `deckent chat` spawns the user's installed AI CLI
// (claude/codex/gemini) with stdio inheritance, signal forwarding,
// and DECKENT_MCP_AUTO_ATTACH=1 environment hint.
//
// MCP auto-attach wiring + tool-use loop control lives in T-190-005
// (src/cli/helpers/mcp-attach.ts). This command just sets the env flag
// so downstream attachment helpers can opt in.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Command } from 'commander';

import { runChatNativeLoop, createSubscriptionChatAdapter, type ChatProviderAdapter } from './chat-native.js';
import { createCliToolDispatcher } from './chat-tool-bridge.js';
import { resolveChatAdapter } from './chat-provider-parity.js';
import { ClaudeAdapter, type ProviderDetectResult } from '../../providers/claude.js';
import { CodexAdapter } from '../../providers/codex.js';
import { GeminiAdapter } from '../../providers/gemini.js';
import { OllamaAdapter } from '../../providers/ollama.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { PROVIDER_PACKAGES } from '../../core/provider-packages.js';
import { MemoryStore } from '../../core/memory-store.js';
import type { ChatTurn } from '../../core/memory-types.js';
import { print, printError } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { ensureMcpAttached, type McpHost } from '../helpers/mcp-attach.js';
import { resolveProjectRoot } from '../helpers/process.js';

// ─── Types ──────────────────────────────────────────────────────────

export type ChatTool = 'claude' | 'codex' | 'gemini';

export interface ChatOptions {
  tool?: ChatTool;
  local?: boolean;
  native?: boolean;
  checkMcp?: boolean;
  resume?: string;
  resumeLimit?: string;
  once?: boolean;
  message?: string;
}

/** Default number of prior turns shown by `deckent chat --resume`. */
export const DEFAULT_RESUME_LIMIT = 10;

/** detect() result paired with the provider name that produced it. */
interface ProviderProbe {
  tool: ChatTool;
  detect: ProviderDetectResult;
}

// ─── Constants ──────────────────────────────────────────────────────

const NO_PROVIDER_MESSAGE =
  'No AI CLI found. Searched: claude (Anthropic), codex (OpenAI), gemini (Google).\n' +
  'Install options:\n' +
  `  • claude  — https://claude.ai/download  (npm: ${PROVIDER_PACKAGES.claude.installHint})\n` +
  `  • codex   — ${PROVIDER_PACKAGES.codex.installHint}\n` +
  `  • gemini  — ${PROVIDER_PACKAGES.gemini.installHint}\n` +
  'Alternatives:\n' +
  '  • deckent chat --native  — built-in chat (no host CLI required)\n' +
  '  • deckent serve          — open dashboard chat in your browser';

/** Priority order — first ready provider wins during auto-detect. */
const PROVIDER_PRIORITY: readonly ChatTool[] = ['claude', 'codex', 'gemini'];

// ─── Naïve Mode (Sprint 190 T-190-007) ──────────────────────────────
//
// The user can say "merhaba" without triggering an MCP tool, OR ask
// Deckent to do something actionable. The host AI CLI is told the rule
// via a system prompt we inject (env var for all hosts + claude's
// --append-system-prompt CLI flag for the Claude binary).

/** Single source of truth for the casual-vs-task classifier. */
const TASK_INTENT_KEYWORDS: readonly string[] = [
  'start sprint',
  'start a sprint',
  'run sprint',
  'launch sprint',
  'kick off sprint',
  'plan sprint',
  'check status',
  'sprint status',
  'show status',
  'show debt',
  'show retro',
  'fix bug',
  'fix this bug',
  'fix the bug',
  'patch this',
  'patch this bug',
  'run task',
  'run the task',
  'execute task',
  'remember that',
  'save to memory',
  'kill sprint',
  'cleanup sprint',
  'cleanup the sprint',
  'recover sprint',
  'query memory',
  'search memory',
  'plan a sprint',
  'create a sprint',
  'create sprint',
  // Automation surfaces (make-usable batch): route autonomous/nervous phrases to
  // the deckent tools instead of letting them fall through to host-AI chitchat.
  'autonomous status',
  'enable autonomous',
  'start autonomous',
  'stop autonomous',
  'autonomous backlog',
  'pending approvals',
  'pending approval',
  'show pending',
  'nervous status',
  'enable nervous',
  'nervous system',
  // Turkish equivalents (mirrors the casual list's TR entries).
  'otonom durum',
  'otonom başlat',
  'bekleyen onay',
  'onay bekleyen',
  'nervous durum',
];

/** Words that strongly mark casual chit-chat — never trigger MCP. */
const CASUAL_INTENT_KEYWORDS: readonly string[] = [
  'merhaba',
  'selam',
  'hi',
  'hello',
  'hey',
  'naber',
  'good morning',
  'good evening',
  'good afternoon',
  'how are you',
  'what can you do',
  'what is deckent',
  "what's deckent",
  'tell me about deckent',
  'who are you',
  'thanks',
  'thank you',
  'teşekkür',
  'tesekkur',
];

/** Classifier output — used by both tests and runtime hints. */
export type ChatIntent = 'casual' | 'task' | 'ambiguous';

/**
 * Lightweight, deterministic intent classifier shared by the system prompt
 * documentation and any future runtime gate. Pure function — case-insensitive
 * substring match on the canonical keyword tables above.
 *
 * Tie-break: an utterance that contains BOTH a task and a casual marker
 * resolves to `'task'` (acting on the actionable verb is safer than
 * answering casually and missing a request).
 */
export function classifyChatIntent(input: string): ChatIntent {
  const normalized = input.toLowerCase().trim();
  if (normalized.length === 0) return 'ambiguous';

  if (matchesAny(normalized, TASK_INTENT_KEYWORDS)) return 'task';
  if (matchesAny(normalized, CASUAL_INTENT_KEYWORDS)) return 'casual';
  return 'ambiguous';
}

/**
 * Word-boundary aware keyword match. Multi-word keywords (e.g. "start sprint")
 * use the bare phrase since a substring hit inside a longer phrase still
 * carries the intent. Single-word keywords (e.g. "hi") are anchored by
 * non-word boundaries so they do not bleed into longer words like "thing".
 */
function matchesAny(text: string, keywords: readonly string[]): boolean {
  for (const k of keywords) {
    if (k.includes(' ')) {
      if (text.includes(k)) return true;
    } else {
      const re = new RegExp(`(^|\\W)${escapeRegex(k)}(\\W|$)`);
      if (re.test(text)) return true;
    }
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Canonical system prompt injected into the host AI CLI on `deckent chat`.
 * Tests pin the wording so the Trinity AI-Assistant persona stays stable
 * across refactors.
 */
export function buildNaiveSystemPrompt(): string {
  return [
    "You are Deckent's conversational assistant — the Trinity AI-Asistan persona.",
    'You give the user one chat surface that is BOTH casual and task-driven.',
    '',
    'Decision heuristic (apply on EVERY user turn):',
    '',
    '1. CASUAL — greetings, questions about Deckent itself, brainstorming, small talk.',
    '   Examples: "merhaba", "hi", "what can you do", "tell me about Deckent".',
    '   → Respond naturally in plain language. DO NOT call any MCP tool.',
    '',
    '2. TASK — the user asks Deckent to do something actionable.',
    '   Examples: "start a sprint to add rate limiting", "check sprint status",',
    '   "fix this bug", "remember that the deploy freeze is June 1st", "query memory for X".',
    '   → Invoke the matching Deckent MCP tool. Suggested mapping:',
    '     • start / launch / kick off sprint  → deckent_start',
    '     • check / show status              → deckent_status',
    '     • plan / create sprint             → deckent_plan',
    '     • fix this bug / run task          → deckent_run',
    '     • query / search memory            → deckent_memory_query',
    '     • remember / save note             → deckent_memory_query (then memory write)',
    '     • kill / cleanup / recover sprint  → deckent_kill / deckent_cleanup / deckent_recover',
    '',
    '3. AMBIGUOUS — the request is unclear or could be either casual or actionable.',
    '   → Ask ONE concise clarifying question before invoking any tool.',
    '',
    'Never fabricate tool results. If a tool errors, surface the error verbatim.',
    'Stay within the Deckent MCP toolset; do not invent tools.',
  ].join('\n');
}

// ─── Provider Detection ─────────────────────────────────────────────

/**
 * Probe every provider in priority order and return their detect() results.
 * Exposed for tests — production callers should prefer {@link selectProvider}.
 */
export async function probeProviders(projectRoot: string): Promise<ProviderProbe[]> {
  const adapters: Record<ChatTool, { detect: () => Promise<ProviderDetectResult> }> = {
    claude: new ClaudeAdapter(projectRoot),
    codex: new CodexAdapter(projectRoot),
    gemini: new GeminiAdapter(projectRoot),
  };

  const probes: ProviderProbe[] = [];
  for (const tool of PROVIDER_PRIORITY) {
    try {
      const detect = await adapters[tool].detect();
      probes.push({ tool, detect });
    } catch {
      probes.push({
        tool,
        detect: { binary: false, auth: false, ready: false },
      });
    }
  }
  return probes;
}

/**
 * Auto-detect: pick the first provider with `ready: true`, then fall back to
 * the first `ready: 'partial'` (binary present, auth missing — still usable
 * since the CLI itself can prompt for credentials interactively).
 */
export function selectProvider(probes: ProviderProbe[]): ProviderProbe | null {
  const ready = probes.find(p => p.detect.ready === true);
  if (ready) return ready;
  const partial = probes.find(p => p.detect.ready === 'partial');
  if (partial) return partial;
  return null;
}

// ─── Local Provider Detection (--local / Ollama) ────────────────────

/** Resolved local-runtime readiness for `deckent chat --local`. */
export interface LocalProviderStatus {
  /** True only when the server is reachable AND ≥1 model is installed. */
  ready: boolean;
  /** Resolved endpoint (post env-override) — surfaced in honest-fail hints. */
  host: string;
  /** Human-readable reason (server unreachable / no models / N models ready). */
  reason: string;
  /** Locally installed model tags from `/api/tags`. */
  models: string[];
}

/**
 * Probe the local LLM runtime (Ollama) so `deckent chat --local` can wire onto
 * it — or honest-fail when nothing is reachable. NEVER throws (delegates to the
 * adapter's never-throwing {@link OllamaAdapter.detect}); `ready` is true only
 * for a fully usable server (reachable + at least one model pulled). A reachable
 * server with zero models reports `ready: false` with an actionable reason so we
 * never silently launch a session that cannot generate a single token.
 *
 * Exposed for tests — production calls it inside the chat action.
 */
export async function detectLocalProvider(projectRoot: string): Promise<LocalProviderStatus> {
  const detect = await new OllamaAdapter(projectRoot).detect();
  return {
    ready: detect.ready === true,
    host: detect.endpoint,
    reason: detect.reason,
    models: detect.models,
  };
}

// ─── Chat Resume (Sprint 190 T-190-006) ─────────────────────────────

/**
 * Load the last N turns of a stored chat session for `deckent chat --resume`.
 * Returns an empty array if the DB does not exist yet — the chat command
 * still launches in that case (clean-slate session).
 */
export function loadChatResume(
  projectRoot: string,
  sessionId: string,
  limit: number = DEFAULT_RESUME_LIMIT,
): ChatTurn[] {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return [];

  const store = new MemoryStore(dbPath);
  try {
    return store.getChatHistory(sessionId, limit);
  } finally {
    store.close();
  }
}

/** Render a chat history block for `deckent chat --resume`. */
export function renderChatResume(sessionId: string, turns: ChatTurn[]): string {
  if (turns.length === 0) {
    return `No prior turns for chat session "${sessionId}". Starting fresh.`;
  }
  const lines: string[] = [`Resuming chat session "${sessionId}" — last ${turns.length} turn(s):`];
  for (const turn of turns) {
    const prefix = turn.role === 'user' ? '› user' : '‹ assistant';
    lines.push(`  ${prefix} (turn ${turn.turn_index}): ${turn.content}`);
  }
  return lines.join('\n');
}

// ─── Subprocess Spawn ───────────────────────────────────────────────

export interface SpawnChatResult {
  child: ChildProcess;
  detach: () => void;
}

export interface SpawnChatOptions {
  /**
   * Inject the Trinity AI-Asistan naïve-mode system prompt. When true the
   * prompt is forwarded two ways so each host can pick the channel it
   * supports:
   *   - `DECKENT_CHAT_SYSTEM_PROMPT` env var (all hosts)
   *   - `--append-system-prompt <text>` CLI args (claude only — its
   *     documented system-prompt injection flag)
   * Default: `false` (bare spawn shape — preserved for legacy callers and
   * unit tests that pin the minimal `args === []` contract).
   */
  naiveMode?: boolean;
}

/**
 * Spawn the chosen AI CLI as a child process with stdio inherited so the
 * user gets a full interactive terminal. SIGINT/SIGTERM are forwarded to
 * the child for graceful Ctrl+C / shutdown.
 */
export function spawnChatProcess(
  tool: ChatTool,
  opts: SpawnChatOptions = {},
): SpawnChatResult {
  const naiveMode = opts.naiveMode === true;
  const systemPrompt = naiveMode ? buildNaiveSystemPrompt() : null;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DECKENT_MCP_AUTO_ATTACH: '1',
  };
  if (systemPrompt) env.DECKENT_CHAT_SYSTEM_PROMPT = systemPrompt;

  const args: string[] = naiveMode && tool === 'claude' && systemPrompt
    ? ['--append-system-prompt', systemPrompt]
    : [];

  const child = spawn(tool, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });

  const forward = (signal: NodeJS.Signals) => () => {
    if (!child.killed) {
      try { child.kill(signal); } catch { /* child already gone */ }
    }
  };

  const onSigint = forward('SIGINT');
  const onSigterm = forward('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  const detach = () => {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  };

  return { child, detach };
}

// ─── Command Registration ───────────────────────────────────────────

export function registerChat(program: Command): void {
  program
    .command('chat')
    .description('Start a conversational session with Deckent. Uses your installed AI CLI.')
    .option('--tool <name>', 'AI CLI to launch (claude | codex | gemini)')
    .option('--local', 'Use a local LLM (Ollama) — reserved for T-190-009')
    .option('--check-mcp', 'Verify Deckent MCP is attached before starting (T-190-005)')
    .option('--resume <sessionId>', 'Resume a previous chat session — prints recent turns before launch')
    .option('--resume-limit <n>', `Number of prior turns to show with --resume (default ${DEFAULT_RESUME_LIMIT})`)
    .option('--native', 'Use native tool-use loop instead of spawning host AI CLI')
    .option('--once', 'Single-turn mode: send one message and exit (use with --native)')
    .option('--message <text>', 'Message text for single-turn mode (implies --native --once)')
    .action(async (opts: ChatOptions) => {
      const projectRoot = resolveProjectRoot();

      if (opts.resume) {
        const parsedLimit = opts.resumeLimit !== undefined
          ? Number.parseInt(opts.resumeLimit, 10)
          : DEFAULT_RESUME_LIMIT;
        const limit = Number.isFinite(parsedLimit) && parsedLimit >= 0
          ? parsedLimit
          : DEFAULT_RESUME_LIMIT;
        const turns = loadChatResume(projectRoot, opts.resume, limit);
        print(renderChatResume(opts.resume, turns));
      }

      const lang = getLanguage();

      // `--local` runs the native tool-use loop against an on-device LLM
      // (Ollama) instead of a host AI CLI. It shares the native code path —
      // only the provider differs — so it inherits the real tool dispatcher,
      // single-turn (`--once`/`--message`) and REPL modes for free.
      const isLocalMode = opts.local === true;
      const isNativeMode = opts.native === true || opts.message !== undefined || isLocalMode;
      if (isNativeMode) {
        const isOnce = opts.once === true || opts.message !== undefined;

        let nativeProvider: ChatProviderAdapter;
        if (isLocalMode) {
          // Honest-fail when no local runtime is reachable — NEVER silently
          // fall back to a cloud provider (the whole point of --local is to
          // stay on-device). A reachable-but-model-less server fails here too,
          // with the adapter's actionable `ollama pull <model>` reason.
          const local = await detectLocalProvider(projectRoot);
          if (!local.ready) {
            printError(new Error(getMessage('chat.local_unavailable', lang, {
              host: local.host,
              reason: local.reason,
            })));
            process.exitCode = 1;
            return;
          }
          const model = process.env['DECKENT_OLLAMA_MODEL'] ?? local.models[0] ?? 'llama3';
          nativeProvider = resolveChatAdapter('ollama', { ollamaHost: local.host, ollamaModel: model });
          print(getMessage('chat.local_launching', lang, { host: local.host, model }));
        } else {
          try {
            nativeProvider = createSubscriptionChatAdapter();
          } catch {
            nativeProvider = {
              async send(_msgs) {
                return { text: getMessage('chat.native_provider_disconnected', lang), stopReason: 'end_turn' as const };
              },
            };
          }
        }

        // Real in-process MCP tool dispatcher — maps deckent_* tool calls to
        // `dist/cli/entry.js <subcommand>` spawns (the same bridge the Ink REPL
        // uses). Replaces the prior placeholder stub that returned
        // "tool … not yet wired" for every call. NEVER throws: unknown/blocked
        // tools and spawn failures come back as `[mcp-error] …` turn text.
        const dispatcher = createCliToolDispatcher();

        if (isOnce) {
          async function* singleTurnInput(): AsyncGenerator<string> {
            if (opts.message !== undefined) {
              yield opts.message;
              return;
            }
            const rl = createInterface({ input: process.stdin });
            for await (const line of rl) {
              rl.close();
              yield line;
              return;
            }
          }
          await runChatNativeLoop({
            provider: nativeProvider,
            dispatcher,
            input: singleTurnInput(),
            output: print,
            maxTurns: 1,
            gracefulErrors: true,
            lang,
          });
          return;
        }

        // Interactive REPL mode
        print(getMessage('chat.native_repl_banner', lang));
        async function* readStdin(): AsyncGenerator<string> {
          const rl = createInterface({ input: process.stdin });
          try {
            for await (const line of rl) yield line;
          } finally {
            rl.close();
          }
        }
        await runChatNativeLoop({
          provider: nativeProvider,
          dispatcher,
          input: readStdin(),
          output: print,
          gracefulErrors: true,
          lang,
        });
        return;
      }

      const probes = await probeProviders(projectRoot);

      let chosen: ProviderProbe | null;
      if (opts.tool) {
        if (!PROVIDER_PRIORITY.includes(opts.tool)) {
          printError(new Error(`Unknown --tool "${opts.tool}". Expected one of: claude, codex, gemini.`));
          process.exitCode = 1;
          return;
        }
        const match = probes.find(p => p.tool === opts.tool);
        if (!match || !match.detect.binary) {
          printError(new Error(
            `Provider "${opts.tool}" CLI not found in PATH. ${NO_PROVIDER_MESSAGE}`,
          ));
          process.exitCode = 1;
          return;
        }
        chosen = match;
      } else {
        chosen = selectProvider(probes);
        if (!chosen) {
          printError(new Error(NO_PROVIDER_MESSAGE));
          process.exitCode = 1;
          return;
        }
      }

      if (opts.checkMcp) {
        const status = await ensureMcpAttached(chosen.tool as McpHost, {
          checkOnly: true,
          print,
          printError: (msg: string) => printError(new Error(msg)),
        });
        if (status.attached) {
          print(`✓ Deckent MCP attached to ${chosen.tool}.`);
        }
        return;
      }

      const statusHint = chosen.detect.ready === 'partial'
        ? ' (binary OK, auth missing — the CLI will prompt for credentials)'
        : '';
      print(`Deckent chat → launching ${chosen.tool}${statusHint}`);
      print('  DECKENT_MCP_AUTO_ATTACH=1 set for host-side MCP wiring.');

      await ensureMcpAttached(chosen.tool as McpHost, {
        print,
        printError: (msg: string) => printError(new Error(msg)),
      });

      const { child, detach } = spawnChatProcess(chosen.tool, { naiveMode: true });

      await new Promise<void>((resolve) => {
        child.on('exit', (code, signal) => {
          detach();
          if (signal) {
            process.exitCode = 1;
          } else if (typeof code === 'number') {
            process.exitCode = code;
          }
          resolve();
        });
        child.on('error', (err) => {
          detach();
          printError(new Error(`Failed to launch ${chosen!.tool}: ${err.message}`));
          process.exitCode = 1;
          resolve();
        });
      });
    });
}
