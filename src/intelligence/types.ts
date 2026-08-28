export const CAPABILITY_STATUSES = [
  'LIVE_PROVEN',
  'LIVE_PARTIAL',
  'WIRED_UNPROVEN',
  'DORMANT_DEFAULT_OFF',
  'ROADMAP',
  'HOLD',
  'DEAD_LEGACY',
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

/** A tuple guarantees that an entry cannot be authored without evidence. */
export type EvidenceRefs = readonly [string, ...string[]];

export interface CapabilityEntry {
  capabilityId: string;
  domain: string;
  status: CapabilityStatus;
  evidenceRefs: EvidenceRefs;
  /** SHA-256 of the evidence contents, prefixed with `sha256:`. */
  sourceDigest: `sha256:${string}`;
  notes: string;
}
