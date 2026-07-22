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
import { readFileSync, existsSync } from 'node:fs';

import { TaskEvaluation } from '../core/types.js';
import type { Task, TaskResult, ProviderName, CrossVerifyEvidence } from '../core/types.js';
import type { ResolvedConfig } from '../core/types.js';
import type { ExecutionBudget } from '../core/work-model.js';
import { resolveExecutionBudgetPolicy } from '../core/execution-budget-policy.js';
import { TASKS_DIR } from '../core/constants.js';
import { DeckentError } from '../core/errors.js';
import { debugLog } from '../core/utils.js';
import { providerRegistry } from '../core/provider.js';
import { modelRegistry } from '../core/model-registry.js';
import { decideCrossVerify } from '../core/cross-verify.js';
import { getDefaultProviderName } from './sprint-utils.js';
import { atomicWriteFileSync } from '../agents/worker-lifecycle.js';
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
  /** Provider-native model that actually performed the verification. */
  verifierModel: string;
  /** Verdict the verifier reached: refuted | confirmed | unclear. */
  verdict: RefuteVerdict['verdict'];
  /** Reason / evidence text extracted from the verifier's VERDICT line. */
  reason: string;
}

/** Stable truth state for a cross-verification attempt. */
export type CrossVerifyOutcome =
  | 'disabled'
  | 'not-applicable'
  | 'unavailable'
  | 'confirmed'
  | 'refuted'
  | 'unclear';

/** Outcome of {@link runCrossVerify}. */
export interface CrossVerifyRunResult {
  /** Machine-readable truth state; never infer availability from `ran`. */
  outcome: CrossVerifyOutcome;
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
  /** Whether the evidence was durably merged into the canonical task result. */
  evidencePersisted?: boolean;
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
  /** Owner-authored auditor ceiling. Undefined is never executable on the default remote path. */
  executionBudget?: ExecutionBudget;
  /** Owner-authored metered backend selected for this verification. */
  spawnBackend?: 'docker' | 'subprocess';
  dockerImage?: string;
  dockerTimeout?: number;
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
  /** Verifier model override. Default = capability-tier equivalent on the target provider. */
  verifierModel?: string;
  /** Verifier timeout budget in ms (short by design). Default 120_000. */
  timeoutMs?: number;
}

/** Default short timeout for the adversarial verifier (2 minutes). */
export const CROSS_VERIFY_TIMEOUT_MS = 120_000;

function resolveVerifierModel(
  taskModel: string,
  verifierProvider: ProviderName,
  override?: string,
): string {
  if (override) {
    const definition = modelRegistry.getOrThrow(override);
    if (definition.provider !== verifierProvider) {
      throw new DeckentError(
        'DECKENT_E004',
        `verifier model ${override} belongs to ${definition.provider}, not ${verifierProvider}`,
      );
    }
    return definition.id;
  }
  return modelRegistry.getEquivalent(taskModel, verifierProvider);
}

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

  // OPENROUTER-PROVIDER (row 477) — closes the "live multi-provider capture"
  // gap this function's doc-comment has flagged since Sprint 276.
  //
  // Host-HTTP workers (`agents/http-agentic-worker.ts`, used by openrouter /
  // openai-compat / ollama) do NOT receive the prompt as a spawn argument — their
  // adapters take `_prompt` and ignore it — they read it from
  // `.tasks/task-<id>.json` (`prompt: taskJson.description`). Without that file
  // the worker aborts immediately with `failed to read task json: ENOENT` and
  // writes a NO_GO, so EVERY HTTP-provider verifier resolved to 'unclear' —
  // verified live 2026-07-20 with an openrouter verifier. The adversarial prompt
  // never reached the model at all; this was infrastructure, not model quality.
  //
  // Writing the task JSON before spawn makes the prompt reachable on BOTH worker
  // families (tmux/claude reads the argument, HTTP reads this file). Best-effort:
  // an unwritable `.tasks/` must not abort verification — the existing
  // empty-result → `unclear` path stays the honest fallback.
  try {
    const { writeFileSync, mkdirSync, existsSync: exists } = await import('node:fs');
    const tasksDir = join(input.projectRoot, TASKS_DIR);
    if (!exists(tasksDir)) mkdirSync(tasksDir, { recursive: true });
    const authoredReadFiles = input.task.scope?.filesRead ?? [];
    const verifierFilesRead = [...new Set(
      (authoredReadFiles.length > 0 ? authoredReadFiles : (input.result.filesChanged ?? []))
        .map(path => path.trim())
        .filter(path => path.length > 0),
    )];
    const verifierTaskJson = {
      id: verifierTaskId,
      title: `Adversarial cross-verify of ${input.task.id}`,
      // The adversarial prompt IS the work for a verifier — carried in
      // `description` because that is the field the HTTP worker turns into its
      // prompt.
      description: input.prompt,
      model: input.verifierModel,
      provider: input.verifierProvider,
      effort: 'normal',
      priority: 'HIGH',
      reason: 'cross-verify adversarial verification',
      // Read-only by construction: a verifier judges, it must never edit the
      // work it is judging. Empty `filesWrite` is the scope contract for that.
      // Never grant the legacy directory-write fallback. The exact authored
      // read list wins; filesChanged is only a fallback when no read contract
      // exists. Docker Write/Edit therefore remains `.tasks/`-only even when
      // the evidence list is empty.
      scope: { directories: [], filesRead: verifierFilesRead, filesWrite: [] },
      dependencies: [],
      goNogo: {
        goCriteria: 'Emit a VERDICT line stating whether the original result is refuted, with a rationale.',
        noGoCriteria: 'No VERDICT line emitted.',
        techDebtAcceptable: 'none',
      },
      status: 'PENDING',
      type: 'audit',
      ...(input.executionBudget ? { budget: input.executionBudget } : {}),
      ...(input.spawnBackend ? { backend: input.spawnBackend } : {}),
      createdAt: new Date().toISOString(),
    };
    writeFileSync(
      join(tasksDir, `task-${verifierTaskId}.json`),
      JSON.stringify(verifierTaskJson, null, 2),
      'utf-8',
    );
  } catch (err) {
    debugLog('cross-verify:verifier-task-json-write-failed', String(err));
  }

  await spawnWorkerMultiProvider(
    verifierTaskId,
    input.verifierModel,
    input.prompt,
    input.projectRoot,
    {
      provider: input.verifierProvider,
      autoApprove: true,
      executionBudget: input.executionBudget,
      spawnBackend: input.spawnBackend,
      dockerImage: input.dockerImage,
      dockerTimeout: input.dockerTimeout,
    },
  );

  const verifierResult = await pollForResultFile(
    input.projectRoot,
    verifierTaskId,
    input.timeoutMs,
  );
  // The verifier worker is instructed to end with a VERDICT line; a deckent worker
  // surfaces that in its `.result` notes. Empty when the worker never wrote a result.
  const notes = verifierResult?.notes ?? '';
  const lastNoteLine = notes.trim().split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .at(-1)?.trim() ?? '';
  // A wrapper-generated EXIT_WITHOUT_RESULT note is non-empty but is not a
  // verifier verdict. Accept notes only when their final non-empty line is the
  // terminal protocol line; otherwise continue to the provider log fallback.
  if (/^VERDICT:\s*(?:REFUTED|CONFIRMED|UNCLEAR)\s+.+$/i.test(lastNoteLine)) {
    return lastNoteLine;
  }

  // XVERIFY-TOOL log-fallback — the OTHER half of the Sprint-276 "live
  // multi-provider capture" gap (the HTTP-worker half was the task-JSON write
  // above). Host-CLI verifier workers (codex/gemini/claude) stream their final
  // agent message into `.tasks/task-<id>.log` but never write a `.result` file
  // for this spawn shape — proven live 2026-07-20: a codex verifier ran the full
  // verification (tests + lint) and emitted `VERDICT: CONFIRMED ...` into the
  // log, yet the outcome resolved to 'unclear' because notes stayed empty. The
  // raw log tail is a valid verdict source: `parseRefuteVerdict` scans for the
  // LAST `VERDICT:` line, and the NDJSON wrapping does not defeat that match.
  // Best-effort + capped: an unreadable/absent log keeps the honest '' →
  // 'unclear' path.
  try {
    const logPath = join(input.projectRoot, TASKS_DIR, `task-${verifierTaskId}.log`);
    if (existsSync(logPath)) {
      const raw = readFileSync(logPath, 'utf-8');
      // Return ONLY the LAST VERDICT line, never the whole log: the adversarial
      // prompt itself contains `VERDICT: REFUTED <reason>` as a FORMAT EXAMPLE,
      // and `parseRefuteVerdict` checks REFUTED_RE first — feeding a log that
      // echoes the prompt would turn every run into a false REFUTED. The final
      // agent message always comes after any prompt echo, so last-match wins.
      // Stops at a literal backslash (NDJSON logs carry `\n` as two chars) or
      // a closing quote, so escaped-JSON wrapping cannot bleed into the reason.
      const matches = raw.match(/VERDICT:\s*(?:REFUTED|CONFIRMED|UNCLEAR)[^"\\\n]*/g);
      if (matches && matches.length > 0) {
        const terminalVerdict = matches[matches.length - 1]!;

        // The provider completed the verifier's sole acceptance criterion, but
        // generic Docker wrappers cannot write a TaskResult for host-CLI output
        // and therefore leave an EXIT_WITHOUT_RESULT/NO_GO marker. Reconcile
        // ONLY this xverify task after the final-line parser has proven a real
        // terminal protocol line. Generic implementation workers remain NO_GO.
        // Preserve provider usage/billing and exit evidence; remove only stale
        // marker discriminators that would make consumers classify this DONE
        // audit as an unfinished wrapper exit.
        try {
          const resultPath = join(input.projectRoot, TASKS_DIR, `task-${verifierTaskId}.result`);
          if (existsSync(resultPath)) {
            const recovered = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
            recovered.selfAssessment = 'DONE';
            recovered.testsPassed = true;
            recovered.notes = `Recovered terminal verifier output from provider log.\n${terminalVerdict}`;
            recovered.completedAt = typeof recovered.completedAt === 'string'
              ? recovered.completedAt
              : new Date().toISOString();
            delete recovered.markerType;
            delete recovered.workPresent;
            delete recovered.diffStat;
            atomicWriteFileSync(resultPath, JSON.stringify(recovered, null, 2) + '\n');
          }
        } catch (err) {
          // Result repair is evidence hygiene, not verdict authority. A corrupt
          // or unwritable marker must not discard the independently recovered
          // terminal verdict returned below.
          debugLog('cross-verify:terminal-result-recovery-failed', String(err));
        }
        return terminalVerdict;
      }
    }
  } catch (err) {
    debugLog('cross-verify:log-fallback-read-failed', String(err));
  }
  return '';
}

// ─── Advisory write ────────────────────────────────────────────────────────────

/**
 * Best-effort: merge a `crossVerify` evidence field into the task's `.result` on disk,
 * preserving every existing field (selfAssessment, brainEvaluation, …). No-op + debugLog
 * on any I/O error so a missing/unwritable `.result` never aborts the runner.
 */
function writeEvidenceToResult(
  projectRoot: string,
  taskId: string,
  evidence: CrossVerifyEvidence,
): boolean {
  try {
    const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    if (!existsSync(resultPath)) {
      debugLog('runCrossVerify:writeEvidence', `no .result for task=${taskId}`);
      return false;
    }
    const raw = readFileSync(resultPath, 'utf-8');
    const parsed = JSON.parse(raw) as TaskResult;
    parsed.crossVerify = evidence;
    atomicWriteFileSync(resultPath, JSON.stringify(parsed, null, 2) + '\n');
    return true;
  } catch (e) {
    debugLog('runCrossVerify:writeEvidence', e);
    return false;
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
  const skip = (
    reason: string,
    outcome: Extract<CrossVerifyOutcome, 'disabled' | 'not-applicable' | 'unavailable'>,
    evidencePersisted?: boolean,
  ): CrossVerifyRunResult => ({
    outcome,
    ran: false,
    skippedReason: reason,
    refuted: false,
    blocked: false,
    evidencePersisted,
  });

  // Guard 1 — config-gated default-OFF.
  if (config?.cross_verify?.enabled !== true) {
    return skip('disabled', 'disabled');
  }

  // Guard 2 — only verify passing tasks.
  if (evaluation !== TaskEvaluation.DONE && evaluation !== TaskEvaluation.GO_WITH_TECH_DEBT) {
    return skip('not-passing', 'not-applicable');
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
      const outcome = decision.reasonCode === 'no-second-provider'
        ? 'unavailable'
        : 'not-applicable';
      if (outcome === 'unavailable') {
        const evidencePersisted = writeEvidenceToResult(projectRoot, task.id, {
          outcome,
          reason: decision.reason,
        });
        return skip(decision.reason, outcome, evidencePersisted);
      }
      return skip(decision.reason, outcome);
    }

    const verifierProvider = decision.verifierProvider;
    const prompt = buildRefutePrompt(task, result, { verifier: verifierProvider });
    const spawnVerifier = opts.spawnVerifier ?? defaultSpawnVerifier;

    let verifierModel: string;
    try {
      verifierModel = resolveVerifierModel(task.model, verifierProvider, opts.verifierModel);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      debugLog('runCrossVerify:model-resolution-error', detail);
      const evidencePersisted = writeEvidenceToResult(projectRoot, task.id, {
        outcome: 'unavailable',
        verifier: verifierProvider,
        reason: `model-resolution-error: ${detail}`,
      });
      return skip(`model-resolution-error: ${detail}`, 'unavailable', evidencePersisted);
    }

    const budgetDecision = resolveExecutionBudgetPolicy({
      policy: config.execution_budget,
      role: 'auditor',
      taskKind: 'audit',
      executionCostClass: verifierProvider === 'ollama' ? 'local' : 'remote',
    });
    if (budgetDecision.state === 'hold') {
      const reason = `verifier-budget-hold:${budgetDecision.reasonCode}:${budgetDecision.profileRef}`;
      const evidencePersisted = writeEvidenceToResult(projectRoot, task.id, {
        outcome: 'unavailable', verifier: verifierProvider, verifierModel, reason,
      });
      return skip(reason, 'unavailable', evidencePersisted);
    }

    const configuredBackend = config.spawn_backend;
    // Docker is the only SpawnBackend that currently exposes measured-stream
    // support. Subprocess/tmux are valid execution backends, but selecting them
    // for a budgeted verifier would merely defer the same honest HOLD to a later
    // assertion and surface it as a generic spawn-error.
    const directMeteredBackend = configuredBackend === 'docker' ? configuredBackend : undefined;
    const rerouteBackend = config.execution_budget?.unmetered_backend?.action === 'reroute-or-hold'
      ? config.execution_budget.unmetered_backend.ordered_backends?.find(
        (backend): backend is 'docker' => backend === 'docker',
      )
      : undefined;
    const spawnBackend = directMeteredBackend ?? rerouteBackend;
    const needsSpawnBackend = verifierProvider === 'claude' || verifierProvider === 'codex' || verifierProvider === 'gemini';
    if (needsSpawnBackend && !spawnBackend) {
      const reason = `verifier-metered-backend-hold:${verifierProvider}-default-backend-is-unmetered`;
      const evidencePersisted = writeEvidenceToResult(projectRoot, task.id, {
        outcome: 'unavailable', verifier: verifierProvider, verifierModel, reason,
      });
      return skip(reason, 'unavailable', evidencePersisted);
    }

    let output: string;
    try {
      output = await spawnVerifier({
        projectRoot,
        task,
        result,
        verifierProvider,
        verifierModel,
        prompt,
        timeoutMs: opts.timeoutMs ?? CROSS_VERIFY_TIMEOUT_MS,
        executionBudget: budgetDecision.budget,
        spawnBackend,
        dockerImage: config.docker_image,
        dockerTimeout: config.docker_timeout,
      });
    } catch (e) {
      // Spawn failure must never masquerade as a successful/no-op verification.
      debugLog('runCrossVerify:spawn-error', e);
      const evidencePersisted = writeEvidenceToResult(projectRoot, task.id, {
        outcome: 'unavailable',
        verifier: verifierProvider,
        verifierModel,
        reason: 'spawn-error',
      });
      return skip('spawn-error', 'unavailable', evidencePersisted);
    }

    const verdict = parseRefuteVerdict(output);
    const refuted = verdict.verdict === 'refuted';
    // Flag-gated enforcement (default-off): a REFUTED verdict only becomes a
    // block signal when cross_verify.enforce_refuted is explicitly true. The
    // downgrade itself is performed by the caller (ADR-070), never here.
    const blocked = refuted && xv.enforce_refuted === true;
    const advisory: CrossVerifyAdvisory = {
      verifier: verifierProvider,
      verifierModel,
      verdict: verdict.verdict,
      reason: verdict.reason,
    };
    const outcome = verdict.verdict;
    const evidencePersisted = writeEvidenceToResult(projectRoot, task.id, { ...advisory, outcome });

    debugLog(
      'runCrossVerify:done',
      `task=${task.id} verifier=${verifierProvider} verdict=${verdict.verdict} blocked=${blocked}`,
    );
    return { outcome, ran: true, advisory, refuted, blocked, evidencePersisted };
  } catch (e) {
    // Defensive: any unexpected fault degrades to a skip — never throws.
    const detail = e instanceof Error ? e.message : String(e);
    debugLog('runCrossVerify:fault', detail);
    const evidencePersisted = writeEvidenceToResult(projectRoot, task.id, {
      outcome: 'unavailable',
      reason: `unexpected-error: ${detail}`,
    });
    return skip(`unexpected-error: ${detail}`, 'unavailable', evidencePersisted);
  }
}
