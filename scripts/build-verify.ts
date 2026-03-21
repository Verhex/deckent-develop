/**
 * build-verify.ts — Post-build verification script
 * 1) tsc build check, 2) dist/ required files exist, 3) bin files have shebang,
 * 4) dist/ size < 50MB warning, 5) basic circular dep check
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
}

export interface VerifyCheck {
  name: string;
  ok: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Run tsc --noEmit to verify TypeScript compiles.
 */
export function verifyTscBuild(projectRoot: string): VerifyCheck {
  try {
    execSync('npx tsc --noEmit', { cwd: projectRoot, stdio: 'pipe', encoding: 'utf-8' });
    return { name: 'tsc build', ok: true, message: 'TypeScript compilation successful', severity: 'info' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : 'Unknown error';
    return { name: 'tsc build', ok: false, message: `tsc failed: ${msg}`, severity: 'error' };
  }
}

/**
 * Verify that required files exist in dist/.
 */
export function verifyDistFiles(projectRoot: string, requiredFiles: string[] = [
  'index.js',
  'index.d.ts',
  'cli/index.js',
  'core/constants.js',
]): VerifyCheck[] {
  const results: VerifyCheck[] = [];

  for (const file of requiredFiles) {
    const filePath = join(projectRoot, 'dist', file);
    const exists = existsSync(filePath);
    results.push({
      name: `dist/${file} exists`,
      ok: exists,
      message: exists ? `Found dist/${file}` : `Missing dist/${file}`,
      severity: exists ? 'info' : 'error',
    });
  }

  return results;
}

/**
 * Check that bin files have #!/usr/bin/env node shebang.
 */
export function verifyBinShebangs(projectRoot: string, binFiles: string[] = [
  'dist/cli/index.js',
  'dist/mcp/server.js',
]): VerifyCheck[] {
  const results: VerifyCheck[] = [];

  for (const file of binFiles) {
    const filePath = join(projectRoot, file);
    if (!existsSync(filePath)) {
      results.push({
        name: `shebang: ${file}`,
        ok: false,
        message: `File not found: ${file}`,
        severity: 'error',
      });
      continue;
    }

    const content = readFileSync(filePath, 'utf-8');
    const hasShebang = content.startsWith('#!/usr/bin/env node');
    results.push({
      name: `shebang: ${file}`,
      ok: hasShebang,
      message: hasShebang ? `${file} has correct shebang` : `${file} missing #!/usr/bin/env node shebang`,
      severity: hasShebang ? 'info' : 'error',
    });
  }

  return results;
}

/**
 * Calculate total size of dist/ and warn if too large.
 */
export function verifyDistSize(projectRoot: string, maxSizeMB: number = 50): VerifyCheck {
  const distPath = join(projectRoot, 'dist');

  if (!existsSync(distPath)) {
    return { name: 'dist/ size', ok: false, message: 'dist/ not found', severity: 'error' };
  }

  let totalSize = 0;
  const walkDir = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile()) {
        totalSize += statSync(fullPath).size;
      } else if (entry.isDirectory()) {
        walkDir(fullPath);
      }
    }
  };

  walkDir(distPath);
  const sizeMB = totalSize / (1024 * 1024);
  const ok = sizeMB < maxSizeMB;

  return {
    name: 'dist/ size',
    ok,
    message: `dist/ size: ${sizeMB.toFixed(2)}MB${ok ? '' : ` (exceeds ${maxSizeMB}MB limit)`}`,
    severity: ok ? 'info' : 'warning',
  };
}

/**
 * Basic circular dependency check using import analysis.
 * Scans .js files in dist/ for import patterns that form cycles.
 */
export function checkCircularDeps(projectRoot: string): VerifyCheck {
  const distPath = join(projectRoot, 'dist');

  if (!existsSync(distPath)) {
    return { name: 'circular deps', ok: false, message: 'dist/ not found', severity: 'error' };
  }

  // Build import graph
  const importGraph = new Map<string, string[]>();
  const jsFiles: string[] = [];

  const walkDir = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.js')) {
        jsFiles.push(fullPath);
      } else if (entry.isDirectory()) {
        walkDir(fullPath);
      }
    }
  };

  walkDir(distPath);

  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf-8');
    const imports: string[] = [];
    const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath) {
        imports.push(importPath);
      }
    }
    const relPath = file.slice(distPath.length + 1);
    importGraph.set(relPath, imports);
  }

  // Simple cycle detection using DFS
  const cycles: string[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart).join(' -> ') + ' -> ' + node);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    const deps = importGraph.get(node) ?? [];
    for (const dep of deps) {
      dfs(dep, [...path]);
    }

    inStack.delete(node);
  }

  for (const file of importGraph.keys()) {
    dfs(file, []);
  }

  if (cycles.length > 0) {
    return {
      name: 'circular deps',
      ok: false,
      message: `Found ${cycles.length} potential circular dependency chain(s): ${cycles[0]}`,
      severity: 'warning',
    };
  }

  return {
    name: 'circular deps',
    ok: true,
    message: `No circular dependencies found among ${jsFiles.length} files`,
    severity: 'info',
  };
}

/**
 * Run all build verification checks.
 */
export function runBuildVerify(projectRoot: string): VerifyResult {
  const checks: VerifyCheck[] = [];

  checks.push(...verifyDistFiles(projectRoot));
  checks.push(...verifyBinShebangs(projectRoot));
  checks.push(verifyDistSize(projectRoot));
  checks.push(checkCircularDeps(projectRoot));

  const ok = checks.filter(c => c.severity === 'error').every(c => c.ok);
  return { ok, checks };
}
