import { SKILL_PROFILE_VERSION, validateSkillProfile } from './routing/capability-vector.js';
import type { DeliverableType, SkillProfile, WorkTypeEntry } from './routing/capability-vector.js';
import type {
  SkillDefinition,
  SkillProfileDerivation,
  SkillProfileFieldProvenance,
  SkillProfileSourceField,
} from './skill-types.js';

export const SKILL_PROFILE_DERIVATION_VERSION = 1 as const;

type WorkType = WorkTypeEntry['type'];
type Proficiency = WorkTypeEntry['proficiency'];
const PROVENANCE_NOTE = 'canonical-profile-derived-from-manifest-source-metadata' as const;

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
  const stackDomains = normalized([
    ...skill.stackDetection.dependencies,
    ...skill.stackDetection.commands,
  ]);
  return [...new Set([skill.category, ...stackDomains])].map((id, index) => ({
    id,
    proficiency: index === 0 ? 'primary' : 'secondary',
  }));
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
      domains: fieldProvenance(['category', 'stackDetection']),
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
  if (skill.profile !== undefined && skill.profile !== null) {
    const authored = validateSkillProfile(skill.profile);
    if (authored.ok) {
      return {
        status: 'routable', origin: 'manifest-profile', profile: authored.value, provenance: null,
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
