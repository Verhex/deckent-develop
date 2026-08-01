import { describe, expect, it, vi } from 'vitest';

import {
  ProductionWiringAdapterRegistry,
  type ProductionWiringAdapter,
} from '../../src/core/production-wiring-adapters.js';
import {
  createTypeScriptRuntimeProofAdapter,
  createTypeScriptStaticSupportAdapter,
} from '../../src/core/production-wiring-typescript-adapter.js';

const request = {
  language: 'typescript',
  capability: 'runtime-proof',
  evidenceRefs: ['consumer-execution:brain-wiring-verifier'],
} as const;

describe('ProductionWiringAdapterRegistry', () => {
  it('resolves a declared language and capability through the registry', () => {
    const registry = new ProductionWiringAdapterRegistry();
    registry.register(createTypeScriptRuntimeProofAdapter({
      observe: () => ({ state: 'observed' }),
    }));

    const decision = registry.verify(request);

    expect(decision).toEqual({
      kind: 'evidence',
      adapterId: 'typescript-runtime-proof',
      evidence: {
        state: 'complete',
        basis: 'executed-production-path',
        evidenceRefs: ['consumer-execution:brain-wiring-verifier'],
      },
    });
  });

  it.each([
    [{ ...request, language: 'python' }, 'unsupported-language'],
    [{ ...request, capability: 'bytecode-proof' }, 'unsupported-capability'],
  ] as const)('returns typed unsupported HOLD for an unknown declaration', (candidate, reason) => {
    const registry = new ProductionWiringAdapterRegistry();
    registry.register(createTypeScriptRuntimeProofAdapter({
      observe: () => ({ state: 'observed' }),
    }));

    const decision = registry.verify(candidate);

    expect(decision).toMatchObject({ kind: 'unsupported', disposition: 'HOLD', reason });
  });

  it('uses priority deterministically and HOLDs an unavailable selected adapter', () => {
    const registry = new ProductionWiringAdapterRegistry();
    registry.register(createTypeScriptRuntimeProofAdapter({
      observe: () => ({ state: 'observed' }),
    }));
    registry.register(createTypeScriptRuntimeProofAdapter({
      isAvailable: () => false,
      observe: () => ({ state: 'observed' }),
    }), 10);

    const decision = registry.verify(request);

    expect(decision).toMatchObject({
      kind: 'hold',
      disposition: 'HOLD',
      reason: 'adapter-unavailable',
      adapterId: 'typescript-runtime-proof',
    });
  });

  it('rejects malformed adapter evidence instead of failing open', () => {
    const adapter: ProductionWiringAdapter = {
      id: 'invalid-evidence',
      language: 'typescript',
      capability: 'runtime-proof',
      isAvailable: () => true,
      verify: () => ({ state: 'complete', basis: 'executed-production-path', evidenceRefs: [] }),
    };
    const registry = new ProductionWiringAdapterRegistry();
    registry.register(adapter);

    expect(registry.verify(request)).toMatchObject({
      kind: 'hold',
      disposition: 'HOLD',
      reason: 'invalid-adapter-evidence',
    });
  });
});

describe('TypeScript production-wiring adapters', () => {
  it('keeps static reachability as presence-only supporting evidence', () => {
    const observe = vi.fn(() => ({ state: 'observed' as const }));
    const registry = new ProductionWiringAdapterRegistry();
    registry.register(createTypeScriptStaticSupportAdapter({ observe }));

    const decision = registry.verify({ ...request, capability: 'static-reachability' });

    expect(observe).toHaveBeenCalledOnce();
    expect(decision).toMatchObject({
      kind: 'evidence',
      evidence: { state: 'presence-only', basis: 'static-reachability' },
    });
  });

  it.each([
    ['not-observed', { state: 'incomplete', reasonCode: 'not-executed' }],
    ['unavailable', { state: 'unsupported', reasonCode: 'environment-unavailable' }],
  ] as const)('does not promote runtime observation state %s to complete', (state, evidence) => {
    const registry = new ProductionWiringAdapterRegistry();
    registry.register(createTypeScriptRuntimeProofAdapter({ observe: () => ({ state }) }));

    const decision = registry.verify(request);

    expect(decision).toMatchObject({ kind: 'evidence', evidence });
  });
});
