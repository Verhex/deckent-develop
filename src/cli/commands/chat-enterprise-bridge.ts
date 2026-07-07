// ═══ chat-enterprise-bridge — REPL enterprise slash command bridge ═══════════
//
// Sprint 221 Task 221-008.
//
// Bridges REPL slash commands (/audit /rbac /flow /cost) to the corresponding
// enterprise CLI handlers. The underlying logic lives in audit.ts, rbac.ts,
// flow.ts, cost.ts — this module is the CALLER; those definition files are
// excluded from the kanit grep check per task spec.
//
// Usage:
//   const result = await dispatchEnterpriseSlash('/cost', [], { spawnFn });
//   if (result.handled) console.log(result.output);
//
// Tests inject opts.spawnFn to stay hermetic (no real subprocess spawns).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Async function that invokes the deckent CLI with the given args list and returns stdout. */
export type EnterpriseSpawnFn = (args: string[]) => Promise<string>;

/** Injection options — tests supply a fake spawnFn to stay hermetic. */
export interface EnterpriseBridgeOptions {
  spawnFn?: EnterpriseSpawnFn;
}

/** Result type — handled=false means the slash is unknown; caller falls through. */
export type EnterpriseDispatchResult =
  | { handled: true; output: string }
  | { handled: false };

// ─── Command Map ──────────────────────────────────────────────────────────────
//
// Maps REPL slash name → default CLI subcommand args for entry.js.
// User-supplied args are appended after these defaults.

const ENTERPRISE_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  '/audit': ['audit'],
  '/rbac':  ['rbac', 'roles'],
  '/flow':  ['flow', 'list'],
  '/cost':  ['cost', 'show'],
};

// ─── Default spawn ────────────────────────────────────────────────────────────

function resolveEntryPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = dirname(__filename);
  // dist/cli/commands/ → ../entry.js → dist/cli/entry.js
  return join(__dirname, '..', 'entry.js');
}

/**
 * Exported (was module-private) purely so tests/cli/spawn-error-listener.test.ts
 * can exercise the real spawn implementation directly — mirrors the
 * already-exported `defaultPersistentSpawn` in chat-session.ts for the
 * identical testing need. No behavior change.
 */
export function defaultSpawnFn(args: string[]): Promise<string> {
  return new Promise<string>((resolve) => {
    const entryPath = resolveEntryPath();
    const child = spawn(process.execPath, [entryPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let out = '';
    let settled = false;
    const settle = (value: string): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => { out += chunk; });
    child.stderr?.on('data', (chunk: string) => { out += chunk; });
    // Sprint 380 T-380-005 — an EventEmitter 'error' event with no listener
    // throws as an uncaught exception (Node contract); without this, a spawn
    // failure here (e.g. dist/cli/entry.js missing/moved) crashed the whole
    // REPL process. Node also does not guarantee 'close' fires after
    // 'error', so settle() here instead of leaving the Promise to hang
    // forever — tagged like the existing `[mcp-error]` convention
    // (chat-native.ts) used for other dispatcher-level failures.
    child.once('error', (err) => {
      settle(`[enterprise-error] ${err.message}`);
    });
    child.once('close', () => settle(out.trim()));
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Dispatch a REPL enterprise slash command to the corresponding CLI handler.
 *
 * Supported: /audit  /rbac  /flow  /cost
 *
 * Unknown commands return `{ handled: false }` — the caller falls through to
 * the regular slash resolver or provider chat path.
 *
 * Extra `args` (e.g. `['--json']`) are appended to the default CLI subcommand.
 * Tests inject `opts.spawnFn` for hermetic execution.
 */
export async function dispatchEnterpriseSlash(
  cmd: string,
  args: string[] = [],
  opts: EnterpriseBridgeOptions = {},
): Promise<EnterpriseDispatchResult> {
  const normalized = cmd.trim().toLowerCase();
  const baseArgs = ENTERPRISE_COMMANDS[normalized];
  if (!baseArgs) return { handled: false };

  const spawnFn = opts.spawnFn ?? defaultSpawnFn;
  const allArgs  = [...baseArgs, ...args];
  const output   = await spawnFn(allArgs);
  return { handled: true, output };
}

/**
 * Return the ordered list of enterprise slash command names.
 * Slash-registry consumers use this to register the enterprise group.
 */
export function enterpriseSlashNames(): readonly string[] {
  return Object.keys(ENTERPRISE_COMMANDS);
}
