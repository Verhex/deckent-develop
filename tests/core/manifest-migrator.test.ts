import { describe, it, expect } from 'vitest';
import { needsMigration, isV2Manifest, migrateAgentManifest, migrateSkillManifest, migrateManifestV2toV3 } from '../../src/core/manifest-migrator.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import { validateCapabilities } from '../../src/core/routing3/capability-vector.js';
import { BUILTIN_DOMAINS } from '../../src/core/routing3/vocabulary-builtin.js';

describe('manifest-migrator', () => {
  describe('needsMigration', () => {
    it('returns true for v1 (no manifestVersion)', () => {
      expect(needsMigration({})).toBe(true);
    });

    it('returns true for manifestVersion 1', () => {
      expect(needsMigration({ manifestVersion: 1 })).toBe(true);
    });

    it('returns false for manifestVersion 2', () => {
      expect(needsMigration({ manifestVersion: 2 })).toBe(false);
    });
  });

  describe('isV2Manifest', () => {
    it('returns true for v2', () => {
      expect(isV2Manifest({ manifestVersion: 2 })).toBe(true);
    });

    it('returns false for v1', () => {
      expect(isV2Manifest({ manifestVersion: 1 })).toBe(false);
      expect(isV2Manifest({})).toBe(false);
    });
  });

  describe('migrateAgentManifest', () => {
    it('migrates v1 security-auditor agent', () => {
      const agent = createAgentDefinition({
        id: 'security-auditor',
        name: 'Security Auditor',
        triggerKeywords: ['security', 'auth', 'jwt', 'csrf'],
        triggerScopes: ['src/auth/', 'src/security/'],
        triggerFilePatterns: ['**/*.auth.ts'],
      });

      const migrated = migrateAgentManifest(agent);
      expect(migrated.manifestVersion).toBe(2);
      expect(migrated.activation).toBeDefined();
      expect(migrated.activation!.rules.length).toBeGreaterThan(0);
      expect(migrated.activation!.minScore).toBe(5);
      // V1 fields preserved
      expect(migrated.triggerKeywords).toEqual(['security', 'auth', 'jwt', 'csrf']);
    });

    it('no-ops on already-v2 agent', () => {
      const agent = createAgentDefinition({
        id: 'test',
        name: 'Test',
        manifestVersion: 2,
        activation: { rules: [{ when: { 'intent.primary': 'testing' }, score: 10 }], exclude: [], minScore: 5 },
      });

      const migrated = migrateAgentManifest(agent);
      expect(migrated.activation!.rules).toHaveLength(1);
      expect(migrated.activation!.rules[0]!.score).toBe(10);
    });

    it('handles agent with no trigger keywords', () => {
      const agent = createAgentDefinition({ id: 'empty', name: 'Empty' });
      const migrated = migrateAgentManifest(agent);
      expect(migrated.manifestVersion).toBe(2);
      expect(migrated.activation).toBeDefined();
    });
  });

  describe('migrateSkillManifest', () => {
    it('migrates v1 typescript-expert skill', () => {
      const skill = createSkillDefinition({
        id: 'typescript-expert',
        name: 'TypeScript Expert',
        category: 'language',
        triggers: ['typescript', 'type', 'interface'],
        stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: [] },
      });

      const migrated = migrateSkillManifest(skill);
      expect(migrated.manifestVersion).toBe(2);
      expect(migrated.activation).toBeDefined();
      expect(migrated.activation!.rules.length).toBeGreaterThan(0);
      expect(migrated.activation!.minScore).toBe(3);
      // V1 fields preserved
      expect(migrated.triggers).toContain('typescript');
    });

    it('migrates v1 ci-testing skill', () => {
      const skill = createSkillDefinition({
        id: 'ci-testing',
        name: 'CI Testing',
        category: 'workflow',
        triggers: ['test', 'ci', 'regression', 'coverage'],
      });

      const migrated = migrateSkillManifest(skill);
      expect(migrated.manifestVersion).toBe(2);
      expect(migrated.activation!.rules.length).toBeGreaterThan(0);
    });

    it('no-ops on already-v2 skill', () => {
      const skill = createSkillDefinition({
        id: 'v2-skill',
        name: 'V2 Skill',
        manifestVersion: 2,
        activation: { rules: [], exclude: [], minScore: 3 },
      });

      const migrated = migrateSkillManifest(skill);
      expect(migrated.activation!.rules).toHaveLength(0);
    });
  });
});

// ─── V2 → V3 migration ─────────────────────────────────────────────────────

/** Look up a work-type entry's proficiency in a migrated capability vector. */
function workTypeProf(caps: { content: { workTypes: { type: string; proficiency: string }[] } }, type: string): string | undefined {
  return caps.content.workTypes.find((w) => w.type === type)?.proficiency;
}
/** Look up a domain entry's proficiency in a migrated capability vector. */
function domainProf(caps: { positional: { domains: { id: string; proficiency: string }[] } }, id: string): string | undefined {
  return caps.positional.domains.find((d) => d.id === id)?.proficiency;
}

describe('migrateManifestV2toV3', () => {
  const v2 = (partial: Partial<Parameters<typeof createAgentDefinition>[0]> = {}) =>
    createAgentDefinition({ id: 'x', name: 'X', manifestVersion: 2, ...partial });

  describe('DoD fixture migrations', () => {
    it('refactorer: refactor-only → refactor:primary, no build', () => {
      const agent = v2({
        id: 'refactorer',
        name: 'Refactorer',
        activation: { rules: [{ when: { 'intent.primary': 'refactor' }, score: 10 }], exclude: [], minScore: 5 },
      });
      const { capabilities, provisional } = migrateManifestV2toV3(agent, BUILTIN_DOMAINS);
      expect(provisional).toBe(true);
      expect(workTypeProf(capabilities, 'refactor')).toBe('primary');
      expect(workTypeProf(capabilities, 'build')).toBeUndefined();
      expect(validateCapabilities(capabilities).ok).toBe(true);
    });

    it('implementer: implementation → build:primary', () => {
      const agent = v2({
        id: 'implementer',
        name: 'Implementer',
        activation: { rules: [{ when: { 'intent.primary': 'implementation' }, score: 10 }], exclude: [], minScore: 5 },
      });
      const { capabilities, provisional } = migrateManifestV2toV3(agent, BUILTIN_DOMAINS);
      expect(provisional).toBe(true);
      expect(workTypeProf(capabilities, 'build')).toBe('primary');
      // build → code-src + code-test deliverables.
      expect(capabilities.positional.deliverables).toEqual(expect.arrayContaining(['code-src', 'code-test']));
      expect(validateCapabilities(capabilities).ok).toBe(true);
    });

    it('security-auditor: reviewer role → review:primary + security domain', () => {
      const agent = v2({
        id: 'security-auditor',
        name: 'Security Auditor',
        deniedTools: ['Edit', 'Write'],
        preferredModel: 'opus',
        activation: { rules: [{ when: { 'intent.primary': 'security' }, score: 10 }], exclude: [], minScore: 5 },
      });
      const { capabilities, provisional } = migrateManifestV2toV3(agent, BUILTIN_DOMAINS);
      expect(provisional).toBe(true);
      expect(workTypeProf(capabilities, 'review')).toBe('primary');
      expect(domainProf(capabilities, 'security')).toBe('primary');
      expect(capabilities.positional.role).toBe('reviewer');
      expect(capabilities.positional.writeAuthority).toBe(false);
      expect(validateCapabilities(capabilities).ok).toBe(true);
    });

    it("doc-writer: exclusions → 'never' entries", () => {
      const agent = v2({
        id: 'doc-writer',
        name: 'Doc Writer',
        preferredModel: 'haiku',
        activation: {
          rules: [{ when: { 'intent.primary': 'documentation' }, score: 10 }],
          exclude: [{ when: { 'intent.primary': 'implementation' } }, { when: { 'intent.primary': 'security' } }],
          minScore: 5,
        },
      });
      const { capabilities, provisional } = migrateManifestV2toV3(agent, BUILTIN_DOMAINS);
      expect(provisional).toBe(true);
      expect(workTypeProf(capabilities, 'document')).toBe('primary');
      expect(workTypeProf(capabilities, 'build')).toBe('never');
      expect(domainProf(capabilities, 'security')).toBe('never');
      expect(validateCapabilities(capabilities).ok).toBe(true);
    });
  });

  describe('score → proficiency', () => {
    it('maps 10→primary, 7-9→secondary, 5-6→able', () => {
      const mk = (score: number) => migrateManifestV2toV3(
        v2({ activation: { rules: [{ when: { 'intent.primary': 'implementation' }, score }], exclude: [], minScore: 5 } }),
        BUILTIN_DOMAINS,
      ).capabilities;
      expect(workTypeProf(mk(10), 'build')).toBe('primary');
      expect(workTypeProf(mk(8), 'build')).toBe('secondary');
      expect(workTypeProf(mk(5), 'build')).toBe('able');
    });
  });

  describe('writeAuthority from deniedTools', () => {
    it('true when no write tool is denied, false when Edit/Write denied', () => {
      const writer = migrateManifestV2toV3(v2({ deniedTools: [] }), BUILTIN_DOMAINS).capabilities;
      const reviewer = migrateManifestV2toV3(v2({ deniedTools: ['Edit', 'Write'] }), BUILTIN_DOMAINS).capabilities;
      expect(writer.positional.writeAuthority).toBe(true);
      expect(writer.positional.role).toBe('implementer');
      expect(reviewer.positional.writeAuthority).toBe(false);
      expect(reviewer.positional.role).toBe('reviewer');
    });
  });

  describe('numerical costTier from preferredModel', () => {
    it('infers tier from the preferred model id', () => {
      const tier = (model: string) => migrateManifestV2toV3(v2({ preferredModel: model }), BUILTIN_DOMAINS).capabilities.numerical.costTier;
      expect(tier('opus')).toBe('premium');
      expect(tier('sonnet')).toBe('standard');
      expect(tier('haiku')).toBe('economy');
    });
  });

  describe('domain mapping + vocabulary validation', () => {
    it('devops → configure + devops/ci domain (registry-canonical id)', () => {
      const { capabilities, issues } = migrateManifestV2toV3(
        v2({ activation: { rules: [{ when: { 'intent.primary': 'devops' }, score: 10 }], exclude: [], minScore: 5 } }),
        BUILTIN_DOMAINS,
      );
      expect(workTypeProf(capabilities, 'configure')).toBe('primary');
      expect(domainProf(capabilities, 'devops/ci')).toBe('primary');
      // 'devops/ci' is a builtin domain → no unknown-domain issue for it.
      expect(issues.some((i) => i.code === 'unknown-domain' && i.message.includes('devops/ci'))).toBe(false);
    });

    it("performance → analyze + unknown 'performance' domain flagged but kept", () => {
      const { capabilities, issues } = migrateManifestV2toV3(
        v2({ activation: { rules: [{ when: { 'intent.primary': 'performance' }, score: 9 }], exclude: [], minScore: 5 } }),
        BUILTIN_DOMAINS,
      );
      expect(workTypeProf(capabilities, 'analyze')).toBe('secondary');
      expect(domainProf(capabilities, 'performance')).toBe('secondary');
      expect(issues.some((i) => i.code === 'unknown-domain' && i.message.includes('performance'))).toBe(true);
      expect(validateCapabilities(capabilities).ok).toBe(true);
    });

    it('design/architecture → analyze + build:secondary', () => {
      const { capabilities } = migrateManifestV2toV3(
        v2({ activation: { rules: [{ when: { 'intent.primary': 'design' }, score: 10 }], exclude: [], minScore: 5 } }),
        BUILTIN_DOMAINS,
      );
      expect(workTypeProf(capabilities, 'analyze')).toBe('primary');
      expect(workTypeProf(capabilities, 'build')).toBe('secondary');
    });

    it('flags an unmapped V2 intent as a typed issue (never throws)', () => {
      const { issues, provisional } = migrateManifestV2toV3(
        v2({ activation: { rules: [{ when: { 'intent.primary': 'unknown' }, score: 6 }], exclude: [], minScore: 5 } }),
        BUILTIN_DOMAINS,
      );
      expect(provisional).toBe(true);
      expect(issues.some((i) => i.code === 'unmapped-intent')).toBe(true);
    });
  });

  describe('never-throws on a single bad manifest', () => {
    it('null / non-object manifest → invalid-manifest issue, valid fallback', () => {
      expect(() => migrateManifestV2toV3(null, BUILTIN_DOMAINS)).not.toThrow();
      const result = migrateManifestV2toV3(null, BUILTIN_DOMAINS);
      expect(result.provisional).toBe(true);
      expect(result.issues.some((i) => i.code === 'invalid-manifest')).toBe(true);
      expect(validateCapabilities(result.capabilities).ok).toBe(true);
    });

    it('manifest with malformed activation → no-activation issue, no throw', () => {
      expect(() => migrateManifestV2toV3({ id: 'broken', activation: 'not-an-object' }, BUILTIN_DOMAINS)).not.toThrow();
      const { issues, capabilities, provisional } = migrateManifestV2toV3({ id: 'broken', activation: 42 }, BUILTIN_DOMAINS);
      expect(provisional).toBe(true);
      expect(issues.some((i) => i.code === 'no-activation')).toBe(true);
      expect(validateCapabilities(capabilities).ok).toBe(true);
    });

    it('provisional flag is always set', () => {
      expect(migrateManifestV2toV3(v2({}), BUILTIN_DOMAINS).provisional).toBe(true);
      expect(migrateManifestV2toV3(undefined, BUILTIN_DOMAINS).provisional).toBe(true);
      expect(migrateManifestV2toV3({}, BUILTIN_DOMAINS).provisional).toBe(true);
    });
  });
});
