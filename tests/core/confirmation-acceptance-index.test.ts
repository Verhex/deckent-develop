import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import {
  confirmationContentDigest,
  createAcceptanceConfirmationRequest,
  listAcceptanceConfirmationCandidatesReadOnly,
  migrateAcceptanceConfirmationIndex,
  settleConfirmation,
  type ConfirmationAcceptanceLineage,
  type ConfirmationIdentity,
} from '../../src/core/confirmation-store.js';

const at = '2026-08-21T08:00:00.000Z';
const digest = (value: string) => confirmationContentDigest(value);

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'confirmation-index-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function authority(tenantId: string, projectId: string, attemptId: string) {
  const identity: ConfirmationIdentity = {
    attemptId, generation: 1, sourceDigest: digest(`source:${attemptId}`),
    evidenceDigest: digest('evidence'), revisionDigest: digest('revision'),
  };
  const acceptanceLineage: ConfirmationAcceptanceLineage = {
    tenantId, projectId, sprintId: 'sprint-616', taskId: `task-${attemptId}`,
    attemptId, generation: 1, evaluationDigest: digest('evaluation'), resultDigest: digest('result'),
    policyDigest: digest('policy'), sourceDigest: identity.sourceDigest,
  };
  return { identity, acceptanceLineage };
}

function create(root: string, tenantId: string, projectId: string, attemptId: string) {
  const authorityValue = authority(tenantId, projectId, attemptId);
  const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
  const result = createAcceptanceConfirmationRequest(root, {
    sprintId: 'sprint-616', taskId: `task-${attemptId}`, itemIds: ['owner'], kind: 'audit',
    verdict: 'UNDECIDABLE', adapter: 'human', statements: ['Owner confirms'],
    evidenceRequirements: ['result.json'], requestedAt: at, source: 'acceptance-matrix',
    ...authorityValue,
  }, { lifecycle, tenantId, projectId, clock: () => new Date(at) });
  return { ...result, ...authorityValue, lifecycle };
}

describe('indexed confirmation acceptance candidates', () => {
  it('uses a durable tenant/project/status shard and fresh-reads exact lineage', () => {
    const root = sandbox();
    const own = create(root, 'tenant-a', 'project-a', 'attempt-a');
    create(root, 'tenant-b', 'project-a', 'attempt-b');
    const pendingPath = join(root, '.deckent', 'runtime', 'confirmations', 'pending', `${own.id}.json`);
    const before = readFileSync(pendingPath, 'utf8');

    const page = listAcceptanceConfirmationCandidatesReadOnly(root, {
      tenantId: 'tenant-a', projectId: 'project-a', status: 'pending', limit: 10,
    }, { lifecycle: own.lifecycle, clock: () => new Date(at) });
    expect(page.candidates.map(candidate => candidate.request.id)).toEqual([own.id]);
    expect(page.candidates[0]?.request.acceptanceLineage).toEqual(own.acceptanceLineage);
    expect(page.quarantine).toEqual([]);
    expect(readFileSync(pendingPath, 'utf8')).toBe(before);

    settleConfirmation(root, own.id, {
      verdict: 'CONFIRMED', decidedBy: 'human', reason: 'approved', decidedAt: at,
    }, { lifecycle: own.lifecycle, clock: () => new Date('2026-08-21T08:01:00.000Z') });
    expect(listAcceptanceConfirmationCandidatesReadOnly(root, {
      tenantId: 'tenant-a', projectId: 'project-a', status: 'pending', limit: 10,
    }).candidates).toEqual([]);
    expect(listAcceptanceConfirmationCandidatesReadOnly(root, {
      tenantId: 'tenant-a', projectId: 'project-a', status: 'settled', limit: 10,
    }).candidates[0]).toMatchObject({ state: 'settled', request: { id: own.id } });
  });

  it('backfills losslessly and idempotently without making reads migrate or scan canonical directories', () => {
    const root = sandbox();
    const own = create(root, 'tenant-a', 'project-a', 'attempt-a');
    const runtime = join(root, '.deckent', 'runtime', 'confirmations');
    const index = join(runtime, 'acceptance-index-v1');
    rmSync(index, { recursive: true, force: true });
    const canonicalPath = join(runtime, 'pending', `${own.id}.json`);
    const before = readFileSync(canonicalPath, 'utf8');
    expect(listAcceptanceConfirmationCandidatesReadOnly(root, {
      tenantId: 'tenant-a', projectId: 'project-a', status: 'pending', limit: 1,
    }).candidates).toEqual([]);
    expect(existsSync(index)).toBe(false);

    expect(migrateAcceptanceConfirmationIndex(root, { lifecycle: own.lifecycle })).toEqual({ indexed: 1, quarantined: 0 });
    const indexBytes = readdirSync(index, { recursive: true }).map(String).sort();
    expect(migrateAcceptanceConfirmationIndex(root, { lifecycle: own.lifecycle })).toEqual({ indexed: 1, quarantined: 0 });
    expect(readdirSync(index, { recursive: true }).map(String).sort()).toEqual(indexBytes);
    expect(readFileSync(canonicalPath, 'utf8')).toBe(before);
  });

  it('bounds reads and projects corrupt or foreign pointers without writes or tenant leakage', () => {
    const root = sandbox();
    const own = create(root, 'tenant-a', 'project-a', 'attempt-a');
    const indexRoot = join(root, '.deckent', 'runtime', 'confirmations', 'acceptance-index-v1',
      digest('tenant-a'), digest('project-a'), 'pending');
    const existing = readdirSync(indexRoot)[0];
    if (!existing) throw new Error('expected index entry');
    const foreign = JSON.parse(readFileSync(join(indexRoot, existing), 'utf8')) as Record<string, unknown>;
    foreign.lineage = { ...own.acceptanceLineage, tenantId: 'tenant-b' };
    foreign.requestedAt = '1970-01-01T00:00:00.001Z';
    writeFileSync(join(indexRoot, `0000000000000001-${own.id}.json`), JSON.stringify(foreign), 'utf8');
    writeFileSync(join(indexRoot, `0000000000000002-${own.id}.json`), '{bad', 'utf8');
    const before = readdirSync(indexRoot).map(name => [name, readFileSync(join(indexRoot, name), 'utf8')]);

    const page = listAcceptanceConfirmationCandidatesReadOnly(root, {
      tenantId: 'tenant-a', projectId: 'project-a', status: 'pending', limit: 1,
    }, { lifecycle: own.lifecycle, clock: () => new Date(at) });
    expect(page.candidates.map(candidate => candidate.request.id)).toEqual([own.id]);
    expect(page.quarantine.map(row => row.reasonCode)).toEqual(['foreign-index-row', 'invalid-index-row']);
    expect(readdirSync(indexRoot).map(name => [name, readFileSync(join(indexRoot, name), 'utf8')])).toEqual(before);
    expect(() => listAcceptanceConfirmationCandidatesReadOnly(root, {
      tenantId: 'tenant-a', projectId: 'project-a', status: 'pending', limit: 101,
    })).toThrow(/limit/u);
    vi.restoreAllMocks();
  });
});
