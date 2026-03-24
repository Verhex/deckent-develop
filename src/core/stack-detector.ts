// ─── Stack Detector ─────────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectStack } from './skill-types.js';
import { readJsonSafe } from './utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_FILE = '.deckent/project-stack.json';
const CACHE_CHECK_FILES = [
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

// ─── STACK_COMMANDS ─────────────────────────────────────────────────────────

export const STACK_COMMANDS: Record<string, { build: string; test: string; lint: string }> = {
  typescript: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
  python: { build: 'python -m py_compile', test: 'pytest', lint: 'ruff check' },
  java_maven: { build: 'mvn compile', test: 'mvn test', lint: '' },
  java_gradle: { build: 'gradle build', test: 'gradle test', lint: '' },
  c_cmake: { build: 'cmake --build build', test: 'ctest --test-dir build', lint: '' },
  c_make: { build: 'make', test: 'make test', lint: '' },
  go: { build: 'go build ./...', test: 'go test ./...', lint: 'golangci-lint run' },
  rust: { build: 'cargo build', test: 'cargo test', lint: 'cargo clippy' },
};

// ─── FullStackResult ────────────────────────────────────────────────────────

export interface FullStackResult {
  language: string;
  framework: string;
  buildTool: string;
  testFramework: string;
  commands: { build: string; test: string; lint: string };
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
    const cached = readJsonSafe<ProjectStack>(cachePath);
    if (cached && typeof cached === 'object' && cached.language) {
      return cached;
    }
  }

  const stack = detectFresh(projectRoot);

  // Write cache
  try {
    const cacheDir = path.dirname(cachePath);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(stack, null, 2), 'utf8');
  } catch {
    // Cache write failure is non-fatal
  }

  return stack;
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
  } catch {
    return true;
  }

  const cacheMtime = cacheStat.mtimeMs;

  for (const file of CACHE_CHECK_FILES) {
    const filePath = path.join(projectRoot, file);
    try {
      const fileStat = fs.statSync(filePath);
      if (fileStat.mtimeMs > cacheMtime) return true;
    } catch {
      // File doesn't exist, not a staleness indicator
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
  } catch {
    // Removal failure is non-fatal
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
  const commands = STACK_COMMANDS[commandKey] ?? { build: '', test: '', lint: '' };

  return {
    language: stack.language,
    framework: stack.framework,
    buildTool: stack.buildTool,
    testFramework: stack.testFramework,
    commands,
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

  if (fs.existsSync(tsconfigPath) || depNames.includes('typescript')) {
    language = 'typescript';
  } else if (fs.existsSync(pkgPath) && depNames.length > 0) {
    language = 'javascript';
  } else if (hasPython) {
    language = 'python';
  } else if (hasPomXml || hasBuildGradle) {
    language = 'java';
  } else if (hasCargoToml) {
    language = 'rust';
  } else if (hasGoMod) {
    language = 'go';
  } else if (hasCMakeLists || hasMesonBuild) {
    // C/C++ detection: check for .cpp/.cc/.cxx files to distinguish C vs C++
    language = detectCOrCpp(projectRoot);
  } else if (hasMakefile) {
    // Makefile alone — could be C/C++; check for source files
    const cLang = detectCOrCpp(projectRoot);
    if (cLang !== 'unknown') {
      language = cLang;
    }
  } else if (fs.existsSync(pkgPath)) {
    language = 'javascript';
  }

  // ─── Framework detection ─────────────────────────────────────────────────

  // JS/TS frameworks (from package.json deps)
  if (depNames.includes('next')) framework = 'next';
  else if (depNames.includes('react')) framework = 'react';
  else if (depNames.includes('vue')) framework = 'vue';
  else if (depNames.includes('@angular/core')) framework = 'angular';
  else if (depNames.includes('svelte')) framework = 'svelte';
  else if (depNames.includes('@nestjs/core')) framework = 'nest';
  else if (depNames.includes('express')) framework = 'express';
  else if (depNames.includes('fastify')) framework = 'fastify';

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
    dependencies: depNames.slice(0, 50), // Cap at 50 to keep cache reasonable
    buildTool,
    testFramework,
    detectedAt: new Date().toISOString(),
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
    } catch {
      // Read failure — fall through
    }
  }

  // Check for .cpp, .cc, .cxx files in root
  try {
    const files = fs.readdirSync(projectRoot);
    const hasCpp = files.some(f => /\.(cpp|cc|cxx|hpp|hxx)$/.test(f));
    if (hasCpp) return 'cpp';
    const hasC = files.some(f => /\.(c|h)$/.test(f));
    if (hasC) return 'c';
  } catch {
    // Readdir failure — fall through
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
      } catch {
        // Read failure — continue
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
    } catch {
      // fall through
    }
  }

  // Check requirements.txt for pytest
  const reqPath = path.join(projectRoot, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      const content = fs.readFileSync(reqPath, 'utf8');
      if (content.includes('pytest')) return 'pytest';
    } catch {
      // fall through
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
    } catch {
      // Read failure — continue
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
    } catch {
      // Read failure — continue
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
  } catch {
    // Readdir failure
  }
  return 'unknown';
}
