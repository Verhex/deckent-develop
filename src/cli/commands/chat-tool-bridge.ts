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
  // `models` is a parent command (bare → help); the catalog lives under `list`.
  deckent_models: ['models', 'list'],
  deckent_analyze_project: ['analyze'],
  deckent_review: ['review'],
  deckent_explain: ['explain'],
  deckent_agent_list: ['agent', 'list'],
  deckent_skill_list: ['skill', 'list'],
  deckent_feature_query: ['features'],
  // Cost/observability (read-only). `cost` is a parent command — `cost show` prints
  // budget limits, per-model pricing, and today's spend. `kpi` (bare) prints the
  // scorecard for the current sprint. Exposed to the phone bot (bot-agentic.ts
  // READ_ONLY_BOT_TOOLS). deckent_usage is arg-aware → special-cased in cliArgsFor.
  deckent_cost: ['cost', 'show'],
  deckent_kpi: ['kpi'],
  // config: show (no _rest) is read-only; `config set/import/migrate` mutate
  // config.json and are confirm-gated one layer up (run.tsx classifyTool).
  deckent_config: ['config'],
  // ── Write tools (confirm-gated) ──
  // plan writes .tasks/ JSON from DIRECTIVES; respects the project's configured
  // planning mode. Confirm-gated + the 30s timeout guards a slow AI plan.
  deckent_plan: ['plan'],
  deckent_sync: ['sync'],
  deckent_checkpoint: ['checkpoint'],
  // ── Destructive tools (always-confirm; run.tsx never auto-approves these) ──
  deckent_kill: ['kill'],
  deckent_cleanup: ['cleanup'],
  // recover prompts via readline unless --force; the REPL's always-confirm modal
  // IS the confirmation, so bake in --force to avoid a headless stdin hang.
  deckent_recover: ['recover', '--force'],
  // NOTE: deckent_start / run / watch are intentionally NOT here — long-running
  // (a sprint / worker / live stream) would block the REPL turn. deckent_audit
  // (provider-backed self-audit gate, 30-60s+) and deckent_set_directives
  // (stdin content) are also excluded. Run those standalone via the CLI.
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
 * Resolve an MCP tool name + args to the deckent CLI argv it would spawn.
 *
 * Returns null for a tool not in the allow-list. Used by both the dispatcher
 * (to spawn) and the REPL confirm modal (to show the user the exact command
 * that will run). deckent_memory_query is NOT covered here — it is special-cased
 * in dispatch because its `query` arg maps to a `recall <query>` positional.
 */
export function cliArgsFor(name: string, args: Record<string, unknown>): string[] | null {
  // ── Arg-aware builders (Sprint 269 follow-up — the /autonomous, /audit and
  // /directives slashes dispatch these tools with structured args; the static
  // map below cannot express them). Long-running actions stay excluded:
  // `autonomous start` runs the engine loop and would block the REPL turn
  // (and be killed by SPAWN_TIMEOUT_MS) — run it standalone via the CLI.
  if (name === 'deckent_autonomous') {
    const action = typeof args['action'] === 'string' ? (args['action'] as string) : '';
    if (action === 'status' || action === 'stop' || action === 'pending') return ['autonomous', action];
    if (action === 'approve' || action === 'reject') {
      const id = typeof args['triggerId'] === 'string' ? (args['triggerId'] as string) : '';
      return id ? ['autonomous', action, id] : null;
    }
    if (action === 'backlog_list') return ['autonomous', 'backlog', 'list'];
    if (action === 'backlog_add') {
      const id = typeof args['id'] === 'string' ? (args['id'] as string) : '';
      const title = typeof args['title'] === 'string' ? (args['title'] as string) : '';
      if (!id || !title) return null;
      const argv = ['autonomous', 'backlog', 'add', '--id', id, '--title', title];
      if (typeof args['cron'] === 'string' && (args['cron'] as string).length > 0) {
        argv.push('--cron', args['cron'] as string);
      }
      return argv;
    }
    return null; // start (long-running) and unknown actions stay excluded
  }
  if (name === 'deckent_audit') {
    const action = typeof args['action'] === 'string' ? (args['action'] as string) : 'gate';
    if (action === 'gate') {
      const sprint = typeof args['sprintId'] === 'string' ? (args['sprintId'] as string) : '';
      return sprint ? ['audit', sprint] : ['audit'];
    }
    if (action === 'query') {
      const argv = ['audit', 'query'];
      if (typeof args['channel'] === 'string' && (args['channel'] as string).length > 0) {
        argv.push('--action', args['channel'] as string);
      }
      return argv;
    }
    if (action === 'compliance') return ['audit', 'compliance'];
    return null; // forward/retention (network/destructive) stay CLI-only
  }
  if (name === 'deckent_usage') {
    const argv: string[] = ['usage'];
    if (typeof args['sprint'] === 'string' && (args['sprint'] as string).length > 0) {
      argv.push('--sprint', args['sprint'] as string);
    }
    if (typeof args['since'] === 'string' && (args['since'] as string).length > 0) {
      argv.push('--since', args['since'] as string);
    }
    if (typeof args['until'] === 'string' && (args['until'] as string).length > 0) {
      argv.push('--until', args['until'] as string);
    }
    return argv;
  }
  if (name === 'deckent_resources') {
    const argv: string[] = ['resources'];
    if (args['log'] === true) {
      argv.push('--log');
    } else if (typeof args['log'] === 'string' && (args['log'] as string).length > 0) {
      argv.push('--log', args['log'] as string);
    }
    return argv;
  }
  if (name === 'deckent_set_directives') {
    const content = typeof args['content'] === 'string' ? (args['content'] as string) : '';
    return content.length > 0 ? ['set-directives', '--content', content] : null;
  }

  const base = TOOL_COMMANDS[name];
  if (!base) return null;
  const cliArgs = [...base];
  // Positional args from a slash line (e.g. `/config set k v`) arrive as
  // args._rest; append the string entries to the subcommand.
  const rest = args['_rest'];
  if (Array.isArray(rest)) {
    for (const r of rest) if (typeof r === 'string') cliArgs.push(r);
  }
  return cliArgs;
}

/**
 * Build an McpToolDispatcher that runs deckent CLI subcommands headlessly.
 *
 * Supports the read-only allow-list (TOOL_COMMANDS) plus deckent_config and
 * deckent_memory_query (recall). Any tool outside the allow-list returns a
 * `[mcp-error] tool not allowed: <name>` string. Per the McpToolDispatcher
 * contract, dispatch NEVER throws: spawn failures, timeouts, and bad args are
 * returned as `[mcp-error] …` strings so the chat loop can surface them as
 * ordinary turn output. Write/destructive confirmation is enforced one layer
 * up (run.tsx, via tool-permissions.classifyTool) before dispatch is called.
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
        const built = cliArgsFor(name, args);
        if (!built) return `[mcp-error] tool not allowed: ${name}`;
        cliArgs = built;
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
