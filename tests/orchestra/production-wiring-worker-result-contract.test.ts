// The worker half of the production-wiring result contract.
//
// `settleProductionWiringResultEvidence` holds with `missing-worker-evidence`
// when a result carries no `productionWiringEvidence`. The worker was never
// asked for it: the wiring block rendered the chain and the `UNWIRED:` reporting
// path, and the result-contract line enumerated every other field. So a
// production-mutation task could not settle however well the worker performed.
//
// Observed live (2026-09-12, run 838e9216 / task 747-001): the worker landed a
// correct effect — a 345-line hermetic tenant-retention test against the
// canonical module — and the run still ended
// `RUN_FAILED … hold:production-wiring-missing-worker-evidence`.
//
// These tests pin the directive onto every branch that renders the chain, pin
// the digest form settlement actually validates, and pin the trust boundary that
// forbids a worker from declaring the chain complete.

import { describe, it, expect } from 'vitest';
import {
  buildProductionWiringAuthorityBlock,
  PRODUCTION_WIRING_BLOCK_HEADING,
  PRODUCTION_WIRING_UNWIRED_HEADING,
} from '../../src/orchestra/prompt-god-template.js';
import { createProductionWiringPlanEvidence } from '../../src/core/task-types.js';
import type { ProductionWiringContract } from '../../src/core/production-wiring-contract.js';

const complete = (ref: string) => ({
  state: 'complete' as const,
  basis: 'authority-record' as const,
  evidenceRefs: [ref],
});

/** A proof target closes only on an executed production path, not a record. */
const executed = (ref: string) => ({
  state: 'complete' as const,
  basis: 'executed-production-path' as const,
  evidenceRefs: [ref],
});

const REF = 'tests/orchestra/production-wiring-worker-result-contract.test.ts';

function contract(overrides: Partial<ProductionWiringContract> = {}): ProductionWiringContract {
  return {
    version: 1,
    changeKind: 'runtime-addition',
    producer: { producerId: 'p', evidence: complete(REF) },
    canonicalConsumer: { consumerId: 'c', relationship: 'invokes-producer', evidence: complete(REF) },
    affectedIngresses: [{ ingressId: 'initial', kind: 'ingress', evidence: complete(REF) }],
    enablementAuthority: {
      authorityId: 'a', mechanism: 'unconditional', evidence: complete(REF),
    },
    proofTargets: [{
      proofTargetId: 'proof', kind: 'consumer-execution', evidence: executed(REF),
    }],
    disposition: { kind: 'production-wiring' },
    ...overrides,
  } as ProductionWiringContract;
}

describe('worker result contract — present on a closed chain', () => {
  const evidence = createProductionWiringPlanEvidence(contract());
  const block = buildProductionWiringAuthorityBlock(evidence);

  it('renders the closed-chain block', () => {
    expect(block.startsWith(PRODUCTION_WIRING_BLOCK_HEADING)).toBe(true);
  });

  it('names the field settlement actually reads', () => {
    expect(block).toContain('"productionWiringEvidence"');
  });

  it('binds version 1 and the worker observer role', () => {
    expect(block).toContain('"version": 1');
    expect(block).toContain('"observedBy": "worker"');
  });

  it('carries the bare-hex digest settlement validates, not the display form', () => {
    // Settlement matches /^[a-f0-9]{64}$/ against `contractDigest`; the block's
    // own header renders `sha256:<digest>`, so the directive must spell out the
    // unprefixed value or the worker copies the wrong one.
    expect(block).toContain(`"contractDigest": "${evidence.contractDigest}"`);
    expect(block).not.toContain(`"contractDigest": "sha256:${evidence.contractDigest}"`);
    expect(block).toContain('no sha256: prefix');
  });

  it('offers exactly the observation states settlement admits', () => {
    for (const state of ['presence-only', 'incomplete', 'unsupported', 'contradictory']) {
      expect(block).toContain(`"${state}"`);
    }
  });

  it('never offers "complete" as a worker-declarable state', () => {
    // Only the host's independent consumer-execution observation may conclude
    // the chain is wired; a worker claiming completeness would turn a
    // self-report into a production-wired verdict.
    expect(block).not.toContain('"state": "complete"');
    expect(block).toContain('only the host');
  });

  it('requires non-blank evidence refs', () => {
    expect(block).toContain('evidenceRefs');
    expect(block).toContain('non-blank');
  });

  it('demands the object even on NO_GO — the hold does not care why', () => {
    expect(block).toContain('NO_GO');
  });
});

describe('worker result contract — present on an unresolved chain', () => {
  it('is rendered on the incomplete branch too', () => {
    // A task that cannot close its chain still settles, and still holds without
    // the evidence object — so the directive must reach this branch as well.
    const open = contract({
      canonicalConsumer: {
        consumerId: '', relationship: 'invokes-producer', evidence: complete(REF),
      },
    } as Partial<ProductionWiringContract>);
    const block = buildProductionWiringAuthorityBlock(createProductionWiringPlanEvidence(open));

    expect(block.startsWith(PRODUCTION_WIRING_UNWIRED_HEADING)).toBe(true);
    expect(block).toContain('"productionWiringEvidence"');
    expect(block).toContain('"observedBy": "worker"');
  });

  it('is absent when the task carries no wiring authority at all', () => {
    expect(buildProductionWiringAuthorityBlock(undefined)).toBe('');
  });
});
