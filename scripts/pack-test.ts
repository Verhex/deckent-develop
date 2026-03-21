/**
 * pack-test.ts — Validates npm pack output
 * Checks sensitive files excluded, required files included, total size < 10MB
 */

import { execSync } from 'node:child_process';

export interface PackTestResult {
  ok: boolean;
  checks: PackCheck[];
  files: string[];
  totalSize: string;
}

export interface PackCheck {
  name: string;
  ok: boolean;
  message: string;
}

/**
 * Parse npm pack --dry-run output into file list.
 */
export function parsePackOutput(output: string): { files: string[]; totalSize: string } {
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
  const files: string[] = [];
  let totalSize = '';

  for (const line of lines) {
    // npm pack --dry-run outputs lines like:
    // npm notice === Tarball Contents ===
    // npm notice 1.2kB  dist/index.js
    // npm notice === Tarball Details ===
    // npm notice total files:   42
    // npm notice unpacked size: 123.4 kB

    // Extract file paths
    const fileMatch = line.match(/npm notice\s+[\d.]+\s*[kKmMgG]?B?\s+(.+)/);
    if (fileMatch && fileMatch[1] && !fileMatch[1].startsWith('=') && !fileMatch[1].includes(':')) {
      files.push(fileMatch[1].trim());
    }

    // Extract total size
    const sizeMatch = line.match(/unpacked size:\s+(.+)/);
    if (sizeMatch && sizeMatch[1]) {
      totalSize = sizeMatch[1].trim();
    }
  }

  return { files, totalSize };
}

/**
 * Check that sensitive/development files are excluded from the pack.
 */
export function checkExcludedFiles(files: string[]): PackCheck[] {
  const sensitivePatterns = [
    { pattern: '.brain/', description: '.brain/ directory' },
    { pattern: '.tasks/', description: '.tasks/ directory' },
    { pattern: '.locks/', description: '.locks/ directory' },
    { pattern: '.dashboard', description: '.dashboard file' },
    { pattern: '.deckent/', description: '.deckent/ directory' },
    { pattern: 'tests/', description: 'tests/ directory' },
    { pattern: 'src/', description: 'src/ directory' },
    { pattern: '.git/', description: '.git/ directory' },
    { pattern: '.claude/', description: '.claude/ directory' },
    { pattern: '.test.ts', description: 'test files' },
    { pattern: 'kararlanacakplan.md', description: 'kararlanacakplan.md' },
    { pattern: 'test-output.log', description: 'test log files' },
    { pattern: 'test-mcp-flow.log', description: 'test log files' },
    { pattern: 'tmp-test/', description: 'tmp-test/ directory' },
    { pattern: 'docs/directives/', description: 'docs/directives/' },
  ];

  const results: PackCheck[] = [];

  for (const { pattern, description } of sensitivePatterns) {
    const found = files.some(f => f.includes(pattern));
    results.push({
      name: `excludes ${description}`,
      ok: !found,
      message: found
        ? `SENSITIVE: ${description} found in package (${files.filter(f => f.includes(pattern)).join(', ')})`
        : `${description} correctly excluded`,
    });
  }

  return results;
}

/**
 * Check that required files are included in the pack.
 */
export function checkRequiredFiles(files: string[]): PackCheck[] {
  const requiredPatterns = [
    { pattern: 'dist/', description: 'dist/ directory' },
    { pattern: 'README.md', description: 'README.md' },
    { pattern: 'LICENSE', description: 'LICENSE' },
    { pattern: 'package.json', description: 'package.json' },
    { pattern: 'dist/cli/index.js', description: 'dist/cli/index.js (deckent bin)' },
    { pattern: 'dist/index.js', description: 'dist/index.js (main entry)' },
  ];

  const results: PackCheck[] = [];

  for (const { pattern, description } of requiredPatterns) {
    const found = files.some(f => f.includes(pattern));
    results.push({
      name: `includes ${description}`,
      ok: found,
      message: found ? `${description} included` : `MISSING: ${description} not found in package`,
    });
  }

  return results;
}

/**
 * Parse size string to bytes for comparison.
 */
export function parseSizeToBytes(sizeStr: string): number {
  const match = sizeStr.match(/([\d.]+)\s*(B|kB|KB|MB|GB)/i);
  if (!match) return 0;

  const value = parseFloat(match[1]!);
  const unit = match[2]!.toLowerCase();

  switch (unit) {
    case 'b': return value;
    case 'kb': return value * 1024;
    case 'mb': return value * 1024 * 1024;
    case 'gb': return value * 1024 * 1024 * 1024;
    default: return value;
  }
}

/**
 * Check total package size is under limit.
 */
export function checkPackageSize(totalSize: string, maxSizeMB: number = 10): PackCheck {
  if (!totalSize) {
    return { name: 'package size', ok: true, message: 'Could not determine package size' };
  }

  const bytes = parseSizeToBytes(totalSize);
  const maxBytes = maxSizeMB * 1024 * 1024;
  const ok = bytes < maxBytes;

  return {
    name: 'package size',
    ok,
    message: ok
      ? `Package size: ${totalSize} (under ${maxSizeMB}MB limit)`
      : `WARNING: Package size ${totalSize} exceeds ${maxSizeMB}MB limit`,
  };
}

/**
 * Run npm pack --dry-run and return output.
 */
export function runNpmPackDryRun(projectRoot: string): string {
  return execSync('npm pack --dry-run 2>&1', { cwd: projectRoot, encoding: 'utf-8' });
}

/**
 * Run all pack tests.
 */
export function runPackTest(projectRoot: string): PackTestResult {
  const output = runNpmPackDryRun(projectRoot);
  const { files, totalSize } = parsePackOutput(output);
  const checks: PackCheck[] = [];

  checks.push(...checkExcludedFiles(files));
  checks.push(...checkRequiredFiles(files));
  checks.push(checkPackageSize(totalSize));

  const ok = checks.every(c => c.ok);
  return { ok, checks, files, totalSize };
}
