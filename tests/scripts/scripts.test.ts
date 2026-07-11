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
    // stderr is folded into `output` so asserts can see stderr-only scripts
    // (e.g. the retired bump-version.sh stub prints its notice to >&2).
    child.stderr.on('data', (d: string) => { stdout += d; });
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

  describe('bump-version.sh (retired stub — 414-002 RC4B/REL-04)', () => {
    it('always fails with the retirement notice, regardless of arguments', async () => {
      for (const args of [[], ['patch', '--dry-run'], ['major'], ['invalid']] as string[][]) {
        const result = await runScriptAsync('bump-version.sh', args);
        expect(result.success).toBe(false);
        expect(result.output).toContain('retired');
        expect(result.output).toContain('release-prepare.mjs');
      }
    });

    it('never mutates package.json (stub exits before any write)', async () => {
      const before = fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8');
      await runScriptAsync('bump-version.sh', ['patch']);
      const after = fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8');
      expect(after).toBe(before);
    });
  });

  describe('Script Integration', () => {
    it('all scripts should be executable', () => {
      const scripts = ['verify-publish.sh', 'bump-version.sh'];
      scripts.forEach((script) => {
        const stat = fs.statSync(path.join(SCRIPTS_DIR, script));
        // Check if owner can execute (S_IXUSR = 0o100)
        expect((stat.mode & 0o100) !== 0).toBe(true);
      });
    });

    it('all scripts should have proper shebang', () => {
      const scripts = ['verify-publish.sh', 'bump-version.sh'];
      scripts.forEach((script) => {
        const content = fs.readFileSync(path.join(SCRIPTS_DIR, script), 'utf-8');
        expect(content.startsWith('#!/bin/bash')).toBe(true);
      });
    });

    it('bump-version.sh stays a failing stub for every historical bump type', { timeout: 10000 }, async () => {
      for (const type of ['major', 'minor', 'patch']) {
        const result = await runScriptAsync('bump-version.sh', [type, '--dry-run']);
        expect(result.success).toBe(false);
        expect(result.output).toContain('release-prepare.mjs');
      }
    });
  });
});
