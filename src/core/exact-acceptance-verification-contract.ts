/** Pure exact-acceptance contracts. No orchestration, filesystem reads, or authority issuance. */
import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import { z } from 'zod';
import type { Task } from './task-types.js';
import type { ExactAcceptedTaskResultAuthorityMetadata } from './task-settlement-authority.js';
import { parseTaskAttemptCustodyIdentityV2 } from './task-attempt-custody-store.js';
import { acceptanceConfirmationDigest, canonicalAcceptanceConfirmationJson, deriveAcceptanceConfirmationId,
  parseAcceptanceConfirmationLineage, type AcceptanceConfirmationLineage } from './acceptance-confirmation-contract.js';
import { createCrossVerifyAdjudicationContractV2, parseCrossVerifyClaimV2,
  type CrossVerifyClaimV2 } from './cross-verify-adjudication.js';

export const EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH = '__deckent__/acceptance-binding.json';
export const EXACT_ACCEPTANCE_CLAIM_RELATIVE_PATH = '__deckent__/acceptance-claim.json';
export const EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH = '__deckent__/acceptance-manifests.json';

export interface ExactAcceptanceVerificationBindingV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-acceptance-verification-binding-v2';
  readonly confirmationId: string;
  readonly lineage: AcceptanceConfirmationLineage;
  readonly routeClaimDigest: string;
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly effectLandingReceiptDigest: string;
  readonly baselineManifestDigest: string;
  readonly finalManifestDigest: string;
  readonly producerProvider: string;
  readonly semanticClaimDigest: string;
  readonly evidenceDigest: string;
  readonly bindingDigest: string;
}


/** Explicit in-process host capability, NOT a cryptographic receipt or a serializable request authority.
 * Its orchestration producer must freshly read its opaque Store-backed source each time.
 */
export interface ExactAcceptanceEvidenceReadPortV2 {
  readonly read: () => { readonly state: 'ready'; readonly binding: ExactAcceptanceVerificationBindingV2;
    readonly evidence: readonly { readonly relativePath: string; readonly bytes: Uint8Array }[] }
    | { readonly state: 'hold'; readonly reasonCode: string };
}
export interface ExactAcceptanceSemanticRouteInputV2 {
  readonly confirmationId: string;
  readonly claimDigest: string;
}
const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const evidenceId = (path: string): string => `E-${sha(path).slice(0, 48)}`;

/** Descriptor walk prevents getters/proxies/toJSON from being executed at trust boundaries. */
export function isExactAcceptancePlainDataV2(value: unknown, depth = 0, budget = { nodes: 0 }): boolean {
  if (++budget.nodes > 100_000 || depth > 64) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 4 * 1024 * 1024;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || nodeTypes.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== null && prototype !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value) && (value.length > 100_000 || keys.length !== value.length + 1)) return false;
  return keys.every(key => {
    if (Array.isArray(value) && key === 'length') return true;
    if (typeof key !== 'string' || key === 'toJSON') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !!descriptor && descriptor.enumerable && 'value' in descriptor
      && isExactAcceptancePlainDataV2(descriptor.value, depth + 1, budget);
  });
}

function equal(a: unknown, b: unknown): boolean {
  return canonicalAcceptanceConfirmationJson(a) === canonicalAcceptanceConfirmationJson(b);
}

function createBindingSchema() {
const rawDigest = z.string().regex(/^[a-f0-9]{64}$/u);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u)
  .transform((value): `sha256:${string}` => `sha256:${value.slice(7)}`);
const identifier = z.string().min(1).max(200);
const identitySchema = z.object({ schemaVersion: z.literal(2), backend: z.literal('docker'),
  projectRootSha256: rawDigest, projectId: identifier, taskId: identifier,
  attemptId: identifier, generation: z.number().int().safe().nonnegative() }).strict();
const acceptedSchema = z.object({ executionMode: z.literal('normal-docker'), identity: identitySchema,
  admissionReceiptDigest: digest, acceptedResultRef: z.object({ schemaVersion: z.literal(2),
    kind: z.literal('task-accepted-result-v2-ref'), identity: identitySchema,
    artifactKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/u),
    artifactReceiptDigest: digest }).strict(), acceptedResultChainDigest: digest, resultDigest: digest }).strict();
const bindingSchema = z.object({ schemaVersion: z.literal(2),
  kind: z.literal('exact-acceptance-verification-binding-v2'), confirmationId: rawDigest,
  lineage: z.unknown(), routeClaimDigest: rawDigest, acceptedAuthority: acceptedSchema,
  effectLandingReceiptDigest: digest, baselineManifestDigest: digest, finalManifestDigest: digest,
  producerProvider: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u), semanticClaimDigest: digest,
  evidenceDigest: rawDigest, bindingDigest: rawDigest }).strict();
return bindingSchema;
}
let bindingSchema: ReturnType<typeof createBindingSchema> | undefined;

export function parseExactAcceptanceVerificationBindingV2(value: unknown): ExactAcceptanceVerificationBindingV2 | null {
  try {
    if (!isExactAcceptancePlainDataV2(value)) return null;
    const parsed = (bindingSchema ??= createBindingSchema()).safeParse(value);
    if (!parsed.success) return null;
    const lineage = parseAcceptanceConfirmationLineage(parsed.data.lineage);
    if (!lineage.ok) return null;
    const result = { ...parsed.data, lineage: lineage.value };
    const identity = result.acceptedAuthority.identity;
    if (!parseTaskAttemptCustodyIdentityV2(identity)
      || !parseTaskAttemptCustodyIdentityV2(result.acceptedAuthority.acceptedResultRef.identity)) return null;
    const { bindingDigest, ...unsigned } = result;
    if (bindingDigest !== acceptanceConfirmationDigest(unsigned)
      || result.confirmationId !== deriveAcceptanceConfirmationId(lineage.value)
      || !equal(identity, result.acceptedAuthority.acceptedResultRef.identity)
      || lineage.value.projectId !== identity.projectId || lineage.value.taskId !== identity.taskId
      || lineage.value.attemptId !== identity.attemptId || lineage.value.generation !== identity.generation) return null;
    return result;
  } catch { return null; }
}

/** Semantic assertions retain authored polarity; binding and manifest citations are mandatory, not alternatives. */
export function createExactAcceptanceSemanticClaimV2(task: Task, routeClaim: ExactAcceptanceSemanticRouteInputV2): CrossVerifyClaimV2 {
  if (!isExactAcceptancePlainDataV2(task) || !isExactAcceptancePlainDataV2(routeClaim)) throw new TypeError('Invalid exact acceptance claim input');
  const items = task.goNogo.items;
  if (!items?.length) throw new TypeError('Exact acceptance requires authored criteria');
  const finalFiles = task.scope.filesWrite.filter(isExactAcceptanceEvidencePathV2);
  return parseCrossVerifyClaimV2({ schemaVersion: 2, claimId: `claim-${task.id}`,
    summary: `Exact accepted result confirmation ${routeClaim.confirmationId}; route ${routeClaim.claimDigest}`,
    assertions: items.map(item => ({ id: item.id, kind: 'invariant', polarity: item.polarity,
      statement: item.statement, evidenceRequirements: [
        { id: 'exact-binding', statement: 'Verify this assertion against the exact accepted result, confirmation lineage and immutable evidence binding.',
          anyOfEvidenceIds: [evidenceId(EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH)] },
        { id: 'exact-manifests', statement: 'Verify baseline and final descriptors, byte digests, sizes, and the complete admitted effect summary; do not infer preservation from file presence.',
          anyOfEvidenceIds: [evidenceId(EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH)] },
        ...finalFiles.map(path => ({ id: `final-${sha(path).slice(0, 48)}`,
          statement: `Verify the immutable final bytes for ${path}; descriptor hashes alone do not prove semantic content.`,
          anyOfEvidenceIds: [evidenceId(path)] })),
        ...item.evidenceRequirements.map(requirement => {
          let path: string | null = null;
          if (requirement.startsWith('file:')) {
            try { const parsed: unknown = JSON.parse(requirement.slice(5)); if (typeof parsed === 'string') path = parsed; } catch { /* Missing evidence remains undecidable. */ }
          }
          return { id: `R-${sha(canonicalAcceptanceConfirmationJson([item.id, requirement])).slice(0, 48)}`,
            statement: requirement, anyOfEvidenceIds: [evidenceId(path ?? EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH)] };
        }),
      ] })),
  });
}

export function createExactAcceptanceAdjudicationContractV2(
  claim: CrossVerifyClaimV2,
  entries: readonly { readonly relativePath: string; readonly contentSha256: string }[],
) {
  return createCrossVerifyAdjudicationContractV2(claim, { schemaVersion: 2,
    entries: entries.map(entry => ({ evidenceId: evidenceId(entry.relativePath), kind: 'file-snapshot',
      locator: entry.relativePath, contentSha256: `sha256:${entry.contentSha256}` })) });
}

export function digestExactAcceptanceEvidenceV2(entries: readonly {
  readonly relativePath: string; readonly contentSha256: string; readonly byteLength: number;
}[]): string {
  if (!isExactAcceptancePlainDataV2(entries) || entries.length > 128 || new Set(entries.map(entry => entry.relativePath)).size !== entries.length
    || entries.some(entry => !/^[a-f0-9]{64}$/u.test(entry.contentSha256)
      || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0)) throw new TypeError('Invalid exact evidence descriptors');
  return acceptanceConfirmationDigest(entries.filter(entry => entry.relativePath !== EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH)
    .map(entry => ({ relativePath: entry.relativePath, contentSha256: entry.contentSha256, byteLength: entry.byteLength }))
    .sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0));
}


export function isExactAcceptanceEvidencePathV2(path: string): boolean {
  return path.length > 0 && Buffer.byteLength(path) <= 4096 && !path.includes('\\')
    && !/[\u0000-\u001f\u007f:*?]/u.test(path) && !path.startsWith('/')
    && !path.split('/').some(part => !part || part === '.' || part === '..' || part === '__deckent__');
}
