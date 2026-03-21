// ─── Dependency Resolver ─────────────────────────────────────────────────────
// Resolves skill dependencies to produce an ordered install list.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillManifestDeps {
  name: string;
  version: string;
  dependencies?: Record<string, string>; // name -> version range
}

export interface ResolvedDependency {
  name: string;
  version: string;
}

export interface ResolveResult {
  ordered: ResolvedDependency[];
  resolved: Map<string, string>;  // name -> version
}

export class CircularDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

export class DependencyConflictError extends Error {
  constructor(
    public readonly name: string,
    public readonly versions: string[],
  ) {
    super(`Dependency conflict for "${name}": versions ${versions.join(', ')}`);
    this.name = 'DependencyConflictError';
  }
}

// ─── Filesystem abstraction for testing ──────────────────────────────────────

export interface DependencyResolverFS {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
}

const defaultFS: DependencyResolverFS = {
  existsSync,
  readFileSync,
};

// ─── DependencyResolver ──────────────────────────────────────────────────────

export class DependencyResolver {
  private readonly skillsDir: string;
  private readonly fs: DependencyResolverFS;
  /** Injectable manifest lookup for testing (name -> manifest) */
  private readonly registryLookup: Map<string, SkillManifestDeps>;

  constructor(
    skillsDir: string,
    options?: {
      fs?: DependencyResolverFS;
      registryLookup?: Map<string, SkillManifestDeps>;
    },
  ) {
    this.skillsDir = skillsDir;
    this.fs = options?.fs ?? defaultFS;
    this.registryLookup = options?.registryLookup ?? new Map();
  }

  /**
   * Resolve all dependencies for a skill, returning an ordered install list.
   * Uses topological sort (Kahn's algorithm).
   */
  resolve(skillName: string): ResolveResult {
    const graph = new Map<string, Set<string>>();
    const versions = new Map<string, string>();
    const visited = new Set<string>();

    this._buildGraph(skillName, graph, versions, visited, []);

    // Topological sort
    const ordered = this._topologicalSort(graph);

    return {
      ordered: ordered.map((name) => ({
        name,
        version: versions.get(name) ?? 'unknown',
      })),
      resolved: versions,
    };
  }

  /**
   * Detect circular dependencies starting from a skill.
   * Returns the cycle path if found, null otherwise.
   */
  detectCircular(skillName: string): string[] | null {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];

    const hasCycle = this._dfs(skillName, visited, stack, path);
    return hasCycle ? path : null;
  }

  /**
   * Resolve version conflicts by picking the highest semver version.
   */
  resolveConflicts(
    versions: Map<string, string[]>,
  ): Map<string, string> {
    const resolved = new Map<string, string>();
    for (const [name, versionList] of versions) {
      if (versionList.length === 0) continue;
      const sorted = [...versionList].sort(this._compareSemver.bind(this));
      resolved.set(name, sorted[sorted.length - 1]!);
    }
    return resolved;
  }

  /**
   * Install a skill with all its dependencies in order.
   * Returns the ordered list of skills to install.
   */
  installWithDependencies(skillName: string): ResolvedDependency[] {
    const result = this.resolve(skillName);
    return result.ordered;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _getManifest(skillName: string): SkillManifestDeps | null {
    // Check registry lookup first (for testing / remote resolution)
    if (this.registryLookup.has(skillName)) {
      return this.registryLookup.get(skillName)!;
    }

    // Check local skills directory
    const manifestPath = join(this.skillsDir, skillName, 'manifest.json');
    if (!this.fs.existsSync(manifestPath)) return null;

    try {
      const raw = this.fs.readFileSync(manifestPath, 'utf-8') as string;
      return JSON.parse(raw) as SkillManifestDeps;
    } catch {
      return null;
    }
  }

  private _buildGraph(
    skillName: string,
    graph: Map<string, Set<string>>,
    versions: Map<string, string>,
    visited: Set<string>,
    ancestors: string[],
  ): void {
    if (ancestors.includes(skillName)) {
      throw new CircularDependencyError([...ancestors, skillName]);
    }

    if (visited.has(skillName)) return;
    visited.add(skillName);

    const manifest = this._getManifest(skillName);
    if (!manifest) {
      // Unknown skill, still record it with unknown version
      if (!versions.has(skillName)) {
        versions.set(skillName, 'unknown');
      }
      if (!graph.has(skillName)) {
        graph.set(skillName, new Set());
      }
      return;
    }

    versions.set(skillName, manifest.version);
    if (!graph.has(skillName)) {
      graph.set(skillName, new Set());
    }

    const deps = manifest.dependencies ?? {};
    for (const depName of Object.keys(deps)) {
      graph.get(skillName)!.add(depName);
      this._buildGraph(depName, graph, versions, visited, [...ancestors, skillName]);
    }
  }

  private _topologicalSort(graph: Map<string, Set<string>>): string[] {
    const inDegree = new Map<string, number>();
    for (const node of graph.keys()) {
      if (!inDegree.has(node)) inDegree.set(node, 0);
    }
    for (const [, deps] of graph) {
      for (const dep of deps) {
        if (!inDegree.has(dep)) inDegree.set(dep, 0);
        inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
      }
    }

    // Reverse: we need dependencies installed first
    // So a depends on b means b should come first
    // In our graph, edges go from skill -> dependency, so we want reverse topological
    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      const deps = graph.get(node);
      if (deps) {
        for (const dep of deps) {
          const newDegree = (inDegree.get(dep) ?? 0) - 1;
          inDegree.set(dep, newDegree);
          if (newDegree === 0) queue.push(dep);
        }
      }
    }

    // Dependencies should come before the skills that depend on them
    return result.reverse();
  }

  private _dfs(
    node: string,
    visited: Set<string>,
    stack: Set<string>,
    path: string[],
  ): boolean {
    visited.add(node);
    stack.add(node);
    path.push(node);

    const manifest = this._getManifest(node);
    const deps = manifest?.dependencies ?? {};
    for (const dep of Object.keys(deps)) {
      if (!visited.has(dep)) {
        if (this._dfs(dep, visited, stack, path)) return true;
      } else if (stack.has(dep)) {
        path.push(dep);
        return true;
      }
    }

    stack.delete(node);
    path.pop();
    return false;
  }

  private _compareSemver(a: string, b: string): number {
    const partsA = a.replace(/[^0-9.]/g, '').split('.').map(Number);
    const partsB = b.replace(/[^0-9.]/g, '').split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const va = partsA[i] ?? 0;
      const vb = partsB[i] ?? 0;
      if (va < vb) return -1;
      if (va > vb) return 1;
    }
    return 0;
  }
}
