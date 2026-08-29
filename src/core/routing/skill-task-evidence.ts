import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';

import type { Task } from '../task-types.js';

export const SKILL_TASK_EVIDENCE_VERSION = 2 as const;

export interface SkillTaskPlatformEvidence {
  os: 'linux' | 'darwin' | 'win32';
  arch: string;
  wsl: boolean;
}

export interface SkillTaskEvidenceSnapshot {
  schemaVersion: typeof SKILL_TASK_EVIDENCE_VERSION;
  taskId: string;
  /** Exact filesRead/filesWrite declarations, before bounded directory discovery. */
  declaredScopePaths: string[];
  scopePaths: string[];
  projectFiles: string[];
  languages: string[];
  runtimes: string[];
  frameworks: string[];
  dependencies: string[];
  commands: string[];
  taskKind: string | null;
  platform: SkillTaskPlatformEvidence;
  tenantId: string | null;
  policyTags: string[];
  partial: boolean;
  digest: string;
}

export interface CollectSkillTaskEvidenceOptions {
  platform?: SkillTaskPlatformEvidence;
  maxDirectoryEntries?: number;
}

const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyw': 'python', '.pyi': 'python',
  '.rs': 'rust', '.go': 'go', '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin',
  '.cs': 'csharp', '.fs': 'fsharp', '.fsx': 'fsharp', '.vb': 'visual-basic',
  '.rb': 'ruby', '.php': 'php', '.swift': 'swift', '.dart': 'dart',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.scala': 'scala', '.sc': 'scala', '.ex': 'elixir', '.exs': 'elixir',
  '.erl': 'erlang', '.hrl': 'erlang', '.clj': 'clojure', '.cljs': 'clojure',
  '.hs': 'haskell', '.lhs': 'haskell', '.ml': 'ocaml', '.mli': 'ocaml',
  '.lua': 'lua', '.r': 'r', '.jl': 'julia', '.sol': 'solidity', '.zig': 'zig',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.ps1': 'powershell',
};

const FRAMEWORK_DEPENDENCIES: Readonly<Record<string, string>> = {
  react: 'react', 'react-dom': 'react', next: 'nextjs', vue: 'vue', nuxt: 'nuxt',
  svelte: 'svelte', '@angular/core': 'angular', express: 'express', fastify: 'fastify',
  nestjs: 'nestjs', '@nestjs/core': 'nestjs', django: 'django', flask: 'flask',
  fastapi: 'fastapi', pytest: 'pytest', vitest: 'vitest', jest: 'jest',
  sqlite: 'sqlite', sqlite3: 'sqlite', pg: 'postgresql', prisma: 'prisma',
};

export function normalizeEvidencePath(raw: string): string {
  const slash = raw.replaceAll('\\', '/');
  const segments: string[] = [];
  for (const segment of slash.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length > 0 && segments.at(-1) !== '..') segments.pop();
      else segments.push(segment);
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

function isPortableAbsolutePath(raw: string): boolean {
  const slash = raw.replaceAll('\\', '/');
  return slash.startsWith('/')
    || slash.startsWith('//')
    || /^[A-Za-z]:\//u.test(slash);
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map(value => value.toLowerCase()))].sort();
}

function detectPlatform(): SkillTaskPlatformEvidence {
  const os = process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux';
  let wsl = false;
  if (os === 'linux') {
    try {
      wsl = /microsoft|wsl/i.test(readFileSync('/proc/sys/kernel/osrelease', 'utf8'));
    } catch { /* ordinary non-Linux-hosted test seam */ }
  }
  return { os, arch: process.arch, wsl };
}

function collectDirectoryFiles(
  projectRoot: string,
  relativeDir: string,
  remaining: { count: number; partial: boolean },
  output: Set<string>,
): void {
  if (remaining.count <= 0) {
    remaining.partial = true;
    return;
  }
  const absoluteDir = resolve(projectRoot, relativeDir);
  let entries: Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }>;
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return;
  }
  for (const entry of entries) {
    if (remaining.count <= 0) {
      remaining.partial = true;
      return;
    }
    remaining.count--;
    const rel = normalizeEvidencePath(join(relativeDir, entry.name));
    if (entry.isDirectory()) collectDirectoryFiles(projectRoot, rel, remaining, output);
    else if (entry.isFile()) output.add(rel);
  }
}

function ancestorDirectories(projectRoot: string, paths: readonly string[]): string[] {
  const roots = new Set<string>(['']);
  for (const value of paths) {
    let cursor = dirname(resolve(projectRoot, value));
    while (true) {
      const rawRelative = relative(projectRoot, cursor);
      if (rawRelative.startsWith('..') || isAbsolute(rawRelative)) break;
      const rel = normalizeEvidencePath(rawRelative);
      roots.add(rel);
      if (cursor === projectRoot) break;
      cursor = dirname(cursor);
    }
  }
  return [...roots].sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));
}

function readPackageJson(
  path: string,
  dependencies: Set<string>,
  commands: Set<string>,
): void {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const block = parsed[key];
      if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
      for (const dependency of Object.keys(block)) dependencies.add(dependency.toLowerCase());
    }
    const scripts = parsed['scripts'];
    if (scripts && typeof scripts === 'object' && !Array.isArray(scripts)) {
      for (const command of Object.keys(scripts)) commands.add(command.toLowerCase());
    }
  } catch { /* malformed manifests are not positive evidence */ }
}

function readRequirements(path: string, dependencies: Set<string>): void {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z0-9_.-]+)/.exec(line);
      if (match?.[1]) dependencies.add(match[1].toLowerCase());
    }
  } catch { /* unreadable files are not positive evidence */ }
}

function canonicalWithoutDigest(snapshot: Omit<SkillTaskEvidenceSnapshot, 'digest'>): string {
  return JSON.stringify(snapshot);
}

/**
 * Build the replayable evidence the hard applicability gate sees. Language is
 * derived only from task-local scope paths (including not-yet-created writes),
 * while dependency/manifest evidence is resolved from scope ancestors. A
 * root-level Python marker therefore cannot turn a TypeScript task into Python.
 */
export function collectSkillTaskEvidence(
  projectRootInput: string,
  task: Pick<Task, 'id' | 'scope' | 'actor' | 'routingMeta'>,
  options: CollectSkillTaskEvidenceOptions = {},
): SkillTaskEvidenceSnapshot {
  const projectRoot = resolve(projectRootInput);
  const scopePaths = new Set<string>();
  const declaredScopePaths = new Set<string>();
  for (const raw of [
    ...(task.scope.filesRead ?? []),
    ...(task.scope.filesWrite ?? []),
  ]) {
    if (isPortableAbsolutePath(raw)) continue;
    const normalized = normalizeEvidencePath(raw);
    if (normalized !== '' && normalized !== '..' && !normalized.startsWith('../')) {
      scopePaths.add(normalized);
      declaredScopePaths.add(normalized);
    }
  }

  const remaining = { count: options.maxDirectoryEntries ?? 4096, partial: false };
  for (const rawDir of task.scope.directories ?? []) {
    if (isPortableAbsolutePath(rawDir)) continue;
    const normalized = normalizeEvidencePath(rawDir);
    if (normalized === '..' || normalized.startsWith('../')) continue;
    collectDirectoryFiles(projectRoot, normalized, remaining, scopePaths);
  }

  const projectFiles = new Set<string>();
  const dependencies = new Set<string>();
  const commands = new Set<string>();
  const ancestors = ancestorDirectories(projectRoot, [...scopePaths]);
  const markerNames = [
    'package.json', 'tsconfig.json', 'pyproject.toml', 'setup.py', 'setup.cfg',
    'requirements.txt', 'Pipfile', 'Cargo.toml', 'go.mod', 'pom.xml',
    'build.gradle', 'build.gradle.kts', 'composer.json', 'Gemfile', 'Package.swift',
  ];
  for (const relDir of ancestors) {
    for (const marker of markerNames) {
      const absolute = join(projectRoot, relDir, marker);
      if (!existsSync(absolute)) continue;
      try {
        if (!statSync(absolute).isFile()) continue;
      } catch { continue; }
      const relativeMarker = normalizeEvidencePath(join(relDir, marker));
      projectFiles.add(relativeMarker);
      if (marker === 'package.json') readPackageJson(absolute, dependencies, commands);
      if (/^requirements.*\.txt$/i.test(marker)) readRequirements(absolute, dependencies);
    }
  }

  const languages = new Set<string>();
  // Explicit task declarations outrank bounded directory discovery. This is
  // what keeps a TypeScript write in a mixed-language monorepo from inheriting
  // every language merely because its parent directory is broad.
  const languagePaths = declaredScopePaths.size > 0 ? declaredScopePaths : scopePaths;
  for (const value of languagePaths) {
    const language = EXTENSION_LANGUAGE[extname(value).toLowerCase()];
    if (language) languages.add(language);
  }
  const frameworks = new Set<string>();
  for (const dependency of dependencies) {
    const framework = FRAMEWORK_DEPENDENCIES[dependency];
    if (framework) frameworks.add(framework);
  }
  const runtimes = new Set<string>();
  if (languages.has('typescript') || languages.has('javascript')) runtimes.add('node');
  if (languages.has('python')) runtimes.add('python');
  if (languages.has('csharp') || languages.has('fsharp')) runtimes.add('dotnet');
  if (languages.has('java') || languages.has('kotlin')) runtimes.add('jvm');
  if (languages.has('rust')) runtimes.add('rust');
  if (languages.has('go')) runtimes.add('go');

  const base: Omit<SkillTaskEvidenceSnapshot, 'digest'> = {
    schemaVersion: SKILL_TASK_EVIDENCE_VERSION,
    taskId: task.id,
    declaredScopePaths: [...declaredScopePaths].sort(),
    scopePaths: [...scopePaths].sort(),
    projectFiles: [...projectFiles].sort(),
    languages: sorted(languages),
    runtimes: sorted(runtimes),
    frameworks: sorted(frameworks),
    dependencies: sorted(dependencies),
    commands: sorted(commands),
    taskKind: task.routingMeta?.workType?.toLowerCase() ?? null,
    platform: options.platform ?? detectPlatform(),
    tenantId: task.actor?.tenantId ?? null,
    policyTags: sorted(task.routingMeta?.policyTags ?? []),
    partial: remaining.partial,
  };
  const digest = `sha256:${createHash('sha256').update(canonicalWithoutDigest(base)).digest('hex')}`;
  return { ...base, digest };
}
