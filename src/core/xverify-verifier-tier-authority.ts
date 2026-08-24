import type {
  XVerifyVerifierTierAuthority,
  XVerifyVerifierTierDecision,
} from './config-types.js';
import {
  modelRegistry,
  resolveCanonicalModelIdentity,
} from './model-registry.js';

/** Owner authorities are deliberately small enough to audit as config. */
export const XVERIFY_VERIFIER_TIER_AUTHORITY_MAX_DECISIONS = 64;
export const XVERIFY_VERIFIER_TIER_AUTHORITY_SCHEMA_VERSION = 1 as const;

const CANONICAL_DECISION_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const AUTHORITY_KEYS = new Set<PropertyKey>(['schema_version', 'decisions']);
const DECISION_KEYS = new Set<PropertyKey>([
  'author_model',
  'verifier_model',
  'decision',
  'decision_ref',
]);

export type XVerifyVerifierTierAuthorityResolution =
  | {
    admitted: true;
    decision: 'allow';
    authorModel: string;
    verifierModel: string;
    decisionRef: string;
  }
  | {
    admitted: false;
    decision: 'refuse';
    reason: 'authority_absent' | 'authority_malformed' | 'pair_not_admitted' | 'owner_refused';
    authorModel: string;
    verifierModel: string;
    decisionRef?: string;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unknownOwnKeyErrors(
  value: Record<string, unknown>,
  allowed: ReadonlySet<PropertyKey>,
  path: string,
): string[] {
  return Reflect.ownKeys(value)
    .filter(key => !allowed.has(key))
    .map(key => `${path} contains unknown field ${String(key)}`);
}

function exactModelError(model: unknown, field: 'author_model' | 'verifier_model'): string | undefined {
  if (typeof model !== 'string' || model.length === 0 || model !== model.trim() || model.includes('*')) {
    return `${field} must be a non-empty exact registry model identity`;
  }
  let registered: ReturnType<typeof resolveCanonicalModelIdentity>;
  try {
    registered = resolveCanonicalModelIdentity(model);
  } catch {
    return `${field} must name an exact canonical registry identity: ${model}`;
  }
  if (registered.id !== model || registered.apiId !== model) {
    return `${field} must name an exact canonical registry identity: ${model}`;
  }
  if (registered.status === 'deprecated') return `${field} must not be deprecated`;
  return undefined;
}

/** Validate an untrusted config value without mutating the model registry. */
export function validateXVerifyVerifierTierAuthority(value: unknown): string[] {
  if (!isRecord(value)) return ['must be an object'];
  const errors: string[] = unknownOwnKeyErrors(value, AUTHORITY_KEYS, 'authority');
  if (value.schema_version !== XVERIFY_VERIFIER_TIER_AUTHORITY_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${XVERIFY_VERIFIER_TIER_AUTHORITY_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(value.decisions)) {
    errors.push('decisions must be an array');
    return errors;
  }
  if (value.decisions.length > XVERIFY_VERIFIER_TIER_AUTHORITY_MAX_DECISIONS) {
    errors.push(`decisions must contain at most ${XVERIFY_VERIFIER_TIER_AUTHORITY_MAX_DECISIONS} entries`);
  }

  const pairs = new Map<string, 'allow' | 'refuse'>();
  for (const [index, raw] of value.decisions.entries()) {
    if (!isRecord(raw)) {
      errors.push(`decisions[${index}] must be an object`);
      continue;
    }
    errors.push(...unknownOwnKeyErrors(raw, DECISION_KEYS, `decisions[${index}]`));
    const authorError = exactModelError(raw.author_model, 'author_model');
    const verifierError = exactModelError(raw.verifier_model, 'verifier_model');
    if (authorError) errors.push(`decisions[${index}].${authorError}`);
    if (verifierError) errors.push(`decisions[${index}].${verifierError}`);
    if (raw.decision !== 'allow' && raw.decision !== 'refuse') {
      errors.push(`decisions[${index}].decision must be allow or refuse`);
    }
    if (typeof raw.decision_ref !== 'string'
      || raw.decision_ref !== raw.decision_ref.trim()
      || !CANONICAL_DECISION_REF.test(raw.decision_ref)
      || raw.decision_ref.includes('*')) {
      errors.push(`decisions[${index}].decision_ref must be a non-empty canonical decision reference`);
    }

    if (typeof raw.author_model === 'string' && typeof raw.verifier_model === 'string') {
      const author = modelRegistry.get(raw.author_model);
      const verifier = modelRegistry.get(raw.verifier_model);
      if (author && verifier && author.provider === verifier.provider) {
        errors.push(`decisions[${index}] author and verifier must use different providers`);
      }
      if (raw.decision === 'allow' || raw.decision === 'refuse') {
        const pair = `${raw.author_model}\u0000${raw.verifier_model}`;
        const prior = pairs.get(pair);
        if (prior !== undefined) {
          errors.push(prior === raw.decision
            ? `decisions[${index}] duplicates an exact author/verifier pair`
            : `decisions[${index}] conflicts with an earlier decision for the exact author/verifier pair`);
        } else {
          pairs.set(pair, raw.decision);
        }
      }
    }
  }
  return errors;
}

/** Canonical tier-floor exception resolver. Invalid or non-matching input refuses. */
export function resolveXVerifyVerifierTierAuthority(input: {
  authority: XVerifyVerifierTierAuthority | undefined;
  authorModel: string;
  verifierModel: string;
}): XVerifyVerifierTierAuthorityResolution {
  const { authority, authorModel, verifierModel } = input;
  if (authority === undefined) {
    return { admitted: false, decision: 'refuse', reason: 'authority_absent', authorModel, verifierModel };
  }
  if (validateXVerifyVerifierTierAuthority(authority).length > 0) {
    return { admitted: false, decision: 'refuse', reason: 'authority_malformed', authorModel, verifierModel };
  }
  const match = authority.decisions.find(
    decision => decision.author_model === authorModel && decision.verifier_model === verifierModel,
  ) as XVerifyVerifierTierDecision | undefined;
  if (!match) {
    return { admitted: false, decision: 'refuse', reason: 'pair_not_admitted', authorModel, verifierModel };
  }
  if (match.decision === 'refuse') {
    return { admitted: false, decision: 'refuse', reason: 'owner_refused', authorModel, verifierModel, decisionRef: match.decision_ref };
  }
  return { admitted: true, decision: 'allow', authorModel, verifierModel, decisionRef: match.decision_ref };
}
