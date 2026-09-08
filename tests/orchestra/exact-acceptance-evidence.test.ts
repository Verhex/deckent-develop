import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createExactAcceptanceAdjudicationContractV2, createExactAcceptanceSemanticClaimV2,
  createExactAcceptanceVerificationSourceV2, digestExactAcceptanceEvidenceV2,
  EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH, EXACT_ACCEPTANCE_CLAIM_RELATIVE_PATH,
  EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH, parseExactAcceptanceVerificationBindingV2,
  readExactAcceptanceVerificationSourceV2, reconstructExactAcceptanceStagedBytesV2,
  type ExactAcceptanceVerificationBindingV2,
} from '../../src/orchestra/exact-acceptance-evidence.js';
import { acceptanceConfirmationDigest, deriveAcceptanceConfirmationId } from '../../src/core/acceptance-confirmation-contract.js';
import { createExecutionEffectStagedSourceSealV1 } from '../../src/core/execution-effect-persistence-contract.js';
import { createGoNoGoCriterionItem, type Task } from '../../src/core/task-types.js';
import { taskResultV2Digest } from '../../src/core/task-result-schema.js';
import { createExactAcceptedTaskResultRefV2 } from '../../src/core/task-settlement-authority.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';
import type { AcceptanceRouteClaim } from '../../src/orchestra/acceptance-enforcement.js';

const hash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const digest = (bytes: string | Uint8Array): `sha256:${string}` => `sha256:${hash(bytes)}`;
const evidenceId = (path: string): string => `E-${hash(path).slice(0, 48)}`;

function fixture() {
  const stored = createTaskResultSettlementV2Fixture({ terminal: 'accepted-only', tailArtifactKey: 'exact-evidence-boundaries' });
  const acceptedAuthority = { executionMode: 'normal-docker' as const, identity: stored.identity,
    admissionReceiptDigest: stored.admission.receiptDigest,
    acceptedResultRef: createExactAcceptedTaskResultRefV2(stored.acceptedResultArtifact),
    acceptedResultChainDigest: stored.acceptedResultChain.receiptDigest,
    resultDigest: taskResultV2Digest(stored.result, stored.policy.jsonBounds) };
  const lineage = { tenantId: 'local', projectId: stored.identity.projectId, sprintId: 'fixture-sprint',
    taskId: stored.identity.taskId, attemptId: stored.identity.attemptId, generation: stored.identity.generation,
    evaluationDigest: hash('evaluation'), resultDigest: acceptanceConfirmationDigest(stored.result),
    policyDigest: hash('policy'), sourceDigest: hash('source') };
  const unsigned = { schemaVersion: 2 as const, confirmationId: deriveAcceptanceConfirmationId(lineage), lineage,
    evaluationDigest: lineage.evaluationDigest, sourceVerdict: 'UNDECIDABLE' as const, adapter: 'llm' as const };
  const routeClaim: AcceptanceRouteClaim = { ...unsigned, claimDigest: acceptanceConfirmationDigest(unsigned) };
  return { stored, acceptedAuthority, routeClaim };
}

function binding(): ExactAcceptanceVerificationBindingV2 {
  const { acceptedAuthority, routeClaim } = fixture();
  const unsigned = { schemaVersion: 2 as const, kind: 'exact-acceptance-verification-binding-v2' as const,
    confirmationId: routeClaim.confirmationId, lineage: routeClaim.lineage, routeClaimDigest: routeClaim.claimDigest,
    acceptedAuthority, effectLandingReceiptDigest: digest('landing'), baselineManifestDigest: digest('baseline'),
    finalManifestDigest: digest('final'), producerProvider: 'fixture-provider', semanticClaimDigest: digest('claim'),
    evidenceDigest: hash('evidence') };
  return { ...unsigned, bindingDigest: acceptanceConfirmationDigest(unsigned) };
}

describe('exact accepted immutable evidence contracts', () => {
  it('validates the canonical accepted-V2 reference and complete lineage without declaring authority', () => {
    const value = binding();
    expect(parseExactAcceptanceVerificationBindingV2(value)).toEqual(value);
  });

  it.each(['confirmationId', 'routeClaimDigest', 'bindingDigest', 'evidenceDigest'] as const)(
    'rejects tampered %s', key => {
      expect(parseExactAcceptanceVerificationBindingV2({ ...binding(), [key]: hash('tampered') })).toBeNull();
    },
  );

  it('rejects sibling lineage even when the attacker recomputes the envelope digest', () => {
    const current = binding();
    const { bindingDigest: _digest, ...unsigned } = { ...current,
      lineage: { ...current.lineage, generation: current.lineage.generation + 1 } };
    expect(parseExactAcceptanceVerificationBindingV2({ ...unsigned,
      confirmationId: deriveAcceptanceConfirmationId(unsigned.lineage),
      bindingDigest: acceptanceConfirmationDigest({ ...unsigned, confirmationId: deriveAcceptanceConfirmationId(unsigned.lineage) }) })).toBeNull();
  });

  it('rejects extra fields and caller hooks without executing them', () => {
    const getter = vi.fn(() => binding());
    expect(parseExactAcceptanceVerificationBindingV2(Object.defineProperty({}, 'lineage', { enumerable: true, get: getter }))).toBeNull();
    expect(parseExactAcceptanceVerificationBindingV2(new Proxy({}, { ownKeys: getter }))).toBeNull();
    expect(parseExactAcceptanceVerificationBindingV2({ ...binding(), extra: true })).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it('never issues source authority from caller getter or proxy input', () => {
    const getter = vi.fn(() => fixture().stored.store);
    const forged = Object.defineProperty({}, 'custodyStore', { enumerable: true, get: getter });
    expect(readExactAcceptanceVerificationSourceV2(createExactAcceptanceVerificationSourceV2(forged as never)))
      .toEqual({ state: 'hold', reasonCode: 'exact-source-unrecognized' });
    expect(readExactAcceptanceVerificationSourceV2(createExactAcceptanceVerificationSourceV2(new Proxy({}, { ownKeys: getter }) as never)))
      .toEqual({ state: 'hold', reasonCode: 'exact-source-unrecognized' });
    expect(getter).not.toHaveBeenCalled();
  });

  it('does not upgrade a genuine accepted Store fixture with missing lifecycle proof to ready', () => {
    const { stored, acceptedAuthority, routeClaim } = fixture();
    const source = createExactAcceptanceVerificationSourceV2({ projectRoot: '/fixture/project', custodyStore: stored.store,
      policy: stored.policy, acceptedAuthority, routeClaim, relativePaths: ['tests/helpers/output.ts'] });
    const result = readExactAcceptanceVerificationSourceV2(source);
    expect(result.state).toBe('hold');
    expect(readExactAcceptanceVerificationSourceV2(source)).toEqual(result);
    expect(readExactAcceptanceVerificationSourceV2({} as never))
      .toEqual({ state: 'hold', reasonCode: 'exact-source-unrecognized' });
  });

  it('hashes exact descriptors independently of ordering, excluding only the binding envelope', () => {
    const descriptors = [EXACT_ACCEPTANCE_CLAIM_RELATIVE_PATH, EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH, 'docs/note.md']
      .map(relativePath => ({ relativePath, contentSha256: hash(relativePath), byteLength: 12 }));
    const expected = digestExactAcceptanceEvidenceV2(descriptors);
    expect(digestExactAcceptanceEvidenceV2([...descriptors].reverse())).toBe(expected);
    expect(digestExactAcceptanceEvidenceV2([...descriptors,
      { relativePath: EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH, contentSha256: hash('binding'), byteLength: 500 }])).toBe(expected);
    expect(digestExactAcceptanceEvidenceV2(descriptors.slice(1))).not.toBe(expected);
    expect(() => digestExactAcceptanceEvidenceV2([...descriptors, descriptors[0]!])).toThrow();
    expect(() => digestExactAcceptanceEvidenceV2([{ ...descriptors[0]!, byteLength: -1 }])).toThrow();
  });

  it('requires distinct binding, manifest and final byte citations with authored GO/NO-GO polarity', () => {
    const { routeClaim } = fixture();
    const path = 'docs/note.md';
    const task = { id: 'fixture-001', scope: { filesRead: [], filesWrite: [path], directories: ['docs'] },
      goNogo: { items: [
        createGoNoGoCriterionItem({ polarity: 'go', statement: 'Preserve original bytes and append the requested sentence.', evidenceRequirements: [{ kind: 'assertion', value: 'The prefix is unchanged.' }] }),
        createGoNoGoCriterionItem({ polarity: 'no-go', statement: 'Any unrelated change is present.' }),
      ] } } as Task;
    const claim = createExactAcceptanceSemanticClaimV2(task, routeClaim);
    expect(claim.assertions.map(item => item.polarity)).toEqual(['go', 'no-go']);
    for (const assertion of claim.assertions) {
      for (const required of [EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH, EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH, path]) {
        expect(assertion.evidenceRequirements.some(item => item.anyOfEvidenceIds.length === 1
          && item.anyOfEvidenceIds[0] === evidenceId(required))).toBe(true);
      }
    }
    const entries = [EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH, EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH,
      EXACT_ACCEPTANCE_CLAIM_RELATIVE_PATH, path].map(relativePath => ({ relativePath, contentSha256: hash(relativePath) }));
    const contract = createExactAcceptanceAdjudicationContractV2(claim, entries);
    expect(contract.claim).toEqual(claim);
    expect(() => createExactAcceptanceAdjudicationContractV2(claim, entries.filter(entry => entry.relativePath !== path))).toThrow();
  });
});

function stagedFixture(parts = ['old\n', 'new\n']) {
  const bytes = parts.map(part => Buffer.from(part));
  const staged = createExecutionEffectStagedSourceSealV1({ path: 'docs/note.md', byteLength: bytes.reduce((size, part) => size + part.length, 0),
    contentDigest: digest(Buffer.concat(bytes)), workspaceIdentityDigest: digest('workspace'), attemptDigest: digest('attempt'),
    admissionReceiptDigest: digest('admission'), custodyPolicyDigest: digest('policy'), landingIntentDigest: digest('intent'),
    chunks: bytes.map((part, index) => ({ byteLength: part.length, artifactKey: `chunk-${index}`,
      artifactReceiptDigest: digest(`receipt-${index}`), contentDigest: digest(part) })) });
  const readChunk = vi.fn((chunk: { index: number }) => Uint8Array.from(bytes[chunk.index]!));
  return { staged, readChunk };
}

describe('production staged byte reconstruction (not settlement authority)', () => {
  it('reconstructs ordered chunks and verifies aggregate digest, with detached output bytes', () => {
    const { staged, readChunk } = stagedFixture();
    const result = reconstructExactAcceptanceStagedBytesV2({ staged, readChunk, maxBytes: 1024 });
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('expected verified bytes');
    expect(Buffer.from(result.bytes).toString()).toBe('old\nnew\n');
    result.bytes[0] = 0;
    const reread = reconstructExactAcceptanceStagedBytesV2({ staged, readChunk, maxBytes: 1024 });
    expect(reread.state === 'ready' && Buffer.from(reread.bytes).toString()).toBe('old\nnew\n');
  });

  it('permits a single canonical empty chunk', () => {
    const { staged, readChunk } = stagedFixture(['']);
    expect(reconstructExactAcceptanceStagedBytesV2({ staged, readChunk, maxBytes: 0 }))
      .toEqual({ state: 'ready', bytes: new Uint8Array() });
  });

  it.each(['offset', 'index', 'duplicate', 'length', 'chunkDigest', 'aggregate', 'limit'])(
    'rejects %s mismatch before handing out any bytes', kind => {
      const fixture = stagedFixture();
      const staged = structuredClone(fixture.staged);
      if (kind === 'offset') Object.assign(staged.chunks[1]!, { byteOffset: 0 });
      if (kind === 'index') Object.assign(staged.chunks[1]!, { index: 0 });
      if (kind === 'duplicate') Object.assign(staged.chunks[1]!, { artifactKey: staged.chunks[0]!.artifactKey });
      if (kind === 'length') Object.assign(staged, { byteLength: 9000 });
      if (kind === 'chunkDigest') Object.assign(staged.chunks[0]!, { chunkDigest: digest('tampered') });
      if (kind === 'aggregate') Object.assign(staged, { contentDigest: digest('tampered') });
      const result = reconstructExactAcceptanceStagedBytesV2({ staged, readChunk: fixture.readChunk, maxBytes: kind === 'limit' ? 1 : 1024 });
      expect(result.state).toBe('hold');
      if (kind !== 'aggregate') expect(fixture.readChunk).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'wrong-content', 'wrong-length'])( 'rejects %s immutable chunk content', kind => {
    const { staged } = stagedFixture();
    const readChunk = vi.fn(() => kind === 'missing' ? null : Buffer.from(kind === 'wrong-length' ? 'x' : 'bad\n'));
    expect(reconstructExactAcceptanceStagedBytesV2({ staged, readChunk, maxBytes: 1024 }).state).toBe('hold');
  });
});
