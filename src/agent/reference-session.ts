import { createHash } from 'node:crypto';
import type { StructuredTurnInput, TurnReference } from './session.js';
import type { ReferenceDigestProgress, ReferenceScope, ReferenceSnapshot } from './reference-digest-types.js';
import { ReferenceDigestError } from './reference-digest-types.js';
import { buildReferenceOutline } from './reference-outline.js';
import { runReferenceDigest } from './reference-digest-runner.js';
import { digestReferenceValue } from './reference-digest-validation.js';
import { resolveAdapterReasoningControl } from './reasoning-control.js';
import { resolveAdapterStructuredOutputControl, canEnforceStructuredOutput } from './structured-output-control.js';
import type { ProviderAdapter, ProviderContextIdentity } from './provider-tooluse/types.js';
import type { SessionToolContentStore } from './session-tool-content.js';
import type { ScratchStoreInfo } from './scratch-checkpoint.js';
import type { ReferenceUsageLedger, DigestNode, ReferenceDigestResult, ReferenceInterimCapability } from './reference-digest-runner-types.js';
import type { ResolvedNativeAgentBudget } from '../core/execution-budget-policy.js';
import type { NativeBudgetState } from './guards/recursion.js';
import type { RequestMeasurementEvent } from './events.js';

export interface ReferenceSessionCapability {
  snapshot(path: string, scope: ReferenceScope, signal: AbortSignal, authorizeRead: (path: string) => boolean): Promise<ReferenceSnapshot>;
  inline(raw: string, contents: ReadonlyMap<string, string>): { prompt: string; references: TurnReference[] };
}
export interface ReferenceSessionInput {
  turn: StructuredTurnInput; scope: ReferenceScope; capability: ReferenceSessionCapability;
  authorizeRead(path: string): boolean;
  adapter: ProviderAdapter; context: ProviderContextIdentity; budget: ResolvedNativeAgentBudget; state: NativeBudgetState;
  store: SessionToolContentStore; scratch: ScratchStoreInfo; ledger: ReferenceUsageLedger; signal: AbortSignal;
  fits(payload: string): Promise<boolean>;
  /** 7113 D — exact token count of a payload, when the host has a counter.
   *  Absent or undefined means the retained figure stays UNKNOWN; it is never
   *  estimated from bytes and shown as tokens. */
  measureTokens?(payload: string): Promise<number | undefined>;
  onMeasurement(event: RequestMeasurementEvent): void;
  /** 7113 D — live host progress while the program runs. Delivery is real time;
   *  the view decides how often to repaint. */
  onDigestProgress?(progress: ReferenceDigestProgress): void;
  onProgress(result: ReferenceDigestResult): void;
  /** 7113-E B-2 — host seam for a real interim answer; absent = old behaviour. */
  interim?: ReferenceInterimCapability;
  /** 7113-E B-2 rev3 — interim usage that never reconciled. The host surfaces
   *  it as an OPEN completion/cost hold; it is never a failure of the reading. */
  onUsageHold?(hold: { readonly path: string; readonly requestIds: readonly string[]; readonly journalRef: string }): void;
}
/** Native session's pre-dispatch ingress. Snapshot acquisition stays behind the
 * current read policy; only validated compact content reaches the parent turn. */
export async function prepareReferenceDigests(input: ReferenceSessionInput): Promise<StructuredTurnInput> {
  const { turn, budget, store } = input, policy = budget.largeReference;
  const timeLeft = Math.min(policy.maxWallTimeMs, budget.maxWallTimeMs - (Date.now() - input.state.startedAtMs));
  if (timeLeft < 1) throw new ReferenceDigestError('REFERENCE_DEADLINE');
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(timeLeft)]);
  async function bounded<T>(operation: Promise<T>): Promise<T> {
    const failure = () => new ReferenceDigestError(input.signal.aborted ? 'REFERENCE_CANCELLED' : 'REFERENCE_DEADLINE');
    if (signal.aborted) throw failure();
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => { abort = () => reject(failure()); signal.addEventListener('abort', abort, { once: true }); });
    try { return await Promise.race([operation, cancelled]); } finally { signal.removeEventListener('abort', abort); }
  }
  const paths = [...new Set(turn.referenceRequests ?? [])];
  if (!paths.length) return turn;
  if (!policy.enabled || paths.length > policy.maxReferences || !store.pinReferenceContent || !store.restoreReferenceContent) throw new ReferenceDigestError('REFERENCE_SCOPE_REFUSED');
  const snapshots = new Map<string, ReferenceSnapshot>(), small = new Map<string, string>();
  const deadlineAt = Date.now() + timeLeft, startedAtMs = Date.now();
  /** One projection seam for this ingress: the runner owns the in-program facts,
   *  this layer owns the source identity and what the parent turn finally keeps. */
  const publish = (progress: ReferenceDigestProgress, sourcePath: string, retained?: ReferenceDigestProgress['retained']): void => {
    if (!input.onDigestProgress) return;
    try { input.onDigestProgress({ ...progress, sourcePath, ...(retained ? { retained } : {}) }); }
    catch { /* a view fault is never this program's failure */ }
  };
  let totalBytes = 0;
  for (const path of paths) {
    const snapshot = await bounded(input.capability.snapshot(path, input.scope, signal, input.authorizeRead));
    publish({ phase: 'ADMITTING', sourceBytes: snapshot.metadata.bytes, sourceDigest: snapshot.metadata.sourceDigest,
      observedBytes: snapshot.metadata.bytes, coveredBytes: 0, requests: { map: 0, reduce: 0, interim: 0, cap: policy.maxRequests },
      usage: { inputTokens: 0, outputTokens: 0 }, deadlineRemainingMs: Math.max(0, deadlineAt - Date.now()),
      startedAtMs, updatedAt: Date.now() }, path);
    totalBytes += snapshot.metadata.bytes;
    if (totalBytes > policy.maxSourceBytes) throw new ReferenceDigestError('REFERENCE_SOURCE_TOO_LARGE');
    snapshots.set(path, snapshot);
    if (snapshot.metadata.bytes <= 32 * 1024) {
      const parts: Uint8Array[] = []; for await (const bytes of snapshot.stream(signal)) parts.push(bytes);
      small.set(path, Buffer.concat(parts).toString('utf8'));
    }
  }
  if (small.size === paths.length) {
    const inline = input.capability.inline(turn.expandedPayload, small);
    if (await bounded(input.fits(inline.prompt))) return { ...turn, expandedPayload: inline.prompt, references: inline.references };
  }
  const descriptor = await bounded(resolveAdapterReasoningControl(input.adapter, input.context.model, signal));
  if (!descriptor) throw new ReferenceDigestError('REFERENCE_THINKING_CONTROL_UNAVAILABLE');
  // 7113-E — the digest contract is a JSON object the host must be able to
  // validate. Before this gate the schema was only DESCRIBED in the prompt, so
  // compliance rested on the model's goodwill and the measured run returned
  // prose (`payload-json-parse`) after spending the whole budget. If nothing
  // proves the server enforces the schema, the honest answer is to hold here —
  // before a single token is spent — and tell the owner which key turns it on.
  const structured = await bounded(resolveAdapterStructuredOutputControl(input.adapter, input.context.model, signal));
  if (!canEnforceStructuredOutput(structured)) throw new ReferenceDigestError('REFERENCE_STRUCTURED_OUTPUT_UNAVAILABLE');
  const references: TurnReference[] = [], summaries: string[] = [];
  for (const [path, snapshot] of snapshots) {
    const identity = { ...input.scope, schemaVersion: 1 as const, partitionVersion: 1 as const,
      programDigest: digestReferenceValue([turn.rawIntent, input.context]),
      sourceDigest: snapshot.metadata.sourceDigest, descriptorDigest: digestReferenceValue(descriptor) };
    const pinId = digestReferenceValue([identity, turn.rawIntent]);
    let lastProgress: ReferenceDigestProgress | undefined;
    const oldPin = await bounded(store.restoreReferenceContent(pinId, signal));
    const nodeRefs = new Set(oldPin?.nodeRefs ?? []);
    // A newly authorized capture is the source authority on this invocation;
    // old digest nodes are reusable only under B's exact journal identity/plan.
    let pinQueue: Promise<void> = Promise.resolve();
    const pin = (): Promise<void> => {
      // 7113-C-PIN-CANCEL-FIX — two separate facts. (1) The pin itself carries
      // the composed signal, so an aborted attempt can never publish. (2) THIS
      // orchestrator's wait is bounded by the same signal, so a filesystem call
      // that never returns can no longer hold the turn open: we stop waiting,
      // the attempt keeps its own cleanup, and its late rejection is absorbed
      // here instead of surfacing as an unhandled rejection. A Node fs syscall
      // is not physically cancelled — that is not claimed anywhere.
      pinQueue = pinQueue.then(() => store.pinReferenceContent!(pinId, {
        source: { detailRef: snapshot.metadata.snapshotRef, sha256: snapshot.metadata.sourceDigest }, nodeRefs: [...nodeRefs],
      }, Date.now() + budget.maxWallTimeMs + input.scratch.recoveryWindowMs, signal));
      const attempt = pinQueue;
      attempt.catch(() => undefined);
      return bounded(attempt);
    };
    await pin();
    // The outline's own signal checks happen at chunk boundaries; a read that
    // never returns between two chunks would still block. Race the whole call.
    const outline = await bounded(buildReferenceOutline(snapshot, {
      maxPartBytes: Math.min(256 * 1024, policy.maxSourceBytes),
      // 7113-E D2 — a smaller FIRST part so the first validated node, and with
      // it the turn's first real answer, can exist in seconds instead of after
      // a full-size step. Coverage, budgets and ceilings are unchanged.
      firstPartBytes: Math.min(policy.firstPartBytes, policy.maxSourceBytes),
      maxNodes: policy.maxRequests, maxSourceBytes: policy.maxSourceBytes,
    }, signal));
    const remainingRequests = Math.min(policy.maxRequests, budget.maxModelRounds - input.state.rounds - 1);
    const remainingTime = Math.min(policy.maxWallTimeMs, budget.maxWallTimeMs - (Date.now() - input.state.startedAtMs));
    const remainingTokens = budget.maxCumulativeTokens - input.state.cumulativeTokens;
    if (remainingRequests < 1 || remainingTime < 1 || remainingTokens <= policy.finalAnswerReserveTokens) throw new ReferenceDigestError('REFERENCE_BUDGET_INSUFFICIENT');
    const result = await runReferenceDigest({ snapshot, outline, identity, context: input.context, adapter: input.adapter,
      contentStore: store, scratch: input.scratch, ledger: input.ledger, signal: AbortSignal.any([signal, AbortSignal.timeout(remainingTime)]),
      // The user's own signal, unmixed, so the runner never records this
      // program's deadline as a user cancellation.
      userSignal: input.signal,
      ...(input.interim ? { interim: input.interim } : {}),
      instruction: turn.rawIntent,
      policy: { maxSourceBytes: policy.maxSourceBytes, maxRequests: policy.maxRequests, maxDepth: policy.maxDepth,
        maxWallTimeMs: policy.maxWallTimeMs, maxTotalTokens: budget.maxCumulativeTokens,
        maxMapOutputTokens: policy.maxMapOutputTokens, maxReduceOutputTokens: policy.maxReduceOutputTokens,
        maxResponseBytes: 64 * 1024, maxItems: 128, maxTextBytes: 4096, finalAnswerReserveTokens: policy.finalAnswerReserveTokens,
        contextSafetyReserveTokens: budget.contextSafetyReserveTokens, concurrencyCap: policy.concurrencyCap,
        // This native session owns one provider dispatch slot; wider capacity is not inferred.
        providerConcurrency: 1, tenantConcurrency: 1,
        measurementTimeoutMs: Math.min(30_000, policy.maxWallTimeMs) },
      onMeasurement: input.onMeasurement,
      ...(input.onDigestProgress ? { onDigestProgress: progress => { lastProgress = progress; publish(progress, path); } } : {}),
      onNodePersist: async ref => { nodeRefs.add(ref); await pin(); },
    });
    input.onProgress(result);
    // 7113-E B-2 rev3 — a finished reading with unreconciled interim usage is
    // NOT a closed cost truth. The verified coverage is kept (it is real), but
    // the caller is told, by exact request id, that settlement stays open. No
    // receipt is invented for it anywhere.
    if (result.unresolvedInterimUsage?.length) {
      input.onUsageHold?.({ path, requestIds: result.unresolvedInterimUsage, journalRef: result.journalRef });
    }
    if (result.phase !== 'ANSWERING' || !result.rootRef) throw new ReferenceDigestError(result.failure ?? 'REFERENCE_OUTPUT_INVALID');
    const parts: Uint8Array[] = []; let offset = 0;
    do {
      // Same distinction: the store checks the signal at entry and inside its
      // verified range read, but the orchestrator still bounds the wait.
      const read = await bounded(store.readContentRef({ sha256: result.rootRef, offset, limit: 65_536 }, signal));
      if (read.kind !== 'loaded' || read.offset !== offset || read.totalBytes > 64 * 1024 + policy.maxRequests * 256 + 4096) throw new ReferenceDigestError('REFERENCE_STORE_FAILED');
      parts.push(read.bytes); if (read.nextOffset === null) break; offset = read.nextOffset;
    } while (true);
    const bytes = Buffer.concat(parts);
    if (createHash('sha256').update(bytes).digest('hex') !== result.rootRef) throw new ReferenceDigestError('REFERENCE_STORE_FAILED');
    const node = JSON.parse(bytes.toString('utf8')) as DigestNode;
    const summary = JSON.stringify({ source: `sha256:${snapshot.metadata.sourceDigest}`, bytes: snapshot.metadata.bytes,
      digestRef: `sha256:${result.rootRef}`, coverage: result.coveredRanges, payload: node.payload });
    summaries.push(summary);
    if (input.onDigestProgress) {
      const digestTokens = input.measureTokens ? await bounded(input.measureTokens(summary)) : undefined;
      publish({
        ...(lastProgress ?? { sections: undefined, requests: { map: 0, reduce: 0, interim: 0, cap: policy.maxRequests }, startedAtMs }),
        phase: 'COMPLETE', sourceBytes: snapshot.metadata.bytes, sourceDigest: snapshot.metadata.sourceDigest,
        observedBytes: snapshot.metadata.bytes,
        coveredBytes: result.coveredRanges.reduce((sum, range) => sum + (range.byteEnd - range.byteStart), 0),
        usage: result.usage, deadlineRemainingMs: Math.max(0, deadlineAt - Date.now()),
        journalRef: result.journalRef, startedAtMs, updatedAt: Date.now(),
        ...(result.unresolvedInterimUsage?.length ? { unresolvedInterimUsage: result.unresolvedInterimUsage } : {}),
      }, path, digestTokens === undefined
        ? undefined
        : { digestTokens, capTokens: budget.maxCumulativeTokens - input.state.cumulativeTokens, windowTokens: input.context.contextWindowTokens });
    }
    references.push({ path, digestRef: result.rootRef, digest: snapshot.metadata.sourceDigest, bytes: snapshot.metadata.bytes, excerpt: summary.slice(0, 320), ok: true, truncated: false });
  }
  const expandedPayload = `${turn.expandedPayload}\n[verified-reference-digests]\n${summaries.join('\n')}`;
  if (!await bounded(input.fits(expandedPayload))) throw new ReferenceDigestError('REFERENCE_BUDGET_INSUFFICIENT');
  return { ...turn, expandedPayload, references };
}
