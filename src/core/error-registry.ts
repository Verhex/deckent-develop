import type { ErrorEntry } from './errors.js';

export const DECKENT_ERROR_CODE_PATTERN = /^DECKENT_E\d{3}$/;

export type ErrorRemediation =
  | { kind: 'guidance'; text: string }
  | { kind: 'none'; reason: string };

export interface ErrorRegistryEntryLike {
  message?: unknown;
  suggestion?: unknown;
  remediation?: unknown;
}

export type ErrorRegistryIntegrityViolation =
  | { code: string; kind: 'malformed-code' }
  | { code: string; kind: 'empty-message' }
  | { code: string; kind: 'missing-remediation' };

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasExplicitRemediation(remediation: unknown): remediation is ErrorRemediation {
  if (typeof remediation !== 'object' || remediation === null || !('kind' in remediation)) {
    return false;
  }

  if (remediation.kind === 'guidance' && 'text' in remediation) {
    return isNonEmptyText(remediation.text);
  }

  return remediation.kind === 'none' && 'reason' in remediation && isNonEmptyText(remediation.reason);
}

/**
 * Validates metadata from the live ErrorRegistry export. Existing entries use
 * `suggestion` as their remediation; the explicit remediation union preserves
 * a typed, reasoned no-remediation escape hatch for future entries.
 */
export function inspectErrorRegistryIntegrity(
  entries: ReadonlyMap<string, ErrorRegistryEntryLike>,
): ErrorRegistryIntegrityViolation[] {
  const violations: ErrorRegistryIntegrityViolation[] = [];

  for (const [code, entry] of entries) {
    if (!DECKENT_ERROR_CODE_PATTERN.test(code)) {
      violations.push({ code, kind: 'malformed-code' });
    }
    if (!isNonEmptyText(entry.message)) {
      violations.push({ code, kind: 'empty-message' });
    }
    if (!isNonEmptyText(entry.suggestion) && !hasExplicitRemediation(entry.remediation)) {
      violations.push({ code, kind: 'missing-remediation' });
    }
  }

  return violations;
}

export function getRegisteredErrorEntries(
  getAll: () => Map<string, ErrorEntry>,
): Map<string, ErrorEntry> {
  return getAll();
}
