import type { ProductionWiringEvidence } from './production-wiring-contract.js';

export interface ProductionWiringAdapterRequest {
  readonly language: string;
  readonly capability: string;
  readonly evidenceRefs: readonly string[];
}

export type ProductionWiringAdapterDecision =
  | {
      readonly kind: 'evidence';
      readonly adapterId: string;
      readonly evidence: ProductionWiringEvidence;
    }
  | {
      readonly kind: 'unsupported';
      readonly disposition: 'HOLD';
      readonly reason: 'unsupported-language' | 'unsupported-capability';
      readonly language: string;
      readonly capability: string;
    }
  | {
      readonly kind: 'hold';
      readonly disposition: 'HOLD';
      readonly reason: 'invalid-request' | 'adapter-unavailable' | 'invalid-adapter-evidence';
      readonly detail: string;
      readonly adapterId?: string;
    };

export interface ProductionWiringAdapter {
  readonly id: string;
  readonly language: string;
  readonly capability: string;
  isAvailable(): boolean;
  verify(request: ProductionWiringAdapterRequest): ProductionWiringEvidence;
}

interface RegisteredAdapter {
  readonly adapter: ProductionWiringAdapter;
  readonly priority: number;
  readonly order: number;
}

export class ProductionWiringAdapterRegistry {
  private readonly entries: RegisteredAdapter[] = [];
  private registrationOrder = 0;

  register(adapter: ProductionWiringAdapter, priority = 0): void {
    if (!validIdentity(adapter.id) || !validIdentity(adapter.language) || !validIdentity(adapter.capability)) {
      throw new Error('Production-wiring adapter identities must be non-empty');
    }
    this.entries.push({ adapter, priority, order: this.registrationOrder++ });
  }

  list(): readonly ProductionWiringAdapter[] {
    return this.entries
      .slice()
      .sort((left, right) => right.priority - left.priority || right.order - left.order)
      .map(({ adapter }) => adapter);
  }

  resolve(language: string, capability: string): ProductionWiringAdapter | undefined {
    const normalizedLanguage = normalizeIdentity(language);
    const normalizedCapability = normalizeIdentity(capability);
    return this.list().find((adapter) => (
      normalizeIdentity(adapter.language) === normalizedLanguage
      && normalizeIdentity(adapter.capability) === normalizedCapability
    ));
  }

  verify(request: ProductionWiringAdapterRequest): ProductionWiringAdapterDecision {
    if (!validRequest(request)) {
      return hold('invalid-request', 'Language, capability, and evidence references must be non-empty');
    }

    const languageAdapters = this.list().filter((adapter) => (
      normalizeIdentity(adapter.language) === normalizeIdentity(request.language)
    ));
    if (languageAdapters.length === 0) {
      return unsupported(request, 'unsupported-language');
    }

    const adapter = this.resolve(request.language, request.capability);
    if (adapter === undefined) {
      return unsupported(request, 'unsupported-capability');
    }
    if (!adapter.isAvailable()) {
      return hold('adapter-unavailable', 'The selected production-wiring adapter is unavailable', adapter.id);
    }

    let evidence: ProductionWiringEvidence;
    try {
      evidence = adapter.verify(request);
    } catch (error: unknown) {
      return hold('invalid-adapter-evidence', errorDetail(error), adapter.id);
    }
    if (!validEvidence(evidence)) {
      return hold('invalid-adapter-evidence', 'Adapter returned evidence without a usable reference', adapter.id);
    }
    return { kind: 'evidence', adapterId: adapter.id, evidence };
  }
}

function validRequest(request: ProductionWiringAdapterRequest): boolean {
  return validIdentity(request.language)
    && validIdentity(request.capability)
    && request.evidenceRefs.length > 0
    && request.evidenceRefs.every(validIdentity);
}

function validEvidence(evidence: ProductionWiringEvidence): boolean {
  return evidence.evidenceRefs.length > 0 && evidence.evidenceRefs.every(validIdentity);
}

function validIdentity(value: string): boolean {
  return value.trim().length > 0;
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}

function unsupported(
  request: ProductionWiringAdapterRequest,
  reason: 'unsupported-language' | 'unsupported-capability',
): Extract<ProductionWiringAdapterDecision, { kind: 'unsupported' }> {
  return {
    kind: 'unsupported',
    disposition: 'HOLD',
    reason,
    language: request.language,
    capability: request.capability,
  };
}

function hold(
  reason: Extract<ProductionWiringAdapterDecision, { kind: 'hold' }>['reason'],
  detail: string,
  adapterId?: string,
): Extract<ProductionWiringAdapterDecision, { kind: 'hold' }> {
  return adapterId === undefined
    ? { kind: 'hold', disposition: 'HOLD', reason, detail }
    : { kind: 'hold', disposition: 'HOLD', reason, detail, adapterId };
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
