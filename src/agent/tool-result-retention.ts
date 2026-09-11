// 7109-d — retained tool-result shrink before measured-window checkpoint.
import { createHash } from 'node:crypto';
// Shrinks oldest inline tool bodies to preview+contentRef; never truncates without
// a durable store write (failed store → byte-identical inline preserved).

import type { ResolvedNativeAgentBudget } from '../core/execution-budget-policy.js';
import { DEFAULT_NATIVE_AGENT_BUDGET } from '../core/execution-budget-policy.js';
import type { ContentWriter } from './tool-result-broker.js';
import type { ToolResult } from './tools/types.js';
import {
  containToolResult,
  previewBytesFromTokenShare,
  renderToolResultEnvelope,
  ToolResultContextBudgetError,
} from './tool-result-broker.js';
import { measureRetainedToolResultTokens, toolResultBytesToTokens } from './context-budget.js';
import type { ProviderMessage, RequestMeasurement } from './provider-tooluse/types.js';
import { Transcript, type TranscriptEntry } from './transcript.js';

const TRUNCATION_MARKER = '[deckent] tool-result truncated';

export interface ToolResultSnapshot {
  readonly toolCallId: string;
  readonly message: ProviderMessage;
  readonly entry: TranscriptEntry;
}

export function isAlreadyShrunkToolContent(content: string): boolean {
  return content.includes(TRUNCATION_MARKER);
}

/** Inline tool bodies large enough to benefit from retention shrink. */
export function isShrinkableToolContent(content: string, minBytes = 512): boolean {
  if (isAlreadyShrunkToolContent(content)) return false;
  return Buffer.byteLength(content, 'utf8') > minBytes;
}

export type ShrinkContentResult =
  | { ok: true; rendered: string }
  | { ok: false; reason: 'too-small' | 'store-failed' };

/** Re-contain one inline tool body; abort when durable spill is unavailable. */
export function shrinkToolResultContent(
  rawOutput: string,
  opts: { store: ContentWriter; maxPreviewBytes: number; maxRenderedBytes?: number },
): ShrinkContentResult {
  const bytes = Buffer.byteLength(rawOutput, 'utf8');
  if (bytes <= opts.maxPreviewBytes) return { ok: false, reason: 'too-small' };
  const env = containToolResult(
    { output: rawOutput, ok: true },
    { store: opts.store, maxPreviewBytes: opts.maxPreviewBytes, maxRenderedBytes: opts.maxRenderedBytes ?? opts.maxPreviewBytes },
  );
  if (!env.truncated) return { ok: false, reason: 'too-small' };
  if (env.contentRef === null) return { ok: false, reason: 'store-failed' };
  try {
    return { ok: true, rendered: renderToolResultEnvelope(env, opts.maxRenderedBytes ?? opts.maxPreviewBytes) };
  } catch (error) {
    if (error instanceof ToolResultContextBudgetError) return { ok: false, reason: 'too-small' };
    throw error;
  }
}

export interface RetentionShrinkInput {
  readonly transcript: Transcript;
  readonly store: ContentWriter;
  readonly nativeBudget: ResolvedNativeAgentBudget;
  readonly rawBudget: number;
  readonly tokensPerUtf8Byte: number;
  readonly measureRequest: (messages: readonly ProviderMessage[]) => Promise<RequestMeasurement>;
  /** Free at least this many retained tool tokens (estimate) when possible. */
  readonly targetFreeTokens?: number;
  readonly maxOps?: number;
}

export interface RetentionShrinkResult {
  readonly shrunkCount: number;
  readonly snapshots: readonly ToolResultSnapshot[];
  readonly retainedMeasure: Awaited<ReturnType<typeof measureRetainedToolResultTokens>>;
}

export function resolveRetentionPreviewBytes(
  nativeBudget: ResolvedNativeAgentBudget,
  rawBudget: number,
  tokensPerUtf8Byte: number,
): number {
  const singleShare = nativeBudget.maxToolResultShareOfContext ?? DEFAULT_NATIVE_AGENT_BUDGET.maxToolResultShareOfContext;
  const singleCapTokens = Math.floor(rawBudget * singleShare);
  return previewBytesFromTokenShare(singleCapTokens, tokensPerUtf8Byte);
}

/** Oldest-first retention shrink until target freed or no shrinkable results remain. */
export async function shrinkOldestRetainedResults(input: RetentionShrinkInput): Promise<RetentionShrinkResult> {
  const previewBytes = resolveRetentionPreviewBytes(input.nativeBudget, input.rawBudget, input.tokensPerUtf8Byte);
  const maxOps = input.maxOps ?? 32;
  const snapshots: ToolResultSnapshot[] = [];
  let shrunkCount = 0;
  let freedTokens = 0;

  for (const toolCallId of input.transcript.listToolResultCallIds()) {
    if (shrunkCount >= maxOps) break;
    if (input.targetFreeTokens !== undefined && freedTokens >= input.targetFreeTokens) break;
    const prior = input.transcript.getToolResultContent(toolCallId);
    if (prior === undefined || !isShrinkableToolContent(prior)) continue;
    const priorBytes = Buffer.byteLength(prior, 'utf8');
    const attempt = shrinkToolResultContent(prior, {
      store: input.store,
      maxPreviewBytes: previewBytes,
    });
    if (!attempt.ok) continue;
    const snap = input.transcript.captureToolResultSnapshot(toolCallId);
    if (snap === undefined) continue;
    const applied = input.transcript.shrinkToolResultInline(toolCallId, attempt.rendered);
    if (applied.status !== 'applied') continue;
    snapshots.push(snap);
    shrunkCount++;
    freedTokens += Math.max(0, toolResultBytesToTokens(priorBytes, input.tokensPerUtf8Byte)
      - toolResultBytesToTokens(applied.newBytes, input.tokensPerUtf8Byte));
  }

  const retainedMeasure = await measureRetainedToolResultTokens(
    input.transcript.toProviderMessages(),
    input.measureRequest,
  );
  return { shrunkCount, snapshots, retainedMeasure };
}

/** Restore snapshots after a failed downstream step (rollback proof). */
export function restoreToolResultSnapshots(transcript: Transcript, snapshots: readonly ToolResultSnapshot[]): void {
  for (const snap of snapshots) transcript.restoreToolResultSnapshot(snap);
}

export function canEmitMeasuredWindowCheckpoint(measure: RequestMeasurement): boolean {
  return measure.quality === 'exact';
}

/** Delivery state when execution succeeded but context admission withheld the wire body. */
export const TOOL_RESULT_DELIVERY_WITHHELD = 'undelivered' as const;
export const TOOL_RESULT_DELIVERY_DELIVERED = 'delivered' as const;
export type ToolResultDeliveryState =
  | typeof TOOL_RESULT_DELIVERY_WITHHELD
  | typeof TOOL_RESULT_DELIVERY_DELIVERED;

export function parseToolResultDelivery(raw: unknown): ToolResultDeliveryState | undefined {
  if (raw === TOOL_RESULT_DELIVERY_WITHHELD || raw === TOOL_RESULT_DELIVERY_DELIVERED) return raw;
  return undefined;
}

export const TOOL_RESULT_CONTEXT_BUDGET_EXHAUSTED_CODE = 'TOOL_RESULT_CONTEXT_BUDGET_EXHAUSTED';

/**
 * Preserve executed tool truth while pairing a minimal transcript line. Full bytes
 * spill to the session store when available so content-ref reads stay honest.
 */
export function withholdToolResultFromContext(
  executed: ToolResult,
  store: ContentWriter | undefined,
): ToolResult {
  const raw = typeof executed.output === 'string' ? executed.output : '';
  const bytes = Buffer.from(raw, 'utf8');
  const expectedSha256 = createHash('sha256').update(bytes).digest('hex');
  let resultRef: string | undefined;
  if (store && bytes.byteLength > 0) {
    try {
      const receipt = store.write(bytes);
      if (receipt.sha256 === expectedSha256) resultRef = receipt.sha256;
    } catch {
      resultRef = undefined;
    }
  }
  const meta: Record<string, unknown> = {
    ...(executed.meta ?? {}),
    code: TOOL_RESULT_CONTEXT_BUDGET_EXHAUSTED_CODE,
    delivery: TOOL_RESULT_DELIVERY_WITHHELD,
    executedOk: executed.ok,
  };
  if (resultRef !== undefined) {
    meta['resultRef'] = resultRef;
    meta['spillSha256'] = resultRef;
  }
  const output = resultRef !== undefined
    ? `[deckent] tool-result withheld; sha256:${resultRef}`
    : '[deckent] tool-result withheld; ref unavailable';
  return { ok: executed.ok, output, meta };
}
