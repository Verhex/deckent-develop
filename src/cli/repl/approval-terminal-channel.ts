import { isDeepStrictEqual } from 'node:util';

import type { ApprovalDecisionInput } from '../../core/approval-broker.js';
import type { ApprovalDecision, ApprovalRequest } from '../../core/approval-contract.js';
import type { ApprovalEventStream, ApprovalStreamEvent, ApprovalStreamFilter } from '../../core/approval-eventstream.js';
import type { ApprovalRelay, RelayChannel } from '../../core/approval-relay.js';
import type {
  ApprovalTerminalDecisionAdapter,
  ApprovalTerminalDecisionResult,
  ApprovalTerminalSuspender,
} from './approval-terminal-command.js';

export type ApprovalTerminalLifecycleOutcome = 'expired' | 'deferred' | 'escalated' | 'untrusted';

export interface ApprovalTerminalLifecycleEvent {
  readonly kind: 'terminal-outcome';
  readonly request: ApprovalRequest;
  readonly outcome: ApprovalTerminalLifecycleOutcome;
  readonly reasonCode: string;
  readonly decision?: ApprovalDecision;
}

export type ApprovalTerminalEvent = ApprovalStreamEvent | ApprovalTerminalLifecycleEvent;

export interface ApprovalTerminalChannelOptions {
  channelName?: string;
  clientId?: string;
  filter?: ApprovalStreamFilter;
  /** The only production decision ingress. Absence stays read-only and returns typed HOLD. */
  decisionAdapter?: ApprovalTerminalDecisionAdapter;
}

export interface ApprovalTerminalChannel {
  events: AsyncIterable<ApprovalTerminalEvent>;
  decide(
    request: ApprovalRequest,
    action: 'allow' | 'deny',
    suspendTerminal: ApprovalTerminalSuspender,
  ): Promise<ApprovalTerminalDecisionResult>;
  /** Legacy call shape remains type-compatible, but can never write a raw broker decision. */
  decide(id: string, input: ApprovalDecisionInput): Promise<ApprovalTerminalDecisionResult>;
  dispose(): void;
}

function unavailable(reasonCode: string): ApprovalTerminalDecisionResult {
  return { kind: 'hold', reasonCode };
}

/**
 * Read-side relay/event-stream bridge plus an explicitly injected authenticated
 * decision adapter. The relay channel registered here is deliberately passive:
 * its onDecision callback is never retained or invoked, so this surface has no
 * compatibility path to ApprovalRelay's raw broker writer.
 */
export function createApprovalTerminalChannel(
  relay: ApprovalRelay,
  eventStream: ApprovalEventStream,
  options: ApprovalTerminalChannelOptions = {},
): ApprovalTerminalChannel {
  const channelName = options.channelName ?? 'terminal';
  const clientId = options.clientId ?? channelName;
  const passiveChannel: RelayChannel = {
    send: () => {},
    onDecision: () => {},
  };
  relay.attachChannel(channelName, passiveChannel);
  const subscription = eventStream.subscribe(clientId, options.filter);
  let disposed = false;
  const inFlight = new Map<string, {
    readonly action: 'allow' | 'deny';
    readonly promise: Promise<ApprovalTerminalDecisionResult>;
  }>();

  const events: AsyncIterable<ApprovalTerminalEvent> = {
    async *[Symbol.asyncIterator]() {
      for await (const event of subscription.events) {
        if (event.kind !== 'cross-decided') {
          yield event;
          continue;
        }
        const own = inFlight.get(event.request.id);
        if (own) {
          const local = await own.promise;
          // Only the exact durable acceptance already carried by the local
          // result is a duplicate. A HOLD/cancel/untrusted result is not a
          // settlement carrier: its concurrently winning durable event must
          // continue through the same cross-channel authority verification.
          if (local.kind === 'accepted'
            && isDeepStrictEqual(local.decision, event.decision)) {
            continue;
          }
        }
        if (!options.decisionAdapter) {
          yield {
            kind: 'terminal-outcome',
            request: event.request,
            outcome: 'untrusted',
            reasonCode: 'authenticated-decision-adapter-unavailable',
            decision: event.decision,
          };
          continue;
        }
        let verification;
        try {
          verification = await options.decisionAdapter.verifyCrossDecision(event.request, event.decision);
        } catch (error) {
          yield {
            kind: 'terminal-outcome',
            request: event.request,
            outcome: 'untrusted',
            reasonCode: `cross-verification-failed:${error instanceof Error ? error.name : 'unknown'}`,
            decision: event.decision,
          };
          continue;
        }
        if (verification.kind === 'trusted') {
          yield event;
        } else {
          yield {
            kind: 'terminal-outcome',
            request: event.request,
            outcome: verification.kind,
            reasonCode: verification.kind === 'untrusted'
              ? verification.reasonCode
              : `durable-${verification.kind}`,
            ...(verification.decision ? { decision: verification.decision } : {}),
          };
        }
      }
    },
  };

  function decide(
    requestOrId: ApprovalRequest | string,
    actionOrInput: 'allow' | 'deny' | ApprovalDecisionInput,
    suspendTerminal?: ApprovalTerminalSuspender,
  ): Promise<ApprovalTerminalDecisionResult> {
    if (disposed) return Promise.resolve(unavailable('terminal-channel-disposed'));
    if (typeof requestOrId === 'string' || typeof actionOrInput !== 'string' || !suspendTerminal) {
      return Promise.resolve(unavailable('authenticated-decision-adapter-required'));
    }
    if (!options.decisionAdapter) {
      return Promise.resolve(unavailable('authenticated-decision-adapter-unavailable'));
    }
    const existing = inFlight.get(requestOrId.id);
    if (existing) {
      return existing.action === actionOrInput
        ? existing.promise
        : Promise.resolve(unavailable('decision-already-in-flight'));
    }
    const promise = options.decisionAdapter
      .decide(requestOrId, actionOrInput, suspendTerminal)
      .catch((error: unknown) => unavailable(
        `decision-adapter-failed:${error instanceof Error ? error.name : 'unknown'}`,
      ))
      .finally(() => { inFlight.delete(requestOrId.id); });
    inFlight.set(requestOrId.id, { action: actionOrInput, promise });
    return promise;
  }

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    subscription.unsubscribe();
    relay.detachChannel(channelName);
  };

  return { events, decide, dispose };
}
