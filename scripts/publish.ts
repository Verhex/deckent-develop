/**
 * publish.ts — Full publish pipeline
 * 1) git status clean, 2) tsc build, 3) vitest run, 4) npm pack check,
 * 5) version bump, 6) git tag, 7) npm publish
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PublishResult {
  ok: boolean;
  steps: PublishStep[];
}

export interface PublishStep {
  name: string;
  ok: boolean;
  message: string;
  skipped?: boolean;
}

export type BumpType = 'major' | 'minor' | 'patch';

/**
 * Check that git working tree is clean.
 */
export function checkGitClean(projectRoot: string): PublishStep {
  try {
    const status = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf-8' });
    const clean = status.trim().length === 0;
    return {
      name: 'git clean',
      ok: clean,
      message: clean ? 'Working tree is clean' : `Uncommitted changes:\n${status.trim()}`,
    };
  } catch (err: unknown) {
    return { name: 'git clean', ok: false, message: `git status failed: ${err}` };
  }
}

/**
 * Run tsc build.
 */
export function runTscBuild(projectRoot: string): PublishStep {
  try {
    execSync('npx tsc', { cwd: projectRoot, stdio: 'pipe', encoding: 'utf-8' });
    return { name: 'tsc build', ok: true, message: 'Build successful' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : 'Unknown error';
    return { name: 'tsc build', ok: false, message: `Build failed: ${msg}` };
  }
}

/**
 * Run vitest.
 */
export function runTests(projectRoot: string): PublishStep {
  try {
    execSync('npx vitest run', { cwd: projectRoot, stdio: 'pipe', encoding: 'utf-8' });
    return { name: 'vitest', ok: true, message: 'All tests passed' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : 'Unknown error';
    return { name: 'vitest', ok: false, message: `Tests failed: ${msg}` };
  }
}

/**
 * Run npm pack --dry-run and check output.
 */
export function runPackCheck(projectRoot: string): PublishStep {
  try {
    const output = execSync('npm pack --dry-run 2>&1', { cwd: projectRoot, encoding: 'utf-8' });

    // Check for required files
    const requiredInPack = ['dist/index.js', 'README.md', 'LICENSE'];
    const missing = requiredInPack.filter(f => !output.includes(f));

    if (missing.length > 0) {
      return { name: 'npm pack check', ok: false, message: `Missing from pack: ${missing.join(', ')}` };
    }

    return { name: 'npm pack check', ok: true, message: 'Pack output contains required files' };
  } catch (err: unknown) {
    return { name: 'npm pack check', ok: false, message: `npm pack failed: ${err}` };
  }
}

/**
 * Read current version from package.json.
 */
export function readVersion(projectRoot: string): string {
  const pkgPath = join(projectRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}

/**
 * Bump version string based on bump type.
 */
export function bumpVersion(currentVersion: string, bumpType: BumpType): string {
  const parts = currentVersion.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${currentVersion}`);
  }

  let [major, minor, patch] = parts.map(Number) as [number, number, number];

  switch (bumpType) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
  }

  return `${major}.${minor}.${patch}`;
}

/**
 * Write new version to package.json.
 */
export function writeVersion(projectRoot: string, newVersion: string): PublishStep {
  try {
    const pkgPath = join(projectRoot, 'package.json');
    const content = readFileSync(pkgPath, 'utf-8');
    const updated = content.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${newVersion}"`);
    writeFileSync(pkgPath, updated, 'utf-8');
    return { name: 'version bump', ok: true, message: `Version bumped to ${newVersion}` };
  } catch (err: unknown) {
    return { name: 'version bump', ok: false, message: `Failed to write version: ${err}` };
  }
}

/**
 * Create git tag for the version.
 */
export function createGitTag(projectRoot: string, version: string): PublishStep {
  const tag = `v${version}`;
  try {
    execSync(`git add package.json`, { cwd: projectRoot, stdio: 'pipe' });
    execSync(`git commit -m "chore: release ${tag}"`, { cwd: projectRoot, stdio: 'pipe' });
    execSync(`git tag -a ${tag} -m "Release ${version}"`, { cwd: projectRoot, stdio: 'pipe' });
    return { name: 'git tag', ok: true, message: `Created tag ${tag}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
    return { name: 'git tag', ok: false, message: `Git tag failed: ${msg}` };
  }
}

/**
 * Run npm publish.
 */
export function runNpmPublish(projectRoot: string, dryRun: boolean = true): PublishStep {
  const cmd = dryRun ? 'npm publish --dry-run' : 'npm publish';
  try {
    execSync(cmd, { cwd: projectRoot, stdio: 'pipe', encoding: 'utf-8' });
    return {
      name: 'npm publish',
      ok: true,
      message: dryRun ? 'Dry run publish successful' : 'Published to npm',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : 'Unknown error';
    return { name: 'npm publish', ok: false, message: `Publish failed: ${msg}` };
  }
}

/**
 * Validate bump type argument.
 */
export function isValidBumpType(value: string): value is BumpType {
  return ['major', 'minor', 'patch'].includes(value);
}

/**
 * Run the full publish pipeline.
 */
export function runPublish(
  projectRoot: string,
  options: { bumpType: BumpType; forReal?: boolean; skipTests?: boolean }
): PublishResult {
  const steps: PublishStep[] = [];

  // 1. Git clean check
  const gitCheck = checkGitClean(projectRoot);
  steps.push(gitCheck);
  if (!gitCheck.ok) {
    return { ok: false, steps };
  }

  // 2. Build
  const buildCheck = runTscBuild(projectRoot);
  steps.push(buildCheck);
  if (!buildCheck.ok) {
    return { ok: false, steps };
  }

  // 3. Tests
  if (!options.skipTests) {
    const testCheck = runTests(projectRoot);
    steps.push(testCheck);
    if (!testCheck.ok) {
      return { ok: false, steps };
    }
  } else {
    steps.push({ name: 'vitest', ok: true, message: 'Skipped', skipped: true });
  }

  // 4. Pack check
  const packCheck = runPackCheck(projectRoot);
  steps.push(packCheck);
  if (!packCheck.ok) {
    return { ok: false, steps };
  }

  // 5. Version bump
  const currentVersion = readVersion(projectRoot);
  const newVersion = bumpVersion(currentVersion, options.bumpType);
  const versionStep = writeVersion(projectRoot, newVersion);
  steps.push(versionStep);
  if (!versionStep.ok) {
    return { ok: false, steps };
  }

  // 6. Git tag
  const tagStep = createGitTag(projectRoot, newVersion);
  steps.push(tagStep);
  if (!tagStep.ok) {
    return { ok: false, steps };
  }

  // 7. Publish
  const publishStep = runNpmPublish(projectRoot, !options.forReal);
  steps.push(publishStep);

  return { ok: publishStep.ok, steps };
}
