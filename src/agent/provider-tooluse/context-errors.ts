import type { ProviderAdmissionDecision } from './types.js';

export type ProviderContextErrorCode =
  | 'INPUT_CONTEXT_OVERFLOW'
  | 'INPUT_CONTEXT_AUTHORITY_UNAVAILABLE';

export class InputContextOverflowError extends Error {
  readonly code = 'INPUT_CONTEXT_OVERFLOW' as const;
  constructor(readonly decision: Extract<ProviderAdmissionDecision, { admitted: false }>) {
    super(`INPUT_CONTEXT_OVERFLOW: measured=${decision.measurement.inputTokens} available=${decision.availableTokens}`);
    this.name = 'InputContextOverflowError';
  }
}

export class ContextAuthorityUnavailableError extends Error {
  readonly code = 'INPUT_CONTEXT_AUTHORITY_UNAVAILABLE' as const;
  constructor(provider: string, model: string) {
    super(`INPUT_CONTEXT_AUTHORITY_UNAVAILABLE: provider=${provider} model=${model}`);
    this.name = 'ContextAuthorityUnavailableError';
  }
}

export function providerContextErrorCode(error: unknown): ProviderContextErrorCode | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  const code = (error as Error & { code?: unknown }).code;
  return code === 'INPUT_CONTEXT_OVERFLOW' || code === 'INPUT_CONTEXT_AUTHORITY_UNAVAILABLE'
    ? code
    : undefined;
}
