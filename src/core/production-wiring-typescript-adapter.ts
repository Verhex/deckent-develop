import type {
  ProductionWiringAdapter,
  ProductionWiringAdapterRequest,
} from './production-wiring-adapters.js';
import type { ProductionWiringEvidence } from './production-wiring-contract.js';

export const TYPESCRIPT_PRODUCTION_WIRING_LANGUAGE = 'typescript' as const;
export const TYPESCRIPT_STATIC_REACHABILITY_CAPABILITY = 'static-reachability' as const;
export const TYPESCRIPT_RUNTIME_PROOF_CAPABILITY = 'runtime-proof' as const;

export interface TypeScriptProductionWiringObservation {
  readonly state: 'observed' | 'not-observed' | 'unavailable';
}

export type TypeScriptProductionWiringObserve = (
  request: ProductionWiringAdapterRequest,
) => TypeScriptProductionWiringObservation;

export interface TypeScriptProductionWiringAdapterOptions {
  readonly isAvailable?: () => boolean;
  readonly observe: TypeScriptProductionWiringObserve;
}

export function createTypeScriptStaticSupportAdapter(
  options: TypeScriptProductionWiringAdapterOptions,
): ProductionWiringAdapter {
  return createAdapter(
    'typescript-static-reachability',
    TYPESCRIPT_STATIC_REACHABILITY_CAPABILITY,
    options,
    (observation, evidenceRefs) => {
      if (observation.state === 'observed') {
        return { state: 'presence-only', basis: 'static-reachability', evidenceRefs };
      }
      if (observation.state === 'unavailable') {
        return { state: 'unsupported', reasonCode: 'environment-unavailable', evidenceRefs };
      }
      return { state: 'incomplete', reasonCode: 'absent', evidenceRefs };
    },
  );
}

export function createTypeScriptRuntimeProofAdapter(
  options: TypeScriptProductionWiringAdapterOptions,
): ProductionWiringAdapter {
  return createAdapter(
    'typescript-runtime-proof',
    TYPESCRIPT_RUNTIME_PROOF_CAPABILITY,
    options,
    (observation, evidenceRefs) => {
      if (observation.state === 'observed') {
        return { state: 'complete', basis: 'executed-production-path', evidenceRefs };
      }
      if (observation.state === 'unavailable') {
        return { state: 'unsupported', reasonCode: 'environment-unavailable', evidenceRefs };
      }
      return { state: 'incomplete', reasonCode: 'not-executed', evidenceRefs };
    },
  );
}

function createAdapter(
  id: string,
  capability: string,
  options: TypeScriptProductionWiringAdapterOptions,
  projectEvidence: (
    observation: TypeScriptProductionWiringObservation,
    evidenceRefs: readonly string[],
  ) => ProductionWiringEvidence,
): ProductionWiringAdapter {
  return {
    id,
    language: TYPESCRIPT_PRODUCTION_WIRING_LANGUAGE,
    capability,
    isAvailable: options.isAvailable ?? (() => true),
    verify(request) {
      return projectEvidence(options.observe(request), request.evidenceRefs);
    },
  };
}
