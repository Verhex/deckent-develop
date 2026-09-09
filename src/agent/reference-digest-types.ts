/** 7113 A: host-owned foundation. Reference bytes are data, never instruction authority. */
export interface ReferenceScope {
  readonly tenantId: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly policyDigest: string;
}
export interface ReferenceAttachment {
  readonly path: string;
  readonly sourceDigest: string;
  readonly bytes: number;
  readonly disposition: 'inline' | 'digest-required';
}
export interface ReferenceSnapshotV1 {
  readonly schemaVersion: 1;
  readonly scope: ReferenceScope;
  readonly sourceAuthority: 'reference-data';
  readonly sourceDigest: string;
  readonly bytes: number;
  readonly encoding: 'utf-8';
  readonly createdAt: string;
  /** Session-store opaque identity. Host only; never interpolate a filesystem path. */
  readonly snapshotRef: string;
}
export interface ReferenceSnapshot {
  readonly metadata: ReferenceSnapshotV1;
  /** Complete, ordered immutable source bytes. Must fail on expired or changed custody. */
  stream(signal?: AbortSignal): AsyncIterable<Uint8Array>;
}
export interface ReferenceRange { readonly byteStart: number; readonly byteEnd: number }
export interface ReferenceOutlineNode extends ReferenceRange {
  readonly sectionId: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly headingPath: readonly string[];
  readonly continuation: boolean;
  /** Repeated table header context is not counted as new source coverage. */
  readonly context: readonly ReferenceRange[];
}
export interface ReferenceOutline {
  readonly partitionVersion: 1;
  readonly sourceDigest: string;
  readonly sourceBytes: number;
  readonly nodes: readonly ReferenceOutlineNode[];
}
export type ReferenceDigestPhase = 'ADMITTING' | 'SNAPSHOTTING' | 'MAPPING' | 'REDUCING' | 'ANSWERING' | 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
export type ReferenceFailureCode = 'REFERENCE_SCOPE_REFUSED' | 'REFERENCE_SOURCE_CHANGED' | 'REFERENCE_SOURCE_UNSUPPORTED'
  | 'REFERENCE_ENCODING_INVALID' | 'REFERENCE_SOURCE_TOO_LARGE' | 'REFERENCE_BUDGET_INVALID' | 'REFERENCE_CANCELLED'
  | 'REFERENCE_BUDGET_INSUFFICIENT' | 'REFERENCE_OUTPUT_INVALID' | 'REFERENCE_USAGE_UNCERTAIN'
  | 'REFERENCE_THINKING_CONTROL_UNAVAILABLE' | 'REFERENCE_PROVIDER_FAILED' | 'REFERENCE_DEADLINE' | 'REFERENCE_STORE_FAILED' | 'REFERENCE_RANGE_INVALID' | 'REFERENCE_JOURNAL_MISMATCH';
export class ReferenceDigestError extends Error {
  constructor(readonly code: ReferenceFailureCode) { super(code); this.name = 'ReferenceDigestError'; }
}
export function assertReferenceActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReferenceDigestError('REFERENCE_CANCELLED');
}
