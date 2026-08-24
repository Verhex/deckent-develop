/**
 * Typed Cross-Verify Claim Adjudication (semantic protocol v2).
 *
 * Provider prose and the terminal `VERDICT:` token are never decision
 * authority here. The provider returns one bounded disposition per authored
 * assertion; the host validates the exact claim/evidence binding and derives
 * the effective verdict from those dispositions.
 *
 * Pure module: no filesystem, provider, process, or user-surface dependencies.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

import { canonicalJson } from './audit-writer.js';
import { createCrossVerifyContractError } from './errors.js';
import { CROSS_VERIFY_ADJUDICATION_REASON_MAX_CHARS } from './cross-verify-response-limits.js';

export { CROSS_VERIFY_ADJUDICATION_REASON_MAX_CHARS } from './cross-verify-response-limits.js';

export const CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION = 2 as const;
export const CROSS_VERIFY_ADJUDICATION_PROTOCOL = 'xverify-adjudication-v2' as const;
const MAX_ASSERTIONS = 64;
const MAX_EVIDENCE_ENTRIES = 128;
const MAX_REQUIREMENTS_PER_ASSERTION = 32;
const MAX_EVIDENCE_ALTERNATIVES = 32;
const MAX_CITATIONS_PER_ASSERTION = 64;

const identifierSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const boundedTextSchema = (max: number) => z.string().trim().min(1).max(max);
const sha256RefSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const verdictSchema = z.enum(['confirmed', 'refuted', 'unclear']);

export type CrossVerifyAdjudicationVerdict = z.infer<typeof verdictSchema>;
export type CrossVerifyAdjudicationExecutionOutcome =
  | 'completed'
  | 'budget-exhausted'
  | 'failed'
  | 'unavailable';

export const crossVerifyEvidenceRequirementV2Schema = z.object({
  id: identifierSchema,
  statement: boundedTextSchema(2_000),
  anyOfEvidenceIds: z.array(identifierSchema)
    .min(1)
    .max(MAX_EVIDENCE_ALTERNATIVES),
}).strict();

export const crossVerifyClaimAssertionV2Schema = z.object({
  id: identifierSchema,
  kind: z.enum(['factual', 'invariant', 'dependency-order']),
  polarity: z.enum(['go', 'no-go']),
  statement: boundedTextSchema(2_000),
  dependsOn: z.array(identifierSchema).max(MAX_ASSERTIONS).optional(),
  evidenceRequirements: z.array(crossVerifyEvidenceRequirementV2Schema)
    .min(1)
    .max(MAX_REQUIREMENTS_PER_ASSERTION),
}).strict();

export const crossVerifyClaimV2Schema = z.object({
  schemaVersion: z.literal(CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION),
  claimId: identifierSchema,
  summary: boundedTextSchema(4_000),
  assertions: z.array(crossVerifyClaimAssertionV2Schema)
    .min(1)
    .max(MAX_ASSERTIONS),
}).strict();

export type CrossVerifyEvidenceRequirementV2 =
  z.infer<typeof crossVerifyEvidenceRequirementV2Schema>;
export type CrossVerifyClaimAssertionV2 =
  z.infer<typeof crossVerifyClaimAssertionV2Schema>;
export type CrossVerifyClaimV2 = z.infer<typeof crossVerifyClaimV2Schema>;

export const crossVerifyEvidenceManifestEntryV2Schema = z.object({
  evidenceId: identifierSchema,
  kind: z.enum(['file-snapshot', 'inline-snapshot', 'receipt']),
  /**
   * Exact host-authored locator. Evidence should be granular enough that the
   * verifier can cite this locator verbatim (for example a bounded line range
   * or an immutable receipt ref), rather than inventing a sub-locator.
   */
  locator: boundedTextSchema(4_096),
  contentSha256: sha256RefSchema,
}).strict();

export const crossVerifyEvidenceManifestV2Schema = z.object({
  schemaVersion: z.literal(CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION),
  entries: z.array(crossVerifyEvidenceManifestEntryV2Schema)
    .min(1)
    .max(MAX_EVIDENCE_ENTRIES),
}).strict();

export type CrossVerifyEvidenceManifestEntryV2 =
  z.infer<typeof crossVerifyEvidenceManifestEntryV2Schema>;
export type CrossVerifyEvidenceManifestV2 =
  z.infer<typeof crossVerifyEvidenceManifestV2Schema>;

export const crossVerifyEvidenceCitationV2Schema = z.object({
  evidenceId: identifierSchema,
  /** Must exactly equal the matching host-authored manifest locator. */
  locator: boundedTextSchema(4_096),
  /** Must exactly equal the matching manifest content digest. */
  evidenceSha256: sha256RefSchema,
}).strict();

const supportedOrContradictedResultSchema = z.object({
  assertionId: identifierSchema,
  status: z.enum(['supported', 'contradicted']),
  citations: z.array(crossVerifyEvidenceCitationV2Schema)
    .min(1)
    .max(MAX_CITATIONS_PER_ASSERTION),
  reason: boundedTextSchema(CROSS_VERIFY_ADJUDICATION_REASON_MAX_CHARS),
}).strict();

const undecidableResultSchema = z.object({
  assertionId: identifierSchema,
  status: z.literal('undecidable'),
  citations: z.array(crossVerifyEvidenceCitationV2Schema)
    .max(MAX_CITATIONS_PER_ASSERTION),
  missingRequirementIds: z.array(identifierSchema)
    .min(1)
    .max(MAX_REQUIREMENTS_PER_ASSERTION),
  reason: boundedTextSchema(CROSS_VERIFY_ADJUDICATION_REASON_MAX_CHARS),
}).strict();

export const crossVerifyAssertionResultV2Schema = z.discriminatedUnion('status', [
  supportedOrContradictedResultSchema,
  undecidableResultSchema,
]);

/**
 * Deliberately contains no top-level `verdict`: accepting one would return
 * decision authority to provider prose. The terminal token is supplied to the
 * host derivation function only as an integrity assertion.
 */
export const crossVerifyAdjudicationResponseV2Schema = z.object({
  schemaVersion: z.literal(CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION),
  protocol: z.literal(CROSS_VERIFY_ADJUDICATION_PROTOCOL),
  claimDigest: sha256RefSchema,
  evidenceManifestDigest: sha256RefSchema,
  assertionResults: z.array(crossVerifyAssertionResultV2Schema)
    .min(1)
    .max(MAX_ASSERTIONS),
}).strict();

export type CrossVerifyEvidenceCitationV2 =
  z.infer<typeof crossVerifyEvidenceCitationV2Schema>;
export type CrossVerifyAssertionResultV2 =
  z.infer<typeof crossVerifyAssertionResultV2Schema>;
export type CrossVerifyAdjudicationResponseV2 =
  z.infer<typeof crossVerifyAdjudicationResponseV2Schema>;

export interface CrossVerifyAdjudicationContractV2 {
  readonly schemaVersion: typeof CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION;
  readonly protocol: typeof CROSS_VERIFY_ADJUDICATION_PROTOCOL;
  readonly claim: Readonly<CrossVerifyClaimV2>;
  readonly claimDigest: string;
  readonly evidenceManifest: Readonly<CrossVerifyEvidenceManifestV2>;
  readonly evidenceManifestDigest: string;
}

export const crossVerifyAdjudicationContractV2Schema = z.object({
  schemaVersion: z.literal(CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION),
  protocol: z.literal(CROSS_VERIFY_ADJUDICATION_PROTOCOL),
  claim: crossVerifyClaimV2Schema,
  claimDigest: sha256RefSchema,
  evidenceManifest: crossVerifyEvidenceManifestV2Schema,
  evidenceManifestDigest: sha256RefSchema,
}).strict();

export type CrossVerifyHostAdjudicationReasonCodeV2 =
  | 'confirmed-all-criteria-satisfied'
  | 'refuted-authored-criterion-triggered'
  | 'unclear-authored-criterion-undecidable'
  | 'contract-invalid'
  | 'response-invalid'
  | 'digest-mismatch'
  | 'execution-incomplete'
  | 'assertion-coverage-invalid'
  | 'citation-invalid'
  | 'evidence-requirements-unsatisfied'
  | 'provider-verdict-mismatch';

export interface CrossVerifyHostAdjudicationV2 {
  readonly schemaVersion: typeof CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION;
  readonly protocol: typeof CROSS_VERIFY_ADJUDICATION_PROTOCOL;
  readonly verdict: CrossVerifyAdjudicationVerdict;
  readonly disposition: 'accepted' | 'fail-closed';
  readonly reasonCode: CrossVerifyHostAdjudicationReasonCodeV2;
  readonly reason: string;
  readonly providerDeclaredVerdict: CrossVerifyAdjudicationVerdict;
  readonly claimDigest?: string;
  readonly evidenceManifestDigest?: string;
  readonly assertionResults?: readonly CrossVerifyAssertionResultV2[];
}

export interface DeriveCrossVerifyAdjudicationV2Input {
  readonly contract: unknown;
  readonly response: unknown;
  /** Host parser diagnostic retained when strict framing/schema parsing failed. */
  readonly responseParseError?: string;
  readonly executionOutcome: CrossVerifyAdjudicationExecutionOutcome;
  /**
   * Parsed from the terminal `VERDICT:` token. It must agree with the
   * host-derived result, but it never selects or overrides that result.
   */
  readonly providerDeclaredVerdict: unknown;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function contractError(message: string): never {
  throw createCrossVerifyContractError(message);
}

function parseStrict<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return contractError(`${label} rejected: ${detail}`);
  }
  // All schemas in this module are JSON-only. Round-tripping removes explicit
  // `undefined` on optional fields, so semantically identical API objects and
  // persisted JSON bytes receive the same canonical digest.
  return JSON.parse(JSON.stringify(parsed.data)) as T;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    contractError(`${label} contains duplicate identifiers`);
  }
}

function assertClaimSemantics(claim: CrossVerifyClaimV2): void {
  const assertionIds = claim.assertions.map(assertion => assertion.id);
  assertUnique(assertionIds, 'xverify v2 claim assertions');
  const knownAssertions = new Set(assertionIds);

  for (const assertion of claim.assertions) {
    const dependencies = assertion.dependsOn ?? [];
    assertUnique(dependencies, `xverify v2 assertion ${assertion.id} dependencies`);
    if (dependencies.includes(assertion.id)) {
      contractError(`xverify v2 assertion ${assertion.id} depends on itself`);
    }
    for (const dependency of dependencies) {
      if (!knownAssertions.has(dependency)) {
        contractError(
          `xverify v2 assertion ${assertion.id} has unknown dependency ${dependency}`,
        );
      }
    }

    const requirementIds = assertion.evidenceRequirements.map(requirement => requirement.id);
    assertUnique(requirementIds, `xverify v2 assertion ${assertion.id} requirements`);
    for (const requirement of assertion.evidenceRequirements) {
      assertUnique(
        requirement.anyOfEvidenceIds,
        `xverify v2 assertion ${assertion.id} requirement ${requirement.id}`,
      );
    }
  }

  const state = new Map<string, 'visiting' | 'visited'>();
  const byId = new Map(claim.assertions.map(assertion => [assertion.id, assertion]));
  const visit = (assertionId: string): void => {
    const current = state.get(assertionId);
    if (current === 'visiting') {
      contractError(`xverify v2 assertion dependency cycle includes ${assertionId}`);
    }
    if (current === 'visited') return;
    state.set(assertionId, 'visiting');
    for (const dependency of byId.get(assertionId)?.dependsOn ?? []) visit(dependency);
    state.set(assertionId, 'visited');
  };
  for (const assertionId of assertionIds) visit(assertionId);
}

function assertManifestSemantics(manifest: CrossVerifyEvidenceManifestV2): void {
  assertUnique(
    manifest.entries.map(entry => entry.evidenceId),
    'xverify v2 evidence manifest',
  );
}

function assertContractSemantics(
  claim: CrossVerifyClaimV2,
  manifest: CrossVerifyEvidenceManifestV2,
): void {
  const evidenceIds = new Set(manifest.entries.map(entry => entry.evidenceId));
  for (const assertion of claim.assertions) {
    for (const requirement of assertion.evidenceRequirements) {
      for (const evidenceId of requirement.anyOfEvidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          contractError(
            `xverify v2 assertion ${assertion.id} requirement ${requirement.id} `
              + `references unknown evidence ${evidenceId}`,
          );
        }
      }
    }
  }
}

function assertResponseSemantics(response: CrossVerifyAdjudicationResponseV2): void {
  assertUnique(
    response.assertionResults.map(result => result.assertionId),
    'xverify v2 response assertion results',
  );
  for (const result of response.assertionResults) {
    assertUnique(
      result.citations.map(
        citation => `${citation.evidenceId}\u0000${citation.locator}\u0000${citation.evidenceSha256}`,
      ),
      `xverify v2 assertion result ${result.assertionId} citations`,
    );
    if (result.status === 'undecidable') {
      assertUnique(
        result.missingRequirementIds,
        `xverify v2 assertion result ${result.assertionId} missing requirements`,
      );
    }
  }
}

export function parseCrossVerifyClaimV2(value: unknown): Readonly<CrossVerifyClaimV2> {
  const claim = parseStrict(crossVerifyClaimV2Schema, value, 'xverify v2 claim');
  assertClaimSemantics(claim);
  return deepFreeze(claim);
}

export function parseCrossVerifyEvidenceManifestV2(
  value: unknown,
): Readonly<CrossVerifyEvidenceManifestV2> {
  const manifest = parseStrict(
    crossVerifyEvidenceManifestV2Schema,
    value,
    'xverify v2 evidence manifest',
  );
  assertManifestSemantics(manifest);
  return deepFreeze(manifest);
}

/**
 * Parse-boundary alias for the citation digest ONLY: the evidence manifest names
 * the digest `contentSha256`, so a verifier naturally copies that key into a
 * citation. Rewrite it to the canonical `evidenceSha256` before strict validation
 * so the canonical field is the only one the schema (and thus the receipt/output)
 * ever carries. If a citation supplies BOTH keys they MUST match; a conflicting
 * pair is left untouched so `.strict()` fails closed. Any non-citation shape is
 * returned verbatim for the schema to reject.
 */
function normalizeCitationDigestAlias(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  const results = root['assertionResults'];
  if (!Array.isArray(results)) return value;
  return {
    ...root,
    assertionResults: results.map((result) => {
      if (result === null || typeof result !== 'object' || Array.isArray(result)) return result;
      const citations = (result as Record<string, unknown>)['citations'];
      if (!Array.isArray(citations)) return result;
      return {
        ...(result as Record<string, unknown>),
        citations: citations.map((citation) => {
          if (citation === null || typeof citation !== 'object' || Array.isArray(citation)) return citation;
          const record = citation as Record<string, unknown>;
          if (!('contentSha256' in record)) return citation;
          const { contentSha256, ...rest } = record;
          const canonical = rest['evidenceSha256'];
          if (canonical !== undefined && canonical !== contentSha256) return citation;
          return { ...rest, evidenceSha256: canonical ?? contentSha256 };
        }),
      };
    }),
  };
}

export function parseCrossVerifyAdjudicationResponseV2(
  value: unknown,
): Readonly<CrossVerifyAdjudicationResponseV2> {
  const response = parseStrict(
    crossVerifyAdjudicationResponseV2Schema,
    normalizeCitationDigestAlias(value),
    'xverify v2 adjudication response',
  );
  assertResponseSemantics(response);
  return deepFreeze(response);
}

function digestCanonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function digestCrossVerifyClaimV2(value: unknown): string {
  return digestCanonical(parseCrossVerifyClaimV2(value));
}

export function digestCrossVerifyEvidenceManifestV2(value: unknown): string {
  return digestCanonical(parseCrossVerifyEvidenceManifestV2(value));
}

export function createCrossVerifyAdjudicationContractV2(
  claimInput: unknown,
  evidenceManifestInput: unknown,
): Readonly<CrossVerifyAdjudicationContractV2> {
  const claim = parseCrossVerifyClaimV2(claimInput);
  const evidenceManifest = parseCrossVerifyEvidenceManifestV2(evidenceManifestInput);
  assertContractSemantics(claim, evidenceManifest);
  return deepFreeze({
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    protocol: CROSS_VERIFY_ADJUDICATION_PROTOCOL,
    claim,
    claimDigest: digestCanonical(claim),
    evidenceManifest,
    evidenceManifestDigest: digestCanonical(evidenceManifest),
  });
}

export function parseCrossVerifyAdjudicationContractV2(
  value: unknown,
): Readonly<CrossVerifyAdjudicationContractV2> {
  const contract = parseStrict(
    crossVerifyAdjudicationContractV2Schema,
    value,
    'xverify v2 adjudication contract',
  );
  assertClaimSemantics(contract.claim);
  assertManifestSemantics(contract.evidenceManifest);
  assertContractSemantics(contract.claim, contract.evidenceManifest);
  if (contract.claimDigest !== digestCanonical(contract.claim)
    || contract.evidenceManifestDigest !== digestCanonical(contract.evidenceManifest)) {
    contractError('xverify v2 adjudication contract digest mismatch');
  }
  // Zod has already performed the exact runtime proof above. The explicit
  // cast keeps this boundary stable even for consumers that compile without
  // `strictNullChecks`, where Zod's inferred object fields appear optional.
  return deepFreeze(contract) as Readonly<CrossVerifyAdjudicationContractV2>;
}

/**
 * Canonical provider-bound JSON. The prompt builder should embed these exact
 * bytes and the execution contract should bind their digest.
 */
export function canonicalCrossVerifyAdjudicationContractV2(value: unknown): string {
  return canonicalJson(parseCrossVerifyAdjudicationContractV2(value));
}

export function digestCrossVerifyAdjudicationContractV2(value: unknown): string {
  return digestCanonical(parseCrossVerifyAdjudicationContractV2(value));
}

function failClosed(
  providerDeclaredVerdict: CrossVerifyAdjudicationVerdict,
  reasonCode: Exclude<
    CrossVerifyHostAdjudicationReasonCodeV2,
    | 'confirmed-all-criteria-satisfied'
    | 'refuted-authored-criterion-triggered'
    | 'unclear-authored-criterion-undecidable'
  >,
  reason: string,
  contract?: Readonly<CrossVerifyAdjudicationContractV2>,
  response?: Readonly<CrossVerifyAdjudicationResponseV2>,
): Readonly<CrossVerifyHostAdjudicationV2> {
  return deepFreeze({
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    protocol: CROSS_VERIFY_ADJUDICATION_PROTOCOL,
    verdict: 'unclear',
    disposition: 'fail-closed',
    reasonCode,
    reason,
    providerDeclaredVerdict,
    ...(contract
      ? {
          claimDigest: contract.claimDigest,
          evidenceManifestDigest: contract.evidenceManifestDigest,
        }
      : {}),
    ...(response ? { assertionResults: response.assertionResults } : {}),
  });
}

/**
 * Validate a typed verifier response and derive the only verdict consumers may
 * act on. This function never throws: malformed or incomplete evidence becomes
 * terminal `unclear/fail-closed`, never a silent confirmation.
 */
export function deriveCrossVerifyAdjudicationV2(
  input: DeriveCrossVerifyAdjudicationV2Input,
): Readonly<CrossVerifyHostAdjudicationV2> {
  const declared = verdictSchema.safeParse(input.providerDeclaredVerdict);
  const providerDeclaredVerdict: CrossVerifyAdjudicationVerdict =
    declared.success ? declared.data : 'unclear';
  if (!declared.success) {
    return failClosed(
      providerDeclaredVerdict,
      'provider-verdict-mismatch',
      'provider terminal verdict is not a supported xverify verdict',
    );
  }

  let contract: Readonly<CrossVerifyAdjudicationContractV2>;
  try {
    contract = parseCrossVerifyAdjudicationContractV2(input.contract);
  } catch (error) {
    return failClosed(
      providerDeclaredVerdict,
      'contract-invalid',
      error instanceof Error ? error.message : String(error),
    );
  }

  let response: Readonly<CrossVerifyAdjudicationResponseV2>;
  if (input.responseParseError?.trim()) {
    return failClosed(
      providerDeclaredVerdict,
      'response-invalid',
      input.responseParseError,
      contract,
    );
  }
  try {
    response = parseCrossVerifyAdjudicationResponseV2(input.response);
  } catch (error) {
    return failClosed(
      providerDeclaredVerdict,
      'response-invalid',
      error instanceof Error ? error.message : String(error),
      contract,
    );
  }

  if (response.claimDigest !== contract.claimDigest
    || response.evidenceManifestDigest !== contract.evidenceManifestDigest) {
    return failClosed(
      providerDeclaredVerdict,
      'digest-mismatch',
      'verifier response is not bound to the exact claim and evidence manifest',
      contract,
      response,
    );
  }

  if (input.executionOutcome !== 'completed') {
    return failClosed(
      providerDeclaredVerdict,
      'execution-incomplete',
      `verifier execution did not complete (${input.executionOutcome})`,
      contract,
      response,
    );
  }

  const assertionById = new Map(
    contract.claim.assertions.map(assertion => [assertion.id, assertion]),
  );
  const resultById = new Map(
    response.assertionResults.map(result => [result.assertionId, result]),
  );
  if (resultById.size !== assertionById.size
    || [...resultById.keys()].some(assertionId => !assertionById.has(assertionId))
    || [...assertionById.keys()].some(assertionId => !resultById.has(assertionId))) {
    return failClosed(
      providerDeclaredVerdict,
      'assertion-coverage-invalid',
      'verifier response must cover every authored assertion exactly once and no others',
      contract,
      response,
    );
  }

  const evidenceById = new Map(
    contract.evidenceManifest.entries.map(entry => [entry.evidenceId, entry]),
  );

  for (const result of response.assertionResults) {
    const assertion = assertionById.get(result.assertionId)!;
    const allowedEvidenceIds = new Set(
      assertion.evidenceRequirements.flatMap(requirement => requirement.anyOfEvidenceIds),
    );
    const citedEvidenceIds = new Set<string>();

    for (const citation of result.citations) {
      const evidence = evidenceById.get(citation.evidenceId);
      if (!evidence
        || !allowedEvidenceIds.has(citation.evidenceId)
        || citation.locator !== evidence.locator
        || citation.evidenceSha256 !== evidence.contentSha256) {
        return failClosed(
          providerDeclaredVerdict,
          'citation-invalid',
          `assertion ${result.assertionId} contains a citation outside exact host evidence`,
          contract,
          response,
        );
      }
      citedEvidenceIds.add(citation.evidenceId);
    }

    const unsatisfiedRequirements = assertion.evidenceRequirements
      .filter(requirement =>
        !requirement.anyOfEvidenceIds.some(evidenceId => citedEvidenceIds.has(evidenceId)))
      .map(requirement => requirement.id);

    if (result.status === 'supported' && unsatisfiedRequirements.length > 0) {
      return failClosed(
        providerDeclaredVerdict,
        'evidence-requirements-unsatisfied',
        `supported assertion ${result.assertionId} lacks required evidence coverage`,
        contract,
        response,
      );
    }
    if (result.status === 'undecidable') {
      const reportedMissing = [...result.missingRequirementIds].sort();
      const actualMissing = [...unsatisfiedRequirements].sort();
      if (reportedMissing.length !== actualMissing.length
        || reportedMissing.some((requirementId, index) =>
          requirementId !== actualMissing[index])) {
        return failClosed(
          providerDeclaredVerdict,
          'evidence-requirements-unsatisfied',
          `undecidable assertion ${result.assertionId} has an inaccurate missing-evidence map`,
          contract,
          response,
        );
      }
    }
  }

  const resultInvalidates = (result: CrossVerifyAssertionResultV2): boolean => {
    const assertion = assertionById.get(result.assertionId)!;
    return assertion.polarity === 'go'
      ? result.status === 'contradicted'
      : result.status === 'supported';
  };
  const resultSatisfies = (result: CrossVerifyAssertionResultV2): boolean => {
    const assertion = assertionById.get(result.assertionId)!;
    return assertion.polarity === 'go'
      ? result.status === 'supported'
      : result.status === 'contradicted';
  };
  const hostVerdict: CrossVerifyAdjudicationVerdict =
    response.assertionResults.some(resultInvalidates)
      ? 'refuted'
      : response.assertionResults.every(resultSatisfies)
        ? 'confirmed'
        : 'unclear';

  if (providerDeclaredVerdict !== hostVerdict) {
    return failClosed(
      providerDeclaredVerdict,
      'provider-verdict-mismatch',
      `provider terminal verdict ${providerDeclaredVerdict} disagrees with host-derived ${hostVerdict}`,
      contract,
      response,
    );
  }

  const reasonCode: CrossVerifyHostAdjudicationReasonCodeV2 =
    hostVerdict === 'confirmed'
      ? 'confirmed-all-criteria-satisfied'
      : hostVerdict === 'refuted'
        ? 'refuted-authored-criterion-triggered'
        : 'unclear-authored-criterion-undecidable';
  const reason =
    hostVerdict === 'confirmed'
      ? 'every authored GO criterion is supported and every NO-GO criterion is contradicted'
      : hostVerdict === 'refuted'
        ? 'host-bound evidence contradicts a GO criterion or supports a NO-GO criterion'
        : 'at least one authored assertion remains undecidable from host-bound evidence';

  return deepFreeze({
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    protocol: CROSS_VERIFY_ADJUDICATION_PROTOCOL,
    verdict: hostVerdict,
    disposition: 'accepted',
    reasonCode,
    reason,
    providerDeclaredVerdict,
    claimDigest: contract.claimDigest,
    evidenceManifestDigest: contract.evidenceManifestDigest,
    assertionResults: response.assertionResults,
  });
}
