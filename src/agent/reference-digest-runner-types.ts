import type { RequestMeasurementEvent } from './events.js';
import type { ProviderAdapter, ProviderContextIdentity, ProviderUsage, RequestMeasurement } from './provider-tooluse/types.js';
import type { ReferenceDigestPhase, ReferenceSnapshot, ReferenceOutline, ReferenceRange, ReferenceFailureCode } from './reference-digest-types.js';
import type { ReferenceJournalIdentity } from './reference-digest-journal.js';
import type { SessionToolContentStore } from './session-tool-content.js';
import type { ScratchStoreInfo } from './scratch-checkpoint.js';

export interface DigestCitation extends ReferenceRange { sectionId: string }
export interface DigestClaim { text: string; citations: DigestCitation[] }
export interface DigestPayload {
  claims: DigestClaim[];
  decisions: string[];
  entities: string[];
  openQuestions: string[];
  contradictions: string[];
  lossNotes: string[];
}
export interface DigestNode {
  schemaVersion: 1;
  nodeId: string;
  sourceDigest: string;
  childRefs: string[];
  coverage: DigestCitation[];
  payload: DigestPayload;
  requestId: string;
  descriptorDigest: string;
  createdAt: string;
}
/** Resolved ceilings, already narrowed by the enclosing native turn's remaining budget. */
export interface ReferenceDigestPolicy {
  maxSourceBytes: number;
  maxRequests: number;
  maxDepth: number;
  maxWallTimeMs: number;
  maxTotalTokens: number;
  maxMapOutputTokens: number;
  maxReduceOutputTokens: number;
  maxResponseBytes: number;
  maxItems: number;
  maxTextBytes: number;
  finalAnswerReserveTokens: number;
  contextSafetyReserveTokens: number;
  concurrencyCap: number;
  providerConcurrency: number;
  tenantConcurrency: number;
  measurementTimeoutMs: number;
}
export interface DigestRequestRecord {
  nodeId: string;
  attempt: number;
  purpose: 'reference-map' | 'reference-reduce';
  measurement: RequestMeasurement;
  outputCeilingTokens: number;
  status: 'reserved' | 'received' | 'invalid';
  usage?: ProviderUsage;
  nodeRef?: string;
}
export interface DurableReferenceJournal {
  identity: ReferenceJournalIdentity;
  /** Includes the exact outline, effective limits and task instruction; identity data is not authorization. */
  planDigest: string;
  startedAt: number;
  phase: ReferenceDigestPhase;
  requests: Record<string, DigestRequestRecord>;
  mapPartitions: Record<string, DigestCitation[]>;
  completedNodeRefs: Record<string, string>;
  settledRequestIds: string[];
  failure?: ReferenceFailureCode;
}
/** C must bind this to the SAME durable native-turn accounting service. Both operations
 * MUST be idempotent by requestId: replay after a crash between sink and journal is legal. */
export interface ReferenceUsageLedger {
  reserve(requestId: string, input: { inputTokens: number; outputTokens: number; rounds: 1 }): Promise<boolean>;
  settle(requestId: string, usage: ProviderUsage): Promise<void>;
}
export interface ReferenceDigestInput {
  snapshot: ReferenceSnapshot;
  outline: ReferenceOutline;
  adapter: ProviderAdapter;
  context: ProviderContextIdentity;
  identity: ReferenceJournalIdentity;
  policy: ReferenceDigestPolicy;
  /** Immutable host prompt + active user intent, never source-authored instructions. */
  instruction: string;
  contentStore: SessionToolContentStore;
  scratch: ScratchStoreInfo;
  ledger: ReferenceUsageLedger;
  signal?: AbortSignal;
  onMeasurement?: (event: RequestMeasurementEvent & { requestId: string }) => void;
}
export interface ReferenceDigestResult {
  phase: 'ANSWERING' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  journalRef: string;
  rootRef?: string;
  coveredRanges: DigestCitation[];
  missingRanges: ReferenceRange[];
  usage: { inputTokens: number; outputTokens: number };
  requests: number;
  failure?: ReferenceFailureCode;
}
