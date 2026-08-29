import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { SkillDefinition } from '../skill-types.js';
import { matchGlob } from '../doc-tracking/glob.js';
import type { SkillTaskEvidenceSnapshot } from './skill-task-evidence.js';

export const SKILL_APPLICABILITY_VERSION = 1 as const;

export const skillEvidenceKindSchema = z.enum([
  'language',
  'runtime',
  'framework',
  'dependency',
  'file',
  'command',
  'task-kind',
  'platform',
  'tenant',
  'policy-tag',
]);
export type SkillEvidenceKind = z.infer<typeof skillEvidenceKindSchema>;

export const skillApplicabilityPredicateSchema = z.object({
  kind: skillEvidenceKindSchema,
  value: z.string().trim().min(1).max(512),
  scope: z.enum(['task', 'project']),
}).strict();
export type SkillApplicabilityPredicate = z.infer<typeof skillApplicabilityPredicateSchema>;

export const skillApplicabilityProfileSchema = z.object({
  applicabilityVersion: z.literal(SKILL_APPLICABILITY_VERSION),
  required: z.object({
    all: z.array(skillApplicabilityPredicateSchema).default([]),
    any: z.array(skillApplicabilityPredicateSchema).default([]),
  }).strict().default({ all: [], any: [] }),
  forbidden: z.array(skillApplicabilityPredicateSchema).default([]),
  platforms: z.array(z.enum(['linux', 'darwin', 'win32', 'wsl'])).default([]),
}).strict();
export type SkillApplicabilityProfile = z.infer<typeof skillApplicabilityProfileSchema>;

export type SkillApplicabilityDerivation =
  | {
      status: 'applicable-profile';
      origin: 'manifest-applicability' | 'derived-applicability';
      profile: SkillApplicabilityProfile;
      digest: string;
    }
  | {
      status: 'unroutable';
      origin: 'manifest-applicability' | 'derived-applicability';
      profile: null;
      diagnostic: {
        disposition: 'HOLD';
        reasonCode:
          | 'invalid-manifest-applicability'
          | 'language-identity-unresolved'
          | 'language-identity-ambiguous'
          | 'framework-evidence-missing';
        message: string;
      };
    };

export type SkillApplicabilityRejectionReason =
  | 'platform-mismatch'
  | 'partial-evidence'
  | 'required-evidence-missing'
  | 'forbidden-evidence-present';

export type SkillApplicabilityVerdict =
  | {
      admitted: true;
      matchedEvidence: readonly string[];
      profileDigest: string;
    }
  | {
      admitted: false;
      reason: SkillApplicabilityRejectionReason;
      detail: string;
      matchedEvidence: readonly string[];
      missingEvidence: readonly string[];
      profileDigest: string;
    };

const LANGUAGE_MARKERS: ReadonlyArray<{
  language: string;
  files: readonly RegExp[];
  dependencies: readonly RegExp[];
  commands: readonly RegExp[];
}> = [
  { language: 'typescript', files: [/^tsconfig(?:\..+)?\.json$/i], dependencies: [/^(?:@types\/node|typescript)$/i], commands: [/^(?:tsc|tsx)$/i] },
  { language: 'python', files: [/^(?:pyproject\.toml|setup\.py|setup\.cfg|requirements(?:[-_.].+)?\.txt|Pipfile)$/i], dependencies: [/^(?:python|pytest|django|flask|fastapi)$/i], commands: [/^(?:python|python3|pytest|pip|pip3)$/i] },
  { language: 'rust', files: [/^Cargo\.toml$/i], dependencies: [/^rust$/i], commands: [/^(?:cargo|rustc)$/i] },
  { language: 'go', files: [/^go\.mod$/i], dependencies: [/^go$/i], commands: [/^go$/i] },
  { language: 'java', files: [/^(?:pom\.xml|build\.gradle(?:\.kts)?)$/i], dependencies: [/^(?:java|jdk)$/i], commands: [/^(?:java|javac|mvn|gradle)$/i] },
  { language: 'csharp', files: [/\.(?:csproj|sln)$/i], dependencies: [/^(?:dotnet|csharp)$/i], commands: [/^dotnet$/i] },
  { language: 'ruby', files: [/^(?:Gemfile|.+\.gemspec)$/i], dependencies: [/^ruby$/i], commands: [/^(?:ruby|bundle)$/i] },
  { language: 'php', files: [/^composer\.json$/i], dependencies: [/^php$/i], commands: [/^(?:php|composer)$/i] },
  { language: 'swift', files: [/^Package\.swift$/i], dependencies: [/^swift$/i], commands: [/^swift$/i] },
  { language: 'kotlin', files: [/^build\.gradle\.kts$/i], dependencies: [/^kotlin/i], commands: [/^(?:kotlinc|gradle)$/i] },
];

function normalizeValue(predicate: SkillApplicabilityPredicate): SkillApplicabilityPredicate {
  const value = predicate.kind === 'file'
    ? predicate.value.trim().replaceAll('\\', '/')
    : predicate.value.trim().toLowerCase();
  return { ...predicate, value };
}

function canonicalProfile(input: SkillApplicabilityProfile): SkillApplicabilityProfile {
  const sortPredicates = (values: readonly SkillApplicabilityPredicate[]) => [...values]
    .map(normalizeValue)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value) || a.scope.localeCompare(b.scope));
  return {
    applicabilityVersion: SKILL_APPLICABILITY_VERSION,
    required: {
      all: sortPredicates(input.required.all),
      any: sortPredicates(input.required.any),
    },
    forbidden: sortPredicates(input.forbidden),
    platforms: [...new Set(input.platforms)].sort(),
  };
}

export function digestSkillApplicability(profile: SkillApplicabilityProfile): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalProfile(profile))).digest('hex')}`;
}

function resolveLanguageIdentity(definition: SkillDefinition): string[] {
  const files = definition.stackDetection.files.map(value => value.replaceAll('\\', '/').split('/').at(-1) ?? value);
  const dependencies = definition.stackDetection.dependencies;
  const commands = definition.stackDetection.commands;
  return LANGUAGE_MARKERS
    .filter(marker =>
      files.some(value => marker.files.some(pattern => pattern.test(value)))
      || dependencies.some(value => marker.dependencies.some(pattern => pattern.test(value)))
      || commands.some(value => marker.commands.some(pattern => pattern.test(value))))
    .map(marker => marker.language)
    .sort();
}

function predicate(kind: SkillEvidenceKind, value: string, scope: 'task' | 'project'): SkillApplicabilityPredicate {
  return { kind, value, scope };
}

function derivedProfile(definition: SkillDefinition): SkillApplicabilityDerivation {
  if (definition.category === 'language') {
    const languages = resolveLanguageIdentity(definition);
    if (languages.length === 0) {
      return {
        status: 'unroutable', origin: 'derived-applicability', profile: null,
        diagnostic: {
          disposition: 'HOLD', reasonCode: 'language-identity-unresolved',
          message: 'language skills require a structural file, dependency, or command marker',
        },
      };
    }
    if (languages.length > 1) {
      return {
        status: 'unroutable', origin: 'derived-applicability', profile: null,
        diagnostic: {
          disposition: 'HOLD', reasonCode: 'language-identity-ambiguous',
          message: `language skill structural markers resolve to multiple languages: ${languages.join(',')}`,
        },
      };
    }
    const profile = canonicalProfile(skillApplicabilityProfileSchema.parse({
      applicabilityVersion: SKILL_APPLICABILITY_VERSION,
      required: { all: [predicate('language', languages[0]!, 'task')], any: [] },
      forbidden: [], platforms: [],
    }));
    return {
      status: 'applicable-profile', origin: 'derived-applicability', profile,
      digest: digestSkillApplicability(profile),
    };
  }

  const structural = [
    ...definition.stackDetection.files.map(value => predicate('file', value, 'project')),
    ...definition.stackDetection.dependencies.map(value => predicate('dependency', value, 'project')),
    ...definition.stackDetection.commands.map(value => predicate('command', value, 'project')),
  ];
  if (definition.category === 'framework' && structural.length === 0) {
    return {
      status: 'unroutable', origin: 'derived-applicability', profile: null,
      diagnostic: {
        disposition: 'HOLD', reasonCode: 'framework-evidence-missing',
        message: 'framework skills require structural stackDetection evidence',
      },
    };
  }
  const profile = canonicalProfile(skillApplicabilityProfileSchema.parse({
    applicabilityVersion: SKILL_APPLICABILITY_VERSION,
    required: { all: [], any: structural },
    forbidden: [], platforms: [],
  }));
  return {
    status: 'applicable-profile', origin: 'derived-applicability', profile,
    digest: digestSkillApplicability(profile),
  };
}

/**
 * Resolve the hard applicability contract. Description, triggers, priority,
 * semantic profile, and historical stats are deliberately absent from this
 * function: none of them can mint task-local execution authority.
 */
export function deriveCanonicalSkillApplicability(definition: SkillDefinition): SkillApplicabilityDerivation {
  if (definition.applicability !== undefined && definition.applicability !== null) {
    const parsed = skillApplicabilityProfileSchema.safeParse(definition.applicability);
    if (!parsed.success) {
      return {
        status: 'unroutable', origin: 'manifest-applicability', profile: null,
        diagnostic: {
          disposition: 'HOLD', reasonCode: 'invalid-manifest-applicability',
          message: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        },
      };
    }
    const profile = canonicalProfile(parsed.data);
    return {
      status: 'applicable-profile', origin: 'manifest-applicability', profile,
      digest: digestSkillApplicability(profile),
    };
  }
  return derivedProfile(definition);
}

function evidenceKey(predicate: SkillApplicabilityPredicate): string {
  return `${predicate.scope}:${predicate.kind}:${predicate.value}`;
}

function fileMatches(values: readonly string[], pattern: string): boolean {
  const normalized = pattern.replaceAll('\\', '/');
  return values.some(value =>
    matchGlob(value, normalized)
    || matchGlob(value.split('/').at(-1) ?? value, normalized));
}

function matches(predicate: SkillApplicabilityPredicate, evidence: SkillTaskEvidenceSnapshot): boolean {
  const value = predicate.value.toLowerCase();
  switch (predicate.kind) {
    case 'language': return evidence.languages.includes(value);
    case 'runtime': return evidence.runtimes.includes(value);
    case 'framework': return evidence.frameworks.includes(value);
    case 'dependency': return evidence.dependencies.includes(value);
    case 'file': return fileMatches(
      predicate.scope === 'task' ? evidence.scopePaths : [...evidence.scopePaths, ...evidence.projectFiles],
      predicate.value,
    );
    case 'command': return evidence.commands.includes(value);
    case 'task-kind': return evidence.taskKind === value;
    case 'platform': return evidence.platform.os === value || (value === 'wsl' && evidence.platform.wsl);
    case 'tenant': return evidence.tenantId?.toLowerCase() === value;
    case 'policy-tag': return evidence.policyTags.includes(value);
  }
}

export function evaluateSkillApplicability(
  rawProfile: SkillApplicabilityProfile,
  evidence: SkillTaskEvidenceSnapshot,
): SkillApplicabilityVerdict {
  const profile = canonicalProfile(rawProfile);
  const profileDigest = digestSkillApplicability(profile);
  const platform = evidence.platform.wsl ? 'wsl' : evidence.platform.os;
  if (profile.platforms.length > 0 && !profile.platforms.includes(platform as never)) {
    return {
      admitted: false, reason: 'platform-mismatch',
      detail: `platform=${platform}; allowed=${profile.platforms.join(',')}`,
      matchedEvidence: [], missingEvidence: profile.platforms.map(value => `platform:${value}`),
      profileDigest,
    };
  }

  // A bounded scan may miss forbidden project evidence. Positive task-local
  // evidence is still usable, but absence can never clear an authored veto.
  if (evidence.partial && profile.forbidden.length > 0) {
    return {
      admitted: false, reason: 'partial-evidence',
      detail: 'bounded evidence scan cannot prove forbidden predicates absent',
      matchedEvidence: [],
      missingEvidence: profile.forbidden.map(evidenceKey),
      profileDigest,
    };
  }

  const forbidden = profile.forbidden.filter(item => matches(item, evidence));
  if (forbidden.length > 0) {
    return {
      admitted: false, reason: 'forbidden-evidence-present',
      detail: forbidden.map(evidenceKey).join(','),
      matchedEvidence: forbidden.map(evidenceKey), missingEvidence: [], profileDigest,
    };
  }

  const matchedAll = profile.required.all.filter(item => matches(item, evidence));
  const missingAll = profile.required.all.filter(item => !matches(item, evidence));
  const matchedAny = profile.required.any.filter(item => matches(item, evidence));
  const anySatisfied = profile.required.any.length === 0 || matchedAny.length > 0;
  if (missingAll.length > 0 || !anySatisfied) {
    return {
      admitted: false, reason: 'required-evidence-missing',
      detail: [
        ...missingAll.map(evidenceKey),
        ...(!anySatisfied ? profile.required.any.map(item => `any(${evidenceKey(item)})`) : []),
      ].join(','),
      matchedEvidence: [...matchedAll, ...matchedAny].map(evidenceKey),
      missingEvidence: [
        ...missingAll.map(evidenceKey),
        ...(!anySatisfied ? profile.required.any.map(evidenceKey) : []),
      ],
      profileDigest,
    };
  }

  return {
    admitted: true,
    matchedEvidence: [...matchedAll, ...matchedAny].map(evidenceKey),
    profileDigest,
  };
}
