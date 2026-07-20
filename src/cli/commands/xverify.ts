// ─── `deckent xverify` — session-level adversarial cross-verification (XVERIFY-TOOL) ──
//
// Advisory second-opinion tool for INTERACTIVE sessions (Claude Code in one
// terminal, Codex in another): the author session states a claim about work it
// just finished; this command dispatches an adversarial verifier worker on a
// DIFFERENT provider to try to refute it, then writes an advisory report both
// sessions (and the operator) can read.
//
// Deliberately a THIN layer over the existing sprint machinery — no new
// orchestration is invented here:
//   - `runCrossVerify` (orchestra/cross-verify-runner.ts) does the dispatch,
//     verdict parsing (VERDICT: CONFIRMED/REFUTED + rationale) and honest
//     skip/unclear semantics. Proven standalone-callable (K5 closure, row 477).
//   - The verifier-must-differ-from-author rule is NOT re-implemented: the
//     synthetic task carries `provider = --author`, and `selectVerifierProvider`
//     (core/cross-verify.ts) already refuses to pick the task's own provider.
//   - ADVISORY by contract: the command never blocks or mutates anything;
//     exit 0 for every verification outcome (including REFUTED — the caller
//     decides what to do with the verdict). Non-zero exit is reserved for
//     invocation errors (unknown provider, author===verifier, spawn failure).
//
// Report artifact: `.analysis/xverify/<id>.md` — the shared exchange surface
// between the two sessions; the path is printed (and returned via --json) so
// either session can hand it to the other.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, TaskResult, ProviderName, ResolvedConfig } from '../../core/types.js';
import { TaskStatus, TaskEvaluation, ALL_PROVIDER_NAMES } from '../../core/types.js';
import { loadConfig, resolveDefaultModel } from '../../core/config.js';
import { registerOpenRouterModelFromCache, readFreeModelCache } from '../../core/openrouter-models.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';

// ─── Options ────────────────────────────────────────────────────────────

export interface XverifyCommandOpts {
  /** Provider that authored the claimed work — the verifier must differ. */
  author?: string;
  /** Explicit verifier provider (optional; must differ from --author). */
  verifier?: string;
  /** Include `git diff` output as evidence context for the verifier. */
  diff?: boolean;
  /** Comma-separated file list the claim says were changed. */
  files?: string;
  /** Explicit verifier MODEL id (canonical provider API id, e.g. gpt-5.6-sol).
   *  Bypasses tier-equivalence resolution — needed when the verifier account
   *  supports a narrower model set than the tier map assumes (row 607/608). */
  verifierModel?: string;
  /** Verifier timeout in ms. */
  timeout?: string;
  /** Machine-readable output (for the MCP twin / session-to-session use). */
  json?: boolean;
}

/** Injectable deps — hermetic tests stub every I/O edge. */
export interface XverifyDeps {
  resolveProjectRootFn?: () => string;
  loadConfigFn?: (root: string) => Promise<ResolvedConfig>;
  /** Deferred import seam for the heavy runner (mirrors cross-verify-runner's own style). */
  runCrossVerifyFn?: typeof import('../../orchestra/cross-verify-runner.js')['runCrossVerify'];
  bootstrapProvidersFn?: (config: ResolvedConfig, root: string) => Promise<unknown>;
  /** Captures `git diff` text; default shells out. Injectable for hermetic tests. */
  captureDiffFn?: (root: string) => string;
  nowFn?: () => Date;
  /** Invoked AFTER validation, BEFORE the verifier spawn — CLI prints its
   *  progress line here; the MCP twin passes nothing and stays silent. */
  onDispatch?: (info: { author: ProviderName; priority: readonly string[] }) => void;
}

// ─── Diff capture (default impl) ────────────────────────────────────────

function defaultCaptureDiff(root: string): string {
  // Lazy import keeps node:child_process out of module-eval for test bundles.
  // execFileSync (argv-array) — no shell interpolation, cross-platform (Law #2).
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
  try {
    const out = execFileSync('git', ['diff', '--stat', 'HEAD'], { cwd: root, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
    const full = execFileSync('git', ['diff', 'HEAD'], { cwd: root, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 });
    // Cap the inline diff so a huge working tree cannot blow the verifier's
    // context. Stat summary always included; body truncated with an honest marker.
    const CAP = 60_000;
    const body = full.length > CAP ? `${full.slice(0, CAP)}\n\n[... diff truncated at ${CAP} chars — full diff on disk via git]` : full;
    return `${out}\n\n${body}`;
  } catch (err) {
    return `(git diff unavailable: ${err instanceof Error ? err.message : String(err)})`;
  }
}

// ─── Result shape (shared CLI ↔ MCP twin) ───────────────────────────────

export interface XverifyResult {
  id: string;
  author: ProviderName;
  verifier: string | null;
  verdict: string;
  outcome: string;
  skippedReason: string | null;
  reason: string | null;
  report: string;
}

/** Invocation error carrying the ALREADY-LOCALIZED message (CLI prints it,
 *  MCP returns it verbatim) — distinct from verification outcomes, which are
 *  never errors (advisory contract). */
export class XverifyInvocationError extends Error {}

// ─── Core run (single implementation behind both surfaces) ──────────────

export async function runXverifyForResult(
  claim: string,
  opts: XverifyCommandOpts,
  deps: XverifyDeps = {},
): Promise<XverifyResult> {
  const resolveRoot = deps.resolveProjectRootFn ?? resolveProjectRoot;
  const loadConfigFn = deps.loadConfigFn ?? loadConfig;
  const now = (deps.nowFn ?? (() => new Date()))();

  const root = resolveRoot();
  const config = await loadConfigFn(root);
  const lang = getLanguage(config.language);

  // ── Validate providers (fail loudly BEFORE any spawn) ──
  const author = (opts.author ?? '').trim() as ProviderName;
  if (!author || !(ALL_PROVIDER_NAMES as readonly string[]).includes(author)) {
    throw new XverifyInvocationError(getMessage('xverify.err.author_required', lang, {
      providers: ALL_PROVIDER_NAMES.join('|'),
    }));
  }
  const explicitVerifier = opts.verifier?.trim();
  if (explicitVerifier !== undefined) {
    if (!(ALL_PROVIDER_NAMES as readonly string[]).includes(explicitVerifier)) {
      throw new XverifyInvocationError(getMessage('xverify.err.unknown_verifier', lang, {
        provider: explicitVerifier, providers: ALL_PROVIDER_NAMES.join('|'),
      }));
    }
    if (explicitVerifier === author) {
      // Self-verification defeats the entire point — refuse, never silently proceed.
      throw new XverifyInvocationError(getMessage('xverify.err.self_verify', lang, { provider: author }));
    }
  }

  // ── Bootstrap providers so the verifier pool reflects reality ──
  // Same lazy-bootstrap contract as `deckent run` (row 477 B7): interactive
  // entry points never ran bootstrapProviders, leaving the registry empty.
  try {
    const bootstrap = deps.bootstrapProvidersFn
      ?? (await import('../../core/provider.js')).bootstrapProviders;
    await bootstrap(config, root);
  } catch {
    // Best-effort: an empty pool surfaces honestly below as 'unavailable'.
  }

  // ── Synthetic verification envelope around the claim ──
  const id = `xv-${now.getTime()}`;
  const filesChanged = (opts.files ?? '').split(',').map((f) => f.trim()).filter(Boolean);
  const diffText = opts.diff
    ? (deps.captureDiffFn ?? defaultCaptureDiff)(root)
    : undefined;

  const task: Task = {
    id,
    title: claim.slice(0, 100),
    description: [
      claim,
      diffText ? `\n## Working-tree diff (evidence context)\n\n\`\`\`diff\n${diffText}\n\`\`\`` : '',
    ].join('\n'),
    model: resolveDefaultModel(config),
    // Carrying the AUTHOR here is what enforces verifier≠author:
    // selectVerifierProvider never picks the task's own provider.
    provider: author,
    effort: 'normal',
    priority: 'HIGH',
    reason: 'xverify session claim',
    scope: { directories: ['.'], filesRead: filesChanged, filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: getMessage('xverify.go_criteria', 'en', {}), // prompt text stays EN — worker-facing, not user-facing
      noGoCriteria: getMessage('xverify.nogo_criteria', 'en', {}),
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.DONE,
    createdAt: now.toISOString(),
  } as Task;

  const result: TaskResult = {
    taskId: id,
    selfAssessment: 'DONE',
    filesChanged,
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    notes: claim,
  } as TaskResult;

  // ── Effective cross_verify config for this invocation ──
  // Explicit invocation IS the enable signal — but existing config preferences
  // (verifier_priority) are respected unless --verifier overrides them.
  const verifierPriority = explicitVerifier
    ? [explicitVerifier]
    : (config.cross_verify?.verifier_priority ?? ['codex', 'claude', 'gemini']);
  const effectiveConfig: ResolvedConfig = {
    ...config,
    cross_verify: {
      enabled: true,
      high_stakes_only: false,
      verifier_priority: verifierPriority,
      enforce_refuted: false, // advisory by contract
    },
  };

  // OpenRouter verifier prep: `resolveVerifierModel` runs a tier-equivalence
  // lookup against the registry, so the probe-verified inventory must be
  // registered BEFORE dispatch. Best-effort: an absent/expired cache simply
  // keeps openrouter out of the effective pool (honest skip downstream).
  if (verifierPriority.includes('openrouter')) {
    for (const m of readFreeModelCache(root)?.models ?? []) {
      registerOpenRouterModelFromCache(root, m.id);
    }
  }

  const timeoutMs = Number.parseInt(opts.timeout ?? '', 10) || 300_000;

  const runCrossVerify = deps.runCrossVerifyFn
    ?? (await import('../../orchestra/cross-verify-runner.js')).runCrossVerify;

  deps.onDispatch?.({ author, priority: verifierPriority });
  const outcome = await runCrossVerify(root, task, result, TaskEvaluation.DONE, effectiveConfig, {
    timeoutMs,
    ...(opts.verifierModel ? { verifierModel: opts.verifierModel } : {}),
  });

  // ── Advisory report ──
  const reportDir = join(root, '.analysis', 'xverify');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `${id}.md`);
  const verdict = outcome.advisory?.verdict ?? 'unclear';
  const report = [
    `# xverify advisory — ${id}`,
    '',
    `- **Claim author:** ${author}`,
    `- **Verifier:** ${outcome.advisory?.verifier ?? '(none dispatched)'}`,
    `- **Verdict:** ${verdict.toUpperCase()}`,
    `- **Outcome:** ${outcome.outcome}${outcome.skippedReason ? ` (${outcome.skippedReason})` : ''}`,
    `- **At:** ${now.toISOString()}`,
    '',
    '## Claim',
    '',
    claim,
    '',
    '## Verifier rationale',
    '',
    outcome.advisory?.reason?.trim() || '(none — see outcome above)',
    '',
    `> Advisory only — this report never blocks. Evidence task artifacts: .tasks/task-${id}-xverify.*`,
    '',
  ].join('\n');
  writeFileSync(reportPath, report, 'utf-8');

  return {
    id,
    author,
    verifier: outcome.advisory?.verifier ?? null,
    verdict,
    outcome: outcome.outcome,
    skippedReason: outcome.skippedReason ?? null,
    reason: outcome.advisory?.reason ?? null,
    report: reportPath,
  };
}

// ─── CLI wrapper (thin: print + exit-code semantics over the shared core) ──

export async function runXverifyCommand(
  claim: string,
  opts: XverifyCommandOpts,
  deps: XverifyDeps = {},
): Promise<void> {
  const lang = getLanguage(undefined);
  try {
    const result = await runXverifyForResult(claim, opts, {
      ...deps,
      onDispatch: deps.onDispatch ?? (({ author, priority }) => {
        print(getMessage('xverify.dispatching', lang, { author, priority: priority.join(' → ') }));
      }),
    });
    if (opts.json) {
      print(JSON.stringify(result, null, 2));
      return;
    }
    print(getMessage('xverify.verdict', lang, {
      verdict: result.verdict.toUpperCase(),
      verifier: result.verifier ?? '-',
      report: result.report,
    }));
  } catch (err) {
    // Invocation errors only — verification outcomes never throw (advisory).
    printError(err instanceof Error ? err : new Error(String(err)));
    process.exitCode = 1;
  }
}

// ─── Registration ───────────────────────────────────────────────────────

export function registerXverifyCommand(program: Command): void {
  program
    .command('xverify <claim>')
    .description(getMessage('xverify.cmd_desc', getLanguage(undefined)))
    .option('--author <provider>', getMessage('xverify.opt_author', getLanguage(undefined), { providers: ALL_PROVIDER_NAMES.join('|') }))
    .option('--verifier <provider>', getMessage('xverify.opt_verifier', getLanguage(undefined)))
    .option('--verifier-model <id>', getMessage('xverify.opt_verifier_model', getLanguage(undefined)))
    .option('--diff', getMessage('xverify.opt_diff', getLanguage(undefined)))
    .option('--files <csv>', getMessage('xverify.opt_files', getLanguage(undefined)))
    .option('--timeout <ms>', getMessage('xverify.opt_timeout', getLanguage(undefined)))
    .option('--json', getMessage('xverify.opt_json', getLanguage(undefined)))
    .action(async (claim: string, opts: XverifyCommandOpts) => {
      await runXverifyCommand(claim, opts);
    });
}
