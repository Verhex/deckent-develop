import { SKILL_PROFILE_VERSION, validateSkillProfile } from './routing/capability-vector.js';
import type { DeliverableType, SkillProfile, WorkTypeEntry } from './routing/capability-vector.js';
import type {
  SkillDefinition,
  SkillProfileDerivation,
  SkillProfileFieldProvenance,
  SkillProfileSourceField,
} from './skill-types.js';
import { BUILTIN_DOMAINS } from './routing/vocabulary-builtin.js';

export const SKILL_PROFILE_DERIVATION_VERSION = 2 as const;

type WorkType = WorkTypeEntry['type'];
type Proficiency = WorkTypeEntry['proficiency'];
const PROVENANCE_NOTE = 'canonical-profile-derived-from-manifest-source-metadata' as const;

/**
 * Words that carry no feature-domain meaning. Keep this as the single source
 * for domain-token filtering so prose, names, and manifest tags cannot drift
 * into separate notions of "generic".
 */
const GENERIC_DOMAIN_TERMS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with',
  'build', 'configure', 'create', 'develop', 'development', 'document', 'fix',
  'implement', 'implementation', 'migrate', 'refactor', 'review', 'analyze',
  'domain', 'framework', 'language', 'tool', 'workflow',
  'capability', 'expert', 'expertise', 'general', 'generic', 'skill', 'specialist',
]);

const WORK_TYPE_CUES: Readonly<Record<WorkType, readonly string[]>> = {
  build: ['build', 'create', 'design', 'develop', 'implement', 'code', 'component', 'api'],
  fix: ['fix', 'debug', 'repair', 'resolve', 'error', 'bug', 'vulnerability'],
  refactor: ['refactor', 'simplify', 'cleanup', 'optimize', 'performance', 'architecture'],
  document: ['document', 'documentation', 'docs', 'readme', 'guide', 'tutorial', 'writing'],
  review: ['review', 'audit', 'assess', 'security', 'accessibility', 'compliance', 'quality'],
  configure: ['configure', 'config', 'setup', 'pipeline', 'ci', 'deploy', 'infrastructure'],
  migrate: ['migrate', 'migration', 'upgrade', 'codemod', 'schema', 'compatibility'],
  analyze: ['analyze', 'analysis', 'profile', 'diagnose', 'observability', 'measure'],
};

const CATEGORY_DEFAULTS: Readonly<Record<SkillDefinition['category'], readonly WorkType[]>> = {
  language: ['build', 'fix', 'review'],
  framework: ['build', 'fix', 'configure'],
  tool: ['configure', 'build', 'analyze'],
  domain: ['build', 'analyze', 'review'],
  workflow: ['configure', 'analyze', 'build'],
};

const DELIVERABLE_BY_WORK_TYPE: Readonly<Record<WorkType, readonly DeliverableType[]>> = {
  build: ['code-src', 'code-test'],
  fix: ['code-src', 'code-test'],
  refactor: ['code-src', 'code-test'],
  document: ['doc'],
  review: ['doc'],
  configure: ['config', 'workflow'],
  migrate: ['migration', 'manifest'],
  analyze: ['doc'],
};

function normalized(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

function metadataTerms(skill: SkillDefinition): string[] {
  return normalized([
    skill.category,
    skill.description ?? '',
    ...skill.triggers,
    ...skill.stackDetection.files,
    ...skill.stackDetection.dependencies,
    ...skill.stackDetection.commands,
    ...skill.composableWith,
  ]);
}

function deriveWorkTypes(skill: SkillDefinition, terms: readonly string[]): WorkTypeEntry[] {
  const haystack = terms.join(' ');
  const matched = (Object.entries(WORK_TYPE_CUES) as [WorkType, readonly string[]][])
    .filter(([, cues]) => cues.some((cue) => haystack.includes(cue)))
    .map(([type]) => type);
  const ordered = [...new Set([...matched, ...CATEGORY_DEFAULTS[skill.category]])];
  const proficiency: readonly Proficiency[] = skill.priority >= 5
    ? ['primary', 'secondary', 'able']
    : ['secondary', 'able', 'able'];
  return ordered.slice(0, 3).map((type, index) => ({
    type,
    proficiency: proficiency[index] ?? 'able',
  }));
}

function deriveDomains(skill: SkillDefinition): SkillProfile['domains'] {
  const singularRoot = (term: string): string => {
    if (term.endsWith('ies') && term.length > 4) return `${term.slice(0, -3)}y`;
    if (term.endsWith('s') && !term.endsWith('ss') && term.length > 3) {
      return term.slice(0, -1);
    }
    return term;
  };
  const roots = (value: string): string[] => value
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .map(singularRoot)
    .filter((term) => term.length > 1 && !GENERIC_DOMAIN_TERMS.has(term));

  // Domain authority is intentionally limited to human-authored semantic
  // metadata: name, description, and manifest tags (`triggers`). File names,
  // dependencies, commands, category defaults, and composition hints are not
  // feature domains and were the source of v1 garbage-domain leakage.
  const signals = new Set([
    ...roots(skill.name),
    ...roots(skill.description ?? ''),
    ...skill.triggers.flatMap(roots),
  ]);
  const vocabularyRoots = (values: readonly string[]): Set<string> =>
    new Set(values.flatMap(roots));
  const matched = BUILTIN_DOMAINS.filter((domain) =>
    [...vocabularyRoots([domain.id, ...domain.aliases, ...domain.stackMarkers, ...domain.surfaces])]
      .some((root) => signals.has(root)),
  ).map((domain) => domain.id);

  const domains: SkillProfile['domains'] = matched.map((id, index) => ({
    id,
    proficiency: index === 0 ? 'primary' : 'secondary',
  }));

  // Language expertise is intentionally cross-cutting. Its wildcard is an
  // explicit, narrow derivation policy and is always the lowest proficiency;
  // no other generic category receives one.
  if (skill.category === 'language') domains.push({ id: '*', proficiency: 'able' });
  return domains;
}

function fieldProvenance(
  sourceFields: readonly SkillProfileSourceField[],
): { sourceFields: readonly SkillProfileSourceField[]; note: typeof PROVENANCE_NOTE } {
  return { sourceFields, note: PROVENANCE_NOTE };
}

function provenance(): SkillProfileFieldProvenance {
  return {
    derivationVersion: SKILL_PROFILE_DERIVATION_VERSION,
    fields: {
      workTypes: fieldProvenance(['category', 'triggers', 'stackDetection', 'composableWith', 'priority', 'description']),
      domains: fieldProvenance(['triggers', 'description']),
      expertise: fieldProvenance(['category', 'triggers', 'stackDetection', 'composableWith', 'description']),
      deliverables: fieldProvenance(['category', 'triggers', 'stackDetection', 'composableWith', 'priority', 'description']),
    },
  };
}

/**
 * Produce a canonical V3 profile without consulting the skill id. Legacy
 * `activation` is deliberately not read: it remains migration input, never
 * routability authority.
 */
export function deriveCanonicalSkillProfile(skill: SkillDefinition): SkillProfileDerivation {
  const persistedGenerated = skill.profileProvenance?.origin === 'derived-profile';
  const stalePersistedGenerated = persistedGenerated
    && skill.profileProvenance?.derivationVersion !== SKILL_PROFILE_DERIVATION_VERSION;
  if (skill.profile !== undefined && skill.profile !== null && !stalePersistedGenerated) {
    const authored = validateSkillProfile(skill.profile);
    if (authored.ok) {
      return {
        status: 'routable',
        origin: persistedGenerated ? 'derived-profile' : 'manifest-profile',
        profile: authored.value,
        provenance: persistedGenerated ? provenance() : null,
      };
    }
    return {
      status: 'unroutable',
      origin: 'manifest-profile',
      profile: null,
      diagnostic: {
        disposition: 'HOLD',
        reasonCode: 'invalid-manifest-profile',
        message: 'authored manifest profile failed canonical V3 validation',
        issues: authored.issues,
      },
    };
  }

  const terms = metadataTerms(skill);
  // A raw manifest may omit description entirely (undefined) — that is the
  // same insufficient-metadata class as an empty one, never a crash.
  if ((skill.description ?? '').trim() === '' || terms.length === 0) {
    return {
      status: 'unroutable',
      origin: 'derived-profile',
      profile: null,
      diagnostic: {
        disposition: 'HOLD',
        reasonCode: 'insufficient-source-metadata',
        message: 'canonical V3 profile requires a non-empty description and routing metadata',
        issues: [],
      },
    };
  }

  const workTypes = deriveWorkTypes(skill, terms);
  const candidate: SkillProfile = {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes,
    domains: deriveDomains(skill),
    expertise: terms,
    deliverables: normalized(
      workTypes.flatMap(({ type }) => DELIVERABLE_BY_WORK_TYPE[type]),
    ) as DeliverableType[],
  };
  const validation = validateSkillProfile(candidate);
  if (!validation.ok) {
    return {
      status: 'unroutable',
      origin: 'derived-profile',
      profile: null,
      diagnostic: {
        disposition: 'HOLD',
        reasonCode: 'derived-profile-invalid',
        message: 'derived profile failed canonical V3 validation',
        issues: validation.issues,
      },
    };
  }
  return {
    status: 'routable', origin: 'derived-profile', profile: validation.value, provenance: provenance(),
  };
}
