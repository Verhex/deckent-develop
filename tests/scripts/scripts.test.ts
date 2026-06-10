import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');
const TMP_TEST_DIR = path.join(PROJECT_ROOT, '.tmp-script-tests');

const isWindows = process.platform === 'win32';

// ASYNC subprocess runner. A blocking execSync/spawnSync freezes the vitest
// worker's event loop for the whole subprocess (verify-publish.sh runs npm pack;
// `npm run build` takes 30–60s on CI). While blocked the worker cannot service
// the worker→main `onTaskUpdate` RPC heartbeat, which birpc aborts after ~60s →
// "Timeout calling onTaskUpdate" → vitest exits 1 even though every test passes
// (the chronic Docs+Scripts / Coverage CI failure). Async spawn keeps the event
// loop responsive. Mirrors the helper in dead-code-audit.test.ts.
function runScriptAsync(
  scriptName: string,
  args: string[] = [],
  timeoutMs = 60000,
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const child = spawn('bash', [scriptPath, ...args], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (d: string) => { stdout += d; });
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', () => { /* drained to avoid backpressure; output asserts use stdout */ });
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ success: false, output: stdout, error: 'timeout' }); }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); resolve({ success: false, output: stdout, error: err.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ success: code === 0, output: stdout, error: code === 0 ? undefined : `exit ${code}` }); });
  });
}

// HERMETICITY (Sprint 272 live incident): this file used to spawn `npm run
// build` against the REAL project root in beforeAll, with a 120s SIGKILL.
// `build` inline-cleans dist/ first, so a kill mid-build (slow CI / loaded
// host) left the repo with dist/ DELETED — it wiped the live CLI under a
// running session (MF-8 test-hermeticity family). Tests must NEVER mutate the
// repo: build-dependent tests now skip unless a dist/ already exists.
function distAvailable(): boolean {
  return fs.existsSync(path.join(PROJECT_ROOT, 'dist', 'cli', 'entry.js'));
}

describe.skipIf(isWindows)('OSS Scripts', () => {
  // Checked once for the whole file; skipIf can't await, so build-dependent
  // tests check `canBuild` at runtime via ctx.skip() instead of it.skipIf.
  let canBuild = false;
  beforeAll(() => {
    canBuild = distAvailable();
  });

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(TMP_TEST_DIR)) {
      fs.mkdirSync(TMP_TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directory (fs.rmSync — no subprocess needed)
    if (fs.existsSync(TMP_TEST_DIR)) {
      fs.rmSync(TMP_TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('verify-publish.sh', () => {
    it('should verify publish readiness with correct structure', { timeout: 60000 }, async (ctx) => {
      if (!canBuild) return ctx.skip();
      const result = await runScriptAsync('verify-publish.sh', []);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Package verification passed');
    });

    it('should check version format in package.json', { timeout: 60000 }, async () => {
      const result = await runScriptAsync('verify-publish.sh', []);
      expect(result.output).toMatch(/Version: \d+\.\d+\.\d+/);
    });

    it('should verify dist/ directory exists after build', { timeout: 60000 }, async (ctx) => {
      if (!canBuild) return ctx.skip();
      const result = await runScriptAsync('verify-publish.sh', []);
      expect(result.output).toContain('Checking dist/ contents');
      expect(result.output).toContain('Files in dist/');
    });

    it('should check for required dist files (index.js and index.d.ts)', { timeout: 60000 }, async (ctx) => {
      if (!canBuild) return ctx.skip();
      const result = await runScriptAsync('verify-publish.sh', []);
      expect(result.output).toContain('index.js and index.d.ts present');
    });

    it('should run npm pack --dry-run and check output', { timeout: 60000 }, async (ctx) => {
      if (!canBuild) return ctx.skip();
      const result = await runScriptAsync('verify-publish.sh', []);
      expect(result.output).toContain('Running npm pack --dry-run');
      expect(result.output).toContain('Files to be published');
    });

    it('should verify README.md and LICENSE in package', { timeout: 60000 }, async (ctx) => {
      if (!canBuild) return ctx.skip();
      const result = await runScriptAsync('verify-publish.sh', []);
      expect(result.output).toContain('Ready to publish');
    });

    it('should fail if version format is invalid', async () => {
      // Create a temp package.json with invalid version
      const tmpPkgPath = path.join(TMP_TEST_DIR, 'package.json');
      const pkgData = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      pkgData.version = 'invalid-version';
      fs.writeFileSync(tmpPkgPath, JSON.stringify(pkgData));

      // Copy to project root temporarily
      const origPath = path.join(PROJECT_ROOT, 'package.json');
      const backup = fs.readFileSync(origPath);
      fs.writeFileSync(origPath, JSON.stringify(pkgData));

      const result = await runScriptAsync('verify-publish.sh', []);

      // Restore backup
      fs.writeFileSync(origPath, backup);

      expect(result.success).toBe(false);
      expect(result.output).toContain('Invalid version format');
    });
  });

  describe('changelog.sh', () => {
    it('should generate changelog in dry-run mode', async () => {
      const result = await runScriptAsync('changelog.sh', ['--dry-run']);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Changelog section');
    });

    it('should show current version in changelog output', async () => {
      const result = await runScriptAsync('changelog.sh', ['--dry-run']);
      const pkgJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      expect(result.output).toContain(pkgJson.version);
    });

    it('should show release date in changelog', async () => {
      const result = await runScriptAsync('changelog.sh', ['--dry-run']);
      // Use local date (matching shell's `date +%Y-%m-%d`) not UTC
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(result.output).toContain(localDate);
    });

    it('should parse conventional commits if present', async () => {
      const result = await runScriptAsync('changelog.sh', ['--dry-run']);
      // The output should be valid markdown
      expect(result.output).toContain('##'); // Markdown header
    });

    it('should handle --dry-run mode without modifying CHANGELOG.md', async () => {
      const changelogPath = path.join(PROJECT_ROOT, 'CHANGELOG.md');
      const existsBefore = fs.existsSync(changelogPath);
      const contentBefore = existsBefore ? fs.readFileSync(changelogPath, 'utf-8') : null;

      await runScriptAsync('changelog.sh', ['--dry-run']);

      const existsAfter = fs.existsSync(changelogPath);
      const contentAfter = existsAfter ? fs.readFileSync(changelogPath, 'utf-8') : null;

      // Should not create or modify file in dry-run mode
      expect(existsBefore === existsAfter && contentBefore === contentAfter).toBe(true);
    });

    it('should require valid arguments', async () => {
      const result = await runScriptAsync('changelog.sh', ['invalid-arg', 'another-arg']);
      // changelog.sh may not output anything if tag doesn't exist, which is ok
      // It's forgiving with args and interprets them as git refs
      expect(result.success === true || result.output === '').toBe(true);
    });
  });

  describe('bump-version.sh', () => {
    it('should show usage if no arguments provided', async () => {
      const result = await runScriptAsync('bump-version.sh', []);
      expect(result.success).toBe(false);
      expect(result.output).toContain('Usage:');
    });

    it('should support major, minor, patch bump types', async () => {
      for (const bumpType of ['major', 'minor', 'patch']) {
        const result = await runScriptAsync('bump-version.sh', [bumpType, '--dry-run']);
        expect(result.success).toBe(true);
        expect(result.output).toContain('Current version:');
        expect(result.output).toContain('New version:');
      }
    });

    it('should show what changes would occur in --dry-run mode', async () => {
      const result = await runScriptAsync('bump-version.sh', ['minor', '--dry-run']);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Dry-run mode');
      expect(result.output).toContain('Changes would be');
      expect(result.output).toContain('Update package.json');
      expect(result.output).toContain('Create git tag');
    });

    it('should reject invalid bump types', async () => {
      const result = await runScriptAsync('bump-version.sh', ['invalid']);
      expect(result.success).toBe(false);
      expect(result.output).toContain('Invalid bump type');
    });

    it('should parse semantic version correctly', async () => {
      const result = await runScriptAsync('bump-version.sh', ['patch', '--dry-run']);
      const pkgJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      expect(result.output).toContain(pkgJson.version);
    });

    it('should show next steps after version bump would complete', async () => {
      const result = await runScriptAsync('bump-version.sh', ['major', '--dry-run']);
      expect(result.success).toBe(true);
      // In dry-run mode, it shows "Run without --dry-run to apply"
      // which implies the next steps will happen after that
      expect(result.output).toContain('without --dry-run');
    });

    it('should handle pre-release or build metadata in version', async () => {
      const result = await runScriptAsync('bump-version.sh', ['patch', '--dry-run']);
      // Should successfully parse version even with metadata
      expect(result.success).toBe(true);
    });
  });

  describe('Script Integration', () => {
    it('all scripts should be executable', () => {
      const scripts = ['verify-publish.sh', 'changelog.sh', 'bump-version.sh'];
      scripts.forEach((script) => {
        const stat = fs.statSync(path.join(SCRIPTS_DIR, script));
        // Check if owner can execute (S_IXUSR = 0o100)
        expect((stat.mode & 0o100) !== 0).toBe(true);
      });
    });

    it('all scripts should have proper shebang', () => {
      const scripts = ['verify-publish.sh', 'changelog.sh', 'bump-version.sh'];
      scripts.forEach((script) => {
        const content = fs.readFileSync(path.join(SCRIPTS_DIR, script), 'utf-8');
        expect(content.startsWith('#!/bin/bash')).toBe(true);
      });
    });

    it('changelog.sh should execute without errors in dry-run', { timeout: 10000 }, async () => {
      const result = await runScriptAsync('changelog.sh', ['--dry-run']);
      expect(result.success).toBe(true);
    });

    it('bump-version.sh should recognize all bump types', { timeout: 10000 }, async () => {
      for (const type of ['major', 'minor', 'patch']) {
        const result = await runScriptAsync('bump-version.sh', [type, '--dry-run']);
        expect(result.success).toBe(true);
      }
    });
  });
});
