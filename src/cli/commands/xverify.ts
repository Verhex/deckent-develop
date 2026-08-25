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
import { userInfo } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import type {
  Task,
  TaskResult,
  ProviderName,
  ResolvedConfig,
  CrossVerifyExecutionEvidence,
} from '../../core/types.js';
import type { XVerifyVerifierTierAuthority } from '../../core/config-types.js';
import { TaskStatus, TaskEvaluation, ALL_PROVIDER_NAMES } from '../../core/types.js';
import { loadConfig, readAuthMode, resolveDefaultModel } from '../../core/config.js';
import { createGoNoGoCriterionItem } from '../../core/task-types.js';
import { modelRegistry } from '../../core/model-registry.js';
import { resolveXVerifyVerifierTierAuthority } from '../../core/xverify-verifier-tier-authority.js';
import { registerOpenRouterModelFromCache, readFreeModelCache } from '../../core/openrouter-models.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { bindGovernanceArgumentDescriptions } from '../helpers/message-catalog/cli-governance.js';
import type { VerifierDispatchRejection } from '../../core/cross-verify-prompt.js';
import type { TaskResultSettlementRefV1 } from '../../core/task-result-settlement.js';
import { crossVerifyVerdictReceiptRef } from '../../core/cross-verify-evidence-broker.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import {
  createCrossVerifyProductionIngressAuthority,
  createLiveDockerCrossVerifyExecutionProfileAuthority,
} from '../../orchestra/cross-verify-production-ingress-authority.js';
import type {
  MandatoryCrossVerifyInvocationFactory,
} from '../../orchestra/cross-verify-runner.js';
import { DockerSpawnBackend } from '../../orchestra/spawn-backend-docker.js';
import {
  prepareCrossVerifyCandidateEvidence,
  type CrossVerifyEvidencePreparationResult,
} from '../../orchestra/cross-verify-evidence-preparation.js';
import {
  openApprovalAuthorityRuntime,
  type ApprovalAuthorityRuntimeService,
} from '../../core/approval-authority-runtime.js';

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
  /** Hermetic seam for the pre-compose candidate evidence preparation (T2b). */
  prepareCandidateEvidenceFn?: typeof prepareCrossVerifyCandidateEvidence;
  /** Hermetic seam; production opens the project approval authority runtime. */
  openApprovalRuntimeFn?: (
    root: string,
    config: ResolvedConfig,
  ) => ApprovalAuthorityRuntimeService | undefined;
  /**
   * Invoked ONCE per pending approval request while the run is actually
   * blocked waiting for a decision. The CLI writes the typed waiting line to
   * stderr here; the MCP twin passes nothing and stays silent.
   */
  onApprovalWaiting?: (info: { requestId: string }) => void;
  /** Hermetic seam for the approval-poll backoff (no real timers in tests). */
  sleepFn?: (ms: number) => Promise<void>;
}

// ─── Approval waiting signal ────────────────────────────────────────────
//
// `prepareCrossVerifyCandidateEvidence` owns the approval poll loop (it is
// orchestra's, not this surface's — ADR-D-004 C3). The only seam it offers a
// caller is `sleepFn`, and it calls that seam EXACTLY when the decision is
// still missing. Hanging the signal there is therefore precise by
// construction: a decision that is already on disk claims on the first try,
// `sleepFn` is never invoked, and no waiting line is printed.

/**
 * Wraps a sleep so that each pending approval request announces itself once
 * before the run blocks again. Ids come from the same `broker.list('pending')`
 * surface `deckent approvals list` reads, so every printed id is one
 * `deckent approvals decide <id>` accepts.
 */
export function createApprovalWaitSignal(input: {
  listPendingRequestIds: () => readonly string[];
  onWaiting: (requestId: string) => void;
  sleepFn: (ms: number) => Promise<void>;
}): (ms: number) => Promise<void> {
  const announced = new Set<string>();
  return async (ms: number): Promise<void> => {
    for (const requestId of input.listPendingRequestIds()) {
      if (announced.has(requestId)) continue;
      announced.add(requestId);
      input.onWaiting(requestId);
    }
    await input.sleepFn(ms);
  };
}

/**
 * Effective approval-decision window. `--timeout` BOUNDS the approval wait —
 * it never extends it, and it is never a second flag: the operator's single
 * timeout now caps the decision wait the same way it caps the provider call.
 * `undefined` means "neither an authored window nor an operator timeout
 * exists" and leaves the mechanism's own default untouched.
 */
export function resolveApprovalDecisionWindowMs(input: {
  authoredWindowMs: number | undefined;
  requestedTimeoutMs: number | undefined;
}): number | undefined {
  const { authoredWindowMs, requestedTimeoutMs } = input;
  if (authoredWindowMs === undefined) return requestedTimeoutMs;
  if (requestedTimeoutMs === undefined) return authoredWindowMs;
  return Math.min(authoredWindowMs, requestedTimeoutMs);
}

/**
 * Reads back the composition hold detail the runner durably merged into the
 * evidence task result. Defensive on purpose: `detail` is written as an
 * intersection over `CrossVerifyEvidence`, so it is not a declared field and
 * must never be hard-cast. Any read failure is simply "no detail".
 */
function readDurableHoldDetail(root: string, taskId: string): string | null {
  try {
    const raw = readFileSync(join(root, '.tasks', `task-${taskId}.result`), 'utf-8');
    const parsed = JSON.parse(raw) as { crossVerify?: { detail?: unknown } };
    const detail = parsed.crossVerify?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : null;
  } catch {
    return null;
  }
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
  /** 1-based inclusive resolved line range (symbol targets resolve to lines too). */
  startLine: number;
  endLine: number;
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
      startLine: extracted.startLine,
      endLine: extracted.endLine,
    };
  }
  if (TARGET_SYMBOL_RE.test(locator)) {
    const extracted = extractSymbolBlock(lines, locator, relPath);
    return {
      path: relPath,
      locatorDescription: `symbol ${locator} (lines ${extracted.startLine}-${extracted.endLine})`,
      content: extracted.content,
      startLine: extracted.startLine,
      endLine: extracted.endLine,
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
  /** Admission provenance is host/config authority, never a verifier verdict. */
  tierAdmission: 'normal-tier-admitted' | 'owner-pair-admitted' | null;
  /** Opaque owner decision reference, projected only for an admitted exact pair. */
  tierDecisionRef: string | null;
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
  /** Exact settlement identity projected only from validated host-receipt bytes. */
  settlementRef: TaskResultSettlementRefV1 | null;
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
  /**
   * ADDITIVE (never a replacement): the exact durable hold detail behind a
   * hold/skip. `skippedReason` keeps its exact prior value — a consumer that
   * matched on it before still matches byte-for-byte.
   *
   * Source order:
   *   1. the candidate-evidence preparation hold's `detailCode` — the root
   *      cause, and on approval holds it IS the approval request id, so a
   *      `--json` caller reads the exact id `deckent approvals decide` takes;
   *   2. otherwise the composition hold detail the runner persists into
   *      `.tasks/task-<id>.result` → `crossVerify.detail`.
   * `null` when neither exists (a clean run has no hold detail to report).
   */
  detail: string | null;
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

/**
 * Projects the effective owner authority for the exact dispatched pair. This is
 * presentation metadata, not a verifier finding and not a second admission
 * path: the runner remains the dispatch/settlement authority.
 */
export function resolveTierAdmissionProjection(input: {
  authority: XVerifyVerifierTierAuthority | undefined;
  authorModel: string;
  authorProvider: string;
  verifierModel: string | null;
  verifierProvider: string | null;
}): { admission: 'normal-tier-admitted' | 'owner-pair-admitted' | null; decisionRef: string | null } {
  if (!input.verifierModel || !input.verifierProvider || input.verifierProvider === input.authorProvider) {
    return { admission: null, decisionRef: null };
  }
  const authorDefinition = modelRegistry.get(input.authorModel);
  const verifierDefinition = modelRegistry.get(input.verifierModel);
  if (!authorDefinition || !verifierDefinition
    || verifierDefinition.provider !== input.verifierProvider
    || authorDefinition.provider !== input.authorProvider) {
    return { admission: null, decisionRef: null };
  }
  // An owner pair is an exception only when it admits a verifier below the
  // normal tier floor. Equal-or-higher pairs remain normal tier admission even
  // if an unrelated allow entry exists for that exact pair.
  if (modelRegistry.compareTiers(verifierDefinition.tier, authorDefinition.tier) >= 0) {
    return { admission: 'normal-tier-admitted', decisionRef: null };
  }
  const authority = resolveXVerifyVerifierTierAuthority({
    authority: input.authority,
    authorModel: input.authorModel,
    verifierModel: input.verifierModel,
  });
  return authority.admitted
    ? { admission: 'owner-pair-admitted', decisionRef: authority.decisionRef }
    : { admission: null, decisionRef: null };
}

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
  // 7094/7081 ranged-read-verifier: targets are NO LONGER pasted into the
  // prompt as prose. Each resolved target becomes a ranged evidence
  // requirement (`path:START-END` — the runtime-bootstrap grammar), which the
  // v2 bootstrap turns into a first-class bounded decoded slice the verifier
  // reads and cites directly. Single evidence source (the content-addressed
  // mount) — no prompt/blob double-presentation drift.
  const targetsText = resolvedTargets.length > 0
    ? resolvedTargets.map((t) =>
        `### Target: ${t.path}:${t.startLine}-${t.endLine} (${t.locatorDescription}) — read it from the evidence mount`,
      ).join('\n')
    : undefined;
  const evidenceContext = [diffText, targetsText].filter((p): p is string => Boolean(p)).join('\n\n') || undefined;
  const hasEvidence = filesChanged.length > 0 || Boolean(opts.diff) || resolvedTargets.length > 0;

  // Requirement load: bare paths for --files entries WITHOUT a bounded target;
  // ranged requirements for every resolved target. A path that appears in both
  // is evidenced by its slice(s) — binding the requirement to the full-file
  // sha of a large file was the mechanical cause of the honest-HOLD class.
  const targetPaths = new Set(resolvedTargets.map((t) => t.path));
  const evidenceRequirements = [
    ...filesFromFlag.filter((f) => !targetPaths.has(f)),
    ...resolvedTargets.map((t) => `${t.path}:${t.startLine}-${t.endLine}`),
  ];
  const criterion = createGoNoGoCriterionItem({
    polarity: 'go',
    statement: claim,
    evidenceRequirements: evidenceRequirements.length > 0 ? evidenceRequirements : filesChanged,
  });
  const task: Task = {
    id,
    // The complete claim remains in Description. A host-generated stable title
    // avoids silently truncating a material claim before the prompt compiler can
    // apply its explicit host-truncation contract.
    title: `Session claim ${id}`,
    description: claim,
    // The envelope carries the AUTHOR's model (registry-validated above) so the
    // provider/model pair stays coherent and the runner's `task.model` author
    // fallback reads the truth — the session default is NOT the author's model.
    model: authorModel,
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

  // `requestedTimeoutMs` is what the operator actually authored (undefined when
  // `--timeout` was omitted); `timeoutMs` keeps its exact prior default.
  const requestedTimeoutMs = Number.parseInt(opts.timeout ?? '', 10) || undefined;
  const timeoutMs = requestedTimeoutMs ?? 300_000;

  // Human progress lines are diagnostics, not the machine payload. Under
  // `--json` they move to stderr so stdout stays a single parseable document;
  // without `--json` the operator-facing output is unchanged.
  const emitProgress = (line: string): void => {
    if (opts.json) process.stderr.write(`${line}\n`);
    else print(line);
  };

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

  // ── Pre-compose candidate evidence preparation (§12.2 T2b) ──
  // Runs BEFORE the composition so the candidate gate reads real reachability/
  // limit rows instead of holding forever on candidate_evidence_unavailable.
  // Every missing authority is a typed resumable HOLD printed here; the run
  // still proceeds into the composition, whose own gate ladder stays the
  // single settlement authority (no fabricated evidence, no fallback).
  let preparationHoldDetail: string | null = null;
  if (deps.providerAuthority?.state === 'ready' && authMode !== 'hybrid') {
    const prepare = deps.prepareCandidateEvidenceFn ?? prepareCrossVerifyCandidateEvidence;
    const openApproval = deps.openApprovalRuntimeFn ?? ((r: string, c: ResolvedConfig) => {
      const authorityConfig = c.approval?.authority;
      if (authorityConfig?.enabled !== true) return undefined;
      const opened = openApprovalAuthorityRuntime({
        projectRoot: r,
        tenantId: authorityConfig.tenant_id,
      });
      return opened.state === 'ready' ? opened.service : undefined;
    });
    const candidateProvider = verifierPriority.find(candidate => candidate !== author);
    const candidateModel = candidateProvider
      ? effectiveConfig.cross_verify?.verifier_model?.[candidateProvider]
      : undefined;
    if (candidateProvider && candidateModel) {
      const approvalRuntime = openApproval(root, config);
      const lang = getLanguage(config.language);
      // The 16-minute silent block: the run sat inside the approval poll loop
      // with nothing on any stream, so the operator could not tell a pending
      // decision from a hung process. One typed line per request, once.
      const approvalWaitSignal = createApprovalWaitSignal({
        listPendingRequestIds: () =>
          approvalRuntime?.broker.list('pending').map((request) => request.id) ?? [],
        onWaiting: (requestId) => deps.onApprovalWaiting?.({ requestId }),
        sleepFn: deps.sleepFn ?? ((ms) => new Promise<void>((resolve) => { setTimeout(resolve, ms); })),
      });
      const authoredWindowMs = config.approval?.authority?.decision_window_seconds
        ? config.approval.authority.decision_window_seconds * 1000
        : undefined;
      const decisionWindowMs = resolveApprovalDecisionWindowMs({
        authoredWindowMs,
        requestedTimeoutMs,
      });
      const preparation: CrossVerifyEvidencePreparationResult = await prepare({
        projectRoot: root,
        config,
        providerAuthority: deps.providerAuthority,
        ...(approvalRuntime ? { approvalRuntime } : {}),
        candidate: { provider: candidateProvider, model: candidateModel },
        dockerBackend,
        requester: { role: 'brain', instanceId: `cli-xverify:${process.pid}` },
        userId: userInfo().username,
        approvalSummary: getMessage('xverify.prepare.approval_summary', lang, {
          provider: candidateProvider,
          model: candidateModel,
        }),
        runId: `xverify:${id}`,
        ...(decisionWindowMs !== undefined ? { decisionWindowMs } : {}),
        sleepFn: approvalWaitSignal,
        ...(deps.nowFn ? { now: deps.nowFn } : {}),
      });
      if (preparation.state === 'hold') {
        preparationHoldDetail = preparation.detailCode;
        // A bounded wait that expired is still the EXISTING typed
        // approval_undecided hold — no new outcome class, no exit-code change.
        // The extra line only names the bound that fired and the exact request.
        if (preparation.reasonCode === 'approval_undecided' && requestedTimeoutMs !== undefined) {
          emitProgress(getMessage('xverify.prepare.approval_wait_timeout', lang, {
            timeoutMs: String(requestedTimeoutMs),
            requestId: preparation.approvalRequestId ?? preparation.detailCode,
          }));
        }
        emitProgress(getMessage('xverify.prepare.hold', lang, {
          reason: preparation.reasonCode,
          detail: preparation.detailCode,
          evidence: preparation.evidenceRefs.join(',') || '-',
        }));
        emitProgress(getMessage(`xverify.remedy.${preparation.reasonCode}`, lang, {
          requestId: preparation.approvalRequestId ?? '-',
          producerReason: preparation.producerReasonCode ?? '-',
        }));
      }
    }
  }

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
  const tierProjection = resolveTierAdmissionProjection({
    authority: effectiveConfig.cross_verify?.verifier_tier_authority,
    authorModel,
    authorProvider: author,
    verifierModel,
    verifierProvider: verifier,
  });
  const execution = outcome.advisory?.execution ?? null;
  // Empty evidence previously produced no next step — the operator only learned
  // something was wrong from a vague verdict. Never blocks dispatch (a claim can
  // be legitimately self-contained), but always names the fix when either our
  // own input carried zero evidence or the runner independently flagged it missing.
  const remedy = (!hasEvidence || outcome.skippedReason === 'verifier-eligibility-evidence-missing')
    ? getMessage('xverify.remedy.no_evidence', lang)
    : outcome.skippedReason?.includes('limit_unit_unreservable')
      ? getMessage('xverify.remedy.limit_unit_unreservable', lang)
      : outcome.skippedReason?.includes('adjudication_budget_unavailable')
        ? getMessage('xverify.remedy.adjudication_budget_unavailable', lang)
        : outcome.skippedReason?.includes('usage_unavailable')
          ? getMessage('xverify.remedy.usage_unavailable', lang)
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
    ...(tierProjection.admission
      ? [`- ${getMessage(`xverify.report.tier_admission.${tierProjection.admission}`, lang)}`]
      : []),
    ...(tierProjection.decisionRef
      ? [`- ${getMessage('xverify.report.tier_decision_ref', lang, { decisionRef: tierProjection.decisionRef })}`]
      : []),
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
    tierAdmission: tierProjection.admission,
    tierDecisionRef: tierProjection.decisionRef,
    verdict,
    outcome: outcome.outcome,
    disposition: outcome.disposition,
    blocked: outcome.blocked,
    skippedReason: outcome.skippedReason ?? null,
    reason,
    execution,
    // Authority-bearing fields come only from the runner's freshly validated
    // host receipt.  The advisory is display data and may contain provider
    // prose (or a stale/prefix-only reference), so it must not be projected
    // into a settlement-capable result.
    assurance: outcome.validatedAdjudicationReceipt?.receipt.assurance ?? null,
    adjudicationReceiptRef: outcome.validatedAdjudicationReceipt
      ? crossVerifyVerdictReceiptRef(outcome.validatedAdjudicationReceipt)
      : null,
    settlementRef: outcome.validatedAdjudicationReceipt ? {
      schemaVersion: outcome.validatedAdjudicationReceipt.receipt.schemaVersion,
      taskId: outcome.validatedAdjudicationReceipt.receipt.taskId,
      backend: outcome.validatedAdjudicationReceipt.receipt.backend,
      projectRootSha256: outcome.validatedAdjudicationReceipt.receipt.projectRootSha256,
      attemptId: outcome.validatedAdjudicationReceipt.receipt.attemptId,
    } : null,
    remedy,
    rejection: outcome.rejection ?? null,
    report: reportPath,
    // Appended last on purpose: every key above keeps its exact prior position
    // and value, so an existing `--json` consumer reads byte-identical fields.
    detail: preparationHoldDetail ?? readDurableHoldDetail(root, id),
  };
}

// ─── CLI wrapper (thin: print + exit-code semantics over the shared core) ──

/**
 * Writes the typed waiting-approval line. ALWAYS stderr, `--json` or not: it is
 * a liveness signal about a blocked run, never part of the machine payload, so
 * `--json` stdout stays a single parseable document.
 */
export function printXverifyWaitingApproval(requestId: string, lang: string): void {
  process.stderr.write(`${getMessage('xverify.prepare.waiting_approval', lang, { requestId })}\n`);
}

export async function runXverifyCommand(
  claim: string,
  opts: XverifyCommandOpts,
  deps: XverifyDeps = {},
): Promise<void> {
  const lang = getLanguage(undefined);
  // Progress lines never share stdout with a `--json` payload.
  const printProgress = (line: string): void => {
    if (opts.json) process.stderr.write(`${line}\n`);
    else print(line);
  };
  try {
    const result = await runXverifyForResult(claim, opts, {
      ...deps,
      onApprovalWaiting: deps.onApprovalWaiting
        ?? (({ requestId }) => { printXverifyWaitingApproval(requestId, lang); }),
      onDispatch: deps.onDispatch ?? (({ author, priority, finalOnlyContainment }) => {
        printProgress(getMessage('xverify.dispatching', lang, { author, priority: priority.join(' → ') }));
        // Visible risk evidence: a final-only verifier has no in-flight token cap.
        if (finalOnlyContainment) {
          printProgress(getMessage('xverify.final_only_risk', lang, {
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
  bindGovernanceArgumentDescriptions(
    program.command('xverify <claim>'),
    getLanguage(undefined),
    { claim: 'cli.governance.xverify.arg.claim' },
  )
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
