import { describe, it, expect } from 'vitest';
import {
  buildProductionWiringAuthorityBlock,
  buildTaskPrompt,
  buildTaskPromptSegmented,
  PRODUCTION_WIRING_BLOCK_HEADING,
  PRODUCTION_WIRING_UNWIRED_HEADING,
  type SprintContext,
} from '../../src/orchestra/prompt-god-template.js';
import type { ProductionWiringPlanEvidence, Task } from '../../src/core/task-types.js';
import { TaskStatus, createProductionWiringPlanEvidence } from '../../src/core/task-types.js';
import type {
  ProductionWiringContract,
  ProductionWiringEvidence,
} from '../../src/core/production-wiring-contract.js';

// ─── Fixtures ──────────────────────────────────────────────────────────

const complete = (ref: string): ProductionWiringEvidence => ({
  state: 'complete',
  basis: 'authority-record',
  evidenceRefs: [ref],
});

const executed = (ref: string): ProductionWiringEvidence => ({
  state: 'complete',
  basis: 'executed-production-path',
  evidenceRefs: [ref],
});

/**
 * The task's own declared wiring: producer = the task wiring contract, consumer =
 * the compiled worker prompt, ingresses = initial + FIX, enablement = the contract
 * digest, proof = the production-wiring prompt test.
 */
function makeContract(overrides: Partial<ProductionWiringContract> = {}): ProductionWiringContract {
  return {
    version: 1,
    changeKind: 'runtime-addition',
    producer: {
      producerId: 'task wiring contract',
      evidence: complete('src/core/production-wiring-contract.ts'),
    },
    canonicalConsumer: {
      consumerId: 'compiled worker prompt',
      relationship: 'invokes-producer',
      evidence: complete('src/orchestra/prompt-god-template.ts#buildProductionWiringAuthorityBlock'),
    },
    affectedIngresses: [
      { ingressId: 'initial', kind: 'ingress', evidence: complete('buildTaskPromptSegmented') },
      { ingressId: 'FIX', kind: 'ingress', evidence: complete('buildTaskPromptSegmented') },
    ],
    enablementAuthority: {
      authorityId: 'contract digest',
      mechanism: 'unconditional',
      evidence: complete('ProductionWiringPlanEvidence.contractDigest'),
    },
    disposition: { kind: 'production-wiring' },
    proofTargets: [
      {
        proofTargetId: 'production-wiring-prompt',
        kind: 'consumer-execution',
        evidence: executed('tests/orchestra/production-wiring-prompt.test.ts'),
      },
    ],
    ...overrides,
  } as ProductionWiringContract;
}

function makeEvidence(
  contract: ProductionWiringContract = makeContract(),
): ProductionWiringPlanEvidence {
  return createProductionWiringPlanEvidence(contract);
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '487-026',
    title: 'Prompt wiring closure block',
    description: 'Render one protected digest-bound block.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/prompt-god-template.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-487',
    assignedAgent: 'implementer',
    assignedSkills: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'implementer',
    agentPrompt: '# Implementer\nBuild the thing.',
    skillPrompts: [],
    allAdrs: [],
    effort: 'high',
    ...overrides,
  };
}

// ─── Block rendering ───────────────────────────────────────────────────

describe('production-wiring prompt block — rendering', () => {
  it('returns empty string when the task carries no wiring authority', () => {
    expect(buildProductionWiringAuthorityBlock(undefined)).toBe('');
  });

  it('renders the exact producer→consumer→ingress→enablement→proof chain', () => {
    const evidence = makeEvidence();
    const block = buildProductionWiringAuthorityBlock(evidence);

    expect(block.startsWith(PRODUCTION_WIRING_BLOCK_HEADING)).toBe(true);
    expect(block).toContain(`Contract digest: sha256:${evidence.contractDigest}`);
    expect(block).toContain('disposition: production-wired');
    expect(block).toContain('- Producer: `task wiring contract` [complete/authority-record]');
    expect(block).toContain('- Canonical consumer: `compiled worker prompt` (invokes-producer)');
    expect(block).toContain('- Affected ingress: `initial` (ingress)');
    expect(block).toContain('- Affected ingress: `FIX` (ingress)');
    expect(block).toContain('- Enablement authority: `contract digest` (unconditional)');
    expect(block).toContain('- Proof target: `production-wiring-prompt` (consumer-execution)');
    expect(block).toContain('refs: tests/orchestra/production-wiring-prompt.test.ts');

    // Ordering IS the mapping: each link must precede the next.
    const at = (needle: string): number => block.indexOf(needle);
    expect(at('- Producer:')).toBeGreaterThan(-1);
    expect(at('- Producer:')).toBeLessThan(at('- Canonical consumer:'));
    expect(at('- Canonical consumer:')).toBeLessThan(at('- Affected ingress: `initial`'));
    expect(at('- Affected ingress: `FIX`')).toBeLessThan(at('- Enablement authority:'));
    expect(at('- Enablement authority:')).toBeLessThan(at('- Proof target:'));
  });

  it('is deterministic for the same bound contract', () => {
    const evidence = makeEvidence();
    expect(buildProductionWiringAuthorityBlock(evidence))
      .toBe(buildProductionWiringAuthorityBlock(makeEvidence()));
  });

  it('renders identities verbatim and never invents one from task prose', () => {
    const block = buildProductionWiringAuthorityBlock(makeEvidence(makeContract({
      producer: { producerId: 'exact::producer::id', evidence: complete('ref-a') },
    })));
    expect(block).toContain('`exact::producer::id`');
    // No identity may appear that is not declared by the contract.
    const identities = [...block.matchAll(/`([^`]+)`/g)].map(m => m[1]);
    const declared = new Set([
      'exact::producer::id',
      'compiled worker prompt',
      'initial',
      'FIX',
      'contract digest',
      'production-wiring-prompt',
      'UNWIRED:',
    ]);
    for (const identity of identities) expect(declared.has(identity)).toBe(true);
  });

  it('bounds long ingress and proof-target lists and names the omission count', () => {
    const block = buildProductionWiringAuthorityBlock(makeEvidence(makeContract({
      affectedIngresses: Array.from({ length: 15 }, (_, i) => ({
        ingressId: `ingress-${i}`,
        kind: 'ingress' as const,
        evidence: complete(`ref-${i}`),
      })),
    })));
    expect(block).toContain('`ingress-11`');
    expect(block).not.toContain('`ingress-12`');
    expect(block).toContain('+3 further affected ingress(es)');
  });
});

// ─── Fail-closed / typed UNWIRED ───────────────────────────────────────

describe('production-wiring prompt block — typed UNWIRED with exact delta', () => {
  it('fails closed with no identities when the bound digest does not match the contract', () => {
    const tampered: ProductionWiringPlanEvidence = {
      ...makeEvidence(),
      contractDigest: 'deadbeef',
    };
    const block = buildProductionWiringAuthorityBlock(tampered);

    expect(block.startsWith(PRODUCTION_WIRING_UNWIRED_HEADING)).toBe(true);
    expect(block).toContain('contract-digest-mismatch');
    expect(block).toContain('Bound digest: sha256:deadbeef');
    expect(block).toContain('NO_GO');
    expect(block).toContain('UNWIRED:');
    // Not one identity from the unverified contract leaks into the prompt.
    expect(block).not.toContain('task wiring contract');
    expect(block).not.toContain('compiled worker prompt');
    expect(block).not.toContain('production-wiring-prompt');
  });

  it('fails closed on an unsupported evidence version', () => {
    const block = buildProductionWiringAuthorityBlock({
      ...makeEvidence(),
      version: 2 as ProductionWiringPlanEvidence['version'],
    });
    expect(block.startsWith(PRODUCTION_WIRING_UNWIRED_HEADING)).toBe(true);
    expect(block).toContain('unsupported-evidence-version');
    expect(block).not.toContain('compiled worker prompt');
  });

  it('renders the resolver-typed exact delta when the chain does not resolve', () => {
    const block = buildProductionWiringAuthorityBlock(makeEvidence(makeContract({
      canonicalConsumer: {
        consumerId: 'compiled worker prompt',
        relationship: 'invokes-producer',
        evidence: { state: 'presence-only', basis: 'code-presence', evidenceRefs: ['x.ts'] },
      },
    })));

    expect(block.startsWith(PRODUCTION_WIRING_UNWIRED_HEADING)).toBe(true);
    expect(block).toContain('decision: incomplete');
    expect(block).toContain('outer settlement: blocked');
    // Exact delta: target + exact identity + typed reason code.
    expect(block).toContain('- canonical-consumer: `compiled worker prompt` → presence-only-evidence');
    expect(block).toContain('UNWIRED:');
    expect(block).toContain('"NO_GO"');
  });

  it('names the staged-foundation closure barrier instead of implying completion', () => {
    const block = buildProductionWiringAuthorityBlock(makeEvidence(makeContract({
      changeKind: 'foundation',
      disposition: {
        kind: 'staged-foundation',
        foundationTaskId: '487-026',
        dagId: 'dag-487',
        closureTasks: [{ taskId: '487-027', dagId: 'dag-487' }],
        outerSettlementBarrier: {
          kind: 'block-until-exact-closure-settles',
          dagId: 'dag-487',
          closureTaskIds: ['487-027'],
        },
      },
    })));

    expect(block).toContain('disposition: staged-foundation');
    expect(block).toContain('exact closure task(s): `487-027`');
    expect(block).toContain('the outer run cannot complete until those exact closure tasks settle');
  });
});

// ─── Compiled-prompt wiring (producer → consumer → ingress) ────────────

describe('production-wiring prompt block — compiled worker prompt consumer', () => {
  it('is absent from the compiled prompt when the task carries no contract', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    expect(prompt).not.toContain(PRODUCTION_WIRING_BLOCK_HEADING);
    expect(prompt).not.toContain(PRODUCTION_WIRING_UNWIRED_HEADING);
  });

  it('renders exactly one block in the compiled prompt when the task carries one', () => {
    const evidence = makeEvidence();
    const { prompt } = buildTaskPrompt(makeTask({ productionWiring: evidence }), makeCtx());

    const occurrences = prompt.split(PRODUCTION_WIRING_BLOCK_HEADING).length - 1;
    expect(occurrences).toBe(1);
    expect(prompt).toContain(`sha256:${evidence.contractDigest}`);
    expect(prompt).toContain('- Canonical consumer: `compiled worker prompt` (invokes-producer)');
  });

  it('emits exactly one production-wiring segment, in the volatile T2 tier', () => {
    const { segments } = buildTaskPromptSegmented(
      makeTask({ productionWiring: makeEvidence() }),
      makeCtx(),
    );
    const wiring = segments.filter(s => s.kind === 'production-wiring');
    expect(wiring).toHaveLength(1);
    expect(wiring[0].tier).toBe('T2');
    expect(wiring[0].content.startsWith(PRODUCTION_WIRING_BLOCK_HEADING)).toBe(true);
  });

  it('compiles byte-identically on the initial and FIX ingresses of the same task', () => {
    const evidence = makeEvidence();
    const initial = buildTaskPrompt(makeTask({ productionWiring: evidence }), makeCtx());
    // A FIX attempt recompiles the same task through the same entrypoint.
    const fix = buildTaskPrompt(makeTask({ productionWiring: evidence }), makeCtx());
    expect(fix.prompt).toBe(initial.prompt);
    expect(fix.prompt).toContain(PRODUCTION_WIRING_BLOCK_HEADING);
  });

  it('does not repeat mutable directive text or degrade into a generic checklist', () => {
    const task = makeTask({
      productionWiring: makeEvidence(),
      description: 'MUTABLE-DIRECTIVE-SENTINEL: do the thing.',
      goNogo: {
        goCriteria: 'GO-SENTINEL passes',
        noGoCriteria: 'NOGO-SENTINEL',
        techDebtAcceptable: 'Minor',
      },
    });
    const { segments } = buildTaskPromptSegmented(task, makeCtx());
    const block = segments.find(s => s.kind === 'production-wiring')!.content;

    // The block addresses the contract by digest; it never restates directive prose.
    expect(block).not.toContain('MUTABLE-DIRECTIVE-SENTINEL');
    expect(block).not.toContain('GO-SENTINEL');
    expect(block).not.toContain('NOGO-SENTINEL');
    expect(block).not.toContain('DIRECTIVES.md');
    // Not a generic checklist: no checkbox/step scaffolding.
    expect(block).not.toMatch(/^\s*(?:- \[[ x]\]|\d+\.\s)/m);
    // The prompt never owns DONE for the wiring chain.
    expect(block).not.toContain('DONE"');
    expect(block).toContain('Settlement is host-owned');
    expect(block).toContain('it never marks this task complete');
  });
});
