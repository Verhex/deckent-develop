import { describe, expect, it } from 'vitest';

import {
  containmentFacetDefinitions,
  createContainmentFacetAuthority,
  evaluateContainmentAdmission,
  evaluateContainmentAdmissionWithFacetAuthority,
  evaluateContainmentProofEligibility,
  evaluateContainmentProofEligibilityWithFacetAuthority,
  recordContainmentFacetObservation,
  validateContainmentAdmission,
  validateContainmentProof,
} from '../../scripts/hermeticity/containment-contract.mjs';
import {
  createNodePermissionPlan,
  validateNodePermissionPlan,
  validateNodeStartupInput,
} from '../../scripts/hermeticity/node-permission-plan.mjs';

const SHA_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SHA_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const SHA_D = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

function provenFacets(phase: 'admission' | 'settlement') {
  return containmentFacetDefinitions()
    .filter(facet => facet.phase === phase)
    .map(facet => ({
      id: facet.id,
      state: 'PROVEN',
      evidenceRef: `authority:${facet.id}`,
    }));
}

function indexedDigest(index: number) {
  return `sha256:${index.toString(16).padStart(64, '0')}`;
}

function facetAuthority(adapterId = 'linux-namespace-v1', boundaryClass = 'kernel') {
  return createContainmentFacetAuthority({
    runNonce: 'run-0001',
    adapterId,
    boundaryClass,
    authorityRef: SHA_A,
    policyRef: SHA_B,
    resourceIdentityRef: SHA_C,
    executionIntentRef: SHA_D,
  }).value;
}

function authorizedFacets(
  authority: unknown,
  phase: 'admission' | 'settlement',
) {
  return containmentFacetDefinitions()
    .filter(facet => facet.phase === phase)
    .map((facet, index) => recordContainmentFacetObservation({
      authority,
      phase,
      id: facet.id,
      state: 'PROVEN',
      evidenceRef: indexedDigest(index + (phase === 'admission' ? 1 : 101)),
      evidenceBindingRef: indexedDigest(index + (phase === 'admission' ? 201 : 301)),
    }).value);
}

function strongAdmissionFixture() {
  const authority = facetAuthority();
  const admission = evaluateContainmentAdmissionWithFacetAuthority({
    authority,
    mode: 'enforce',
    adapterId: 'linux-namespace-v1',
    adapterState: 'AVAILABLE',
    boundaryClass: 'kernel',
    facets: authorizedFacets(authority, 'admission'),
  });
  return { authority, admission };
}

function strongAdmission() {
  return strongAdmissionFixture().admission;
}

function nodePermissionInput() {
  return {
    platform: 'posix',
    nodeMajor: 24,
    bootstrapPath: '/opt/deckent/runtime/bootstrap.mjs',
    readOnlyPaths: [
      '/opt/deckent/runtime',
      '/srv/deckent/dependencies',
      '/srv/deckent/output',
      '/srv/deckent/source',
    ],
    writePaths: [
      '/srv/deckent/scratch',
    ],
    candidateExecArgv: [
      '--enable-source-maps',
      '--unhandled-rejections=strict',
    ],
    candidateEnvironment: {
      CI: 'true',
      DECKENT_RUN_NONCE: 'run-0001',
    },
    allowChildProcess: false,
    allowWorker: true,
    allowAddons: false,
  };
}

describe('containment contract', () => {
  it('admits only complete strong enforcement facets and never marks admission as proof', () => {
    const admission = strongAdmission();

    expect(admission).toMatchObject({
      kind: 'containment-admission',
      state: 'ADMITTED',
      mode: 'enforce',
      boundaryClass: 'kernel',
      proofEligible: false,
      reasonCode: 'NONE',
      facetAuthority: {
        state: 'COMPLETE',
        blockingFacetIds: [],
      },
    });
    expect(validateContainmentAdmission(admission).ok).toBe(true);
    expect(Object.isFrozen(admission)).toBe(true);

    const incomplete = provenFacets('admission');
    incomplete.pop();
    expect(evaluateContainmentAdmission({
      mode: 'enforce',
      adapterId: 'linux-namespace-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'kernel',
      facets: incomplete,
    })).toMatchObject({
      state: 'HOLD',
      proofEligible: false,
      reasonCode: 'E_CONTAINMENT_FACET_UNPROVEN',
    });
  });

  it('keeps audit and process-only boundaries fail-closed', () => {
    expect(evaluateContainmentAdmission({
      mode: 'audit',
      adapterId: 'audit-observer-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'process',
      facets: provenFacets('admission'),
    })).toMatchObject({
      state: 'AUDIT_UNENFORCED',
      proofEligible: false,
      reasonCode: 'E_CONTAINMENT_AUDIT_UNENFORCED',
    });

    expect(evaluateContainmentAdmission({
      mode: 'enforce',
      adapterId: 'process-only-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'process',
      facets: provenFacets('admission'),
    })).toMatchObject({
      state: 'HOLD',
      proofEligible: false,
      reasonCode: 'E_CONTAINMENT_BOUNDARY_CLASS_INSUFFICIENT',
    });
  });

  it('makes proof eligible only after settled execution and complete settlement facets', () => {
    const { authority, admission } = strongAdmissionFixture();
    const settlementFacets = authorizedFacets(authority, 'settlement');
    const proof = evaluateContainmentProofEligibilityWithFacetAuthority({
      authority,
      admission,
      executionState: 'SETTLED',
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
      facets: settlementFacets,
    });

    expect(proof).toMatchObject({
      kind: 'containment-proof',
      state: 'ELIGIBLE',
      proofEligible: true,
      reasonCode: 'NONE',
    });
    expect(validateContainmentProof(proof).ok).toBe(true);

    expect(evaluateContainmentProofEligibilityWithFacetAuthority({
      authority,
      admission,
      executionState: 'RUNNING',
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
      facets: settlementFacets,
    })).toMatchObject({
      state: 'HOLD',
      proofEligible: false,
      reasonCode: 'E_CONTAINMENT_EXECUTION_UNSETTLED',
    });
  });

  it('rejects caller proof claims and forged facet summaries', () => {
    expect(evaluateContainmentAdmission({
      mode: 'enforce',
      adapterId: 'linux-namespace-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'kernel',
      facets: provenFacets('admission'),
      proofEligible: true,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_CONTAINMENT_RESERVED_FIELD',
    });

    const emptyAuthority = structuredClone(strongAdmission());
    emptyAuthority.facetAuthority.requiredFacetIds = [];
    emptyAuthority.facetAuthority.provenFacetIds = [];
    emptyAuthority.facetAuthority.evidenceRefs = [];
    expect(validateContainmentAdmission(emptyAuthority)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_ADMISSION_INVALID' },
    });

    const duplicateAuthority = structuredClone(strongAdmission());
    duplicateAuthority.facetAuthority.provenFacetIds[1] =
      duplicateAuthority.facetAuthority.provenFacetIds[0];
    expect(validateContainmentAdmission(duplicateAuthority).ok).toBe(false);

    const wrongPhase = structuredClone(strongAdmission());
    wrongPhase.facetAuthority.phase = 'settlement';
    expect(validateContainmentAdmission(wrongPhase).ok).toBe(false);

    const extraPhaseFacet = provenFacets('admission');
    extraPhaseFacet.push(provenFacets('settlement')[0]);
    expect(evaluateContainmentAdmission({
      mode: 'enforce',
      adapterId: 'linux-namespace-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'kernel',
      facets: extraPhaseFacet,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_CONTAINMENT_FACET_PHASE_INVALID',
    });

    const duplicateEvidence = provenFacets('admission');
    duplicateEvidence[1].evidenceRef = duplicateEvidence[0].evidenceRef;
    expect(evaluateContainmentAdmission({
      mode: 'enforce',
      adapterId: 'linux-namespace-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'kernel',
      facets: duplicateEvidence,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_CONTAINMENT_FACET_EVIDENCE_DUPLICATE',
    });

    const extraTopLevelField = structuredClone(strongAdmission());
    extraTopLevelField.signedButUnvalidated = true;
    expect(validateContainmentAdmission(extraTopLevelField).ok).toBe(false);

    const proofFixture = strongAdmissionFixture();
    const forgedProof = structuredClone(
      evaluateContainmentProofEligibilityWithFacetAuthority({
      authority: proofFixture.authority,
      admission: proofFixture.admission,
      executionState: 'SETTLED',
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
      facets: authorizedFacets(proofFixture.authority, 'settlement'),
    }),
    );
    forgedProof.facetAuthority.requiredFacetIds = [];
    forgedProof.facetAuthority.provenFacetIds = [];
    forgedProof.facetAuthority.evidenceRefs = [];
    expect(validateContainmentProof(forgedProof).ok).toBe(false);

    const attackerAdmission = evaluateContainmentAdmission({
      mode: 'enforce',
      adapterId: 'linux-namespace-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'kernel',
      facets: provenFacets('admission'),
    });
    expect(attackerAdmission).toMatchObject({
      state: 'HOLD',
      proofEligible: false,
      reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_REQUIRED',
    });
    expect(evaluateContainmentProofEligibility({
      admission: strongAdmission(),
      executionState: 'SETTLED',
      facets: provenFacets('settlement'),
    })).toMatchObject({
      state: 'HOLD',
      proofEligible: false,
      reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_REQUIRED',
    });
  });

  it('keeps facet authority identity opaque under cloning, proxies, and intrinsic tampering', () => {
    expect(createContainmentFacetAuthority({
      runNonce: 'run-0001',
      adapterId: 'linux-namespace-v1',
      boundaryClass: 'kernel',
      authorityRef: SHA_A,
      policyRef: SHA_B,
      resourceIdentityRef: SHA_C,
      executionIntentRef: SHA_D,
      callerDeclaredAuthority: true,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_CONTEXT_INVALID' },
    });

    const authority = facetAuthority();
    expect(recordContainmentFacetObservation({
      authority,
      phase: 'admission',
      id: containmentFacetDefinitions()[0].id,
      state: 'PROVEN',
      evidenceRef: SHA_A,
      evidenceBindingRef: SHA_B,
      callerDeclaredAuthority: true,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_FACET_OBSERVATION_INPUT_INVALID' },
    });

    const originalWeakMapGet = WeakMap.prototype.get;
    const originalWeakMapSet = WeakMap.prototype.set;
    const originalWeakSetAdd = WeakSet.prototype.add;
    const originalWeakSetHas = WeakSet.prototype.has;
    let admitted;
    try {
      WeakMap.prototype.get = () => {
        throw new Error('patched WeakMap.get');
      };
      WeakMap.prototype.set = () => {
        throw new Error('patched WeakMap.set');
      };
      WeakSet.prototype.add = () => {
        throw new Error('patched WeakSet.add');
      };
      WeakSet.prototype.has = () => {
        throw new Error('patched WeakSet.has');
      };
      admitted = evaluateContainmentAdmissionWithFacetAuthority({
        authority,
        mode: 'enforce',
        adapterId: 'linux-namespace-v1',
        adapterState: 'AVAILABLE',
        boundaryClass: 'kernel',
        facets: authorizedFacets(authority, 'admission'),
      });
    } finally {
      WeakMap.prototype.get = originalWeakMapGet;
      WeakMap.prototype.set = originalWeakMapSet;
      WeakSet.prototype.add = originalWeakSetAdd;
      WeakSet.prototype.has = originalWeakSetHas;
    }
    expect(admitted).toMatchObject({ state: 'ADMITTED' });

    let proxyRead = false;
    const proxy = new Proxy(authority as object, {
      get(target, property, receiver) {
        proxyRead = true;
        return Reflect.get(target, property, receiver);
      },
    });
    expect(evaluateContainmentAdmissionWithFacetAuthority({
      authority: proxy,
      mode: 'enforce',
      adapterId: 'linux-namespace-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'kernel',
      facets: authorizedFacets(authority, 'admission'),
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_INVALID',
    });
    expect(proxyRead).toBe(false);
  });
});

describe('Node permission defense-in-depth plan', () => {
  it('generates a bounded Node 24 plan without claiming containment proof or network denial', () => {
    const plan = createNodePermissionPlan(nodePermissionInput());

    expect(plan).toMatchObject({
      state: 'READY',
      defenseInDepthOnly: true,
      proofEligible: false,
      reasonCode: 'NONE',
      inheritHostEnvironment: false,
      capabilities: {
        childProcess: false,
        worker: true,
        addons: false,
      },
      environmentPatch: {
        LD_PRELOAD: null,
        DYLD_INSERT_LIBRARIES: null,
        NODE_PATH: null,
      },
    });
    expect(plan.execArgv).toContain('--permission');
    expect(plan.execArgv).toContain('--allow-worker');
    expect(plan.execArgv).toContain('--import=/opt/deckent/runtime/bootstrap.mjs');
    expect(plan.execArgv.filter((argument: string) => (
      argument.startsWith('--allow-fs-read=')
    ))).toEqual([
      '--allow-fs-read=/opt/deckent/runtime',
      '--allow-fs-read=/srv/deckent/dependencies',
      '--allow-fs-read=/srv/deckent/output',
      '--allow-fs-read=/srv/deckent/scratch',
      '--allow-fs-read=/srv/deckent/source',
    ]);
    expect(plan.execArgv.filter((argument: string) => (
      argument.startsWith('--allow-fs-write=')
    ))).toEqual([
      '--allow-fs-write=/srv/deckent/scratch',
    ]);
    expect(plan.execArgv.filter((argument: string) => (
      argument.startsWith('--allow-fs-')
    )).every((argument: string) => !argument.includes(','))).toBe(true);
    expect(plan.descendantNodeOptions.match(/--allow-fs-read=/gu)).toHaveLength(5);
    expect(plan.descendantNodeOptions.match(/--allow-fs-write=/gu)).toHaveLength(1);
    expect(plan.execArgv.join(' ')).not.toContain('allow-network');
    expect(plan).not.toHaveProperty('networkDenied');
    expect(validateNodePermissionPlan(plan).ok).toBe(true);
    expect(createNodePermissionPlan({
      ...nodePermissionInput(),
      inheritHostEnvironment: true,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_NODE_PERMISSION_RESERVED_FIELD',
    });
  });

  it.each([
    ['--import=/tmp/foreign.mjs'],
    ['--require=/tmp/foreign.cjs'],
    ['--experimental-loader=/tmp/loader.mjs'],
    ['--env-file=/tmp/foreign.env'],
    ['--snapshot-blob=/tmp/foreign.blob'],
    ['--allow-fs-read=/'],
    ['--abort-on-uncaught-exception'],
  ])('rejects untrusted startup argv %s', candidateExecArgv => {
    expect(validateNodeStartupInput({
      candidateExecArgv: [candidateExecArgv],
      candidateEnvironment: {},
    })).toMatchObject({
      ok: false,
      reasonCode: 'E_NODE_STARTUP_ARGV_DENIED',
    });
  });

  it.each([
    'NODE_OPTIONS',
    'NODE_PATH',
    'NODE_FUTURE_PERMISSION_BYPASS',
    'NPM_CONFIG_PREFIX',
    'LD_PRELOAD',
    'DYLD_INSERT_LIBRARIES',
    'BASH_ENV',
    'OPENSSL_CONF',
  ])('rejects untrusted startup environment key %s', key => {
    expect(validateNodeStartupInput({
      candidateExecArgv: [],
      candidateEnvironment: { [key]: '/tmp/foreign' },
    })).toMatchObject({
      ok: false,
      reasonCode: 'E_NODE_STARTUP_ENVIRONMENT_DENIED',
    });
  });

  it('rejects old runtimes, broad roots, and read/write authority overlap', () => {
    expect(createNodePermissionPlan({
      ...nodePermissionInput(),
      nodeMajor: 23,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_NODE_PERMISSION_RUNTIME_UNSUPPORTED',
    });
    expect(createNodePermissionPlan({
      ...nodePermissionInput(),
      readOnlyPaths: ['/'],
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_NODE_PERMISSION_BROAD_PATH_DENIED',
    });
    expect(createNodePermissionPlan({
      ...nodePermissionInput(),
      writePaths: ['/srv/deckent/source/generated'],
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_NODE_PERMISSION_READ_WRITE_AUTHORITY_OVERLAP',
    });
    expect(createNodePermissionPlan({
      ...nodePermissionInput(),
      readOnlyPaths: [
        '/opt/deckent/runtime',
        '/proc/self/fd/3',
      ],
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_NODE_PERMISSION_SENSITIVE_PATH_DENIED',
    });
    expect(createNodePermissionPlan({
      ...nodePermissionInput(),
      readOnlyPaths: [
        '/opt/deckent/runtime',
        '/home/user/.ssh',
      ],
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_NODE_PERMISSION_SENSITIVE_PATH_DENIED',
    });

    expect(createNodePermissionPlan({
      ...nodePermissionInput(),
      platform: 'win32',
      bootstrapPath: 'C:\\Deckent\\runtime\\bootstrap.mjs',
      readOnlyPaths: ['C:\\Deckent\\runtime'],
      writePaths: ['C:\\Deckent\\scratch:stream'],
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_NODE_PERMISSION_DEVICE_PATH_DENIED',
    });
    expect(createNodePermissionPlan({
      ...nodePermissionInput(),
      platform: 'win32',
      bootstrapPath: 'C:\\Deckent\\runtime\\bootstrap.mjs',
      readOnlyPaths: ['C:\\Deckent\\runtime'],
      writePaths: ['D:\\Users\\alperen\\scratch'],
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_NODE_PERMISSION_SENSITIVE_PATH_DENIED',
    });

    for (const bootstrapPath of [
      'C:\\Deckent\\CON\\bootstrap.mjs',
      'C:\\Deckent\\runtime.\\bootstrap.mjs',
      '/opt/deckent/cafe\u0301/bootstrap.mjs',
      '/opt/deckent/runtime\t/bootstrap.mjs',
    ]) {
      expect(createNodePermissionPlan({
        ...nodePermissionInput(),
        platform: bootstrapPath.startsWith('C:') ? 'win32' : 'posix',
        bootstrapPath,
        readOnlyPaths: bootstrapPath.startsWith('C:')
          ? ['C:\\Deckent']
          : ['/opt/deckent'],
        writePaths: bootstrapPath.startsWith('C:')
          ? ['C:\\DeckentScratch']
          : ['/srv/deckent/scratch'],
      })).toMatchObject({
        state: 'HOLD',
        proofEligible: false,
      });
    }
  });
});
