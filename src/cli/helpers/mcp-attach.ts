// ═══ MCP Auto-Attach Helper (Sprint 190 T-190-005) ═══════════════════
// Wires the user's host AI CLI (claude / codex / gemini) to the Deckent
// MCP server (`npx deckent-mcp`). On first `deckent chat` run we probe
// the host CLI's MCP registry; if `deckent` is missing we offer to
// attach it. The attach itself just shells out to the host's
// `<host> mcp add deckent -- npx deckent-mcp` subcommand.
//
// Host support note: Claude CLI ships an `mcp` subcommand today
// (`claude mcp list`, `claude mcp add ...`). Codex/Gemini CLIs do not
// yet expose an `mcp` subcommand in stable releases. For those hosts
// we still attempt detection but mark the status as `supported: false`
// with an actionable reason. The chat flow stays functional either
// way — MCP attach is best-effort, not a hard requirement.

import { spawnSync } from 'node:child_process';

// ─── Public Types ───────────────────────────────────────────────────

export type McpHost = 'claude' | 'codex' | 'gemini';

export interface McpAttachStatus {
  host: McpHost;
  /** Host CLI exposes an `mcp` subcommand (`<host> mcp --help` exit 0). */
  supported: boolean;
  /** `deckent` already appears in `<host> mcp list` output. */
  attached: boolean;
  /** Canonical Deckent MCP tool count surfaced in the success message. */
  toolCount: number;
  /** When supported=false or attach failed, human-readable reason. */
  reason?: string;
}

export interface AttachRunnerResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Injection point for tests. Defaults to `spawnSync` with a 10s timeout.
 * Implementations MUST NOT throw — surface failures via the result object.
 */
export type AttachRunner = (
  cmd: string,
  args: readonly string[],
) => AttachRunnerResult;

export interface AttachCommand {
  list: { cmd: string; args: readonly string[] };
  add: { cmd: string; args: readonly string[] };
  /** Host CLI capability gate command (`<host> mcp --help`). */
  probe: { cmd: string; args: readonly string[] };
}

// ─── Constants ──────────────────────────────────────────────────────

/**
 * Canonical count of Deckent MCP tools registered in
 * `src/mcp/tools/index.ts`. Surfaced in the post-attach success message:
 * "Deckent MCP ready — 31 tools available". Bump when registerTools()
 * grows; covered by lint-mcp-tools-count.mjs in another suite.
 */
export const DECKENT_MCP_TOOL_COUNT = 31;

const DECKENT_SERVER_NAME = 'deckent';
const DECKENT_MCP_ARGS = ['--', 'npx', 'deckent-mcp'] as const;

const HOST_COMMANDS: Record<McpHost, AttachCommand> = {
  claude: {
    probe: { cmd: 'claude', args: ['mcp', '--help'] },
    list: { cmd: 'claude', args: ['mcp', 'list'] },
    add: { cmd: 'claude', args: ['mcp', 'add', DECKENT_SERVER_NAME, ...DECKENT_MCP_ARGS] },
  },
  codex: {
    probe: { cmd: 'codex', args: ['mcp', '--help'] },
    list: { cmd: 'codex', args: ['mcp', 'list'] },
    add: { cmd: 'codex', args: ['mcp', 'add', DECKENT_SERVER_NAME, ...DECKENT_MCP_ARGS] },
  },
  gemini: {
    probe: { cmd: 'gemini', args: ['mcp', '--help'] },
    list: { cmd: 'gemini', args: ['mcp', 'list'] },
    add: { cmd: 'gemini', args: ['mcp', 'add', DECKENT_SERVER_NAME, ...DECKENT_MCP_ARGS] },
  },
};

// ─── Default Runner (spawnSync) ─────────────────────────────────────

const DEFAULT_RUNNER: AttachRunner = (cmd, args) => {
  const r = spawnSync(cmd, args as string[], {
    encoding: 'utf-8',
    timeout: 10_000,
    shell: false,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
};

// ─── Public API ──────────────────────────────────────────────────────

export function getAttachCommand(host: McpHost): AttachCommand | null {
  return HOST_COMMANDS[host] ?? null;
}

/**
 * Probe the host CLI to learn (a) whether it supports `mcp` subcommand
 * and (b) whether `deckent` is already attached. Never throws.
 */
export function detectAttachStatus(
  host: McpHost,
  runner: AttachRunner = DEFAULT_RUNNER,
): McpAttachStatus {
  const cmd = HOST_COMMANDS[host];
  if (!cmd) {
    return {
      host,
      supported: false,
      attached: false,
      toolCount: DECKENT_MCP_TOOL_COUNT,
      reason: `Unknown host: ${host}`,
    };
  }

  const probe = safeRun(runner, cmd.probe.cmd, cmd.probe.args);
  if (probe.status !== 0) {
    return {
      host,
      supported: false,
      attached: false,
      toolCount: DECKENT_MCP_TOOL_COUNT,
      reason: `${host} CLI does not expose an "mcp" subcommand (probe exit ${probe.status ?? 'null'}).`,
    };
  }

  const listing = safeRun(runner, cmd.list.cmd, cmd.list.args);
  const attached = listing.status === 0 && containsDeckent(listing.stdout);

  return {
    host,
    supported: true,
    attached,
    toolCount: DECKENT_MCP_TOOL_COUNT,
    reason: attached ? undefined : `${DECKENT_SERVER_NAME} not present in ${host} mcp list output.`,
  };
}

export interface AttachResult {
  ok: boolean;
  alreadyAttached: boolean;
  message: string;
}

/**
 * Attach the Deckent MCP server to the host CLI. Idempotent — if it is
 * already attached we short-circuit and return `alreadyAttached: true`.
 */
export function attachDeckentMcp(
  host: McpHost,
  runner: AttachRunner = DEFAULT_RUNNER,
): AttachResult {
  const cmd = HOST_COMMANDS[host];
  if (!cmd) {
    return { ok: false, alreadyAttached: false, message: `Unknown host: ${host}` };
  }

  const pre = detectAttachStatus(host, runner);
  if (!pre.supported) {
    return {
      ok: false,
      alreadyAttached: false,
      message: pre.reason ?? `${host} CLI does not support MCP attach.`,
    };
  }
  if (pre.attached) {
    return {
      ok: true,
      alreadyAttached: true,
      message: `Deckent MCP already attached to ${host}.`,
    };
  }

  const add = safeRun(runner, cmd.add.cmd, cmd.add.args);
  if (add.status !== 0) {
    return {
      ok: false,
      alreadyAttached: false,
      message:
        `Failed to attach Deckent MCP to ${host} (exit ${add.status ?? 'null'}).` +
        (add.stderr ? ` Stderr: ${add.stderr.trim().slice(0, 200)}` : ''),
    };
  }

  return {
    ok: true,
    alreadyAttached: false,
    message: `Deckent MCP ready — ${DECKENT_MCP_TOOL_COUNT} tools available.`,
  };
}

export interface EnsureAttachedOptions {
  /** y/N prompt — receives the question text, resolves to true/false. */
  promptUser?: (question: string) => Promise<boolean>;
  runner?: AttachRunner;
  /** stdout sink; defaults to console.log. */
  print?: (msg: string) => void;
  /** stderr sink for non-fatal warnings; defaults to console.error. */
  printError?: (msg: string) => void;
  /** Skip the y/N prompt and proceed when missing. */
  autoYes?: boolean;
  /** Detect-only mode (`--check-mcp`); never mutates host CLI config. */
  checkOnly?: boolean;
}

/**
 * Top-level orchestrator used by `deckent chat`.
 *
 * 1. Probe the host CLI's MCP support.
 * 2. If already attached → emit ready message, return status.
 * 3. If `checkOnly` → emit status and return without prompting.
 * 4. If `autoYes` or user accepts y/N prompt → attempt attach.
 * 5. Emit a clear final status line either way.
 */
export async function ensureMcpAttached(
  host: McpHost,
  opts: EnsureAttachedOptions = {},
): Promise<McpAttachStatus> {
  const runner = opts.runner ?? DEFAULT_RUNNER;
  const print = opts.print ?? ((msg: string) => process.stdout.write(`${msg}\n`));
  const printError = opts.printError ?? ((msg: string) => process.stderr.write(`${msg}\n`));

  const initial = detectAttachStatus(host, runner);

  if (!initial.supported) {
    printError(`Deckent MCP attach skipped: ${initial.reason ?? 'host does not support mcp'}`);
    return initial;
  }
  if (initial.attached) {
    print(`Deckent MCP ready — ${DECKENT_MCP_TOOL_COUNT} tools available.`);
    return initial;
  }

  if (opts.checkOnly) {
    print(`Deckent MCP not attached to ${host}. Run \`deckent chat --tool ${host}\` to attach.`);
    return initial;
  }

  let userOk = !!opts.autoYes;
  if (!userOk) {
    const ask = opts.promptUser ?? defaultPromptUser;
    userOk = await ask(`Attach Deckent MCP to ${host}? [y/N] `);
  }
  if (!userOk) {
    print(`Skipped — Deckent MCP not attached. Re-run \`deckent chat\` to retry.`);
    return initial;
  }

  const result = attachDeckentMcp(host, runner);
  if (!result.ok) {
    printError(result.message);
    return { ...initial, reason: result.message };
  }

  print(`Deckent MCP ready — ${DECKENT_MCP_TOOL_COUNT} tools available.`);
  return { ...initial, attached: true, reason: undefined };
}

// ─── Internal Helpers ───────────────────────────────────────────────

function safeRun(
  runner: AttachRunner,
  cmd: string,
  args: readonly string[],
): AttachRunnerResult {
  try {
    return runner(cmd, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: null, stdout: '', stderr: message };
  }
}

function containsDeckent(stdout: string): boolean {
  if (!stdout) return false;
  // Strip ANSI escape sequences (CSI/SGR color codes) before matching —
  // real `mcp list` output from claude CLI is colorized in TTYs, and
  // forwarded color codes break naive boundary regexes.
  const plain = stdout.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  // Match the server name as a whole word — handles both bare names and
  // `deckent:` / `- deckent` style listings without false-matching
  // longer strings like `deckent-dev` or `deckentpro`. Hyphen is allowed
  // as a leading boundary (list bullets) but NOT trailing (so the name
  // does not greedily consume `-dev` suffixes).
  return /(^|[\s:|"'`(\[,-])deckent($|[\s:|"'`)\],])/m.test(plain);
}

async function defaultPromptUser(question: string): Promise<boolean> {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}
