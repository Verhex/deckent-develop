import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  deriveBaseline,
  type EvidenceFileReader,
} from '../../src/intelligence/baseline.js';
import type { CapabilityEntry } from '../../src/intelligence/types.js';

const CATALOG = [
  {
    capabilityId: 'proven-capability',
    domain: 'Proven capability',
    status: 'LIVE_PROVEN',
    evidenceRefs: ['evidence/one.txt', 'evidence/two.txt'],
    sourceDigest: digest('stale catalog value'),
    notes: 'Catalog classification.',
  },
] as const satisfies readonly CapabilityEntry[];

describe('baseline derivation', () => {
  it('derives entry and baseline digests from evidence contents deterministically', async () => {
    const files = new Map([
      ['evidence/one.txt', 'one'],
      ['evidence/two.txt', 'two'],
      ['unrelated.txt', 'first value'],
    ]);
    const readEvidence = mapReader(files);

    const first = await deriveBaseline(CATALOG, readEvidence);
    const repeated = await deriveBaseline(CATALOG, readEvidence);

    expect(repeated).toEqual(first);
    expect(first.entries[0]).toMatchObject({
      status: 'LIVE_PROVEN',
      evidenceComplete: true,
      holdReasons: [],
      sourceDigest: digest('onetwo'),
      evidenceDigests: [
        { evidenceRef: 'evidence/one.txt', digest: digest('one') },
        { evidenceRef: 'evidence/two.txt', digest: digest('two') },
      ],
    });

    files.set('unrelated.txt', 'changed but not referenced');
    expect(await deriveBaseline(CATALOG, readEvidence)).toEqual(first);
  });

  it('invalidates both digests when referenced evidence changes', async () => {
    const files = new Map([
      ['evidence/one.txt', 'one'],
      ['evidence/two.txt', 'two'],
    ]);
    const readEvidence = mapReader(files);
    const before = await deriveBaseline(CATALOG, readEvidence);

    files.set('evidence/two.txt', 'changed');
    const after = await deriveBaseline(CATALOG, readEvidence);

    expect(after.entries[0]?.sourceDigest).not.toBe(
      before.entries[0]?.sourceDigest,
    );
    expect(after.digest).not.toBe(before.digest);
  });

  // The other half of the contract: HEAD alone is not the trigger. A file the
  // catalog does not reference must leave every digest untouched, otherwise the
  // baseline would churn on unrelated commits and its invalidation signal would
  // carry no information.
  it('leaves both digests untouched when unreferenced content changes', async () => {
    const files = new Map([
      ['evidence/one.txt', 'one'],
      ['evidence/two.txt', 'two'],
      ['evidence/unreferenced.txt', 'irrelevant'],
    ]);
    const readEvidence = mapReader(files);
    const before = await deriveBaseline(CATALOG, readEvidence);

    files.set('evidence/unreferenced.txt', 'still irrelevant, but different');
    const after = await deriveBaseline(CATALOG, readEvidence);

    expect(after.entries[0]?.sourceDigest).toBe(before.entries[0]?.sourceDigest);
    expect(after.digest).toBe(before.digest);
  });

  it('turns an entry into a typed HOLD and records unreadable evidence', async () => {
    const readEvidence: EvidenceFileReader = async (evidenceRef) => {
      if (evidenceRef === 'evidence/two.txt') {
        throw new Error('ENOENT');
      }
      return 'one';
    };

    const baseline = await deriveBaseline(CATALOG, readEvidence);
    const entry = baseline.entries[0];

    expect(entry).toMatchObject({
      status: 'HOLD',
      evidenceComplete: false,
      evidenceDigests: [
        { evidenceRef: 'evidence/one.txt', digest: digest('one') },
      ],
      holdReasons: ['Evidence "evidence/two.txt" unreadable: ENOENT'],
    });
    expect(entry?.notes).toContain(
      'Evidence "evidence/two.txt" unreadable: ENOENT',
    );
    expect(baseline.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

function mapReader(files: Map<string, string>): EvidenceFileReader {
  return async (evidenceRef) => {
    const contents = files.get(evidenceRef);
    if (contents === undefined) {
      throw new Error('ENOENT');
    }
    return contents;
  };
}

function digest(contents: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}
