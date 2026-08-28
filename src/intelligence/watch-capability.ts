import {
  CapabilityRegistry,
  type CapabilityHandler,
} from '../core/capability-broker.js';
import { MemoryStore } from '../core/memory-store.js';
import type { MemoryEntryV2 } from '../core/memory-types.js';
import type { CompetitorEvent } from './event-history.js';
import type {
  ConditionalFetchState,
  SourceDefinition,
  SourceRetrievalResult,
} from './source-retrieval.js';
import {
  runWatchService,
  type WatchHistoryStore,
  type WatchOutbox,
  type WatchServiceDependencies,
} from './watch-service.js';

export const WATCH_CAPABILITY_ID = 'intelligence.competitor-watch' as const;
export const WATCH_CAPABILITY_KIND = 'capability' as const;

const EVENT_PREFIX = 'intelligence-watch:event:';
const CURSOR_PREFIX = 'intelligence-watch:cursor:';

export interface WatchCapabilityBinding {
  readonly memoryStore: MemoryStore;
  readonly fetch: WatchServiceDependencies['fetch'];
  readonly now: WatchServiceDependencies['now'];
  readonly readEvidence: WatchServiceDependencies['readEvidence'];
  readonly interpretSource: WatchServiceDependencies['interpretSource'];
  readonly outbox: WatchOutbox;
}

export interface WatchSourceReceipt {
  readonly sourceId: string;
  readonly outcome: SourceRetrievalResult['status'];
  readonly byteCount: number;
  readonly framedOutputDigest: `sha256:${string}`;
}

export type WatchCapabilityOutcome =
  | {
      readonly kind: 'completed';
      readonly dryRun: boolean;
      readonly alertCount: number;
      readonly suppressedCount: number;
      readonly issueCount: number;
      readonly receipts: readonly WatchSourceReceipt[];
    }
  | {
      readonly kind: 'rejected';
      readonly code: 'INVALID_ARGUMENTS' | 'LIVE_BROKER_BINDING_REQUIRED';
      readonly message: string;
      readonly receipts: readonly WatchSourceReceipt[];
    }
  | {
      readonly kind: 'failed';
      readonly code: 'WATCH_SERVICE_FAILED';
      readonly message: string;
      readonly receipts: readonly WatchSourceReceipt[];
    };

export type WatchCapabilityAdmission =
  | {
      readonly kind: 'admitted';
      readonly capabilityId: typeof WATCH_CAPABILITY_ID;
    }
  | {
      readonly kind: 'rejected';
      readonly code: 'LIVE_BROKER_BINDING_REQUIRED';
      readonly capabilityId: typeof WATCH_CAPABILITY_ID;
    };

/** Install the sole watch-service invocation path on a concrete live registry. */
export function registerWatchCapability(
  registry: CapabilityRegistry,
  binding: WatchCapabilityBinding,
): WatchCapabilityAdmission {
  if (!isLiveBinding(registry, binding)) {
    return {
      kind: 'rejected',
      code: 'LIVE_BROKER_BINDING_REQUIRED',
      capabilityId: WATCH_CAPABILITY_ID,
    };
  }

  const handler: CapabilityHandler = {
    requiredCapability: 'network',
    description:
      'Retrieves configured official intelligence sources and emits bounded receipts.',
    invoke: async (args) => invokeWatchCapability(args, binding),
  };
  registry.register(WATCH_CAPABILITY_ID, handler, {
    isAvailable: () => isLiveBinding(registry, binding),
  });
  return { kind: 'admitted', capabilityId: WATCH_CAPABILITY_ID };
}

async function invokeWatchCapability(
  args: Record<string, unknown>,
  binding: WatchCapabilityBinding,
): Promise<WatchCapabilityOutcome> {
  const input = parseInput(args);
  if (input === undefined) {
    return {
      kind: 'rejected',
      code: 'INVALID_ARGUMENTS',
      message: 'sources must be valid source definitions; dryRun must be boolean',
      receipts: [],
    };
  }

  try {
    const result = await runWatchService(input, {
      readEvidence: binding.readEvidence,
      fetch: binding.fetch,
      store: memoryWatchStore(binding.memoryStore),
      outbox: binding.outbox,
      now: binding.now,
      interpretSource: binding.interpretSource,
    });
    return {
      kind: 'completed',
      dryRun: result.dryRun,
      alertCount: result.alerts.length,
      suppressedCount: result.suppressedSignalIds.length,
      issueCount: result.issues.length,
      receipts: result.sourceResults.map(sourceReceipt),
    };
  } catch (error: unknown) {
    return {
      kind: 'failed',
      code: 'WATCH_SERVICE_FAILED',
      message: error instanceof Error ? error.message : String(error),
      receipts: [],
    };
  }
}

function isLiveBinding(
  registry: unknown,
  binding: unknown,
): binding is WatchCapabilityBinding {
  if (!(registry instanceof CapabilityRegistry) || !(binding instanceof Object)) return false;
  const candidate = binding as Partial<WatchCapabilityBinding>;
  return candidate.memoryStore instanceof MemoryStore
    && typeof candidate.fetch === 'function'
    && typeof candidate.now === 'function'
    && typeof candidate.readEvidence === 'function'
    && typeof candidate.interpretSource === 'function'
    && candidate.outbox instanceof Object
    && typeof candidate.outbox.enqueueOwnerNotification === 'function';
}

function parseInput(
  args: Record<string, unknown>,
): { sources: readonly SourceDefinition[]; dryRun?: boolean } | undefined {
  if (!Array.isArray(args.sources)
    || (args.dryRun !== undefined && typeof args.dryRun !== 'boolean')
    || !args.sources.every(isSourceDefinition)) {
    return undefined;
  }
  return {
    sources: args.sources,
    ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
  };
}

function isSourceDefinition(value: unknown): value is SourceDefinition {
  if (!(value instanceof Object)) return false;
  const source = value as Partial<SourceDefinition>;
  return typeof source.sourceId === 'string'
    && source.sourceId.length > 0
    && typeof source.url === 'string'
    && source.url.startsWith('https://')
    && [
      'official-repo',
      'official-release',
      'official-docs',
      'official-announcement',
      'benchmark',
    ].includes(source.kind ?? 'invalid')
    && ['github-release-json', 'json-feed', 'atom', 'html']
      .includes(source.format ?? 'invalid');
}

function sourceReceipt(result: SourceRetrievalResult): WatchSourceReceipt {
  return {
    sourceId: result.source.sourceId,
    outcome: result.status,
    byteCount: result.byteCount,
    framedOutputDigest: result.framedOutputDigest,
  };
}

function memoryWatchStore(store: MemoryStore): WatchHistoryStore {
  return {
    getEvent: (fingerprint) =>
      readMetadata<CompetitorEvent>(store.getById(eventId(fingerprint))),
    writeEvent: (event) => {
      store.upsert(memoryEntry(eventId(event.fingerprint), 'event', event), 'competitor-watch');
    },
    markReported: (fingerprint, reportedDate) => {
      const current = readMetadata<CompetitorEvent>(store.getById(eventId(fingerprint)));
      if (current === undefined) {
        throw new Error(`Watch event not found: ${fingerprint}`);
      }
      const event = { ...current, reportedDate };
      store.upsert(memoryEntry(eventId(fingerprint), 'event', event), 'competitor-watch');
    },
    getSourceCursor: (sourceId) =>
      readMetadata<ConditionalFetchState>(store.getById(cursorId(sourceId))),
    saveSourceCursor: (sourceId, cursor) => {
      store.upsert(memoryEntry(cursorId(sourceId), 'cursor', cursor), 'competitor-watch');
    },
  };
}

function memoryEntry(
  id: string,
  recordKind: 'event' | 'cursor',
  metadata: object,
) {
  return {
    id,
    type: 'custom',
    source: 'brain' as const,
    title: `Competitor watch ${recordKind}`,
    content: 'Structured competitor-watch state; see metadata.',
    tags: ['intelligence-watch', recordKind],
    metadata: { ...metadata } as Record<string, unknown>,
  };
}

function readMetadata<TValue>(entry: MemoryEntryV2 | null): TValue | undefined {
  if (entry === null) return undefined;
  try {
    const value: unknown = JSON.parse(entry.metadata);
    return value instanceof Object ? value as TValue : undefined;
  } catch (error: unknown) {
    return undefined;
  }
}

function eventId(fingerprint: string): string {
  return `${EVENT_PREFIX}${fingerprint.slice('sha256:'.length)}`;
}

function cursorId(sourceId: string): string {
  return `${CURSOR_PREFIX}${sourceId}`;
}
