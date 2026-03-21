/**
 * prepublish.ts — Build validation, dist/ cleanup check, file size check
 * Exports testable functions for pre-publish validation.
 */

import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

export interface PrepublishResult {
  ok: boolean;
  checks: CheckResult[];
}

export interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
}

/**
 * Validate that package.json has all required fields for publishing.
 */
export function validatePackageJson(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];
  const pkgPath = join(projectRoot, 'package.json');

  if (!existsSync(pkgPath)) {
    return [{ name: 'package.json exists', ok: false, message: 'package.json not found' }];
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;

  // Check required fields
  const requiredFields = ['name', 'version', 'description', 'license', 'main', 'types'];
  for (const field of requiredFields) {
    results.push({
      name: `package.json has ${field}`,
      ok: typeof pkg[field] === 'string' && (pkg[field] as string).length > 0,
      message: typeof pkg[field] === 'string' ? `${field}: ${pkg[field]}` : `Missing ${field}`,
    });
  }

  // Check bin field
  const bin = pkg['bin'] as Record<string, string> | undefined;
  results.push({
    name: 'package.json has bin.deckent',
    ok: !!bin && typeof bin['deckent'] === 'string',
    message: bin?.['deckent'] ? `bin.deckent: ${bin['deckent']}` : 'Missing bin.deckent',
  });
  results.push({
    name: 'package.json has bin.deckent-mcp',
    ok: !!bin && typeof bin['deckent-mcp'] === 'string',
    message: bin?.['deckent-mcp'] ? `bin.deckent-mcp: ${bin['deckent-mcp']}` : 'Missing bin.deckent-mcp',
  });

  // Check engines
  const engines = pkg['engines'] as Record<string, string> | undefined;
  results.push({
    name: 'package.json has engines.node',
    ok: !!engines && typeof engines['node'] === 'string',
    message: engines?.['node'] ? `engines.node: ${engines['node']}` : 'Missing engines.node',
  });

  // Check files field
  const files = pkg['files'] as string[] | undefined;
  results.push({
    name: 'package.json has files field',
    ok: Array.isArray(files) && files.length > 0,
    message: Array.isArray(files) ? `files: [${files.join(', ')}]` : 'Missing files field',
  });

  // Check that files includes required entries
  const requiredFiles = ['dist', 'README.md', 'LICENSE'];
  for (const rf of requiredFiles) {
    results.push({
      name: `files includes ${rf}`,
      ok: Array.isArray(files) && files.some(f => f === rf || f.startsWith(rf + '/')),
      message: Array.isArray(files) && files.includes(rf) ? `${rf} included` : `${rf} missing from files`,
    });
  }

  // Check license
  results.push({
    name: 'license is MIT',
    ok: pkg['license'] === 'MIT',
    message: `license: ${pkg['license']}`,
  });

  return results;
}

/**
 * Check that dist/ directory exists and is not empty.
 */
export function checkDistDirectory(projectRoot: string): CheckResult {
  const distPath = join(projectRoot, 'dist');

  if (!existsSync(distPath)) {
    return { name: 'dist/ exists', ok: false, message: 'dist/ directory not found. Run tsc first.' };
  }

  const files = readdirSync(distPath, { recursive: true });
  if (files.length === 0) {
    return { name: 'dist/ not empty', ok: false, message: 'dist/ is empty' };
  }

  return { name: 'dist/ exists and has content', ok: true, message: `dist/ has ${files.length} files` };
}

/**
 * Check total file size of dist/ directory.
 * Warns if over maxSizeMB.
 */
export function checkDistSize(projectRoot: string, maxSizeMB: number = 50): CheckResult {
  const distPath = join(projectRoot, 'dist');

  if (!existsSync(distPath)) {
    return { name: 'dist/ size check', ok: false, message: 'dist/ not found' };
  }

  let totalSize = 0;
  const files = readdirSync(distPath, { recursive: true });
  for (const file of files) {
    const filePath = join(distPath, file.toString());
    try {
      const stat = statSync(filePath);
      if (stat.isFile()) {
        totalSize += stat.size;
      }
    } catch {
      // skip
    }
  }

  const sizeMB = totalSize / (1024 * 1024);
  const ok = sizeMB < maxSizeMB;

  return {
    name: 'dist/ size check',
    ok,
    message: ok
      ? `dist/ size: ${sizeMB.toFixed(2)}MB (under ${maxSizeMB}MB limit)`
      : `WARNING: dist/ size ${sizeMB.toFixed(2)}MB exceeds ${maxSizeMB}MB`,
  };
}

/**
 * Validate that tsc builds without errors.
 */
export function checkBuild(projectRoot: string): CheckResult {
  try {
    execSync('npx tsc --noEmit', { cwd: projectRoot, stdio: 'pipe', encoding: 'utf-8' });
    return { name: 'tsc build check', ok: true, message: 'TypeScript compilation successful' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Build failed';
    return { name: 'tsc build check', ok: false, message: `Build failed: ${message.slice(0, 200)}` };
  }
}

/**
 * Run all prepublish checks.
 */
export function runPrepublishChecks(projectRoot: string): PrepublishResult {
  const checks: CheckResult[] = [];

  checks.push(...validatePackageJson(projectRoot));
  checks.push(checkDistDirectory(projectRoot));
  checks.push(checkDistSize(projectRoot));

  const ok = checks.every(c => c.ok);
  return { ok, checks };
}
