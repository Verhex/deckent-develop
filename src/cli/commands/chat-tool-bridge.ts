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
// Allow-list of read-only tools that are safe to spawn headlessly. Anything
// outside this map (notably deckent_plan — interactive, disk-writing, long)
// is refused with a tagged error so the headless spawn never hangs on a
// stdin confirmation prompt.

const TOOL_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  deckent_status: ['status'],
  deckent_history: ['history'],
  deckent_retro: ['retro'],
  deckent_doctor: ['doctor'],
  deckent_models: ['models'],
  // deckent_memory_query is special-cased below: it needs the `query` arg
  // appended as the `recall <query>` positional.
};

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
  return new Promise<string>((resolve) => {
    const entryPath = resolveEntryPath();
    const child = spawn(process.execPath, [entryPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let out = '';
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => { out += chunk; });
    child.stderr?.on('data', (chunk: string) => { out += chunk; });
    child.once('close', () => resolve(out.trim()));
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
