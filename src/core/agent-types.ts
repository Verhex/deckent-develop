// ─── Agent Pool Types ────────────────────────────────────────────────────────
import type { ModelType } from './types.js';
import type { ActivationConfig } from './routing-types.js';
import type { CapabilityVector } from './routing/capability-vector.js';
import { modelRegistry } from './model-registry.js';

// ─── Agent Stats ─────────────────────────────────────────────────────────────

export interface AgentStats {
  totalUses: number;
  successRate: number;  // 0.0-1.0
  avgCoverage: number;  // 0-100
  lastUsedInSprint: string;
}

// ─── Agent Definition ────────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  expertise: string[];
  allowedTools: string[];
  deniedTools: string[];
  preferredModel: ModelType;
  effortMultiplier: number;  // 0.1-3.0
  triggerKeywords: string[];
  triggerScopes: string[];
  triggerFilePatterns: string[];
  persistent: boolean;
  enabled: boolean;
  source: 'builtin' | 'user' | 'learned';
  stats: AgentStats;
  /** Manifest version: 1 (v1 keyword), 2 (v2 activation rules) */
  manifestVersion?: 1 | 2;
  /** V2 activation rules — if present, used instead of triggerKeywords/triggerScopes */
  activation?: ActivationConfig;
  /**
   * Routing-v3 capability vector. Additive field: validated separately by
   * AgentPoolManager._validateAndAttachCapabilities (agent-pool.ts) and dropped with a
   * WARNING rather than rejecting the manifest. Declared here (row 7011 S1) because it is
   * written to disk on every built-in manifest yet was absent from this interface.
   */
  capabilities?: CapabilityVector;
  /**
   * True when `capabilities` was machine-derived by the provisional-v3 migration
   * (cli/commands/sync.ts) instead of authored. Runtime-derived, additive; declared here
   * (row 7011 S1) because it is written to 12 project shadows yet was absent from this
   * interface. Relocating it out of the git-tracked shadow layer is slice S8, not S1.
   */
  capabilitiesProvisional?: boolean;
}

// ─── Agent Pool ──────────────────────────────────────────────────────────────

export type AgentPool = Map<string, AgentDefinition>;

// ─── Agent Selection Result ──────────────────────────────────────────────────

export interface AgentSelectionResult {
  agent: AgentDefinition | null;
  score: number;
  reason: string;
}

// ─── Multi-Agent Pipeline ────────────────────────────────────────────────────

export interface MultiAgentPipelineStep {
  agentId: string;
  phase: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create default agent stats with zeroed counters.
 */
export function createDefaultStats(): AgentStats {
  return {
    totalUses: 0,
    successRate: 0,
    avgCoverage: 0,
    lastUsedInSprint: '',
  };
}

/** Registry-derived standard GA model for synthesized/user agents. */
export function resolveDefaultAgentModel(): ModelType {
  const preferredModel = modelRegistry.getByTier('standard').find((model) => model.status === 'ga');
  if (!preferredModel) throw new Error('E_AGENT_DEFAULT_MODEL_UNAVAILABLE');
  return preferredModel.id as ModelType;
}

/**
 * Create an AgentDefinition with sensible defaults.
 * Requires at minimum `id` and `name`.
 */
export function createAgentDefinition(
  partial: Partial<AgentDefinition> & { id: string; name: string },
): AgentDefinition {
  return {
    description: '',
    systemPrompt: '',
    expertise: [],
    allowedTools: [],
    deniedTools: [],
    preferredModel: resolveDefaultAgentModel(),
    effortMultiplier: 1.0,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: false,
    enabled: true,
    source: 'user',
    stats: createDefaultStats(),
    ...partial,
  };
}

// ─── Agent Catalog Schema & State Model (row 7011 · slice S1) ────────────────
//
// The versioned-manifest schema and the validity / provenance / routability state model
// from follow-up-works/agent-catalog-authority-design-2026-08-11.md (§3.2 identity, §3.3
// versioned schema, §3.4 the four orthogonal facets), landed as TYPES plus exactly one
// pure classification function. Owner decisions (addendum, 2026-08-11) consumed verbatim:
//
//   D2 — the schema version is REQUIRED on write ({@link WritableAgentManifest}), DEFAULTED
//        on read ({@link AGENT_MANIFEST_SCHEMA_VERSION_DEFAULT}), and a version this runtime
//        does not know is a typed `invalid` — never coerced, never silently dropped.
//   D4 — a missing `capabilities` block makes an agent definitively non-routable (an agent
//        without a persona is meaningless). An unresolvable `preferredModel` NEVER blocks
//        routability, so this model does not evaluate it at all: any model can wear a
//        persona, and resolution is a per-run concern. Whether a *present but broken* system
//        prompt is machine-detectable is still an open design question (D4) — it is recorded
//        here as {@link AgentPromptAvailability} `'system-prompt'` + a `prompt-degraded`
//        diagnostic rather than decided by guesswork.
//   D3 — provenance is the OBSERVED layer; the manifest's declared `source` is retained
//        alongside it and a disagreement is a warning, not a rejection.
//
// Deliberately NOT here (that is S2 and later): the resolver, layer precedence, prompt
// resolution, archive namespacing, and every consumer surface. Nothing below reads the
// filesystem, the model registry or the clock — {@link classifyAgentManifest} is a total,
// pure function of its input, and it returns a classification for EVERY input, including an
// unparseable one. That totality is the S1 proof obligation: zero silent skips.
//
// Diagnostic `message` strings are developer-facing, in the same register as
// AgentPoolManager.validateAgentDefinition's errors. The stable contract is the `code`;
// user-facing rendering belongs to slice S5 and goes through getMessage() there.

/** Manifest schema versions this runtime knows how to read. */
export type AgentManifestSchemaVersion = 1 | 2;

/** Version stamped on manifests written by this runtime (D2 — required on write). */
export const AGENT_MANIFEST_SCHEMA_VERSION_CURRENT: AgentManifestSchemaVersion = 2;

/** Version assumed for a legacy manifest that carries no version at all (D2 — defaulted on read). */
export const AGENT_MANIFEST_SCHEMA_VERSION_DEFAULT: AgentManifestSchemaVersion = 1;

/** Every known version, ascending. Anything outside this set is `invalid`, never coerced (D2). */
export const KNOWN_AGENT_MANIFEST_SCHEMA_VERSIONS: readonly AgentManifestSchemaVersion[] = [1, 2];

/**
 * The manifest shape required at WRITE time (D2). Reads tolerate an absent version and
 * default it; writes do not, and this type is how that obligation is enforced at the type
 * level. The on-disk field name stays `manifestVersion` — the design's `schemaVersion` is
 * the concept, and renaming the disk field would migrate every manifest in every project
 * (the Law-2 argument D3 uses to reject its own option (c)), which is not S1 work.
 */
export type WritableAgentManifest = AgentDefinition & { manifestVersion: AgentManifestSchemaVersion };

/**
 * The physical layer a record was OBSERVED in. This is an input to classification, produced
 * by the resolver (S2) — it is never derived here from an id prefix, because D3 requires
 * `temp-` to stop carrying layer semantics.
 */
export type AgentCatalogLayer = 'builtin' | 'project' | 'runtime' | 'archive';

/** Provenance vocabulary rendered by surfaces (§3.4), derived from the observed layer. */
export type AgentProvenanceKind = 'builtin' | 'project' | 'learned' | 'archived';

/** The manifest's own claim about where it came from. */
export type AgentDeclaredSource = AgentDefinition['source'];

/** Schema-conformance facet (§3.4). `warning` still loads; only `invalid` is withheld. */
export type AgentManifestValidity = 'valid' | 'warning' | 'invalid';

/**
 * Diagnostic severity. Maps onto the existing InvalidManifestEntry contract
 * (agent-pool.ts): `invalid` is that type's `'skip'`, `warning` is its `'warning'`, and
 * `info` is a fact worth reporting that changes nothing.
 */
export type AgentDiagnosticSeverity = 'info' | 'warning' | 'invalid';

/** Every diagnostic this model can emit. The code is the stable contract, not the message. */
export const AGENT_MANIFEST_DIAGNOSTIC_CODES = [
  'manifest-unreadable',
  'manifest-not-object',
  'id-missing',
  'id-malformed',
  'id-directory-mismatch',
  'schema-version-unknown',
  'schema-version-defaulted',
  'core-field-invalid',
  'additive-field-invalid',
  'undeclared-field',
  'provenance-disagreement',
  'provenance-declared-absent',
  'prompt-degraded',
] as const;

export type AgentManifestDiagnosticCode = typeof AGENT_MANIFEST_DIAGNOSTIC_CODES[number];

export interface AgentManifestDiagnostic {
  readonly code: AgentManifestDiagnosticCode;
  readonly severity: AgentDiagnosticSeverity;
  /** Developer-facing detail. Never the stable contract — match on `code`. */
  readonly message: string;
  /** Manifest field the diagnostic is about, when it is about one. */
  readonly field?: string;
}

/**
 * Why the router cannot dispatch to this agent right now (§3.4 `routable` + reason).
 * `capabilities-missing` is D4's binding decision. An unresolvable `preferredModel` is
 * deliberately absent from this union — D4 says it never blocks.
 */
export type AgentRoutabilityBlocker =
  | 'manifest-invalid'
  | 'agent-disabled'
  | 'archived'
  | 'capabilities-missing'
  | 'prompt-unresolvable';

export interface AgentRoutabilityState {
  readonly value: boolean;
  readonly reasons: readonly AgentRoutabilityBlocker[];
}

/**
 * How the persona can be obtained at all. `'system-prompt'` is the degraded path
 * (agent-pool.ts getAgentPrompt step 4); `'none'` is machine-detectably unusable.
 */
export type AgentPromptAvailability = 'prompt-file' | 'system-prompt' | 'none';

export interface AgentSchemaVersionState {
  /** The value the manifest actually carried, or null when absent or not a number. */
  readonly declared: number | null;
  /** The version to read the manifest as, or null when it cannot be read as any known version. */
  readonly effective: AgentManifestSchemaVersion | null;
  /** True when `effective` came from the default rather than the manifest (D2). */
  readonly defaulted: boolean;
  /** False when the declared version is one this runtime does not know (D2 → `invalid`). */
  readonly known: boolean;
}

export interface AgentProvenanceState {
  /** The manifest's own `source`, retained verbatim; null when it declared none (D3). */
  readonly declared: AgentDeclaredSource | null;
  /** The layer the record was observed in — authoritative (D3). */
  readonly layer: AgentCatalogLayer;
  /** The word surfaces render (§3.4), derived from `layer`, never from `declared`. */
  readonly kind: AgentProvenanceKind;
  /** The path actually read. */
  readonly resolvedFrom: string;
}

/** A manifest read attempt: either parsed JSON, or a typed failure. Never a silent drop. */
export type AgentManifestReadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

/** One record as observed on disk by the resolver, before any precedence is applied. */
export interface ObservedAgentManifest {
  /** The directory entry the manifest was found under — identity check input (§3.2). */
  readonly directoryName: string;
  /** The manifest path actually read. */
  readonly resolvedFrom: string;
  /** The layer this record was observed in (§3.1). */
  readonly layer: AgentCatalogLayer;
  /** The parsed manifest, or the read/parse failure. */
  readonly manifest: AgentManifestReadResult;
  /** Whether a sibling PROMPT.md exists next to the manifest. */
  readonly hasPromptFile: boolean;
}

export interface AgentManifestClassification {
  /** Stable identity: the declared `id`, falling back to the directory name (§3.2). */
  readonly id: string;
  readonly validity: AgentManifestValidity;
  readonly schemaVersion: AgentSchemaVersionState;
  readonly provenance: AgentProvenanceState;
  /** Owner intent (§3.4). False when the manifest could not be read at all. */
  readonly enabled: boolean;
  readonly routable: AgentRoutabilityState;
  readonly prompt: AgentPromptAvailability;
  /** Every finding, in emission order. Never empty when `validity !== 'valid'`. */
  readonly diagnostics: readonly AgentManifestDiagnostic[];
}

/**
 * Fields whose malformation rejects the whole manifest (§3.3 core → severity `skip`).
 * `activation`'s deep shape is validated by the resolver's zod schema; here only its
 * container type is checked, because S1 does not re-implement the resolver.
 */
export const AGENT_MANIFEST_CORE_FIELDS = [
  'id',
  'name',
  'description',
  'systemPrompt',
  'expertise',
  'allowedTools',
  'deniedTools',
  'preferredModel',
  'effortMultiplier',
  'triggerKeywords',
  'triggerScopes',
  'triggerFilePatterns',
  'persistent',
  'enabled',
  'source',
  'manifestVersion',
  'activation',
] as const;

/** Fields whose malformation is a warning and still loads (§3.3 additive → severity `warning`). */
export const AGENT_MANIFEST_ADDITIVE_FIELDS = [
  'stats',
  'capabilities',
  'capabilitiesProvisional',
] as const;

/** Identity rule from §3.2 — the existing CLI `agent add` validator, now applied on load too. */
const AGENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
const AGENT_ID_MAX_LENGTH = 64;

const STRING_FIELDS = ['name', 'description', 'systemPrompt', 'preferredModel'] as const;
const BOOLEAN_FIELDS = ['persistent', 'enabled'] as const;
const STRING_ARRAY_FIELDS = [
  'expertise',
  'allowedTools',
  'deniedTools',
  'triggerKeywords',
  'triggerScopes',
  'triggerFilePatterns',
] as const;

const DECLARED_MANIFEST_FIELDS: ReadonlySet<string> = new Set<string>([
  ...AGENT_MANIFEST_CORE_FIELDS,
  ...AGENT_MANIFEST_ADDITIVE_FIELDS,
]);

/**
 * Which declared `source` values are consistent with an observed layer (D3).
 * `project` accepts `builtin` because a synced built-in shadow legitimately keeps the
 * built-in's own `source` — treating those as a disagreement would turn every shipped
 * shadow into a false warning. `archive` accepts every value: an archived record preserves
 * the claim it had when it was archived, which is history, not a location claim.
 */
const COMPATIBLE_DECLARED_SOURCES: Record<AgentCatalogLayer, readonly AgentDeclaredSource[]> = {
  builtin: ['builtin'],
  project: ['builtin', 'user'],
  runtime: ['learned', 'user'],
  archive: ['builtin', 'user', 'learned'],
};

const PROVENANCE_KIND_BY_LAYER: Record<AgentCatalogLayer, AgentProvenanceKind> = {
  builtin: 'builtin',
  project: 'project',
  runtime: 'learned',
  archive: 'archived',
};

const VALIDITY_BY_SEVERITY: Record<AgentDiagnosticSeverity, AgentManifestValidity> = {
  info: 'valid',
  warning: 'warning',
  invalid: 'invalid',
};

const VALIDITY_RANK: Record<AgentManifestValidity, number> = { valid: 0, warning: 1, invalid: 2 };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

function readSchemaVersion(
  raw: Record<string, unknown>,
  diagnostics: AgentManifestDiagnostic[],
): AgentSchemaVersionState {
  const declaredRaw = raw['manifestVersion'];
  if (declaredRaw === undefined) {
    diagnostics.push({
      code: 'schema-version-defaulted',
      severity: 'info',
      message: `"manifestVersion" absent — read as ${AGENT_MANIFEST_SCHEMA_VERSION_DEFAULT}`,
      field: 'manifestVersion',
    });
    return {
      declared: null,
      effective: AGENT_MANIFEST_SCHEMA_VERSION_DEFAULT,
      defaulted: true,
      known: true,
    };
  }

  const declared = typeof declaredRaw === 'number' ? declaredRaw : null;
  const known =
    declared !== null &&
    (KNOWN_AGENT_MANIFEST_SCHEMA_VERSIONS as readonly number[]).includes(declared);

  if (!known) {
    diagnostics.push({
      code: 'schema-version-unknown',
      severity: 'invalid',
      message:
        `"manifestVersion" ${JSON.stringify(declaredRaw)} is not a known schema version ` +
        `(${KNOWN_AGENT_MANIFEST_SCHEMA_VERSIONS.join(', ')}) — not coerced`,
      field: 'manifestVersion',
    });
    return { declared, effective: null, defaulted: false, known: false };
  }

  return {
    declared,
    effective: declared as AgentManifestSchemaVersion,
    defaulted: false,
    known: true,
  };
}

function checkFieldShapes(raw: Record<string, unknown>, diagnostics: AgentManifestDiagnostic[]): void {
  for (const field of STRING_FIELDS) {
    if (raw[field] !== undefined && typeof raw[field] !== 'string') {
      diagnostics.push({
        code: 'core-field-invalid',
        severity: 'invalid',
        message: `"${field}" must be a string, got ${describeType(raw[field])}`,
        field,
      });
    }
  }
  if (typeof raw['name'] === 'string' && raw['name'].trim() === '') {
    diagnostics.push({
      code: 'core-field-invalid',
      severity: 'invalid',
      message: '"name" must be a non-empty string',
      field: 'name',
    });
  }

  for (const field of BOOLEAN_FIELDS) {
    if (raw[field] !== undefined && typeof raw[field] !== 'boolean') {
      diagnostics.push({
        code: 'core-field-invalid',
        severity: 'invalid',
        message: `"${field}" must be a boolean, got ${describeType(raw[field])}`,
        field,
      });
    }
  }

  for (const field of STRING_ARRAY_FIELDS) {
    const value = raw[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      diagnostics.push({
        code: 'core-field-invalid',
        severity: 'invalid',
        message: `"${field}" must be an array of strings`,
        field,
      });
    }
  }

  const effort = raw['effortMultiplier'];
  if (effort !== undefined) {
    if (typeof effort !== 'number' || !Number.isFinite(effort)) {
      diagnostics.push({
        code: 'core-field-invalid',
        severity: 'invalid',
        message: `"effortMultiplier" must be a number, got ${describeType(effort)}`,
        field: 'effortMultiplier',
      });
    } else if (effort < 0.1 || effort > 3.0) {
      diagnostics.push({
        code: 'core-field-invalid',
        severity: 'invalid',
        message: '"effortMultiplier" must be between 0.1 and 3.0',
        field: 'effortMultiplier',
      });
    }
  }

  if (raw['activation'] !== undefined && !isPlainObject(raw['activation'])) {
    diagnostics.push({
      code: 'core-field-invalid',
      severity: 'invalid',
      message: `"activation" must be an object, got ${describeType(raw['activation'])}`,
      field: 'activation',
    });
  }

  for (const field of ['stats', 'capabilities'] as const) {
    if (raw[field] !== undefined && !isPlainObject(raw[field])) {
      diagnostics.push({
        code: 'additive-field-invalid',
        severity: 'warning',
        message: `"${field}" must be an object, got ${describeType(raw[field])}`,
        field,
      });
    }
  }
  if (raw['capabilitiesProvisional'] !== undefined && typeof raw['capabilitiesProvisional'] !== 'boolean') {
    diagnostics.push({
      code: 'additive-field-invalid',
      severity: 'warning',
      message: `"capabilitiesProvisional" must be a boolean, got ${describeType(raw['capabilitiesProvisional'])}`,
      field: 'capabilitiesProvisional',
    });
  }

  const undeclared = Object.keys(raw).filter((key) => !DECLARED_MANIFEST_FIELDS.has(key));
  for (const field of undeclared) {
    diagnostics.push({
      code: 'undeclared-field',
      severity: 'warning',
      message: `"${field}" is not a declared manifest field — kept, not rejected`,
      field,
    });
  }
}

function readDeclaredSource(
  raw: Record<string, unknown>,
  layer: AgentCatalogLayer,
  diagnostics: AgentManifestDiagnostic[],
): AgentDeclaredSource | null {
  const value = raw['source'];
  if (value === undefined) {
    diagnostics.push({
      code: 'provenance-declared-absent',
      severity: 'info',
      message: `"source" absent — provenance is the observed layer "${layer}"`,
      field: 'source',
    });
    return null;
  }
  if (value !== 'builtin' && value !== 'user' && value !== 'learned') {
    diagnostics.push({
      code: 'core-field-invalid',
      severity: 'invalid',
      message: `"source" must be one of: builtin, user, learned`,
      field: 'source',
    });
    return null;
  }
  if (!COMPATIBLE_DECLARED_SOURCES[layer].includes(value)) {
    diagnostics.push({
      code: 'provenance-disagreement',
      severity: 'warning',
      message: `declared source "${value}" disagrees with the observed layer "${layer}"`,
      field: 'source',
    });
  }
  return value;
}

/**
 * Classify one observed manifest into the §3.4 state model.
 *
 * Total and pure: every input yields exactly one classification — an unreadable file, a
 * JSON array, a manifest with no `id` — so a caller can never lose a record silently. It
 * performs no I/O and no model-registry lookup, which is also why D4's "an unresolvable
 * `preferredModel` never blocks" is structurally true here rather than merely intended.
 */
export function classifyAgentManifest(observed: ObservedAgentManifest): AgentManifestClassification {
  const { directoryName, resolvedFrom, layer, manifest, hasPromptFile } = observed;
  const diagnostics: AgentManifestDiagnostic[] = [];

  const prompt: AgentPromptAvailability = hasPromptFile
    ? 'prompt-file'
    : manifest.ok && isPlainObject(manifest.value) && typeof manifest.value['systemPrompt'] === 'string'
      && manifest.value['systemPrompt'].trim() !== ''
      ? 'system-prompt'
      : 'none';

  const baseProvenance = {
    layer,
    kind: PROVENANCE_KIND_BY_LAYER[layer],
    resolvedFrom,
  } as const;

  const unreadableState: AgentSchemaVersionState = {
    declared: null,
    effective: null,
    defaulted: false,
    known: false,
  };

  const unreadable = {
    id: directoryName,
    diagnostics,
    schemaVersion: unreadableState,
    provenance: { declared: null, ...baseProvenance },
    // The manifest could not be read, so owner intent is unknown, not "disabled": the
    // conservative `enabled: false` is reported without claiming an `agent-disabled` reason.
    enabled: false,
    intentKnown: false,
    prompt,
    layer,
    hasCapabilities: false,
  };

  if (!manifest.ok) {
    diagnostics.push({
      code: 'manifest-unreadable',
      severity: 'invalid',
      message: manifest.error,
    });
    return finalize(unreadable);
  }

  if (!isPlainObject(manifest.value)) {
    diagnostics.push({
      code: 'manifest-not-object',
      severity: 'invalid',
      message: `manifest must be a non-null object, got ${describeType(manifest.value)}`,
    });
    return finalize(unreadable);
  }

  const raw = manifest.value;

  const declaredId = raw['id'];
  let id = directoryName;
  if (typeof declaredId !== 'string' || declaredId.trim() === '') {
    diagnostics.push({
      code: 'id-missing',
      severity: 'invalid',
      message: `"id" must be a non-empty string — falling back to the directory name "${directoryName}" for reporting only`,
      field: 'id',
    });
  } else {
    id = declaredId;
    if (declaredId.length > AGENT_ID_MAX_LENGTH || !AGENT_ID_PATTERN.test(declaredId)) {
      diagnostics.push({
        code: 'id-malformed',
        severity: 'invalid',
        message: `"id" must match ${AGENT_ID_PATTERN.source} and be at most ${AGENT_ID_MAX_LENGTH} characters`,
        field: 'id',
      });
    } else if (declaredId !== directoryName) {
      // §3.2 / §2.4: archive/test-writer-removed-sprint-148 declares id "test-writer".
      // A warning, not a clean load and not a silent rename.
      diagnostics.push({
        code: 'id-directory-mismatch',
        severity: 'warning',
        message: `"id" is "${declaredId}" but the directory is "${directoryName}"`,
        field: 'id',
      });
    }
  }

  const schemaVersion = readSchemaVersion(raw, diagnostics);
  checkFieldShapes(raw, diagnostics);
  const declaredSource = readDeclaredSource(raw, layer, diagnostics);

  if (prompt === 'system-prompt') {
    diagnostics.push({
      code: 'prompt-degraded',
      severity: 'info',
      message: 'no PROMPT.md — the persona resolves only from the inline systemPrompt',
    });
  }

  const enabled = raw['enabled'] !== false;
  const hasCapabilities = isPlainObject(raw['capabilities']);

  return finalize({
    id,
    diagnostics,
    schemaVersion,
    provenance: { declared: declaredSource, ...baseProvenance },
    enabled,
    intentKnown: true,
    prompt,
    layer,
    hasCapabilities,
  });
}

interface FinalizeInput {
  readonly id: string;
  readonly diagnostics: readonly AgentManifestDiagnostic[];
  readonly schemaVersion: AgentSchemaVersionState;
  readonly provenance: AgentProvenanceState;
  readonly enabled: boolean;
  /** False when the manifest could not be read, so `enabled` is a fallback, not owner intent. */
  readonly intentKnown: boolean;
  readonly prompt: AgentPromptAvailability;
  readonly layer: AgentCatalogLayer;
  readonly hasCapabilities: boolean;
}

function finalize(input: FinalizeInput): AgentManifestClassification {
  const { id, diagnostics, schemaVersion, provenance, enabled, prompt, layer, hasCapabilities } = input;

  let validity: AgentManifestValidity = 'valid';
  for (const diagnostic of diagnostics) {
    const candidate = VALIDITY_BY_SEVERITY[diagnostic.severity];
    if (VALIDITY_RANK[candidate] > VALIDITY_RANK[validity]) validity = candidate;
  }

  // Order is fixed so the reason list is deterministic (§5 R3).
  const reasons: AgentRoutabilityBlocker[] = [];
  if (validity === 'invalid') reasons.push('manifest-invalid');
  if (input.intentKnown && !enabled) reasons.push('agent-disabled');
  if (layer === 'archive') reasons.push('archived');
  if (!hasCapabilities) reasons.push('capabilities-missing');
  if (prompt === 'none') reasons.push('prompt-unresolvable');

  return {
    id,
    validity,
    schemaVersion,
    provenance,
    enabled,
    routable: { value: reasons.length === 0, reasons },
    prompt,
    diagnostics,
  };
}
