// ─── `deckent xverify` — session-level adversarial cross-verification (XVERIFY-TOOL) ──
//
// Host-adjudicated second-opinion tool for INTERACTIVE sessions (Claude Code in one
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
//   - The provider response is evidence, never decision authority. The host
//     derives allow/no-go/hold from typed criteria and immutable evidence.
//
// Report artifact: `.analysis/xverify/<id>.md` — the shared exchange surface
// between the two sessions; the path is printed (and returned via --json) so
// either session can hand it to the other.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type {
  Task,
  TaskResult,
  ProviderName,
  ResolvedConfig,
  CrossVerifyExecutionEvidence,
} from '../../core/types.js';
import { TaskStatus, TaskEvaluation, ALL_PROVIDER_NAMES } from '../../core/types.js';
import { loadConfig, readAuthMode, resolveDefaultModel } from '../../core/config.js';
import { createGoNoGoCriterionItem } from '../../core/task-types.js';
import { modelRegistry } from '../../core/model-registry.js';
import { registerOpenRouterModelFromCache, readFreeModelCache } from '../../core/openrouter-models.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import type { VerifierDispatchRejection } from '../../core/cross-verify-prompt.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import {
  createCrossVerifyProductionIngressAuthority,
  createLiveDockerCrossVerifyExecutionProfileAuthority,
} from '../../orchestra/cross-verify-production-ingress-authority.js';
import type {
  MandatoryCrossVerifyInvocationFactory,
} from '../../orchestra/cross-verify-runner.js';
import { DockerSpawnBackend } from '../../orchestra/spawn-backend-docker.js';

// ─── Options ────────────────────────────────────────────────────────────

export interface XverifyCommandOpts {
  /** Provider that authored the claimed work — the verifier must differ. */
  author?: string;
  /**
   * Exact model id that authored the claimed work (canonical provider API id).
   * This is the authoritative input to the verifier capability-tier floor: the
   * verifier may never judge from below it. Omitted, the resolved default is
   * substituted and the receipt records that substitution as low-confidence —
   * the floor is only as trustworthy as the author model it compares against.
   */
  authorModel?: string;
  /** Explicit verifier provider (optional; must differ from --author). */
  verifier?: string;
  /** Include `git diff` output as evidence context for the verifier. */
  diff?: boolean;
  /** Comma-separated file list the claim says were changed; also scopes the
   *  `--diff` evidence to exactly these paths when both are given. */
  files?: string;
  /** Comma-separated bounded targets — `path:START-END` (1-based inclusive line
   *  range) or `path:symbolName` — each resolves to an exact excerpt so a large
   *  file never needs manual prompt surgery. */
  target?: string;
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
  /** Captures `git diff` text; default shells out. `files` (from `--files`, when
   *  non-empty) scopes the diff to exactly those paths. Injectable for hermetic tests. */
  captureDiffFn?: (root: string, files?: readonly string[]) => string;
  nowFn?: () => Date;
  /** Invoked AFTER validation, BEFORE the verifier spawn — CLI prints its
   *  progress line here; the MCP twin passes nothing and stays silent. */
  onDispatch?: (info: {
    author: ProviderName;
    priority: readonly string[];
    /** Present only when the verifier runs without live token metering. */
    finalOnlyContainment?: { maxWallClockSeconds: number };
  }) => void;
  /** Shared process authority; advisory mode receives it but performs no authority work. */
  providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  /** Hermetic seam; production composes an exact Docker-backed v2 authority. */
  mandatoryInvocationFactory?: MandatoryCrossVerifyInvocationFactory;
}

// ─── Diff capture (default impl) ────────────────────────────────────────

function defaultCaptureDiff(root: string, files: readonly string[] = []): string {
  // execFileSync (argv-array) — no shell interpolation, cross-platform (Law #2).
  // Non-empty `files` (sourced from `--files`) scopes both the stat summary and
  // the full diff to exactly those paths — the flag now filters what it documents
  // instead of silently attaching the whole working tree.
  const pathArgs = files.length > 0 ? ['--', ...files] : [];
  try {
    const out = execFileSync('git', ['diff', '--stat', 'HEAD', ...pathArgs], { cwd: root, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
    const full = execFileSync('git', ['diff', 'HEAD', ...pathArgs], { cwd: root, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 });
    // Cap the inline diff so a huge working tree cannot blow the verifier's
    // context. Stat summary always included; body truncated with an honest marker.
    const CAP = 60_000;
    const body = full.length > CAP ? `${full.slice(0, CAP)}\n\n[... diff truncated at ${CAP} chars — full diff on disk via git]` : full;
    return `${out}\n\n${body}`;
  } catch (err) {
    return `(git diff unavailable: ${err instanceof Error ? err.message : String(err)})`;
  }
}

// ─── Bounded targeting (`--target path:START-END` / `path:symbolName`) ─────
//
// Lets an operator point the verifier at an exact excerpt of a large file
// instead of pasting bounded fragments into the claim text by hand. Resolution
// is pure/local — no provider call — so it stays legal as pre-provider input
// shaping (task NO-GO: "targeting is pre-provider input shaping only").

const TARGET_LINE_RANGE_RE = /^(\d+)-(\d+)$/;
const TARGET_SYMBOL_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** Bounded lookahead for symbol-block extraction — never scans an entire huge
 *  file hunting for a brace match that isn't there. */
const TARGET_SYMBOL_LOOKAHEAD_LINES = 400;

/** Carries an i18n key + params instead of a free-string message — the caller
 *  localizes via `getMessage` so every target failure stays in the i18n catalog. */
class TargetSpecError extends Error {
  constructor(
    public readonly messageKey: string,
    public readonly params: Record<string, string> = {},
  ) {
    super(messageKey);
  }
}

interface ResolvedTarget {
  path: string;
  locatorDescription: string;
  content: string;
}

function parseTargetSpec(spec: string): { path: string; locator: string } {
  const idx = spec.lastIndexOf(':');
  if (idx <= 0 || idx === spec.length - 1) {
    throw new TargetSpecError('xverify.err.target_invalid_spec', { spec });
  }
  return { path: spec.slice(0, idx), locator: spec.slice(idx + 1) };
}

function extractLineRange(
  lines: readonly string[],
  start: number,
  end: number,
  path: string,
): { content: string; startLine: number; endLine: number } {
  if (start < 1 || end < start || end > lines.length) {
    throw new TargetSpecError('xverify.err.target_range_invalid', {
      path, start: String(start), end: String(end), total: String(lines.length),
    });
  }
  return { content: lines.slice(start - 1, end).join('\n'), startLine: start, endLine: end };
}

function extractSymbolBlock(
  lines: readonly string[],
  symbol: string,
  path: string,
): { content: string; startLine: number; endLine: number } {
  const symbolRe = new RegExp(`\\b${symbol}\\b`);
  const startIdx = lines.findIndex((line) => symbolRe.test(line));
  if (startIdx === -1) {
    throw new TargetSpecError('xverify.err.target_symbol_not_found', { symbol, path });
  }
  let depth = 0;
  let sawBrace = false;
  let endIdx = startIdx;
  const scanLimit = Math.min(lines.length, startIdx + TARGET_SYMBOL_LOOKAHEAD_LINES);
  for (let i = startIdx; i < scanLimit; i += 1) {
    const line = lines[i]!;
    for (const ch of line) {
      if (ch === '{') { depth += 1; sawBrace = true; }
      else if (ch === '}') { depth -= 1; }
    }
    endIdx = i;
    if (sawBrace && depth <= 0) break;
    if (!sawBrace && /[;,]\s*$/u.test(line)) break; // brace-less one-liner (const/type alias)
  }
  return {
    content: lines.slice(startIdx, endIdx + 1).join('\n'),
    startLine: startIdx + 1,
    endLine: endIdx + 1,
  };
}

function resolveTarget(root: string, spec: string): ResolvedTarget {
  const { path: relPath, locator } = parseTargetSpec(spec);
  let raw: string;
  try {
    raw = readFileSync(join(root, relPath), 'utf-8');
  } catch {
    throw new TargetSpecError('xverify.err.target_file_not_found', { path: relPath });
  }
  const lines = raw.split(/\r?\n/u);
  const rangeMatch = TARGET_LINE_RANGE_RE.exec(locator);
  if (rangeMatch) {
    const extracted = extractLineRange(lines, Number.parseInt(rangeMatch[1]!, 10), Number.parseInt(rangeMatch[2]!, 10), relPath);
    return {
      path: relPath,
      locatorDescription: `lines ${extracted.startLine}-${extracted.endLine}`,
      content: extracted.content,
    };
  }
  if (TARGET_SYMBOL_RE.test(locator)) {
    const extracted = extractSymbolBlock(lines, locator, relPath);
    return {
      path: relPath,
      locatorDescription: `symbol ${locator} (lines ${extracted.startLine}-${extracted.endLine})`,
      content: extracted.content,
    };
  }
  throw new TargetSpecError('xverify.err.target_invalid_spec', { spec });
}

// ─── Result shape (shared CLI ↔ MCP twin) ───────────────────────────────

export interface XverifyResult {
  id: string;
  author: ProviderName;
  /** Author model the capability-tier floor was enforced against. */
  authorModel: string;
  /**
   * `'authoritative'` when the operator stated `--author-model`;
   * `'resolved-default'` when the host substituted the resolved default — the
   * floor still applies, but its input was assumed rather than declared.
   */
  authorModelConfidence: 'authoritative' | 'resolved-default';
  verifier: string | null;
  /** Exact canonical API id evidenced by the dispatched verifier advisory. */
  verifierModel: string | null;
  /**
   * Null when no verifier verdict exists (MASTER-PLAN 672). Previously this
   * defaulted to `'unclear'`, which asserts the verifier ran and could not
   * decide — indistinguishable from a dispatch the provider refused outright.
   */
  verdict: string | null;
  outcome: string;
  disposition: string;
  blocked: boolean;
  skippedReason: string | null;
  reason: string | null;
  execution: CrossVerifyExecutionEvidence | null;
  assurance: 'typed-host-adjudicated' | null;
  adjudicationReceiptRef: string | null;
  /**
   * Structured provider refusal when the dispatch was rejected — the same
   * (provider, model, why) triple that `skippedReason` states in prose, in a
   * form a caller can aggregate on.
   */
  rejection: VerifierDispatchRejection | null;
  report: string;
  /**
   * Typed, i18n-sourced next step when this claim carried no bounded evidence
   * (no `--files`, `--diff`, or `--target`) or the runner independently
   * reported `verifier-eligibility-evidence-missing`. `null` when evidence
   * was attached and the runner raised no evidence complaint. Never blocks
   * dispatch — an unevidenced claim can be a legitimate self-contained
   * logical claim, so this is guidance, not a refusal.
   */
  remedy: string | null;
}

// ─── Typed tier-floor refusal → operator language ───────────────────────────
//
// `cross-verify-runner` refuses a below-tier verifier with a typed CODE, never
// prose: orchestra must not import this surface's i18n catalog (ADR-D-004 C2).
// The codes are re-stated here as literals rather than value-imported so the
// heavy runner module keeps its deferred-import seam; the drift risk that
// creates is pinned by `tests/cli/xverify-tier-floor.test.ts`, which asserts
// these literals equal the runner's exported constants.

const VERIFIER_TIER_BELOW_AUTHOR_CODE = 'xverify_verifier_tier_below_author';
const VERIFIER_TIER_FLOOR_UNRESOLVABLE_CODE = 'xverify_verifier_tier_floor_unresolvable';
const TIER_BELOW_AUTHOR_RE =
  /^xverify_verifier_tier_below_author:verifier=(.+?)\(([a-z_]+)\) < author=(.+?)\(([a-z_]+)\)$/u;

/** Renders a typed tier-floor refusal; `null` when this outcome is not one. */
function localizeTierFloorRefusal(skippedReason: string | null, lang: string): string | null {
  if (!skippedReason) return null;
  if (skippedReason.startsWith(VERIFIER_TIER_FLOOR_UNRESOLVABLE_CODE)) {
    return getMessage('xverify.err.verifier_tier_floor_unresolvable', lang, {
      detail: skippedReason.slice(VERIFIER_TIER_FLOOR_UNRESOLVABLE_CODE.length + 1),
    });
  }
  if (!skippedReason.startsWith(VERIFIER_TIER_BELOW_AUTHOR_CODE)) return null;
  const parsed = TIER_BELOW_AUTHOR_RE.exec(skippedReason);
  // An unparsed code still names the refusal honestly — never swallow it.
  if (!parsed) return skippedReason;
  return getMessage('xverify.err.verifier_tier_below_author', lang, {
    verifierModel: parsed[1]!,
    verifierTier: parsed[2]!,
    authorModel: parsed[3]!,
    authorTier: parsed[4]!,
  });
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

  // ── Author model: the authoritative input to the verifier tier floor ──
  // Registry-validated here, before any spawn, on the same terms as the
  // provider flags above. The claim envelope below is NOT changed by this
  // flag — the floor travels to the runner as its own typed input.
  const resolvedDefaultModel = resolveDefaultModel(config);
  const explicitAuthorModel = opts.authorModel?.trim();
  let authorModel: string = resolvedDefaultModel;
  let authorModelConfidence: 'authoritative' | 'resolved-default' = 'resolved-default';
  if (explicitAuthorModel) {
    if (!modelRegistry.has(explicitAuthorModel)) {
      throw new XverifyInvocationError(getMessage('xverify.err.unknown_author_model', lang, {
        model: explicitAuthorModel,
      }));
    }
    const authorModelDefinition = modelRegistry.getOrThrow(explicitAuthorModel);
    if ((authorModelDefinition.provider as string) !== (author as string)) {
      throw new XverifyInvocationError(getMessage('xverify.err.author_model_provider_mismatch', lang, {
        model: authorModelDefinition.id,
        modelProvider: authorModelDefinition.provider,
        author,
      }));
    }
    authorModel = authorModelDefinition.id;
    authorModelConfidence = 'authoritative';
  }

  // ── Resolve bounded targets (fail loudly BEFORE any spawn, same contract
  // as provider validation above — malformed/missing targets are cheap to
  // catch locally and never justify a provider round trip). ──
  const targetSpecs = (opts.target ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let resolvedTargets: ResolvedTarget[] = [];
  if (targetSpecs.length > 0) {
    try {
      resolvedTargets = targetSpecs.map((spec) => resolveTarget(root, spec));
    } catch (err) {
      if (err instanceof TargetSpecError) {
        throw new XverifyInvocationError(getMessage(err.messageKey, lang, err.params));
      }
      throw err;
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
  const id = `xv-${now.getTime()}-${randomUUID()}`;
  const filesFromFlag = (opts.files ?? '').split(',').map((f) => f.trim()).filter(Boolean);
  // Evidence requirements/scope cover both explicitly-changed files AND bounded
  // target paths (dedup) — diff scoping stays --files-only below, since a target
  // path is a read excerpt, not a claim about what changed.
  const filesChanged = Array.from(new Set([...filesFromFlag, ...resolvedTargets.map((t) => t.path)]));
  const diffText = opts.diff
    ? (deps.captureDiffFn ?? defaultCaptureDiff)(root, filesFromFlag)
    : undefined;
  const targetsText = resolvedTargets.length > 0
    ? resolvedTargets.map((t) => [
        `### Target: ${t.path} (${t.locatorDescription})`,
        '```',
        t.content,
        '```',
      ].join('\n')).join('\n\n')
    : undefined;
  const evidenceContext = [diffText, targetsText].filter((p): p is string => Boolean(p)).join('\n\n') || undefined;
  const hasEvidence = filesChanged.length > 0 || Boolean(opts.diff) || resolvedTargets.length > 0;

  const criterion = createGoNoGoCriterionItem({
    polarity: 'go',
    statement: claim,
    evidenceRequirements: filesChanged,
  });
  const task: Task = {
    id,
    // The complete claim remains in Description. A host-generated stable title
    // avoids silently truncating a material claim before the prompt compiler can
    // apply its explicit host-truncation contract.
    title: `Session claim ${id}`,
    description: claim,
    model: resolvedDefaultModel,
    // Carrying the AUTHOR here is what enforces verifier≠author:
    // selectVerifierProvider never picks the task's own provider.
    provider: author,
    effort: 'normal',
    priority: 'HIGH',
    reason: 'xverify session claim',
    scope: { directories: ['.'], filesRead: filesChanged, filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: claim,
      noGoCriteria: getMessage('xverify.nogo_criteria', 'en', {}),
      techDebtAcceptable: 'none',
      items: [criterion],
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
    ...(evidenceContext ? { evidenceContext } : {}),
  } as TaskResult;

  // The parent claim/result are immutable audit inputs for this standalone
  // operation. The verifier never sees this directory: v2 snapshots only the
  // exact authored evidence files into its read-only broker mount.
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, `task-${id}.json`),
    JSON.stringify(task, null, 2) + '\n',
    { encoding: 'utf-8', flag: 'wx' },
  );
  writeFileSync(
    join(tasksDir, `task-${id}.result`),
    JSON.stringify(result, null, 2) + '\n',
    { encoding: 'utf-8', flag: 'wx' },
  );

  // ── Effective cross_verify config for this invocation ──
  // Explicit invocation IS the enable signal — but existing config preferences
  // (verifier_priority) are respected unless --verifier overrides them.
  const verifierPriority = explicitVerifier
    ? [explicitVerifier]
    : (config.cross_verify?.verifier_priority ?? ['codex', 'claude', 'gemini']);
  const effectiveConfig: ResolvedConfig = {
    ...config,
    cross_verify: {
      // Carry the owner's authored block forward and override ONLY what an
      // explicit invocation genuinely forces. Rebuilding this object from
      // scratch silently dropped every other authored key — measured on
      // `xv-1785066348203`, where `cross_verify.verifier_model.codex` was set to
      // gpt-5.6-sol and the run still dispatched the tier-equivalent
      // gpt-5.6-terra. The old comment claimed config preferences were
      // respected; exactly one of them was.
      ...config.cross_verify,
      enabled: true,
      high_stakes_only: false,
      verifier_priority: verifierPriority,
      enforce_refuted: true,
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

  const authMode = await readAuthMode(root);
  const dockerBackend = new DockerSpawnBackend(root, {
    image: config.docker_image,
    timeoutSeconds: config.docker_timeout,
    memoryLimit: config.worker_memory_limit,
    memorySwap: config.worker_memory_swap,
    kindMemoryLimits: config.worker_memory_limit_by_kind,
  });
  const executionProfiles =
    deps.providerAuthority?.state === 'ready' && authMode !== 'hybrid'
      ? createLiveDockerCrossVerifyExecutionProfileAuthority({
          projectRoot: root,
          backend: dockerBackend,
          terminationLedger: deps.providerAuthority.service.terminationLedger,
          authMode,
        })
      : undefined;
  const mandatoryInvocationFactory = deps.mandatoryInvocationFactory
    ?? createCrossVerifyProductionIngressAuthority({
      providerAuthority: deps.providerAuthority,
      executionProfiles,
    });

  // Registry/catalog presence is not live reachability. The interactive surface
  // may carry only an explicit, attended owner selection into the runner. Without
  // `--verifier`, the runner fails closed until the production authority
  // composition supplies exact-model reachability and limit evidence.
  const attendedVerifierCandidates = explicitVerifier
    ? [explicitVerifier as ProviderName]
    : undefined;
  const outcome = await runCrossVerify(root, task, result, TaskEvaluation.DONE, effectiveConfig, {
    timeoutMs,
    operationClass: 'adjudicate-claim',
    mandatoryInvocationFactory,
    // The claim envelope carries a host-substituted default model; the floor is
    // enforced against THIS value instead, so `--author-model` reaches the
    // resolver without the immutable claim being rewritten.
    authorModel,
    ...(attendedVerifierCandidates
      ? { availableProviders: attendedVerifierCandidates }
      : {}),
    ...(deps.onDispatch
      ? {
        onVerifierDispatch: ({ verifierProvider, finalOnlyContainment }: {
          verifierProvider: ProviderName;
          finalOnlyContainment?: { maxWallClockSeconds: number };
        }) => {
          deps.onDispatch?.({
            author,
            priority: [verifierProvider],
            ...(finalOnlyContainment ? { finalOnlyContainment } : {}),
          });
        },
      }
      : {}),
    ...(opts.verifierModel ? { verifierModel: opts.verifierModel } : {}),
  });

  // ── Host-adjudicated report ──
  const reportDir = join(root, '.analysis', 'xverify');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `${id}.md`);
  // MASTER-PLAN 672: identity comes from the structured fields, which the runner
  // fills on the skip path too. `advisory` exists only when a verdict was
  // produced, so relying on it alone reported "(none dispatched)" for a verifier
  // whose provider and model were both known.
  const verifier = outcome.advisory?.verifier ?? outcome.verifier ?? null;
  const verifierModel = outcome.advisory?.verifierModel ?? outcome.verifierModel ?? null;
  // A dispatch that never produced a verdict has no verdict to report. Printing
  // UNCLEAR next to `outcome: unavailable` reads as verifier indecision — the
  // exact confusion MASTER-PLAN 671 removed from the machine-readable path.
  const verdict = outcome.advisory?.verdict ?? null;
  const execution = outcome.advisory?.execution ?? null;
  // Empty evidence previously produced no next step — the operator only learned
  // something was wrong from a vague verdict. Never blocks dispatch (a claim can
  // be legitimately self-contained), but always names the fix when either our
  // own input carried zero evidence or the runner independently flagged it missing.
  const remedy = (!hasEvidence || outcome.skippedReason === 'verifier-eligibility-evidence-missing')
    ? getMessage('xverify.remedy.no_evidence', lang)
    : null;
  // A tier-floor refusal is a host decision, not a verifier rationale — but it
  // is the ONLY thing the operator needs to read, so it takes the rationale slot
  // whenever no verifier verdict exists to occupy it.
  const reason = outcome.advisory?.reason
    ?? localizeTierFloorRefusal(outcome.skippedReason ?? null, lang);
  const executionLines = execution
    ? [
        `- ${getMessage('xverify.report.execution', lang, {
          outcome: execution.outcome,
          initial: execution.initialAttemptId,
          terminal: execution.terminalAttemptId,
        })}`,
        ...(execution.cumulativeUsage
          ? [
              `- ${getMessage('xverify.report.cumulative_usage', lang, {
                turns: String(execution.cumulativeUsage.turns),
                tokens: String(execution.cumulativeUsage.totalTokens),
                cacheRead: String(execution.cumulativeUsage.cacheReadTokens),
              })}`,
            ]
          : []),
      ]
    : [];
  const report = [
    `# xverify host adjudication — ${id}`,
    '',
    `- **Claim author:** ${author}`,
    `- ${getMessage('xverify.report.author_model', lang, {
      model: authorModel,
      confidence: getMessage(
        authorModelConfidence === 'authoritative'
          ? 'xverify.report.author_model_authoritative'
          : 'xverify.report.author_model_low_confidence',
        lang,
      ),
    })}`,
    `- **Verifier:** ${verifier ?? getMessage('xverify.report.none_dispatched', lang)}`,
    `- ${getMessage('xverify.report.verifier_model', lang, {
      model: verifierModel ?? getMessage('xverify.report.none_dispatched', lang),
    })}`,
    `- **Verdict:** ${verdict ? verdict.toUpperCase() : getMessage('xverify.report.no_verdict', lang)}`,
    `- **Outcome:** ${outcome.outcome}${outcome.skippedReason ? ` (${outcome.skippedReason})` : ''}`,
    `- **Host disposition:** ${outcome.disposition.toUpperCase()}`,
    `- **Blocked:** ${outcome.blocked ? 'yes' : 'no'}`,
    ...(outcome.advisory?.adjudicationReceiptRef
      ? [`- **Adjudication receipt:** ${outcome.advisory.adjudicationReceiptRef}`]
      : []),
    ...executionLines,
    ...(remedy ? [`- **Remedy:** ${remedy}`] : []),
    `- **At:** ${now.toISOString()}`,
    '',
    '## Claim',
    '',
    claim,
    '',
    '## Verifier rationale',
    '',
    reason?.trim() || '(none — see outcome above)',
    '',
    `> Provider output is evidence only. The host-authored disposition is authoritative. Evidence task artifacts: .tasks/task-${id}*`,
    '',
  ].join('\n');
  writeFileSync(reportPath, report, 'utf-8');

  return {
    id,
    author,
    authorModel,
    authorModelConfidence,
    verifier,
    verifierModel,
    verdict,
    outcome: outcome.outcome,
    disposition: outcome.disposition,
    blocked: outcome.blocked,
    skippedReason: outcome.skippedReason ?? null,
    reason,
    execution,
    assurance: outcome.advisory?.assurance ?? null,
    adjudicationReceiptRef: outcome.advisory?.adjudicationReceiptRef ?? null,
    remedy,
    rejection: outcome.rejection ?? null,
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
      onDispatch: deps.onDispatch ?? (({ author, priority, finalOnlyContainment }) => {
        print(getMessage('xverify.dispatching', lang, { author, priority: priority.join(' → ') }));
        // Visible risk evidence: a final-only verifier has no in-flight token cap.
        if (finalOnlyContainment) {
          print(getMessage('xverify.final_only_risk', lang, {
            verifier: priority.join(' → '),
            seconds: String(finalOnlyContainment.maxWallClockSeconds),
          }));
        }
      }),
    });
    if (opts.json) {
      print(JSON.stringify(result, null, 2));
      return;
    }
    print(getMessage('xverify.verdict', lang, {
      verdict: result.verdict
        ? result.verdict.toUpperCase()
        : getMessage('xverify.report.no_verdict', lang),
      verifier: result.verifier ?? '-',
      report: result.report,
    }));
    // No verdict + a host reason (e.g. the capability-tier floor) means the run
    // was refused for a nameable cause — printing only "no verdict" would leave
    // the operator guessing at a decision the host already made explicit.
    if (!result.verdict && result.reason) {
      print(result.reason);
    }
    if (result.remedy) {
      print(result.remedy);
    }
  } catch (err) {
    // Invocation errors only — verification outcomes never throw (advisory).
    printError(err instanceof Error ? err : new Error(String(err)));
    process.exitCode = 1;
  }
}

// ─── Registration ───────────────────────────────────────────────────────

export function registerXverifyCommand(program: Command, deps: XverifyDeps = {}): void {
  program
    .command('xverify <claim>')
    .description(getMessage('xverify.cmd_desc', getLanguage(undefined)))
    .option('--author <provider>', getMessage('xverify.opt_author', getLanguage(undefined), { providers: ALL_PROVIDER_NAMES.join('|') }))
    .option('--author-model <apiId>', getMessage('xverify.opt_author_model', getLanguage(undefined)))
    .option('--verifier <provider>', getMessage('xverify.opt_verifier', getLanguage(undefined)))
    .option('--verifier-model <id>', getMessage('xverify.opt_verifier_model', getLanguage(undefined)))
    .option('--diff', getMessage('xverify.opt_diff', getLanguage(undefined)))
    .option('--files <csv>', getMessage('xverify.opt_files', getLanguage(undefined)))
    .option('--target <specs>', getMessage('xverify.opt_target', getLanguage(undefined)))
    .option('--timeout <ms>', getMessage('xverify.opt_timeout', getLanguage(undefined)))
    .option('--json', getMessage('xverify.opt_json', getLanguage(undefined)))
    .action(async (claim: string, opts: XverifyCommandOpts) => {
      await runXverifyCommand(claim, opts, deps);
    });
}
