import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DependencyResolver,
  CircularDependencyError,
} from '../../../src/core/marketplace/dependency-resolver.js';
import type { DependencyResolverFS, SkillManifestDeps } from '../../../src/core/marketplace/dependency-resolver.js';

// ─── Mock FS ─────────────────────────────────────────────────────────────────

function createMockFS(files: Record<string, string> = {}): DependencyResolverFS {
  const store = new Map(Object.entries(files));

  return {
    existsSync: vi.fn((p: string) => store.has(p)),
    readFileSync: vi.fn((p: string) => {
      if (!store.has(p)) throw new Error(`ENOENT: ${p}`);
      return store.get(p)!;
    }),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeManifest(name: string, version: string, deps?: Record<string, string>): SkillManifestDeps {
  return { name, version, dependencies: deps };
}

function makeRegistryLookup(manifests: SkillManifestDeps[]): Map<string, SkillManifestDeps> {
  const map = new Map<string, SkillManifestDeps>();
  for (const m of manifests) {
    map.set(m.name, m);
  }
  return map;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DependencyResolver', () => {
  const skillsDir = '/test/skills';

  describe('resolve', () => {
    it('resolves skill with no dependencies', () => {
      const lookup = makeRegistryLookup([
        makeManifest('skill-a', '1.0.0'),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      const result = resolver.resolve('skill-a');
      expect(result.ordered).toHaveLength(1);
      expect(result.ordered[0]!.name).toBe('skill-a');
    });

    it('resolves linear dependency chain A -> B -> C', () => {
      const lookup = makeRegistryLookup([
        makeManifest('skill-a', '1.0.0', { 'skill-b': '1.0.0' }),
        makeManifest('skill-b', '1.0.0', { 'skill-c': '1.0.0' }),
        makeManifest('skill-c', '1.0.0'),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      const result = resolver.resolve('skill-a');
      const names = result.ordered.map((d) => d.name);
      const aIdx = names.indexOf('skill-a');
      const bIdx = names.indexOf('skill-b');
      const cIdx = names.indexOf('skill-c');

      // Dependencies should come before dependents
      expect(cIdx).toBeLessThan(bIdx);
      expect(bIdx).toBeLessThan(aIdx);
    });

    it('resolves diamond dependency (A -> B,C; B -> D; C -> D)', () => {
      const lookup = makeRegistryLookup([
        makeManifest('A', '1.0.0', { 'B': '1.0.0', 'C': '1.0.0' }),
        makeManifest('B', '1.0.0', { 'D': '1.0.0' }),
        makeManifest('C', '1.0.0', { 'D': '1.0.0' }),
        makeManifest('D', '1.0.0'),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      const result = resolver.resolve('A');
      const names = result.ordered.map((d) => d.name);
      expect(names.indexOf('D')).toBeLessThan(names.indexOf('B'));
      expect(names.indexOf('D')).toBeLessThan(names.indexOf('C'));
      expect(names.indexOf('A')).toBe(names.length - 1);
    });

    it('throws CircularDependencyError for circular deps', () => {
      const lookup = makeRegistryLookup([
        makeManifest('A', '1.0.0', { 'B': '1.0.0' }),
        makeManifest('B', '1.0.0', { 'A': '1.0.0' }),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      expect(() => resolver.resolve('A')).toThrow(CircularDependencyError);
    });

    it('handles unknown dependencies gracefully', () => {
      const lookup = makeRegistryLookup([
        makeManifest('A', '1.0.0', { 'unknown-dep': '1.0.0' }),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      const result = resolver.resolve('A');
      const names = result.ordered.map((d) => d.name);
      expect(names).toContain('unknown-dep');
      expect(result.resolved.get('unknown-dep')).toBe('unknown');
    });

    it('records versions in resolved map', () => {
      const lookup = makeRegistryLookup([
        makeManifest('A', '2.0.0', { 'B': '1.5.0' }),
        makeManifest('B', '1.5.0'),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      const result = resolver.resolve('A');
      expect(result.resolved.get('A')).toBe('2.0.0');
      expect(result.resolved.get('B')).toBe('1.5.0');
    });
  });

  describe('detectCircular', () => {
    it('returns null for no circular dependencies', () => {
      const lookup = makeRegistryLookup([
        makeManifest('A', '1.0.0', { 'B': '1.0.0' }),
        makeManifest('B', '1.0.0'),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      expect(resolver.detectCircular('A')).toBeNull();
    });

    it('returns cycle path for circular dependency', () => {
      const lookup = makeRegistryLookup([
        makeManifest('A', '1.0.0', { 'B': '1.0.0' }),
        makeManifest('B', '1.0.0', { 'C': '1.0.0' }),
        makeManifest('C', '1.0.0', { 'A': '1.0.0' }),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      const cycle = resolver.detectCircular('A');
      expect(cycle).not.toBeNull();
      expect(cycle!.length).toBeGreaterThan(2);
    });

    it('returns null for standalone skill', () => {
      const lookup = makeRegistryLookup([
        makeManifest('A', '1.0.0'),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      expect(resolver.detectCircular('A')).toBeNull();
    });
  });

  describe('resolveConflicts', () => {
    it('picks highest version', () => {
      const resolver = new DependencyResolver(skillsDir);
      const versions = new Map([
        ['skill-x', ['1.0.0', '2.0.0', '1.5.0']],
      ]);

      const resolved = resolver.resolveConflicts(versions);
      expect(resolved.get('skill-x')).toBe('2.0.0');
    });

    it('handles single version', () => {
      const resolver = new DependencyResolver(skillsDir);
      const versions = new Map([
        ['skill-y', ['1.0.0']],
      ]);

      const resolved = resolver.resolveConflicts(versions);
      expect(resolved.get('skill-y')).toBe('1.0.0');
    });

    it('handles empty version list', () => {
      const resolver = new DependencyResolver(skillsDir);
      const versions = new Map([
        ['skill-z', []],
      ]);

      const resolved = resolver.resolveConflicts(versions);
      expect(resolved.has('skill-z')).toBe(false);
    });

    it('compares all semver components', () => {
      const resolver = new DependencyResolver(skillsDir);
      const versions = new Map([
        ['skill-w', ['1.2.3', '1.2.4', '1.3.0']],
      ]);

      const resolved = resolver.resolveConflicts(versions);
      expect(resolved.get('skill-w')).toBe('1.3.0');
    });
  });

  describe('installWithDependencies', () => {
    it('returns ordered install list', () => {
      const lookup = makeRegistryLookup([
        makeManifest('app', '1.0.0', { 'lib': '1.0.0' }),
        makeManifest('lib', '1.0.0'),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      const ordered = resolver.installWithDependencies('app');
      expect(ordered[0]!.name).toBe('lib');
      expect(ordered[1]!.name).toBe('app');
    });

    it('returns single entry for no-dep skill', () => {
      const lookup = makeRegistryLookup([
        makeManifest('solo', '1.0.0'),
      ]);
      const resolver = new DependencyResolver(skillsDir, { registryLookup: lookup });

      const ordered = resolver.installWithDependencies('solo');
      expect(ordered).toHaveLength(1);
      expect(ordered[0]!.name).toBe('solo');
    });
  });

  describe('filesystem-based resolution', () => {
    it('reads manifest from skills directory', () => {
      const fs = createMockFS({
        [`${skillsDir}/my-skill/manifest.json`]: JSON.stringify({
          name: 'my-skill',
          version: '1.0.0',
        }),
      });
      const resolver = new DependencyResolver(skillsDir, { fs });

      const result = resolver.resolve('my-skill');
      expect(result.ordered).toHaveLength(1);
      expect(result.ordered[0]!.version).toBe('1.0.0');
    });

    it('handles missing manifest file', () => {
      const fs = createMockFS();
      const resolver = new DependencyResolver(skillsDir, { fs });

      const result = resolver.resolve('missing-skill');
      expect(result.ordered).toHaveLength(1);
      expect(result.resolved.get('missing-skill')).toBe('unknown');
    });
  });
});
