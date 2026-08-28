import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { BASELINE_CATALOG } from './baseline-catalog.js';
import type { CapabilityEntry } from './types.js';

type Sha256Digest = `sha256:${string}`;

export type EvidenceFileReader = (
  evidenceRef: string,
) => Promise<string | Uint8Array>;

export interface EvidenceDigest {
  evidenceRef: string;
  digest: Sha256Digest;
}

export interface BaselineEntry extends CapabilityEntry {
  evidenceComplete: boolean;
  evidenceDigests: readonly EvidenceDigest[];
  holdReasons: readonly string[];
}

export interface Baseline {
  entries: readonly BaselineEntry[];
  digest: Sha256Digest;
}

/**
 * Derive a content-addressed snapshot of the capability catalog.
 *
 * The default reader is the real filesystem reader used in production. Tests
 * can inject an in-memory reader without changing the derivation semantics.
 */
export async function deriveBaseline(
  catalog: readonly CapabilityEntry[] = BASELINE_CATALOG,
  readEvidence: EvidenceFileReader = readFile,
): Promise<Baseline> {
  const entries = await Promise.all(
    catalog.map((entry) => deriveEntry(entry, readEvidence)),
  );

  return {
    entries,
    digest: sha256(stableJson(entries)),
  };
}

async function deriveEntry(
  entry: CapabilityEntry,
  readEvidence: EvidenceFileReader,
): Promise<BaselineEntry> {
  const evidenceDigests: EvidenceDigest[] = [];
  const holdReasons: string[] = [];
  const sourceHash = createHash('sha256');

  for (const evidenceRef of entry.evidenceRefs) {
    try {
      const contents = await readEvidence(evidenceRef);
      sourceHash.update(contents);
      evidenceDigests.push({ evidenceRef, digest: sha256(contents) });
    } catch (error: unknown) {
      const reason = readFailureReason(error);
      holdReasons.push(`Evidence ${JSON.stringify(evidenceRef)} unreadable: ${reason}`);
      sourceHash.update(
        stableJson({ evidenceRef, unreadable: true, reason }),
      );
    }
  }

  const evidenceComplete = holdReasons.length === 0;
  return {
    ...entry,
    status: evidenceComplete ? entry.status : 'HOLD',
    sourceDigest: `sha256:${sourceHash.digest('hex')}`,
    notes: evidenceComplete
      ? entry.notes
      : `${entry.notes} ${holdReasons.join(' ')}`,
    evidenceComplete,
    evidenceDigests,
    holdReasons,
  };
}

function readFailureReason(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

function sha256(value: string | Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
