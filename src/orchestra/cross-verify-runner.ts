// ─── Cross-Verify Runner (XVER-1 Task 276-007) ──────────────────────────────
// Dispatch layer for cross-provider adversarial verification.
//
// Sprint 276 (XVER-1): when a high-stakes task is evaluated DONE/GO_WITH_TECH_DEBT,
// this module can dispatch a SECOND provider whose job is to REFUTE the result rather
// than confirm it. The verdict is written back to the task's `.result` as an advisory
// `crossVerify` field — it is NEVER a downgrade. Brain/insan decides what to do with a
// REFUTED signal (ADR-070 evaluation-integrity: no hard-coded evaluation mutation here).
//
// Layering (composes the pure layers from Tasks 4 + 6):
//   • decideCrossVerify / selectVerifierProvider  ← core/cross-verify.ts  (pure decision)
//   • buildRefutePrompt / parseRefuteVerdict       ← core/cross-verify-prompt.ts (pure prompt+parse)
//   • spawnWorkerMultiProvider                     ← cli/commands/spawn.ts (SSOT spawn; default real path)
//
// Everything is best-effort: the whole feature is config-gated default-OFF (Task 5), and
// every failure path (no second provider, spawn throw, unparseable output, unwritable
// `.result`) degrades gracefully without ever throwing into the EVALUATE pipeline. When
// `cross_verify.enabled !== true` the caller never reaches this module, so behavior is
// byte-for-byte unchanged.
//
// ADR-008 (one-way imports): orchestra/ may import core/ — this module imports the two
// pure core/ helpers + the provider registry. The heavy spawn/poll dependencies
// (cli/commands/spawn.ts, ./sprint-phases.ts) are pulled in via deferred dynamic import
// inside the DEFAULT spawn function only, so there is no init-time circular dependency
// and tests (which inject `spawnVerifier`) never load them.

import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { TaskEvaluation } from '../core/types.js';
import type { Task, TaskResult, ProviderName } from '../core/types.js';
import type { ResolvedConfig } from '../core/types.js';
import { TASKS_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import { providerRegistry } from '../core/provider.js';
import { decideCrossVerify } from '../core/cross-verify.js';
import { getDefaultProviderName } from './sprint-utils.js';
import {
  buildRefutePrompt,
  parseRefuteVerdict,
  type RefuteVerdict,
} from '../core/cross-verify-prompt.js';

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Advisory cross-verify metadata written to a task's `.result` under `crossVerify`.
 * Purely advisory — never alters the task's evaluation.
 */
export interface CrossVerifyAdvisory {
  /** Provider that performed the adversarial verification. */
  verifier: ProviderName;
  /** Verdict the verifier reached: refuted | confirmed | unclear. */
  verdict: RefuteVerdict['verdict'];
  /** Reason / evidence text extracted from the verifier's VERDICT line. */
  reason: string;
}

/** Outcome of {@link runCrossVerify}. */
export interface CrossVerifyRunResult {
  /** True when a verifier was actually dispatched and produced a verdict. */
  ran: boolean;
  /** When `ran` is false, a short diagnostic explaining why it was skipped. */
  skippedReason?: string;
  /** Advisory verdict (present only when `ran` is true). */
  advisory?: CrossVerifyAdvisory;
  /** Convenience flag: `advisory?.verdict === 'refuted'`. Always false when skipped. */
  refuted: boolean;
  /**
   * Enforcement signal (Task 323-004 / A18): true only when `refuted` AND
   * `config.cross_verify.enforce_refuted === true`. The runner NEVER mutates the
   * task's evaluation (ADR-070) — it only SURFACES this flag so the evaluation
   * layer can downgrade the task to NO_GO and trigger FIX. Always false when
   * advisory-only (enforce_refuted off, the default) or skipped.
   */
  blocked: boolean;
}

/** Input passed to a {@link SpawnVerifierFn}. */
export interface SpawnVerifierInput {
  projectRoot: string;
  task: Task;
  result: TaskResult;
  /** Provider chosen to run the adversarial verification. */
  verifierProvider: ProviderName;
  /** Model the verifier worker should run with. */
  verifierModel: string;
  /** The adversarial "refute" prompt (from {@link buildRefutePrompt}). */
  prompt: string;
  /** Short timeout budget in ms for the verifier to produce output. */
  timeoutMs: number;
}

/**
 * Spawns the adversarial verifier and returns its RAW output text (which
 * {@link parseRefuteVerdict} then scans for the VERDICT line). Injectable so unit
 * tests run hermetically without spawning a real worker.
 */
export type SpawnVerifierFn = (input: SpawnVerifierInput) => Promise<string>;

/** Options for {@link runCrossVerify}. */
export interface RunCrossVerifyOptions {
  /**
   * Providers bootstrapped in this environment. Defaults to the live
   * {@link providerRegistry} contents — tests inject an explicit list.
   */
  availableProviders?: readonly ProviderName[];
  /** Injectable verifier spawn. Default = {@link defaultSpawnVerifier}. */
  spawnVerifier?: SpawnVerifierFn;
  /** Verifier model override. Default = the original task's model. */
  verifierModel?: string;
  /** Verifier timeout budget in ms (short by design). Default 120_000. */
  timeoutMs?: number;
}

/** Default short timeout for the adversarial verifier (2 minutes). */
export const CROSS_VERIFY_TIMEOUT_MS = 120_000;

// ─── Default real spawn (production path; never exercised by hermetic tests) ──

/**
 * Default verifier spawn: dispatch a worker on the chosen verifier provider with the
 * adversarial prompt, then read the verdict from its `.result` notes.
 *
 * The heavy dependencies (`spawnWorkerMultiProvider`, `pollForResultFile`) are pulled in
 * via deferred dynamic import so this orchestra module has no init-time edge to cli/ or a
 * self-edge to sprint-phases.ts. Best-effort: live multi-provider capture is the remaining
 * piece flagged in the Sprint 276 DIRECTIVES — a missing/empty verifier result yields an
 * empty string, which {@link parseRefuteVerdict} maps to an honest `unclear` verdict.
 */
async function defaultSpawnVerifier(input: SpawnVerifierInput): Promise<string> {
  const verifierTaskId = `${input.task.id}-xverify`;
  const { spawnWorkerMultiProvider } = await import('../cli/commands/spawn.js');
  const { pollForResultFile } = await import('./sprint-phases.js');

  await spawnWorkerMultiProvider(
    verifierTaskId,
    input.verifierModel,
    input.prompt,
    input.projectRoot,
    { provider: input.verifierProvider, autoApprove: true },
  );

  const verifierResult = await pollForResultFile(
    input.projectRoot,
    verifierTaskId,
    input.timeoutMs,
  );
  // The verifier worker is instructed to end with a VERDICT line; a deckent worker
  // surfaces that in its `.result` notes. Empty when the worker never wrote a result.
  return verifierResult?.notes ?? '';
}

// ─── Advisory write ────────────────────────────────────────────────────────────

/**
 * Best-effort: merge a `crossVerify` advisory field into the task's `.result` on disk,
 * preserving every existing field (selfAssessment, brainEvaluation, …). No-op + debugLog
 * on any I/O error so a missing/unwritable `.result` never aborts the runner.
 */
function writeAdvisoryToResult(
  projectRoot: string,
  taskId: string,
  advisory: CrossVerifyAdvisory,
): void {
  try {
    const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    if (!existsSync(resultPath)) {
      debugLog('runCrossVerify:writeAdvisory', `no .result for task=${taskId}`);
      return;
    }
    const raw = readFileSync(resultPath, 'utf-8');
    const parsed = JSON.parse(raw) as TaskResult & { crossVerify?: CrossVerifyAdvisory };
    parsed.crossVerify = advisory;
    writeFileSync(resultPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
  } catch (e) {
    debugLog('runCrossVerify:writeAdvisory', e);
  }
}

// ─── runCrossVerify ──────────────────────────────────────────────────────────

/**
 * Run the cross-provider adversarial verification for a single evaluated task.
 *
 * Guards (each short-circuits to a skip, never a throw):
 *   1. `config.cross_verify.enabled !== true`         → skip 'disabled' (no spawn)
 *   2. evaluation ∉ {DONE, GO_WITH_TECH_DEBT}          → skip 'not-passing'
 *   3. {@link decideCrossVerify} says no               → honest-skip (not high-stakes /
 *                                                        no second provider)
 *
 * Otherwise it builds the refute prompt, dispatches the verifier (injectable), parses the
 * verdict, and writes the advisory to disk. Any spawn/parse failure degrades to a skip.
 *
 * NEVER mutates the task's evaluation — the `crossVerify` advisory is informational only
 * (ADR-070). The caller decides whether a REFUTED verdict warrants action.
 */
export async function runCrossVerify(
  projectRoot: string,
  task: Task,
  result: TaskResult,
  evaluation: TaskEvaluation,
  config: ResolvedConfig | undefined,
  opts: RunCrossVerifyOptions = {},
): Promise<CrossVerifyRunResult> {
  const skip = (reason: string): CrossVerifyRunResult => ({
    ran: false,
    skippedReason: reason,
    refuted: false,
    blocked: false,
  });

  // Guard 1 — config-gated default-OFF.
  if (config?.cross_verify?.enabled !== true) {
    return skip('disabled');
  }

  // Guard 2 — only verify passing tasks.
  if (evaluation !== TaskEvaluation.DONE && evaluation !== TaskEvaluation.GO_WITH_TECH_DEBT) {
    return skip('not-passing');
  }

  try {
    const xv = config.cross_verify;
    const taskProvider: ProviderName = task.provider ?? getDefaultProviderName();
    const availableProviders =
      opts.availableProviders ?? (providerRegistry.listProviders() as ProviderName[]);

    // Guard 3 — pure decision: high-stakes gate + verifier selection.
    const decision = decideCrossVerify({
      task,
      taskProvider,
      availableProviders,
      highStakesOnly: xv.high_stakes_only ?? true,
      verifierPriority: xv.verifier_priority as ProviderName[] | undefined,
    });

    if (!decision.shouldVerify || !decision.verifierProvider) {
      // Honest-skip — log explicitly, never a silent success.
      debugLog('runCrossVerify:skip', `task=${task.id} ${decision.reason}`);
      return skip(decision.reason);
    }

    const verifierProvider = decision.verifierProvider;
    const prompt = buildRefutePrompt(task, result, { verifier: verifierProvider });
    const spawnVerifier = opts.spawnVerifier ?? defaultSpawnVerifier;

    let output: string;
    try {
      output = await spawnVerifier({
        projectRoot,
        task,
        result,
        verifierProvider,
        verifierModel: opts.verifierModel ?? task.model,
        prompt,
        timeoutMs: opts.timeoutMs ?? CROSS_VERIFY_TIMEOUT_MS,
      });
    } catch (e) {
      // Spawn failure must never affect the host evaluation.
      debugLog('runCrossVerify:spawn-error', e);
      return skip('spawn-error');
    }

    const verdict = parseRefuteVerdict(output);
    const refuted = verdict.verdict === 'refuted';
    // Flag-gated enforcement (default-off): a REFUTED verdict only becomes a
    // block signal when cross_verify.enforce_refuted is explicitly true. The
    // downgrade itself is performed by the caller (ADR-070), never here.
    const blocked = refuted && xv.enforce_refuted === true;
    const advisory: CrossVerifyAdvisory = {
      verifier: verifierProvider,
      verdict: verdict.verdict,
      reason: verdict.reason,
    };
    writeAdvisoryToResult(projectRoot, task.id, advisory);

    debugLog(
      'runCrossVerify:done',
      `task=${task.id} verifier=${verifierProvider} verdict=${verdict.verdict} blocked=${blocked}`,
    );
    return { ran: true, advisory, refuted, blocked };
  } catch (e) {
    // Defensive: any unexpected fault degrades to a skip — never throws.
    debugLog('runCrossVerify:fault', e);
    return skip('error');
  }
}
