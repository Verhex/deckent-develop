import type {
  TaskOutputReadQuery,
  TaskOutputReadResult,
  TaskOutputReadService,
  TaskOutputReadIdentity,
  TaskOutputLiveObserveInput,
  TaskOutputLiveObserveResult,
} from './task-output-read-service.js';
import {
  createTaskOutputTextFramer,
  type TaskOutputHoldReason,
} from './task-output-text-framer.js';

type SealedRead = Extract<TaskOutputReadResult, { state: 'sealed' }>;
type PendingRead = Extract<TaskOutputReadResult, { state: 'pending' }>;

/** Neither process-local authority nor pristine provider content is public metadata. */
export type TaskOutputPublicState =
  | Omit<SealedRead, 'capability' | 'content'>
  | Omit<PendingRead, 'capability'>
  | Exclude<TaskOutputReadResult, SealedRead | PendingRead>;

export type TaskOutputProjectionEvent =
  | { readonly type: 'state'; readonly result: TaskOutputPublicState }
  | {
      readonly type: 'lines';
      readonly identity: TaskOutputReadIdentity;
      readonly source: 'pristine-provider-stream' | 'live-stdout' | 'live-stderr';
      readonly lines: readonly string[];
      /** The view is sanitized; source digests do not authenticate these display bytes. */
      readonly redacted: true;
      readonly omittedLines: number;
    }
  | { readonly type: 'observation-end'; readonly result: TaskOutputLiveObserveResult };

export interface TaskOutputProjectionInput {
  readonly query: TaskOutputReadQuery;
  readonly tail: number;
  readonly follow: boolean;
  readonly signal: AbortSignal;
  readonly limits: TaskOutputLiveObserveInput['limits'] & {
    readonly maxPendingBytes: number;
    readonly maxTailLines: number;
    readonly maxTailBytes: number;
  };
  readonly redactionLabel: string;
  readonly onEvent: (event: TaskOutputProjectionEvent) => void | Promise<void>;
}

export type TaskOutputProjectionResult =
  | { readonly state: 'sealed-view'; readonly omittedLines: number }
  | { readonly state: 'not-observed' }
  | { readonly state: 'live-view'; readonly observation: TaskOutputLiveObserveResult }
  | { readonly state: 'held'; readonly reason: TaskOutputHoldReason | 'invalid-view' | 'sink-failed' | 'reader-failed' };

function publicState(result: TaskOutputReadResult): TaskOutputPublicState {
  if (result.state === 'sealed') {
    const { capability: _capability, content: _content, ...metadata } = result;
    return metadata;
  }
  if (result.state === 'pending') {
    const { capability: _capability, ...metadata } = result;
    return metadata;
  }
  return result;
}

/** Shared CLI/API view, not a result evaluator or an execution authority. */
export async function projectTaskOutput(
  service: TaskOutputReadService,
  input: TaskOutputProjectionInput,
): Promise<TaskOutputProjectionResult> {
  if (!Number.isSafeInteger(input.tail) || input.tail < 0
    || ![input.limits.maxPendingBytes, input.limits.maxTailBytes, input.limits.maxTailLines,
      input.limits.termGraceMs, input.limits.reapObservationMs, input.limits.streamCloseMs]
      .every((value) => Number.isSafeInteger(value) && value > 0)
    || input.tail > input.limits.maxTailLines || !input.redactionLabel) {
    return { state: 'held', reason: 'invalid-view' };
  }
  if (input.signal.aborted) return { state: 'not-observed' };

  let sinkFailed = false;
  // Two independently backpressured streams share one ordered surface sink.
  // At most their two awaited writes can be queued; this is not an output buffer.
  let writes = Promise.resolve();
  const emit = (event: TaskOutputProjectionEvent): Promise<void> => {
    writes = writes.then(async () => {
      if (sinkFailed) throw new Error('output sink already failed');
      try { await input.onEvent(event); }
      catch { sinkFailed = true; throw new Error('output sink failed'); }
    });
    return writes;
  };
  const makeFramer = () => createTaskOutputTextFramer({
    maxPendingBytes: input.limits.maxPendingBytes,
    redactionLabel: input.redactionLabel,
  });

  try {
    const read = service.read(input.query);
    await emit({ type: 'state', result: publicState(read) });
    if (read.state === 'sealed') {
      const framer = makeFramer();
      const tail: Array<{ line: string; bytes: number }> = [];
      let bytes = 0;
      let omittedLines = 0;
      let head = 0;
      const retain = (lines: readonly string[]): void => {
        for (const line of lines) {
          const size = Buffer.byteLength(line, 'utf8');
          tail.push({ line, bytes: size });
          bytes += size;
          while (tail.length - head > input.tail || bytes > input.limits.maxTailBytes) {
            bytes -= tail[head++]!.bytes; // eviction requires at least one retained line
            omittedLines++;
          }
          // Release evicted strings without repeated O(n) shifts per line.
          if (head > 0 && head >= tail.length / 2) {
            tail.splice(0, head);
            head = 0;
          }
        }
      };
      // Decode was verified by the custody reader; preserve surrogate pairs when
      // re-encoding bounded chunks, and sanitize BEFORE applying the display tail.
      for (let offset = 0; offset < read.content.length;) {
        if (input.signal.aborted) return { state: 'not-observed' };
        let end = Math.min(offset + 16_384, read.content.length);
        const last = read.content.charCodeAt(end - 1);
        if (end < read.content.length && last >= 0xd800 && last <= 0xdbff) end--;
        const framed = framer.push(Buffer.from(read.content.slice(offset, end), 'utf8'));
        retain(framed.lines);
        if (framed.held) return { state: 'held', reason: framed.held.reason };
        offset = end;
      }
      const final = framer.end();
      retain(final.lines);
      if (final.held) return { state: 'held', reason: final.held.reason };
      await emit({ type: 'lines', identity: read.identity, source: read.source,
        lines: tail.slice(head).map((entry) => entry.line), redacted: true, omittedLines });
      return { state: 'sealed-view', omittedLines };
    }
    if (read.state !== 'pending' || read.capability === null) return { state: 'not-observed' };

    const framers = { stdout: makeFramer(), stderr: makeFramer() };
    const lastObservedChunk = { stdout: 0, stderr: 0 };
    let chunkSequence = 0;
    let framingHold: TaskOutputHoldReason | undefined;
    const sendLines = async (lines: readonly string[], source: 'stdout' | 'stderr'): Promise<void> => {
      if (lines.length === 0) return;
      await emit({ type: 'lines', identity: read.identity, source: `live-${source}`,
        lines, redacted: true, omittedLines: 0 });
    };
    const observation = await service.observe(read.capability, {
      tail: input.tail, follow: input.follow, signal: input.signal, limits: input.limits,
      onChunk: async (chunk, source) => {
        if (framingHold !== undefined) throw new Error('output framing held');
        lastObservedChunk[source] = ++chunkSequence;
        const framed = framers[source].push(chunk);
        await sendLines(framed.lines, source);
        if (framed.held) {
          framingHold = framed.held.reason;
          // The observer owns cleanup; a failing sink terminates only that client.
          throw new Error('output framing held');
        }
      },
    });
    if (sinkFailed) return { state: 'held', reason: 'sink-failed' };
    if (framingHold !== undefined) return { state: 'held', reason: framingHold };
    // A cancelled/failed stream can end in the middle of a word. Do not flush it
    // as a completed line. Only an honestly closed observer has a natural EOF.
    if (observation.state === 'closed') {
      // Independent pipes cannot prove the provider's global write order. At
      // EOF retain the observed final-chunk order, not an arbitrary stdout bias.
      const finalOrder = [...(['stdout', 'stderr'] as const)].sort(
        (a, b) => lastObservedChunk[a] - lastObservedChunk[b],
      );
      for (const source of finalOrder) {
        const final = framers[source].end();
        await sendLines(final.lines, source);
        if (final.held) return { state: 'held', reason: final.held.reason };
      }
    }
    await emit({ type: 'observation-end', result: observation });
    return { state: 'live-view', observation };
  } catch {
    return { state: 'held', reason: sinkFailed ? 'sink-failed' : 'reader-failed' };
  }
}
