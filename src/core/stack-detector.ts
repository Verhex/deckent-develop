// ─── Stack Detector ─────────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { ProjectStack } from './skill-types.js';
import { readJsonSafe, debugLog } from './utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_FILE = '.deckent/project-stack.json';
const CACHE_CHECK_FILES = [
  '.deckent/config.json',
  '.deckent/workspace/IDENTITY.md',
  'package.json',
  'tsconfig.json',
  'Cargo.toml',
  'go.mod',
  'setup.py',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'pom.xml',
  'build.gradle',
  'CMakeLists.txt',
  'Makefile',
  'meson.build',
];
const STACK_CACHE_CONTRACT_VERSION = 1;
const WORKSPACE_AUTHORITY_INPUTS = ['.deckent/config.json', '.deckent/workspace/IDENTITY.md'] as const;

interface StackCacheContract {
  version: typeof STACK_CACHE_CONTRACT_VERSION;
  workspaceAuthorityDigest: string;
}

function workspaceAuthorityDigest(projectRoot: string): string {
  const hash = createHash('sha256');
  for (const relativePath of WORKSPACE_AUTHORITY_INPUTS) {
    const absolutePath = path.join(projectRoot, relativePath);
    hash.update(relativePath);
    try {
      hash.update(fs.readFileSync(absolutePath));
    } catch {
      hash.update('<ABSENT>');
    }
  }
  return hash.digest('hex');
}

// ─── STACK_COMMANDS ─────────────────────────────────────────────────────────

export const STACK_COMMANDS: Record<string, { build: string; test: string; lint: string; typecheck: string }> = {
  // Compiled languages
  // `typecheck` is a dedicated no-emit/no-artifact verification command, distinct from `build`.
  // Only set when a genuine lightweight typecheck-only command is known for the language —
  // otherwise honest-empty ('') rather than guessed (never re-use `build` as a fake typecheck).
  typescript: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint', typecheck: 'npx tsc --noEmit' },
  go: { build: 'go build ./...', test: 'go test ./...', lint: 'golangci-lint run', typecheck: 'go vet ./...' },
  rust: { build: 'cargo build', test: 'cargo test', lint: 'cargo clippy', typecheck: 'cargo check' },
  java_maven: { build: 'mvn compile', test: 'mvn test', lint: '', typecheck: '' },
  java_gradle: { build: 'gradle build', test: 'gradle test', lint: '', typecheck: '' },
  kotlin_maven: { build: 'mvn compile', test: 'mvn test', lint: 'ktlint', typecheck: '' },
  kotlin_gradle: { build: 'gradle build', test: 'gradle test', lint: 'ktlint', typecheck: '' },
  csharp: { build: 'dotnet build', test: 'dotnet test', lint: 'dotnet format --verify-no-changes', typecheck: '' },
  swift: { build: 'swift build', test: 'swift test', lint: 'swiftlint', typecheck: '' },
  c_cmake: { build: 'cmake --build build', test: 'ctest --test-dir build', lint: '', typecheck: '' },
  c_make: { build: 'make', test: 'make test', lint: '', typecheck: '' },
  // Interpreted languages (no build step)
  javascript: { build: '', test: 'npx vitest run', lint: 'npx eslint', typecheck: '' },
  python: { build: '', test: 'pytest', lint: 'ruff check', typecheck: '' },
  ruby: { build: '', test: 'bundle exec rspec', lint: 'rubocop', typecheck: '' },
  php: { build: '', test: 'vendor/bin/phpunit', lint: 'vendor/bin/phpstan analyse', typecheck: '' },
  dart: { build: 'dart compile exe', test: 'dart test', lint: 'dart analyze', typecheck: '' },
  flutter: { build: 'flutter build', test: 'flutter test', lint: 'flutter analyze', typecheck: '' },
};

// ─── FullStackResult ────────────────────────────────────────────────────────

export interface FullStackResult {
  language: string;
  framework: string;
  buildTool: string;
  testFramework: string;
  commands: { build: string; test: string; lint: string; typecheck: string };
  detectedLanguages?: string[];
}

// ─── detectProjectStack ────────────────────────────────────────────────────

/**
 * Detect the project's technology stack by examining project files.
 * Results are cached to .deckent/project-stack.json.
 * On subsequent calls, returns cached data unless stale.
 */
export function detectProjectStack(projectRoot: string): ProjectStack {
  const cachePath = path.join(projectRoot, CACHE_FILE);

  // Try reading from cache first
  if (!isStackStale(projectRoot)) {
    const cached = readJsonSafe<ProjectStack & { cacheContract?: StackCacheContract }>(cachePath);
    if (cached && typeof cached === 'object' && cached.language) {
      if (cached.cacheContract?.version !== STACK_CACHE_CONTRACT_VERSION) {
        writeStackCache(projectRoot, cachePath, cached);
      }
      return cached;
    }
  }

  const stack = detectFresh(projectRoot);
  writeStackCache(projectRoot, cachePath, stack);

  return stack;
}

function writeStackCache(projectRoot: string, cachePath: string, stack: ProjectStack): void {
  try {
    const cacheDir = path.dirname(cachePath);
    fs.mkdirSync(cacheDir, { recursive: true });
    const cacheContract: StackCacheContract = {
      version: STACK_CACHE_CONTRACT_VERSION,
      workspaceAuthorityDigest: workspaceAuthorityDigest(projectRoot),
    };
    fs.writeFileSync(cachePath, JSON.stringify({ ...stack, cacheContract }, null, 2), 'utf8');
  } catch (e) {
    debugLog('detectProjectStack:writeCache', e);
  }
}

// ─── isStackStale ─────────────────────────────────────────────────────────

/**
 * Check if the cached project-stack.json is stale by comparing mtime
 * of monitored files (package.json, tsconfig.json, etc.) against the cache file.
 */
export function isStackStale(projectRoot: string): boolean {
  const cachePath = path.join(projectRoot, CACHE_FILE);

  if (!fs.existsSync(cachePath)) return true;

  let cacheStat: fs.Stats;
  try {
    cacheStat = fs.statSync(cachePath);
  } catch (e) {
    debugLog('isStackStale:statSync', e);
    return true;
  }

  const cacheMtime = cacheStat.mtimeMs;

  const cached = readJsonSafe<ProjectStack & { cacheContract?: StackCacheContract }>(cachePath);
  // Legacy caches remain usable for one read when their monitored mtimes are
  // fresh; detectProjectStack rewrites them immediately with the versioned
  // authority digest. Versioned caches fail closed on schema/digest drift.
  if (cached?.cacheContract) {
    if (
      cached.cacheContract.version !== STACK_CACHE_CONTRACT_VERSION
      || cached.cacheContract.workspaceAuthorityDigest !== workspaceAuthorityDigest(projectRoot)
    ) return true;
  }

  for (const file of CACHE_CHECK_FILES) {
    const filePath = path.join(projectRoot, file);
    try {
      const fileStat = fs.statSync(filePath);
      if (fileStat.mtimeMs > cacheMtime) return true;
    } catch {
      // Monitored file absent — expected for most project types (a TS project
      // has no Cargo.toml/go.mod/etc.). Not an error, so it must not be logged
      // to ERRORS.md (see analyzer.ts getConfigMtime for the same pattern).
    }
  }

  return false;
}

// ─── refreshStack ──────────────────────────────────────────────────────────

/**
 * Force re-detection of the project stack, ignoring cache.
 */
export function refreshStack(projectRoot: string): ProjectStack {
  const cachePath = path.join(projectRoot, CACHE_FILE);

  // Remove existing cache to force re-detection
  try {
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  } catch (e) {
    debugLog('refreshStack:unlinkSync', e);
  }

  return detectProjectStack(projectRoot);
}

// ─── detectFullStack ───────────────────────────────────────────────────────

/**
 * Full stack detection with command mapping.
 * Returns language, framework, buildTool, testFramework, and associated commands.
 */
export function detectFullStack(projectRoot: string): FullStackResult {
  const stack = detectProjectStack(projectRoot);

  const commandKey = resolveCommandKey(stack.language, stack.buildTool);
  const commands = STACK_COMMANDS[commandKey] ?? { build: '', test: '', lint: '', typecheck: '' };

  return {
    language: stack.language,
    framework: stack.framework,
    buildTool: stack.buildTool,
    testFramework: stack.testFramework,
    commands,
    detectedLanguages: stack.detectedLanguages,
  };
}

// ─── Internal: resolve STACK_COMMANDS key ─────────────────────────────────

function resolveCommandKey(language: string, buildTool: string): string {
  if (language === 'java' && buildTool === 'maven') return 'java_maven';
  if (language === 'java' && buildTool === 'gradle') return 'java_gradle';
  if ((language === 'c' || language === 'cpp') && buildTool === 'cmake') return 'c_cmake';
  if ((language === 'c' || language === 'cpp') && buildTool === 'make') return 'c_make';
  if ((language === 'c' || language === 'cpp') && buildTool === 'meson') return 'c_make'; // meson uses make-like commands
  if (language === 'rust') return 'rust';
  if (language === 'go') return 'go';
  if (language === 'python') return 'python';
  if (language === 'typescript') return 'typescript';
  return language;
}

// ─── IDENTITY.md language feed ──────────────────────────────────────────────

const IDENTITY_LANG_MAP: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'javascript',
  go: 'go',
  golang: 'go',
  rust: 'rust',
  python: 'python',
  java: 'java',
  kotlin: 'kotlin',
  ruby: 'ruby',
  php: 'php',
  dart: 'dart',
  flutter: 'flutter',
  'c#': 'csharp',
  csharp: 'csharp',
  dotnet: 'csharp',
  swift: 'swift',
  'c++': 'cpp',
  cpp: 'cpp',
  c: 'c',
};

/**
 * Read the `Language:` line plus its provenance class from workspace identity.
 * Init-generated values are cache hints; explicit user/legacy declarations may
 * participate as project authority. Returns undefined for absent/unrecognized data.
 */
interface IdentityLanguageObservation {
  language: string;
  authority: 'user' | 'detected' | 'legacy-user';
}

function readIdentityLanguage(projectRoot: string): IdentityLanguageObservation | undefined {
  const identityPath = path.join(projectRoot, '.deckent', 'workspace', 'IDENTITY.md');
  if (!fs.existsSync(identityPath)) return undefined;
  try {
    const content = fs.readFileSync(identityPath, 'utf-8');
    const match = content.match(/^Language:\s*(.+)$/m);
    if (!match || !match[1]) return undefined;
    const raw = match[1].trim();
    const first = raw.split(/[\s(]/)[0]?.toLowerCase() ?? '';
    const language = IDENTITY_LANG_MAP[first];
    if (!language) return undefined;
    const authorityMatch = content.match(/^Language Authority:\s*(user|detected)$/mi);
    const authority = authorityMatch?.[1]?.toLowerCase() === 'detected'
      ? 'detected'
      : authorityMatch?.[1]?.toLowerCase() === 'user'
        ? 'user'
        : 'legacy-user';
    return { language, authority };
  } catch (e) {
    debugLog('readIdentityLanguage:readFile', e);
    return undefined;
  }
}

// ─── Config language override ───────────────────────────────────────────────

function readConfigLanguageOverride(projectRoot: string): string | undefined {
  try {
    const configPath = path.join(projectRoot, '.deckent', 'config.json');
    if (!fs.existsSync(configPath)) return undefined;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const lang = config['language_override'] as string | undefined;
    // Only return if it's a known STACK_COMMANDS key
    if (lang && typeof lang === 'string' && lang in STACK_COMMANDS) return lang;
    return undefined;
  } catch (e) {
    debugLog('getLanguageOverride:readConfig', e);
    return undefined;
  }
}

// ─── Source file counting for mixed-language projects ──────────────────────

const LANG_EXTENSIONS: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx', '.mjs'],
  python: ['.py'],
  go: ['.go'],
  rust: ['.rs'],
  csharp: ['.cs'],
  java: ['.java'],
  kotlin: ['.kt', '.kts'],
  swift: ['.swift'],
  ruby: ['.rb'],
  php: ['.php'],
  dart: ['.dart'],
};

function countSourceFiles(projectRoot: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.deckent', '.brain', '__pycache__', '.venv', 'venv', '.next']);

  function walk(dir: string, depth: number): void {
    if (depth > 4) return; // max 4 levels deep for performance
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch (e) { debugLog('countLanguageFiles:readdirSync', e); return; }
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (skipDirs.has(entry)) continue;
      const full = path.join(dir, entry);
      let stat: fs.Stats;
      try { stat = fs.statSync(full); } catch (e) { debugLog('countLanguageFiles:statSync', e); continue; }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else {
        const ext = path.extname(entry).toLowerCase();
        for (const [lang, exts] of Object.entries(LANG_EXTENSIONS)) {
          if (exts.includes(ext)) {
            counts[lang] = (counts[lang] ?? 0) + 1;
            break;
          }
        }
      }
    }
  }

  walk(projectRoot, 0);
  return counts;
}

// ─── Internal: fresh detection ─────────────────────────────────────────────

function detectFresh(projectRoot: string): ProjectStack {
  let language = 'unknown';
  let framework = 'unknown';
  const dependencies: string[] = [];
  let buildTool = 'unknown';
  let testFramework = 'unknown';

  // Read package.json
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg: Record<string, unknown> = readJsonSafe<Record<string, unknown>>(pkgPath) ?? {};

  const allDeps = {
    ...(pkg['dependencies'] as Record<string, string> | undefined) ?? {},
    ...(pkg['devDependencies'] as Record<string, string> | undefined) ?? {},
  };
  const depNames = Object.keys(allDeps);
  dependencies.push(...depNames);

  // F) Scan sub-directory package.json files for additional dependencies
  const subProjects = scanSubProjectPackageJsons(projectRoot);
  for (const subPkg of subProjects) {
    const sp = readJsonSafe<Record<string, unknown>>(subPkg.path) ?? {};
    const subDeps = {
      ...(sp['dependencies'] as Record<string, string> | undefined) ?? {},
      ...(sp['devDependencies'] as Record<string, string> | undefined) ?? {},
    };
    for (const dep of Object.keys(subDeps)) {
      if (!depNames.includes(dep)) {
        depNames.push(dep);
        dependencies.push(dep);
      }
    }
  }

  // ─── Language detection ──────────────────────────────────────────────────

  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  const hasPomXml = fs.existsSync(path.join(projectRoot, 'pom.xml'));
  const hasBuildGradle = fs.existsSync(path.join(projectRoot, 'build.gradle'));
  const hasCMakeLists = fs.existsSync(path.join(projectRoot, 'CMakeLists.txt'));
  const hasMakefile = fs.existsSync(path.join(projectRoot, 'Makefile'));
  const hasMesonBuild = fs.existsSync(path.join(projectRoot, 'meson.build'));
  const hasGoMod = fs.existsSync(path.join(projectRoot, 'go.mod'));
  const hasCargoToml = fs.existsSync(path.join(projectRoot, 'Cargo.toml'));
  const hasPyprojectToml = fs.existsSync(path.join(projectRoot, 'pyproject.toml'));
  const hasSetupPy = fs.existsSync(path.join(projectRoot, 'setup.py'));
  const hasRequirementsTxt = fs.existsSync(path.join(projectRoot, 'requirements.txt'));
  const hasPipfile = fs.existsSync(path.join(projectRoot, 'Pipfile'));
  const hasPython = hasPyprojectToml || hasSetupPy || hasRequirementsTxt || hasPipfile;
  let hasCsproj = false;
  try { hasCsproj = fs.readdirSync(projectRoot).some(f => f.endsWith('.csproj') || f.endsWith('.sln')); } catch (e) { debugLog('detectFresh:hasCsproj', e); }
  const hasSwiftPackage = fs.existsSync(path.join(projectRoot, 'Package.swift'));
  const hasGemfile = fs.existsSync(path.join(projectRoot, 'Gemfile'));
  const hasComposer = fs.existsSync(path.join(projectRoot, 'composer.json'));
  const hasPubspec = fs.existsSync(path.join(projectRoot, 'pubspec.yaml'));
  const kotlinDir = path.join(projectRoot, 'src', 'main', 'kotlin');
  const hasKotlin = hasBuildGradle && fs.existsSync(kotlinDir);

  // ─── Language Authority Stack ────────────────────────────────────────
  //
  // Layer 0: explicit config.language_override — current user authority
  // Layer 1: user-authored/legacy IDENTITY Language declaration
  // Layer 2: exclusive framework config (Cargo.toml, go.mod → single-lang)
  // Layer 3: file-count weighted source evidence
  // Layer 4: init-detected IDENTITY value only as a last-resort cache hint
  //
  const hasTS = fs.existsSync(tsconfigPath) || depNames.includes('typescript');
  const hasJS = fs.existsSync(pkgPath) && depNames.length > 0;
  const identityLanguage = readIdentityLanguage(projectRoot);
  const configLanguage = readConfigLanguageOverride(projectRoot);

  // Layer 0: explicit config override always wins over projections/caches.
  if (configLanguage) {
    language = configLanguage;
  }
  // Layer 1: user-authored identity is declarative project authority. Identity
  // created by init's detector is not — it may be stale after a repository move.
  else if (identityLanguage && identityLanguage.authority !== 'detected') {
    language = identityLanguage.language;
  }
  // Layer 2: Exclusive framework configs (these are unambiguous single-lang signals)
  else if (hasCargoToml) { language = 'rust'; }
  else if (hasGoMod) { language = 'go'; }
  else if (hasCsproj) { language = 'csharp'; }
  else if (hasSwiftPackage) { language = 'swift'; }
  else if (hasPubspec) { language = fs.existsSync(path.join(projectRoot, 'lib')) ? 'flutter' : 'dart'; }
  // Layer 3: Ambiguous — multiple markers exist, use file counting
  else {
    const counts = countSourceFiles(projectRoot);
    const totalFiles = Object.values(counts).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const topLang = sorted[0]?.[0];
    const topCount = sorted[0]?.[1] ?? 0;
    const secondCount = sorted[1]?.[1] ?? 0;

    if (totalFiles < 3) {
      // Layer 4: Insufficient data — use config file signals only
      if (hasPython) { language = 'python'; }
      else if (hasTS) { language = 'typescript'; }
      else if (hasPomXml || hasBuildGradle) { language = hasKotlin ? 'kotlin' : 'java'; }
      else if (hasGemfile) { language = 'ruby'; }
      else if (hasComposer) { language = 'php'; }
      else if (hasJS) { language = 'javascript'; }
      else if (hasCMakeLists || hasMesonBuild) { language = detectCOrCpp(projectRoot); }
      else if (hasMakefile) { const c = detectCOrCpp(projectRoot); if (c !== 'unknown') language = c; }
      // else: language stays 'unknown' — build checks will be skipped
    } else if (topLang && topCount > 0) {
      // Dominant language: top language has >60% of files OR 2x more than second
      const dominanceRatio = topCount / totalFiles;
      if (dominanceRatio >= 0.6 || topCount >= secondCount * 2) {
        language = topLang;
      } else {
        // Mixed project — use strongest config signal as tiebreaker
        if (hasPython && counts['python']) { language = 'python'; }
        else if (hasTS && counts['typescript']) { language = 'typescript'; }
        else if (topLang) { language = topLang; }
      }
    }
  }

  if (language === 'unknown' && identityLanguage?.authority === 'detected') {
    language = identityLanguage.language;
  }

  // E) Multi-language detection — collect all detected language markers
  const detectedLanguages = detectAllLanguages(projectRoot, depNames, {
    hasPython, hasPomXml, hasBuildGradle, hasCargoToml, hasGoMod,
    hasCMakeLists, hasMesonBuild, hasMakefile,
  });

  // G) Merge non-JS language markers found in sub-project directories (monorepo support)
  const subProjectLangList = scanSubProjectLanguages(projectRoot);
  for (const lang of subProjectLangList) {
    if (!detectedLanguages.includes(lang)) {
      detectedLanguages.push(lang);
    }
  }

  // ─── Framework detection ─────────────────────────────────────────────────

  // JS/TS frameworks (from package.json deps) — skip for non-JS/TS primary languages
  // Prevents Python/Go/Rust projects with sub-project package.json from getting 'next'/'react'
  const isJsTsPrimary = !['python', 'go', 'rust', 'java', 'c#', 'swift', 'ruby', 'php', 'dart', 'kotlin'].includes(language);
  if (isJsTsPrimary) {
    if (depNames.includes('next')) framework = 'next';
    else if (depNames.includes('react')) framework = 'react';
    else if (depNames.includes('vue')) framework = 'vue';
    else if (depNames.includes('@angular/core')) framework = 'angular';
    else if (depNames.includes('svelte')) framework = 'svelte';
    else if (depNames.includes('@nestjs/core')) framework = 'nest';
    else if (depNames.includes('express')) framework = 'express';
    else if (depNames.includes('fastify')) framework = 'fastify';
  }

  // G) Sub-project framework detection: when root has no framework, scan sub-projects
  // This generalizes the pattern: sub-project deps already merged into depNames via
  // scanSubProjectPackageJsons(), but we also keep an existsSync-based fallback for
  // the well-known src/dashboard path so tests using direct existsSync mocks continue to work.
  if (framework === 'unknown') {
    const dashboardPkgPath = path.join(projectRoot, 'src', 'dashboard', 'package.json');
    if (fs.existsSync(dashboardPkgPath)) {
      const dashboardPkg = readJsonSafe<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(dashboardPkgPath);
      if (dashboardPkg) {
        const dashboardDeps = { ...(dashboardPkg.dependencies ?? {}), ...(dashboardPkg.devDependencies ?? {}) };
        if ('react' in dashboardDeps) framework = 'react';
        else if ('vue' in dashboardDeps) framework = 'vue';
        else if ('next' in dashboardDeps) framework = 'next';
        else if ('svelte' in dashboardDeps) framework = 'svelte';
      }
    }
  }

  // Python frameworks
  if (language === 'python' && framework === 'unknown') {
    framework = detectPythonFramework(projectRoot);
  }

  // Java frameworks (Spring)
  if (language === 'java' && framework === 'unknown') {
    framework = detectJavaFramework(projectRoot, hasPomXml, hasBuildGradle);
  }

  // ─── Test framework detection ────────────────────────────────────────────

  if (depNames.includes('vitest') || fs.existsSync(path.join(projectRoot, 'vitest.config.ts')) || fs.existsSync(path.join(projectRoot, 'vitest.config.js'))) {
    testFramework = 'vitest';
  } else if (depNames.includes('jest') || fs.existsSync(path.join(projectRoot, 'jest.config.ts')) || fs.existsSync(path.join(projectRoot, 'jest.config.js'))) {
    testFramework = 'jest';
  } else if (depNames.includes('mocha')) {
    testFramework = 'mocha';
  } else if (depNames.includes('pytest') || fs.existsSync(path.join(projectRoot, 'pytest.ini'))) {
    testFramework = 'pytest';
  } else if (language === 'python') {
    testFramework = detectPythonTestFramework(projectRoot);
  } else if (language === 'java') {
    testFramework = detectJavaTestFramework(projectRoot, hasPomXml, hasBuildGradle);
  } else if (language === 'go') {
    testFramework = detectGoTestFramework(projectRoot);
  } else if (language === 'rust') {
    testFramework = 'cargo_test';
  } else if (language === 'c' || language === 'cpp') {
    testFramework = hasCMakeLists ? 'ctest' : 'unknown';
  }

  // ─── Build tool detection ───────────────────────────────────────────────

  if (depNames.includes('vite')) buildTool = 'vite';
  else if (depNames.includes('webpack')) buildTool = 'webpack';
  else if (depNames.includes('esbuild')) buildTool = 'esbuild';
  else if (depNames.includes('turbo')) buildTool = 'turbo';
  else if (language === 'typescript') buildTool = 'tsc';
  else if (language === 'rust') buildTool = 'cargo';
  else if (language === 'go') buildTool = 'go';
  else if (language === 'python') buildTool = 'setuptools';
  else if (language === 'java' && hasPomXml) buildTool = 'maven';
  else if (language === 'java' && hasBuildGradle) buildTool = 'gradle';
  else if ((language === 'c' || language === 'cpp') && hasCMakeLists) buildTool = 'cmake';
  else if ((language === 'c' || language === 'cpp') && hasMesonBuild) buildTool = 'meson';
  else if ((language === 'c' || language === 'cpp') && hasMakefile) buildTool = 'make';

  return {
    language,
    framework,
    dependencies: depNames.slice(0, 200), // G) Cap raised from 50 to 200
    buildTool,
    testFramework,
    detectedAt: new Date().toISOString(),
    detectedLanguages,
    subProjects: subProjects.map(sp => sp.relativePath),
  };
}

// ─── Internal: C vs C++ detection ──────────────────────────────────────────

function detectCOrCpp(projectRoot: string): string {
  // Check CMakeLists.txt for CXX or cpp hints
  const cmakePath = path.join(projectRoot, 'CMakeLists.txt');
  if (fs.existsSync(cmakePath)) {
    try {
      const content = fs.readFileSync(cmakePath, 'utf8');
      if (content.includes('CXX') || content.includes('cpp') || content.includes('c++')) {
        return 'cpp';
      }
      if (content.includes('project(') || content.includes('add_executable')) {
        return 'c'; // default to C if CMake exists but no CXX hints
      }
    } catch (e) {
      debugLog('detectCOrCpp:readCMake', e);
    }
  }

  // Check for .cpp, .cc, .cxx files in root
  try {
    const files = fs.readdirSync(projectRoot);
    const hasCpp = files.some(f => /\.(cpp|cc|cxx|hpp|hxx)$/.test(f));
    if (hasCpp) return 'cpp';
    const hasC = files.some(f => /\.(c|h)$/.test(f));
    if (hasC) return 'c';
  } catch (e) {
    debugLog('detectCOrCpp:readdirSync', e);
  }

  return 'unknown';
}

// ─── Internal: Python framework detection ──────────────────────────────────

function detectPythonFramework(projectRoot: string): string {
  // Check for manage.py → django
  if (fs.existsSync(path.join(projectRoot, 'manage.py'))) {
    return 'django';
  }

  // Check pyproject.toml and requirements.txt for flask/fastapi/django imports
  const filesToCheck = ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py'];
  for (const fileName of filesToCheck) {
    const filePath = path.join(projectRoot, fileName);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('django') || content.includes('Django')) return 'django';
        if (content.includes('fastapi') || content.includes('FastAPI')) return 'fastapi';
        if (content.includes('flask') || content.includes('Flask')) return 'flask';
      } catch (e) {
        debugLog('detectPythonFramework:readFile', e);
      }
    }
  }

  return 'unknown';
}

// ─── Internal: Python test framework detection ─────────────────────────────

function detectPythonTestFramework(projectRoot: string): string {
  // pytest.ini or conftest.py → pytest
  if (fs.existsSync(path.join(projectRoot, 'pytest.ini')) ||
      fs.existsSync(path.join(projectRoot, 'conftest.py'))) {
    return 'pytest';
  }

  // Check pyproject.toml for pytest
  const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      if (content.includes('pytest')) return 'pytest';
    } catch (e) {
      debugLog('detectPythonTestFramework:readPyproject', e);
    }
  }

  // Check requirements.txt for pytest
  const reqPath = path.join(projectRoot, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      const content = fs.readFileSync(reqPath, 'utf8');
      if (content.includes('pytest')) return 'pytest';
    } catch (e) {
      debugLog('detectPythonTestFramework:readRequirements', e);
    }
  }

  return 'unittest';
}

// ─── Internal: Java test framework detection ───────────────────────────────

function detectJavaTestFramework(projectRoot: string, hasPomXml: boolean, hasBuildGradle: boolean): string {
  const filesToCheck: string[] = [];
  if (hasPomXml) filesToCheck.push('pom.xml');
  if (hasBuildGradle) filesToCheck.push('build.gradle');

  for (const fileName of filesToCheck) {
    const filePath = path.join(projectRoot, fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('junit') || content.includes('JUnit')) return 'junit';
    } catch (e) {
      debugLog('detectJavaTestFramework:readFile', e);
    }
  }

  return 'unknown';
}

// ─── Internal: Java framework detection ────────────────────────────────────

function detectJavaFramework(projectRoot: string, hasPomXml: boolean, hasBuildGradle: boolean): string {
  const filesToCheck: string[] = [];
  if (hasPomXml) filesToCheck.push('pom.xml');
  if (hasBuildGradle) filesToCheck.push('build.gradle');

  for (const fileName of filesToCheck) {
    const filePath = path.join(projectRoot, fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('spring-boot-starter') || content.includes('spring-boot')) return 'spring';
    } catch (e) {
      debugLog('detectJavaFramework:readFile', e);
    }
  }

  return 'unknown';
}

// ─── Internal: Go test framework detection ─────────────────────────────────

function detectGoTestFramework(projectRoot: string): string {
  try {
    const files = fs.readdirSync(projectRoot);
    const hasTestFiles = files.some(f => f.endsWith('_test.go'));
    if (hasTestFiles) return 'go_test';
  } catch (e) {
    debugLog('detectGoTestFramework:readdirSync', e);
  }
  return 'unknown';
}

// ─── Internal: E) Multi-language detection ──────────────────────────────────

interface LanguageFlags {
  hasPython: boolean;
  hasPomXml: boolean;
  hasBuildGradle: boolean;
  hasCargoToml: boolean;
  hasGoMod: boolean;
  hasCMakeLists: boolean;
  hasMesonBuild: boolean;
  hasMakefile: boolean;
}

function detectAllLanguages(
  projectRoot: string,
  depNames: string[],
  flags: LanguageFlags,
): string[] {
  const languages: string[] = [];
  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  const pkgPath = path.join(projectRoot, 'package.json');

  if (fs.existsSync(tsconfigPath) || depNames.includes('typescript')) languages.push('typescript');
  else if (fs.existsSync(pkgPath) && depNames.length > 0) languages.push('javascript');

  if (flags.hasPython) languages.push('python');
  if (flags.hasPomXml || flags.hasBuildGradle) languages.push('java');
  if (flags.hasCargoToml) languages.push('rust');
  if (flags.hasGoMod) languages.push('go');
  if (flags.hasCMakeLists || flags.hasMesonBuild || flags.hasMakefile) {
    const cLang = detectCOrCpp(projectRoot);
    if (cLang !== 'unknown') languages.push(cLang);
  }

  return languages.length > 0 ? languages : ['unknown'];
}

// ─── Internal: G) Sub-project non-JS language scanner ────────────────────────

const SUB_PROJECT_LANGUAGE_MARKERS: Array<{ file: string; language: string }> = [
  { file: 'Cargo.toml', language: 'rust' },
  { file: 'go.mod', language: 'go' },
  { file: 'pyproject.toml', language: 'python' },
  { file: 'setup.py', language: 'python' },
  { file: 'requirements.txt', language: 'python' },
  { file: 'pom.xml', language: 'java' },
  { file: 'build.gradle', language: 'java' },
];

/**
 * G) Scan sub-directories (up to 2 levels deep) for non-JS language markers.
 * Used for monorepo detection — e.g. a TypeScript root with a Rust or Python sub-project.
 */
function scanSubProjectLanguages(projectRoot: string): string[] {
  const languages = new Set<string>();
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.deckent', 'coverage']);

  function scanDir(dirPath: string, depth: number): void {
    if (depth > 2) return;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || skipDirs.has(entry.name)) continue;
        const subDir = path.join(dirPath, entry.name);
        for (const marker of SUB_PROJECT_LANGUAGE_MARKERS) {
          if (fs.existsSync(path.join(subDir, marker.file))) {
            languages.add(marker.language);
          }
        }
        scanDir(subDir, depth + 1);
      }
    } catch (e) {
      debugLog('scanSubProjectLanguages:readdirSync', e);
    }
  }

  scanDir(projectRoot, 0);
  return Array.from(languages);
}

// ─── Internal: F) Sub-directory package.json scanner ────────────────────────

interface SubProject {
  path: string;
  relativePath: string;
}

function scanSubProjectPackageJsons(projectRoot: string): SubProject[] {
  const results: SubProject[] = [];
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.deckent', 'coverage']);

  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || skipDirs.has(entry.name)) continue;
      const subPkgPath = path.join(projectRoot, entry.name, 'package.json');
      if (fs.existsSync(subPkgPath)) {
        results.push({ path: subPkgPath, relativePath: entry.name });
      }
      // Also check one level deeper (e.g., src/dashboard/package.json)
      try {
        const subEntries = fs.readdirSync(path.join(projectRoot, entry.name), { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory() || skipDirs.has(subEntry.name)) continue;
          const deepPkgPath = path.join(projectRoot, entry.name, subEntry.name, 'package.json');
          if (fs.existsSync(deepPkgPath)) {
            results.push({ path: deepPkgPath, relativePath: `${entry.name}/${subEntry.name}` });
          }
        }
      } catch (e) {
        debugLog('scanSubProjectPackageJsons:subReaddirSync', e);
      }
    }
  } catch (e) {
    debugLog('scanSubProjectPackageJsons:readdirSync', e);
  }

  return results;
}
