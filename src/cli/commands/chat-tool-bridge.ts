// ═══ chat-tool-bridge — REPL slash → MCP tool → deckent CLI bridge ═══════════
//
// Wires the native REPL's McpToolDispatcher onto the real deckent CLI. When a
// slash command resolves to an MCP tool (chat-slash-registry.ts maps
// /status→deckent_status, /recall→deckent_memory_query, /sprint→deckent_history),
// runChatNativeLoop calls `dispatcher.dispatch(tool, args)`. This dispatcher
// translates that tool name into a `dist/cli/entry.js <subcommand>` spawn and
// returns its stdout, replacing the prior NOOP "tool not yet wired" stub.
//
// Spawn pattern mirrors chat-enterprise-bridge.ts (the sibling slash bridge).
// Tests inject `opts.spawnFn` to stay hermetic (no real subprocess spawns).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { McpToolDispatcher } from './chat-native.js';

// ─── Tool → CLI subcommand map ─────────────────────────────────────────────
//
// Allow-list of read-only MCP tools that are safe to spawn headlessly (each
// finishes quickly and never blocks on a stdin confirmation prompt). Anything
// outside this map (notably deckent_plan / start / run — interactive, long, or
// disk-writing) is refused with a tagged error so the headless spawn never
// hangs. Positional args (e.g. `/audit sprint-224`) flow through `args._rest`.

const TOOL_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  deckent_status: ['status'],
  deckent_history: ['history'],
  deckent_retro: ['retro'],
  deckent_doctor: ['doctor'],
  deckent_models: ['models'],
  deckent_analyze_project: ['analyze'],
  deckent_review: ['review'],
  deckent_explain: ['explain'],
  deckent_agent_list: ['agent', 'list'],
  deckent_skill_list: ['skill', 'list'],
  deckent_feature_query: ['features'],
  // NOTE: deckent_audit is intentionally NOT here — `deckent audit` runs the
  // Brain self-audit gate (provider-backed evaluation) and can block 30-60s+,
  // which would freeze the REPL turn. Run it standalone via `deckent audit`.
  // deckent_memory_query is special-cased below: it needs the `query` arg
  // appended as the `recall <query>` positional.
};

/** Safety net: kill a headless CLI spawn that runs longer than this (ms). */
const SPAWN_TIMEOUT_MS = 30_000;

// ─── Spawn injection ────────────────────────────────────────────────────────

/** Async function that invokes the deckent CLI with the given args and returns combined stdout+stderr. */
export type CliToolSpawnFn = (args: string[]) => Promise<string>;

export interface CliToolDispatcherOptions {
  /** Inject a fake spawn for hermetic tests; omit for the real child_process spawn. */
  spawnFn?: CliToolSpawnFn;
}

function resolveEntryPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // dist/cli/commands/ → ../entry.js → dist/cli/entry.js
  return join(__dirname, '..', 'entry.js');
}

function defaultSpawnFn(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const entryPath = resolveEntryPath();
    const child = spawn(process.execPath, [entryPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let out = '';
    let settled = false;
    // Safety net: if a command runs past the budget (an unexpectedly slow or
    // auth-blocked subcommand), kill it and surface a tagged error rather than
    // freezing the REPL turn forever.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      reject(new Error(`timed out after ${SPAWN_TIMEOUT_MS / 1000}s`));
    }, SPAWN_TIMEOUT_MS);
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => { out += chunk; });
    child.stderr?.on('data', (chunk: string) => { out += chunk; });
    child.once('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(out.trim());
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an McpToolDispatcher that runs read-only deckent CLI subcommands.
 *
 * Supported: deckent_status, deckent_history, deckent_memory_query (recall).
 * Any other tool — including deckent_plan — returns a `[mcp-error] tool not
 * allowed: <name>` string. Per the McpToolDispatcher contract, dispatch NEVER
 * throws: spawn failures and bad args are returned as `[mcp-error] …` strings
 * so the chat loop can surface them as ordinary turn output.
 */
export function createCliToolDispatcher(opts: CliToolDispatcherOptions = {}): McpToolDispatcher {
  const spawnFn = opts.spawnFn ?? defaultSpawnFn;
  return {
    async dispatch(name, args) {
      let cliArgs: string[];
      if (name === 'deckent_memory_query') {
        const query = typeof args['query'] === 'string' ? (args['query'] as string).trim() : '';
        if (query.length === 0) return '[mcp-error] recall: query required';
        cliArgs = ['recall', query];
      } else {
        const base = TOOL_COMMANDS[name];
        if (!base) return `[mcp-error] tool not allowed: ${name}`;
        cliArgs = [...base];
        // Positional args from a slash line (e.g. `/audit sprint-224`) arrive
        // as args._rest; append the string entries to the subcommand.
        const rest = args['_rest'];
        if (Array.isArray(rest)) {
          for (const r of rest) if (typeof r === 'string') cliArgs.push(r);
        }
      }
      try {
        return await spawnFn(cliArgs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `[mcp-error] ${name}: ${msg}`;
      }
    },
  };
}
