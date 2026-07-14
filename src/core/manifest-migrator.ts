// ─── Manifest Migrator ──────────────────────────────────────────────────────
// Converts v1 agent/skill manifests to v2 format with activation rules.
// Runtime in-memory migration — does not write to disk.

import type { AgentDefinition } from './agent-types.js';
import type { SkillDefinition } from './skill-types.js';
import { migrateV1AgentToActivation, migrateV1SkillToActivation } from './activation-engine.js';
import type { DomainDef, Proficiency, WorkType, DeliverableType } from './routing3/types.js';
import { CAPABILITIES_VERSION, type CapabilityVector } from './routing3/capability-vector.js';
import { inferTierFromId } from './model-registry.js';

/**
 * Check if a manifest needs migration to v2.
 */
export function needsMigration(manifest: { manifestVersion?: number }): boolean {
  return !manifest.manifestVersion || manifest.manifestVersion < 2;
}

/**
 * Check if a manifest is already v2.
 */
export function isV2Manifest(manifest: { manifestVersion?: number }): boolean {
  return manifest.manifestVersion === 2;
}

/**
 * Migrate an agent manifest from v1 to v2 (in-memory).
 * Generates activation rules from triggerKeywords/triggerScopes/triggerFilePatterns.
 * Keeps v1 fields intact for backward compatibility.
 */
export function migrateAgentManifest(agent: AgentDefinition): AgentDefinition {
  if (isV2Manifest(agent)) return agent;

  const activation = migrateV1AgentToActivation(
    agent.triggerKeywords,
    agent.triggerScopes,
    agent.triggerFilePatterns,
  );

  return {
    ...agent,
    manifestVersion: 2,
    activation,
  };
}

/**
 * Migrate a skill manifest from v1 to v2 (in-memory).
 * Generates activation rules from triggers/category/stackDetection.
 * Keeps v1 fields intact for backward compatibility.
 */
export function migrateSkillManifest(skill: SkillDefinition): SkillDefinition {
  if (isV2Manifest(skill)) return skill;

  const activation = migrateV1SkillToActivation(
    skill.triggers,
    skill.category,
    skill.stackDetection,
  );

  return {
    ...skill,
    manifestVersion: 2,
    activation,
  };
}

// ─── V2 → V3 migration (agent.json-v3 capabilities — `deckent sync`) ───────────
// Maps a V2 agent manifest (activation.rules keyed on `intent.primary`) to a V3
// CapabilityVector (spec §2b: content/positional/numerical axes). Deterministic,
// never throws on a single bad manifest, collects typed issues, and marks the
// result `provisional` — a migrated manifest is a starting point for review
// (`deckent agent lint` / human), NOT yet a trusted capability contract.

/** One structured, machine-consumable migration problem. Never fatal — a
 *  migration always returns a (possibly minimal) result plus its issue list. */
export interface ManifestMigrationIssue {
  /** Stable machine code: 'invalid-manifest' | 'no-activation' | 'unmapped-intent' | 'unknown-domain' | 'migration-error'. */
  readonly code: string;
  /** Human-readable description of the problem. */
  readonly message: string;
  /** The manifest id this issue belongs to (best-effort; '(unknown)' if unreadable). */
  readonly manifestId: string;
}

/**
 * Result of a V2→V3 manifest migration. `provisional` is ALWAYS `true`: a
 * migrated capability vector is derived from lossy V2 signals and must be
 * reviewed before it is trusted. `provisional` lives on THIS wrapper rather
 * than on `capabilities` because the CapabilityVector schema is `.strict()` —
 * an unrecognized key on the vector itself would fail validation.
 */
export interface V2toV3MigrationResult {
  readonly capabilities: CapabilityVector;
  readonly issues: readonly ManifestMigrationIssue[];
  readonly provisional: true;
}

// Structural view of the V2 fields this migrator reads. Typed `unknown`-first so
// a single malformed manifest never throws (task NO_GO: a migrator that throws on
// one bad manifest). We deliberately do NOT import AgentDefinition/AgentDomain from
// agent-types/agent-pool: the augmented `domain`/`role` fields are read structurally.
interface V2ManifestLike {
  readonly id?: unknown;
  readonly domain?: unknown;
  readonly role?: unknown;
  readonly deniedTools?: unknown;
  readonly expertise?: unknown;
  readonly preferredModel?: unknown;
  readonly activation?: unknown;
}

// Provenance: copied verbatim from src/core/agent-pool.ts `BUILTIN_AGENT_DOMAINS`
// (2026-07-14). Kept as a LOCAL copy because the task forbids importing agent-pool.ts
// from this module. Values are the V2 `AgentDomain` vocabulary
// ('cli'|'react'|'system'|'test'|'doc'|'devops'|'security'|'data').
const BUILTIN_AGENT_DOMAINS_V2: Readonly<Record<string, string>> = {
  architect: 'system',
  'architecture-planner': 'system',
  'bug-fixer': 'system',
  'code-reviewer': 'system',
  refactorer: 'system',
  'api-builder': 'react',
  'frontend-designer': 'react',
  'accessibility-auditor': 'react',
  'doc-writer': 'doc',
  'ci-guardian': 'test',
  'security-auditor': 'security',
  'performance-analyzer': 'system',
  'data-engineer': 'data',
  'devops-engineer': 'devops',
  'migration-specialist': 'system',
};

// V2 `AgentDomain` → routing3 domain-registry id (spec §1b builtin-base ids in
// vocabulary-builtin.ts). 'test' maps to the CI domain (ci-guardian's home);
// there is no dedicated test-domain in routing3 (test is a deliverable/capability).
const AGENT_DOMAIN_TO_ROUTING3: Readonly<Record<string, string>> = {
  cli: 'cli/terminal',
  react: 'frontend',
  system: 'core/runtime',
  test: 'devops/ci',
  doc: 'docs',
  devops: 'devops/ci',
  security: 'security',
  data: 'data',
};

// V2 `intent.primary` → V3 work-types + domains. Provenance: task-445-009 mapping
// table. Domains target the canonical routing3 registry ids (spec §1b) — the task
// wrote 'devops-ci' for devops, but the registry id is 'devops/ci', so we emit the
// registry-valid form (an emitted domain must validate against the vocabulary).
// A `fixed` proficiency overrides the score-derived one (design/architecture add
// build as a fixed secondary regardless of the analyze rule's score).
interface IntentMapping {
  readonly workTypes: readonly { readonly type: WorkType; readonly fixed?: Proficiency }[];
  readonly domains: readonly string[];
}

const INTENT_TO_V3: Readonly<Record<string, IntentMapping>> = {
  implementation: { workTypes: [{ type: 'build' }], domains: [] },
  bugfix: { workTypes: [{ type: 'fix' }], domains: [] },
  refactor: { workTypes: [{ type: 'refactor' }], domains: [] },
  documentation: { workTypes: [{ type: 'document' }], domains: [] },
  migration: { workTypes: [{ type: 'migrate' }], domains: [] },
  config: { workTypes: [{ type: 'configure' }], domains: [] },
  // security is a DOMAIN, not a work-type; the review work-type is injected from
  // the reviewer role below, not from this intent.
  security: { workTypes: [], domains: ['security'] },
  devops: { workTypes: [{ type: 'configure' }], domains: ['devops/ci'] },
  design: { workTypes: [{ type: 'analyze' }, { type: 'build', fixed: 'secondary' }], domains: [] },
  architecture: { workTypes: [{ type: 'analyze' }, { type: 'build', fixed: 'secondary' }], domains: [] },
  // 'performance' has no builtin-base domain — the emitted id is flagged unknown-domain
  // against the vocabulary but kept (provisional).
  performance: { workTypes: [{ type: 'analyze' }], domains: ['performance'] },
};

// Deterministic ordering for the emitted work-type list (spec §1a order).
const WORK_TYPE_ORDER: readonly WorkType[] = [
  'build', 'fix', 'refactor', 'document', 'review', 'configure', 'migrate', 'analyze',
];

// Tools whose denial removes an agent's write authority (spec §2b writeAuthority).
const WRITE_TOOLS: ReadonlySet<string> = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// `never` (from an exclusion) is authoritative — an explicit exclusion outranks any
// positive grant. Among positives: primary > secondary > able.
const PROFICIENCY_RANK: Readonly<Record<Proficiency, number>> = {
  never: 4,
  primary: 3,
  secondary: 2,
  able: 1,
};

/** Map a V2 activation score to a V3 proficiency (task-445-009: 10→primary, 7-9→secondary, 5-6→able). */
function scoreToProficiency(score: number): Proficiency {
  if (score >= 10) return 'primary';
  if (score >= 7) return 'secondary';
  return 'able';
}

/** Merge two proficiencies for the same key, keeping the stronger (never wins). */
function mergeProficiency(map: Map<string, Proficiency>, key: string, incoming: Proficiency): void {
  const existing = map.get(key);
  if (existing === undefined || PROFICIENCY_RANK[incoming] > PROFICIENCY_RANK[existing]) {
    map.set(key, incoming);
  }
}

/** Read `when['intent.primary']` from an activation/exclusion entry (null if absent/malformed). */
function readIntent(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null;
  const when = (entry as { when?: unknown }).when;
  if (!when || typeof when !== 'object') return null;
  const primary = (when as Record<string, unknown>)['intent.primary'];
  return typeof primary === 'string' && primary.length > 0 ? primary : null;
}

/** A CapabilityVector safe to return when a manifest cannot be migrated at all. */
function fallbackCapabilities(): CapabilityVector {
  return {
    capabilitiesVersion: CAPABILITIES_VERSION,
    content: { workTypes: [], expertise: [], personaSlices: [] },
    positional: { domains: [], surfaces: [], writeAuthority: false, role: 'implementer', deliverables: [] },
    numerical: { costTier: 'standard', maxParallel: null },
  };
}

/**
 * Migrate a V2 agent manifest to a V3 `capabilities` vector (spec §2b). Pure and
 * deterministic: the same (manifest, vocabulary) always yields the same result.
 * NEVER throws on a single bad manifest — malformed input is captured as a typed
 * issue and a minimal provisional result is returned instead. `vocabulary` is the
 * resolved (3-layer) domain registry, used to flag emitted domains that no longer
 * exist and to derive positional surfaces from matched domains.
 */
export function migrateManifestV2toV3(
  manifest: unknown,
  vocabulary: readonly DomainDef[],
): V2toV3MigrationResult {
  const issues: ManifestMigrationIssue[] = [];
  const m: V2ManifestLike | null =
    manifest && typeof manifest === 'object' ? (manifest as V2ManifestLike) : null;
  const manifestId = m && typeof m.id === 'string' && m.id.length > 0 ? m.id : '(unknown)';

  if (!m) {
    issues.push({ code: 'invalid-manifest', message: 'manifest is not an object', manifestId });
    return { capabilities: fallbackCapabilities(), issues, provisional: true };
  }

  try {
    const domainById = new Map<string, DomainDef>(vocabulary.map((d) => [d.id, d]));

    // ── writeAuthority + role (spec §2b) ──
    const deniedTools = Array.isArray(m.deniedTools) ? m.deniedTools.filter((t): t is string => typeof t === 'string') : [];
    const writeAuthority = !deniedTools.some((tool) => WRITE_TOOLS.has(tool));
    const role = typeof m.role === 'string' && m.role.length > 0
      ? m.role
      : writeAuthority ? 'implementer' : 'reviewer';

    // ── work-types + domains from activation rules / exclusions ──
    const workTypeProf = new Map<string, Proficiency>();
    const domainProf = new Map<string, Proficiency>();

    const activation = (m.activation && typeof m.activation === 'object') ? (m.activation as { rules?: unknown; exclude?: unknown }) : undefined;
    const rules = Array.isArray(activation?.rules) ? activation!.rules : [];
    const excludes = Array.isArray(activation?.exclude) ? activation!.exclude : [];
    if (rules.length === 0 && excludes.length === 0) {
      issues.push({ code: 'no-activation', message: 'manifest has no v2 activation rules to migrate', manifestId });
    }

    const applyEntry = (entry: unknown, isExclusion: boolean): void => {
      const intent = readIntent(entry);
      if (intent === null) return; // non-intent condition (e.g. domain/scope rule) — skipped
      const mapping = INTENT_TO_V3[intent];
      if (!mapping) {
        issues.push({ code: 'unmapped-intent', message: `no V3 mapping for V2 intent '${intent}'`, manifestId });
        return;
      }
      const score = typeof (entry as { score?: unknown }).score === 'number' ? (entry as { score: number }).score : 0;
      const scoreProf = scoreToProficiency(score);
      for (const wt of mapping.workTypes) {
        const prof: Proficiency = isExclusion ? 'never' : (wt.fixed ?? scoreProf);
        mergeProficiency(workTypeProf, wt.type, prof);
      }
      for (const domainId of mapping.domains) {
        mergeProficiency(domainProf, domainId, isExclusion ? 'never' : scoreProf);
      }
    };

    for (const rule of rules) applyEntry(rule, false);
    for (const exclusion of excludes) applyEntry(exclusion, true);

    // ── reviewer role → review work-type (DoD: security-auditor → review:primary) ──
    // A reviewer/auditor persona's primary work-type IS review; V2 has no 'review'
    // intent, so it is derived from the role rather than an activation rule.
    if (role === 'reviewer') {
      mergeProficiency(workTypeProf, 'review', 'primary');
    }

    // ── agent home domain (spec: from V2 domain field + BUILTIN_AGENT_DOMAINS) ──
    const rawAgentDomain = typeof m.domain === 'string' && m.domain.length > 0
      ? m.domain
      : BUILTIN_AGENT_DOMAINS_V2[manifestId];
    if (rawAgentDomain) {
      const routing3Domain = AGENT_DOMAIN_TO_ROUTING3[rawAgentDomain];
      if (routing3Domain) {
        mergeProficiency(domainProf, routing3Domain, 'primary');
      } else {
        issues.push({ code: 'unknown-domain', message: `V2 agent domain '${rawAgentDomain}' has no routing3 mapping`, manifestId });
      }
    }

    // ── flag emitted domains that are unknown to the vocabulary (kept, provisional) ──
    for (const domainId of domainProf.keys()) {
      if (!domainById.has(domainId)) {
        issues.push({ code: 'unknown-domain', message: `domain '${domainId}' is not in the provided vocabulary`, manifestId });
      }
    }

    // ── assemble deterministic, schema-valid arrays ──
    const workTypes = WORK_TYPE_ORDER
      .filter((type) => workTypeProf.has(type))
      .map((type) => ({ type, proficiency: workTypeProf.get(type)! }));

    const domains = [...domainProf.keys()].sort()
      .map((id) => ({ id, proficiency: domainProf.get(id)! }));

    // surfaces = union of matched-domain surfaces from the vocabulary (deduped, sorted).
    const surfaceSet = new Set<string>();
    for (const { id } of domains) {
      const def = domainById.get(id);
      if (def) for (const s of def.surfaces) surfaceSet.add(s);
    }
    const surfaces = [...surfaceSet].sort();

    // deliverables derived from the (non-excluded) work-types the agent can perform.
    const positiveWorkTypes = new Set(
      workTypes.filter((w) => w.proficiency !== 'never').map((w) => w.type),
    );
    const deliverables: DeliverableType[] = [];
    if (positiveWorkTypes.has('build') || positiveWorkTypes.has('fix') || positiveWorkTypes.has('refactor')) {
      deliverables.push('code-src', 'code-test');
    }
    if (positiveWorkTypes.has('document')) deliverables.push('doc');
    if (positiveWorkTypes.has('configure')) deliverables.push('config');
    if (positiveWorkTypes.has('migrate')) deliverables.push('migration');

    // ── content / numerical ──
    const expertise = Array.isArray(m.expertise) ? m.expertise.filter((e): e is string => typeof e === 'string') : [];
    const preferredModel = typeof m.preferredModel === 'string' && m.preferredModel.length > 0 ? m.preferredModel : undefined;
    const costTier = preferredModel ? inferTierFromId(preferredModel) : 'standard';

    const capabilities: CapabilityVector = {
      capabilitiesVersion: CAPABILITIES_VERSION,
      content: {
        workTypes,
        expertise,
        // V2 manifests carry no guidance-slice inventory — honest empty (provisional gap).
        personaSlices: [],
      },
      positional: {
        domains,
        surfaces,
        writeAuthority,
        role,
        deliverables,
      },
      numerical: {
        ...(preferredModel ? { preferredModel } : {}),
        costTier,
        maxParallel: null,
      },
    };

    return { capabilities, issues, provisional: true };
  } catch (err) {
    issues.push({
      code: 'migration-error',
      message: err instanceof Error ? err.message : String(err),
      manifestId,
    });
    return { capabilities: fallbackCapabilities(), issues, provisional: true };
  }
}
