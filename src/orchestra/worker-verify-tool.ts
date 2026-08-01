// ─── Worker Verify Tool (TT555 — task 421-002) ──────────────────────────────
//
// TURN-ECONOMY-2 tool-surface layer. Two data-proven waste-classes are killed
// here (trace-audit 555; 413-001/002/003):
//
//   (b) verify-loop run with platform-dependent, hand-typed lint/test commands
//       (a worker guesses `tsc`/`pytest`, gets it wrong for the stack, burns a
//       turn) — {@link verifyTask} resolves the commands from the project's own
//       stack config and returns EACH step's exit code SEPARATELY in one turn.
//
//   (a) EXIT-CODE masking: a failing command piped to a pager (`cmd 2>&1 | tail`)
//       reports the PIPE's exit status (the pager's 0), so a real failure reads
//       back as `is_error:false` and the worker wastes a turn. {@link verifyTask}
//       NEVER pipes — it runs each command unmasked and reads its true exit code.
//
//   (d) env-probe absence (python3-missing → the worker retries with Node): the
//       {@link probeToolInventory} helper lets the caller inject a one-line tool
//       inventory into the worker prompt at sprint start (see SprintContext
//       `toolInventory` in prompt-god-template.ts) so a trial-and-error turn dies.
//
// Layer: orchestra/ → core/ ONLY (ADR-D-004 C2). No import of agents/ (that would
// invert the established agents/worker.ts → orchestra/ direction) — the small
// command-resolution logic reads from core/stack-detector directly rather than
// re-using agents/worker-verify.ts's getVerifyCommands, keeping the dependency
// one-way. worker.ts (agents/) re-exports these symbols as its tool surface.

import { spawn } from 'node:child_process';
import { detectFullStack } from '../core/stack-detector.js';
import type { FullStackResult } from '../core/stack-detector.js';
import type {
  TypeScriptScopedVerificationExecutor,
  TypeScriptScopedVerificationInvocation,
  TypeScriptScopedVerificationProcessResult,
} from '../core/verification-typescript-adapter.js';

// ─── Command resolution ─────────────────────────────────────────────────────

/** The two verify commands a worker runs: a static/type check and the test run. */
export interface ResolvedVerifyCommands {
  /** Type/lint check command (e.g. `npx tsc --noEmit`) — '' when the stack has none. */
  check: string;
  /** Test command (e.g. `npx vitest run`) — '' when the stack has none. */
  test: string;
}

/** Injectable stack→commands resolver seam (tests pass a fixed map; prod uses the real detector). */
export type StackCommandResolver = (projectRoot: string) => FullStackResult['commands'];

const defaultStackResolver: StackCommandResolver = (projectRoot) => detectFullStack(projectRoot).commands;

/**
 * Resolve the platform-neutral verify commands for a project from its detected
 * stack (core/stack-detector's STACK_COMMANDS), so the worker never hand-types a
 * stack-wrong command. Prefers a dedicated no-artifact `typecheck` (e.g.
 * `npx tsc --noEmit`, `go vet`), falling back to `lint` then `build` when a stack
 * defines no typecheck. Both fields are honest-empty ('') when the stack has no
 * such command — the caller/tool then reports that step as skipped, never guessed.
 */
export function resolveVerifyCommands(
  projectRoot: string,
  resolver: StackCommandResolver = defaultStackResolver,
): ResolvedVerifyCommands {
  const c = resolver(projectRoot);
  return {
    check: c.typecheck || c.lint || c.build || '',
    test: c.test || '',
  };
}

// ─── Honest command runner ──────────────────────────────────────────────────

/** One command's honest, un-masked outcome. */
export interface CommandOutcome {
  /** The command's TRUE exit code — never a pipe/pager's masked 0. */
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs a single shell command and returns its outcome. Injectable so tests stay
 * hermetic (no real subprocess) and cross-platform coverage is deterministic.
 * May return the outcome synchronously (test fakes) or as a Promise (production).
 */
export type CommandRunner = (command: string, cwd: string) => CommandOutcome | Promise<CommandOutcome>;

/** Output accumulation cap per stream (spawnSync's old maxBuffer, kept as the honest bound). */
const OUTPUT_CAP_BYTES = 32 * 1024 * 1024;

/**
 * Default production runner. Captures the command's REAL exit code — it does NOT
 * pipe stdout/stderr through `tail`/`head`, which is the exact masking this tool
 * exists to prevent (`cmd | tail` would yield the pager's 0). `shell: true` keeps
 * it platform-neutral (cmd.exe on Windows, /bin/sh elsewhere). Async `spawn`, not
 * `spawnSync` (ADR-D-002 C4): a verify run can take up to 120s and must never
 * block the host event loop (heartbeats, SSE). A signal-killed process has
 * `code === null`; that is a real failure, so it maps to a non-zero code
 * (137 = 128+kill, else 1). A stream exceeding {@link OUTPUT_CAP_BYTES} kills the
 * child — mirroring spawnSync's old maxBuffer failure, never a silent hang.
 */
export const spawnCommandRunner: CommandRunner = (command, cwd) =>
  new Promise<CommandOutcome>((resolve) => {
    const child = spawn(command, { cwd, shell: true, timeout: 120_000 });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (d: string) => {
      stdout += d;
      if (stdout.length > OUTPUT_CAP_BYTES) { stdout = stdout.slice(0, OUTPUT_CAP_BYTES); child.kill('SIGTERM'); }
    });
    child.stderr?.on('data', (d: string) => {
      stderr += d;
      if (stderr.length > OUTPUT_CAP_BYTES) { stderr = stderr.slice(0, OUTPUT_CAP_BYTES); child.kill('SIGTERM'); }
    });
    child.on('error', () => resolve({ exitCode: 1, stdout, stderr }));
    child.on('close', (code, signal) => {
      const exitCode = typeof code === 'number' ? code : (signal ? 137 : 1);
      resolve({ exitCode, stdout, stderr });
    });
  });

/**
 * Production process boundary for an already-admitted TypeScript invocation.
 * The adapter owns what may run; this function only executes its fixed argv
 * without a shell, so it cannot widen verification to the live project.
 */
export const executeAdmittedTypeScriptVerification: TypeScriptScopedVerificationExecutor = (
  invocation: TypeScriptScopedVerificationInvocation,
) => new Promise<TypeScriptScopedVerificationProcessResult>((resolve) => {
  const child = spawn(invocation.executable, [...invocation.argv], {
    cwd: invocation.cwd,
    shell: invocation.shell,
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let settled = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, invocation.timeoutMs);
  const finish = (exitCode: number | null): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    resolve({ exitCode, stdout, stderr, timedOut });
  };

  child.stdout?.setEncoding('utf-8');
  child.stderr?.setEncoding('utf-8');
  child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
  child.on('error', (error: Error) => {
    stderr += error.message;
    finish(null);
  });
  child.on('close', (code) => finish(code));
});

// ─── verify_task ────────────────────────────────────────────────────────────

/** Result of one verify step (check or test). */
export interface VerifyStepResult {
  step: 'check' | 'test';
  /** The resolved command that ran, or '' when the step was skipped. */
  command: string;
  /** The step's TRUE, separately-captured exit code (0 when skipped). */
  exitCode: number;
  /** exitCode === 0 (a skipped step is vacuously ok). */
  ok: boolean;
  /** True when the stack defined no command for this step (nothing was run). */
  skipped: boolean;
  stdout: string;
  stderr: string;
}

/** Aggregate verify_task result — one turn, both steps, honest separate codes. */
export interface VerifyTaskResult {
  /** True iff every non-skipped step exited 0. */
  ok: boolean;
  /** Per-step outcomes in run order: check, then test. */
  steps: VerifyStepResult[];
}

export interface VerifyTaskInput {
  commands: ResolvedVerifyCommands;
  cwd: string;
  /** Injectable runner (default: {@link spawnCommandRunner}). */
  runner?: CommandRunner;
}

/**
 * Run the resolved check + test commands and return each step's HONEST, SEPARATE
 * exit code in a single turn. The two commands run independently — a failing
 * check never masks or short-circuits the test's own reported code, and neither
 * is ever piped to a pager (which would report the pager's 0). This is the
 * platform-neutral, one-turn replacement for a worker hand-running
 * `tsc 2>&1 | tail` then `vitest 2>&1 | tail` across multiple turns.
 */
export async function verifyTask(input: VerifyTaskInput): Promise<VerifyTaskResult> {
  const runner = input.runner ?? spawnCommandRunner;
  const plan: Array<{ step: VerifyStepResult['step']; command: string }> = [
    { step: 'check', command: input.commands.check },
    { step: 'test', command: input.commands.test },
  ];

  const steps: VerifyStepResult[] = [];
  for (const { step, command } of plan) {
    if (!command || command.trim().length === 0) {
      steps.push({ step, command: '', exitCode: 0, ok: true, skipped: true, stdout: '', stderr: '' });
      continue;
    }
    const { exitCode, stdout, stderr } = await runner(command, input.cwd);
    steps.push({ step, command, exitCode, ok: exitCode === 0, skipped: false, stdout, stderr });
  }

  const ok = steps.every((s) => s.skipped || s.ok);
  return { ok, steps };
}

/**
 * Convenience production entry: resolve the stack commands then run them. Kept
 * separate from {@link verifyTask} so tests can drive the pure runner with fixed
 * commands (no stack detection, no real subprocess) while production gets the
 * resolve→run composition in one call.
 */
export function runVerifyTask(
  projectRoot: string,
  opts: { runner?: CommandRunner; resolver?: StackCommandResolver } = {},
): Promise<VerifyTaskResult> {
  const commands = resolveVerifyCommands(projectRoot, opts.resolver);
  return verifyTask({ commands, cwd: projectRoot, ...(opts.runner ? { runner: opts.runner } : {}) });
}

// ─── Environment tool probe (env-probe) ─────────────────────────────────────

/** The fixed set of host tools the env-probe reports on (present/absent). */
export const PROBED_TOOLS = ['python3', 'docker', 'rg'] as const;
export type ProbedTool = (typeof PROBED_TOOLS)[number];

/** Presence map for {@link PROBED_TOOLS}. */
export type ToolInventory = Record<ProbedTool, boolean>;

/** Injectable "is this tool on PATH?" check (tests pass a fake; prod probes PATH). */
export type ToolExistsFn = (tool: string) => boolean | Promise<boolean>;

/**
 * Default PATH-existence check. Platform-neutral: `where` on Windows, `command -v`
 * (a POSIX shell builtin, so run through the shell) elsewhere. Tools are a fixed
 * whitelist ({@link PROBED_TOOLS}) — never user input — so shelling is injection-safe.
 * Async `spawn`, not `spawnSync` (ADR-D-002 C4) — a slow/hung PATH probe must not
 * block the host event loop. Production-only: every test injects a fake, keeping
 * the suite hermetic.
 */
const defaultToolExists: ToolExistsFn = (tool) =>
  new Promise<boolean>((resolve) => {
    const isWin = process.platform === 'win32';
    const child = isWin
      ? spawn('where', [tool], { timeout: 10_000 })
      : spawn(`command -v ${tool}`, { shell: true, timeout: 10_000 });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });

/**
 * Probe the host once (at sprint start) for the tools a worker commonly reaches
 * for. The caller threads {@link formatToolInventory}'s one-line output into the
 * worker prompt (SprintContext `toolInventory`) so a worker never burns a
 * trial-and-error turn discovering, e.g., that `python3` is absent.
 */
export async function probeToolInventory(exists: ToolExistsFn = defaultToolExists): Promise<ToolInventory> {
  const inv = {} as ToolInventory;
  for (const tool of PROBED_TOOLS) inv[tool] = await exists(tool);
  return inv;
}

/** Render an inventory as the stable one-line `python3=yes docker=no rg=yes` form. */
export function formatToolInventory(inv: ToolInventory): string {
  return PROBED_TOOLS.map((t) => `${t}=${inv[t] ? 'yes' : 'no'}`).join(' ');
}
